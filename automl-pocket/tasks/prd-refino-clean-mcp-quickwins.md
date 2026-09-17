# PRD: Refino — Limpeza de Dados Confiável, MCP estilo Zapier e Quick Wins

## Introdução

Três frentes de refinamento após o teste da rodada de Deployments:

1. **Modal "Limpar dataset"**: o cabeçalho (título + descrição), o rodapé (Pré-visualizar/Aplicar) e o botão X rolam junto com a lista de operações — devem ficar fixos, com scroll apenas na lista. Auditoria confirmou: o único `overflow-y-auto` está no `DialogContent` inteiro (`clean-dataset-dialog.tsx:161`), o `DialogHeader` não tem `sticky`, e há bug de layout no footer (`-mx-4 -mb-4` da base do `DialogFooter` não é neutralizado com `p-0`, deixando o rodapé 32px mais largo que o modal).
2. **Operações de limpeza**: auditoria de `apps/worker/jobs/transform.py` encontrou operações no-op e bugs reais (detalhados abaixo). A atualização da grade em si funciona — `datasets.sample`, `dataset_columns` e contagens são regravados pelo worker (`dataset_transform.py:143-202`) e o Prepare faz polling — mas operações que não alteram nada ainda criam versão e mostram "Limpeza de dados aplicada.", passando a impressão de que nada foi aplicado (porque de fato nada foi).
3. **MCP**: redesenhar a tela de configuração no estilo da página "New MCP server" do Zapier (referência visual anexada à conversa de 2026-08-21): explicador em 3 passos, "Escolha seu agente de IA" com busca e cards por cliente, e instruções de conexão específicas por cliente escolhido.

Além disso, este PRD consolida **25 quick wins** mapeados por auditoria do app (agrupados em 4 stories temáticas).

### Bugs confirmados nas operações de limpeza (`apps/worker/jobs/transform.py`)

- **B1** `transform.py:257-267`: o fatiamento de colunas (`df = df[[c.name for c in columns]]`) roda mesmo sem nenhuma operação de remoção marcada, e `df[info.name]` lança `KeyError` genérico se `dataset_columns` estiver dessincronizado do parquet.
- **B2** `transform.py:150-163`: "Remover colunas numéricas/de data majoritariamente ilegíveis" usa exatamente o mesmo teste de "majoritariamente vazias" (`null_fraction >= 0.99` filtrado por tipo) — nunca detecta ilegibilidade de fato, porque valores ilegíveis são convertidos em nulos no `dataset:parse` sem registro da contagem.
- **B3** `transform.py:221-226`: em "Marcar outliers", linhas com valor nulo recebem `"não"` (afirmação falsa) em vez de nulo.
- **B4** `transform.py:217-220`: limpezas repetidas acumulam colunas `x_outlier`, `x_outlier_2`, `x_outlier_2_2`… (sufixo concatenado, não incrementado).
- **B5** `transform.py:257-276`: `_flag_outliers` roda depois da remoção de constantes — coluna de flag 100% "não" nunca é removida mesmo com a operação marcada.
- **B6** `transform.py:116-124`: "Padronizar datas" é no-op silencioso para colunas já tipadas `date` tz-naive (o caso comum) — ainda assim cria versão, chip e toast de sucesso.
- **B7** `clean-preview.ts:111-115`: o preview lista toda coluna `date` como "a padronizar" (mente no caso B6) e não prevê a remoção em cascata de coluna text→date com ≥99% de nulos (`transform.py:126-135` + `156-161`).
- **B8** `transform.py:269-274`: o agrupamento top-32 e o summary são calculados antes da remoção de linhas por nulos — números reportados podem não bater com o dataset final.
- **B9** `transform.py:199`: `_remove_unexpected_nulls` devolve fatia sem `.copy()` — frágil frente a mudanças do pandas.
- **B10** `dataset_transform.py:81-95` + `prepare/page.tsx:43-63`: erro esperado de limpeza (ex.: "removeria todas as colunas") grava `datasets.status='error'`, que o Prepare trata como fatal — a tela inteira vira "Não foi possível processar o dataset", sem caminho de volta. E o polling do Prepare (`prepare-view.tsx:337-341`) não tem timeout: worker parado = botões travados para sempre.
- **B11** `dataset_transform.py:141`: parquet novo é escrito antes da transação — falha posterior deixa arquivo órfão sem cleanup.

## Objetivos

- Modal de limpeza com header e footer fixos e scroll apenas no conteúdo.
- Toda operação de limpeza marcada produz efeito real e verificável — ou comunica claramente que não havia o que fazer.
- Falha de limpeza nunca derruba a tela do Prepare nem trava a UI.
- Configuração do MCP tão guiada quanto a do Zapier: escolher o cliente e receber instruções prontas.
- Eliminar 25 atritos pequenos e visíveis do produto (idioma, títulos, placeholders, afordâncias).

## User Stories

> Numeração continua a partir de US-047 do `prd.json` atual (`ralph/deployments`).

### US-048: Modal Limpar dataset com header e footer fixos
**Description:** Como usuária, quero que título e botões do modal de limpeza fiquem sempre visíveis enquanto rolo a lista de operações.

**Acceptance Criteria:**
- [ ] `DialogContent` do `clean-dataset-dialog.tsx` passa a `overflow-hidden` + layout flex/grid; o scroll fica em um container interno (`min-h-0 overflow-y-auto`) envolvendo apenas a lista de operações + bloco "Impacto estimado"
- [ ] `DialogHeader` (título + descrição) e `DialogFooter` (Pré-visualizar/Aplicar) permanecem visíveis em qualquer posição de scroll, com o modal a 85vh e o preview aberto
- [ ] Bug das margens negativas do footer corrigido (neutralizar `-mx-4 -mb-4` herdados de `dialog.tsx:110` quando o content usa `p-0`): rodapé alinhado à largura do modal, sem overflow horizontal
- [ ] Botão X permanece fixo no canto do header (não sai de vista ao rolar) e não sobrepõe o texto
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-049: Operações de limpeza com efeito real (worker)
**Description:** Como usuária, quero que cada operação de limpeza marcada faça exatamente o que descreve.

**Acceptance Criteria:**
- [ ] B1: fatiamento/remoção de colunas só roda se alguma operação `remove_*` estiver marcada; coluna de `dataset_columns` ausente no parquet gera `TransformError` com mensagem em português (não `KeyError` genérico)
- [ ] B2: `dataset:parse` passa a gravar em `dataset_columns.stats` a contagem `invalidCount` (valores não vazios que falharam a conversão de tipo); as operações "ilegíveis" usam `(invalidCount + vazios) / total >= 0.99` — distintas de "vazias" (`vazios / total >= 0.99`); teste cobre coluna com 99% de valores ilegíveis não vazios sendo removida por "ilegível" e não por "vazia"
- [ ] B3: nulos na coluna original resultam em nulo na coluna `_outlier` (nunca "não")
- [ ] B4: reaplicar "Marcar outliers" substitui a coluna `_outlier` existente em vez de criar `_outlier_2` (idempotente); teste roda `apply_clean` duas vezes e confere `column_count` estável
- [ ] B5: remoção de colunas constantes considera também as colunas `_outlier` recém-criadas (segunda passada ou reordenação)
- [ ] B8: agrupamento top-32 e summary calculados após a remoção de linhas; números do summary batem com o dataset final
- [ ] B9: `.copy()` explícito na fatia de `_remove_unexpected_nulls`
- [ ] Novos testes cobrem todas as correções acima + os casos hoje ausentes (limpeza repetida, ilegível vs vazia combinadas, outliers com nulos)
- [ ] Typecheck passes
- [ ] Tests pass

### US-050: Transformação sem mudanças, falhas recuperáveis e preview honesto
**Description:** Como usuária, quero saber quando a limpeza não teve o que fazer, e nunca perder a tela do Prepare por causa de uma falha.

**Acceptance Criteria:**
- [ ] B6: se a transformação não altera nada (DataFrame idêntico), o job NÃO cria versão nem novo parquet e sinaliza "sem mudanças"; a UI mostra toast informativo "Nenhuma alteração foi necessária — seus dados já estavam limpos." (sem chip novo)
- [ ] B10a: erro esperado de limpeza (`TransformError`) NÃO grava `datasets.status='error'`: o status volta a `ready` e a mensagem vai para nova coluna `datasets.last_transform_error` (migration); o Prepare mostra a mensagem em banner/toast dismissível com a grade intacta, e o campo é limpo na próxima transformação
- [ ] B10b: polling do Prepare tem timeout (~2 min sem mudança de status): para de rolar, destrava a UI e mostra erro em português com "Tentar novamente"
- [ ] B11: falha após escrever o parquet novo remove o arquivo órfão (cleanup no except)
- [ ] B7: preview só lista como "a padronizar" colunas de data que serão de fato alteradas (text→date parseável ou date tz-aware) e passa a prever a remoção em cascata de coluna text→date majoritariamente nula; nota no preview quando a operação não terá efeito
- [ ] Detecção de conclusão no Prepare trata o caso "job terminou sem criar versão" (status `ready` + mesma versão ⇒ toast informativo, não sucesso)
- [ ] Typecheck passes
- [ ] Tests pass
- [ ] Verify in browser using dev-browser skill

### US-051: MCP — configuração guiada estilo Zapier
**Description:** Como usuária, quero escolher meu agente de IA e receber instruções de conexão prontas, como na página "New MCP server" do Zapier.

**Acceptance Criteria:**
- [ ] Tela do MCP reformulada: cabeçalho "Servidor MCP" com subtítulo explicativo + faixa de 3 passos ("1. Publique o servidor", "2. Conecte seu agente de IA", "3. Peça uma predição") no estilo da referência do Zapier
- [ ] Seção "Escolha seu agente de IA": campo de busca + grid de cards com ícone e nome — no mínimo: Claude, Claude Code, ChatGPT, Cursor, VS Code, Gemini CLI e "Outro (genérico)"
- [ ] Selecionar um card mostra instruções específicas daquele cliente com blocos copiáveis usando a URL real e a chave do deployment: Claude (adicionar conector remoto), Claude Code (`claude mcp add --transport http signalos <url> --header "Authorization: Bearer <chave>"`), Cursor/VS Code (JSON do `mcp.json`/settings), ChatGPT (conector), Genérico (URL + header)
- [ ] Mecânica existente preservada: seleção de campos, Publicar/Despublicar/Regenerar chave, endpoint `/api/mcp` e tool `predict` inalterados
- [ ] Estado "Não publicado": os cards aparecem desabilitados com aviso para publicar primeiro (fluxo: publicar → escolher agente → copiar instruções)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-052: Quick wins — identidade, títulos e limpeza de código
**Description:** Como usuária, quero que o produto se apresente como SignalOS em todas as abas e sem restos de scaffold.

> **Já feitos — não refazer**: favicon e ícones (`icon.png`/`apple-icon.png`), logo nova (`signalos-icon.png` com "Signal**OS**" em gradiente), template de título no root layout (`%s | SignalOS`), remoção dos SVGs padrão, títulos das páginas `(app)` sem o sufixo "— AutoML", e o ícone do sidebar recolhido (agora usa `<Logo iconOnly />` linkado, com `title`). Restam os itens abaixo.

**Acceptance Criteria:**
- [ ] `prepare`, `predict`, `reports` e `deploy` exportam `metadata.title` próprios ("Preparar dados", "Prever", "Relatório", "Publicar")
- [ ] `/app/[slug]` usa `generateMetadata` com o título/descrição configurados do Web App; login/signup ganham títulos "Entrar"/"Criar conta" via layout
- [ ] Contadores "(N)" com hierarquia tipográfica: no título "Projetos (1)" e nas abas "Desenvolvimento (1)"/"Arquivados (0)" da tela de projetos, o número entre parênteses usa fonte menor e cor secundária (`text-muted-foreground`), consistente nos três lugares
- [ ] Revisão tipográfica do card de projeto: nome com `truncate` + `title`, linha de metadados (badge "Modelo treinado", "Ver relatório", "Editado há X") alinhada e com espaçamento consistente, sem quebra desalinhada como no estado atual
- [ ] Removidos: `deploy/endpoint-stub.tsx` (órfão, zero imports) e o `console.log` do link de reset de senha em `auth.ts:48-49` (guardar por `NODE_ENV !== "production"`)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-053: Quick wins — idioma e formatação pt-BR
**Description:** Como aluna, quero toda a interface em português consistente e números no formato brasileiro.

**Acceptance Criteria:**
- [ ] Abas do projeto traduzidas em `(project)/projects/[projectId]/layout.tsx:32-68`: Preparar / Explorar / Prever / Publicar / Relatórios (hrefs mantidos); menções cruzadas ajustadas (`training-progress.tsx:222`, botões das telas de deploy)
- [ ] Cabeçalhos da tabela "Detalhes de Performance" traduzidos (`classification-report.tsx:166-194`, `479-482`): Acurácia / Precisão / Cobertura (Recall) / F1 / Linhas — tooltips mantidos
- [ ] Tipo de coluna "Datetime" padronizado como "Data" em `prepare-view.tsx:112`, `version-chips.tsx:37` (igual a `predict-view.tsx:36`)
- [ ] Contagens dos relatórios com separador de milhar pt-BR: helper `numberPtBr` promovido para `src/lib/format.ts` e aplicado em `classification-report.tsx:265-266, 296, 317, 466-469` e `regression-report.tsx:406-409`
- [ ] `suppressHydrationWarning` no span de data relativa de `dataset-picker.tsx:405-406` (igual às outras telas)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-054: Quick wins — placeholders e telas mortas
**Description:** Como usuária, não quero encontrar telas vazias nem controles que não fazem nada.

**Acceptance Criteria:**
- [ ] `/settings` deixa de ser stub: cards read-only com nome, email e organização da sessão + botão "Sair" (sem edição nesta versão)
- [ ] Botão "Combinar" removido da toolbar do Prepare (`prepare-view.tsx:476-480`, + import `Merge`)
- [ ] Barra de chat desabilitada do Prepare (`prepare-view.tsx:612-637`) removida (recupera ~60px de grade)
- [ ] Links "Termos de Uso"/"Privacidade" do rodapé de auth (`auth-shell.tsx:64-71`) deixam de apontar para `#`: viram texto simples sem link (TODO removido)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-055: Quick wins — afordâncias e microcomportamentos
**Description:** Como usuária, quero pequenas conveniências que tornam o uso mais fluido e seguro.

**Acceptance Criteria:**
- [ ] Botão "Abrir" (nova aba, `target="_blank" rel="noopener noreferrer"`, ícone ExternalLink) ao lado de "Copiar link" na config do Web App (`web-app-config.tsx:258-278`)
- [ ] Busca por nome na tela `/datasets` (mesmo padrão de `projects-view.tsx:108-121`) e ordenação clicável nas colunas "Nome" e "Atualizado" (`datasets-view.tsx`)
- [ ] `title={...}` nativo em todos os nomes truncados (datasets-view, dataset-picker, projects-view, telas de deploy) — padrão já usado em `prepare-view.tsx:533`
- [ ] "Regenerar chave" (API e MCP) pede confirmação via `AlertDialog` com aviso "A chave atual deixará de funcionar imediatamente" (`api-config.tsx:176-184`)
- [ ] Item ativo do sidebar usa comparação exata de rota (`app-sidebar.tsx:98`) — "Datasets"/"Projetos" não acendem indevidamente
- [ ] `bg-white` hardcoded substituído por `bg-card` nos componentes do app (~30 ocorrências; sem mudança visual no tema claro, viabiliza dark mode futuro)
- [ ] Erro de login diferencia falha de conexão (5xx/sem status → "Não foi possível conectar ao servidor. Tente novamente.") de credenciais inválidas (`login/page.tsx:29-32`)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-056: Prepare — tipografia e gráficos do cabeçalho da grade
**Description:** Como aluna, quero ler o cabeçalho da grade com conforto: nome da coluna, tipo e distribuição legíveis à distância (referência visual anexada à conversa de 2026-08-21).

**Acceptance Criteria:**
- [ ] Nome da coluna maior e mais presente: de `text-xs` para `text-sm font-semibold` (`prepare-view.tsx:531`), mantendo `truncate` + `title`
- [ ] Distribuição de categorias em duas linhas por item, como na referência: linha 1 com rótulo à esquerda e percentual à direita (`tabular-nums`, alinhado); linha 2 com barra de progresso em **largura total** (`h-2 rounded-full`), substituindo o layout atual de barra espremida ao lado do rótulo (`prepare-view.tsx:216-232`, hoje `text-[10px]` + `h-1.5 flex-1` inline)
- [ ] Rótulos e percentuais da distribuição sobem de `text-[10px]` para `text-xs`; cor do rótulo `text-muted-foreground`, percentual `text-foreground`
- [ ] Histograma com barras mais altas e legíveis, com valores mínimo/máximo nas extremidades da base (como na referência de colunas numéricas)
- [ ] Altura do cabeçalho da grade ajustada para acomodar o novo layout (hoje `h-[92px]`, `prepare-view.tsx:499`) sem cortar a terceira categoria
- [ ] Badge de tipo mantém o tamanho atual (é secundário), mas alinhado ao novo espaçamento; setas de ordenação visíveis no topo junto ao nome
- [ ] Tooltip nativo (`title`) nos rótulos de categoria truncados
- [ ] Sem regressão de performance perceptível na grade virtualizada com 50+ colunas
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: O modal de limpeza deve manter header e footer fixos com scroll interno apenas no corpo.
- FR-2: Cada operação de limpeza deve ter efeito próprio verificável; operações redundantes ou no-op são corrigidas na origem (worker) e comunicadas com honestidade no preview.
- FR-3: Transformação sem mudanças não cria versão e informa a usuária.
- FR-4: Falhas de limpeza são recuperáveis: status volta a `ready`, mensagem em `datasets.last_transform_error`, grade intacta, polling com timeout.
- FR-5: A tela do MCP deve guiar a conexão por cliente de IA (cards + instruções específicas copiáveis), preservando endpoint e chave existentes.
- FR-6: Todos os 25 quick wins listados nas US-052 a US-055 são endereçados conforme especificado.
- FR-7: O cabeçalho da grade do Prepare segue a hierarquia visual da referência: nome em destaque, distribuição com rótulo/percentual em linha própria e barra em largura total.

## Non-Goals (Out of Scope)

- Mudar a semântica visível das 8 operações do modal (os textos só mudam se a US-049 exigir precisão, ex.: hint de "ilegíveis").
- Regra de outliers continua a anunciada (3σ OU fora de P1–P99, fiel à referência) — corrigem-se apenas nulos, acúmulo e interação com constantes; não se torna configurável.
- Chat/copiloto no Prepare, merge de datasets, edição de perfil em /settings.
- Dark mode completo (apenas o groundwork `bg-card` da US-055).
- Novos clientes MCP além dos listados; validação automática da conexão do cliente.

## Design Considerations

- Modal: manter o visual atual; a mudança é estrutural (sticky/scroll), referência do estado desejado no screenshot da conversa de 2026-08-21.
- MCP estilo Zapier: faixa cinza com os 3 passos (ícone + título + subtítulo), busca com ícone, grid de cards ~5 por linha com borda e hover, lista compacta expandida — adaptado aos tokens SignalOS (primário #3B5EEB, Inter).
- Ícones dos agentes: usar iniciais/ícones genéricos (lucide) — não usar logomarcas de terceiros embutidas.

## Technical Considerations

- US-049 muda o `dataset:parse` (gravar `invalidCount` em stats) — datasets antigos sem o campo devem ser tratados como `invalidCount: 0` (sem backfill).
- `datasets.last_transform_error` (US-050) requer migration; limpar o campo ao enfileirar nova transformação.
- A detecção de conclusão do Prepare hoje espera mudança de `current_version_id` (`prepare-view.tsx:346-366`) — o caso "sem mudanças" precisa de outro sinal (ex.: comparar `updated_at` do dataset ou campo de resultado da última transformação).
- Paridade preview↔worker (B7): considerar teste no web comparando `clean-preview.ts` com fixtures dos mesmos casos dos testes Python.
- Os quick wins citam arquivo:linha do estado atual (branch `main`) — validar as âncoras antes de editar, o código pode ter drift.

## Success Metrics

- Aplicar limpeza num dataset sujo altera a grade visivelmente; aplicar num dataset limpo informa "nenhuma alteração necessária" sem criar versão.
- Zero cenários em que a tela do Prepare fica inutilizável após uma limpeza que falhou.
- Conectar o MCP ao Claude Code seguindo apenas as instruções da tela funciona de primeira.
- Nenhum texto em inglês na navegação e nos relatórios; título correto em todas as abas do navegador.

## Open Questions

- Os hints das operações "ilegíveis" no modal devem ser reescritos para refletir a nova semântica (`invalidCount`)?
- Na tela `/settings`, vale incluir a lista de membros da organização (read-only) já nesta versão?
- O card "Outro (genérico)" do MCP deve incluir um botão "Testar conexão" (chamada de handshake) em versão futura?
