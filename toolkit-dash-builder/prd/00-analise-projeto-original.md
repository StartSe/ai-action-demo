# Fase 1 — Análise: criador de dashboards (Lovable) → nova ferramenta no `ai-action-demo`

Documento de análise para recriar o produto "criador de dashboards com IA" como um app novo dentro da suíte `StartSe/ai-action-demo`.

**Repositórios analisados**

| Papel | Caminho local | Branch padrão | HEAD |
|---|---|---|---|
| Origem (Lovable) | `/home/claude/remix-of-remix-of-my-dashboard-criador-de-dashboards` | `main` | `ed90f379a923ea4cd028054281943f7a5e3c4b6f` |
| Destino (suíte) | `/home/claude/ai-action-demo` | `main` | `fb89753beb2495f1b9114100b691ef62e9cbbc70` |

Nenhum dos dois repositórios foi modificado.

---

## 1. Visão geral do projeto de origem

### O que é

"AI Dash Builder" / "My Dashboard" — uma aplicação SaaS B2B onde o usuário **descreve em linguagem natural** o que quer acompanhar e a IA devolve um **dashboard completo** (KPIs, gráficos, tabela) já preenchido com dados fictícios plausíveis para o mercado brasileiro. Depois o usuário pode refinar por chat, conectar dados reais (CSV, Excel, Google Sheets, webhook, CRM Pipedrive), criar alertas, compartilhar por link público e exportar em PDF/Excel.

A proposta de valor, do próprio `docs/project-brief.md:10-30`: **"Prompt → Dashboard"**, para PMEs que precisam de BI mas não têm analista nem querem aprender Power BI/Metabase/Grafana.

### Stack

| Camada | Tecnologia |
|---|---|
| Framework | **TanStack Start** (`@tanstack/react-start` 1.167) + **TanStack Router** file-based, **Vite 7**, React 19 |
| Build/config | `@lovable.dev/vite-tanstack-config` (plugin opaco que já inclui tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare) — `vite.config.ts:1-9` |
| Deploy alvo | Cloudflare Workers (`wrangler.jsonc`, `nodejs_compat`) |
| UI | Tailwind CSS 4 + **shadcn/ui completo** (≈48 componentes em `src/components/ui/`) + Radix + lucide-react + sonner (toasts) |
| Charts | **Recharts 2.15** (`src/components/dashboard/chart-wrapper.tsx`) |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` (reordenar componentes no canvas) |
| Backend / dados | **Supabase** (Postgres + Auth + RLS + Storage + cron/Vault) |
| IA | **Lovable AI Gateway** (padrão, modelo `google/gemini-3-flash-preview`), com override para OpenAI (`gpt-4o`) ou Anthropic (`claude-sonnet-4-20250514`) usando chave do próprio usuário |
| Export | `jspdf` + `html2canvas` (PDF), `xlsx` (Excel) |
| E-mail | Resend (alertas) |
| Runtime de servidor | rotas `src/routes/api/**` com `createFileRoute(...).server.handlers` |
| Fonte | Avenir LT Std (OTFs locais em `public/fonts/`) — design system "Viver de IA" em `src/styles.css` (701 linhas, tokens `--via-*`) |

### Como roda

`npm i && npm run dev` (Vite). Requer `.env` com `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, e — implicitamente, não documentado no `.env.example` — `LOVABLE_API_KEY` (ou `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`). Sem Supabase o app **não sobe funcional**: a home já chama `supabase.auth.getUser()` e redireciona para `/login`.

### Tamanho

~200 arquivos em `src/`, 19 rotas de tela/API + 17 rotas de API, 22 documentos de PRD/stories em `docs/` (metodologia BMAD: 5 épicos, 25 stories).

---

## 2. Funcionalidades principais

1. **Geração de dashboard a partir de prompt (o núcleo)**
   O usuário digita uma descrição ("Dashboard de vendas com funil e ranking") no hero da home; o app cria a linha `dashboards` com `status: "generating"` e navega para o editor, que chama `POST /api/generate`. A IA devolve um JSON com `title` + 5 a 8 componentes já com `mockData`.
   Arquivos: `src/components/chat/home-hero-chat.tsx:83-105` (submit), `src/lib/dashboards/create.ts:7-33` (insert), `src/routes/api/generate.ts:42-368` (rota), `src/lib/ai/generate-dashboard.ts:45-83` (chamada), `src/lib/ai/prompts.ts:114-218` (prompt de sistema).

2. **Gate de esclarecimento (clarify) antes de gerar**
   Antes de gastar a geração, o servidor avalia se o prompt é bom o bastante. Heurística local primeiro (comprimento + contagem de 40 termos de domínio); só se ambíguo chama a IA com *tool calling* para devolver 1–3 perguntas curtas com 2–4 chips de resposta sugerida. Se houver perguntas, a resposta é `{status: "clarification_needed", questions}` e o status volta para `draft`.
   Arquivos: `src/lib/ai/clarify.ts:62-190`, `src/routes/api/generate.ts:134-158`, UI em `src/components/dashboard/dashboard-clarify.tsx`.

3. **Tela de "gerando" com etapas cronometradas + polling**
   Enquanto a IA trabalha, mostra um checklist de estágios que avança por **tempo decorrido** (0s, 4s, 12s, 22s, 32s), barra indeterminada e o prompt do usuário. Em paralelo faz polling da coluna `status` a cada 2s (máx. 90 tentativas ≈ 3 min) e recarrega a página quando fica `ready`.
   Arquivos: `src/components/dashboard/dashboard-generating.tsx:22-295`, `src/components/dashboard/generating-visual.tsx:10-60`.

4. **Canvas do dashboard com drag & drop, troca de tipo e remoção**
   Grid responsivo de 3 colunas (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`) onde `colSpan` vira `md:col-span-2`/`lg:col-span-3`. Em modo editável, cada card ganha alça de arrastar, um "TypeSwitcher" (só entre tipos compatíveis: gráficos ↔ gráficos, KPI só KPI) e botão de remover — todos aparecendo no hover.
   Arquivos: `src/components/dashboard/canvas.tsx:50-433`, registro de componentes em `src/components/dashboard/component-registry.tsx:42-52`.

5. **Refinamento por chat ("edição cirúrgica")**
   Sidebar de chat no editor. O usuário pede ("mude o gráfico de barras para pizza"); o servidor manda à IA um **resumo estruturado** do dashboard + o JSON completo e exige de volta o config inteiro, a mensagem e a lista `modifiedComponentIds`. Depois disso o código **valida e restaura** componentes que a IA mexeu sem declarar.
   Arquivos: `src/hooks/use-chat.ts:49-135`, `src/routes/api/refine.ts`, `src/lib/ai/refine-dashboard.ts:76-229` (validação anti-drift), `src/lib/ai/prompts.ts:8-27` e `:230-291` (prompts).

6. **Autosave com histórico e desfazer**
   Debounce de 2s; ao salvar, empurra o config anterior para `config_history` (máximo 5 entradas) e incrementa `version`. O chat expõe "desfazer" que pega `config_history[0]`.
   Arquivos: `src/hooks/use-autosave.ts:19-100`, undo em `src/hooks/use-chat.ts:137-182`, indicador em `src/components/dashboard/save-status.tsx`.

7. **Fontes de dados e binding assistido por IA**
   Upload de CSV/Excel (parser próprio com detecção de separador, encoding UTF-8/Latin-1 e tipo de coluna), Google Sheets via OAuth, webhook de ingestão (`/api/ingest/$sourceId`) e CRM Pipedrive. Depois a IA sugere qual coluna mapeia para qual campo de qual componente; o mapeamento aprovado é aplicado sobre o config, substituindo o `mockData`.
   Arquivos: `src/routes/sources.tsx` (597 linhas), `src/lib/parsers/csv.ts:40-80` (detecção de tipo), `src/lib/ai/suggest-bindings.ts:25-122` (prompt + parse), `src/lib/ai/apply-bindings.ts:10-116` (agregação/group-by), `src/hooks/use-data-source.ts`, `src/routes/api/bind.ts`.

8. **Insights automáticos (anomalias, tendências, sugestões)**
   Botão "Analisar" no editor manda os dados de todos os componentes (serializados em texto) para a IA, que devolve até 3 insights tipados (`anomaly` | `trend` | `suggestion`) em português. Exibidos como banner horizontal dispensável.
   Arquivos: `src/lib/ai/detect-anomalies.ts:18-157`, `src/routes/api/insights.ts` (GET/POST/PATCH), `src/components/dashboard/insights-banner.tsx`.

9. **Compartilhamento público com senha opcional e contador de views**
   Gera um `share_token`, opcionalmente com senha (SHA-256 com salt, guardada como `salt:hash`). A página `/public/$token` renderiza o canvas em modo somente leitura atrás de um `PasswordGate`. O modal também oferece código de embed.
   Arquivos: `src/routes/api/share.ts:22-186`, `src/routes/api/share/verify.ts`, `src/routes/public.$token.tsx:1-123`, `src/components/dashboard/share-modal.tsx`, `src/components/dashboard/password-gate.tsx`.

10. **Exportação PDF e Excel**
    PDF: `html2canvas` em cada card (`#comp-<id>`) montado em A4 com header/footer e paginação manual. Excel: aba de resumo com os KPIs (valor + variação %) e uma aba por `data_table`.
    Arquivos: `src/lib/export/pdf.ts:45-100`, `src/lib/export/excel.ts:20-50`, `src/components/dashboard/export-menu.tsx:58-70`.

11. **Alertas por métrica com e-mail**
    Alerta é `{metric_path, condition: gt|lt|change_pct, threshold, channel}` amarrado a um dashboard. Um cron do Postgres chama `/api/alerts/check` (segredo no Vault do Supabase, lido por RPC interna) e o envio sai pela Resend, com histórico em `alert_history`.
    Arquivos: `src/routes/alerts.tsx`, `src/components/alerts/alert-form.tsx`, `src/lib/alerts/check-alerts.server.ts`, `src/lib/email/send-alert.ts`, `supabase/setup_alerts_cron.sql`, tipos em `src/types/alert.ts`.

12. **Templates por setor**
    Tabela `templates` com config pronto, filtro por setor (Financeiro, Vendas, Marketing, Jurídico, Projetos, Estoque) e busca. Aplicar um template cria um dashboard já `ready`. Há também `buildTemplateReference()` que injeta um resumo dos templates no prompt de geração como referência de composição — **hoje desligado** (`src/routes/api/generate.ts:200-203`).
    Arquivos: `src/components/templates/templates-page-client.tsx:33-90`, `src/lib/ai/prompts.ts:77-112`.

13. **Cache de geração por hash de prompt**
    O prompt final (original + esclarecimentos) é normalizado (trim + lowercase), hasheado com SHA-256 e procurado nos dashboards `ready` do mesmo usuário; se existir e tiver menos de 24h, o config é reaproveitado sem chamar a IA.
    Arquivos: `src/lib/ai/generate-dashboard.ts:162-168` (`hashPrompt`), `src/routes/api/generate.ts:166-198`.

14. **Rate limit de geração**
    Janela deslizante em memória: 10 gerações por hora por usuário; erro 429 com mensagem "Tente novamente em N minutos".
    Arquivos: `src/lib/rate-limit.ts:1-40`, aplicação em `src/routes/api/generate.ts:65-79`.

15. **Metas (targets) em KPI e período de comparação**
    Cada `kpi_card` pode ganhar `target` + `targetDisplay` ("linear" ou "circular") por um popover de engrenagem no hover, renderizado como barra de progresso. Há também um seletor global de período (Dia/Semana/Mês/Ano).
    Arquivos: `src/components/dashboard/kpi-card.tsx:52-90`, `src/components/dashboard/target-popover.tsx`, `src/components/dashboard/progress-bar.tsx`, `src/components/dashboard/period-selector.tsx`.

16. **Chaves de IA do próprio usuário (BYOK)**
    Em Configurações > IA o usuário cola chave da OpenAI ou Anthropic e escolhe o provedor preferido; fica em `users.api_keys` (JSON). Sem isso, cai no gateway do Lovable.
    Arquivos: `src/routes/settings.tsx:40-70`, `src/lib/ai/provider.ts:24-85`.

17. **Auth e workspace**
    Login/signup por Supabase Auth (`/login`, `/signup`, `/auth/callback`), lista/busca/duplicação/exclusão de dashboards, contadores de fontes/dashboards/templates/alertas na home.
    Arquivos: `src/components/auth/login-signup-form.tsx`, `src/routes/dashboards.index.tsx`, `src/components/dashboard/dashboard-search-list.tsx`, `src/components/dashboard/duplicate-dashboard-button.tsx`, `src/routes/index.tsx:36-127`.

---

## 3. Fluxo de dados / arquitetura

### Caminho do usuário até o dashboard renderizado

```
[Home] usuário digita prompt no HomeHeroChat
   │  createDashboardWithPrompt(prompt)  → INSERT dashboards {status:"generating", original_prompt}
   ▼
[/dashboards/:id/edit] EditorWrapper monta → isGenerating → <DashboardGenerating>
   │  POST /api/generate {prompt, dashboardId}   (Bearer = access_token do Supabase)
   ▼
[servidor] verifica auth → rate limit (10/h) → confere dono do dashboard → lê users.api_keys
   │
   ├─ clarify gate: assessPromptClarity() → se precisar, devolve {status:"clarification_needed", questions}
   │     → UI mostra <DashboardClarify> com chips → usuário responde ou pula → repete POST com clarifications
   │
   ├─ finalPrompt = prompt + "\n\nDetalhes adicionais:\n- k: v"
   ├─ promptHash = SHA256(lowercase(trim(finalPrompt)))  → cache hit (<24h) devolve config salvo
   │
   ├─ UPDATE dashboards SET status='generating', prompt_hash
   ├─ generateDashboardStream() → streamText() → Lovable Gateway (SSE, response_format json_object)
   │     stream é .tee(): um ramo vai para o cliente (SSE), outro grava no banco
   │
   └─ parseResponse(): tira cercas ```json, JSON.parse, valida title+components, corta em 8 componentes
         → UPDATE dashboards SET config=<json>, status='ready'
   ▼
[cliente] polling (2s) vê status='ready' → window.location.reload()
   ▼
[EditorWrapper] useDashboardData({config, bindings}) → transformedConfig
   ▼
[DashboardCanvas] ordena por position.row/col → COMPONENT_REGISTRY[type] → KpiCard | ChartWrapper | DataTable | GoalChart
```

Refinamento: `useChat.sendMessage` → `POST /api/refine` → `refineDashboard()` → `validateRefinement()` → `setConfig()` no editor → `useAutosave` grava 2s depois.

Binding: fonte de dados (`data_sources` + `data_rows`) → `POST /api/bind` → `suggestBindings()` (IA) → usuário aprova no `DataBindingModal` → `dashboards.bindings` → `applyBindings()` em runtime substitui `mockData` pelos dados agregados.

### O "spec" de dashboard — tipos TypeScript (`src/types/dashboard.ts`, íntegra das partes relevantes)

```ts
export interface DashboardConfig {
  title?: string;
  components: DashboardComponent[];
}

export interface ComponentPosition {
  row: number;
  col: number;
  colSpan: number;
}

export type ComponentType =
  | "kpi_card"
  | "line_chart"
  | "bar_chart"
  | "pie_chart"
  | "donut_chart"
  | "area_chart"
  | "data_table"
  | "goal_chart";

export interface DashboardComponent {
  id: string;
  type: ComponentType;
  title: string;
  position: ComponentPosition;
  config: ComponentConfig;
  mockData: ComponentMockData;
  props?: Record<string, unknown>;
}

// --- Component Configs ---

export interface KpiCardConfig {
  value: number;
  previousValue: number;
  format: "currency" | "number" | "percent";
  prefix?: string;
  target?: number;
  targetDisplay?: "linear" | "circular";
}

export interface LineChartConfig {
  xAxis: string;
  yAxis: string;
  data: Array<Record<string, number | string>>;
}

export interface BarChartConfig {
  xAxis: string;
  yAxis: string;
  orientation: "vertical" | "horizontal";
  data: Array<Record<string, number | string>>;
}

export interface PieChartConfig {
  nameKey: string;
  valueKey: string;
  data: Array<{ name: string; value: number }>;
}

export type DonutChartConfig = PieChartConfig;

export interface AreaChartConfig {
  xAxis: string;
  yAxis: string;
  data: Array<Record<string, number | string>>;
}

export interface DataTableColumn {
  key: string;
  label: string;
  type: "text" | "number" | "currency" | "date";
}

export interface DataTableConfig {
  columns: DataTableColumn[];
  data: Array<Record<string, unknown>>;
}

export interface GoalChartConfig {
  xAxis: string;
  actualKey: string;
  goalKey: string;
  data: Array<Record<string, number | string>>;
}

export type ComponentConfig =
  | KpiCardConfig | LineChartConfig | BarChartConfig | PieChartConfig
  | DonutChartConfig | AreaChartConfig | DataTableConfig | GoalChartConfig;

// --- Component Mock Data ---
export type KpiCardMockData = KpiCardConfig;
export type LineChartMockData = Pick<LineChartConfig, "data">;
export type BarChartMockData = Pick<BarChartConfig, "data">;
export type PieChartMockData = Pick<PieChartConfig, "data">;
export type DonutChartMockData = Pick<DonutChartConfig, "data">;
export type AreaChartMockData = Pick<AreaChartConfig, "data">;
export type DataTableMockData = Pick<DataTableConfig, "data">;
export type GoalChartMockData = Pick<GoalChartConfig, "data">;

export type DashboardStatus = "draft" | "generating" | "ready" | "error";

export interface DashboardBindings {
  sourceId: string;
  mappings: Record<string, Record<string, string>>; // componentId → { campo: coluna }
}

export interface BindingSuggestion {
  mappings: Record<string, Record<string, string>>;
  unmapped_components: string[];
  suggestions: string[];
}

export interface GenerateDashboardResponse {
  title: string;
  components: DashboardComponent[];
}

export interface GenerateStreamEvent {
  type: "progress" | "complete" | "error";
  message?: string;
  data?: GenerateDashboardResponse;
}
```

> Observação importante para a reimplementação: existe **duplicação proposital e confusa** entre `config` e `mockData`. Para `kpi_card`, os dois carregam o mesmo objeto; para os gráficos, `config` guarda só os nomes dos eixos e `mockData` guarda `{data: [...]}`. O leitor (`chart-wrapper.tsx:53-57`) faz `mockData?.data ?? config?.data ?? []`. Na nova implementação isso deve virar **um campo só**.

### Prompt de sistema da geração (`src/lib/ai/prompts.ts:114-218`, íntegra)

```
IMPORTANTE — Idioma: Sempre escreva em português brasileiro com acentuação completa e correta. Use "ã", "õ", "ç", "á", "é", "í", "ó", "ú" sempre que necessário. Nunca substitua acentos por letras simples (ex: nunca escreva "nao" em vez de "não", nem "voce" em vez de "você", nem "configuracao" em vez de "configuração"). Todos os títulos, labels e textos visíveis ao usuário devem estar em PT-BR com acentuação correta.

Você é um ESPECIALISTA em design de dashboards de BI para PMEs brasileiras. Sua ÚNICA função é transformar a descrição do usuário em um dashboard JSON profissional, completo e acionável. Você não conversa, não explica, não pede esclarecimentos — você SEMPRE entrega um dashboard.${templateSection}

DETECÇÃO DE DOMÍNIO (analise o pedido e identifique o setor — use isso para escolher os KPIs corretos):

- VENDAS / CRM: receita, ticket médio, taxa de conversão, leads gerados, oportunidades, ranking de vendedores, funil (topo/meio/fundo), receita por produto/região.
- FINANCEIRO: receita, despesas, margem líquida, fluxo de caixa, contas a pagar/receber, DRE simplificado, gastos por categoria.
- MARKETING: CAC, CPL, ROAS, LTV, tráfego por canal (orgânico, pago, social, email, direto), conversão por campanha, ranking de campanhas.
- OPERAÇÕES: SLA, tempo médio de atendimento (TMA), throughput, tickets abertos/fechados, NPS, CSAT, distribuição por tipo/prioridade.
- SAAS: MRR, ARR, churn (logo e revenue), novos clientes, expansão, contração, runway, LTV/CAC, crescimento mensal.
- E-COMMERCE: receita, ticket médio, taxa de conversão, abandono de carrinho, top produtos, vendas por estado/categoria, vendas diárias.
- AGÊNCIA / SERVIÇOS: receita por cliente, horas faturadas, utilização da equipe, projetos em andamento, ranking de clientes, margem por projeto.
- RH / PESSOAS: headcount, turnover, eNPS, contratações vs desligamentos, distribuição por departamento, tempo médio de contratação, absenteísmo.
- LOGÍSTICA: pedidos entregues, tempo médio de entrega, taxa de devolução, estoque por SKU, ranking de transportadoras.
- EDUCAÇÃO: alunos ativos, taxa de conclusão, NPS, ranking de cursos, engajamento, evasão.

Se o pedido não se encaixar em nenhum domínio, escolha KPIs genéricos relevantes (volume, eficiência, satisfação, tendência).

FORMATO DA RESPOSTA (JSON estrito, sem markdown, sem blocos de código):
{
  "title": "Título claro e descritivo em Português (BR)",
  "components": [ /* 5 a 8 componentes */ ]
}

TIPOS DE COMPONENTES E CONFIGS:

1. kpi_card — Cartão com número principal e variação
   config: { "value": number, "previousValue": number, "format": "currency"|"number"|"percent", "prefix": "R$" }
   mockData: (mesmo formato do config)

2. line_chart — Gráfico de linha (série temporal)
   config: { "xAxis": "mes", "yAxis": "valor" }
   mockData: { "data": [{ "mes": "Jan", "valor": 12000 }, ...] }

3. bar_chart — Gráfico de barras (comparativo / ranking)
   config: { "xAxis": "categoria", "yAxis": "valor", "orientation": "vertical"|"horizontal" }
   mockData: { "data": [{ "categoria": "Produto A", "valor": 8500 }, ...] }

4. pie_chart — Gráfico de pizza (distribuição)
   config: { "nameKey": "nome", "valueKey": "valor" }
   mockData: { "data": [{ "name": "Categoria A", "value": 35 }, ...] }

5. donut_chart — Gráfico de rosca (mesmo formato do pie_chart)

6. area_chart — Área (série temporal com preenchimento)
   config: { "xAxis": "mes", "yAxis": "valor" }
   mockData: { "data": [{ "mes": "Jan", "valor": 12000 }, ...] }

7. goal_chart — Meta vs realizado
   config: { "current": number, "target": number, "format": "currency"|"number"|"percent", "prefix": "R$" }

8. data_table — Tabela detalhada
   config: { "columns": [{ "key": "nome", "label": "Nome", "type": "text"|"number"|"currency"|"date" }] }
   mockData: { "data": [{ "nome": "Item 1", ... }, ...] }

REGRAS DE COMPOSIÇÃO (OBRIGATÓRIAS):
- Mínimo 5, máximo 8 componentes.
- Linha 0 (row 0): 3 a 4 kpi_card, cada um com colSpan 1, posições col 0,1,2,3. SEMPRE com previousValue para mostrar variação.
- Linha 1 (row 1): 1 gráfico de tendência (line_chart ou area_chart) + 1 gráfico comparativo (bar_chart). Ambos com colSpan 2.
- Linha 2 (row 2): 1 distribuição (pie_chart ou donut_chart, colSpan 1 ou 2) + opcional 1 data_table (colSpan 2 ou 3).
- IDs sequenciais: comp-1, comp-2, comp-3, ...
- Nunca sobreponha componentes na mesma posição.

DADOS MOCK (REGRAS RÍGIDAS):
- Valores realistas para o mercado brasileiro (R$, escala condizente com PME — receita mensal entre R$ 50k e R$ 5M).
- Séries temporais: 6 meses (Jan a Jun ou os últimos 6 meses).
- Tabelas: mínimo 5 linhas, máximo 10.
- Pizzas/donuts: 4 a 6 fatias.
- Bar charts de ranking: 5 a 8 itens, já ORDENADOS de forma decrescente, título começando com "Top N ...".
- Nomes brasileiros para pessoas (Ana Silva, Carlos Souza, Mariana Costa, etc.).
- Cidades/estados brasileiros (São Paulo, Rio de Janeiro, Belo Horizonte, etc.).
- Produtos com nomes plausíveis em PT-BR.

FORMATO DE TEXTO:
- TODO texto em Português (BR) com acentuação correta. NUNCA use inglês.
- Valores monetários sempre com prefix "R$" e format "currency".
- Percentuais com format "percent" (sem prefix).

EXEMPLO 1 — Pedido: "Dashboard de vendas com funil e ranking"
{
  "title": "Dashboard de Vendas",
  "components": [
    { "id": "comp-1", "type": "kpi_card", "title": "Receita do Mês", "position": { "row": 0, "col": 0, "colSpan": 1 }, "config": { "value": 487000, "previousValue": 412000, "format": "currency", "prefix": "R$" }, "mockData": { "value": 487000, "previousValue": 412000, "format": "currency", "prefix": "R$" } },
    { "id": "comp-2", "type": "kpi_card", "title": "Ticket Médio", "position": { "row": 0, "col": 1, "colSpan": 1 }, "config": { "value": 3250, "previousValue": 3100, "format": "currency", "prefix": "R$" }, "mockData": { "value": 3250, "previousValue": 3100, "format": "currency", "prefix": "R$" } },
    { "id": "comp-3", "type": "kpi_card", "title": "Taxa de Conversão", "position": { "row": 0, "col": 2, "colSpan": 1 }, "config": { "value": 18.5, "previousValue": 15.2, "format": "percent" }, "mockData": { "value": 18.5, "previousValue": 15.2, "format": "percent" } },
    { "id": "comp-4", "type": "line_chart", "title": "Receita - Últimos 6 meses", "position": { "row": 1, "col": 0, "colSpan": 2 }, "config": { "xAxis": "mes", "yAxis": "receita" }, "mockData": { "data": [ { "mes": "Jan", "receita": 320000 }, { "mes": "Fev", "receita": 358000 }, { "mes": "Mar", "receita": 395000 }, { "mes": "Abr", "receita": 412000 }, { "mes": "Mai", "receita": 445000 }, { "mes": "Jun", "receita": 487000 } ] } },
    { "id": "comp-5", "type": "bar_chart", "title": "Top 5 Vendedores", "position": { "row": 1, "col": 2, "colSpan": 2 }, "config": { "xAxis": "vendedor", "yAxis": "receita", "orientation": "horizontal" }, "mockData": { "data": [ { "vendedor": "Ana Silva", "receita": 142000 }, { "vendedor": "Carlos Souza", "receita": 118000 }, { "vendedor": "Mariana Costa", "receita": 95000 }, { "vendedor": "Pedro Lima", "receita": 78000 }, { "vendedor": "Juliana Alves", "receita": 54000 } ] } }
  ]
}

ANTI-PADRÕES (NUNCA FAÇA):
- NUNCA retorne markdown, blocos de código, ou texto fora do JSON.
- NUNCA invente tipos de componente fora dos 8 listados.
- NUNCA use texto em inglês em títulos, labels ou dados.
- NUNCA omita previousValue em kpi_card.
- NUNCA gere menos de 5 ou mais de 8 componentes.
- NUNCA peça esclarecimento — sempre entregue um dashboard, mesmo que o pedido seja vago (use o melhor palpite baseado no contexto).
- NUNCA sobreponha posições (row+col duplicados).
- NUNCA escreva texto sem acentuação (ex: "nao", "voce", "configuracao") — SEMPRE use acentos completos do português brasileiro.

SOMENTE retorne JSON válido. Nada mais.
```

Prompt de usuário (`src/lib/ai/prompts.ts:227-228`):

```ts
export const DASHBOARD_USER_PROMPT_TEMPLATE = (prompt: string): string =>
  `Crie um dashboard com base na seguinte descrição:\n\n"${prompt}"`;
```

### Prompt de refinamento (`src/lib/ai/prompts.ts:230-291`, íntegra)

```
IMPORTANTE — Idioma: Sempre escreva em português brasileiro com acentuação completa e correta. [...idem bloco de idioma...]

Você é um assistente de edição CIRÚRGICA de dashboards com IA. O usuário tem um dashboard existente e quer modificá-lo. Você deve fazer SOMENTE a alteração pedida, sem tocar em nada mais.

Você recebe um resumo estruturado do dashboard atual e um pedido de modificação. Retorne o config JSON COMPLETO atualizado, preservando EXATAMENTE todos os componentes que não foram mencionados pelo usuário.

REGRAS CRÍTICAS PARA REFINAMENTO:
1. SOMENTE modifique os componentes que o usuário menciona EXPLICITAMENTE
2. NUNCA remova, reordene ou modifique componentes que o usuário NÃO mencionou
3. Ao adicionar um componente, insira na próxima posição disponível SEM mover os existentes
4. Ao mudar cores/estilos, aplique SOMENTE ao componente mencionado
5. Ao mudar tipo de gráfico, preserve os dados e apenas troque o tipo
6. Preserve TODOS os IDs dos componentes existentes — NUNCA mude IDs existentes
7. Retorne o config COMPLETO mas com MÍNIMAS alterações
8. Componentes não mencionados devem ser retornados IDÊNTICOS ao original (mesmo config, mockData, position, title)

EXEMPLOS DE COMPORTAMENTO CORRETO:
- Usuário diz "mude o gráfico de barras para pizza" → Mude SOMENTE o componente bar_chart para pie_chart, mantendo dados adaptados. Todo o resto IDÊNTICO.
- Usuário diz "adicione um KPI de ticket médio" → Adicione UM novo componente. NÃO toque nos existentes.
- Usuário diz "remova a tabela" → Remova SOMENTE o componente data_table. Mantenha todo o resto.
- Usuário diz "mude as cores para azul" → Atualize SOMENTE a config de cores. Nada mais muda.
- Usuário diz "mude o título" → Altere SOMENTE o campo title do dashboard. Componentes ficam IDÊNTICOS.

FORMATO DA RESPOSTA (JSON estrito, sem markdown, sem blocos de código):

Se você conseguiu fazer a modificação:
{
  "config": {
    "title": "Título do dashboard",
    "components": [ /* TODOS os componentes — inalterados copiados EXATAMENTE, apenas o(s) mencionado(s) alterado(s) */ ]
  },
  "message": "Descrição curta do que foi feito",
  "modifiedComponentIds": ["id-do-componente-alterado"]
}

Se o pedido não está claro:
{
  "clarification": "Pergunta para esclarecer o que o usuário quer"
}

REGRAS GERAIS:
- SEMPRE retorne o config COMPLETO com TODOS os componentes (modificados e não modificados)
- Novos componentes devem ter IDs sequenciais (comp-N, onde N é o próximo número disponível)
- Mantenha posições (row/col/colSpan) coerentes — não sobreponha componentes
- KPIs ficam na row 0 com colSpan 1
- Gráficos e tabelas ficam nas rows 1+
- Máximo de 8 componentes no total
- Gere dados mock realistas para novos componentes
- Use nomes e dados brasileiros
- Valores monetários em formato brasileiro (R$)
- SOMENTE retorne JSON válido, nada mais
- O campo "modifiedComponentIds" deve listar SOMENTE os IDs dos componentes que você alterou (ou "NEW" para componentes adicionados)

TIPOS DE COMPONENTES SUPORTADOS:
- kpi_card: { value, previousValue, format: "currency"|"number"|"percent", prefix? }
- line_chart: { xAxis, yAxis } + mockData: { data: [...] }
- bar_chart: { xAxis, yAxis, orientation } + mockData: { data: [...] }
- pie_chart: { nameKey, valueKey } + mockData: { data: [{ name, value }] }
- donut_chart: (mesmo formato do pie_chart)
- area_chart: { xAxis, yAxis } + mockData: { data: [...] }
- data_table: { columns: [{ key, label, type }] } + mockData: { data: [...] }
```

Contexto estruturado montado antes desse prompt (`src/lib/ai/prompts.ts:8-27`):

```ts
export function buildRefineContext(config: DashboardConfig, userMessage: string): string {
  const title = config.title ?? "Sem título";
  const componentLines = config.components.map((c, idx) => {
    const dataInfo = summarizeComponentData(c);
    return `${idx + 1}. [${c.type}] "${c.title}" (id: ${c.id}) — ${dataInfo}`;
  });

  return `Dashboard atual: "${title}"
Componentes:
${componentLines.join("\n")}

Pedido do usuário: "${userMessage}"

Retorne o config JSON COMPLETO. Modifique SOMENTE o(s) componente(s) mencionados pelo usuário. Todos os outros devem permanecer IDÊNTICOS.`;
}
```

### Prompt do clarify (`src/lib/ai/clarify.ts:18-60`, íntegra)

```
IMPORTANTE — Idioma: Sempre responda em português brasileiro com acentuação completa e correta. Use "ã", "õ", "ç", "á", "é", "í", "ó", "ú" sempre que necessário. Nunca substitua acentos por letras simples (ex: nunca escreva "nao" em vez de "não", nem "voce" em vez de "você").

Você é um assistente que avalia briefs de dashboards de negócio em português.
Sua tarefa: decidir se o prompt do usuário tem informação suficiente para gerar um dashboard útil com 4-8 KPIs/gráficos relevantes, OU se faltam dados críticos (setor, período, metas, dimensões).

Se o prompt for claro o bastante, responda needs_clarification=false e questions=[].
Se faltarem informações, devolva entre 1 e 3 perguntas curtas, objetivas e em português. Cada pergunta DEVE ter 2-4 sugestões de resposta como chips clicáveis.

Não faça perguntas óbvias se o usuário já respondeu. Seja útil, não burocrático.
```

Tool schema associado:

```ts
const TOOL = {
  type: "function" as const,
  function: {
    name: "assess_clarity",
    description: "Decide se o prompt precisa de esclarecimento",
    parameters: {
      type: "object",
      properties: {
        needs_clarification: { type: "boolean" },
        questions: {
          type: "array",
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              question: { type: "string" },
              suggestions: { type: "array", items: { type: "string" }, maxItems: 4 },
            },
            required: ["id", "question", "suggestions"],
            additionalProperties: false,
          },
        },
      },
      required: ["needs_clarification", "questions"],
      additionalProperties: false,
    },
  },
};
```

Heurística local que evita a chamada de IA (`src/lib/ai/clarify.ts:62-84`):

```ts
const DOMAIN_TERMS = [
  "vendas", "venda", "receita", "faturamento", "lucro", "margem", "ticket",
  "cliente", "lead", "conversao", "funil", "campanha", "roi", "cac", "ltv",
  "estoque", "inventario", "giro", "produto", "categoria",
  "projeto", "tarefa", "prazo", "burndown", "sprint",
  "financeiro", "fluxo", "caixa", "despesa", "custo",
  "marketing", "trafego", "engajamento", "ctr", "cpc",
  "rh", "colaborador", "turnover", "absenteismo",
  "juridico", "processo", "contrato",
  "meta", "kpi", "objetivo", "indicador",
  "mensal", "diario", "semanal", "trimestre", "ano",
];

function localHeuristic(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  if (lower.length < 30) return true;      // muito curto -> precisa esclarecer
  let hits = 0;
  for (const t of DOMAIN_TERMS) {
    if (lower.includes(t)) hits++;
    if (hits >= 3) return false;           // detalhado o suficiente
  }
  return hits < 2;
}
```

Merge dos esclarecimentos no prompt (`src/lib/ai/clarify.ts:192-200`):

```ts
export function mergeClarificationsIntoPrompt(prompt: string, clarifications: Record<string, string>): string {
  const entries = Object.entries(clarifications).filter(([, v]) => v?.trim());
  if (entries.length === 0) return prompt;
  const detalhes = entries.map(([k, v]) => `- ${k}: ${v}`).join("\n");
  return `${prompt}\n\nDetalhes adicionais:\n${detalhes}`;
}
```

### Prompt de binding (`src/lib/ai/suggest-bindings.ts:25-59`, íntegra)

```
IMPORTANTE — Idioma: Sempre responda em português brasileiro com acentuação completa e correta. [...]

Você é uma IA de mapeamento de dados. Dado:
1. Configuração do dashboard (componentes com seus tipos e formato de dados esperado)
2. Colunas da fonte de dados (nome, tipo, valores de exemplo)

Sugira qual coluna mapear para qual campo de cada componente.

TIPOS DE COMPONENTES E SEUS CAMPOS MAPEÁVEIS:

1. kpi_card: campos "value" (número principal) e "previousValue" (valor anterior para comparação)
2. line_chart: campos "xAxis" (eixo X, geralmente data/tempo) e "yAxis" (eixo Y, métrica numérica)
3. bar_chart: campos "xAxis" (categorias) e "yAxis" (valores numéricos)
4. pie_chart: campos "nameKey" (nomes das fatias) e "valueKey" (valores numéricos)
5. donut_chart: campos "nameKey" (nomes das fatias) e "valueKey" (valores numéricos)
6. area_chart: campos "xAxis" (eixo X) e "yAxis" (eixo Y)
7. data_table: não precisa de mapeamento (usa todas as colunas)

REGRAS:
- Mapeie colunas de texto/data para eixos X e nomes
- Mapeie colunas numéricas/monetárias para eixos Y e valores
- Se não houver coluna adequada, adicione o componente em unmapped_components
- Adicione sugestões úteis em português (BR) para o usuário
- Para KPI cards, tente encontrar colunas com valores de valor atual e anterior, ou use a mesma coluna para ambos

Retorne SOMENTE JSON válido no formato:
{
  "mappings": { "<component_id>": { "<field>": "<column_name>" } },
  "unmapped_components": ["<comp_id>"],
  "suggestions": ["<sugestão em português>"]
}
```

### Prompt de insights (`src/lib/ai/detect-anomalies.ts:18-42`, íntegra — note que este está em inglês)

```
You are a data analyst AI specialized in dashboard analysis.
Your task is to analyze dashboard data and identify noteworthy patterns.

Rules:
- Return up to 3 insights maximum
- Write all messages in Brazilian Portuguese
- Be specific: mention metric names, values, and percentages
- Focus on actionable observations
- Keep messages concise (1-2 sentences each)

Return ONLY valid JSON with this structure:
{
  "insights": [
    { "type": "anomaly" | "trend" | "suggestion",
      "message": "Portuguese text describing the insight",
      "data": { "metric": "...", "value": 0, "average": 0 } }
  ]
}

Types:
- "anomaly": values significantly above/below average
- "trend": consistent growth/decline over 3+ periods
- "suggestion": actionable observations
```

### Renderização dos gráficos (Recharts) — `src/components/dashboard/chart-wrapper.tsx`

```ts
const CHART_COLORS = [
  "#6c5ce7", "#a29bfe", "#74b9ff", "#00b894",
  "#fdcb6e", "#e17055", "#fd79a8", "#81ecec",
];

const TOOLTIP_STYLE = {
  backgroundColor: "#1a1a2e",
  border: "1px solid #2a2a3e",
  borderRadius: "8px",
  color: "#e0e0e8",
  fontSize: "12px",
};

function getChartData(component: DashboardComponent): Record<string, unknown>[] {
  const mockData = component.mockData as { data?: Record<string, unknown>[] };
  const config = component.config as { data?: Record<string, unknown>[] };
  return mockData?.data ?? config?.data ?? [];
}
```

Pontos de configuração relevantes: `ResponsiveContainer width="100%" height={300}`; barra horizontal via `layout="vertical"` + eixos invertidos + `YAxis width={100}`; cada barra/fatia recebe cor própria por `<Cell fill={CHART_COLORS[i % 8]}>`; donut com `innerRadius={60} outerRadius={100}` e um `<text>` central com o total formatado em `pt-BR`; rótulo de pizza `${name} ${(percent*100).toFixed(0)}%`.

Formatação de KPI (`src/components/dashboard/kpi-card.tsx:14-37`):

```ts
function formatValue(value: number, format: KpiCardConfig["format"]): string {
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    case "percent":
      return new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value / 100);
    case "number":
      return new Intl.NumberFormat("pt-BR").format(value);
    default:
      return String(value);
  }
}

function calculateVariation(value: number, previousValue: number): number {
  if (previousValue === 0) return value > 0 ? 100 : 0;
  return ((value - previousValue) / Math.abs(previousValue)) * 100;
}
```

### Validação anti-drift do refinamento (`src/lib/ai/refine-dashboard.ts:76-136`)

Lógica essencial a preservar:

```ts
function validateRefinement(original, refined, modifiedIds) {
  const originalMap = new Map(original.components.map((c) => [c.id, c]));
  const restoredComponents = refined.components.map((refinedComp) => {
    const originalComp = originalMap.get(refinedComp.id);
    if (!originalComp) return refinedComp;                    // componente novo

    if (modifiedIds && modifiedIds.length > 0) {
      const wasModified = modifiedIds.includes(refinedComp.id);
      if (!wasModified && !deepEqual(originalComp, refinedComp)) {
        console.warn(`[refine-validate] Component "${refinedComp.id}" was modified by AI but NOT listed in modifiedComponentIds. Restoring original.`);
        return originalComp;                                  // desfaz a deriva
      }
      return refinedComp;
    }

    // Sem modifiedComponentIds: heurística — mesmo tipo + mesmo título mas dados diferentes = deriva silenciosa
    if (refinedComp.type === originalComp.type && refinedComp.title === originalComp.title && !deepEqual(originalComp, refinedComp)) {
      return originalComp;
    }
    return refinedComp;
  });
  return { ...refined, components: restoredComponents };
}
```

### Esquema do banco (Supabase) — tabelas em `src/integrations/supabase/types.ts`

| Tabela | Colunas (Row) |
|---|---|
| `dashboards` | id, user_id, title, original_prompt, prompt_hash, config (Json), config_history (Json), bindings (Json), status, version, created_at, updated_at |
| `chat_messages` | id, dashboard_id, role, content, config_diff (Json), created_at |
| `dashboard_shares` | id, dashboard_id, share_token, active, password_hash, view_count, created_at |
| `data_sources` | id, user_id, name, type, columns (Json), file_path, sheets_id, sheets_range, sync_enabled, last_synced_at, row_count, ingestion_log (Json), api_key, crm_provider, webhook_secret, field_mapping (Json), event_types |
| `data_rows` | id, source_id, data (Json), received_at |
| `insights` | id, dashboard_id, type, message, data (Json), dismissed, created_at |
| `alerts` | id, user_id, dashboard_id, name, metric_path, condition, threshold, channel, active, last_triggered_at, created_at |
| `alert_history` | id, alert_id, value_at_trigger, notification_status, notification_error, triggered_at |
| `templates` | id, name, sector, description, config (Json), sample_data (Json), suggested_prompts, usage_count, created_at |
| `google_tokens` | user_id, access_token, refresh_token, expires_at, updated_at |
| `users` | id, email, full_name, avatar_url, plan, plan_limits (Json), api_keys (Json), stripe_customer_id, created_at, updated_at |

Funções RPC: `get_alerts_check_secret`, `increment_dashboard_version`, `trigger_alerts_check`.

---

## 4. Sacadas / decisões de produto que valem copiar

1. **Prompt de sistema com "detecção de domínio" explícita.** Em vez de pedir "um dashboard", o prompt lista 10 setores com os KPIs canônicos de cada um. Isso transforma um pedido vago ("dashboard de vendas") em um conjunto de métricas que um analista de verdade escolheria. É a sacada mais valiosa do projeto e cabe inteira na suíte.

2. **Regras de composição de layout no próprio prompt.** "Linha 0: 3 a 4 KPIs com colSpan 1; Linha 1: um gráfico de tendência + um comparativo, colSpan 2; Linha 2: distribuição + tabela opcional." A IA devolve um layout que já *parece* um dashboard profissional, sem nenhum motor de layout do lado do código.

3. **Regras rígidas de realismo dos dados fictícios.** Escala de PME brasileira (R$ 50k–5M/mês), 6 meses de série, 4–6 fatias, 5–10 linhas de tabela, rankings já ordenados com título "Top N", nomes de pessoas e cidades brasileiras. Isso é o que faz a demonstração convencer — encaixa perfeitamente no "modo demonstração" que a suíte já exige.

4. **Bloco de idioma no topo de todo prompt.** Instrução explícita e repetida sobre acentuação em PT-BR ("nunca escreva 'nao' em vez de 'não'"). Modelos gratuitos erram acento com frequência; a suíte usa modelos gratuitos por padrão, então isso é diretamente aplicável.

5. **Lista de anti-padrões no prompt.** Um bloco "NUNCA FAÇA" com 8 itens (nada de markdown, nada de tipo inventado, nada de inglês, nunca menos de 5 nem mais de 8 componentes, nunca pedir esclarecimento). Reduz muito a variância de modelos fracos.

6. **Gate de esclarecimento com heurística local antes da IA.** Só chama a IA quando o prompt é ambíguo de verdade; prompt rico passa direto. Economiza chamada e não incomoda quem já escreveu bem. E as perguntas vêm com **chips clicáveis** (2 a 4 sugestões), que é muito mais rápido que digitar.

7. **Sempre é possível pular o esclarecimento.** O botão "Pular e gerar agora" (`skip_clarification: true`) garante que ninguém fica preso num questionário.

8. **Validação anti-drift no refinamento.** Exigir que a IA declare `modifiedComponentIds` e então **restaurar do original** tudo que ela mexeu sem declarar. É a diferença entre um chat de edição confiável e um que estraga o dashboard a cada pedido. Copiar isso.

9. **Resumo estruturado + JSON completo no prompt de refinamento.** Primeiro uma lista legível ("3. [bar_chart] 'Top 5 Vendedores' (id: comp-5) — 5 pontos de dados"), depois o JSON cru para a IA copiar o que não muda. O resumo evita que o modelo se perca no JSON.

10. **Tela de carregamento com etapas por tempo decorrido.** Checklist que avança em 0/4/12/22/32 s com o texto do prompt visível e contador de segundos. Não é progresso real, mas é honesto e reduz a ansiedade dos 20–40 s de geração.

11. **Cache por hash do prompt (24 h).** Prompt normalizado (trim + lowercase) → SHA-256 → reaproveita config pronto. Barato de implementar e evita queimar cota em repetição, o que importa muito com modelos gratuitos e limite diário.

12. **Autosave debounced com histórico rotativo de 5 + desfazer.** Sem botão "salvar", sem perda de trabalho, e o "desfazer" do chat é literalmente `config_history[0]`.

13. **Chips de sugestão por área na home.** Oito chips (Vendas, Financeiro, Marketing, Operações, SaaS, E-commerce, Agência, RH) que preenchem o textarea com um prompt completo e bem escrito. É o "Preencher com um exemplo" da suíte, multiplicado por área. Os textos estão em `src/components/chat/home-hero-chat.tsx:14-55` e são reaproveitáveis palavra por palavra.

14. **Placeholder rotativo no textarea.** Quatro placeholders trocando a cada 4 s, mostrando o formato esperado sem ocupar espaço de tela.

15. **Atalho ⌘/Ctrl+Enter para enviar**, com a dica visível ao lado do botão.

16. **Validação mínima de entrada amigável.** Prompt com menos de 10 caracteres → toast "Descreva com um pouco mais de detalhe (mín. 10 caracteres)", em vez de deixar a IA gerar lixo.

17. **Erros traduzidos por causa.** 429 → "Limite de requisições da IA atingido"; 402 → "Créditos de IA esgotados"; timeout → "Está demorando mais que o normal"; e a tela de erro mostra o prompt original em itálico com botão "Tentar novamente". Alinha com o `ErroIA`/`ErrorBox` que a suíte já tem.

18. **Troca de tipo de gráfico só entre tipos compatíveis.** O popover não oferece "vire uma tabela" para um KPI — evita estados quebrados.

19. **Meta (target) por KPI com barra de progresso.** Configurável por engrenagem no hover, com opção linear ou circular. Transforma um número solto em algo acionável.

20. **Exportar para Excel com aba de resumo de KPIs** (métrica, valor, variação %) além das abas de tabela. Muito mais útil que só PDF para quem vai levar o número para uma reunião.

21. **Compartilhamento público com senha opcional e contador de visualizações**, e rodapé "Criado com ..." na página pública (marketing embutido).

22. **Insights como banner horizontal dispensável**, no máximo 3, com ícone por tipo (💡 sugestão, ⚠️ anomalia, 📈 tendência). Não rouba a tela do dashboard.

23. **Rate limit com mensagem em minutos** ("Tente novamente em 12 minutos"), não em segundos nem em jargão de HTTP.

24. **`status` como máquina de estados no banco** (`draft` → `generating` → `ready` | `error`), com a UI tratando "draft com prompt e sem componentes" também como "gerando" (`src/components/dashboard/editor-wrapper.tsx:96-99`) — evita a tela vazia depois de um refresh no meio da geração.

---

## 5. O que é acidental / dívida do Lovable

1. **Supabase como dependência dura.** Auth, banco, RLS, Storage, Vault, cron. A home já quebra sem ele. Nada disso vai para a suíte, que usa `node:sqlite` via `lib/store.ts`/`lib/historico.ts` e conta própria via `lib/conta.ts`.

2. **Lovable AI Gateway.** Endpoint `https://ai.gateway.lovable.dev/v1/chat/completions` com `LOVABLE_API_KEY` e modelo `google/gemini-3-flash-preview` hardcoded em dois lugares (`src/lib/ai/provider.ts:17-19` e de novo em `src/lib/ai/clarify.ts:3-5`). Substituir por `lib/ai.ts` da suíte (OpenRouter).

3. **Três provedores de IA em paralelo** (Lovable/OpenAI/Anthropic) com três caminhos de código duplicados para `generateText`, `generateTextWithMessages` e `streamText` — ~485 linhas em `src/lib/ai/provider.ts` que na suíte viram chamadas a `askJSON()`.

4. **BYOK (chaves do usuário no banco, em texto plano).** `users.api_keys` é um JSON sem cifra. A suíte já tem coisa melhor: `/setup` com OAuth em um clique do OpenRouter e chaves cifradas em AES-256-GCM (`lib/store.ts`).

5. **Streaming SSE que não streama nada útil.** O `onText` só emite `{type:"progress", message:"Recebendo configuração da IA..."}` — o mesmo texto a cada delta; o JSON só é parseado no fim. O `readable.tee()` com um ramo gravando no banco enquanto o outro vai ao cliente é complexidade sem benefício visível (`src/routes/api/generate.ts:213-275`). Descartar: uma chamada simples + tela de etapas por tempo entrega a mesma percepção.

6. **Polling do banco a cada 2 s para descobrir o fim da geração**, seguido de `window.location.reload()`. Existe porque o servidor grava o resultado por um caminho lateral. Com uma requisição síncrona isso some.

7. **Duplicação `config` vs `mockData`.** Descrita na seção 3. Unificar em um campo `dados` por componente.

8. **`goal_chart` inconsistente.** O prompt descreve `{current, target, format, prefix}`, o tipo TS descreve `{xAxis, actualKey, goalKey, data}` e o componente lê o segundo formato (`src/components/dashboard/goal-chart.tsx:31-36`). Qualquer `goal_chart` gerado pela IA seguindo o prompt renderiza vazio. **Bug real.** Na nova versão: um formato só, ou cortar o tipo.

9. **shadcn/ui inteiro (48 arquivos) com a maioria sem uso** — accordion, carousel, menubar, input-otp, resizable, drawer, breadcrumb etc. `PADRAO.md:13` proíbe bibliotecas de UI na suíte; a tela sai de `components/ui.tsx`.

10. **Recharts.** 8 tipos de gráfico via biblioteca pesada, com cores e tooltip escritos para tema escuro hardcoded (`#1a1a2e`, `#2a2a3e`, `#8888a0`), enquanto o resto do app usa tema claro com tokens. Na suíte não há nenhuma biblioteca de gráfico: `financas-ia/components/GraficoCategorias.tsx` e `GraficoMeses.tsx` fazem barras e série temporal com div/CSS/SVG à mão, com altura fixa em px e rótulo curto no celular. É o caminho a seguir.

11. **Drag & drop com `@dnd-kit` (3 pacotes).** Valor marginal para um produto de demonstração de 2 minutos; a ordem que a IA gera já é boa. Pode ficar de fora da primeira versão.

12. **Exportação PDF via `html2canvas` + `jspdf`.** Pesado, e a suíte já tem a rota `/imprimir/[id]` (impressão do navegador) como padrão de "levar para a reunião".

13. **Integrações externas caras de manter para um app de demonstração:** Google Sheets OAuth (`src/lib/google/*`, `src/routes/api/sheets/*`), Pipedrive (`src/lib/crm/*`, 5 arquivos + verificação de assinatura), webhook de ingestão com tabela `data_rows`. Se algo de fonte de dados entrar, o caminho natural na suíte é **upload de CSV no navegador** (como `financas-ia`) e, opcionalmente, `MCP_DADOS`.

14. **Alertas com cron do Postgres + segredo no Vault + RPC interna + Resend.** A suíte já tem `lib/rotinas.ts` (agendador de 60 s em `instrumentation.ts`) + `lib/notificacoes.ts` (Resend/SMTP/Gmail/Outlook). Reimplementar sobre o que existe, não portar.

15. **Tabela `templates` nunca populada e desligada no código** (`src/routes/api/generate.ts:200-203`: `const templateReference: string | undefined = undefined; void buildTemplateReference;`). A função `buildTemplateReference` está pronta mas morta. Na suíte, "templates" viram uma constante em `lib/demo.ts` ou os chips de sugestão.

16. **Textos em inglês vazando para o usuário.** Rótulos do TypeSwitcher: "Line Chart", "Bar Chart", "Pie Chart", "Donut Chart", "Area Chart", "KPI Card", "Data Table", "Goal Chart" (`src/components/dashboard/canvas.tsx:50-68`); tela de erro do router com "Something went wrong" / "Try again" / "Go home" (`src/router.tsx`); prompt de insights inteiro em inglês. `scripts/verificar-jargao.mjs` reprovaria.

17. **Rate limit em `Map` de memória de processo.** O próprio comentário admite: "For production: migrate to Upstash Redis". Na suíte (um contêiner, uma conta) é aceitável, mas deve ser consciente.

18. **Duplicação de `getUserIdFromBearer`** copiada literalmente em `api/generate.ts`, `api/share.ts`, `api/refine.ts`, `api/insights.ts`, `api/bind.ts`.

19. **Dois componentes de entrada de prompt concorrentes** — `HomeHeroChat` (usado na home) e `PromptInput` (com outro conjunto de chips, extraindo título do prompt). Escolher um.

20. **Design system duplicado.** `src/styles.css` tem 701 linhas com tokens `--via-*` (Viver de IA, Avenir LT Std, navy/blue) *e* tokens shadcn (`--primary`, `--border`, ...) *e* classes legadas de tema escuro usadas pelos componentes de dashboard (`bg-surface`, `text-text-muted`, `border-border`). Fontes Avenir OTF (5 arquivos) em `public/`. A suíte tem Manrope via `next/font/google` e um acento por app.

21. **Dependências mortas ou de infraestrutura Lovable:** `@cloudflare/vite-plugin`, `wrangler.jsonc`, `nitro` beta pinado, `@lovable.dev/vite-tanstack-config` (config opaca), `src/routeTree.gen.ts` (gerado).

22. **`docs/` com 22 arquivos de PRD/épicos/stories/validação** gerados por metodologia BMAD, mais `.lovable/plan.md`. Fonte de ideias de produto, não de código.

23. **Comentários de TODO deixados no código de produção**, ex. `src/hooks/use-autosave.ts:74-75`: "TODO: fix — `increment_dashboard_version` RPC not yet in Database types. Using direct update as fallback".

---

## 6. Padrão do `ai-action-demo`

### Resumo do `PADRAO.md` (103 linhas)

- **Premissa**: 17 apps independentes seguem o mesmo padrão (mais `automl-pocket`, de estrutura própria, e `build-agentflows`). Cada pasta é um projeto Next.js completo, nada compartilhado em tempo de execução. O projeto de referência é `pdi-time/`; "copie a estrutura dele literalmente e adapte só o que o app precisa".
- **Público**: executivos abrem, testam em 2 minutos e decidem se conectam chaves. Logo: tudo funciona sem nenhuma chave (modo demonstração com dados de exemplo plausíveis em português); cada app resolve **um** problema muito bem; interface em PT-BR, sentence case, sem caixa alta, sem setas em botões, **sem jargão técnico na tela**; estados vazios oferecem "Preencher com um exemplo"; erros explicam o que houve e como resolver.
- **Stack**: Next.js 16 (App Router, TS), Tailwind CSS 4, React 19. **Sem bibliotecas de UI.** Só adicionar dependência se for indispensável.
- **IA**: sempre via `lib/ai.ts` (OpenRouter), copiado sem alterar do `pdi-time`.
- **Rotas obrigatórias**: `GET /api/health` → `{ok:true}`; `GET /api/status` → `{ai, demo, model, integrations, setup, usuario, proximos}` com `export const dynamic = "force-dynamic"`.
- **Visual**: copiar `app/globals.css` inteiro trocando **só** `--color-accent`, `--color-accent-2`, `--color-accent-soft`, `--color-accent-ink`; estilos próprios vão depois do marcador `/* Específico deste app */`. Copiar `components/ui.tsx` sem alterar. Estrutura da tela: `Topbar` + `DemoNotice` + `Workspace` com `Panel` (esquerda, formulário) e `Stage` (direita: `Empty` → `Loading` → `<article className="reveal">` ou `ErrorBox`).
- **Economia de texto**: título do hero ≤ 8 palavras; apoio ≤ 20; listas curtas ≤ 5 itens de ≤ 6 palavras; no máximo uma linha de ajuda por campo; descrição de cartão de integração em uma linha.
- **Atalhos de demonstração**: `?exemplo=1` preenche e envia o exemplo; `?captura=1` desliga a rolagem automática.
- **Conta e sessão**: uma conta de administrador por instância; `proxy.ts` (único middleware) exige sessão em toda rota fora de uma lista pública documentada no topo do arquivo; **toda rota nova nasce privada**.
- **Setup sem variáveis de ambiente**: chaves conectadas em `/setup`, gravadas em SQLite cifrado; env, se existir, tem prioridade. Nunca `process.env.X` para chaves — sempre `getConfig("X")`.
- **MCP**: todo app expõe `POST /mcp` (JSON-RPC 2.0 à mão), com `lib/ferramentas.ts` próprio declarando `NOME_SERVIDOR` e `FERRAMENTAS`.
- **Formulários públicos** `/f/<token>` e **rotinas agendadas** são infraestrutura compartilhada.
- **Deploy**: `next.config.ts` com `output: "standalone"`, Dockerfile multi-stage, `render.yaml` **gerado** por `scripts/gerar-deploy.mjs` a partir de `catalogo.json`.
- **Verificação obrigatória antes de encerrar**: `npm install`, `npm run lint` (zero erros), `npm run build`, `node scripts/verificar-jargao.mjs <app>`, e (ao mexer em compartilhado) `scripts/verificar-padrao.sh`; subir o build standalone e testar `/api/health`, `/api/status`, `/api/setup` com curl; capturar `/` e `/setup` em desktop e celular e revisar as imagens.
- **Novo app na suíte** (`PADRAO.md:101-102`): 1) copiar a pasta `pdi-time/`; 2) acrescentar a entrada em `catalogo.json`; 3) `node scripts/gerar-deploy.mjs` + serviço no `docker-compose.yml`; 4) `node scripts/gerar-icones.mjs` e ajustar `metadata.title` em `app/layout.tsx`; 5) push (o workflow constrói imagem, captura prévia e atualiza o catálogo público); 6) tornar o pacote GHCR público à mão.

### Estrutura exata de `pdi-time/` (árvore comentada)

```
pdi-time/
├─ AGENTS.md                  aviso: este Next.js tem breaking changes; leia node_modules/next/dist/docs
├─ CLAUDE.md                  @AGENTS.md + ~60 notas de aprendizado (gotchas por US) — leitura obrigatória
├─ README.md                  o que resolve, stack, rodar, Docker, Render, tabela de variáveis, estrutura
├─ Dockerfile                 multi-stage node:22-alpine; DATA_DIR=/app/data; VOLUME; CMD node server.js
├─ docker-compose.yml         porta 3001:10000 + volume nomeado dados:/app/data
├─ render.yaml                Blueprint GERADO (não editar à mão)
├─ next.config.ts             { output: "standalone" }
├─ postcss.config.mjs         @tailwindcss/postcss
├─ eslint.config.mjs          compartilhado; inclui no-restricted-globals para `alert`
├─ tsconfig.json              paths "@/*"
├─ package.json               deps: next 16.3.5, react 19.2.8, nodemailer. @types/node ^22 (node:sqlite)
├─ proxy.ts                   ÚNICO middleware: exige sessão fora da lista pública; CONTA_DESLIGADA=1 libera tudo
├─ instrumentation.ts         na subida: limpa expirados e agenda executarVencidas() a cada 60 s
├─ .env.example               só alternativas opcionais; nada obrigatório
├─ app/
│  ├─ layout.tsx              fonte Manrope (next/font/google); metadata.title "Nome · IA para Executivos"
│  ├─ globals.css             tokens da suíte; trocar só as 4 cores de acento
│  ├─ pdi.css                 CSS específico do app (importado pela page)
│  ├─ icon.svg                gerado por scripts/gerar-icones.mjs a partir do acento
│  ├─ page.tsx                TELA ÚNICA ("use client"): Hero/Passos, cartões de entrada, Stage com resultado
│  ├─ setup/page.tsx          <SetupPage marca nome area segmento /> + cartões AcessoMCP e Rotinas
│  ├─ conta/page.tsx          criar a conta de administrador (primeira visita)
│  ├─ entrar/page.tsx         login
│  ├─ historico/page.tsx      lista de resultados salvos, filtro por texto no cliente
│  ├─ r/[id]/page.tsx         resultado salvo em página própria (+ not-found.tsx)
│  ├─ imprimir/[id]/page.tsx  versão de impressão (+ ImprimirAoCarregar.tsx, not-found.tsx)
│  ├─ f/[token]/page.tsx      formulário público genérico (+ FormularioPublico.tsx)
│  ├─ mcp/route.ts            endpoint MCP (JSON-RPC 2.0), idêntico em todos os apps
│  └─ api/
│     ├─ health/route.ts      {ok:true} para o Render
│     ├─ status/route.ts      ai, demo, model, vision, integrations, setup, usuario, proximos
│     ├─ setup/route.ts       GET status da configuração; PUT salva ("" mantém, null apaga)
│     ├─ setup/testar/route.ts        testa uma integração contra a API real
│     ├─ setup/oauth/openrouter/**    OAuth PKCE do OpenRouter (conectar a IA em um clique)
│     ├─ setup/oauth/google|microsoft/**  OAuth para enviar avisos pela caixa da pessoa
│     ├─ setup/oauth/mcp/[prefixo]/** OAuth de servidor MCP externo
│     ├─ conta/route.ts, conta/entrar, conta/sair    conta e sessão
│     ├─ historico/route.ts   { itens: listar(200) }
│     ├─ rotinas/**           CRUD de rotinas + executar + executar-agora + código de gatilho externo
│     ├─ f/[token]/route.ts   recebe resposta do formulário público (ÚNICO não copiável: importa o módulo do app)
│     ├─ mcp/token/route.ts   gera/revoga o código de acesso do MCP
│     └─ pdi/**               ROTAS DE DOMÍNIO do app: POST gera, GET lista, DELETE apaga; autoavaliacao, checkins, entregas
├─ components/
│  ├─ ui.tsx                  842 linhas, COPIAR SEM ALTERAR: useStatus, Topbar, DemoNotice, Workspace,
│  │                          Panel, Field, Row, Stage, Empty, Loading, ErrorBox, ResultHead, Section,
│  │                          Item, Chip, DataTable, CopyButton, Hero, Passos, SeloIA, Origem, Aviso,
│  │                          useConfirmacao, lerErro, Entregar, MaisDetalhes, OptInGuardar, Privacidade
│  ├─ setup.tsx               tela genérica de /setup (copiar sem alterar)
│  ├─ conta.tsx               TelaCriarConta / TelaEntrar (copiar sem alterar)
│  ├─ AcessoMCP.tsx           cartão "Usar dentro do seu assistente" (próprio de cada app)
│  ├─ Rotinas.tsx             cartão de tarefas agendadas
│  └─ BuscarEntregas.tsx / DialogoAutoavaliacao.tsx / LembrarCheckins.tsx   componentes de domínio
├─ lib/
│  ├─ ai.ts            [INFRA] OpenRouter: aiEnabled, modelName, askText, askJSON, askVision, askWithTools,
│  │                           parseJSON, ErroIA, interpretarFalha, respostaErro, meta
│  ├─ store.ts         [INFRA] SQLite (node:sqlite) + cifra AES-256-GCM: getConfig/setConfig/getAllConfig
│  ├─ conta.ts / conta-comum.ts  [INFRA] conta de administrador e regras de senha (comum sem imports node:*)
│  ├─ modelos.ts       [INFRA] MODELOS_GRATUITOS, MODELOS_VISAO, MODELO_AUTOMATICO, Opcao, ProximoPasso
│  ├─ setup-comum.ts   [INFRA] 446 linhas: tipos Integracao/Campo, openrouter(), MCP_*, NOTIFICACOES,
│  │                           statusIntegracoes, integracaoConfigurada, baseUrl, enderecoPublico
│  ├─ historico.ts     [INFRA] resultados salvos em SQLite (salvar, listar, listarPorTipo, apagarTodos)
│  ├─ mcp.ts / mcp-cliente.ts / mcp-oauth.ts  [INFRA] servidor e cliente MCP
│  ├─ formularios.ts   [INFRA] formulários públicos /f/<token> e callbacks por tipo
│  ├─ notificacoes.ts  [INFRA] enviar() por e-mail (Resend/SMTP) ou Slack
│  ├─ email-envio.ts   [INFRA] envio pela caixa da própria pessoa (Gmail/Outlook)
│  ├─ rotinas.ts       [INFRA] agendador (diária/semanal/mensal/única) com auto-pausa na 3ª falha
│  ├─ navegacao.ts     [PRODUTO] NAVEGACAO: Início, Histórico, Configurações
│  ├─ ilustracao.ts    [PRODUTO] mapa Segmento → ilustração
│  ├─ integracoes.ts   [PRÓPRIO] 9 linhas: INTEGRACOES = [openrouter(...), QUADRO, NOTIFICACOES]
│  ├─ status-do-app.ts [PRÓPRIO] statusExtra(): chaves de status que não são "integração configurada"
│  ├─ ferramentas.ts   [PRÓPRIO] NOME_SERVIDOR + FERRAMENTAS (ferramentas MCP do app)
│  ├─ rotinas-do-app.ts[PRÓPRIO] registrarExecutor(tipo, fn) + TIPOS_ROTINA
│  ├─ notificacoes-do-app.ts [PRÓPRIO] canalDoLider(), notificacoesProntas()
│  ├─ demo.ts          [PRÓPRIO] respostas de exemplo + esperar(ms) de 900 a 1500 ms
│  ├─ types.ts         [PRÓPRIO] tipos do domínio (PDI, DadosPDI, ...)
│  ├─ pdi.ts           [PRÓPRIO] SYSTEM_PDI + gerarPDI(): a lógica que rota HTTP e ferramenta MCP compartilham
│  ├─ formato.ts / sensivel.ts   helpers sem imports node:* (seguros para client components)
│  └─ autoavaliacoes.ts / checkins.ts / entregas-quadro.ts  [PRÓPRIO] features do domínio
└─ public/
   ├─ ilustracoes/pessoa-<segmento>-{640,NNNN}.webp   ilustrações por segmento (acervo-fonte)
   └─ ilustracoes/icones/<nome>.{webp,png}            15 ícones recortados (compartilhado)
```

### Como o OpenRouter é chamado (`pdi-time/lib/ai.ts`)

- **Endpoint**: `https://openrouter.ai/api/v1/chat/completions` (API compatível com OpenAI).
- **Modelo padrão**: `DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free"`.
- **Reservas**: `FALLBACK_MODELS = ["google/gemma-4-31b-it:free", "nvidia/nemotron-3-ultra-550b-a55b:free"]`, enviadas no campo `models` (fallback nativo do OpenRouter).
- **Headers**: `Authorization: Bearer ${getConfig("OPENROUTER_API_KEY")}`, `Content-Type: application/json`, `HTTP-Referer: getConfig("APP_URL") || "http://localhost:3000"`, `X-Title: getConfig("APP_NAME") || "IA para Executivos"`.
- **Chave**: sempre por `getConfig("OPENROUTER_API_KEY")` (env tem prioridade sobre o SQLite cifrado). Nunca `process.env` direto.
- **Funções**: `aiEnabled()`; `modelName(tarefa?: "padrao"|"avaliacao")`; `askText({system, prompt, maxTokens=4000, temperature=0.4, model?})`; `askJSON<T>({system, prompt, maxTokens?, model?})` — acrescenta ao system `"Responda somente com JSON válido, sem comentários e sem blocos de código markdown."`, usa `temperature: 0.2` e **repete a chamada uma vez** se o parse falhar antes de lançar `resposta_invalida`; `parseJSON<T>()` (tira cercas ```json e recorta do primeiro `{`/`[` ao último `}`/`]`); `askVision({system, prompt, imagem})`; `askWithTools({system, messages, tools, executeTool, maxIterations=8})`.
- **Erros**: um único `interpretarFalha(res, detalheBruto)` traduz status em `ErroIA` com `codigo` (`chave_ausente`, `chave_invalida`, `sem_credito`, `limite_diario`, `fila_cheia`, `modelo_indisponivel`, `entrada_recusada`, `sem_visao`, `provedor_fora`, `rede`, `resposta_vazia`, `resposta_invalida`), `status` e `acao` opcional (`{rotulo, url}`). Detalhe técnico só em `console.error`; nunca na tela; nunca citar caminho de rota na mensagem (dizer "em Configurações"). Toda rota usa `respostaErro(err)` no `catch`.
- **Proveniência**: `meta({demo, insumo, model?})` → `{demo, model, geradoEm, insumo}`, exibido pelo componente `Origem`; `SeloIA` troca "Gerado com Inteligência Artificial" por "Exemplo, sem usar IA" em demonstração.

**Modo demonstração** (`lib/demo.ts` + a função de domínio): o padrão exato está em `pdi-time/lib/pdi.ts:38-52`:

```ts
export async function gerarPDI(dados: DadosPDI, opts: { guardar?: boolean } = {}) {
  const insumo = "entregas recentes e objetivos da empresa";
  if (!aiEnabled()) {
    await esperar(1200);
    const pdiGerado = pdiDemo({ nome: dados.nome, cargo: dados.cargo });
    const metaGerada = meta({ demo: true, insumo });
    const id = idSalvo({ ... });
    return { demo: true, pdi: pdiGerado, meta: metaGerada, id };
  }
  const prompt = `Profissional: ${dados.nome}\nCargo: ${dados.cargo}\n...`;
  const pdi = await askJSON<PDI>({ system: SYSTEM_PDI, prompt });
  ...
}
```

Ou seja: `if (!aiEnabled())` → `await esperar(900..1500)` → devolver o objeto de exemplo tipado de `lib/demo.ts`, **com a mesma forma** da resposta real, e `meta.demo = true`.

### Como o `/setup` guarda chaves

- `lib/store.ts` abre um SQLite em `DATA_DIR/app.sqlite` (`DATA_DIR` = `./data` local, `/app/data` no Docker) usando `node:sqlite` — **sem dependência nova**.
- Toda leitura é `getConfig(chave)`: lê `process.env[chave]` primeiro; se não houver, lê a tabela `config` e **decifra**.
- Toda gravação é `setConfig(chave, valor)`: **cifra sempre** com AES-256-GCM (`node:crypto`), formato `v1:<iv>:<tag>:<cifra>` em base64url, IV de 12 bytes novo por gravação. Valores antigos em texto plano são regravados cifrados na primeira leitura (migração automática).
- Chave mestra: `CHAVE_MESTRA` (32 bytes base64) do ambiente, ou gerada uma vez e guardada em `<DATA_DIR>/chave-mestra` com permissão `0600`. Perder a chave devolve `undefined` (a tela trata como "não configurado"), nunca derruba o app.
- A tela `/setup` é **gerada** a partir de `lib/integracoes.ts` do app:

```ts
// pdi-time/lib/integracoes.ts (íntegra, 9 linhas)
import { openrouter, MCP_TAREFAS, NOTIFICACOES, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que gera o plano de desenvolvimento" });
const QUADRO: Integracao = { ...MCP_TAREFAS, beneficio: "Puxa as entregas da pessoa direto do quadro do time" };

export const INTEGRACOES: Integracao[] = [OPENROUTER, QUADRO, NOTIFICACOES];
```

- `openrouter({visao?, avaliacao?, rotuloModelo?, beneficio?})` (`lib/setup-comum.ts:212-260`) devolve a integração com `oauth: { tipo: "openrouter", rotulo: "Conectar a IA", url: "/api/setup/oauth/openrouter" }` (PKCE), campo `OPENROUTER_API_KEY` (`secret`) e o seletor `OPENROUTER_MODEL` alimentado ao vivo pelo catálogo do OpenRouter (`GET /api/v1/models`, cache de 1 h), agrupado em recomendado/gratuitos/pagos, começando em "Automático" (`MODELO_AUTOMATICO = "auto"`).
- `PUT /api/setup` recebe `{ valores: { CHAVE: valor } }` — string vazia **mantém** o valor, `null` **apaga**. Segredos nunca voltam inteiros ao navegador: a tela mostra mascarado (4 primeiros + 4 últimos) e a origem (`env` ou `banco`).
- `app/setup/page.tsx` é só:

```tsx
<SetupPage marca="P" nome="PDI do Time" area="Recursos Humanos" segmento="RH" />
```

### Como o accent color é definido

Em `app/globals.css`, dentro do `@theme` do Tailwind 4 — **só estas quatro linhas** mudam entre apps:

```css
@theme {
  --color-accent: #692bd4;
  --color-accent-2: #bb5ceb;
  --color-accent-soft: #ede7f9;
  --color-accent-ink: #411490;
  /* ... o resto (bg, surface, ink, line, ok/warn/danger, radii, sombra, fonte) é igual nos 17 apps */
}
:root { --gradiente-acento: linear-gradient(135deg, var(--color-accent), var(--color-accent-2)); }
```

Regras (`PADRAO.md:33-37`): a cor **nunca é inventada à mão** — vem de `tasks/paleta-segmentos.json`, onde o segmento define a família de matiz e cada app ocupa um degrau. `--color-accent-2` é derivado por fórmula fixa (matiz +18°, saturação +12 teto 90, luminosidade +14 teto 66); `soft` (mesma matiz, saturação teto 60, luminosidade 94) e `ink` (saturação +10 teto 85, luminosidade −18 piso 20) idem. `scripts/verificar-paleta.mjs` confere contraste AA ≥ 4,5 contra branco, ΔE (CIE76) ≥ 10 entre segmentos e ≥ 6 dentro do segmento, e que as derivadas batem com a fórmula. O roxo `#692bd4` do `pdi-time` é exceção histórica e **não pode ser reutilizado**. O mesmo acento entra em `catalogo.json` (campo `acento`) e alimenta `scripts/gerar-icones.mjs`, que escreve `app/icon.svg`.

> Nota: a pasta `tasks/` existe no repositório mas está vazia neste clone raso — `tasks/paleta-segmentos.json` **não está presente** no HEAD clonado. Antes de escolher a cor do app novo, confirmar de onde vem esse arquivo (pode estar fora do versionamento) ou calcular a cor pelas fórmulas acima e validar com `scripts/verificar-paleta.mjs`.

### O que é o `render.yaml`

Blueprint do Render (um por app, mais um da suíte na raiz), **gerado** por `node scripts/gerar-deploy.mjs` a partir de `catalogo.json` — não se edita à mão. Conteúdo de `pdi-time/render.yaml` na íntegra:

```yaml
# Blueprint de publicação de PDI do Time (especificação: https://render.com/docs/blueprint-spec)
# Imagem pública publicada pelo GitHub Actions em ghcr.io/startse/pdi-time:latest.
# Nenhuma chave é necessária aqui: após publicar, abra /setup no app e conecte a IA.
# As chaves ficam em SQLite em /app/data. No plano free o disco é efêmero e a configuração se perde a cada deploy.
services:
  - type: web
    name: pdi-time
    runtime: image
    image:
      url: ghcr.io/startse/pdi-time:latest
    plan: free
    region: oregon
    healthCheckPath: /api/health
    envVars:
      - key: PORT
        value: "10000"
    # Para manter a configuração feita em /setup entre deploys (exige plano pago):
    # disk:
    #   name: pdi-time-dados
    #   mountPath: /app/data
    #   sizeGB: 1
```

O gerador também cria o repositório público `StartSe/ai-action-app-deploy` (branch `deploy-<app>` por app) e a página do catálogo em GitHub Pages, tudo disparado por `.github/workflows/publicar.yml` a cada push na `main`.

### Formato de uma entrada em `catalogo.json`

`catalogo.json` é um objeto `{titulo, lead, registro, repoPrivado, repoPublico, paginaPublica, apps: [...]}`. A entrada do `pdi-time`, na íntegra:

```json
{
  "id": "pdi-time",
  "nome": "PDI do Time",
  "areas": ["RH"],
  "problema": "O líder chega à conversa de feedback sem um plano de desenvolvimento pronto.",
  "ia": "Cruza as entregas da pessoa com os objetivos da empresa e gera um PDI de 90 dias.",
  "integracoes": "IA (OpenRouter); quadro de tarefas e avisos por e-mail ou Slack são opcionais.",
  "acento": "#692bd4",
  "porta": 3001,
  "captura": "capturas/pdi-time.png",
  "capacidades": ["artefato", "mcp", "formulario", "rotina"],
  "demo": null
}
```

Campos opcionais documentados no README da raiz: `plano` (`free` | `0.5c-512mb` | legados `starter`/`standard`/`pro`), `discoGB`, `variaveisGeradas`, `aposPublicar`, `padrao: "proprio"` (sai das verificações), `independente: true` (só a camada INFRA é comparada com `pdi-time`), `persistencia: {plano, discoGB, discoGuarda}`, `versao`.

### Apps existentes (19) — não duplicar nenhum

| # | id | Nome | Áreas | Porta | Acento |
|---|---|---|---|---|---|
| 1 | `pdi-time` | PDI do Time | RH | 3001 | `#692bd4` |
| 2 | `agente-kanban` | Agente de Kanban | Gestão, RH | 3002 | `#2e3b7a` |
| 3 | `entrevista-ia` | Entrevistadora IA | RH | 3003 | `#6e3597` |
| 4 | `posts-sociais` | Posts em Minutos | Marketing | 3004 | `#a5185a` |
| 5 | `prospeccao-ia` | Prospecção com IA | Vendas | 3005 | `#0b5789` |
| 6 | `whatsapp-atendente` | Atendente no WhatsApp | Atendimento, Vendas | 3006 | `#0e7c6a` |
| 7 | `contratos-ia` | Leitura de Contratos | Jurídico | 3007 | `#473b91` |
| 8 | `reunioes-ia` | Ata Executiva | Gestão | 3008 | `#465f9b` |
| 9 | `financas-ia` | Analista Financeiro | Financeiro | 3009 | `#0f6b3d` |
| 10 | `voz-do-cliente` | Voz do Cliente | CX, Marketing | 3010 | `#ab36ab` |
| 11 | `radar-sinais` | Radar de Sinais | Estratégia, Inovação | 3011 | `#0a707f` |
| 12 | `bussola-ia` | Bússola de IA | Estratégia, Gestão | 3012 | `#315d48` |
| 13 | `simulador-vendas` | Simulador de Vendas | Vendas | 3013 | `#3e68cc` |
| 14 | `custos-ia` | Custos de IA | Financeiro, TI | 3014 | `#1f8441` |
| 15 | `clone-site` | Clone de Site | Marketing, Produto | 3015 | `#792a3f` |
| 16 | `prospeccao-linkedin` | Prospecção no LinkedIn | Vendas | 3016 | `#0a63c2` |
| 17 | `videos-campanha` | Vídeos de Campanha | Marketing | 3017 | `#cc199d` |
| 18 | `automl-pocket` | AutoML | Dados, Financeiro, Vendas | 3018 | `#0f766e` |
| 19 | `build-agentflows` | Build Agentflows | Gestão | 3019 | `#163669` |

**Próxima porta livre: 3020.** Nenhum app cobre "criar um dashboard a partir de uma descrição". Os dois mais próximos são `financas-ia` (lê um CSV de despesas e mostra números e gráficos de um domínio fixo — financeiro) e `automl-pocket` (treina modelos a partir de planilhas). O app novo é distinto dos dois: **o usuário descreve o painel e a IA decide quais indicadores e gráficos existem**. Vale checar com o time se a fronteira com `financas-ia` fica clara na descrição do catálogo.

### A receita "novo app = cópia de `pdi-time` mudando prompt, tipos, demo, tela, acento + entrada em `catalogo.json`" — conferida contra os arquivos

A receita **está correta em espírito**, mas é incompleta. O que de fato muda ao criar um app novo, verificado arquivo a arquivo:

**Copiar sem alterar** (camada INFRA de `scripts/verificar-padrao.sh:46-69`): `lib/ai.ts`, `lib/store.ts`, `lib/conta.ts`, `lib/conta-comum.ts`, `lib/modelos.ts`, `lib/setup-comum.ts`, `lib/historico.ts`, `lib/mcp.ts`, `lib/mcp-cliente.ts`, `lib/mcp-oauth.ts`, `lib/formularios.ts`, `lib/notificacoes.ts`, `lib/email-envio.ts`, `lib/rotinas.ts`, `app/mcp/`, `app/f/`, `app/api/rotinas/`, `app/api/setup/`, `app/api/status/`, `app/api/conta/`, `app/api/historico/`, `proxy.ts`, `eslint.config.mjs`.

**Camada PRODUTO, também comparada byte a byte** (exceto em apps `independente: true`): `components/ui.tsx`, `components/setup.tsx`, `components/conta.tsx`, `lib/navegacao.ts`, `lib/ilustracao.ts`, `app/globals.css` (com as 4 linhas de acento ignoradas e tudo após `/* Específico deste app */` ignorado), `public/ilustracoes/icones`.

**Só a existência é conferida** (conteúdo próprio): `app/conta/page.tsx`, `app/entrar/page.tsx`, `app/historico/page.tsx`, `app/r/[id]/page.tsx` e `not-found.tsx`, `app/imprimir/[id]/page.tsx` e `not-found.tsx`.

**Trocar de verdade, por app** (a lista real, maior que a da receita):
1. `lib/types.ts` — tipos do domínio.
2. `lib/<dominio>.ts` — o `SYSTEM_...` + a função `gerar...()` compartilhada entre a rota HTTP e a ferramenta MCP (em `pdi-time` é `lib/pdi.ts`).
3. `lib/demo.ts` — resposta de exemplo com a mesma forma da real + `esperar(ms)`.
4. `app/api/<dominio>/**` — rotas de domínio (o `app/api/pdi/**` some).
5. `app/page.tsx` — a tela única, com `PROMESSA`, `PASSOS`, `EXEMPLO`, `VAZIO`, `ETAPAS_CARREGANDO`.
6. `app/<dominio>.css` — CSS específico (importado pela page).
7. `lib/integracoes.ts` — a lista `INTEGRACOES` (9 linhas em `pdi-time`).
8. `lib/status-do-app.ts` — `statusExtra()` (pode ser um stub vazio).
9. `lib/ferramentas.ts` — `NOME_SERVIDOR` (o id do app) + `FERRAMENTAS` do MCP.
10. `lib/rotinas-do-app.ts` — `TIPOS_ROTINA` + `registrarExecutor`.
11. `lib/notificacoes-do-app.ts` — quando o app avisa alguém.
12. `app/setup/page.tsx` — as quatro props `marca`/`nome`/`area`/`segmento` e quais cartões extras aparecem.
13. `app/layout.tsx` — `metadata.title` = `'Nome do app · IA para Executivos'`.
14. `app/icon.svg` — **gerado** por `node scripts/gerar-icones.mjs`, nunca à mão.
15. `app/api/f/[token]/route.ts` — precisa importar o módulo do app que faz `registrarCallback` (por isso nunca é idêntico entre apps).
16. `app/conta/page.tsx`, `app/entrar/page.tsx`, `app/historico/page.tsx` — só a marca/nome/área mudam (divergência registrada em `scripts/padrao-excecoes.json`).
17. `app/globals.css` — as 4 cores + o bloco após `/* Específico deste app */`.
18. `package.json` (`name`), `README.md`, `CLAUDE.md`, `.env.example`, `docker-compose.yml` (porta + volume), `Dockerfile` (só se o app não precisar das credenciais Google/Microsoft — pode-se remover os `ARG`/`ENV`).
19. `catalogo.json` + `node scripts/gerar-deploy.mjs` (gera `render.yaml`) + serviço no `docker-compose.yml` da raiz.

**Desvios / observações que a receita não menciona:**
- `render.yaml` **nunca** é escrito à mão; sai do gerador. A receita, se lida literalmente, sugere editá-lo.
- `app/icon.svg` também é gerado (`scripts/gerar-icones.mjs`).
- `AGENTS.md` é reescrito pelo próprio `next dev` (aviso de que este Next.js tem breaking changes); `CLAUDE.md` é `@AGENTS.md` + as notas do app.
- `CLAUDE.md` do `pdi-time` tem ~60 notas de armadilhas reais (hydration, `react-hooks/set-state-in-effect`, limite de 56 px da barra no celular, `cp -r .next/standalone/.` com o ponto, `next start` não serve build standalone, gotchas do `verificar-jargao.mjs`). É leitura obrigatória antes de escrever a tela.
- `scripts/verificar-jargao.mjs` varre `app/page.tsx` e `components/*.tsx` (exceto `setup.tsx`): palavras como "token", "webhook", "setup" **não podem aparecer nem como nome de variável/campo JSON** nesses arquivos, só nos `route.ts`. Um `fetch("/api/x", {...})` precisa caber em **uma linha** para a regex de isenção funcionar.
- `tasks/paleta-segmentos.json` (fonte da cor) não está presente neste clone.
- Existem duas exceções formais ao padrão: `automl-pocket` (`padrao: "proprio"`) e `whatsapp-atendente` (`independente: true`).

---

## 7. Diferenças-chave a resolver

| # | Origem (Lovable) | Destino (`ai-action-demo`) | O que fazer |
|---|---|---|---|
| 1 | TanStack Start + Vite + TanStack Router (file-based próprio) | **Next.js 16 App Router** | Reescrever roteamento: `src/routes/api/x.ts` → `app/api/x/route.ts`; `createFileRoute(...).server.handlers.POST` → `export async function POST(req: Request)`. Telas viram `app/page.tsx` (client component único). |
| 2 | Supabase (Postgres, Auth, RLS, Storage, Vault, cron) | **SQLite local** (`lib/store.ts`, `lib/historico.ts`) + conta única (`lib/conta.ts`) + rotinas (`lib/rotinas.ts`) | Tabelas `dashboards`/`chat_messages`/`insights`/`templates`/`data_sources` → um `Resultado` em `lib/historico.ts` com `tipo: "dashboard"`, `entrada` (o prompt) e `saida` (o spec). Um app, uma conta, sem `user_id` em lugar nenhum. |
| 3 | Lovable AI Gateway (`gemini-3-flash-preview`) + BYOK OpenAI/Anthropic em texto plano | **OpenRouter** via `lib/ai.ts` (`nemotron-3-super-120b-a12b:free` + reservas), chave em `/setup` cifrada | Trocar `generateText`/`streamText` por `askJSON<DashboardSpec>({system, prompt})`. Apagar `src/lib/ai/provider.ts` inteiro. Erros passam por `ErroIA`/`respostaErro`. |
| 4 | Multi-tenant com login/signup, RLS por `user_id` | Uma conta de administrador por instância; `proxy.ts` exige sessão; toda rota nova nasce privada | Remover `/login`, `/signup`, `/auth/callback`, `getUserIdFromBearer` (5 cópias) e todo `eq("user_id", ...)`. |
| 5 | Recharts (biblioteca) com tema escuro hardcoded | **Nenhuma biblioteca de gráfico**; div/CSS/SVG à mão, tema claro com tokens | Reescrever os 6 tipos de gráfico no estilo de `financas-ia/components/GraficoMeses.tsx` (altura fixa em px, `minmax(0,1fr)` na grade, rótulo curto no celular, `Intl` compacto com espaço não separável trocado) e `GraficoCategorias.tsx` (barras horizontais). Cor da série = `--color-accent`, não uma paleta de 8 cores. **Decisão pendente**: manter 8 tipos ou reduzir para 4–5 (KPI, linha/área, barra, pizza/rosca, tabela). Recomendo reduzir e cortar `goal_chart`, que está quebrado na origem. |
| 6 | shadcn/ui (48 componentes) + Radix + sonner + cmdk + vaul | `components/ui.tsx` (842 linhas, copiar sem alterar) e nada mais | Mapear: Card→`.card`/`Panel`, Button→`.btn-primary`/`.btn-secundario`/`.btn-ghost`, Toast→`Aviso`, Dialog→padrão de `DialogoAutoavaliacao` (montar condicionalmente), Table→`DataTable`, Badge→`Chip`, Skeleton→`.skeleton`. |
| 7 | Tema escuro + tokens `--via-*` + Avenir LT Std (5 OTFs locais) | Tema claro da suíte + Manrope via `next/font/google` + 1 acento por app | Acento novo vindo de `tasks/paleta-segmentos.json` (ou calculado pelas fórmulas e validado por `scripts/verificar-paleta.mjs`). **Não** reusar `#692bd4`. Segmento provável: Gestão/Dados. |
| 8 | Streaming SSE + `tee()` + polling de 2 s + `location.reload()` | Requisição simples com `Loading` e `ETAPAS_CARREGANDO` | Uma chamada `POST /api/dashboard` que devolve o spec pronto; a tela mostra as etapas por tempo decorrido (a sacada #10 sobrevive sem streaming). |
| 9 | Sem modo demonstração: sem chave, tudo quebra | **Obrigatório**: `if (!aiEnabled())` → `esperar(1200)` → objeto de `lib/demo.ts` com a mesma forma | Escrever 3 a 4 dashboards de exemplo completos (vendas, financeiro, marketing/SaaS) em `lib/demo.ts`, escolhidos por palavra-chave do prompt para o exemplo não parecer aleatório. |
| 10 | Rotas `/dashboards`, `/dashboards/:id/edit`, `/sources`, `/templates`, `/alerts`, `/settings`, `/help` (7 telas) | **Tela única** (`PADRAO.md:28`), só `prospeccao-ia` é exceção | Colapsar em: painel esquerdo (prompt + chips + campos) e `Stage` direita (dashboard). Histórico vai para `/historico` (já existe). Configurações vão para `/setup` (já existe). Alertas viram `lib/rotinas-do-app.ts`. |
| 11 | CSV/Excel/Sheets/webhook/Pipedrive com tabelas `data_sources`+`data_rows` | Sem banco de dados externo | Primeira versão: **só mock gerado pela IA** (é o que vende a demonstração). Se for preciso dado real, upload de CSV processado no pedido (padrão `financas-ia`) e, no máximo, a integração `MCP_DADOS` que já existe em `lib/setup-comum.ts`. |
| 12 | Alertas com cron do Postgres + Vault + RPC + Resend | `lib/rotinas.ts` (executor de 60 s em `instrumentation.ts`) + `lib/notificacoes.ts` | Um tipo de rotina "resumo do dashboard" ou "alerta de indicador" registrado em `lib/rotinas-do-app.ts`, usando `ResultadoRotina.enviar: false` quando não houver o que avisar. |
| 13 | Export PDF (`html2canvas`+`jspdf`) e Excel (`xlsx`) | `app/imprimir/[id]/page.tsx` (impressão do navegador) já existe | Usar a rota de impressão. Excel só se for indispensável (`xlsx` é dependência nova; `PADRAO.md:13` exige justificativa). **Atenção**: o `CLAUDE.md` do `pdi-time` registra um bug aberto de paginação de `DataTable` em `/imprimir`. |
| 14 | Link público `/public/$token` com senha e contador | `app/r/[id]` (resultado salvo) e `/f/<token>` (formulário público) | `/r/[id]` cobre "abrir o dashboard salvo". Um link público de verdade fora da sessão exigiria entrar na lista pública do `proxy.ts` com justificativa — provavelmente não vale na v1. |
| 15 | Autosave a cada 2 s + `config_history` + desfazer | Sem autosave na suíte; resultado é salvo uma vez em `lib/historico.ts` | Manter um histórico em memória no cliente para "desfazer" no chat de refinamento e gravar o estado final com `atualizarSaida(id, novaSaida)` (já existe em `lib/historico.ts`). |
| 16 | Drag & drop com `@dnd-kit` (3 pacotes) | Sem dependências extras | Cortar da v1. Se o reordenar for essencial, botões "subir/descer" nativos. |
| 17 | Rótulos em inglês na UI ("Line Chart", "Something went wrong"), prompt de insights em inglês | `scripts/verificar-jargao.mjs` reprova jargão e a suíte é 100% PT-BR | Traduzir tudo: "Gráfico de linha", "Gráfico de barras", "Rosca", "Tabela". Traduzir o prompt de insights. Cuidado com as palavras proibidas do verificador em `app/page.tsx` e `components/*.tsx`. |
| 18 | `config` + `mockData` duplicados; `goal_chart` com dois formatos incompatíveis | — | Unificar em um campo por componente e cortar ou consertar `goal_chart` ao definir os tipos em `lib/types.ts`. |
| 19 | Rate limit em memória (10/h) por `user_id` | Uma conta por instância; os modelos gratuitos já têm limite diário do OpenRouter | Provavelmente dispensável; `ErroIA("limite_diario")` já explica o que fazer. |
| 20 | Cache de 24 h por hash do prompt, no Postgres | SQLite disponível | Vale reimplementar: `getConfig`/tabela própria ou uma busca em `lib/historico.ts` por hash do prompt. Economiza cota gratuita. |
| 21 | Sem MCP | Todo app expõe `POST /mcp` | Declarar em `lib/ferramentas.ts` ao menos `criar_dashboard` (prompt → spec) e `listar_dashboards`, chamando **a mesma função** `gerarDashboard()` da rota HTTP. |
| 22 | Sem `/api/health` nem `/api/status` | Obrigatórios | Vêm da cópia do `pdi-time`; só `lib/status-do-app.ts` precisa de atenção (pode ser stub vazio). |
| 23 | Deploy em Cloudflare Workers (`wrangler.jsonc`) | Docker → GHCR → Render (Blueprint gerado) | Apagar `wrangler.jsonc`; usar o `Dockerfile`/`docker-compose.yml` do `pdi-time`, entrada em `catalogo.json` (porta **3020**) e `node scripts/gerar-deploy.mjs`. |
| 24 | 22 documentos de PRD/stories em `docs/` | Não existe `docs/` por app na suíte | Aprendizado vai para o `CLAUDE.md` do app novo. |

### Recomendação de recorte para a v1

Manter: prompt → spec (com o prompt de detecção de domínio, regras de composição e regras de dados fictícios praticamente inteiros), chips de sugestão por área, gate de esclarecimento com heurística local e chips, tela de carregamento por etapas, refinamento por chat com validação anti-drift, render de KPI/linha/barra/pizza/tabela à mão, modo demonstração, salvar em histórico, imprimir, MCP.

Cortar da v1: Supabase, auth multiusuário, fontes de dados externas, binding por IA, alertas com cron, drag & drop, export PDF/Excel por biblioteca, link público com senha, templates em banco, `goal_chart`, BYOK.

