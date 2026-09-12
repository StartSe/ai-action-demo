# PRD: Suíte IA para Executivos, versão profissional

Data: 12/09/2026. Escopo: os 10 apps de `ai-action-demo/`, a tela `/setup` compartilhada e a página do catálogo público (`site/index.html`). Cobre as fases 1 a 3 (acabamento, capacidades operacionais básicas e capacidades avançadas). Versão navegável: https://claude.ai/code/artifact/007a6cf9-a6f0-4dc3-b4a8-12c4cb556978

## Introduction

A suíte cumpre a promessa de "abrir, testar em dois minutos e publicar com um clique". A base visual é limpa e consistente (mesmo `ui.tsx`, mesmo `globals.css`, um acento por app). Avaliada com o olhar de quem vai colocá-la diante de um C-level, porém, ela ainda parece um conjunto de demos: o resultado da IA evapora ao fechar a aba, não há sinal de origem nem de confiança, o acabamento é genérico (favicon padrão nos 10, chips com valor bruto do banco, glifo-letra no estado vazio) e nenhum app opera sem alguém na frente da tela.

Esta PRD define duas frentes que caminham juntas:

1. **Acabamento executivo**: um padrão visual e de linguagem profissional, aplicado uma vez em `ui.tsx` e `globals.css` e herdado pelos 10 apps, mais correções específicas por app.
2. **Capacidades operacionais**: quatro mecanismos padronizados (Artefato, MCP, Formulário, Rotina) que transformam cada app de gerador de resposta em ferramenta que trabalha sozinha, sem inflar a complexidade da tela.

### Premissas

- P1. O público é executivo sem perfil técnico. Tudo o que é técnico fica em `/setup`, dentro de "Opções avançadas", ou em "Para a equipe técnica".
- P2. A stack não muda: Next.js 16, Tailwind 4, sem biblioteca de UI, SQLite via `node:sqlite`. Dependência nova só quando indispensável e pequena.
- P3. O padrão continua sendo "copiar `ui.tsx`, `globals.css`, `setup.tsx` e os `lib/*` compartilhados sem alterar". Toda melhoria transversal nasce no `pdi-time`, é verificada, e uma história de replicação copia para os outros 9.
- P4. Cada app mantém uma única promessa e uma única tela principal. Capacidades novas aparecem como um bloco no resultado ou um cartão no `/setup`, nunca como menu, abas de navegação ou login.
- P5. Persistência passa a existir, opcional e mínima, no mesmo SQLite do setup. No plano gratuito da hospedagem o disco é efêmero e o app hiberna; o produto avisa isso e não depende disso para o caminho básico.
- P6. Textos públicos não citam o provedor de hospedagem.
- P7. Verificação visual segue o `PADRAO.md`: capturas com Chrome headless em desktop 1400x900 (vazio), desktop 1400x1800 (`?exemplo=1&captura=1`) e celular 390 px, abertas com a ferramenta Read e corrigidas até ficarem limpas. Nas histórias abaixo, "verificar no navegador" significa exatamente isso.

### Diagnóstico (auditoria de 12/09/2026)

Transversal, nos 10 apps:

| # | Achado | Severidade |
|---|---|---|
| D1 | Resultado sem sinal de origem (modelo, data, insumo). Só o sufixo "(exemplo em modo demonstração)" em cinza | Alta |
| D2 | Acionabilidade limitada a "Copiar texto". PDF só em PDI e Contratos, CSV só em Prospecção e Voz do Cliente. Sem e-mail, link, exportar para planilha, calendário ou tarefas | Alta |
| D3 | Resumo executivo (`.summary`) em 22 px com 5 a 8 linhas empurra o dado decisivo (nota de risco, KPI, NPS) para baixo da dobra | Alta |
| D4 | Botão principal abaixo da dobra em 1400x900 em 6 dos 10 apps | Média |
| D5 | Favicon padrão do Next nos 10 apps (mesmo MD5) | Média |
| D6 | Chips exibem o valor bruto do enum em minúsculas ("alta", "negativo", "simulador", "transferir p/ humano") | Média |
| D7 | Aviso de demonstração triplicado (chip, faixa de largura total, sufixo no resultado); a faixa consome 50 a 60 px acima da dobra | Média |
| D8 | Salto de layout: a `DemoNotice` só entra depois de `/api/status` | Média |
| D9 | `DataTable` no celular vira 4 a 5 rótulos por linha (1.800 px de rolagem em Voz do Cliente) | Média |
| D10 | `ErrorBox` sem "Tentar de novo" | Média |
| D11 | Estado vazio com glifo-letra repetindo a marca do topo | Baixa |
| D12 | Jargão na tela: "/setup", nome do modelo, "OpenRouter", "Phone number ID", "Verify token", "Variáveis de ambiente têm prioridade" | Baixa a Alta (WhatsApp) |
| D13 | Formatos pt-BR inconsistentes ("7.4/10", selects em minúsculo, prazos sem ano) | Baixa |
| D14 | Carregamento genérico (mesmo skeleton e frase fixa; só Ata mostra etapas) | Baixa |
| D15 | Botões secundários com o mesmo peso para ações de importância diferente | Baixa |
| D16 | Rodapé de privacidade repetido com texto diferente em cada app | Baixa |
| D17 | `?exemplo=1` não dispara em `next dev` (Strict Mode executa o efeito duas vezes; o cleanup cancela o timer e o ref já está marcado) | Média |

Por app:

| App | Achados principais | Severidade |
|---|---|---|
| PDI do Time | Melhor resultado da suíte. "Indicador" muda de posição entre cartões; plano sem datas reais nem nome do gestor | Baixa a Média |
| Agente de Kanban | Quadro demo compartilhado entre visitantes acumula cartões duplicados, sem "Reiniciar"; sem "Desfazer" nem confirmação antes de agir no Trello real; setup do Trello com ordem invertida; sugestões parecem mensagens | Alta |
| Entrevistadora IA | Scorecard sem a transcrição; roteiro demo com perguntas tortas ("usou 2 anos de experiência em atendimento b2b") e evidência repetida 4 vezes; sem cancelar entrevista; "7.4/10" | Alta |
| Posts em Minutos | Cartaz local é gradiente com texto truncado sem rótulo de provisório; grade deixa o X sozinho; "Patrocinado" na prévia; "melhor horário" não acionável; rolo longo no celular | Média |
| Prospecção com IA | Gancho idêntico em 4 lugares; proposta colada sem pontuação; placeholders "[seu nome]"; coluna "Sinal" espremida; LinkedIn e site do lead só no CSV | Média |
| Atendente no WhatsApp | Webhook, verify token e URL local na tela principal; "Salvar configuração" e simulador sem relação explícita; demo é busca literal na base; celular vazio sem bolha; hora das bolhas é a hora atual | Alta |
| Leitura de Contratos | Nota 7/10 vem depois de 8 linhas de resumo; tabela de 4 colunas de prosa com a coluna de valor por último; cards sem destacar números; Q&A no fim de 4.000 px; sem "Copiar" | Alta |
| Ata Executiva | Checkboxes "Concluída" não fazem nada; decisões, riscos e pendências com o mesmo peso; prazos sem ano; e-mail sem `mailto:`; gravação sem transcrição configurada devolve exemplo sem avisar | Média |
| Analista Financeiro | Rótulos de gráfico com 24 px no desktop e 6 px no celular; barras quase iguais sem eixo; cor única; único app sem PDF; KPI "Maior categoria: Folha" trivial | Alta |
| Voz do Cliente | Exemplo não traz notas e o app diz que não há NPS; barra de sentimento depende de cor; "Comece por aqui" na cor do chip negativo; upload diferente dos outros; tema não clicável | Alta |

Catálogo público: limpo, mas sem prévia visual, sem "Ver demonstração" (`demo` vazio nos 10) e sem sinal do que o app faz sozinho.

### Princípios de design (entram no `PADRAO.md`)

1. O número primeiro, a prosa depois. O primeiro elemento do resultado é o dado que decide; o resumo vem depois, em até três linhas e em tamanho de corpo.
2. Uma frase de origem em todo resultado, sempre no mesmo componente.
3. Um bloco "Entregar" igual em todos: PDF, copiar, e-mail, link e "Enviar para...".
4. Rótulos humanos, nunca valores de banco. Sentence case em chips e selects.
5. Botão principal acima da dobra em 1400x900. Campos não essenciais em "Mais detalhes".
6. Um único aviso de demonstração, na barra superior.
7. Técnico só em "Opções avançadas".
8. Identidade por app (favicon, ilustração do vazio, prévia) dentro de uma família (tipografia, espaçamento, componentes, tom).
9. Cada capacidade nova é um botão, não um menu.
10. Demonstração sem vergonha: o exemplo é o melhor caso do app, em português correto e completo.

## Goals

- G1. Um executivo abre qualquer app e, em até 10 segundos e sem rolar, entende o que ele faz, vê o botão principal e sabe que pode testar com um exemplo.
- G2. Todo resultado responde "de onde veio isso" e "o que faço com isso" no mesmo lugar em todos os apps.
- G3. Zero jargão técnico na tela principal dos 10 apps, verificado por script.
- G4. Setup em um clique quando existe autorização por aplicação; chave manual recolhida em "Opções avançadas".
- G5. Todos os apps expõem MCP no mesmo padrão e cada app ganha pelo menos uma capacidade de fase 2 (Formulário ou Rotina).
- G6. Identidade própria por app (favicon, ilustração, prévia no catálogo) mantendo a família visual.
- G7. Layout estável (sem salto ao carregar) e legível no celular (tabelas compactas, gráficos com rótulos proporcionais).

## User Stories

Ordem de implementação. Histórias US-001 a US-014 são feitas só no `pdi-time`; US-015 replica nos outros 9. O mesmo vale para o setup (US-016 a US-018, replicação em US-019) e para as bibliotecas de capacidades (US-030 a US-033, replicação dentro de cada história).

### Fase 1, fundação visual (no `pdi-time`)

### US-001: Corrigir o atalho `?exemplo=1` em modo dev
**Description:** As a pessoa que demonstra o app localmente, I want que `?exemplo=1` funcione em `next dev` so that a demonstração não dependa de build de produção.

**Acceptance Criteria:**
- [ ] O `useEffect` do atalho não marca `autoEnviado.current` antes de o timer disparar, ou não registra cleanup que cancele o timer no Strict Mode
- [ ] `http://localhost:3001/?exemplo=1` preenche e envia o exemplo em `next dev` e em produção (build standalone)
- [ ] Lint e build passam

### US-002: Ícone próprio por app gerado a partir do catálogo
**Description:** As a executivo com várias abas abertas, I want distinguir cada app pelo ícone so that eu encontre a aba certa sem ler o título.

**Acceptance Criteria:**
- [ ] Novo script `scripts/gerar-icones.mjs` lê `catalogo.json` e escreve `<app>/app/icon.svg` com a inicial do app em branco sobre a cor de acento, cantos arredondados, mesmo desenho para os 10
- [ ] O `favicon.ico` padrão do Next é removido dos 10 apps
- [ ] `metadata.title` de cada `layout.tsx` segue "Nome do app · IA para Executivos"
- [ ] O script é citado no `PADRAO.md` na seção "Novo app na suíte"
- [ ] Lint e build passam; verificar no navegador (ícone na aba)

### US-003: Componente `Origem` e `meta` nas rotas de IA
**Description:** As a executivo, I want saber de onde veio o resultado so that eu decida quanto confiar nele.

**Acceptance Criteria:**
- [ ] `lib/ai.ts` exporta `meta({ demo, insumo }): { demo, model, geradoEm, insumo }` e toda rota que devolve resultado de IA inclui `meta` na resposta
- [ ] Novo componente `Origem` em `ui.tsx` recebe `meta` e renderiza uma linha em 13 px: "Gerado com IA a partir de {insumo}, em {dd/mm/aaaa às hh:mm}" ou "Exemplo ilustrativo a partir de {insumo}. Conecte a IA para analisar seus dados"
- [ ] O nome do modelo aparece só no atributo `title` da linha, nunca em texto visível
- [ ] `Resultado` do `pdi-time` renderiza `Origem` logo abaixo de `ResultHead` e o sufixo "(exemplo em modo demonstração)" sai do subtítulo
- [ ] Lint e build passam; verificar no navegador

### US-004: Aviso de demonstração único e barra sem salto de layout
**Description:** As a executivo, I want saber que estou no modo demonstração sem perder 60 px de tela so that o conteúdo apareça no lugar desde o primeiro render.

**Acceptance Criteria:**
- [ ] `DemoNotice` deixa de renderizar faixa de largura total; o chip "Modo demonstração" da `Topbar` vira botão que abre um popover com a frase do app (`resumo`) e o link "Conectar a IA em 1 minuto"
- [ ] `Topbar` renderiza o chip com largura fixa mínima desde o estado "Verificando", de modo que a altura da barra e a posição do conteúdo não mudam quando `/api/status` responde
- [ ] Nenhum outro aviso de demonstração aparece na tela além do chip e da linha `Origem`
- [ ] Popover fecha com Esc e clique fora; acessível por teclado
- [ ] Lint e build passam; verificar no navegador (recarregar e confirmar que nada salta)

### US-005: Componente `Destaque` e resumo em tamanho de corpo
**Description:** As a executivo, I want ver o dado que decide antes de qualquer parágrafo so that eu leia o resultado na ordem certa.

**Acceptance Criteria:**
- [ ] Novo componente `Destaque` em `ui.tsx`: `{ valor: string; rotulo: string; interpretacao?: string; tom?: "ok" | "warn" | "danger" | "neutro" }`, número em 40 px, rótulo em 13 px, interpretação em uma linha
- [ ] `.summary` em `globals.css` passa para 17 px (16 px no celular), peso 500, sem borda lateral de acento
- [ ] Prompts do `pdi-time` (`lib/prompts` ou equivalente) instruem "resumo em no máximo 45 palavras"; `lib/demo.ts` respeita o limite
- [ ] Ordem no `Resultado`: `ResultHead` → `Origem` → `Destaque` (quando houver) → `.summary` → seções
- [ ] Lint e build passam; verificar no navegador

### US-006: Chips com rótulo humano e formatos pt-BR
**Description:** As a executivo, I want ler "Alta" e "7,4" em vez de "alta" e "7.4" so that a tela pareça escrita por gente.

**Acceptance Criteria:**
- [ ] `Chip` passa a receber `nivel` (para a classe) e `children` opcional; sem `children`, exibe o rótulo do mapa padrão em `ui.tsx` (alta → "Alta", media → "Média", baixa → "Baixa", positivo → "Positivo", neutro → "Neutro", negativo → "Negativo", neutral → sentence case do texto)
- [ ] Helpers `numero(n, casas)` e `data(d, { comHora })` em `ui.tsx` usando `Intl` pt-BR; datas incluem o ano quando fora do ano corrente
- [ ] Opções de `select` do `pdi-time` começam com maiúscula
- [ ] Lint e build passam; verificar no navegador

### US-007: Painel compacto com botão principal acima da dobra
**Description:** As a executivo, I want ver o que fazer sem rolar o painel so that eu comece em segundos.

**Acceptance Criteria:**
- [ ] `Panel` renderiza o título em 26 px (24 no celular) e aceita no máximo duas linhas em 1400 px de largura de tela; o lead tem uma frase
- [ ] Novo componente `MaisDetalhes` em `ui.tsx` (um `<details>` com summary "Mais detalhes" e o mesmo espaçamento dos `Field`)
- [ ] No `pdi-time`, o campo "Aspirações da pessoa" vai para `MaisDetalhes`
- [ ] Em 1400x900 no estado vazio, o botão "Gerar PDI" está visível sem rolagem
- [ ] Lint e build passam; verificar no navegador

### US-008: Estado vazio com ilustração, carregamento com etapas, erro com saída
**Description:** As a executivo, I want que cada estado da tela diga o que está acontecendo e o que fazer so that eu nunca fique parado sem saber.

**Acceptance Criteria:**
- [ ] `Empty` aceita `ilustracao: ReactNode` (SVG inline de 64 px na cor de acento, traço 1,5 px) no lugar de `glifo`; o `pdi-time` entrega um desenho de três blocos "30 60 90"
- [ ] `Loading` aceita `etapas: string[]` e troca a frase a cada 1,2 s, parando na última; `texto` continua aceito para compatibilidade
- [ ] `ErrorBox` aceita `onTentarNovamente?: () => void` e renderiza o botão "Tentar de novo"; no celular, a página rola até o erro quando ele aparece
- [ ] `prefers-reduced-motion` desliga a troca animada de etapas
- [ ] Lint e build passam; verificar no navegador nos três estados

### US-009: `DataTable` compacta no celular e larguras no desktop
**Description:** As a executivo no celular, I want uma lista legível so that uma tabela de seis linhas não vire 1.800 px de rolagem.

**Acceptance Criteria:**
- [ ] `Coluna<T>` ganha `papel?: "titulo" | "resumo" | "chip" | "detalhe"` e `largura?: string`
- [ ] No celular, cada linha vira um cartão com a coluna `titulo` em negrito, a coluna `resumo` em uma linha, o `chip` à direita e as colunas `detalhe` dentro de "Ver mais"
- [ ] No desktop, `largura` aplica `width` na coluna; sem `largura`, o comportamento atual se mantém
- [ ] A tabela "Lacunas priorizadas" do `pdi-time` declara os papéis
- [ ] Lint e build passam; verificar no navegador

### US-010: `Dropzone` e `Privacidade` compartilhados
**Description:** As a pessoa que mantém a suíte, I want um só componente de upload e uma só frase de privacidade so that os apps não divirjam nesses detalhes.

**Acceptance Criteria:**
- [ ] Novo componente `Dropzone` em `ui.tsx` (área tracejada, ícone, "Arraste o arquivo aqui ou selecione", limite de tamanho, tipos aceitos, nome do arquivo escolhido), baseado no que Financeiro e Contratos já têm
- [ ] Novo componente `Privacidade` em `ui.tsx` com texto padrão "Seus dados ficam só neste app e você pode apagar quando quiser" e `detalhe?: string` exibido em `title`
- [ ] O `pdi-time` usa `Privacidade` no lugar do parágrafo atual
- [ ] Lint e build passam; verificar no navegador

### US-011: Histórico de resultados com link e folha de impressão
**Description:** As a executivo, I want reabrir um resultado amanhã e mandar o link para alguém so that o valor não evapore ao fechar a aba.

**Acceptance Criteria:**
- [ ] Novo `lib/historico.ts` (copiado sem alterar entre apps) usando `lib/store.ts`: tabela `resultados(id TEXT PK, tipo TEXT, entrada JSON, saida JSON, meta JSON, criadoEm TEXT, expiraEm TEXT NULL)`; funções `salvar`, `obter`, `listar(limite)`, `apagar`, `apagarTodos`, `limparExpirados()`
- [ ] `id` é token aleatório de 12 caracteres URL-safe
- [ ] Rota `app/r/[id]/page.tsx` renderiza o resultado em modo leitura (sem `Panel`, com `Topbar`, `Origem` e `Entregar`); 404 amigável quando não existe
- [ ] Rota `app/imprimir/[id]/page.tsx` renderiza só o resultado com a folha de impressão (`@media print` em `globals.css`: A4, margem 18 mm, cabeçalho com nome do app, título e data, rodapé com a linha `Origem`) e chama `window.print()` ao carregar
- [ ] A rota principal do `pdi-time` salva o resultado e devolve `id`; o cliente guarda `id` no estado
- [ ] `MaisDetalhes` do painel ganha a lista "Últimos resultados" (até 10, com título e data) e o botão "Apagar tudo"
- [ ] Apps marcados como sensíveis (Contratos, Financeiro) só salvam quando o usuário marca "Guardar este resultado por 30 dias"; o flag vive em `lib/historico.ts` como `SENSIVEL`
- [ ] `limparExpirados()` roda na inicialização do servidor
- [ ] Lint e build passam; testar via curl `GET /r/<id>` e `GET /r/inexistente`; verificar no navegador

### US-012: Bloco `Entregar` padrão
**Description:** As a executivo, I want levar o resultado para onde eu trabalho do mesmo jeito em todos os apps so that eu não precise aprender cada tela.

**Acceptance Criteria:**
- [ ] Novo componente `Entregar` em `ui.tsx`: `{ id?: string; titulo: string; texto: () => string; extras?: { rotulo: string; onClick: () => void }[] }`
- [ ] Renderiza o botão primário "Baixar PDF" (abre `/imprimir/<id>` em nova aba) e um menu "Mais" com "Copiar texto", "Enviar por e-mail" (`mailto:?subject=<titulo>&body=<texto>`), "Copiar link" (`baseUrl + /r/<id>`, só quando `id` existe) e os `extras`
- [ ] Sem `id`, "Baixar PDF" faz `window.print()` na própria tela como fallback
- [ ] No celular, o primário ocupa a largura e "Mais" vira botão de ícone com rótulo acessível
- [ ] `ResultHead` do `pdi-time` passa a usar `Entregar` no lugar dos botões avulsos; `CopyButton` continua exportado para uso em trechos (ex.: e-mail da ata)
- [ ] Lint e build passam; verificar no navegador

### US-013: Script `verificar-jargao.mjs`
**Description:** As a pessoa que mantém a suíte, I want um teste que falhe quando jargão técnico entrar na tela principal so that o padrão não regrida.

**Acceptance Criteria:**
- [ ] `scripts/verificar-jargao.mjs` varre `<app>/app/page.tsx` e `<app>/components/*.tsx` (exceto `setup.tsx`) procurando, em strings JSX e literais, os termos: `/setup`, `webhook`, `token`, ` ID`, `OpenRouter`, `Nemotron`, `gpt-`, `API`, `endpoint`, `env`
- [ ] Aceita uma lista de exceções por app em `scripts/jargao-excecoes.json`
- [ ] Sai com código 1 e lista arquivo, linha e termo quando encontra
- [ ] Entra no checklist "Verificação obrigatória" do `PADRAO.md` e no workflow de publicação como passo não bloqueante (aviso)
- [ ] Roda limpo no `pdi-time`

### US-014: Script `verificar-padrao.sh`
**Description:** As a pessoa que mantém a suíte, I want saber quando um arquivo compartilhado divergiu do `pdi-time` so that a replicação seja confiável.

**Acceptance Criteria:**
- [ ] `scripts/verificar-padrao.sh` compara, entre `pdi-time` e cada um dos outros 9 apps: `components/ui.tsx`, `components/setup.tsx`, `lib/ai.ts`, `lib/store.ts`, `lib/setup-comum.ts`, `lib/historico.ts`, `app/api/setup/**`, `app/r/**`, `app/imprimir/**` e `app/globals.css` até a linha `/* Específico deste app */`
- [ ] Sai com código 1 listando o que diverge
- [ ] Entra no checklist do `PADRAO.md`

### US-015: Replicar a fundação visual nos outros 9 apps
**Description:** As a executivo, I want a mesma qualidade em qualquer app da suíte so that a experiência seja uma só.

**Acceptance Criteria:**
- [ ] `ui.tsx`, `globals.css` (parte compartilhada), `lib/ai.ts` (função `meta`), `lib/historico.ts`, `app/r/**` e `app/imprimir/**` copiados do `pdi-time` para os 9 apps
- [ ] Em cada app: rotas devolvem `meta` e salvam no histórico; `Resultado` usa `Origem`, `Destaque` onde houver dado principal (Contratos: nota de risco; Voz do Cliente: NPS; Financeiro: total do período com variação; Entrevistadora: nota; Ata: contagem de decisões e ações), `Entregar`, `Privacidade`; `Empty` recebe ilustração própria; `Loading` recebe etapas; chips e formatos revisados; campos opcionais em `MaisDetalhes`; `Dropzone` em Financeiro, Contratos e Voz do Cliente
- [ ] `scripts/verificar-padrao.sh` e `scripts/verificar-jargao.mjs` passam nos 10 apps
- [ ] Em 1400x900 no estado vazio, o botão primário está visível sem rolagem nos 10
- [ ] Lint e build passam nos 10; verificar no navegador nos 10 (30 capturas)

### Fase 1, setup em um clique (no `pdi-time`, depois replicado)

### US-016: Chaves manuais em "Opções avançadas" quando existe autorização por aplicação
**Description:** As a executivo, I want conectar a IA ou o Trello clicando em um botão so that eu nunca veja um campo de chave se não precisar.

**Acceptance Criteria:**
- [ ] Em `CartaoIntegracao`, quando `integracao.oauth` existe e a integração não está configurada, o botão de autorização é o único elemento abaixo da descrição; os campos, o botão "Salvar" e o link "Obter a chave" ficam dentro de um `<details>` com summary "Opções avançadas: colar uma chave"
- [ ] Quando configurada, o cartão mostra "Conectado" com a chave mascarada (ou a conta, quando o OAuth devolver) e o botão "Desconectar" (PUT com `null`); "Opções avançadas" continua disponível
- [ ] Sem `oauth`, os campos aparecem direto, precedidos de um passo a passo numerado de até três passos gerado a partir de `link` e da `ajuda` do primeiro campo (ex.: "1. Abra o painel da ElevenLabs. 2. Crie uma chave. 3. Cole aqui")
- [ ] Lint e build passam; verificar no navegador em `/setup` (desktop e celular)

### US-017: Linguagem do setup sem jargão
**Description:** As a executivo, I want configurar sem tradutor so that eu termine o setup sozinho.

**Acceptance Criteria:**
- [ ] Rótulo do OAuth da IA em `lib/setup-comum.ts` vira "Conectar a IA"; o nome do provedor fica só na descrição
- [ ] A frase "Variáveis de ambiente, quando existirem, têm prioridade..." sai do rodapé e vai para um `<details>` "Para a equipe técnica" com essa frase e a origem `env`/`banco` de cada campo
- [ ] Botão "Salvar" desabilitado ganha a frase de apoio "Preencha ao menos um campo para salvar"
- [ ] Placeholder de campo `secret` já salvo é sempre "salvo: {mascarado}" (corrige o Apollo, que mostra bolinhas)
- [ ] Lint e build passam; verificar no navegador

### US-018: Progresso e próximo passo no setup
**Description:** As a executivo, I want saber o que falta e voltar ao app sem procurar so that o setup termine em um minuto.

**Acceptance Criteria:**
- [ ] Cabeçalho mostra "{n} de {total} conectados" e o primeiro cartão pendente obrigatório recebe destaque (borda de acento)
- [ ] Quando `pronto === true`, aparece um cartão "Tudo pronto" no topo com os botões "Testar com um exemplo" (abre `/?exemplo=1`) e "Ir para o app"
- [ ] Lint e build passam; verificar no navegador

### US-019: Replicar o setup nos outros 9 apps e ajustar integrações
**Description:** As a executivo, I want o mesmo setup em todos os apps so that eu configure qualquer um do mesmo jeito.

**Acceptance Criteria:**
- [ ] `components/setup.tsx` e `lib/setup-comum.ts` copiados do `pdi-time` para os 9 apps
- [ ] Agente de Kanban: fluxo do Trello passa a pedir só "Autorizar no Trello" com a chave de API do app embutida em `lib/integracoes.ts` (a chave de API do Trello é pública; o token é o segredo); a chave manual fica em "Opções avançadas"
- [ ] Atendente no WhatsApp: campos ganham rótulos em português ("Número de telefone (ID)", "Token de acesso permanente"); o token de verificação do webhook é gerado pelo app na primeira abertura do setup e exibido com "Copiar"; o cartão mostra a URL do webhook com "Copiar URL"
- [ ] Todas as integrações sem OAuth têm `link` e `ajuda` suficientes para o passo a passo de três passos
- [ ] `scripts/verificar-padrao.sh` passa
- [ ] Lint e build passam nos 10; verificar no navegador em `/setup` de cada app

### US-020: Investigar autorização em um clique para mais integrações
**Description:** As a pessoa que mantém a suíte, I want saber quais integrações podem trocar chave por botão so that eu priorize as próximas.

**Acceptance Criteria:**
- [ ] Documento `tasks/oauth-integracoes.md` avaliando viabilidade, pré-requisitos e esforço de: Meta Embedded Signup para WhatsApp Cloud API; HubSpot OAuth (Prospecção e Voz do Cliente); Google OAuth para Drive, Sheets e Calendar (Ata e Financeiro)
- [ ] Registra que ElevenLabs, OpenAI, Apollo e Bright Data não oferecem OAuth para chaves de API e seguem com passo a passo
- [ ] Termina com ordem recomendada de implementação

### Fase 1, correções específicas por app

### US-021: PDI do Time
**Description:** As a líder, I want um PDI com datas reais e apresentação impecável so that eu leve o plano direto para a conversa.

**Acceptance Criteria:**
- [ ] "Indicador" em posição fixa nos cartões de objetivo (coluna à direita no desktop, abaixo do título no celular)
- [ ] Campo opcional "Data da conversa" em `MaisDetalhes`; ações 30/60/90 exibem a data real ("30 dias · 12/10/2026")
- [ ] Campo "Seu nome" em `MaisDetalhes` (pré-preenchido do setup quando existir) aparece no cabeçalho do PDF como "Preparado por"
- [ ] Lint e build passam; verificar no navegador

### US-022: Agente de Kanban
**Description:** As a gestor, I want um agente que confirme antes de agir e permita desfazer so that eu confie nele com meu quadro real.

**Acceptance Criteria:**
- [ ] Quadro demo por visitante: estado em cookie de sessão (id) mapeado para um `Map` no servidor; botão "Reiniciar quadro de exemplo" no painel
- [ ] Com Trello conectado, o agente responde primeiro com a lista de ações planejadas e o botão "Confirmar"; só executa após confirmação. Em demo, executa direto
- [ ] Após executar, aparece "Desfazer" por 30 s que reverte a última ação (mover de volta, arquivar o criado, apagar o comentário)
- [ ] Sugestões viram botões `btn-ghost` pequenos abaixo do campo, somem depois de usadas e não têm a cor da bolha da assistente
- [ ] Cartão criado sem responsável mostra "Atribuir a alguém" clicável que preenche o comando
- [ ] Aviso de demonstração em uma frase
- [ ] Lint e build passam; verificar no navegador

### US-023: Entrevistadora IA
**Description:** As a gestor, I want ver a conversa que gerou as notas so that eu confie no scorecard.

**Acceptance Criteria:**
- [ ] Scorecard inclui `<details>` "Ver a conversa completa" com a transcrição; cada evidência da tabela de critérios linka para a pergunta de origem (âncora)
- [ ] `lib/demo.ts` reescrito: perguntas naturais por requisito sem `toLowerCase()` sobre o texto do usuário e sem template repetido; evidências distintas por critério; nada de "crm (hubspot"
- [ ] Botão "Encerrar entrevista" visível durante a conversa; "Nova entrevista" preserva a vaga e os requisitos
- [ ] Voz só toca após o primeiro gesto do usuário; indicador textual "Falando" ao lado do avatar enquanto o áudio toca
- [ ] Nota com vírgula ("7,4"); pontos fortes em lista quando forem 3 itens
- [ ] Texto "Ligação automática por telefone desligada. Conecte a ElevenLabs em /setup" vira botão "Ativar ligação automática" que leva ao cartão certo do setup
- [ ] Lint e build passam; verificar no navegador

### US-024: Posts em Minutos
**Description:** As a executivo de marketing, I want posts prontos para agendar so that o "melhor horário" vire ação.

**Acceptance Criteria:**
- [ ] Cartaz local (sem gerador de imagens) rotulado "Imagem provisória. Conecte um gerador de imagens no setup para a versão final" e redesenhado: tipografia grande sobre a cor de acento, texto completo em até três linhas com quebra automática
- [ ] Resultado em abas por rede no celular; no desktop, três colunas de altura igual (`grid` com `align-items: stretch`)
- [ ] "Patrocinado" removido da prévia do Instagram
- [ ] Por post: "Copiar" com submenu "com hashtags" e "sem hashtags", e "Agendar" que baixa um `.ics` com o melhor horário sugerido e o texto do post na descrição
- [ ] Lint e build passam; verificar no navegador

### US-025: Prospecção com IA
**Description:** As a executivo de vendas, I want abordagens que pareçam escritas por mim so that eu envie sem editar.

**Acceptance Criteria:**
- [ ] Campos "Seu nome" e "Sua empresa" em `MaisDetalhes` (pré-preenchidos do setup quando existirem); placeholders "[seu nome]" e "[sua empresa]" eliminados do prompt e do demo
- [ ] Prompt e `lib/demo.ts` geram gancho diferente por canal; a proposta do usuário é reescrita, nunca colada literalmente
- [ ] Tabela com `largura` por coluna, "Sinal" com papel `resumo` (duas linhas e "Ver mais"), LinkedIn e site do lead como links na linha
- [ ] Lead com abordagem escrita recebe chip "Abordagem pronta" ao voltar à lista; seleção múltipla com "Escrever para os selecionados"
- [ ] Aviso de demonstração: "Os leads exibidos são fictícios"
- [ ] Lint e build passam; verificar no navegador

### US-026: Atendente no WhatsApp
**Description:** As a executivo de atendimento, I want ver o atendente respondendo como a IA responderia so that eu entenda o que ganho ao conectar.

**Acceptance Criteria:**
- [ ] Bloco "Conectar ao WhatsApp de verdade" (webhook, token, URL) removido da tela principal; o que restar aponta para "Conectar meu número" que abre o cartão do WhatsApp em `/setup`
- [ ] Simulador envia o rascunho da base na requisição a `/api/simular`; quando há diferença entre rascunho e configuração salva, aparece "Alterações não salvas" com botão "Salvar" fixo no painel
- [ ] `lib/demo.ts` mostra a IA: resposta reformulada no tom configurado (não a cópia literal da base) e, quando não sabe, bolha com rótulo "Encaminhado para uma pessoa"
- [ ] Bolha de boas-vindas no simulador vazio; hora real de cada mensagem gravada no envio
- [ ] Lista de conversas com rótulos em sentence case ("Simulador", "Transferida"); "Limpar" vira "Apagar conversas do simulador" com confirmação
- [ ] Em cada resposta do atendente: "Aprovar" (grava o par pergunta/resposta na base) e "Corrigir" (abre campo para a resposta certa e grava)
- [ ] Lint e build passam; verificar no navegador

### US-027: Leitura de Contratos
**Description:** As a executivo, I want a nota de risco e o que negociar antes de qualquer parágrafo so that eu decida em segundos se aciono o jurídico.

**Acceptance Criteria:**
- [ ] `Destaque` com a nota de risco e a interpretação abre o resultado; `.summary` curto abaixo
- [ ] Cards "O essencial" com o número em 22 px negrito (R$ 48.000/mês, 24 meses, 30%) e o texto de apoio em até duas linhas
- [ ] Tabela de cláusulas: colunas na ordem Cláusula, Sugestão de negociação, Risco para você, Severidade; trecho do contrato em "Ver trecho"; papéis de coluna declarados para o celular
- [ ] Bloco "Pergunte sobre este contrato" sobe para logo abaixo de "O essencial", com três perguntas sugeridas clicáveis
- [ ] `Entregar` com extras "Baixar lista de pontos a negociar" (texto) e "E-mail para a outra parte" (rascunho gerado com os pontos, via `mailto:`)
- [ ] Chip da parte do usuário em `neutral` (acento) e da outra parte em cinza
- [ ] Lint e build passam; verificar no navegador

### US-028: Ata Executiva
**Description:** As a executivo, I want decisões, riscos e ações distinguíveis e prazos que vão para o calendário so that a reunião gere consequência.

**Acceptance Criteria:**
- [ ] Checkboxes "Concluída" só aparecem quando a ata está salva no histórico e persistem via `PATCH /api/ata/<id>/acoes`
- [ ] Decisões em card com borda de acento, riscos com chip "Risco" (warn), pendências com chip "Pendente" (neutro)
- [ ] Prazos normalizados para data completa no prompt e no demo; cada ação tem "Adicionar ao calendário" que baixa um `.ics`
- [ ] "Abrir no e-mail" (`mailto:` com participantes quando informados no formulário) ao lado de "Copiar" no bloco do e-mail de follow-up
- [ ] Aba "Gravar agora" mostra aviso "A transcrição não está conectada; a gravação vai gerar um exemplo" antes de iniciar, quando for o caso
- [ ] Lint e build passam; verificar no navegador

### US-029: Analista Financeiro
**Description:** As a CFO, I want gráficos legíveis que destaquem o que mudou so that eu veja a variação sem ler a tabela.

**Acceptance Criteria:**
- [ ] `GraficoMeses`: texto em px fixos (fora do `viewBox` escalado ou com `vector-effect="non-scaling-stroke"` e `font-size` fixo), eixo Y com três marcas e linha de base, último mês na cor de acento e os demais em cinza, rótulo de variação sobre o último mês
- [ ] `GraficoCategorias`: altura de 28 px por barra, rótulos de 13 px, categoria com maior crescimento sinalizada (cor `warn` e legenda)
- [ ] KPI "Maior categoria" substituído por "Maior variação" (categoria e percentual)
- [ ] Título "Leitura de {nome do arquivo}"
- [ ] `Entregar` com extra "Exportar planilha categorizada" (CSV)
- [ ] Sem rolagem horizontal no celular (remover `min-w-[380px]`)
- [ ] Lint e build passam; verificar no navegador (desktop e celular, com atenção aos gráficos)

### US-030: Voz do Cliente
**Description:** As a executivo de CX, I want o NPS calculado e uma tela que não dependa de cor so that eu apresente o resultado à diretoria.

**Acceptance Criteria:**
- [ ] Exemplo em `lib/demo.ts` inclui notas de 0 a 10 e o NPS aparece calculado no `Destaque`
- [ ] Barra de sentimento com percentuais dentro das faixas e padrão de textura (listras) no segmento neutro; legenda mantém os números
- [ ] Quadrante "Comece por aqui" em `ok` (verde) em vez do acento
- [ ] Coluna "Menções" com barra proporcional; clicar no tema abre `<details>` com os comentários daquele tema
- [ ] Upload via `Dropzone` compartilhado (CSV ou TXT)
- [ ] Subtítulo com o contexto em sentence case
- [ ] Lint e build passam; verificar no navegador

### Fase 1, MCP padrão

### US-031: Biblioteca MCP e primeiro servidor no `pdi-time`
**Description:** As a executivo que usa Claude ou ChatGPT, I want chamar o app de dentro do meu assistente so that eu use a IA da empresa onde já trabalho.

**Acceptance Criteria:**
- [ ] Novo `lib/mcp.ts` (copiado sem alterar): implementa MCP sobre Streamable HTTP em `app/mcp/route.ts` (`POST` para mensagens JSON-RPC `initialize`, `tools/list`, `tools/call`; `GET` devolve 405), autenticado por `Authorization: Bearer <token>`; decisão entre implementação própria e `@modelcontextprotocol/sdk` registrada no README com base no peso do pacote
- [ ] Token gerado em `/setup` no cartão "Usar dentro do seu assistente": botão "Gerar acesso", token mascarado com "Copiar", "Revogar"; gravado via `lib/store.ts`
- [ ] Novo `lib/ferramentas.ts` por app declara `FERRAMENTAS: { nome, descricao, schema (JSON Schema), executar(args) }[]`; o `pdi-time` declara `gerar_pdi` reutilizando a lógica de `app/api/pdi/route.ts`
- [ ] O cartão mostra a URL `<baseUrl>/mcp` e um passo a passo de três passos para Claude Desktop e para ChatGPT, com "Copiar configuração" (JSON pronto)
- [ ] Rate limit em memória: 60 chamadas por minuto por token; resposta 429 com mensagem clara
- [ ] Teste com o MCP Inspector documentado no README do `pdi-time` (comando e captura de tela)
- [ ] Lint e build passam; testar via curl `tools/list` e `tools/call` com e sem token

### US-032: Ferramentas MCP nos outros 9 apps
**Description:** As a executivo, I want todos os apps disponíveis no meu assistente so that a suíte inteira trabalhe comigo.

**Acceptance Criteria:**
- [ ] `lib/mcp.ts`, `app/mcp/route.ts` e o cartão do setup copiados do `pdi-time`
- [ ] `lib/ferramentas.ts` em cada app: Contratos `analisar_contrato(texto, papel, preocupacao?)`; Financeiro `ler_planilha(csv, colunas?)` e `perguntar(id_leitura, pergunta)`; Voz do Cliente `analisar_comentarios(texto, contexto?)`; Kanban `operar_quadro(comando, confirmar)`; Prospecção `buscar_leads(perfil)` e `escrever_abordagem(lead, proposta)`; Ata `gerar_ata(transcricao, titulo?, participantes?)`; Posts `escrever_posts(briefing, redes?)`; Entrevistadora `obter_scorecard(id_entrevista)`; WhatsApp `responder_pergunta(pergunta)`
- [ ] Ferramentas que executam ações em sistemas externos (`operar_quadro`) exigem `confirmar: true` e devolvem o plano quando `false`
- [ ] `scripts/verificar-padrao.sh` inclui `lib/mcp.ts` e `app/mcp/**`
- [ ] Lint e build passam nos 10; `tools/list` responde nos 10

### Fase 2, formulários, rotinas e capacidades por app

### US-033: Biblioteca de formulários públicos com o primeiro caso no PDI
**Description:** As a líder, I want mandar um link de autoavaliação para a pessoa do time so that eu chegue ao 1:1 com o PDI pré-montado.

**Acceptance Criteria:**
- [ ] Novo `lib/formularios.ts` (copiado sem alterar): tabelas `formularios(token, tipo, campos JSON, parametros JSON, expiraEm, limite, criadoEm)` e `respostas(id, token, dados JSON, resultadoId, criadoEm)`; funções `criar`, `obter`, `responder`, `listarRespostas`, `apagar`
- [ ] Nova rota `app/f/[token]/page.tsx`: tela pública mínima (marca do app, título, campos declarados, botão "Enviar"), sem `Topbar` completa; página "Obrigado, sua resposta foi enviada"; 410 amigável quando expirado ou no limite; honeypot contra bots; limite de 4.000 caracteres por campo
- [ ] Ao responder, o app executa a rota principal com os dados e salva o resultado no histórico; a resposta guarda `resultadoId`
- [ ] No `pdi-time`: botão "Pedir autoavaliação por link" no painel abre um diálogo com o link para copiar (expira em 30 dias por padrão, opções 7/30/90) e a lista de respostas recebidas em `MaisDetalhes`, cada uma com "Abrir PDI"
- [ ] Formulário do colaborador pede: nome, cargo, tempo na função, entregas recentes, aspirações; o líder completa "objetivos da empresa" ao abrir
- [ ] Lint e build passam; verificar no navegador (tela pública em celular e desktop)

### US-034: Biblioteca de rotinas, cartão "Notificações" e o primeiro caso no Kanban
**Description:** As a gestor, I want receber toda manhã um resumo do quadro so that eu saiba onde intervir antes da primeira reunião.

**Acceptance Criteria:**
- [ ] Novo `lib/rotinas.ts` (copiado sem alterar): tabela `rotinas(id, tipo, frequencia: diaria|semanal|mensal, hora, diaSemana?, diaMes?, canal, destino, parametros JSON, ativa, ultimaExecucao, criadoEm)`; executor em `setInterval` de 60 s iniciado uma vez por processo; rota `POST /api/rotinas/executar` com `Authorization: Bearer <token de rotinas>` que executa as rotinas vencidas (gatilho externo); `POST /api/rotinas/<id>/executar-agora`
- [ ] Novo `lib/notificacoes.ts` (copiado sem alterar) com canais: e-mail (Resend por chave ou SMTP por host/porta/usuário/senha), Slack (URL de webhook de entrada) e, quando o app tiver a Cloud API configurada, WhatsApp; a integração `NOTIFICACOES` entra em `lib/setup-comum.ts` e aparece em `/setup` como cartão "Notificações" com "Enviar mensagem de teste"
- [ ] Cartão "Rotinas" em `/setup` lista as rotinas do app com frequência, canal, última execução, "Executar agora", "Pausar" e "Apagar"; mostra o aviso "No plano gratuito o app hiberna e a rotina só roda quando alguém acessa. Para rodar sozinho, use um plano pago ou chame esta URL de um agendador externo" com a URL e o token para copiar
- [ ] Toda entrega inclui título, resumo e o link `/r/<id>` do resultado
- [ ] No Agente de Kanban: botão "Receber um resumo do quadro toda manhã" no painel cria a rotina (hora padrão 8h, canal do cartão "Notificações"); o resumo lista atrasados, parados há mais de 5 dias e responsáveis com mais de N cartões
- [ ] Lint e build passam; testar via curl o gatilho externo com e sem token; verificar no navegador os cartões do setup

### US-035: Agente de Kanban, caixa de entrada pública
**Description:** As a gestor, I want que qualquer pessoa da empresa peça algo por um link so that o pedido vire cartão na coluna certa sem passar por mim.

**Acceptance Criteria:**
- [ ] Botão "Criar caixa de entrada" no painel gera um formulário público (campos: quem pede, o que precisa, urgência, prazo desejado) com link para copiar
- [ ] Cada resposta passa pelo agente, que cria o cartão com título, descrição, etiqueta de urgência e coluna escolhida; em demo, no quadro de exemplo do criador
- [ ] Lista de pedidos recebidos em `MaisDetalhes` com o cartão criado
- [ ] Lint e build passam; verificar no navegador

### US-036: Entrevistadora IA, link por candidato e ranking da vaga
**Description:** As a gestor, I want mandar um link para cada candidato e comparar os scorecards so that a triagem aconteça sem mim.

**Acceptance Criteria:**
- [ ] "Criar link para candidatos" gera um formulário público cuja tela é a sala de entrevista (o formulário é a entrevista); a vaga e os requisitos ficam nos `parametros`
- [ ] Cada entrevista concluída gera o scorecard no histórico, ligado à vaga
- [ ] Novo bloco "Candidatos desta vaga" no painel lista os scorecards com nota, recomendação e "Abrir"; botão "Comparar" gera um ranking (tabela ordenada por nota com pontos fortes e de atenção em uma linha) que também vai para o histórico e para o `Entregar`
- [ ] Retenção: scorecards de candidatos expiram em 90 dias por padrão (ver Open Questions)
- [ ] Lint e build passam; verificar no navegador (sala pública em celular)

### US-037: Atendente no WhatsApp, relatório diário e base por formulário
**Description:** As a executivo de atendimento, I want saber todo dia o que o atendente não soube responder so that a base melhore sem eu ler as conversas.

**Acceptance Criteria:**
- [ ] Rotina "Relatório diário do atendimento" (botão no painel): perguntas mais frequentes, as não respondidas ou transferidas, e para cada uma a resposta sugerida pela IA com links "Aprovar" e "Corrigir" que abrem o app já posicionado
- [ ] "Alimentar a base por formulário" gera um formulário interno (pergunta, resposta, categoria) para quem não é técnico; cada resposta entra na base após "Aprovar" na lista do painel
- [ ] Lint e build passam; verificar no navegador

### US-038: Leitura de Contratos, política da empresa
**Description:** As a executivo, I want cadastrar uma vez o que a empresa aceita so that cada análise diga o que foge da nossa política.

**Acceptance Criteria:**
- [ ] Cartão "Política de contratos" em `/setup` com campos: multa máxima aceitável (%), prazo máximo (meses), aviso prévio mínimo (dias), foro preferido, exigências obrigatórias (SLA com penalidade, proteção de dados, propriedade progressiva do código), texto livre
- [ ] Análise recebe a política no prompt; nova seção "Fora da política" no resultado lista cada cláusula que viola um item, com o item citado; `lib/demo.ts` traz um exemplo de política
- [ ] Sem política cadastrada, a seção convida "Cadastrar a política da empresa" em uma linha
- [ ] Lint e build passam; verificar no navegador

### US-039: Ata Executiva, ações para o quadro de tarefas e confirmação dos responsáveis
**Description:** As a executivo, I want que as ações da ata virem tarefas e que cada responsável confirme so that a reunião não termine no papel.

**Acceptance Criteria:**
- [ ] Cartão compartilhado "Quadro de tarefas (MCP)" em `lib/setup-comum.ts` (URL do servidor MCP e token; testar conexão lista as ferramentas); copiado sem alterar
- [ ] Botão "Enviar ações para o quadro" no resultado chama a ferramenta `operar_quadro` (ou a ferramenta equivalente do MCP configurado) com uma ação por cartão, após confirmação; mostra o que foi criado
- [ ] "Pedir confirmação aos responsáveis" gera um formulário público por ação (confirmar, ajustar prazo, comentar); respostas atualizam o status da ação na ata salva
- [ ] Lint e build passam; verificar no navegador

### US-040: Analista Financeiro, resumo mensal e orçamento
**Description:** As a CFO, I want receber todo mês o resumo em cinco linhas e ser avisado quando uma categoria estourar so that eu não precise abrir a planilha.

**Acceptance Criteria:**
- [ ] Rotina "Resumo mensal" (botão no painel após uma leitura): usa o último CSV enviado ou o arquivo recebido por um formulário público de upload ("Enviar a planilha do mês"), gera a leitura e entrega cinco linhas com o total, a variação, a maior variação por categoria, o maior lançamento e os alertas
- [ ] Cartão "Orçamento por categoria" em `/setup` (categoria e valor mensal); leituras marcam categorias acima do orçamento com chip "Acima do orçamento" e o resumo mensal lista os estouros
- [ ] Dados sensíveis: o CSV recebido é processado e descartado; só agregados vão para o histórico
- [ ] Lint e build passam; verificar no navegador

### US-041: Voz do Cliente, pesquisa como link público
**Description:** As a executivo de CX, I want que o app colete as respostas dos clientes so that a análise não dependa de eu exportar comentários de outro sistema.

**Acceptance Criteria:**
- [ ] "Criar pesquisa" gera um formulário público com nota de 0 a 10, comentário livre e até dois campos opcionais (segmento, produto); tela pública com a marca do app e tema claro para o cliente final
- [ ] Botão "Analisar respostas recebidas" roda a análise sobre as respostas do período escolhido e mostra o total coletado
- [ ] Lista de pesquisas ativas em `MaisDetalhes` com link, respostas e "Encerrar"
- [ ] Lint e build passam; verificar no navegador (pesquisa pública em celular)

### US-042: Prospecção com IA, leads semanais
**Description:** As a executivo de vendas, I want receber toda semana novos leads com as abordagens prontas so that a prospecção ande sem eu abrir o app.

**Acceptance Criteria:**
- [ ] Botão "Receber leads novos toda semana" no resultado cria a rotina com o perfil buscado e a quantidade (10, 20 ou 30)
- [ ] A entrega lista os leads (nome, cargo, empresa, sinal) com o link do resultado completo e exclui leads já entregues em semanas anteriores (tabela de leads vistos por perfil)
- [ ] Em demo, a rotina gera leads fictícios rotulados como tal
- [ ] Lint e build passam; verificar no navegador

### Fase 3, capacidades avançadas

### US-043: PDI do Time, lembretes de check-in
**Description:** As a líder, I want ser lembrado nos marcos de 30, 60 e 90 dias so that o PDI não morra depois da conversa.

**Acceptance Criteria:**
- [ ] Botão "Lembrar dos check-ins" no resultado cria três rotinas únicas nas datas dos marcos, com as ações daquele marco e um link de formulário "O que avançou?" para o líder e para a pessoa
- [ ] Respostas anexam ao PDI salvo uma seção "Acompanhamento" com data e texto
- [ ] Lint e build passam; verificar no navegador

### US-044: Posts em Minutos, calendário editorial com aprovação
**Description:** As a executivo de marketing, I want rascunhos toda semana a partir dos meus temas e aprovar pelo celular so that o conteúdo saia sem reunião.

**Acceptance Criteria:**
- [ ] Cartão "Temas do trimestre" em `/setup` (lista de temas e tom de voz)
- [ ] Rotina "Rascunhos toda segunda" gera um post por rede para o próximo tema e entrega com link de formulário de aprovação (aprovar, pedir ajuste com comentário, descartar)
- [ ] Post aprovado vai para "Aprovados" no painel com "Copiar" e "Agendar" (`.ics`); publicação direta fica fora do escopo (ver Non-Goals)
- [ ] Lint e build passam; verificar no navegador (formulário de aprovação em celular)

### US-045: Agente de Kanban, qualquer quadro via MCP
**Description:** As a gestor que usa Jira, Notion ou monday, I want conectar meu quadro so that o agente opere onde meu time já trabalha.

**Acceptance Criteria:**
- [ ] Reutiliza o cartão compartilhado "Quadro de tarefas (MCP)" (US-039); quando configurado, o agente mapeia suas ações (criar, mover, comentar, arquivar, listar) para as ferramentas do MCP conectado por nome e descrição, com o mapeamento revisável em "Opções avançadas"
- [ ] Trello continua como caminho padrão quando nenhum MCP está configurado
- [ ] Confirmação e "Desfazer" (US-022) funcionam com o MCP externo quando ele oferece a operação inversa; caso contrário, "Desfazer" é omitido com aviso
- [ ] Lint e build passam; testar com um MCP de exemplo (o próprio `agente-kanban` de outra instância serve como alvo)

### US-046: Prospecção com IA, leads direto no CRM
**Description:** As a executivo de vendas, I want mandar os leads e as abordagens para o CRM em um clique so that o time trabalhe de lá.

**Acceptance Criteria:**
- [ ] Cartão compartilhado "CRM (MCP)" em `lib/setup-comum.ts` (URL e token), com o HubSpot como exemplo no passo a passo
- [ ] Botão "Enviar para o CRM" no lead e "Enviar selecionados" na lista chamam as ferramentas de criar contato e negócio, após confirmação, e marcam o lead com "No CRM"
- [ ] Lint e build passam; verificar no navegador

### US-047: Atendente no WhatsApp, respostas com dados da empresa
**Description:** As a executivo de atendimento, I want que o atendente consulte pedidos e estoque so that responda com dados reais, não só com a base de texto.

**Acceptance Criteria:**
- [ ] Cartão compartilhado "Sistemas da empresa (MCP)" (URL e token); o atendente passa a usar tool use com as ferramentas do MCP conectado, limitado a ferramentas de leitura (nomes que começam com `listar`, `obter`, `consultar`, `buscar`) salvo liberação em "Opções avançadas"
- [ ] Resposta que usou uma ferramenta mostra "Consultado em {nome da ferramenta}" na bolha (simulador) e no relatório diário
- [ ] Lint e build passam; verificar no navegador

### US-048: Leitura de Contratos, alertas de prazo
**Description:** As a executivo, I want ser avisado 30 dias antes de renovação, reajuste ou rescisão so that eu negocie a tempo.

**Acceptance Criteria:**
- [ ] Análise extrai `prazos[] { tipo, data, descricao }` (prompt e demo); resultado mostra a lista com "Adicionar ao calendário" (`.ics`)
- [ ] Botão "Avisar 30 dias antes" cria rotinas únicas por prazo (só disponível quando o resultado foi salvo com opt-in); a entrega cita o contrato, a cláusula e a ação sugerida
- [ ] Lint e build passam; verificar no navegador

### US-049: Ata Executiva, cobrança dos responsáveis
**Description:** As a executivo, I want que os responsáveis sejam lembrados na véspera do prazo so that eu não precise cobrar.

**Acceptance Criteria:**
- [ ] Botão "Cobrar na véspera" no resultado cria uma rotina única por ação, um dia antes do prazo, para o e-mail do responsável (pedido no formulário da ata em `MaisDetalhes`); a mensagem tem a ação, o prazo e o link de confirmação (US-039)
- [ ] Ações confirmadas como concluídas cancelam a cobrança
- [ ] Lint e build passam; verificar no navegador

### US-050: Analista Financeiro, planilha ou ERP conectado
**Description:** As a CFO, I want que o app leia a planilha viva ou o ERP so that ninguém exporte CSV todo mês.

**Acceptance Criteria:**
- [ ] Cartão compartilhado "Fonte de dados (MCP)" (URL e token) com Google Sheets e ERPs como exemplos no passo a passo; o app chama a ferramenta de leitura configurada em "Opções avançadas" (nome da ferramenta e argumentos) e trata o retorno como CSV
- [ ] Botão "Ler da fonte conectada" no painel; a rotina mensal (US-040) passa a usar a fonte quando configurada
- [ ] Só agregados vão para a IA e para o histórico
- [ ] Lint e build passam; verificar no navegador

### US-051: Voz do Cliente, análise semanal com alerta
**Description:** As a executivo de CX, I want um resumo semanal das respostas novas e um alerta quando o negativo crescer so that eu reaja antes do churn.

**Acceptance Criteria:**
- [ ] Rotina "Análise semanal" (botão no painel de uma pesquisa ativa) analisa as respostas dos últimos 7 dias, compara sentimento e NPS com a semana anterior e entrega o resumo com o link do resultado
- [ ] Alerta imediato (mesma rotina, verificação diária) quando o percentual negativo sobe mais de N pontos em 7 dias (N configurável, padrão 10)
- [ ] Lint e build passam; verificar no navegador

### US-052: Voz do Cliente, tickets de atendimento via MCP
**Description:** As a executivo de CX, I want analisar os tickets do suporte so that a voz do cliente inclua quem reclamou, não só quem respondeu à pesquisa.

**Acceptance Criteria:**
- [ ] Reutiliza o cartão "CRM (MCP)" (US-046) ou um cartão "Atendimento (MCP)" com HubSpot, Zendesk e Intercom como exemplos; botão "Importar tickets do período" chama a ferramenta de listagem e converte para comentários
- [ ] Origem de cada comentário (pesquisa, arquivo, ticket) aparece no resultado
- [ ] Lint e build passam; verificar no navegador

### Catálogo

### US-053: Catálogo com prévia, demonstração e capacidades
**Description:** As a executivo visitando o catálogo, I want ver o app antes de publicar so that eu escolha com segurança.

**Acceptance Criteria:**
- [ ] `catalogo.json` ganha, por app, `captura` (caminho relativo), `demo` (URL) e `capacidades: ("artefato" | "mcp" | "formulario" | "rotina")[]`
- [ ] Workflow `publicar.yml`: após construir a imagem, sobe o contêiner, captura `/?exemplo=1&captura=1` em 1200x800 com Chrome headless e grava em `publico/main/capturas/<app>.png`; falha na captura vira aviso, não bloqueia
- [ ] `site/index.html`: cartão mostra a prévia no topo (com `alt` descritivo), o botão secundário "Ver demonstração" quando `demo` existe e um bloco "O que ele faz sozinho" com ícones e rótulos das capacidades
- [ ] `scripts/gerar-deploy.mjs` valida os campos novos
- [ ] Verificar no navegador (desktop e celular; modo claro e escuro do catálogo)

## Functional Requirements

Fundação
- FR-1: `ui.tsx` deve exportar `Origem`, `Destaque`, `Entregar`, `MaisDetalhes`, `Dropzone`, `Privacidade`, os helpers `numero` e `data`, e as versões novas de `Chip`, `Empty`, `Loading`, `ErrorBox`, `DataTable`, `DemoNotice` e `Topbar`, mantendo a regra "copiar sem alterar".
- FR-2: Toda rota que devolve resultado de IA deve incluir `meta: { demo, model, geradoEm, insumo }` e o `id` do resultado salvo, quando salvo.
- FR-3: Toda tela de resultado deve seguir a ordem `ResultHead` (com `Entregar`) → `Origem` → `Destaque` → `.summary` → seções.
- FR-4: Nenhum texto visível na tela principal pode conter os termos listados em `scripts/verificar-jargao.mjs`; o script deve falhar quando encontrar.
- FR-5: Em 1400x900 no estado vazio, o botão primário deve estar visível sem rolagem nos 10 apps.
- FR-6: Chips devem exibir rótulo em sentence case; decimais com vírgula; datas em pt-BR com ano quando fora do ano corrente.
- FR-7: Cada app deve ter `app/icon.svg` gerado a partir da cor de acento do `catalogo.json`.
- FR-8: A `Topbar` não pode mudar de altura nem deslocar o conteúdo quando `/api/status` responde.
- FR-9: `?exemplo=1` deve funcionar em `next dev` e em produção.

Setup
- FR-10: Quando a integração tem `oauth`, os campos de chave devem ficar dentro de "Opções avançadas" recolhido por padrão.
- FR-11: Quando não tem, o cartão deve mostrar passo a passo de até três passos com o link direto.
- FR-12: O botão de autorização da IA deve se chamar "Conectar a IA".
- FR-13: Após conectar a IA, o setup deve oferecer "Testar com um exemplo".
- FR-14: Segredos nunca voltam inteiros ao navegador (mantido); tokens gerados pelo app (MCP, rotinas, webhook) seguem a mesma regra após a primeira exibição.

Capacidades
- FR-15: Todo resultado pode ser salvo com `id` e aberto em `/r/<id>` e `/imprimir/<id>`; Contratos e Financeiro exigem opt-in e expiram em 30 dias.
- FR-16: Todo app expõe `POST /mcp` com Bearer token, `tools/list` e `tools/call`, e de 1 a 3 ferramentas declaradas em `lib/ferramentas.ts`.
- FR-17: Ferramentas MCP que executam ações em sistemas externos exigem `confirmar: true` e devolvem o plano quando `false`.
- FR-18: Formulários públicos têm expiração (7, 30 ou 90 dias), limite de respostas, honeypot e tela sem barra de configuração.
- FR-19: Rotinas têm executor interno, gatilho externo autenticado (`POST /api/rotinas/executar`), "Executar agora", "Pausar" e "Apagar", e entregam por e-mail, Slack ou WhatsApp com o link do resultado.
- FR-20: O cartão de rotinas avisa sobre hibernação no plano gratuito e mostra a URL e o token do gatilho externo.
- FR-21: Cartões compartilhados de MCP externo ("Quadro de tarefas", "CRM", "Sistemas da empresa", "Fonte de dados") seguem o mesmo formato: URL, token, "Testar conexão" que lista as ferramentas.
- FR-22: Um app não adota mais de duas capacidades além de Artefato e MCP sem revisão desta PRD.

Catálogo
- FR-23: Cada cartão do catálogo tem prévia visual, "Ver demonstração" e a lista de capacidades ativas.

## Non-Goals

- Login, múltiplos usuários, permissões ou times. A suíte continua sendo "um app, uma pessoa configurando".
- Navegação com menu lateral, múltiplas páginas ou um "dashboard" agregando os 10 apps.
- Trocar a stack, adotar biblioteca de componentes ou de gráficos.
- Editor de prompts ou escolha de modelo na tela principal (fica no setup).
- Modo escuro nos apps nesta rodada (o catálogo já tem).
- Publicação direta em redes sociais (Posts em Minutos entrega `.ics` e texto aprovado, não publica).
- Integração entre apps por acoplamento de código; só via MCP.
- Cobrança, planos ou telemetria de uso.
- Servidor de e-mail próprio; só provedores configurados pelo usuário.

## Design Considerations

- Tipografia: manter Manrope. Escala: h1 do painel 26 px; título do resultado 22 px; `Destaque` 40 px com rótulo 13 px; `.summary` 17 px; corpo 15 px; apoio 13 px. Nada acima de 22 px além do `Destaque`.
- Cor: acento só em ação primária, `Destaque`, links e "seu lado". Semântica fixa: `ok` para positivo e "comece por aqui", `warn` para atenção, `danger` para risco alto e negativo. Nunca usar o acento para semântica.
- Gráficos: seguir o skill `dataviz`. Uma série destacada e as demais em cinza, eixo com três marcas, rótulos em px fixos, sem gradiente. Paleta categórica só quando a categoria é a mensagem.
- Ícones e ilustrações: SVG inline, traço de 1,5 px, cor de acento, 64 px no estado vazio e 16 px nos botões. Sem emoji.
- Movimento: só o `reveal`, mais um fade de 150 ms para o popover de demonstração e para "Alterações não salvas". `prefers-reduced-motion` desliga tudo.
- Impressão: A4 com margem de 18 mm, cabeçalho com nome do app, título e data, rodapé com a linha `Origem`.
- Tela pública de formulário: fundo `bg`, cartão centrado de 560 px, marca do app no topo, sem `Topbar` completa; a pesquisa de Voz do Cliente é a única com tema claro fixo (cliente final).
- Componentes existentes a reutilizar: `card`, `input`, `btn-primary`, `btn-ghost`, `btn-link`, `Section`, `Item`, `CopyButton`, `useScrollToResult`.
- Referências de tom: Linear (densidade e hierarquia), Notion (formulários públicos), Stripe Docs (passo a passo do setup).
- Capturas da auditoria (temporárias): `/private/tmp/claude-501/-Users-rafael-Desktop-projetos/75638f5f-e88e-4131-badb-03af34a7676b/scratchpad/shots/`. Script de captura via CDP reutilizável na mesma pasta (`cdp-shot.mjs`), útil porque o Chrome headless no macOS não aceita janela menor que cerca de 470 px sem emulação.

## Technical Considerations

- Ordem de replicação: toda mudança transversal é feita no `pdi-time`, verificada, e copiada para os outros 9 em uma história de replicação. `scripts/verificar-padrao.sh` falha quando os arquivos compartilhados divergem.
- Arquivos compartilhados novos (copiados sem alterar): `lib/historico.ts`, `lib/mcp.ts`, `lib/formularios.ts`, `lib/rotinas.ts`, `lib/notificacoes.ts`, `app/r/[id]/page.tsx`, `app/imprimir/[id]/page.tsx`, `app/mcp/route.ts`, `app/f/[token]/page.tsx`, `app/api/rotinas/**`. Arquivos por app: `lib/ferramentas.ts` e o que já existe.
- PDF: sem dependência nova na fase 1 (`/imprimir/<id>` com CSS de impressão). Se a qualidade não bastar, avaliar `@react-pdf/renderer` em rodada posterior.
- CSV, DOCX e XLSX: preferir CSV. DOCX só se pedido; `docx` é pequena.
- E-mail: `mailto:` no `Entregar`. Nas rotinas, Resend (chave) ou SMTP (host, porta, usuário, senha) via cartão "Notificações"; `nodemailer` só se SMTP for escolhido (ver Open Questions).
- MCP: Streamable HTTP em `app/mcp/route.ts`. Preferir implementação própria mínima (JSON-RPC 2.0 com `initialize`, `tools/list`, `tools/call`) se o SDK oficial pesar; caso contrário `@modelcontextprotocol/sdk`. Para consumir MCPs externos (fase 3), um cliente mínimo em `lib/mcp-cliente.ts` compartilhado.
- Rotinas e hibernação: o executor interno só roda enquanto o processo está vivo. O gatilho externo `POST /api/rotinas/executar` permite qualquer agendador; documentar um workflow `cron` do GitHub Actions no repositório privado como opção "Para a equipe técnica".
- Formulários públicos: rota sem `Topbar` completa; honeypot; limite por campo; `Cache-Control: no-store`.
- Dados sensíveis: Contratos e Financeiro não gravam por padrão; quando gravam, expiram em 30 dias (`limparExpirados()` na inicialização). Scorecards de candidatos expiram em 90 dias.
- Segurança dos tokens: MCP, rotinas e webhook usam tokens aleatórios de 32 bytes gerados com `crypto.randomBytes`, gravados em SQLite, exibidos inteiros uma vez e mascarados depois.
- Capturas no workflow: o job de publicação sobe cada imagem, captura `?exemplo=1&captura=1` e comita em `publico/main/capturas/`. Falha na captura não bloqueia o deploy.
- Testes: além de lint e build, `verificar-jargao.mjs` e `verificar-padrao.sh` entram no checklist do `PADRAO.md`. Capturas de verificação continuam manuais (Read das imagens), conforme P7.
- Priorização: fase 1 (US-001 a US-032) entrega fundação, setup, correções por app e MCP em todos. Fase 2 (US-033 a US-042) entrega formulários, rotinas e uma capacidade por app. Fase 3 (US-043 a US-052) depende de integrações externas via MCP. US-053 (catálogo) pode entrar ao fim da fase 1.

Matriz de capacidades por app (utilidade x complexidade):

| App | Capacidade | História | Utilidade | Complexidade | Fase |
|---|---|---|---|---|---|
| Todos | Artefato (PDF, link, e-mail, histórico) | US-011, US-012 | Alta | Baixa | 1 |
| Todos | MCP (expor) | US-031, US-032 | Alta | Baixa | 1 |
| PDI do Time | Formulário de autoavaliação | US-033 | Alta | Média | 2 |
| PDI do Time | Rotina de check-ins | US-043 | Média | Média | 3 |
| Agente de Kanban | Rotina de resumo matinal | US-034 | Alta | Baixa | 2 |
| Agente de Kanban | Formulário caixa de entrada | US-035 | Alta | Média | 2 |
| Agente de Kanban | MCP (consumir) qualquer quadro | US-045 | Alta | Alta | 3 |
| Entrevistadora IA | Formulário por candidato e ranking | US-036 | Alta | Média | 2 |
| Posts em Minutos | Artefato `.ics` | US-024 | Média | Baixa | 1 |
| Posts em Minutos | Rotina calendário editorial | US-044 | Alta | Média | 3 |
| Prospecção com IA | Rotina leads semanais | US-042 | Alta | Média | 2 |
| Prospecção com IA | MCP (consumir) CRM | US-046 | Alta | Média | 3 |
| Atendente no WhatsApp | Rotina relatório diário e formulário da base | US-037 | Alta | Baixa | 2 |
| Atendente no WhatsApp | MCP (consumir) sistemas da empresa | US-047 | Alta | Alta | 3 |
| Leitura de Contratos | Artefato parecer e e-mail à contraparte | US-027 | Alta | Baixa | 1 |
| Leitura de Contratos | Formulário política da empresa | US-038 | Alta | Média | 2 |
| Leitura de Contratos | Rotina alertas de prazo | US-048 | Alta | Média | 3 |
| Ata Executiva | MCP (consumir) tarefas e formulário de confirmação | US-039 | Alta | Média | 2 |
| Ata Executiva | Rotina cobrança | US-049 | Alta | Média | 3 |
| Analista Financeiro | Rotina resumo mensal e orçamento | US-040 | Alta | Média | 2 |
| Analista Financeiro | MCP (consumir) planilha ou ERP | US-050 | Alta | Média | 3 |
| Voz do Cliente | Formulário pesquisa NPS | US-041 | Alta | Média | 2 |
| Voz do Cliente | Rotina análise semanal | US-051 | Alta | Baixa | 3 |
| Voz do Cliente | MCP (consumir) tickets | US-052 | Média | Média | 3 |

## Success Metrics

| Métrica | Hoje | Meta |
|---|---|---|
| Botão primário visível sem rolagem em 1400x900 | 4 de 10 | 10 de 10 |
| Apps com jargão na tela principal (`verificar-jargao.mjs`) | ao menos 6 | 0 |
| Resultados com `Origem` e `Entregar` | 0 e 2 parciais | 100% |
| Apps com favicon próprio e prévia no catálogo | 0 | 10 |
| Apps com `POST /mcp` testado pelo MCP Inspector | 0 | 10 |
| Apps com uma capacidade de fase 2 entregue | 0 | 10 |
| Conexão da IA no setup | botão e campos lado a lado | um clique, sem ver campo de chave |
| Salto de layout ao carregar | 50 a 60 px | 0 |
| Teste com 5 executivos | não medido | 5 de 5 entendem o app em 10 s; 4 de 5 levam o resultado para fora sem ajuda |

## Open Questions

1. Persistência no plano gratuito: avisar e seguir, ou o catálogo passa a recomendar plano pago como padrão?
2. Provedor de e-mail para rotinas: Resend (chave, simples, sem dependência pesada) ou SMTP (qualquer conta corporativa, exige `nodemailer`)? Proposta: começar com Resend e deixar SMTP como opção avançada.
3. Trello: embutir a chave de API pública do app no código para que o executivo só clique em "Autorizar" (US-019 assume que sim). Confirmar.
4. Modo escuro nos apps: entra nesta rodada ou fica para depois?
5. Ranking de candidatos e histórico de entrevistas envolvem dados pessoais; 90 dias de retenção é aceitável?
6. O MCP é exposto por padrão (token gerado na primeira abertura do setup) ou só quando o executivo clica "Gerar acesso"? US-031 assume o segundo.
7. Cartões compartilhados de MCP externo: um cartão genérico "Conectar uma ferramenta (MCP)" reutilizado por todos, ou cartões nomeados por papel (quadro, CRM, fonte de dados) como nas histórias?
8. Onde entram as capturas do catálogo: `publico/main/capturas/` (assume-se) ou outro lugar?
9. Ordem dentro da fase 1: correções por app (US-021 a US-030) antes ou depois do MCP (US-031 e US-032)? A ordem atual prioriza a experiência visual.
