# Fase 2 — Funcionalidades e core validado

Documento de recorte do produto: o que o projeto de origem (Lovable, "AI Dash Builder") faz, o que
vale a pena trazer, o que não vem, e como o produto se transforma ao virar `toolkit-dash-builder`,
o vigésimo app da suíte `StartSe/ai-action-demo`.

Base de evidências: [`00-analise-projeto-original.md`](00-analise-projeto-original.md) (análise da
Fase 1, com caminhos de arquivo e prompts na íntegra). Padrão de destino:
[`PADRAO.md`](../../PADRAO.md), app de referência [`pdi-time/`](../../pdi-time/).

---

## 1. Funcionalidades do projeto original

Veredito: **core** (é o produto, tem de existir na v1), **útil** (bom, mas cabe na v2 ou depende de
uma decisão em aberto), **descartar** (não entra, nem depois, na forma em que existe hoje).

| # | Funcionalidade | Onde vive na origem | Veredito | Motivo |
|---|---|---|---|---|
| 1 | Geração do dashboard a partir de um prompt em linguagem natural | `src/routes/api/generate.ts:42-368`, `src/lib/ai/generate-dashboard.ts:45-83`, `src/lib/ai/prompts.ts:114-218` | **core** | É o produto inteiro. Sem isso não há app: "descreva o painel e a IA decide os indicadores". |
| 2 | Prompt de sistema com detecção de domínio e KPIs canônicos por setor | `src/lib/ai/prompts.ts:114-160` | **core** | A parte mais valiosa e mais cara de reescrever. Transforma "dashboard de vendas" em métricas que um analista escolheria. |
| 3 | Regras de composição de layout dentro do prompt | `src/lib/ai/prompts.ts:170-180` | **core** | Faz a IA devolver um layout que já parece profissional, sem motor de layout no código. |
| 4 | Regras rígidas de realismo dos dados fictícios (escala de PME brasileira, nomes e cidades BR) | `src/lib/ai/prompts.ts:182-195` | **core** | É exatamente o que o modo demonstração obrigatório da suíte precisa: dado de exemplo plausível e em português. |
| 5 | Lista de anti-padrões ("NUNCA FAÇA") | `src/lib/ai/prompts.ts:210-218` | **core** | Reduz a variância de modelos fracos — e a suíte roda modelo gratuito por padrão. |
| 6 | Gate de esclarecimento com heurística local antes de chamar a IA | `src/lib/ai/clarify.ts:62-190`, UI em `src/components/dashboard/dashboard-clarify.tsx` | **core** | Economiza chamada, melhora o resultado de prompt vago e cabe em uma tela só. Sempre com "pular e gerar agora". |
| 7 | Chips de resposta sugerida nas perguntas de esclarecimento | `src/lib/ai/clarify.ts` (tool schema, `suggestions`) | **core** | Responder por clique em vez de digitar é o que faz o gate não virar burocracia. |
| 8 | Tela de "gerando" com etapas por tempo decorrido | `src/components/dashboard/dashboard-generating.tsx:22-295` | **core** | A suíte já tem `Loading({etapas})` em `components/ui.tsx`: a sacada entra de graça. |
| 9 | Refinamento por chat ("edição cirúrgica") | `src/hooks/use-chat.ts:49-135`, `src/routes/api/refine.ts`, `src/lib/ai/prompts.ts:230-291` | **core** | É o que diferencia de um gerador de uma tacada só: o painel vira conversa. |
| 10 | Validação anti-deriva com `modifiedComponentIds` | `src/lib/ai/refine-dashboard.ts:76-136` | **core** | Sem isso, cada pedido de ajuste estraga o resto do painel. É a diferença entre confiável e inútil. |
| 11 | Resumo estruturado do dashboard no prompt de refinamento | `src/lib/ai/prompts.ts:8-27` | **core** | Evita que o modelo se perca no JSON cru. Barato e eficaz. |
| 12 | Cache de geração por hash do prompt (24 h) | `src/lib/ai/generate-dashboard.ts:162-168`, `src/routes/api/generate.ts:166-198` | **core** | Com modelo gratuito e limite diário do OpenRouter, repetir prompt sem queimar cota importa. |
| 13 | Chips de sugestão por área na home (8 áreas, prompt completo por chip) | `src/components/chat/home-hero-chat.tsx:14-55` | **core** | É o "Preencher com um exemplo" que o `PADRAO.md` exige, multiplicado por área. Textos reaproveitáveis palavra por palavra. |
| 14 | Renderização dos componentes (KPI, linha, barra, pizza/rosca, área, tabela) | `src/components/dashboard/chart-wrapper.tsx`, `kpi-card.tsx`, `component-registry.tsx` | **core** (reescrito) | O desenho é core; a implementação (Recharts, tema escuro fixo) não vem. |
| 15 | Formatação `pt-BR` de valor e variação no KPI | `src/components/dashboard/kpi-card.tsx:14-37` | **core** | `Intl.NumberFormat("pt-BR")` com `currency`/`percent`/`number`, e variação contra `previousValue`. Copiar a função. |
| 16 | Erros traduzidos por causa (429, 402, tempo esgotado) | `src/components/dashboard/dashboard-generating.tsx` | **core** | A suíte já faz melhor com `ErroIA`/`respostaErro`/`interpretarFalha` (`pdi-time/lib/ai.ts`). Mapear, não portar. |
| 17 | Validação mínima de entrada amigável (< 10 caracteres) | `src/components/chat/home-hero-chat.tsx:83-105` | **core** | Vira 400 com mensagem clara em português, como o `PADRAO.md` pede. |
| 18 | Máquina de estados do dashboard (`draft` → `generating` → `ready` \| `error`) | `src/types/dashboard.ts`, `src/components/dashboard/editor-wrapper.tsx:96-99` | **útil** (simplificado) | Com chamada síncrona, o estado vive no cliente (`vazio` → `esclarecendo` → `carregando` → `pronto`/`erro`). Não precisa de coluna no banco. |
| 19 | Salvar dashboards e reabrir depois | `src/routes/dashboards.index.tsx`, tabela `dashboards` | **core** | A suíte já tem `lib/historico.ts` + `/historico` + `/r/[id]`. Entra de graça. |
| 20 | Insights automáticos (anomalia, tendência, sugestão) | `src/lib/ai/detect-anomalies.ts:18-157`, `src/components/dashboard/insights-banner.tsx` | **core** | Fecha o ciclo: o painel não só mostra, ele diz o que olhar. É o que um executivo leva para a reunião. Máximo 3, dispensável. |
| 21 | Impressão / exportação do painel | `src/lib/export/pdf.ts:45-100` (html2canvas + jspdf) | **core** (reescrito) | A suíte já tem `/imprimir/[id]`. A funcionalidade fica, a biblioteca não. |
| 22 | Metas (`target`) por KPI com barra de progresso | `src/components/dashboard/kpi-card.tsx:52-90`, `target-popover.tsx` | **útil** | Boa sacada, mas é um segundo modo de edição (popover por engrenagem). Cabe melhor como um pedido de refinamento em texto na v1 ("coloque meta de R$ 500 mil na receita"). |
| 23 | Troca de tipo de gráfico só entre tipos compatíveis | `src/components/dashboard/canvas.tsx:50-68` | **útil** | Na v1 isso é um pedido ao chat de refinamento ("troque o gráfico de barras por pizza"), que já funciona. Botão dedicado é v2. |
| 24 | Desfazer o último refinamento | `src/hooks/use-chat.ts:137-182` (lê `config_history[0]`) | **core** (simplificado) | Pilha em memória no cliente, sem coluna `config_history` no banco. Barato e evita o medo de pedir ajuste. |
| 25 | Autosave com debounce de 2 s e histórico rotativo de 5 | `src/hooks/use-autosave.ts:19-100` | **descartar** | Existe porque a origem é um editor persistente multiusuário. Aqui o painel é salvo uma vez (ou por botão) em `lib/historico.ts`, com `atualizarSaida(id, ...)` depois de cada refinamento. |
| 26 | Drag & drop para reordenar componentes | `src/components/dashboard/canvas.tsx` + `@dnd-kit` (3 pacotes) | **descartar** | Três dependências novas para valor marginal num produto que se demonstra em 2 minutos. A ordem que a IA gera já é boa; reordenar é pedido de chat. |
| 27 | Seletor global de período (Dia/Semana/Mês/Ano) | `src/components/dashboard/period-selector.tsx` | **descartar** | Não faz nada de verdade: os dados são fictícios e não mudam com o período. Promessa falsa na tela. |
| 28 | Fontes de dados: upload CSV/Excel | `src/routes/sources.tsx`, `src/lib/parsers/csv.ts:40-80` | **útil (v2)** | Faz sentido um dia, no molde do `financas-ia` (arquivo lido no pedido, sem tabela de linhas). Não na v1: muda o produto de "painel imaginado" para "ferramenta de BI". |
| 29 | Fontes de dados: Google Sheets (OAuth), webhook de ingestão, CRM Pipedrive | `src/lib/google/*`, `src/routes/api/ingest/$sourceId.ts`, `src/lib/crm/*` | **descartar** | Três integrações externas caras de manter, cada uma com credencial que o executivo não tem na demonstração. |
| 30 | Binding assistido por IA (coluna → campo do componente) | `src/lib/ai/suggest-bindings.ts:25-122`, `src/lib/ai/apply-bindings.ts:10-116` | **descartar na v1** | Só existe se existir fonte de dados. Volta junto com o item 28. O prompt está guardado na análise. |
| 31 | Alertas por métrica com e-mail e cron do Postgres | `src/routes/alerts.tsx`, `src/lib/alerts/check-alerts.server.ts`, `supabase/setup_alerts_cron.sql` | **útil** (reimplementado) | A ideia sobrevive como **rotina** (`lib/rotinas.ts` + `lib/notificacoes.ts`), mas "alerta sobre dado fictício" é sem sentido. Na v1 vira "resumo dos painéis criados". |
| 32 | Compartilhamento público com `share_token`, senha e contador de visualizações | `src/routes/api/share.ts:22-186`, `src/routes/public.$token.tsx` | **descartar na v1** | Exigiria entrar na lista pública do `proxy.ts` com justificativa. `/r/[id]` (resultado salvo) e a exportação MCP cobrem o uso real. |
| 33 | Exportação para Excel com aba de resumo de KPIs | `src/lib/export/excel.ts:20-50` (`xlsx`) | **útil (v2)** | Dependência nova exige justificativa (`PADRAO.md:13`). Um `.csv` gerado à mão cobre 80% do valor sem dependência — fica como decisão em aberto (risco 6). |
| 34 | Templates por setor em tabela + `buildTemplateReference()` no prompt | `src/components/templates/templates-page-client.tsx`, `src/lib/ai/prompts.ts:77-112` | **descartar** | A tabela nunca foi populada e a injeção está desligada no código (`src/routes/api/generate.ts:200-203`). O que sobrevive vira os chips por área e os painéis de `lib/demo.ts`. |
| 35 | Rate limit de 10 gerações por hora em `Map` de memória | `src/lib/rate-limit.ts:1-40` | **descartar** | Uma conta por instância; o limite real é o do OpenRouter, já traduzido por `ErroIA("limite_diario")`. |
| 36 | BYOK: chave de OpenAI/Anthropic do próprio usuário em `users.api_keys` (texto plano) | `src/routes/settings.tsx:40-70`, `src/lib/ai/provider.ts:24-85` | **descartar** | A suíte tem coisa melhor: `/setup` com OAuth do OpenRouter em um clique e chave cifrada em AES-256-GCM. |
| 37 | Auth multiusuário (login/signup/callback, RLS por `user_id`) | `src/components/auth/login-signup-form.tsx`, Supabase Auth | **descartar** | Uma conta de administrador por instância (`lib/conta.ts`, `proxy.ts`). |
| 38 | Streaming SSE com `readable.tee()` e polling de 2 s + `location.reload()` | `src/routes/api/generate.ts:213-275` | **descartar** | O stream não entrega nada útil (mesma mensagem a cada delta) e o polling existe só porque a gravação é lateral. Chamada síncrona + etapas por tempo dão a mesma percepção. |
| 39 | `goal_chart` (meta vs realizado) | `src/types/dashboard.ts`, `src/components/dashboard/goal-chart.tsx:31-36` | **descartar** | Bug real: o prompt descreve `{current,target,format,prefix}`, o tipo e o componente esperam `{xAxis,actualKey,goalKey,data}`. Qualquer `goal_chart` gerado renderiza vazio. Ver decisão no risco 2. |
| 40 | Duplicação `config` + `mockData` em todo componente | `src/types/dashboard.ts`, leitura em `chart-wrapper.tsx:53-57` | **descartar** | Dois campos para o mesmo dado, com fallback `mockData?.data ?? config?.data ?? []`. Vira um campo só (`dados`). |
| 41 | 22 documentos de PRD/épicos/stories (BMAD) em `docs/` | `docs/**` | **descartar** | Fonte de ideias de produto, não de código. O aprendizado do app novo vai para o `CLAUDE.md` dele. |

---

## 2. Core validado — as "sacadas" a copiar

Cada item aqui é uma decisão de produto da origem que se sustenta sozinha e que vai para a v1.

### 2.1 Detecção de domínio + KPIs canônicos por setor
**Origem:** `src/lib/ai/prompts.ts:114-160`.
O prompt não pede "um dashboard": ele lista dez setores (Vendas/CRM, Financeiro, Marketing,
Operações, SaaS, E-commerce, Agência, RH, Logística, Educação) e, para cada um, os indicadores
canônicos. O modelo classifica o pedido e escolhe a lista certa.
**Justificativa de produto:** o público da suíte é o executivo sem analista. Ele sabe dizer
"quero acompanhar minhas vendas", não "quero ticket médio, taxa de conversão e ranking por
vendedor". A tabela de KPIs por setor é o analista embutido — é ela que faz o resultado parecer
feito por gente, e não um amontoado de gráficos. É também a parte do produto mais cara de
reconstruir do zero e a que menos depende da stack: cabe inteira na suíte, sem uma linha de código.

### 2.2 Regras de composição de layout escritas no prompt
**Origem:** `src/lib/ai/prompts.ts:170-180`.
"Linha 0: 3 a 4 KPIs com `colSpan` 1. Linha 1: um gráfico de tendência + um comparativo, ambos com
`colSpan` 2. Linha 2: uma distribuição + uma tabela opcional. IDs sequenciais. Nunca sobreponha."
**Justificativa de produto:** o layout é resolvido no prompt, não em código. Não existe motor de
layout, não existe grade inteligente, não existe heurística de empacotamento — e o resultado já sai
com a cara de um painel profissional. É a decisão que mais economiza código no app inteiro.

### 2.3 Realismo obrigatório dos dados fictícios
**Origem:** `src/lib/ai/prompts.ts:182-195`.
Receita mensal de PME entre R$ 50 mil e R$ 5 milhões; séries temporais de 6 meses; tabelas de 5 a 10
linhas; pizzas de 4 a 6 fatias; rankings de 5 a 8 itens já ordenados, com título "Top N ..."; nomes
de pessoas brasileiros; cidades e estados brasileiros; produtos plausíveis em português.
**Justificativa de produto:** o `PADRAO.md` exige que tudo funcione sem nenhuma chave, com "dados de
exemplo plausíveis e em português". Aqui os dados de exemplo *são o produto* — o painel gerado é
sempre fictício na v1. Um dashboard com "Product A: 1000" mata a demonstração em dois segundos;
"Ana Silva: R$ 142.000" a sustenta. Estas regras são o que converte.

### 2.4 Gate de esclarecimento com heurística local antes da IA
**Origem:** `src/lib/ai/clarify.ts:62-84` (heurística) e `:18-60` (prompt).
Antes de gerar, o servidor mede o prompt: menos de 30 caracteres → precisa esclarecer; três ou mais
termos de domínio de uma lista de 40 → está bom, gera direto; menos de dois → pergunta. Só no caso
duvidoso a IA é chamada, e ela devolve de 1 a 3 perguntas curtas, cada uma com 2 a 4 chips de
resposta sugerida.
**Justificativa de produto:** resolve o pior caso ("faça um dashboard") sem punir o melhor caso
(quem escreveu um parágrafo bom). A heurística local é grátis e instantânea; a chamada extra só
acontece quando paga por si. E as perguntas são respondidas por clique, não por digitação.
**Complemento obrigatório:** o botão "Pular e gerar agora" (`skip_clarification` na origem).
Ninguém pode ficar preso num questionário para ver o produto funcionando.

### 2.5 Tela de carregamento com etapas por tempo decorrido
**Origem:** `src/components/dashboard/dashboard-generating.tsx:22-295` (estágios em 0/4/12/22/32 s).
**Justificativa de produto:** a geração leva de 20 a 40 segundos com modelo gratuito. Um spinner
sozinho nesse tempo parece travado. O checklist que avança sozinho é honesto (não promete progresso
real, descreve o que está sendo feito) e derruba a ansiedade. A suíte já tem o componente pronto:
`Loading({ etapas })` em `components/ui.tsx`, alimentado por uma constante `ETAPAS_CARREGANDO` no
`app/page.tsx` — mesmo padrão do `pdi-time`.

### 2.6 Refinamento com `modifiedComponentIds` + `validateRefinement`
**Origem:** prompt em `src/lib/ai/prompts.ts:230-291`; validação em
`src/lib/ai/refine-dashboard.ts:76-136`.
A IA recebe o painel atual e o pedido, e tem de devolver três coisas: o config completo, uma
mensagem curta e a lista dos IDs que alterou. O código então compara componente a componente: se um
componente mudou mas **não** foi declarado em `modifiedComponentIds`, o original é restaurado. Sem a
lista, cai numa heurística (mesmo tipo e mesmo título com dados diferentes = deriva silenciosa).
**Justificativa de produto:** modelos generativos reescrevem o que deveriam copiar. Sem essa trava,
pedir "troque a cor do gráfico de barras" devolve um painel com os números todos diferentes, e o
usuário perde a confiança na terceira interação. Com a trava, o chat de refinamento vira uma
ferramenta previsível. É a sacada de engenharia mais importante do projeto de origem e vale ainda
mais aqui, porque o modelo padrão da suíte é gratuito e erra mais.

### 2.7 Resumo estruturado antes do JSON no prompt de refinamento
**Origem:** `src/lib/ai/prompts.ts:8-27` (`buildRefineContext`).
Primeiro uma lista legível (`3. [bar_chart] "Top 5 Vendedores" (id: comp-5) — 5 pontos de dados`),
depois o JSON cru.
**Justificativa de produto:** o modelo precisa entender *o que existe* para decidir o que mudar, e
precisa do JSON para copiar o que não muda. Separar as duas leituras reduz muito o erro de
identificação ("qual é o gráfico de barras?") em modelos menores.

### 2.8 Cache por hash do prompt
**Origem:** `src/lib/ai/generate-dashboard.ts:162-168`, aplicação em `src/routes/api/generate.ts:166-198`.
Prompt final normalizado (trim + minúsculas) → SHA-256 → procura um resultado pronto das últimas
24 h; se achar, devolve sem chamar a IA.
**Justificativa de produto:** em demonstração, o mesmo prompt é gerado muitas vezes (o apresentador
repete, o chip é clicado de novo, `?exemplo=1` é aberto em cada captura). Com modelo gratuito e cota
diária do OpenRouter, isso é a diferença entre a demonstração funcionar e dar "limite atingido" no
meio da reunião. Custa poucas linhas: `node:crypto` para o hash e uma busca em `lib/historico.ts`.

### 2.9 Chips de sugestão por área
**Origem:** `src/components/chat/home-hero-chat.tsx:14-55` (8 áreas: Vendas, Financeiro, Marketing,
Operações, SaaS, E-commerce, Agência, RH; cada chip preenche o campo com um prompt completo e bem
escrito, não com uma palavra).
**Justificativa de produto:** o `PADRAO.md` exige "Preencher com um exemplo" nos estados vazios.
Aqui o exemplo é multiplicado por área, então o executivo reconhece a *sua* área na tela — e o
prompt que entra no campo é um prompt bom, que também ensina o formato esperado. Os textos da
origem são reaproveitáveis palavra por palavra.

### 2.10 Bloco de idioma no topo de todo prompt
**Origem:** topo de `prompts.ts` e `clarify.ts` ("nunca escreva 'nao' em vez de 'não'").
**Justificativa de produto:** modelos gratuitos perdem acentuação com frequência, e a suíte roda em
modelo gratuito por padrão. Texto sem acento na tela de um produto para executivo brasileiro é fatal.

### 2.11 Lista de anti-padrões
**Origem:** `src/lib/ai/prompts.ts:210-218`.
**Justificativa de produto:** oito proibições explícitas (nada de markdown, nada de tipo inventado,
nada de inglês, nunca menos de 5 nem mais de 8 componentes, nunca pedir esclarecimento dentro da
geração, nunca sobrepor posições, nunca omitir `previousValue`, nunca escrever sem acento). Cada uma
delas corresponde a um jeito de o painel sair quebrado. É barato e reduz a variância.

### 2.12 Insights como banner dispensável, no máximo 3
**Origem:** `src/lib/ai/detect-anomalies.ts:18-157`, `src/components/dashboard/insights-banner.tsx`.
Três tipos: anomalia, tendência, sugestão. Mensagens curtas, com nome da métrica e o número.
**Justificativa de produto:** o painel mostra; o insight diz o que olhar. É o que separa "gerei um
gráfico" de "entendi meu negócio". Ser dispensável e limitado a 3 impede que roube a tela.
**Ajuste obrigatório:** o prompt da origem está **em inglês** (pedindo saída em português) — na v1
ele é traduzido por inteiro.

### 2.13 Formatação brasileira do KPI e cálculo de variação
**Origem:** `src/components/dashboard/kpi-card.tsx:14-37`.
`Intl.NumberFormat("pt-BR")` com `style: "currency"` (BRL), `"percent"` (dividindo por 100, uma casa)
ou `"number"`; variação `((valor - anterior) / |anterior|) * 100`, com o caso `anterior === 0`
tratado.
**Justificativa de produto:** é o detalhe que faz o número parecer certo. Copiar a função, adaptando
apenas para o formato compacto com espaço separável comum, como o `financas-ia` já faz
(`financas-ia/components/GraficoMeses.tsx:12-15`: o `notation: "compact"` do `Intl` usa espaço não
separável e estoura coluna estreita).

### 2.14 Erros traduzidos por causa
**Origem:** tratamento de 429 / 402 / tempo esgotado na tela de geração, com o prompt original
mostrado em itálico e um botão "Tentar novamente".
**Justificativa de produto:** a suíte já faz isso melhor e de forma centralizada
(`interpretarFalha` → `ErroIA{codigo,status,acao}` → `respostaErro` → `ErrorBox`), com códigos
`sem_credito`, `limite_diario`, `chave_invalida`, `resposta_invalida` etc. O que a origem acrescenta
e vale copiar é **mostrar o prompt original junto do erro**, para o usuário não perder o que
escreveu.

### 2.15 Estados do painel e "nunca cair em tela vazia"
**Origem:** `src/components/dashboard/editor-wrapper.tsx:96-99` (trata "rascunho com prompt e sem
componentes" também como "gerando").
**Justificativa de produto:** a regra que sobrevive é o princípio, não a coluna no banco: em nenhum
momento o usuário pode ver uma tela vazia sem explicação. Na v1 isso vira a máquina de estados do
cliente (`vazio` → `esclarecendo` → `carregando` → `pronto` | `erro`), com `Empty` convidativo no
estado inicial, como o `PADRAO.md` exige.

---

## 3. O que NÃO trazer, e por quê

| O que fica de fora | Por quê |
|---|---|
| **Supabase inteiro** (Postgres, Auth, RLS, Storage, Vault, cron) | Dependência dura: a home da origem chama `supabase.auth.getUser()` e redireciona para `/login` antes de qualquer coisa. A suíte é um contêiner autossuficiente com SQLite local (`lib/store.ts`, `lib/historico.ts`) e nada de serviço externo obrigatório. |
| **Auth multiusuário** (login, signup, callback, `user_id` em toda tabela, `getUserIdFromBearer` copiado em 5 rotas) | O modelo da suíte é uma conta de administrador por instância (`lib/conta.ts`, `proxy.ts`). Some `user_id` do modelo de dados inteiro e somem 5 cópias da mesma função. |
| **Lovable AI Gateway e os três provedores em paralelo** (`src/lib/ai/provider.ts`, ~485 linhas) | Toda IA da suíte passa por `lib/ai.ts` (OpenRouter, copiado sem alterar do `pdi-time`). O que na origem são três caminhos de código vira `askJSON<Spec>({ system, prompt })`. |
| **BYOK com chave do usuário em texto plano** (`users.api_keys`) | Substituído por `/setup`: OAuth PKCE do OpenRouter em um clique, ou chave colada, sempre cifrada em AES-256-GCM (`lib/store.ts`). Nunca `process.env.X` direto: sempre `getConfig("X")`. |
| **Fontes de dados externas**: Google Sheets (OAuth), webhook de ingestão (`data_rows`), CRM Pipedrive | Três integrações, três credenciais, três caminhos de falha — e nenhuma delas o executivo tem em mãos nos dois minutos da demonstração. Se um dia entrar dado real, o caminho é o do `financas-ia` (CSV lido no pedido, agregados para a IA) ou a integração `MCP_DADOS`/`MCP_EMPRESA` que `lib/setup-comum.ts` já oferece. |
| **Binding assistido por IA** (`suggest-bindings.ts`, `apply-bindings.ts`) | Só existe se existir fonte de dados; volta junto com ela. O prompt está preservado na análise da Fase 1 para quando isso acontecer. |
| **Alertas com cron do Postgres + segredo no Vault + RPC interna + Resend** | A suíte já tem o equivalente pronto: `lib/rotinas.ts` (agendador de 60 s registrado em `instrumentation.ts`, com auto-pausa na terceira falha) e `lib/notificacoes.ts` (Resend, SMTP, Slack, ou a própria caixa via `lib/email-envio.ts`). Reimplementar sobre o que existe, nunca portar. E, mais importante: **alerta sobre número fictício não faz sentido** — na v1 a rotina é "resumo dos painéis criados", não "a receita caiu 10%". |
| **`@dnd-kit` (3 pacotes) para arrastar componentes** | `PADRAO.md:13` só admite dependência indispensável. Reordenar por arrastar é conveniência num produto cuja proposta é "a IA já monta certo". Se virar necessidade, entra como pedido ao chat de refinamento ou como botões "subir/descer" nativos. |
| **Exportação por biblioteca**: `jspdf` + `html2canvas` (PDF) e `xlsx` (Excel) | Três dependências pesadas para o que a rota `/imprimir/[id]` (impressão do navegador, já padrão da suíte) resolve. Atenção ao bug registrado no `CLAUDE.md` do `pdi-time`: `DataTable` com muitas linhas não pagina bem em A4. |
| **Recharts** | Biblioteca de gráfico com tema escuro fixo (`#1a1a2e`, `#2a2a3e`) num app de tema claro com tokens. A suíte não usa nenhuma: `financas-ia/components/GraficoMeses.tsx` e `GraficoCategorias.tsx` fazem série temporal e barras horizontais com `div`/CSS/SVG à mão, altura fixa em px, `minmax(0,1fr)` na grade e rótulo curto no celular. É o caminho. |
| **shadcn/ui inteiro (48 componentes) + Radix + sonner + cmdk + vaul** | `PADRAO.md:13` proíbe biblioteca de UI. Tudo sai de `components/ui.tsx` (842 linhas, copiado sem alterar): `Card`→`.card`/`Panel`, `Button`→`.btn-primary`/`.btn-ghost`, `Toast`→`Aviso`, `Table`→`DataTable`, `Badge`→`Chip`, `Skeleton`→`.skeleton`, `Dialog`→ montagem condicional (padrão `DialogoAutoavaliacao`). |
| **Design system duplicado**: tokens `--via-*` + tokens shadcn + classes legadas de tema escuro, 701 linhas, mais 5 OTFs de Avenir LT Std em `public/fonts/` | A suíte tem Manrope via `next/font/google` e **quatro** variáveis de acento por app em `app/globals.css`. Ver o acento escolhido na seção 4.6. |
| **Streaming SSE com `readable.tee()` + polling de 2 s + `window.location.reload()`** | O stream emite a mesma mensagem a cada delta e o JSON só é parseado no fim: complexidade sem benefício. Uma chamada síncrona com `Loading({etapas})` entrega a mesma percepção com uma fração do código. |
| **Autosave debounced + `config_history` (5) no banco** | Desenho de editor persistente multiusuário. Aqui: o painel é salvo em `lib/historico.ts` e cada refinamento chama `atualizarSaida(id, ...)`; o "desfazer" é uma pilha em memória no cliente. |
| **Rate limit de 10/h em `Map` de memória** | Uma conta por instância. O limite que importa é o do OpenRouter, e ele já chega traduzido como `ErroIA("limite_diario")` com a ação "Conectar outra chave em Configurações". |
| **Seletor global de período (Dia/Semana/Mês/Ano)** | Não muda nada nos dados. Controle que não faz nada é pior que controle ausente. |
| **Link público com senha e contador de visualizações** | Exigiria uma rota na lista pública do `proxy.ts` com justificativa e um portão de senha próprio. `/r/[id]` (painel salvo, atrás da conta) e as ferramentas MCP cobrem o uso real na v1. |
| **Tabela `templates` + `buildTemplateReference()`** | Nunca populada, e a injeção no prompt está desligada na própria origem (`src/routes/api/generate.ts:200-203`: `const templateReference: string \| undefined = undefined; void buildTemplateReference;`). O que sobrevive: os chips por área e os painéis prontos de `lib/demo.ts`. |
| **`goal_chart`** | Quebrado na origem (prompt e componente descrevem formatos incompatíveis; qualquer `goal_chart` gerado renderiza vazio). A necessidade real — "mostrar meta contra realizado" — é atendida pelo campo opcional `meta` do KPI, sem um tipo de componente a mais. Ver risco 2. |
| **Duplicação `config` + `mockData`** | Dois campos para o mesmo dado, lidos com `mockData?.data ?? config?.data ?? []`. Vira um campo `dados` por componente. Ver a especificação de tipos no PRD (seção 5). |
| **Textos em inglês vazando para a tela** ("Line Chart", "Something went wrong", prompt de insights inteiro) | `scripts/verificar-jargao.mjs` reprovaria e o público é brasileiro. Tudo traduzido, inclusive o prompt de insights. |
| **Cloudflare Workers, `wrangler.jsonc`, `@lovable.dev/vite-tanstack-config`, `nitro` beta pinado, `routeTree.gen.ts`** | Infraestrutura do Lovable. O destino é Docker → GHCR → Render por Blueprint gerado. |
| **`docs/` com 22 arquivos BMAD** | Fonte de ideias, não de código. O aprendizado do app novo mora no `CLAUDE.md` dele. |

---

## 4. Estratégia da recriação como `toolkit-dash-builder`

### 4.1 Posicionamento no catálogo
A suíte tem 19 apps. **Nenhum cobre "descreva o painel e a IA decide quais indicadores existem".**
Os dois vizinhos mais próximos são:

- **`financas-ia` (Analista Financeiro, porta 3009, Financeiro):** lê um CSV de despesas *do usuário*
  e mostra os números de um domínio **fixo** (financeiro). O usuário traz o dado; o app já sabe o que
  mostrar.
- **`automl-pocket` (AutoML, porta 3018, Dados/Financeiro/Vendas):** treina modelos a partir de
  planilhas e explica o resultado. É previsão, não visualização; e é o app fora do padrão
  (`padrao: "proprio"`).

O `toolkit-dash-builder` inverte a relação: **o usuário traz a pergunta, não o dado.** Ele descreve
em uma frase o que quer acompanhar e a IA decide os indicadores, o layout e os números de exemplo. É
uma ferramenta de *especificação* de painel, não de análise de dado próprio. A fronteira fica clara
se os textos do catálogo forem escritos assim:

- `financas-ia`: "tenho a planilha, não tenho tempo de destrinchar".
- `toolkit-dash-builder`: "sei o que quero acompanhar, não sei quais indicadores pedir".

Áreas propostas no catálogo: **Dados** e **Gestão** (o comprador é o gestor de área; o objeto é um
painel de indicadores). Essa fronteira é a decisão em aberto nº 1.

### 4.2 O que muda ao virar um app da suíte

| Camada | Origem | `toolkit-dash-builder` |
|---|---|---|
| Framework | TanStack Start + Vite + Cloudflare | **Next.js 16 (App Router) + React 19 + Tailwind 4**, `output: "standalone"` |
| Rotas | `src/routes/api/x.ts` com `createFileRoute(...).server.handlers` | `app/api/x/route.ts` com `export async function POST(req: Request)` |
| Telas | 7 telas (`/dashboards`, `/dashboards/:id/edit`, `/sources`, `/templates`, `/alerts`, `/settings`, `/help`) | **Tela única** `app/page.tsx` (`"use client"`), mais `/historico`, `/r/[id]`, `/imprimir/[id]` e `/setup`, que já existem no padrão |
| Banco | Supabase Postgres, 11 tabelas | **SQLite local cifrado** (`node:sqlite`), sem tabela nova de domínio: painéis vivem em `lib/historico.ts` com `tipo: "painel"` |
| IA | Lovable Gateway (`gemini-3-flash-preview`) + OpenAI + Anthropic | **OpenRouter** via `lib/ai.ts` (`nvidia/nemotron-3-super-120b-a12b:free` + reservas), `askJSON<EspecPainel>()` |
| Chaves | `.env` obrigatório + BYOK em texto plano | **`/setup`**: OAuth do OpenRouter em um clique ou chave colada, cifrada em AES-256-GCM; nenhuma variável obrigatória |
| Sem chave | app não sobe | **Modo demonstração obrigatório**: `if (!aiEnabled())` → `esperar(1200)` → painel pronto de `lib/demo.ts`, com a mesma forma da resposta real e `meta.demo = true` |
| Gráficos | Recharts | **Feitos à mão** (div/CSS/SVG), no molde de `financas-ia/components/Grafico*.tsx`, respeitando `--color-accent` |
| Assistentes | — | **MCP** (`POST /mcp`, JSON-RPC 2.0) com `lib/ferramentas.ts` expondo as mesmas funções das rotas |
| Histórico | tabela `dashboards` com autosave | `lib/historico.ts` (`salvar`/`listar`/`obter`/`atualizarSaida`) + tela `/historico` + `/r/[id]`, já prontos |
| Exportação | jspdf + html2canvas + xlsx | **`/imprimir/[id]`** (impressão do navegador) |
| Agendado | cron do Postgres + Vault + Resend | `lib/rotinas.ts` + `lib/notificacoes.ts` |
| Deploy | Cloudflare Workers | **Docker → `ghcr.io/startse/toolkit-dash-builder` → Render** por `render.yaml` gerado por `node scripts/gerar-deploy.mjs` a partir de `catalogo.json` |
| Idioma | PT-BR com vazamentos de inglês | 100% PT-BR, validado por `node scripts/verificar-jargao.mjs toolkit-dash-builder` |

### 4.3 Recorte da v1
Entra:
1. Prompt → especificação do painel, com detecção de domínio, regras de composição, regras de
   realismo e anti-padrões (praticamente o prompt inteiro da origem, adaptado ao esquema novo).
2. Chips de sugestão por área (8 áreas) e atalho `?exemplo=1`.
3. Gate de esclarecimento com heurística local, chips de resposta e "pular e gerar agora".
4. Tela de carregamento com etapas por tempo.
5. Renderização do painel em grade: KPI, linha, barra (vertical e horizontal), pizza/rosca, área e
   tabela — seis tipos, todos feitos à mão.
6. Refinamento por chat com `componentesAlterados` + validação anti-deriva + desfazer.
7. Insights (até 3, dispensáveis), traduzidos.
8. Cache por hash do prompt (24 h).
9. Modo demonstração com 4 painéis prontos escolhidos por palavra-chave do prompt.
10. Salvar em `lib/historico.ts`, reabrir em `/r/[id]`, imprimir em `/imprimir/[id]`.
11. MCP: `criar_painel`, `refinar_painel`, `listar_paineis`, `obter_painel`.
12. `/setup` só com OpenRouter (mais Notificações, se a rotina entrar).

Fica para a v2:
- Fonte de dados real (CSV enviado, no molde do `financas-ia`) e binding assistido por IA.
- Meta por KPI com barra de progresso configurável por popover (na v1, só por pedido de texto).
- Troca de tipo de gráfico por botão, e reordenação por botões "subir/descer".
- Exportação `.csv`/`.xlsx` dos dados do painel.
- Link público com senha (exige justificativa na lista pública do `proxy.ts`).
- Alerta de indicador de verdade (só faz sentido depois que existir dado real).
- Comparação lado a lado de duas versões do mesmo painel.

### 4.4 Modelo de dados
Sem tabela nova de domínio na v1. O painel é um `Resultado` de `lib/historico.ts`
(`tipo: "painel"`, `titulo` = título do painel, `resumo` = primeira frase do prompt, `entrada` = o
pedido e os esclarecimentos, `saida` = a especificação, `meta` = `{demo, model, geradoEm, insumo}`).
O cache por hash é uma coluna/índice derivado do próprio `entrada` — detalhe fechado no PRD
(seção 7). Isso mantém `/historico`, `/r/[id]` e `/imprimir/[id]` funcionando sem código novo.

### 4.5 Modo demonstração
Obrigatório e de primeira classe. `lib/demo.ts` traz **quatro** painéis completos — vendas,
financeiro, marketing e SaaS — escolhidos por palavra-chave do prompt, para o exemplo nunca parecer
aleatório em relação ao que a pessoa pediu. Cada um tem a **mesma forma** da resposta real, o mesmo
número de componentes e os mesmos formatos de valor, de modo que a tela não precise saber se está em
demonstração. Também há uma resposta de refinamento de exemplo (trocar tipo de gráfico, acrescentar
KPI) e um conjunto de insights de exemplo.

### 4.6 Acento
Escolhido pela regra de `PADRAO.md:33-37`: segmento define a família de matiz, cada app ocupa um
degrau, e as três cores derivadas saem de fórmula fixa, validadas por `scripts/verificar-paleta.mjs`.

**Segmento novo: Dados. Acento: `#a5540d`** (HSL 28, 85 %, 35 % — laranja queimado), com
`--color-accent-2: #edb90c`, `--color-accent-soft: #f9efe7` e `--color-accent-ink: #5e3008`.

Como foi escolhido (o arquivo `tasks/paleta-segmentos.json` **existe** no repositório — a Fase 1 o
reportou ausente por engano):
1. As 18 entradas atuais ocupam quatro faixas de matiz: verdes/teais 140–199 (Financeiro,
   Atendimento, Estratégia), azuis 204–230 (Vendas, Gestão), violetas 248–275 (Jurídico, RH) e
   magentas 300–344 (Marketing). **Toda a faixa 0–139 está livre**, e é onde vive o laranja.
2. Varredura das combinações HSL com matiz 15–50, saturação 50–85 e luminosidade 24–40, filtrando
   por contraste contra branco entre 4,8 e 7,5 (a regra exige ≥ 4,5; a folga evita reprovar por
   arredondamento) e ΔE (CIE76) ≥ 12 contra **todos** os 18 acentos existentes.
3. Dentre os candidatos, o escolhido tem contraste **5,42:1** contra branco (AA em qualquer tamanho)
   e ΔE mínimo **48,3** (contra `clone-site`, `#792a3f`) — muito acima do piso de 10 entre
   segmentos. Como é o primeiro app do segmento Dados, a regra de ΔE ≥ 6 dentro do segmento não se
   aplica ainda.
4. As três derivadas foram calculadas pelas fórmulas oficiais: `acento2` = matiz +18°, saturação +12
   (teto 90), luminosidade +14 (teto 66); `soft` = mesma matiz, saturação teto 60, luminosidade 94;
   `ink` = mesma matiz, saturação +10 (teto 85), luminosidade −18 (piso 20).

Além de livre, o laranja é o acento **certo para o produto**: é o único app da suíte cujo conteúdo
principal são séries e barras coloridas com a cor de acento, e um laranja quente sobre fundo claro
lê melhor em gráfico do que os azuis e violetas já ocupados.

### 4.7 Verificação
Antes de encerrar qualquer etapa de implementação: `npm run lint`, `npm run build`,
`node scripts/verificar-jargao.mjs toolkit-dash-builder`, `node scripts/verificar-paleta.mjs`,
`scripts/verificar-padrao.sh` (o app novo entra automaticamente nos três, porque os três leem
`catalogo.json`), build `standalone` de verdade rodando e `curl` em `/api/health`, `/api/status`,
`/api/setup` e nas rotas de domínio em modo demonstração.

---

## 5. Riscos e decisões em aberto

**1. Fronteira com `financas-ia` e `automl-pocket` no catálogo.**
Risco: o executivo abre o catálogo e não entende por que existem três apps que "mostram números".
*Decisão recomendada:* escrever o `problema` do catálogo pela pergunta que cada um responde, não
pelo artefato. `toolkit-dash-builder`: "Sei o que quero acompanhar, mas não sei quais indicadores
pedir nem como montar o painel." Áreas `["Dados", "Gestão"]`. Validar o texto com o time antes de
publicar.

**2. `goal_chart`: consertar ou cortar.**
Risco: cortar o tipo tira a capacidade de mostrar meta contra realizado, que é justamente o que
executivo pede.
*Decisão recomendada:* **cortar o tipo** e atender a necessidade com um campo opcional `meta` no
componente de KPI (`{ meta?: number }`, renderizado como barra de progresso abaixo do número). Um
campo opcional num tipo que já existe é muito mais barato de gerar corretamente do que um oitavo
tipo de componente, e elimina o formato incompatível da origem. A barra de progresso só aparece
quando a IA preencher `meta`.

**3. Dado fictício pode ser confundido com dado real.**
Risco: alguém imprime o painel e leva "R$ 487.000 de receita" para uma reunião achando que é da
empresa.
*Decisão recomendada:* tratar como requisito de produto, não como aviso de rodapé. O `SeloIA` da
suíte já troca o texto em demonstração; além dele, a v1 marca **todo** painel gerado (com ou sem
chave) como "números de exemplo" em um `Aviso` fixo acima da grade e também na página de impressão.
O texto é o mesmo do `PADRAO.md`: explica o que é e o que fazer ("conecte uma fonte de dados quando
ela existir" fica para a v2 — na v1, "estes números são exemplos para você validar o formato do
painel").

**4. Tamanho da resposta da IA: 8 componentes com séries e tabelas passam de 4.000 tokens.**
Risco: `askJSON` com `maxTokens` padrão de 4.000 pode truncar o JSON, e truncado ele não parseia —
`askJSON` repete a chamada uma vez e depois lança `resposta_invalida`, queimando duas chamadas.
*Decisão recomendada:* passar `maxTokens: 8000` explicitamente na geração, e limitar no prompt o que
mais infla a resposta (tabela com no máximo 8 linhas e 5 colunas; séries com no máximo 12 pontos;
no máximo 8 componentes). O PRD fixa esses limites na especificação do esquema (seção 5) e no
prompt (seção 6). Medir o consumo real na primeira etapa de implementação e ajustar.

**5. Refinamento devolve o painel inteiro: custo e risco de deriva crescem com o tamanho.**
Risco: em um painel de 8 componentes, cada pedido de ajuste custa uma leitura e uma escrita do JSON
completo.
*Decisão recomendada:* manter o desenho da origem na v1 (config completo + `componentesAlterados` +
restauração do original), porque é o que se sabe que funciona; mas **medir** o tempo e o consumo. Se
passar de ~25 s por refinamento, a v2 troca para um formato de operações (`{acao, componenteId,
campos}`), que é mais barato mas exige um aplicador de patch no código.

**6. Exportação em planilha: dependência nova ou não.**
Risco: `xlsx` é uma dependência pesada e `PADRAO.md:13` exige justificativa.
*Decisão recomendada:* **não** na v1. Cobrir com (a) `/imprimir/[id]` e (b) um botão "Copiar dados
da tabela" que põe CSV na área de transferência com `navigator.clipboard`, sem nenhuma dependência.
Reavaliar na v2 com uso real.

**7. Chave e cota: o produto é caro em tokens para um modelo gratuito.**
Risco: geração (≈8 mil tokens de saída) + esclarecimento + insights + N refinamentos, tudo no
gratuito, esbarra na cota diária no meio de uma demonstração.
*Decisão recomendada:* três defesas, todas na v1. (a) Cache por hash de 24 h. (b) Heurística local
no gate de esclarecimento, evitando a chamada quando o prompt já é bom. (c) Insights **sob demanda**
(botão "Analisar"), nunca automáticos ao gerar. Além disso, o erro `limite_diario` já chega com a
ação "Conectar outra chave em Configurações".

**8. O painel em grade não é uma "tela única" no sentido do `PADRAO.md`.**
Risco: o padrão manda `Panel` (formulário) à esquerda e `Stage` (resultado) à direita; um painel de
3 colunas espremido na metade direita fica ilegível no desktop, e o chat de refinamento pede uma
terceira coluna.
*Decisão recomendada:* manter a estrutura `Workspace`/`Panel`/`Stage` no estado inicial e de
carregamento, e, no estado "pronto", deixar o painel ocupar a largura inteira, com o painel de
refinamento como uma faixa abaixo dele (não uma terceira coluna). Isso mantém o app dentro do padrão
(uma tela, sem navegação nova) e resolve a legibilidade no celular, onde tudo vira uma coluna só.
Se na implementação ficar claro que não dá, a saída formal é marcar o app como
`"independente": true` em `catalogo.json` (como o `whatsapp-atendente`), que libera a forma das telas
mantendo toda a camada de infraestrutura — decisão a tomar com a tela na mão, não antes.

**9. Seis tipos de gráfico feitos à mão é trabalho real.**
Risco: subestimar. `financas-ia` tem dois (barras horizontais e série temporal) e ambos carregam
gotchas já documentados (espaço não separável do `Intl` compacto, `minmax(0,1fr)` na grade, rótulo
curto no celular).
*Decisão recomendada:* implementar em ordem de valor e verificar cada um antes do próximo: KPI →
barra → linha → tabela → rosca → área. Rosca é o único que exige SVG de verdade (arcos); os outros
quatro saem de `div` com altura/largura percentual, no molde do `financas-ia`. Se o cronograma
apertar, a rosca é o candidato natural a cair para a v2 (o prompt passa a não oferecer `pizza`/
`rosca` e o layout usa barra no lugar da distribuição).

**10. `verificar-jargao.mjs` e o vocabulário deste app.**
Risco: este é um app *sobre painéis e indicadores*, e o verificador reprova `API`, `token`,
`endpoint`, `env`, ` ID`, `/setup` em `app/page.tsx` e em qualquer `components/*.tsx`. Palavras como
"componente", "KPI", "dashboard" merecem atenção: "dashboard" é estrangeirismo e "KPI" é sigla.
*Decisão recomendada:* o vocabulário da tela é **painel**, **indicador**, **gráfico**, **cartão**,
**tabela** — nunca "dashboard", "KPI", "componente" ou "spec" em texto visível. Nos tipos e no
código, os nomes são em português (`EspecPainel`, `ComponentePainel`, `componentesAlterados`), o que
também mantém os prompts coerentes. Se algum termo for inevitável na tela, ele entra em
`scripts/jargao-excecoes.json` com o motivo, nunca fica sem registro.

**11. Nome do app e id da pasta.**
Risco: `toolkit-dash-builder` é o nome de trabalho e tem duas palavras em inglês; o id da pasta vira
o id do catálogo, o nome da imagem (`ghcr.io/startse/toolkit-dash-builder`) e o `NOME_SERVIDOR` do
MCP — mudar depois custa caro.
*Decisão recomendada:* manter `toolkit-dash-builder` como id da pasta nesta rodada (foi como o
trabalho foi encomendado) e usar **"Painel em Minutos"** como `nome` de exibição no catálogo, na
`Topbar` e no `metadata.title`. Confirmar o par id/nome com o time antes do primeiro push, porque
depois do primeiro build a imagem publicada carimba o id.

**12. Insights sobre dados fictícios.**
Risco: "a receita de junho está 18 % acima da média" é uma frase verdadeira sobre um número
inventado — pode soar como análise de verdade.
*Decisão recomendada:* manter os insights (eles demonstram a capacidade), mas o prompt exige que
cada mensagem se refira ao **painel**, não à empresa ("no exemplo gerado, junho ficou 18 % acima da
média dos seis meses"), e o banner herda o mesmo aviso de "números de exemplo" do risco 3.

**13. Rotina: faz sentido na v1?**
Risco: `capacidades` no catálogo deve listar só o que está implementado de fato, e uma rotina
"resumo dos painéis criados" é de valor baixo num app de uso pontual.
*Decisão recomendada:* **não** declarar `"rotina"` na v1. `capacidades: ["artefato", "mcp"]`.
Reavaliar quando existir fonte de dados real (aí a rotina "seu painel semanal" faz sentido de
verdade). Isso também tira `lib/notificacoes-do-app.ts` e `lib/rotinas-do-app.ts` do caminho crítico
(ficam como stubs mínimos, como o padrão exige).

**14. Formulário público (`/f/<token>`): entra?**
Risco: a capacidade existe de graça no padrão, mas usar sem necessidade é peso morto.
*Decisão recomendada:* **não** na v1 (não há um terceiro respondendo nada). `app/api/f/[token]/route.ts`
fica no molde mínimo que o padrão exige, sem tipo de formulário registrado, e `"formulario"` não
entra em `capacidades`.
