# Fase 4 — Validação independente do PRD `toolkit-dash-builder` v1

| | |
|---|---|
| Documento validado | [`01-prd.md`](01-prd.md) (2.002 linhas), com [`00-analise-projeto-original.md`](00-analise-projeto-original.md) e [`02-funcionalidades-e-core.md`](02-funcionalidades-e-core.md) como apoio |
| Modelo usado na validação | Claude Fable 5.1 |
| Data | 2026-09-21 |
| Escopo | Conformidade com `PADRAO.md` e `pdi-time/CLAUDE.md`; verdade das afirmações técnicas (lidas nos arquivos citados, não de memória); consistência do esquema, dos prompts e dos validadores; viabilidade de implementação; entrega do core; respostas para P1–P6 |
| Método | Cada afirmação do PRD foi conferida contra o arquivo de referência (`caminho:linha`). A paleta foi recalculada com as fórmulas de `scripts/verificar-paleta.mjs`. O projeto de origem foi consultado só para confirmar o que o PRD afirma sobre ele |

Convenção de citação: `01-prd.md:NNN` é o PRD; os demais caminhos são relativos à raiz do monorepo.

---

## Veredito geral

O PRD é sólido no que importa mais: o esquema `EspecPainel` é uma melhoria real sobre a origem, os quatro prompts estão em português correto e cobrem as "sacadas" do documento de core, e a arquitetura respeita o padrão da suíte na maior parte dos pontos. **Mas ele não pode ser implementado como está**: três instruções da seção 7.1 quebram o build ou o `verificar-padrao.sh` no primeiro dia (remover `nodemailer`, remover pastas de `app/api/setup/oauth`, usar `segmento="Dados"` num tipo que não existe). Há ainda cinco problemas de severidade alta que fariam o produto falhar na demonstração ou na verificação: o retry que o RF-06 atribui ao `askJSON` não existe; a impressão perde as barras (fundo `div` não imprime por padrão) e a tabela cai no bug conhecido do `DataTable`; a captura automática do catálogo depende de um gate que o PRD não garante para o `?exemplo=1`; o cache de 24 h impede "gerar outra versão" e serve painéis já refinados; e o refinamento não tem `maxTokens`. Nada disso exige redesenho — são correções pontuais de seção, listadas ao fim como checklist para a Fase 5.

---

## Achados

Ordenados por severidade. Cada um diz o que muda no PRD; nenhum é só observação.

### Bloqueantes

**1. [bloqueante] Remover `app/api/setup/oauth/{google,microsoft,mcp}` faz `scripts/verificar-padrao.sh` sair com 1.**
- *Evidência (PRD):* `01-prd.md:1169` ("REMOVER as pastas oauth/google, oauth/microsoft e oauth/mcp"), repetido na Etapa 1 em `01-prd.md:1828-1831`.
- *Evidência (referência):* `scripts/verificar-padrao.sh:66` lista `app/api/setup` inteira na camada INFRA; `:199-203` percorre a pasta de `pdi-time` arquivo a arquivo; `:151-154` devolve `ausente` **antes** de consultar `scripts/padrao-excecoes.json` — uma exceção registrada não cobre arquivo ausente, só arquivo diferente. `PADRAO.md:91` ("Não pode mudar: … `app/api/rotinas|setup|status|conta|historico`"). Todos os apps sem e-mail e sem rotina mantêm as quatro pastas (`videos-campanha/app/api/setup/oauth`, `build-agentflows/…`, `bussola-ia/…`: `google mcp microsoft openrouter`).
- *Impacto:* a Etapa 1 promete "`verificar-padrao.sh` sai 0" e isso é impossível com a instrução acima; `lib/mcp-oauth.ts` (INFRA, `verificar-padrao.sh:58`) ficaria sem as rotas par.
- *Correção:* em 7.1, trocar a linha por "`setup/**` [INFRA] cópia sem alterar, inclusive `oauth/google`, `oauth/microsoft` e `oauth/mcp` (rotas compartilhadas; sem credencial `_APP` os botões simplesmente não aparecem em `/setup`)". Remover a instrução da Etapa 1. Manter também `Dockerfile` igual ao do `pdi-time` (ver achado 21).

**2. [bloqueante] Remover `nodemailer` do `package.json` quebra `npm run build`.**
- *Evidência (PRD):* `01-prd.md:1142` ("REMOVER \"nodemailer\""), `01-prd.md:1829`.
- *Evidência (referência):* `pdi-time/lib/notificacoes.ts:105` faz `await import("nodemailer")`; esse arquivo é INFRA e copiado byte a byte (`verificar-padrao.sh:60`). `pdi-time/CLAUDE.md` (nota US-053): "`nodemailer` não vem com tipos embutidos — precisa de `@types/nodemailer` como devDependency para o `tsc --noEmit` passar". Os 16 apps do padrão têm `nodemailer` no `package.json` (`grep -l nodemailer */package.json` → 16).
- *Impacto:* `next build` falha no type-check com "Cannot find module 'nodemailer'" antes de qualquer tela existir.
- *Correção:* em 7.1, `package.json` "[PRÓPRIO] só o `name` muda". Nada mais.

**3. [bloqueante] `segmento="Dados"` não compila: `Segmento` não tem esse valor e `lib/ilustracao.ts` é cópia byte a byte.**
- *Evidência (PRD):* `01-prd.md:1153` e `:1527` (`<SetupPage … segmento="Dados" />`); a seção 8.1 usa `Hero`, que também exige `segmento: Segmento` (`pdi-time/components/ui.tsx:225`).
- *Evidência (referência):* `pdi-time/lib/ilustracao.ts:6-14` define `Segmento = "RH" | "Marketing" | "Vendas" | "Financeiro" | "Atendimento" | "Estratégia" | "Gestão" | "Jurídico"`; o arquivo está na camada PRODUTO (`verificar-padrao.sh:80`), comparado byte a byte. `pdi-time/components/setup.tsx:48` tipa `segmento: Segmento`. Precedente: `voz-do-cliente/app/setup/page.tsx:8` tem área "Experiência do Cliente e Marketing" e usa `segmento="Marketing"`.
- *Impacto:* erro de tipo em `app/setup/page.tsx` e `app/page.tsx`; a única saída "legal" seria registrar `lib/ilustracao.ts` em `padrao-excecoes.json`, o que contraria o espírito do padrão por uma ilustração.
- *Correção:* o PRD mistura dois conceitos com o mesmo nome. **Segmento da paleta** (`tasks/paleta-segmentos.json`, texto livre) fica "Dados", como proposto. **`Segmento` de ilustração** (`lib/ilustracao.ts`) usa um valor existente: `segmento="Gestão"` em `SetupPage` e `Hero` (sem ilustração de pessoa, só `.blob-acento`, como `agente-kanban` e `reunioes-ia`). Registrar a distinção em 8.4 e no `CLAUDE.md` do app.

### Alta

**4. [alta] RF-06 a4 atribui ao `askJSON` um retry que ele não faz.**
- *Evidência (PRD):* `01-prd.md:231` ("Sobra menos de 3 componentes válidos → erro `resposta_invalida` (a chamada é repetida uma vez por `askJSON` antes disso)"); M3 em `01-prd.md:75` conta o "retry de `askJSON`".
- *Evidência (referência):* `pdi-time/lib/ai.ts:225-242`: a segunda tentativa só acontece quando `parseJSON` **lança**. Um JSON válido com 2 componentes, ou com 8 componentes de `tipo` inventado, volta na primeira chamada e o validador não tem a quem pedir de novo.
- *Impacto:* o caso mais comum de modelo gratuito (JSON bem formado, conteúdo fora do esquema) vira erro na tela sem nenhuma segunda chance, e a M3 mede a coisa errada.
- *Correção:* em RF-05/RF-06 e em `gerarPainel()` (7.2): "se `validarPainel()` sobrar menos de 5 componentes, `gerarPainel` chama `askJSON` **uma segunda vez** com o prompt do usuário acrescido de `\n\nA resposta anterior veio incompleta ou fora do formato. Devolva um painel completo, com 5 a 8 componentes válidos.`; se ainda sobrarem menos de 3, lança `new ErroIA("resposta_invalida", …, 502)`." Reescrever M3 como "taxa de painel com ≥ 5 componentes válidos na primeira chamada".

**5. [alta] A impressão perde as barras e a barra de meta, e a tabela cai no bug conhecido do `DataTable`.**
- *Evidência (PRD):* RF-14 a2 `01-prd.md:344-345` ("SVG e `div` imprimem"), 7.8 `01-prd.md:1517` (`break-inside: avoid` em cada cartão), 8.2 `01-prd.md:1602` (`GraficoBarras` em `div` puro com `bg-accent`), `:1604` (`TabelaPainel` embrulha `DataTable`).
- *Evidência (referência):* `pdi-time/app/globals.css:84-93` não define `print-color-adjust`; o Chrome não imprime cores de fundo por padrão, então uma barra feita de `div` com `bg-accent` sai **em branco** no PDF (SVG `fill`/`stroke` imprime). `pdi-time/CLAUDE.md` (limitação conhecida, US-020): na largura útil do A4 o `DataTable` cai no modo cartão (`pdi-time/components/ui.tsx:678`, `<table className="max-md:hidden …">`) e pagina uma linha por página; a causa não foi identificada. Numa célula de 2 colunas (≈ 320 px) uma tabela de 10 linhas × 6 colunas em modo cartão tem 60 pares rótulo/valor — o cartão fica mais alto que a página e `break-inside: avoid` o empurra inteiro para a página seguinte.
- *Impacto:* o PDF que a Persona C leva ao cliente sai sem ranking, sem barra de despesas e com a tabela quebrada — a jornada 10 falha.
- *Correção:* (a) 7.8/`globals.css` depois do marcador: `@media print { .print-sheet { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }` **e**, por segurança, desenhar as barras de `GraficoBarras` e a barra de meta como `<rect>` em SVG (mesma altura fixa); (b) `TabelaPainel` em `modo="impressao"` renderiza um `<table>` HTML próprio e simples (não o `DataTable`), ocupando a linha inteira da grade de impressão (`grid-column: 1 / -1`), respeitando as 10 linhas; (c) novo aceite RF-14 a5: "no PDF gerado pelo Chrome com as opções padrão (sem 'Gráficos de fundo'), barras, fatias e barra de meta estão visíveis e a tabela cabe em uma página".

**6. [alta] A captura automática do catálogo e o `?exemplo=1` dependem do gate — e o PRD não fixa os textos dos chips nem garante que passam.**
- *Evidência (PRD):* RF-02 `01-prd.md:167-176` não traz os oito textos (a1 "15 a 35 palavras e ≥ 4 indicadores" é inverificável sem eles); RF-03 `:180-186` diz que `?exemplo=1` "preenche com o prompt de Vendas e envia"; RF-04 a1/a2 `:196-197`; jornada passo 5 `:118-120` assume que o chip "reconhece termos suficientes".
- *Evidência (referência):* `.github/workflows/publicar.yml:110-121` captura `/?exemplo=1&captura=1` e usa a imagem no catálogo público; se o gate abrir o cartão de perguntas, a prévia publicada mostra um questionário, não um painel. Os textos da origem, que `02-funcionalidades-e-core.md` §2.9 chama de "reaproveitáveis palavra por palavra", violam o vocabulário da seção 8.5 do próprio PRD: `remix-…/src/components/chat/home-hero-chat.tsx:14-55` usa "Dashboard", "CAC, CPL, ROAS", "SLA", "throughput", "MRR, churn, runway", "headcount, turnover".
- *Impacto:* prévia errada no catálogo (irreversível até o próximo build), RF-02 não testável, e risco de "Dashboard" na tela.
- *Correção:* (a) RF-03 a4: "`?exemplo=1` **não** chama `/api/painel/esclarecer`; vai direto para `POST /api/painel`"; (b) listar os oito textos no RF-02 (proposta abaixo, todos com ≥ 3 termos da lista de domínio e sem sigla fora de NPS); (c) aceite RF-04 a8: "os oito prompts dos chips devolvem `false` em `precisaEsclarecerLocal()` (teste na Etapa 7)".

  Textos propostos (15–35 palavras, ≥ 4 indicadores nomeados):
  - **Vendas:** "Painel de vendas com receita do mês, ticket médio, taxa de conversão do funil, ranking de vendedores e tendência de receita nos últimos 6 meses."
  - **Financeiro:** "Painel financeiro com receita, despesas, margem líquida, fluxo de caixa mensal e distribuição de gastos por categoria."
  - **Marketing:** "Painel de marketing com custo por lead, custo de aquisição de cliente, retorno sobre anúncios, tráfego por canal nos últimos 6 meses e ranking de campanhas por conversão."
  - **Operações:** "Painel de operações com nível de serviço cumprido, tempo médio de atendimento, chamados resolvidos por dia, satisfação (NPS) e distribuição de chamados por tipo."
  - **SaaS:** "Painel de assinaturas com receita recorrente mensal, cancelamento, novos clientes, expansão de receita, meses de caixa e crescimento nos últimos 6 meses."
  - **E-commerce:** "Painel de loja virtual com receita, ticket médio, taxa de conversão, produtos mais vendidos, vendas por estado e tendência de vendas dia a dia."
  - **Agência:** "Painel de agência com receita por cliente, horas faturadas, ocupação da equipe, projetos em andamento e ranking de clientes por receita."
  - **RH:** "Painel de pessoas com número de colaboradores, rotatividade, satisfação interna, distribuição por área, contratações e desligamentos e tempo médio de contratação."

**7. [alta] O cache de 24 h impede "gerar outra versão" e devolve painéis já refinados.**
- *Evidência (PRD):* RF-12 `01-prd.md:311-322`; 7.3 `:1400-1416` (busca por `entrada.hash` em `listarPorTipo("painel", 50)`); RF-13 a2 `:330` e 7.2 `:1351` (`atualizarSaida(id, painel)` a cada refinamento).
- *Evidência (referência):* `pdi-time/lib/historico.ts:75-78`: `atualizarSaida` sobrescreve **só** `saida`; `entrada` (com o `hash`) e `criadoEm` ficam. Logo, um pedido idêntico nas 24 h seguintes recebe a `saida` **refinada** ("troquei por pizza, tirei a tabela") como se fosse a geração original.
- *Impacto:* dois problemas de produto: (1) o usuário que não gostou do painel e clica "Gerar painel" de novo recebe exatamente o mesmo — o comportamento mais frustrante possível numa ferramenta generativa, e o apresentador não consegue mostrar variação; (2) o cache serve um painel mutilado por refinamentos de outra sessão.
- *Correção:* (a) RF-12 a5: "o botão **'Gerar outra versão'** (visível no estado `pronto`) envia `forcar: true` e ignora o cache"; (b) RF-12 a6: "um painel refinado não serve de cache: `refinarPainel` grava `saida.refinadoEm = <ISO>` (campo opcional de `EspecPainel` que a IA nunca preenche, mesmo padrão de `PDI.acompanhamento` registrado no `CLAUDE.md` do `pdi-time`, US-070) e `lib/cache-painel.ts` ignora resultados com `refinadoEm`"; (c) acrescentar `refinadoEm?: string` em 5.1 com esse comentário.

**8. [alta] `maxTokens` só está definido para a geração; o refinamento devolve o painel inteiro com o padrão de 4.000.**
- *Evidência (PRD):* `01-prd.md:217`, `:606`, `:1272` (geração: 8.000). Nada em RF-09, em 7.2 `POST /api/painel/refinar` (`:1320-1351`), em 7.2 observações (`:1355-1360`) nem no gate (`:1044`).
- *Evidência (referência):* `pdi-time/lib/ai.ts:165` (`maxTokens = 4000` por padrão) e `:225-227` (`askJSON` só repassa o que recebe). O próprio PRD estima o painel completo em "~6 mil" tokens (`:606`, H9 `:1998`).
- *Impacto:* pela estimativa do próprio PRD, o refinamento trunca o JSON, `parseJSON` falha, `askJSON` repete (mais 4.000 tokens) e falha de novo — duas chamadas queimadas por pedido, e M6 impossível de cumprir.
- *Correção:* tabela 5.3 ganha três linhas: refinamento `maxTokens: 8000`; observações `1200`; esclarecimento `600`. Repetir os valores nas rotas de 7.2. Nota: a estimativa de "~6 mil" é generosa — um painel canônico (4 indicadores, duas séries de 6 pontos, rosca de 5, tabela 8×3) tem ~1.500 tokens; medir na Etapa 5 e registrar no `CLAUDE.md`.

### Média

**9. [média] Salvar, `guardar`, `Entregar` e Desfazer se contradizem; `/r/[id]` diverge da tela depois de um "Desfazer".**
- *Evidência (PRD):* jornada passo 10 `01-prd.md:129` ("'Salvar' grava no histórico"); RF-13 a1 `:329` (`guardar: true` salva); MCP `criar_painel` `:1483` (`guardar` padrão `true`); RF-10 `:287-295` (desfazer só em memória, "não chama a IA"); RF-13 a2 `:330` (cada refinamento grava com `atualizarSaida`).
- *Evidência (referência):* `pdi-time/lib/pdi.ts:31-34` (`idSalvo`: com `SENSIVEL = false` salva **sempre**, sem opt-in); `pdi-time/components/ui.tsx:743` (`Entregar` só oferece "Copiar link"/"Imprimir" quando há `id`). Sequência problemática: gerar → refinar (grava) → desfazer (não grava) → "Imprimir" abre `/imprimir/[id]` com a versão **refinada**, não a que está na tela.
- *Impacto:* o usuário imprime algo diferente do que vê; e um botão "Salvar" separado contraria o padrão da suíte para apps não sensíveis.
- *Correção:* (a) decidir: **salvar sempre na geração** (como `pdi-time`), `guardar` só existe para o MCP e vale `true` por padrão; remover "Salvar" da jornada e da fase `pronto`; (b) nova rota `PUT /api/painel/[id]` com corpo `{ painel }` (sem IA, passa por `validarPainel`, chama `atualizarSaida`), usada pelo Desfazer; RF-10 a4: "Desfazer persiste o estado restaurado no painel salvo"; (c) `Entregar` recebe o `id` desde a geração.

**10. [média] A heurística local conta substrings e pares singular/plural duas vezes, e deixa o caso "2 termos" sem esclarecimento.**
- *Evidência (PRD):* `01-prd.md:976-1003` (`texto.includes(termo)`; lista com `vendas`/`venda`, `cliente`/`clientes`, `lead`/`leads`, `produto`/`produtos`, `custo`/`custos`, `meta`/`metas`, `indicador`/`indicadores`, `ano`…; `return acertos < 2`); RF-04 a1/a2 `:196-197`; texto do RF-04 `:192-194` ("só no caso duvidoso a IA é consultada").
- *Evidência (referência):* a origem tem a mesma falha (`remix-…/src/lib/ai/clarify.ts:62-84`), o PRD a herdou e ampliou a lista. Exemplos: "painel de vendas para minha empresa" (35 caracteres) → `venda` + `vendas` = 2 acertos → `2 < 2` é falso → **não** esclarece, embora seja exatamente o pedido vago que o gate existe para pegar; "plano de RH" casa `ano` (em "plano") e `rh`; "humanos" casa `ano`.
- *Impacto:* o gate quase nunca dispara acima de 30 caracteres, e a sacada 2.4 do core fica só no papel; RF-04 a1 ("sempre vai para esclarecimento") também está errado, porque a IA pode responder `precisaEsclarecer: false`.
- *Correção:* em 6.3: normalizar (minúsculas, sem acento), tokenizar por palavra, mapear cada token ao **radical** de uma lista (`vend`, `receit`, `client`, `lead`, `convers`, `funil`, `campanh`, `estoqu`, `projet`, `caix`, `despes`, `cust`, `assinatur`, `cancelament`, `churn`, `colaborador`, `rotatividad`, `atendiment`, `chamad`, `satisfac`, `nps`, `meta`, `indicador`, `mensal`, `semanal`, `diari`, `trimestr`, `regi`, `estad`, `loj`, `vendedor`, `equip`…) e contar **radicais distintos**. Regra: < 30 caracteres ou < 3 radicais distintos → consultar a IA (em demonstração, as perguntas fixas); ≥ 3 → gerar direto. Reescrever a1 como "vai para avaliação (a IA decide se pergunta)". Acrescentar o teste dos oito chips (achado 6).

**11. [média] Inconsistências internas entre tipos e prompts que confundem o modelo.**
- *Evidência (PRD):* (a) "Os seis tipos" `01-prd.md:434` e "são estes SEIS e mais nenhum" `:678` seguidos de **sete** nomes, e "fora dos sete nomes listados" `:798`; RF-08 a1 `:257` fala em seis renderizadores. (b) `componentesAlterados` documentado como `"NOVO" para os acrescentados` em `:556`, mas o prompt exige o id do componente novo (`:871`). (c) Exemplo de `linha` com 2 pontos (`:706-716`) contra a regra de 6 pontos (`:783`) — modelos pequenos copiam o exemplo. (d) Regra 8 do refinamento (`:841`, "indicadores na linha 0 com largura 1") contra o exemplo de comportamento (`:845`, "ou na primeira linha com espaço").
- *Impacto:* cada contradição é uma fonte de variância no modelo gratuito — o oposto do que a seção 6 quer.
- *Correção:* (a) "sete tipos, sendo `pizza` e `rosca` duas apresentações da mesma distribuição" em 5.1, 6.1 e RF-08 a1 ("seis renderizadores para sete tipos"); (b) apagar `"NOVO"` do comentário em 5.1 e do `validarRefinamento` (a lógica já trata id novo como acréscimo); (c) exemplo de `linha` com 6 pontos (Jan–Jun); (d) regra 8: "indicador acrescentado vai para a linha 0 se houver coluna livre; senão, para a última linha, com largura 1".

**12. [média] `validarRefinamento` tem lacunas que o próprio validador de composição transforma em mudanças não pedidas.**
- *Evidência (PRD):* `01-prd.md:936-968`: `igual()` é usada (`:944`, `:952`) mas nunca definida; componente sumido é `push`ado no fim (`:962`) e depois o RF-06 a6 (`:235`) reempacota a grade "da esquerda para a direita" — o componente restaurado e os vizinhos podem trocar de linha/coluna; um id renomeado pela IA (c3 → c9 com o mesmo conteúdo) é aceito como novo **e** o c3 é restaurado → conteúdo duplicado.
- *Evidência (referência):* `remix-…/src/lib/ai/refine-dashboard.ts:76-136` usa `deepEqual` e não restaura removidos; o PRD acrescentou a restauração (bom) sem tratar posição.
- *Impacto:* M5 ("componente não pedido volta idêntico", `:77`) falha na posição, que é parte do componente; duplicatas visíveis.
- *Correção:* em 6.2: definir `igual(a, b) = JSON.stringify(ordenarChaves(a)) === JSON.stringify(ordenarChaves(b))`; antes de aceitar um id desconhecido, se ele for `igual` (ignorando `id` e `posicao`) a um original ausente no refinado, tratar como **renome** e devolver o original; ao restaurar sumidos, reinserir no **índice original**; o reempacotamento do RF-06 a6 só move componentes cujo id está em `componentesAlterados` ou é novo — os demais mantêm `posicao` do original.

**13. [média] `DemoNotice` não existe em `components/ui.tsx`.**
- *Evidência (PRD):* RF-16 a2 `01-prd.md:366`.
- *Evidência (referência):* `grep -n DemoNotice pdi-time/components/ui.tsx` → nada; a lista de exports (`ui.tsx:12-842`) não o tem. O `PADRAO.md:25,28,52` ainda cita o nome (documento desatualizado nesse ponto). Hoje a frase de demonstração vive no popover do chip da `Topbar` (`ui.tsx:78` "Modo demonstração · conectar", `:115-123` com `resumo` e o link "Conectar a IA em 1 minuto").
- *Impacto:* o implementador procura um componente inexistente ou cria um duplicado.
- *Correção:* RF-16 a2 → "a `Topbar` recebe `resumo="Painel de exemplo, sem usar IA. Conecte a IA para gerar a partir do seu pedido."` e o popover do chip mostra o link 'Conectar a IA em 1 minuto'". Sugerir, fora deste PRD, corrigir o `PADRAO.md`.

**14. [média] Datas `AAAA-MM-DD` na tabela caem no bug de fuso registrado no `CLAUDE.md`.**
- *Evidência (PRD):* `ColunaTabela.tipo: "data"` `01-prd.md:497`; exemplo `"fechamento": "2026-07-15"` `:764-767`; regra "Datas sempre no formato AAAA-MM-DD" `:791`; `TabelaPainel` formata "por tipo de coluna" `:1604`.
- *Evidência (referência):* `pdi-time/lib/formato.ts:10` faz `new Date(string)`; `pdi-time/CLAUDE.md` (US-070): string sem hora é meia-noite **UTC** e num fuso negativo mostra o dia anterior; a correção é `new Date(\`${aaaa-mm-dd}T00:00:00\`)`.
- *Impacto:* toda data de tabela sai um dia errada no Brasil.
- *Correção:* 8.3/`TabelaPainel`: "coluna `data`: `data(new Date(\`${valor}T00:00:00\`))`; valor que não casar `/^\d{4}-\d{2}-\d{2}$/` é exibido como texto". Novo aceite RF-08 a7.

**15. [média] A técnica do `GraficoSerie` é contraditória e não funciona em Server Component.**
- *Evidência (PRD):* `01-prd.md:1601` ("SVG com `viewBox` de largura fixa e altura fixa em px (nunca escalado)") e `:1607` ("altura fixa em px, nunca dentro de um `viewBox` escalado"). O cartão varia de ~300 px (celular) a ~640 px (largura 2 no desktop) e `/r/[id]` e `/imprimir/[id]` são Server Components (`pdi-time/app/r/[id]/page.tsx:8`) — não há `ResizeObserver`/`useLayoutEffect` para medir a largura.
- *Evidência (referência):* o molde `financas-ia/components/GraficoMeses.tsx:37-96` resolve isso com grade CSS (`minmax(0,1fr)`) e **nenhum SVG**; um SVG com largura fixa em `viewBox` ou estoura o cartão, ou escala o texto junto.
- *Impacto:* rótulos ilegíveis ou linha cortada — exatamente a armadilha que o PRD diz evitar.
- *Correção:* em 8.2: "o SVG contém **só geometria** (`polyline`/`path` da série, linhas de grade), com `width="100%"`, `height={ALTURA}` fixa, `viewBox="0 0 100 ALTURA"`, `preserveAspectRatio="none"` e `vector-effect="non-scaling-stroke"` no traço; eixo Y (3 marcas), rótulos do eixo X e valor do último ponto ficam em HTML, numa grade `minmax(0,1fr)` alinhada ao SVG, como em `GraficoMeses.tsx`. Sem `<circle>` por ponto (deformaria com `preserveAspectRatio="none"`); a leitura ponto a ponto vai no `<p className="sr-only">` e no `title` da coluna".

**16. [média] Rosca com até 8 fatias diferenciadas só por opacidade (100 % → 40 %) é ilegível.**
- *Evidência (PRD):* `01-prd.md:483`, `:786`, RF-06 a7 `:236` (até 8 fatias); `:1603` ("variam a opacidade … de 100 % a 40 % em degraus iguais").
- *Análise:* 8 fatias → 7 degraus de ~8,6 pontos de opacidade; fatias vizinhas ficam indistinguíveis, e a legenda ao lado herda o problema. Em impressão, opacidade em SVG imprime, mas a distinção some no preto e branco.
- *Impacto:* o componente mais caro da v1 (P5) nasce com o defeito visual mais visível.
- *Correção:* limitar a **6 fatias** em 5.1, 5.3, 6.1 e RF-06 a7 (o validador agrupa o excedente em "Outros", somando); degraus de opacidade ≥ 12 pontos (100/88/76/64/52/40); legenda com rótulo, valor formatado e percentual; a maior fatia começa em `--color-accent` cheio. Manter o `sr-only` já previsto.

**17. [média] Nenhum lado tem tempo limite: uma chamada travada no modelo gratuito trava a tela.**
- *Evidência (PRD):* M2/M6 (`01-prd.md:74`, `:78`) fixam p90, mas não há aceite para o caso de a resposta nunca chegar; 7.5 não trata.
- *Evidência (referência):* `pdi-time/lib/ai.ts:102-121` (`fetch` sem `AbortController`/`signal`; arquivo INFRA, não pode mudar). A origem tinha `API_TIMEOUT_MS = 30_000` (`remix-…/src/lib/ai/detect-anomalies.ts:5`).
- *Impacto:* `Loading` fica parado na última etapa indefinidamente (o intervalo de `ui.tsx:341-356` para em 3,6 s).
- *Correção:* RF-05 a6 / RF-09 a9: "o cliente envia com `AbortController` (120 s na geração, 90 s no refinamento, 45 s nas observações); ao estourar, mostra `ErrorBox` com 'A IA demorou demais para responder. Tente de novo ou troque o modelo em Configurações.' e o botão de tentar de novo". Em RF-07, a quarta etapa deve ser a frase de espera longa ("Gerando números de exemplo… com modelo gratuito isso pode levar até um minuto"), porque é nela que a tela vai ficar.

### Baixa

**18. [baixa] `components/Rotinas.tsx` removido em 7.1, mas 7.7 diz que "o `/setup` mostra o cartão vazio".**
- *Evidência:* `01-prd.md:1186` contra `:1493-1506`. Precedente: `videos-campanha` (sem capacidade `rotina`) não tem `components/Rotinas.tsx` e o `/setup` não mostra o cartão.
- *Correção:* manter a remoção e corrigir 7.7: "o cartão 'Rotinas' não é renderizado em `/setup`; a infraestrutura (`lib/rotinas.ts`, `app/api/rotinas`, `instrumentation.ts`) fica copiada e ociosa". `lib/notificacoes-do-app.ts` pode sair: só `lib/status-do-app.ts`, `lib/pdi.ts` e `app/api/pdi/checkins/route.ts` o importam no `pdi-time`, todos próprios.

**19. [baixa] Classes Tailwind dinâmicas não são geradas.**
- *Evidência:* `01-prd.md:578` ("`largura` vira `lg:col-span-{1..4}`"). No Tailwind 4 só classes escritas literalmente no código entram no CSS; `` `lg:col-span-${n}` `` não gera nada.
- *Correção:* 5.2: "mapa estático `LARGURA_CLASSE: Record<1|2|3|4, string> = { 1: "lg:col-span-1 md:col-span-1", 2: "lg:col-span-2 md:col-span-2", 3: "lg:col-span-3 md:col-span-2", 4: "lg:col-span-4 md:col-span-2" }`".

**20. [baixa] Pequenas imprecisões que custam uma ida e volta ao implementador.**
- M4 exige "5 a 8 componentes, 100 %" (`01-prd.md:76`) enquanto o validador aceita 3–4 (`:231`); alinhar M4 ao achado 4 (≥ 5 depois da segunda tentativa).
- RF-05 a3 (`:216`, `{ demo, painel, meta, id? }`) omite `reaproveitado` que 7.2 devolve (`:1262`).
- O botão do `ErrorBox` chama-se "Tentar de novo" (`pdi-time/components/ui.tsx:423`), não "Tentar novamente" (`:220`, `:1468`, `:1571`); e o `ErrorBox` não tem slot para o pedido em itálico — renderizar `<p className="italic text-muted">` **acima** dele.
- `Passos` exige `{ titulo, apoio }` (`ui.tsx:244-248`); `:1585` lista só títulos — acrescentar os três `apoio` (≤ 6 palavras).
- `scripts/verificar-padrao.sh` é bash, não Node (`:1837` "`node scripts/verificar-padrao.sh`").
- Citações desalinhadas: a regra do MCP está em `PADRAO.md:78` (não `:79`, `:1489`); a fórmula do `acento2` em `PADRAO.md:34` (não `:35`, `:1689`).
- 5.2 (`:590`): "componente com `linha > 3` é movido para a última linha com espaço" não define o que fazer quando não há espaço — dizer que o limite de 4 linhas é alvo do prompt, e que o validador **acrescenta linhas** em vez de descartar.
- `listar_paineis` (`:1485`) deve filtrar `tipo === "painel"` (`listar()` de `historico.ts:81` devolve todos os tipos).
- 7.6 não mostra o esqueleto de `FERRAMENTAS` — incluir um item no formato de `pdi-time/lib/ferramentas.ts:9-33` (`schema` JSON Schema com `required`, `executar` validando argumentos e lançando `Error` com frase em português).
- `Loading` respeita `prefers-reduced-motion` e fica na primeira etapa (`ui.tsx:345`); a primeira frase precisa fazer sentido sozinha.

**21. [baixa] Remover os `ARG`/`ENV` de Google/Microsoft do `Dockerfile` é divergência sem ganho.**
- *Evidência:* `01-prd.md:1805`, `:1831`. O workflow passa os quatro `build-args` para **todos** os apps (`.github/workflows/publicar.yml:85-89`); o `buildx` só avisa sobre argumento não consumido. `lib/email-envio.ts` (INFRA) lê `process.env.GOOGLE_CLIENT_ID_APP` (`pdi-time/lib/email-envio.ts:31`) e sem valor esconde os botões — comportamento correto e já testado.
- *Correção:* `Dockerfile` [PRÓPRIO] cópia idêntica; `.env.example` idem, só trocando o comentário da porta. Menos arquivos diferentes do `pdi-time` = menos manutenção.

---

## Verificações que passaram

Para a Fase 5 não mexer no que está certo:

- **`lib/historico.ts`**: `atualizarSaida(id, saida)` existe (`pdi-time/lib/historico.ts:75-78`), `tipo` é coluna e campo (`:20`, `:36`), `listarPorTipo<E,S,M>(tipo, limite = 50)` existe (`:89-94`), `salvar` aceita `resumo` e `expiraEmDias` (`:59`), `listar(10)` devolve só os campos leves (`:81-86`). O modelo de dados da seção 7.3 está correto.
- **`Loading({ etapas })`** existe e avança a cada 1.200 ms (`pdi-time/components/ui.tsx:341-369`).
- **`askJSON`**: acrescenta a instrução de JSON estrito, usa `temperature: 0.2`, repete uma vez **no erro de parse**, lança `resposta_invalida` (`pdi-time/lib/ai.ts:225-242`); `parseJSON` tira cercas e recorta do primeiro `{` (`:244-253`). A nota de implementação da seção 6 está correta (só o RF-06 a4 extrapola — achado 4).
- **`ErroIA`/`respostaErro`/`interpretarFalha`**: códigos e mensagens conferem (`ai.ts:18-100`); o atalho `?erro=sem_credito` existe no `pdi-time` (`app/api/pdi/route.ts:16-18`); `meta()` tem a forma `{ demo, model, geradoEm, insumo }` (`ai.ts:154-160`).
- **Porta 3020** está livre: as 19 portas vão de 3001 a 3019 (`catalogo.json`, `README.md:53-62`, `docker-compose.yml:146`).
- **Paleta**: recalculado com as fórmulas de `scripts/verificar-paleta.mjs:39-61,127-139`: HSL `[28, 85, 35]` → `#a5540d`; `acento2` `#edb90c`; `soft` `#f9efe7`; `ink` `#5e3008`; contraste contra branco **5,42** (regra ≥ 4,5); ΔE mínimo **48,3** contra `clone-site` (regra ≥ 10 entre segmentos). A entrada proposta em 8.4 passa nas regras 2–6; a regra 1 exige que `catalogo.json` e `tasks/paleta-segmentos.json` sejam alterados **juntos** (o PRD prevê, Etapa 1).
- **Entrada em `catalogo.json`** (9.2): tem todos os campos que `scripts/gerar-deploy.mjs:72-85` valida (`captura` string, `demo` `null`, `capacidades` válidas) e a mesma forma das 19 entradas existentes; "Dados" já é uma área do catálogo (`automl-pocket`), então não cria filtro novo.
- **MCP**: `Ferramenta = { nome, descricao, schema, executar }` (`pdi-time/lib/mcp.ts:8-13`); `NOME_SERVIDOR` mora em `lib/ferramentas.ts` (`:7`) e `app/mcp/route.ts` o importa (`:1`); o resultado de `executar` é serializado como texto JSON (`mcp.ts:108`), então devolver objetos com `painel` e `link` funciona. `enderecoPublico()` existe (`pdi-time/lib/setup-comum.ts:145-150`) e a regra do jargão sobre `http://localhost:3000` em `lib/*.ts` está certa (`scripts/verificar-jargao.mjs:57-93`).
- **`/setup`**: `openrouter({ beneficio })` existe (`setup-comum.ts:212-217`); `statusExtra()` e `TIPOS_ROTINA` têm as assinaturas que o PRD usa (`pdi-time/lib/status-do-app.ts`, `lib/rotinas-do-app.ts:11`); `instrumentation.ts:9` importa `@/lib/rotinas-do-app`, então o arquivo precisa existir — o PRD o mantém.
- **`components/ui.tsx`**: `useConfirmacao`, `Aviso` (com `acao`), `SeloIA` ("Exemplo, sem usar IA", `ui.tsx:537-546`), `Origem`, `Entregar`, `lerErro`, `Hero`, `Passos`, `ResultHead`, `DataTable`, `CopyButton`, `useScrollToResult`, `Empty`, `Stage`, `Workspace` — todos existem com os nomes usados no PRD.
- **`?exemplo=1` sem `clearTimeout`** (RF-03 a2) bate com `PADRAO.md:30` e com `pdi-time/app/page.tsx:249-262`.
- **`verificar-jargao.mjs`**: a descrição da seção 8.5 está correta (termos em `:14-25`; `components/*.tsx` exceto `setup.tsx` em `:45-55`; isenção de `fetch(...)` por linha em `:40`; identificadores **não** são filtrados). Os quatro prompts e o vocabulário de tela estão em PT-BR e sem os termos proibidos; o prompt de observações da origem está mesmo em inglês (`remix-…/src/lib/ai/detect-anomalies.ts:18`) e a tradução está completa.
- **H3 (grade de 4 colunas)**: a origem pede `col 0,1,2,3` na linha 0 (`remix-…/src/lib/ai/prompts.ts:175`) — a correção do PRD é legítima.
- **Impressão**: `.print-sheet`, `.no-print` e `@page folha-impressao` existem (`pdi-time/app/globals.css:84-93`); `globals.css` é comparado ignorando as quatro cores de acento (`verificar-padrao.sh:125`), então trocar só as quatro linhas é seguro.
- **Estrutura obrigatória**: `app/historico`, `app/r/[id]` (+ `not-found`), `app/imprimir/[id]` (+ `not-found`), `app/conta`, `app/entrar` (`verificar-padrao.sh:92-100`) — o PRD mantém todos. `app/api/f/[token]/route.ts` é próprio de cada app (comentário em `pdi-time/app/api/f/[token]/route.ts:1-5`), como o PRD diz.
- **Armadilhas do `CLAUDE.md` respeitadas no PRD**: módulos lidos pelo cliente sem `node:*` (7.1, nota final); `react-hooks/exhaustive-deps` (Etapa 6); `--force-prefers-reduced-motion` (8.6); limitação do `DataTable` em A4 reconhecida (RF-14 a4 — embora subestimada, achado 5); "token" fora de `components/*.tsx` (8.5); `Rotinas` fora do seletor genérico (7.7).
- **Core entregue**: as 15 sacadas de `02-funcionalidades-e-core.md` §2 têm um RF correspondente (2.1–2.3, 2.10, 2.11 → RF-05/6.1; 2.4 → RF-04; 2.5 → RF-07; 2.6, 2.7 → RF-09/6.2; 2.8 → RF-12; 2.9 → RF-02; 2.12 → RF-11; 2.13 → 8.3; 2.14 → 7.5; 2.15 → 8.1). Nada do que um usuário sentiria falta na v1 foi cortado; o que saiu (arrastar, período, link público, Excel) está justificado no core. Nada incluído é peso morto: o MCP e o cache são baratos porque reaproveitam infraestrutura.

---

## Respostas recomendadas para P1–P6

**P1 — Id e nome.** Manter o id `toolkit-dash-builder` (o custo de mudar é alto e o id não aparece na tela). Nome de exibição: **"Painel em Minutos"** é aceitável e já está consistente no PRD inteiro. **Sinalizado como a única decisão humana pendente**, com um alerta concreto: o catálogo já tem **"Posts em Minutos"** (`catalogo.json:76`, `posts-sociais`); dois apps "X em Minutos" lado a lado podem soar como uma família que não existe. Alternativa sem esse ruído, se o time preferir: **"Painel Pronto"** (`marca="P"` continua valendo). Recomendação para seguir: "Painel em Minutos", confirmar com o time antes do primeiro push.

**P2 — Áreas e fronteira com `financas-ia`.** Aprovar `["Dados", "Gestão"]` e os textos de 9.2 como estão. "Dados" já existe como área (`automl-pocket`), então não cria filtro novo, e o `problema` escrito pela pergunta ("não sabe quais indicadores pedir") separa bem do `financas-ia` ("tenho a planilha"). Sem mudança.

**P3 — Segmento "Dados" na paleta.** Aprovar. `scripts/verificar-paleta.mjs` não tem lista fixa de segmentos — só exige ΔE ≥ 10 contra os outros segmentos, e o acento tem 48,3. A objeção real não é a paleta, é o tipo `Segmento` de ilustração (achado 3): o PRD deve deixar explícito que são dois conceitos, e usar `segmento="Gestão"` nos componentes.

**P4 — A tela "pronto" em largura total cabe na regra de tela única?** Sim, sem `"independente": true`. O padrão exige uma tela e nenhum destino novo na `Topbar` (`PADRAO.md:28-29`); ele **não** compara `app/page.tsx` (`verificar-padrao.sh:76-84` só confere `ui.tsx`, `setup.tsx`, `conta.tsx`, `navegacao.ts`, `ilustracao.ts`, `globals.css`, ícones). Precedente: `financas-ia/app/page.tsx:349` já usa um `<main className="grid lg:grid-cols-2 …">` próprio no lugar de `Workspace`, sem ser independente. Decisão: manter `Workspace`/`Panel`/`Stage` nas fases `vazio`, `esclarecendo`, `carregando` e `erro`, e um `<main>` próprio de largura total na fase `pronto`. Registrar a decisão no `CLAUDE.md` do app.

**P5 — `pizza`/`rosca` na v1?** Sim. Com `stroke-dasharray` em `<circle>` são ~60 linhas, e cortar custaria mais: os quatro painéis de demonstração, o layout canônico (linha 2) e o prompt teriam de mudar. Condições (achado 16): máximo de 6 fatias, degraus de opacidade ≥ 12 pontos, legenda com valor e percentual. Continua sendo o último da ordem de implementação; se cair, cai junto com a mudança do prompt, nunca só o componente.

**P6 — Persistência no Render.** Plano `free`, sem `persistencia`, na v1. Dezesseis dos dezenove apps estão assim; o valor deste app é regenerável (painel em 30 s, sem dado do usuário), e o modo demonstração cobre a instância pública que perdeu a chave. Registrar no `README.md` do app a frase padrão do gerador ("No plano free o disco é efêmero…", `scripts/gerar-deploy.mjs:148-149`). Reavaliar junto com a fonte de dados real da v2, quando houver algo a perder.

---

## Lista de mudanças para a Fase 5

Executáveis mecanicamente sobre `01-prd.md`; o número entre colchetes é o achado.

**Seção 7.1 (árvore) e Etapa 1**
- [ ] [1] `app/api/setup/**` → "[INFRA] cópia sem alterar, inclusive `oauth/google`, `oauth/microsoft`, `oauth/mcp`"; apagar "REMOVER as pastas…" e a frase equivalente da Etapa 1.
- [ ] [2] `package.json` → "[PRÓPRIO] só o `name` muda"; apagar "REMOVER nodemailer" (7.1 e Etapa 1).
- [ ] [21] `Dockerfile` e `.env.example` → cópia idêntica do `pdi-time` (só o comentário da porta muda no `docker-compose.yml`); apagar as menções a tirar `ARG`/`ENV` (7.1, 9.5, Etapa 1).
- [ ] [18] 7.7: "o cartão Rotinas não é renderizado em `/setup`"; manter a remoção de `components/Rotinas.tsx`.
- [ ] [20] Etapa 1: `scripts/verificar-padrao.sh` (bash), não `node …`.

**Seções 7.9, 8.1 e 8.4 (segmento)**
- [ ] [3] `segmento="Gestão"` em `SetupPage` (7.9, linhas 1153 e 1527) e em `Hero` (8.1); parágrafo em 8.4 explicando "segmento da paleta = Dados; `Segmento` de ilustração = Gestão (sem ilustração de pessoa)".

**Seção 5 (esquema e limites)**
- [ ] [11] Comentário de `TipoComponente`: "sete tipos (pizza e rosca são duas apresentações da distribuição)".
- [ ] [11] Apagar `"NOVO"` do comentário de `componentesAlterados`.
- [ ] [7] Acrescentar `refinadoEm?: string` a `EspecPainel` com o comentário "preenchido só por `refinarPainel`; nunca pela IA; exclui o painel do cache".
- [ ] [16] Fatias: 3 a **6** (5.1, 5.3, RF-06 a7, 6.1 e 6.2).
- [ ] [8] Tabela 5.3: `maxTokens` do refinamento 8.000, das observações 1.200, do esclarecimento 600.
- [ ] [19] 5.2: mapa estático de classes de largura.
- [ ] [20] 5.2: o validador acrescenta linhas quando não há espaço; 4 linhas é alvo do prompt.

**Seção 6 (prompts e validadores)**
- [ ] [11] 6.1: "são estes SETE" e exemplo de `linha` com 6 pontos (Jan–Jun).
- [ ] [11] 6.2 regra 8: destino do indicador acrescentado sem coluna livre na linha 0.
- [ ] [12] 6.2 `validarRefinamento`: definir `igual`; tratar renome de id; reinserir sumidos no índice original; reempacotamento só de componentes declarados/novos (refletir também em RF-06 a6 e RF-09 a1).
- [ ] [10] 6.3: heurística por radicais distintos com fronteira de palavra; regra "< 30 caracteres ou < 3 radicais → IA; ≥ 3 → gera"; RF-04 a1 vira "vai para avaliação"; novo aceite a8 com os oito chips.

**Seção 4 (requisitos)**
- [ ] [6] RF-02: incluir os oito textos dos chips (proposta no achado 6).
- [ ] [6] RF-03 a4: `?exemplo=1` não passa pelo gate.
- [ ] [4] RF-05/RF-06 a4: segunda chamada própria de `gerarPainel` quando sobram < 5 componentes; erro só abaixo de 3.
- [ ] [17] RF-05 a6 / RF-09 a9 / RF-11: `AbortController` no cliente (120/90/45 s) com mensagem; RF-07: quarta etapa é a frase de espera longa.
- [ ] [20] RF-05 a3: incluir `reaproveitado`.
- [ ] [9] RF-10 a4: Desfazer persiste via `PUT /api/painel/[id]`; RF-13 a1: salvar sempre na geração (`guardar` só no MCP); jornada passo 10 sem "Salvar".
- [ ] [7] RF-12 a5 ("Gerar outra versão" com `forcar: true`) e a6 (painel com `refinadoEm` não serve de cache).
- [ ] [5] RF-14 a5: barras/fatias/meta visíveis no PDF padrão do Chrome; tabela em uma página.
- [ ] [14] RF-08 a7: datas `AAAA-MM-DD` em `TabelaPainel` via `new Date(\`${v}T00:00:00\`)`.
- [ ] [13] RF-16 a2: `Topbar resumo=…` no lugar de `DemoNotice`.
- [ ] [20] "Tentar novamente" → "Tentar de novo" (RF-05 a5, 7.5, 8.1); pedido em itálico renderizado acima do `ErrorBox`.

**Seção 7.2 (rotas)**
- [ ] [9] Nova rota `PUT /api/painel/[id]` (`{ painel }`, sem IA, `validarPainel` + `atualizarSaida`).
- [ ] [7] `POST /api/painel` aceita `forcar?: boolean`.
- [ ] [8] `maxTokens` explícito em refinar, observações e esclarecer.
- [ ] [4] `gerarPainel()` descrito com a segunda tentativa.

**Seção 7.6 (MCP)**
- [ ] [20] Esqueleto de `FERRAMENTAS` no formato de `pdi-time/lib/ferramentas.ts`; `listar_paineis` filtra `tipo === "painel"`.

**Seções 7.8 e 8.2 (impressão e gráficos)**
- [ ] [5] 7.8: `print-color-adjust: exact` no bloco específico; `TabelaPainel` em modo impressão usa `<table>` próprio ocupando a linha inteira; barras e barra de meta como `<rect>` SVG.
- [ ] [15] 8.2 `GraficoSerie`: SVG só com geometria (`preserveAspectRatio="none"`, `vector-effect="non-scaling-stroke"`), texto em HTML, sem `<circle>` por ponto.
- [ ] [16] 8.2 `GraficoRosca`: 6 fatias, degraus ≥ 12 pontos, legenda com valor e percentual.
- [ ] [20] 8.1: `Passos` com `apoio` em cada item.

**Seções 2 e 11**
- [ ] [4][20] M3 e M4 reescritas (≥ 5 componentes válidos; taxa na primeira chamada).
- [ ] P1–P6: fechar com as respostas acima; manter só P1 como "confirmar nome com o time", com o alerta sobre "Posts em Minutos".
- [ ] [20] Corrigir `PADRAO.md:79` → `:78` e `PADRAO.md:35` → `:34`.
- [ ] Hipóteses: acrescentar H14 "salvar sempre na geração", H15 "`segmento="Gestão"` na ilustração", H16 "6 fatias no máximo".

**Fora do PRD (sugestões, não bloqueiam)**
- `PADRAO.md:25,28,52` ainda cita `DemoNotice`, que não existe em `ui.tsx` — atualizar o documento da suíte.
- `docker-compose.yml:2` da raiz diz "3001 a 3018" (está em 3019, vai a 3020) — corrigir ao acrescentar o serviço.
