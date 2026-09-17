@AGENTS.md

## Banco de dados: SQLite via libsql (Onda 2, desde a US-013)

`src/db/index.ts` abre `SQLITE_PATH` (default `./data/pocket.db`) com
`@libsql/client` + `drizzle-orm/libsql` — não `better-sqlite3`: o driver
better-sqlite3 só aceita `db.transaction((tx) => {...})` **síncrono**, e há
transações assíncronas em `(app)/datasets/actions.ts`/`prepare/actions.ts`.
Client singleton em `globalThis` (sobrevive ao hot reload do `next dev`); as 4
PRAGMAs de abertura (`journal_mode=WAL`, `busy_timeout=5000`,
`foreign_keys=ON`, `synchronous=NORMAL`) disparam sem `await` — arquivo local,
a chamada nativa completa antes do Promise resolver.

`src/db/schema.ts` usa `sqliteTable`, não `pgTable`. Sem enum nativo: cada
antigo `pgEnum` é um array `as const` exportado (`DATASET_STATUSES`,
`DEPLOYMENT_TYPES`, …) + `text(col, { enum: ARRAY })` na coluna; o union type
vem de `(typeof ARRAY)[number]`. PK é sempre `text` com
`.$defaultFn(() => crypto.randomUUID())` (helper `id()` local ao arquivo).
Datas são `integer(col, { mode: "timestamp_ms" })` (epoch ms; `Date` no TS dos
dois lados, nunca string ISO). Boolean é `integer(col, { mode: "boolean" })`.
FK forward-reference/autorreferente usa `AnySQLiteColumn` (equivalente do
`AnyPgColumn`), ex.: `datasetId: text(...).references((): AnySQLiteColumn =>
datasets.id)`.

`scripts/migrate.mjs` (rodado no CMD do Dockerfile, fora do Next) fala direto
com `@libsql/client` e replica o migrator do Drizzle à mão (mesma tabela
`__drizzle_migrations`, mesmo hash/`when`, split em `--> statement-breakpoint`)
— NÃO importe `drizzle-orm` nele: o node_modules do runner standalone não tem
o pacote e o container morre no boot com ERR_MODULE_NOT_FOUND (erro que o
`next dev`/`tsx` nunca mostram). Sem advisory lock, porque o Pocket é
instância única (nunca há réplica concorrente disputando o arquivo). `drizzleAdapter` do Better Auth (`src/lib/auth.ts`) usa
`provider: "sqlite"`.

Idiomas puros do Postgres (`jsonb`, `::uuid`, `now()`, `pg_advisory_lock`,
`ilike`, `FOR UPDATE`) não têm equivalente e precisam ser reescritos ao tocar
qualquer `sql\`...\``cru que ainda os use — não é automático só por trocar o
schema/driver. Mapeamento usado em`training-eta.ts`(US-014):`col->>'chave'`→`json_extract(col, '$.chave')` (devolve o valor já tipado,
sem cast, mesmo em coluna `text(col, {mode:"json"})`); `jsonb_typeof(x) =
'number'` → `json_type(col, '$.chave') IN ('integer', 'real')`; `sum()`/
`count()` no libsql (`@libsql/client`, `intMode`default`"number"`) já
devolvem `number`— sem o`Number(sql<string>...)`que o`pg` exigia.

## CSV gerado no client

Todo CSV que o usuário baixa do produto (previsão, predição em lote) precisa
abrir no Excel pt-BR sem passar pelo assistente de importação:

- BOM UTF-8 (`﻿` na frente do conteúdo, equivalente ao `utf-8-sig` do worker)
- separador `;` e vírgula decimal (`toLocaleString("pt-BR", { useGrouping: false })`
  — sem separador de milhar, para não confundir o parser)
- quebra de linha `\r\n` e campo com `;`/`"`/quebra entre aspas duplas escapadas
- download com `Blob` + `URL.createObjectURL` e `revokeObjectURL` logo após o
  `click()` do `<a>` temporário

Referência: `buildForecastCsv` em `(project)/projects/[projectId]/predict/forecast-sections.tsx`.

## Estado de UI que precisa sobreviver a refresh/voltar

Quando um passo de fluxo precisa ficar na URL (ex.: o tipo de modelo escolhido no
Prever, `?tipo=prever|previsao`), **não** use `router.push` — ele refaz o RSC e
recarrega a página inteira só para trocar um search param. Use o History API
nativo, que o App Router sincroniza com `useSearchParams`:

```ts
const kind = kindFromParam(useSearchParams().get("tipo"));
window.history.pushState(null, "", `${window.location.pathname}?${params}`);
```

`pushState` gera entrada de histórico (o botão voltar desfaz o passo);
`replaceState` não. O estado local que depende disso deve ser **derivado** do
param a cada render — nunca duplicado em `useState`, senão o voltar do navegador
dessincroniza a tela.

Para **auto-selecionar** um valor do param (ex.: pular a tela de escolha quando
só há uma opção), derive o default no render (`paramKind ?? default`) e espelhe
na URL num `useEffect` com `replaceState` — um `pushState` no effect criaria a
entrada de histórico sem o param, que o voltar re-dispararia (loop). Qualquer
`useState` cujo initializer lia o param deve continuar lendo o param **cru**,
não o valor com default aplicado.

Referência: `PredictView` em `(project)/projects/[projectId]/predict/predict-view.tsx`.

O lint (React Compiler, `react-hooks/set-state-in-effect`) proíbe `setState`
síncrono no corpo de um `useEffect` — "limpar estado quando X muda" não pode
virar effect. Use o padrão react.dev "adjusting state when a prop changes"
(setState durante o render, guardado por comparação com o valor anterior);
`setState` dentro de callbacks/async continua permitido.

## Configuração de treino: servidor é a fonte da verdade

Todo campo novo do formulário do Prever tem que existir em **três** pontos, ou
o retreino perde a configuração:

1. validação + persistência em `training_jobs.config` (`predict/actions.ts`)
2. leitura/normalização do config no `predict/page.tsx` (jobs antigos não têm a
   chave — sempre `normalizeX(config?.chave)` com default explícito) e repasse
   no objeto `model` que vai para `PredictView`
3. estado inicial + reset em `predict-view.tsx` (`resetForecastOptions`), usado
   por "Trocar tipo de modelo" (volta aos defaults) e por "Retreinar modelo" /
   "Cancelar" (volta aos valores do modelo vigente)

A validação client-side (ex.: horizonte 1–365) **espelha** a do servidor e só
desabilita o botão; a mensagem em pt-BR fica duplicada nos dois lados de
propósito — o servidor nunca confia no client.

Os selects de eixo temporal e campo de identificação vivem na **sidebar** do
Prever (US-009), não na área de configuração à direita — lá ficam só as
Configurações avançadas.

A sidebar do Prever só é renderizada com um tipo definido (`sidebarKind`:
`model.modelKind` em modo relatório, `kind` da URL em modo configuração); na
tela de escolha do tipo ela não existe no DOM. Campo novo na sidebar precisa
funcionar nos dois tipos ou ser condicionado por `sidebarKind`, e estado que
precisa sobreviver ao esconder/mostrar fica no `PredictView` (a sidebar
desmonta). O foco vai para "Buscar coluna" só na transição oculta → visível
(ref com o valor anterior), para não roubar foco no carregamento do relatório. Em modo relatório eles aparecem desabilitados
refletindo o modelo vigente; `resetForecastOptions` reseta os dois junto com os
campos avançados.

Campo que aponta para uma **coluna** do dataset (eixo temporal, campo de
identificação) tem uma exigência extra no passo 2: só pré-carregar se a coluna
ainda existir **com o tipo esperado** nas `dataset_columns` atuais — o Preparar
pode ter renomeado, removido ou mudado o tipo dela depois do treino. Caso
contrário o `<select>` recebe um valor sem `<option>` correspondente e renderiza
vazio, mas o estado ainda envia o valor morto no submit.

Referência: `forecastHorizon`/`aggregation`/`forecastModel` (Configurações
avançadas da previsão temporal) e `timeColumn`/`idColumn` (colunas).

## Relatório de forecasting: tudo lê a "visão ativa"

Com o ID Field (`insights.forecast.series`), o `ForecastingReport` é um client
component com um `<select>` "Série" no header: `undefined` = agregado (as chaves
de topo do insights, idênticas ao relatório de série única) e uma série = as
chaves daquela subsequência.

Seção nova do relatório **nunca** lê `insights.history` / `insights.predictions` /
`insights.backtest` / `insights.seasonality` direto — lê as variáveis derivadas
de `active`, senão a seção fica presa no agregado quando o usuário troca de
série. Só `frequency`, `frequencyLabel` e `horizons` continuam vindo do topo: são
os mesmos para todas as séries.

Duas armadilhas do shape multi-série (worker, US-016):

- `series[].mape` pode ser `null` (nem o baseline convergiu) e `series[].backtest`
  pode estar **ausente** — as duas checagens são obrigatórias
- o `id` de uma série pode ser a **string vazia** (grupo sem identificador), então
  o `<select>` seleciona por índice, não por id

Quem controla a visão ativa é o `ForecastingReport`: qualquer seção que **troque**
de série (a tabela "Séries", por exemplo) recebe `onSelect(index)` como prop em vez
de guardar seleção própria — o índice é o da lista já ordenada por `points` desc.

Referência: `(project)/projects/[projectId]/predict/forecasting-report.tsx`.

## Arquivos gerados no servidor (planilha modelo, exports)

`src/lib/spreadsheet-template.ts` define um template (`columns` + `rows`) e gera
CSV (`buildTemplateCsv`) e XLSX (`buildTemplateXlsx`, exceljs) a partir dele —
template novo reutiliza os builders, não os copia.
Regras para os dados de exemplo sobreviverem ao upload no worker:

- **inteiros nas colunas numéricas**: o worker converte com `pd.to_numeric`
  (ponto decimal) e o Excel pt-BR grava vírgula — decimal quebra num dos lados
- **repetir valores** nas colunas numéricas: inteiros todos únicos viram `id`
  na inferência do worker (`_classify_numeric`), não `number`
- alvo por último; datas em `AAAA-MM-DD`
- rodar o arquivo gerado por `read_dataset_file` + `infer_and_normalize` no
  container do worker antes de mudar a amostra (ver progress.txt, US-004)

Body binário em `NextResponse` precisa ser `Uint8Array<ArrayBuffer>` — o
`Buffer` do `writeBuffer()` do exceljs não tipa como `BodyInit`; copie com
`new Uint8Array(buffer)`. Download autenticado: `getApiUser` +
`Content-Disposition: attachment` + `Cache-Control: no-store` + `logAudit`
(referência: `api/templates/planilha-modelo/route.ts`).

Fronteira client/servidor: `spreadsheet-template.ts` importa exceljs e só pode
entrar em rotas/actions. Componentes client usam `src/lib/template-links.ts`
(`TEMPLATE_FORMATS`, `TEMPLATE_SOURCES`, `templateDownloadHref`) e o componente
`components/app/template-download-links.tsx` (`TemplateDownloadLinks` com
`source` de `TEMPLATE_SOURCES` para a auditoria; `ExpectedFormatNotice` é o bloco
fixo de formato esperado). Novo ponto de entrada da planilha modelo reutiliza
esses dois em vez de montar a URL na mão.

## Tela de progresso do treino: tempo e estimativas

`training_jobs.updated_at` é tocado pelo worker a cada passo do progresso (e a
cada atualização de candidatos), então **não** serve como "início do treino".
O único carimbo estável é `created_at` (é o que `page.tsx` passa como
`startedAt` para a linha "Treinando há …"); `retryTraining` não o reseta, então
um retreino após falha conta a partir do job original.

Toda duração mostrada ao usuário nessa tela passa pelos helpers puros de
`src/lib/training-eta-format.ts` (`FALLBACK_DURATION_SECONDS`,
`ETA_RANGE_FACTORS` 0,7x/1,5x, `formatDurationRange`, `formatElapsed`) — é o
módulo **client-safe**, o único que `training-progress.tsx` pode importar.
`src/lib/training-eta.ts` é `server-only`: re-exporta tudo do format e traz
`estimateTrainingDuration({ problemType, rowCount })` (mediana de
`training.succeeded` dos últimos 30 dias por tipo + faixa de linhas, com LEFT
JOIN em datasets pelo `metadata.datasetId`; < 5 amostras → mediana do tipo →
tabela fixa; medianas cacheadas 5 min por processo, `resetTrainingDurationCache`
nos testes; falha de banco não lança) e `estimateQueueWait(trainingJobId, own)`
(faixa até o treino terminar contando a fila: `getTrainingQueueSnapshot` em
`queue.ts` dá ativos com `processedOn` + posição/`ahead` em waiting;
`simulateQueueWait` distribui restante dos ativos e jobs à frente pelos slots de
`trainingConcurrency()`; `{ minSeconds, maxSeconds, position, total,
waitSeconds, totalSeconds, own }`; null se o Redis falhar ou o tipo não tiver
estimativa; jobs sem linha em training_jobs usam a estimativa própria como
proxy). `TRAINING_CONCURRENCY` é lida pelo web com o mesmo default (2) do
`training_concurrency()` do worker — mudar um exige mudar o outro e o compose.
Dois detalhes do `estimateQueueWait`: `startedAt` é o `processedOn` do próprio
job quando ele está ativo (o início real do treino; `page.tsx` prefere isso a
`created_at` para "Treinando há …"/"Restam …") e `options.pending: true` trata
um job ainda fora do Redis como último de waiting (snapshot expõe `waiting`
inteiro para isso) — é como `startTraining` calcula o `etaSeconds` gravado em
`training.start` antes do enqueue. `loadTrainingJobInfo(jobId)` dá o
`{ problemType, rowCount }` de um job existente (null sem problemType no
config). A UI recebe só `{ minSeconds, maxSeconds, ownSeconds }` (`TrainingEta`
em training-progress.tsx): em queued mostra a faixa + "Posição na fila", em
running "Restam …" = `remainingSeconds(ownSeconds, decorrido)`; sem estimativa
omite as linhas de tempo e mantém só posição/decorrido.
Estimativas novas devem devolver `{ minSeconds, maxSeconds }` e reaproveitar
esses helpers em vez de formatar minutos na mão. Helper novo que precise de
banco/Redis entra em `training-eta.ts`; helper puro entra em
`training-eta-format.ts`. Tudo que consulta Redis/banco é injetável por
`options` (`store`, `snapshot`, `jobInfoStore`, `concurrency`, `now`) — os
testes não sobem BullMQ.

Relógio no client (`now`) começa `null` e só ganha valor no mount/tick do
polling — inicializar com `Date.now()` no `useState` gera divergência de
hidratação porque o servidor renderiza outro instante.

Estado `succeeded` da tela (PRD US-007): **sem redirect automático**. A tela
mostra "Ver relatório do modelo" (→ `/projects/{id}/predict`) e "Voltar aos
projetos" (→ `/projects`), textos em `src/lib/training-progress-copy.ts`
(client-safe). Copy nova dessa tela vai nesse módulo, nunca literal no JSX.
Seletor de CDP: `[data-training-succeeded-actions] a`.

## Rotas de API: Cache-Control

Toda rota em `src/app/api/**` responde com `Cache-Control: no-store` via
`src/lib/http-headers.ts`: o handler exportado (`GET`/`POST`) só faz
`return withNoStore(await handleX(request, ctx))` e a lógica fica numa função
interna. Isso cobre também as respostas de `getApiUser`/`enforceRateLimit` sem
tocar nelas. SSE usa `CACHE_CONTROL_NO_STORE_STREAM` ("no-store, no-transform"),
que `withNoStore` preserva. Rota nova segue o mesmo par (wrapper + função).
As rotas públicas autenticadas por chave (`/api/v1/*`, `/api/mcp`) usam
`withPublicApiHeaders` (no-store + `X-Content-Type-Options: nosniff`) em TODA
saída, inclusive o 500 do try/catch e o 405 — e os handlers em `src/lib`
(`handleApiPredict`, `handleMcpRequest`) já aplicam o mesmo wrapper por dentro,
para os testes travarem os headers sem Next. É idempotente: aplicar nos dois
lugares é o esperado.

Rota com lógica que precisa de teste sem Next/Redis segue o padrão de
`src/lib/api-predict.ts`: o handler vive em `src/lib` e recebe as bordas
externas por um objeto de deps (sessão, rate limit, orçamento); o
`route.ts` só faz o wiring com as implementações reais. Não exportar nada além
dos métodos HTTP de um `route.ts` (o build do Next valida os exports).

### Política de origem das rotas internas (`internalApiPolicy`)

`src/lib/internal-api.ts`: rota interna (consumida pelo app com a sessão do
usuário — upload, rows, download, batch) chama
`const denied = await internalApiPolicy(request); if (denied) return denied;`
logo no início do handler e exporta `export const OPTIONS = optionsNoCors;`
(204 sem nenhum `Access-Control-*`, então o preflight de outro site falha).
`INTERNAL_ORIGIN_MODE` off|report|enforce (default report): cross-origin é
`Sec-Fetch-Site: cross-site` OU `Origin` presente e diferente da origem de
`BETTER_AUTH_URL` (`appOrigin()`); sem `BETTER_AUTH_URL` só o Sec-Fetch-Site
decide. Report grava `authz.cross_origin` (metadata `path`, `origin`, `via`,
`mode`, `method`) e segue; enforce responde 403 pt-BR. NÃO aplicar em
`/api/v1/*`, `/api/mcp` nem `/api/auth/*` (server-to-server / Better Auth).
Nunca adicionar `Access-Control-Allow-*` em rota interna. Teste: injetar
`{ mode, expectedOrigin, audit }` (ver `__tests__/internal-api.test.ts`).
Aplicada em: datasets/upload, rows, download, layout,
templates/planilha-modelo e `app/[slug]/batch` — sempre como PRIMEIRA linha
do handler (antes de `headers()`/`getApiUser`) e com `withNoStore(denied)`.
`__tests__/internal-routes-cors.test.ts` varre TODOS os `src/app/**/route.ts`
(fs + import dinâmico, `vi.mock("server-only")` e `@/lib/audit` mockado):
toda rota fora de `/api/v1`, `/api/mcp` e `/api/auth` precisa exportar
`OPTIONS` e responder 403 a Origin estranho em enforce antes de tocar
sessão/banco/Redis — rota nova sem isso quebra o teste de propósito. Rota
nova server-to-server (sem sessão, chave no header) deve entrar em
`EXCLUDED_PREFIXES` do teste e ficar documentada em SECURITY.md ("CORS e
origem").

## Sem cotas nem planos

Não existe cota de armazenamento (`lib/storage-quota.ts` e `STORAGE_QUOTA_MB`
saíram) nem cota de predições (`lib/inference-quota.ts` saiu no Pocket
US-006): o único limite de upload é `MAX_UPLOAD_MB` por arquivo. A tela de
Configurações tem só os cards Conta e Sessão — não reintroduzir selo de
plano ("Plano: …") nem barra de consumo. `datasets.size_bytes` e
`models.size_bytes` continuam gravados, mas nada os soma na UI.

## Autenticação dos deployments publicados (API e MCP)

`/api/v1/predict` e `/api/mcp` autenticam pela chave do deployment. O caminho
canônico é `Authorization: Bearer <chave>`; os fallbacks são `api_key` no body
(API, compat que será descontinuada) e `?token=` na URL (MCP, clientes só com
campo de URL). Regras que não podem regredir:

- o parse do header é único: `bearerKey` em `src/lib/api-keys.ts` — não
  reimplementar a regex em outra rota
- header presente **manda**: inválido ou fora do esquema Bearer responde 401
  sem tentar o body/query (senão vira vetor de tentativa dupla por request)
- rate limit e lookup usam sempre `hashApiKey(chave)`, nunca a chave em claro
- a auditoria (`api.predict`, `mcp.predict`) recebe `keyLocation`
  (`header|body` / `header|query`) — é a métrica de migração; canal novo de
  chave precisa ampliar o tipo `ApiKeyLocation`/`McpKeyLocation`
- exemplos de código na UI (`deploy/api/api-config.tsx`, `deploy/mcp/mcp-config.tsx`)
  mostram só o header; o body continua funcionando, mas não aparece nos exemplos
- **todo 401 passa por `deps.onAuthFailed(attemptedKey)`** (função
  `unauthorized` nos dois handlers — nunca responder 401 por outro caminho):
  em produção é `recordApiAuthFailure` (`src/lib/api-auth-failures.ts`), que
  grava `api.auth_failed` { channel, keyPrefix (`apiKeyPrefix` ou null), ip }, conta
  por IP em `API_AUTH_FAIL_RATE_LIMIT` (só em 401) e, ao estourar, grava
  `api.auth_bruteforce_suspected`; em `API_AUTH_FAIL_MODE=enforce` devolve a
  429 que substitui o 401. A chave tentada vai em claro para o helper (só o
  prefixo é gravado); header fora do esquema Bearer / sem chave = `null`
- chave inexistente e deployment despublicado respondem a **mesma** mensagem
  (`INVALID_KEY_MESSAGE` / `MCP_INVALID_KEY_MESSAGE`) — o finder devolve null
  nos dois casos e o handler não distingue; testes travam isso
- formato da chave (US-038): `generateApiKey` gera `dos_live_` + 32 bytes
  base64url; `api_key_prefix` é `apiKeyPrefix(chave)` = `dos_live_` + 4 chars
  (chaves antigas `ak_`: 8 chars) — `attemptedKeyPrefix` do auth-failures usa
  o MESMO helper, para o evento casar com a UI. `hashApiKey` não pode mudar
  (invalidaria toda chave gravada; teste com hash fixo trava isso)
- rotação/revogação (US-038): regras puras em `src/lib/api-key-rotation.ts`
  (`rotateKeyValues`, `REVOKED_KEY_VALUES`, `matchApiKeyHash`, `hasAnyKey`,
  `ROTATION_GRACE_MS` = 24 h). Os finders de `deployments.ts` buscam por
  `or(api_key_hash, previous_api_key_hash)` e decidem a graça em TS com
  `matchApiKeyHash` — a regra de expiração vive num só lugar; não a
  reimplementar em SQL. Deployment `published` com `api_key_hash` NULL =
  revogado (recusa tudo até `rotateKeyDeployment`, que nesse caso só gera a
  nova). `publish`/`unpublish` zeram `previous_*` (publicar de novo não é
  rotação). `regenerateKeyDeployment`/`regenerate*Key` são aliases de
  rotate mantidos por compat — a UI (US-039) usa `rotateApiKey`/`revokeApiKey`
  e `rotateMcpKey`/`revokeMcpKey`
- UI da chave (US-039): `components/app/deployment-key-controls.tsx` é o
  ÚNICO lugar com o bloco da chave (revelada / ativa / revogada, com "Chave
  anterior expira em HH:MM" e "Último uso"), os botões Rotacionar/Revogar e
  os diálogos — `api-config.tsx` e `mcp-config.tsx` só guardam estado
  (`keyPrefix`, `revealedKey`, `previousKeyExpiresAt`) e chamam as actions.
  Os diálogos são componentes controlados exportados (`RotateKeyDialog`,
  `RevokeKeyDialog`, `UnpublishDialog`, props `open`/`onOpenChange`/
  `onConfirm`/`consumersLabel`) e os rótulos vivem em `KEY_ACTION_LABELS`:
  `DeploymentKeyActions` (botões da API) e o menu "Mais ações" do cabeçalho
  fixo do MCP montam os MESMOS diálogos — texto novo entra lá, nunca na tela.
- Cabeçalho fixo das telas de deployment (PRD UX 2026-09, US-001):
  `components/app/deployment-page-header.tsx` (`DeploymentPageHeader`, client,
  genérico: `backHref`/`backLabel`, `title`, `statusBadge`, `primaryAction`
  `{ label, icon, onClick, disabled, pending, disabledReason }`, `menuItems`
  `{ label, icon, onSelect, disabled, destructive }`). `sticky top-0 z-20`
  dentro do `<main overflow-y-auto>` do layout do projeto; abaixo de `sm` a
  ação primária é duplicada numa barra `fixed bottom-0` (a do header fica
  `hidden sm:inline-flex`), então o conteúdo da tela precisa de `pb-24 sm:pb-8`.
  `disabledReason` vira o `title` do botão desabilitado — a tela deriva a
  razão das mesmas constantes que mostra junto dos campos. Itens de menu que
  abrem diálogo só fazem `setConfirmX(true)`; o `AlertDialog` fica montado ao
  lado do header (fora do `DropdownMenu`). A tela da API ainda usa o layout
  antigo; ao migrá-la, reutilizar este componente.
  `page.tsx` seleciona `previousKeyExpiresAt`/`lastUsedAt`/`lastUsedIp` e
  converte as datas para ISO antes de passar ao Client Component. Textos
  relativos usam `useClientClock()` (null no SSR) + helpers puros de
  `src/lib/deployment-key-format.ts` (`formatRemainingHHMM`, `formatLastUsed`,
  `formatRelativeAgo`). `keyPrefix === null` com `published` = revogada
  (botão vira "Gerar nova chave" e dispara sem confirmação)
- Disclosure por estado da tela MCP (PRD UX 2026-09, US-002):
  `mcp-config.tsx` renderiza DOIS layouts a partir do mesmo estado —
  rascunho é coluna única `max-w-2xl` só com o passo Configurar (nome,
  descrição, campos com contador "N de M campos selecionados" e lista
  `max-h-[40vh]`) + faixa "Depois de publicar, conecte a:" (chips não
  clicáveis de `FEATURED_AGENT_IDS` e um chip "e outros" com `Tooltip`
  listando o resto de `AGENTS`, envolto em `TooltipProvider` local — não há
  provider global); publicado (US-003) é a tela "Conectar", coluna única
  `max-w-3xl` na ordem chave → "Escolha seu agente de IA" (busca + grade
  `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`, link `data-mcp-generic-link`
  que seleciona `other`) → bloco `data-mcp-instructions="{agentId}"` logo
  abaixo da grade → `<details>` "Configuração do servidor"
  (`data-mcp-details="server-config"`, summary "{título} · N campos" +
  `Badge` `data-mcp-unsaved` quando `dirty`) → Tool predict → Boas
  práticas. Não existe mais bloco "Endpoint MCP": a URL só aparece dentro
  das instruções (`buildInstructions`). Ao trocar `agentId`, um `useEffect`
  faz `scrollIntoView({ block: "nearest", behavior })` no bloco de
  instruções — `smooth` só sem `prefers-reduced-motion`; o bloco tem
  `scroll-mb-24 sm:scroll-mb-4` por causa da barra inferior fixa. O
  formulário do passo 1 é UM JSX (`configForm`) colocado em um dos
  dois ramos — não duplicar campos. Os dois ramos têm `key="draft"` /
  `key="published"` no container: sem isso o React reaproveita os
  `<details>` pela posição e o estado `open` nativo vaza de um layout para o
  outro ao publicar/despublicar. "Tool predict — N parâmetros" e "Boas
  práticas de segurança — 4 itens" são `<details>` nativos fechados
  (`CollapsibleSection`, local ao arquivo, com `detail`/`badge` opcionais no
  summary) nos dois layouts; o corpo das
  boas práticas vem de `SecurityPracticesList` (só a `<ol>`, exportada de
  `deployment-key-controls.tsx` ao lado de `DeploymentSecurityPractices`,
  que continua sendo o card com título usado pela tela da API) e o título
  de `SECURITY_PRACTICES_TITLE`. O aviso âmbar "Publique o servidor
  primeiro" e qualquer `disabled={!published}` deixaram de existir: em
  rascunho a seção de agentes simplesmente não é renderizada. Atributos
  para verificação via CDP: `data-mcp-layout="draft|published"`,
  `data-mcp-field-counter`, `data-mcp-connect-later`,
  `data-mcp-details="server-config|tool-predict|security-practices"`,
  `data-deployment-key="revealed"` (bloco da chave em claro, `border-primary`
  - aviso `KEY_REVEAL_NOTICE` com `role="status"`, compartilhado com a tela
    da API), e o stepper é `ol[aria-label="Etapas"]` com `aria-current="step"`
    no `<li>` atual. Para contar elementos interativos visíveis via CDP use
    `el.checkVisibility({ contentVisibilityAuto: true })` — o conteúdo de um
    `<details>` fechado ainda devolve `getBoundingClientRect` não nulo.
- canais descontinuados (US-039): `api_key` no body e `?token=` na URL
  respondem com `withDeprecation` (`http-headers.ts`: `Deprecation: true`) em
  TODA resposta dessa origem, inclusive 401/429 — decidido pelo `location` da
  chave resolvida, nunca pelo status. Sem `Link rel="deprecation"` desde que
  `/docs` saiu (Pocket US-006). Testes travam header presente/ausente por canal
- logs: rota de API/MCP nunca faz `console.*` com `request.url` — usa
  `requestLogContext(request)` (`audit.ts`; `{ method, url, ip }` com a URL
  passada por `scrubUrl`, que remove `token`). Os dois `route.ts` embrulham
  o handler em try/catch → 500 JSON + `console.error` com esse contexto.
  `requestMeta` aceita `Headers` ou `Request` e continua sem URL
- limites de payload da API (US-040): o teto de linhas NÃO fica no schema Zod
  — `apiPredictMaxRows()` lê `API_PREDICT_MAX_ROWS` a cada request (default
  `DEFAULT_API_PREDICT_MAX_ROWS` = 500, derivado do maior `metadata.rows` de
  `api.predict` em `audit_logs`; inválido avisa 1× e cai no default,
  `resetApiPredictWarnings` nos testes) e acima dele é **413**
  (`payloadTooLargeMessage`), não 422. Body > `API_PREDICT_MAX_BODY_BYTES`
  (1 MB) também é 413: checa `Content-Length` antes de ler e depois o tamanho
  real em UTF-8 (`request.text()` + `TextEncoder`, nunca `request.json()`
  direto). Tudo isso antes de rate limit/lookup. `deploy/api/page.tsx` passa
  `maxRows={apiPredictMaxRows()}` para o texto de limites da UI bater com a
  rota
- higiene de erro: mensagens de erro da API/MCP são fixas em pt-BR e nunca
  usam `issue.input` nem o valor recebido — `validationMessage` troca a
  mensagem padrão do Zod para item de `rows` inválido por texto fixo. Teste
  novo de erro deve mandar um marcador (ex.: `SEGREDO-4242`) no payload e
  afirmar que ele NÃO volta no corpo. As `PredictionError` do worker também
  são fixas; se o worker ganhar mensagem com valor da linha, a API precisa
  filtrar
- Origin no MCP (US-040): `handleMcpRequest(request, deps, { expectedOrigin })`
  recusa com 403 (`MCP_FORBIDDEN_ORIGIN_MESSAGE`) qualquer `Origin` presente
  que não seja a origem de `BETTER_AUTH_URL` (`appOrigin()`/`originMatches`
  de `src/lib/app-origin.ts`, módulo puro compartilhado com
  `internal-api.ts`) — inclusive `Origin: null` e `BETTER_AUTH_URL` ausente.
  Roda ANTES de extrair a chave: não conta em `onAuthFailed` nem no rate
  limit. Não há modo report (o MCP nunca é chamado por navegador). Sem
  `Origin` (clientes MCP reais) nada muda. `tools/list` continua com
  `predict` + `model_info`, as duas presas ao deployment da chave — não
  registrar tool que enxergue outro deployment/modelo
- bloco "Boas práticas de segurança" (US-040): `DeploymentSecurityPractices`
  - `SECURITY_PRACTICES` (4 itens) em `deployment-key-controls.tsx`,
    renderizado no fim da coluna de exemplos das duas telas; texto novo entra
    na constante, não nas telas
- último uso: `touchDeploymentLastUsed(deploymentId, ip)`
  (`src/lib/deployment-last-used.ts`) roda no callback `audit` das duas rotas
  em `Promise.all` com o `logAudit`; throttle por `SET NX EX 60`
  (`deployment:last-used:<id>`), fail-open sem Redis, nunca lança, e o UPDATE
  preserva `updated_at` (`updatedAt: sql\`${deployments.updatedAt}\``, senão o
  `$onUpdate`do schema tocaria a coluna a cada uso). Deps injetáveis`store`/`persist`/`now`

Testes: `__tests__/api-predict.test.ts` (helper `bearerRequest`) e
`__tests__/mcp-predict.test.ts` (`rpcRequest` com `key`/`queryKey`/`origin`) — o
`makeDeps` de ambos registra as chaves tentadas em `calls.authFailures`;
`__tests__/api-auth-failures.test.ts` cobre o helper com `FakeRedisStore` +
`audit` injetado e `vi.stubEnv("API_AUTH_FAIL_MODE", …)`;
`__tests__/api-key-rotation.test.ts` cobre graça/revogação/throttle com
`FakeLastUsedStore` (SET NX EX com relógio) e `vi.mock` de `@/db` e
`@/lib/queue` — o SQL dos finders foi validado por script tsx contra o
SQLite local.

## Status de dataset (`dataset_status`) e revisão de layout

- A lista de valores vive em `DATASET_STATUSES` (schema.ts) e o union `DatasetStatus`
  deriva dela. Todo Record/switch por status na UI usa
  `satisfies Record<DatasetStatus, …>` (com `null` para os status que aquele
  componente não trata): adicionar um valor ao enum quebra o typecheck em cada
  ponto até ser tratado. Pontos hoje: `datasets-view.tsx`, `dataset-picker.tsx`,
  `prepare-pending.tsx` e `src/lib/dataset-status.ts`.
- `src/lib/dataset-status.ts` é client-safe (só `import type` do schema):
  `DATASET_STATUS_LABEL`, `isDatasetProcessing` (polling da UI) e
  `isDatasetSelectable` (vínculo a projeto). Não importar `datasetStatusEnum`
  em Client Components — use o tipo.
- `needs_review` (US-023) NÃO é processamento: o worker parou esperando o
  usuário confirmar abas/cabeçalho/orientação. Fica fora do seletor de vínculo
  (query da página de datasets do projeto + `isDatasetSelectable` no
  `selectDataset`), o Prepare redireciona para a tela "Revisar planilha" com
  `?projectId=` (US-027; sem loop porque aquela página só redireciona quando o
  dataset NÃO está mais em needs_review).
- `datasets.layout_diagnosis` (shape `LayoutDiagnosis`, produzido por
  `apps/worker/jobs/layout.py`) e `datasets.parse_options`
  (`DatasetParseOptions`, aplicadas pelo parse do worker) são jsonb nulos por
  padrão — mudar campos exige atualizar os dois lados.
- `LAYOUT_REVIEW_ENABLED` (`layoutReviewEnabled()` em `src/lib/layout-review.ts`,
  default false; aceita true/1/yes/on) só liga/desliga a exibição do fluxo de
  revisão no web; quem pausa em `needs_review` é o worker, lendo a mesma env.
- `POST /api/datasets/[datasetId]/layout` (US-025) recebe as escolhas da tela
  "Revisar planilha": `handleDatasetLayout` em `src/lib/dataset-layout.ts`
  (deps injetáveis `getApiUser`, `findDataset`, `saveOptions`, `enqueueParse`,
  `markEnqueueFailed`; `route.ts` só faz o wiring). Elegível =
  `isLayoutReviewable`: `needs_review`, ou `error` com `parse_options` já
  preenchido (retentativa após um parse com opções); `error` do parse
  automático fica de fora (o fluxo ali é reenviar o arquivo). Antes de gastar
  um job, `validateAgainstDiagnosis` confere as escolhas contra
  `layout_diagnosis` e responde 400 com as MESMAS mensagens de
  `apps/worker/jobs/parsing.py` (aba inexistente; `combine` entre grupos
  diferentes) — mudar o texto lá exige mudar `missingSheetMessage`/
  `incompatibleSheetsMessage` aqui; sem diagnóstico a rota confia no worker.
  Grava `parse_options` + `status='parsing'` + `error_message=NULL` +
  `current_version_id=NULL` ANTES do enqueue (o worker lê a linha ao pegar o
  job; a versão ativa cai porque o reparse regrava o Parquet original — as
  linhas/arquivos de `dataset_versions` antigas ficam órfãs, limitação
  conhecida); falha na fila → `error` com as opções mantidas, então o dataset
  continua elegível. Depois de gravar E enfileirar, dep `audit` grava
  `dataset.layout_reviewed` (US-028) com `layoutReviewedMetadata` —
  `{ needsReview, sheets: n, combined, headerRow, transposed }`, nunca nomes
  de aba nem conteúdo; 4xx/500 não auditam.
- Avisos de estrutura ruim (US-028): o dataset:profile do worker grava
  `layout_diagnosis.warnings` (`LAYOUT_WARNINGS`/`LayoutWarning` em schema.ts:
  `unnamed_columns`, `mostly_empty_columns`; campo opcional — diagnósticos
  anteriores ao profiling não têm) SEM mudar o status. `isLayoutReviewable`
  aceita `ready` só com avisos (`hasLayoutWarnings`), então o banner e a tela
  reabrem a revisão de um dataset pronto e a rota reprocessa por cima. UI:
  `components/app/layout-warning-banner.tsx` (`LayoutWarningBanner`, client-
  safe; Prepare passa `layoutWarnings`/`layoutReviewHref` ao `PrepareView`),
  badge "Formato suspeito" + "Revisar planilha" na lista (`DatasetRowData.
layoutWarnings` — a página manda só os códigos, nunca o diagnóstico inteiro,
  que tem o preview da planilha), aviso âmbar no topo do `LayoutReviewForm`
  quando `status === "ready"`. Helpers em dataset-layout-form.ts:
  `layoutWarnings` (filtra códigos desconhecidos), `hasLayoutWarnings`,
  `describeLayoutWarnings`, `LAYOUT_WARNING_LABEL`. Planilha modelo a partir do
  banner usa `source="layout_warning"` (`TEMPLATE_SOURCES`).
- Tela "Revisar planilha" = `/datasets/[datasetId]/review` (US-026/US-027):
  `page.tsx` (server) usa `findDatasetScoped` com auditoria (id vem da URL),
  404 fora da org e `redirect("/datasets")` quando `!isLayoutReviewable` — a
  mesma regra da rota, de propósito, para tela e rota nunca discordarem
  (dataset em `error` com `parse_options` reabre a tela com o erro no topo;
  `ready` com `warnings` reabre com o aviso âmbar).
  A flag `LAYOUT_REVIEW_ENABLED` NÃO gateia a página nem os atalhos para um
  dataset JÁ em needs_review (botão "Revisar planilha" da lista, redirect do
  Prepare): um dataset pausado precisa de saída mesmo com a flag desligada.
  `?projectId=` (só UUID; `layoutReviewNavigation` em dataset-layout-form.ts)
  define `doneHref` (Prepare do projeto ou `/datasets`) e o link de voltar
  (seletor de datasets do projeto — nunca o Prepare, que mandaria de volta);
  o redirect da página quando `!isLayoutReviewable` usa o mesmo `doneHref`.
  Links para a tela sempre via `layoutReviewHref(datasetId, projectId?)`.
  "Confirmar e continuar" faz `fetch` POST na rota; 202 → fase "processing"
  com polling pela server action `getLayoutReviewStatus` (review/actions.ts,
  2,5 s) até o status sair de `parsing` → `router.push(doneHref)` (profiling
  e ready são cobertos pelo destino); `error` → banner no topo com as
  escolhas intactas (estado do client não é descartado; num reload,
  `savedOptions` recompõe). Não usar `router.refresh()` para esse polling: a
  página redireciona assim que o dataset entra em `parsing`. 400 → mensagem
  da rota inline; 409 → mensagem + `router.refresh()`. Bloco "Orientação" só
  com `orientation === "transposed"` na aba selecionada; a prévia "como
  ficará" é `transposePreview(preview, headerRow)`, que espelha
  `parsing._transpose` do worker (1ª coluna vira cabeçalho) — mudar um exige
  mudar o outro. Rodapé usa `TemplateDownloadLinks source="review"`
  (`TEMPLATE_SOURCES` inclui "review").
  O estado do formulário (`layout-review-form.tsx`, client) é o payload da
  rota (`ParseOptions` = `DatasetParseOptions`) e só muda pelos helpers puros
  de `src/lib/dataset-layout-form.ts` (`initialParseOptions`, `chooseSheet`,
  `chooseCombineGroup`, `chooseHeaderRow`, `chooseTranspose`,
  `combinableGroups`, `formatSheetSize`) — módulo client-safe que também é dono de
  `MAX_LAYOUT_SHEETS` (`dataset-layout.ts` só re-exporta; ele importa
  `next/server` e não pode entrar em Client Component). Detalhes do
  diagnóstico que a UI depende: `preview` são as 8 primeiras linhas FÍSICAS
  da aba, então o índice da linha no preview é o `headerRow`; `rowCount` é da
  amostra (≤ 50) e vira "50+ linhas" no limite; `id` de input por posição
  (nome de aba pode ter espaço).

## Problema de negócio do projeto (`problem_description`)

`projects.problem_description` (texto livre, até 1000 chars). Regras:

- limite, rótulo, placeholder e o schema Zod vivem em `lib/project-problem.ts`
  (client-safe, sem `@/db`); a server action `updateProjectDescription`
  (`(app)/projects/actions.ts`) valida com `parseProblemDescription` e o
  textarea usa o mesmo `PROBLEM_DESCRIPTION_MAX_LENGTH` — não duplicar
  mensagens nem limites. Vazio/só espaços vira `null`, nunca string vazia.
- o campo compartilhado é `components/project/problem-description-field.tsx`
  (criação e edição); o card com o botão "Editar" é
  `components/project/problem-description-card.tsx`, renderizado na página do
  projeto sem dataset (`/projects/[id]`, "Escolha uma fonte de dados").
- auditoria sem o texto: `project.update_description` leva só `projectName`,
  `hasDescription`, `descriptionLength`.

## Troca de senha (`/change-password` do Better Auth)

Endpoint nativo do Better Auth (`authClient.changePassword({ currentPassword,
newPassword, revokeOtherSessions })`), sem rota própria. Constantes e helpers
client-safe em `lib/password-change.ts` (`PASSWORD_MIN_LENGTH` — a única fonte
do `emailAndPassword.minPasswordLength` de auth.ts —, `PASSWORD_CHANGE_PATH`,
`PASSWORD_CHANGE_RATE_LIMIT` no formato `{ window, max }` do Better Auth,
mensagens pt-BR, `validateNewPassword`, `passwordChangeErrorMessage`); a
auditoria fica em `lib/password-change-audit.ts` (`auditPasswordChange`, com
`audit` injetável) e é chamada pelo `loginAuditPlugin` — o endpoint gira a
sessão quando `revokeOtherSessions` é true (`newSession` preenchido e a sessão
da requisição já apagada), então o usuário vem de `newSession?.user ??
getSessionFromCtx(ctx)`. O sucesso só grava `auth.password_changed`: o email
"Sua senha foi alterada" saiu no Pocket (US-005) — não recriar
`buildPasswordChangedEmail`/`sendEmail` aqui. Senha atual errada é `APIError` 400 com
`body.code === "INVALID_PASSWORD"`; o rate limit é o do próprio Better Auth
(`rateLimit.customRules[PASSWORD_CHANGE_PATH]`, por IP, memória, ligado só em
produção por padrão) e responde 429 — a UI mapeia por `status`/`code`, nunca
pelo texto. Não confundir com o `enforceRateLimit` do Redis usado nas rotas de
API: os formatos das regras são diferentes.

UI (Pocket US-011): sem card "Segurança" próprio — o botão outline "Alterar
senha" de `components/app/change-password-dialog.tsx` (`ChangePasswordDialog`,
recebe só `email`) fica dentro do card **Conta** de `(app)/settings/page.tsx`,
condicionado a `hasPasswordAccount` (mesma checagem de antes). O diálogo usa
`PasswordInput` (components/auth) nos 3 campos, a
checklist em tempo real vem de `passwordRequirements({ current, next })`
(derivada de `validateNewPassword`, `met: false` com o campo vazio; o
`mismatch` fica como erro sob "Confirmar nova senha", não na checklist), a
checkbox "Encerrar sessões em outros dispositivos" começa marcada e o submit
fica desabilitado enquanto `validateNewPassword` devolve issues, a senha atual
está vazia ou há requisição em andamento. Erro → `passwordChangeErrorMessage`;
sucesso → toast `PASSWORD_CHANGE_SUCCESS_TOAST` e o diálogo troca o formulário
por `passwordChangeSuccessMessage(email)` + botão "Fechar". Não chama `router.refresh()`: com
`revokeOtherSessions` o Better Auth devolve o cookie da sessão nova na própria
resposta, então este dispositivo continua logado sem nada a recarregar.

## Scripts que rodam no Dockerfile (fora do runtime do Next)

Hoje só `scripts/migrate.mjs` roda no CMD do runner (`node scripts/migrate.mjs
&& node server.js`), e ele fala direto com `@libsql/client` sem importar nada
de `@/…`. A conta única NÃO é criada por script nem por env: com `users` vazia
a primeira visita cai em `/setup` (ver seções abaixo). Se algum dia um script
novo precisar reusar código do app (`@/db`, `@/lib/auth`, …) e rodar via
`node` puro no container, saiba que `node_modules` do runner
(`.next/standalone/node_modules`) NÃO tem drizzle-orm/better-auth/bcryptjs/
bullmq/ioredis como pacotes reais (o Next os embute nos chunks das rotas). A
solução que funcionou (bootstrap.ts, removido na PRD "primeiro acesso e envs")
era compilar com esbuild para um único arquivo autocontido: `esbuild
scripts/x.ts --bundle --platform=node --format=esm --target=node22
--banner:js="import { createRequire as __cr } from 'node:module'; const
require = __cr(import.meta.url);" --outfile=scripts/x.mjs` — o banner é
obrigatório (ioredis/bullmq fazem `require()` dinâmico de módulos nativos),
o artefato gerado não é commitado (`.gitignore` + `globalIgnores` do eslint) e
só o teste em runtime (`node scripts/x.mjs`) revela erros de resolução. Para
isso, reinstale `esbuild` como devDependency e um `build:*` no package.json e
um `RUN` no stage build do Dockerfile. Lembre que módulos `server-only`
(`setup-state.ts`) lançam ao serem importados fora do Next.

## Primeiro acesso (`/setup`): força da senha e schema compartilhado

`lib/password-strength.ts` e `lib/setup.ts` são client-safe (sem `@/db`,
sem `server-only`): o formulário de `/setup` e a Server Action validam com o
MESMO `setupSchema`. `PASSWORD_MAX_LENGTH` (72, limite do bcrypt) é a única
fonte de `emailAndPassword.maxPasswordLength` em auth.ts, assim como
`PASSWORD_MIN_LENGTH` (password-change.ts) é a de `minPasswordLength` — o
teste `password-strength.test.ts` lê o fonte de auth.ts para travar isso.
`passwordStrength` deriva de `passwordCriteria` (5 critérios, ordem fixa):
fraca = sem o mínimo OU ≤ 2 critérios; media = 3; forte = 4–5. Copy pt-BR
do fluxo em `SETUP_MESSAGES` — nunca literal no JSX.

Gotcha do zod v4: os checks de um `z.string()` NÃO param no primeiro erro.
Quando `.min()`/`.max()` e um `.refine()` compartilham a mesma mensagem
(ex.: `weakPassword`), passe `{ message, abort: true }` nos checks de
tamanho, senão a mesma mensagem aparece duas vezes em `issues`.

## Primeiro acesso: `completeSetup` e conta única (US-002)

`lib/setup-state.ts` (`server-only`) responde `hasAccount()` sem cache — só
server components, Server Actions e hooks do Better Auth; nunca `proxy.ts`.
A Server Action `app/setup/actions.ts#completeSetup` é casca fina: a regra
vive em `lib/setup-complete.ts#runCompleteSetup` (deps injetáveis, testado em
`__tests__/setup-complete.test.ts`) — validação fora do lock, `hasAccount()`
DENTRO de `withSetupLock` (promise chain em `globalThis`), `signUpEmail`
server-side (o databaseHook cria a org), `emailVerified=true`, auditoria
`auth.setup_completed` e seed do exemplo com `void ...catch(warn)` +
timeout de 15 s. O login fica no client: `signUpEmail` sem `headers` não
emite cookie.

Cadastro público fecha em duas camadas de `auth.ts`: `hooks.before` recusa
`/sign-up/email` com `APIError("FORBIDDEN", { message: SIGNUP_DISABLED_MESSAGE })`
quando já há usuário, e `databaseHooks.user.create.before` repete a checagem
ANTES de inserir a organização (sem org órfã se algum caminho furar). As duas
usam o mesmo `hasAccount()` de `setup-state.ts` — auth.ts só é importado
dentro do Next (session.ts e rotas), então o `server-only` não incomoda; NÃO
volte a importar auth.ts de scripts fora do Next (tsx/esbuild) sem antes
tirar essa dependência.

## Primeiro acesso: roteamento em três camadas (US-003)

`/setup` está em `PUBLIC_PATHS` do `proxy.ts`, mas o proxy só decide "tem
cookie?" — a decisão "já há conta?" fica nos server components, porque o
runtime edge não abre o SQLite:

- `app/login/page.tsx` (server): `await headers()` e depois
  `!(await hasAccount())` → `redirect("/setup")`; o formulário client vive em
  `app/login/login-form.tsx` (`LoginForm`).
- `app/setup/page.tsx` (server): sessão válida → `/projects`; sem sessão mas
  `hasAccount()` → `/login`; senão renderiza `SetupForm` (client, em
  `app/setup/setup-form.tsx`). Chame `await headers()` ANTES de `getAuth()`
  ou de `hasAccount()`, como em `session.ts`, para o prerender do build não
  abrir o SQLite — TODA página server que consulta o banco precisa disso, senão
  o `next build` dentro do `docker build` (sem arquivo SQLite) falha com
  "no such table" e o erro não aparece no `next dev`.
- Cadeia resultante sem conta: `/` → `/login` (proxy) → `/setup` (server).
  Com conta e sem cookie: `/setup` → `/login`. Com sessão: `/setup` → `/projects`.

Toda página `use client` de auth fica em `*-form.tsx` ao lado de um
`page.tsx` server — o `page.tsx` só faz a checagem de estado e renderiza o
form; o `layout.tsx` do segmento só exporta `metadata.title`.

Gotchas de verificação local com `next dev`:

- `getAuth()` e `getDb()` são singletons em `globalThis`: mudar `auth.ts`
  com o dev server no ar NÃO troca a instância (HMR recompila o módulo, o
  singleton antigo continua). Reiniciar o `next dev` antes de verificar hooks.
- Sem um Redis alcançável em `REDIS_URL`, TODO POST do `next dev` trava até o
  client desistir (até `POST /api/auth/ok`); GETs seguem normais. Subir
  `docker run -d --rm -p <porta>:6379 redis:7` antes de qualquer curl com body.

Gotchas que só aparecem na imagem Docker (`docker compose up --build`, nunca
no `next dev`):

- NÃO force `advanced.useSecureCookies` em `auth.ts`: o Better Auth já marca
  os cookies como `Secure` quando `BETTER_AUTH_URL` é https. Amarrar em
  `NODE_ENV === "production"` fazia a imagem (sempre production) emitir
  `__Secure-better-auth.session_token; Secure` em http://localhost:3000 — o
  sign-in responde 200, mas o browser descarta o cookie e o login automático
  do `/setup` cai em `/login`. Reproduzir: CDP `Network.getAllCookies` após o
  `fetch` de sign-in (lista vazia = cookie recusado).
- Healthcheck do `web` no compose usa `http://127.0.0.1:3000/login`, não
  `localhost`: no Alpine `localhost` resolve para `::1` e o `server.js`
  standalone (`HOSTNAME=0.0.0.0`) só escuta IPv4 — com `localhost` o wget
  responde "Connection refused", o web nunca fica healthy e o worker
  (`depends_on: web: service_healthy`) nem sobe.

## Primeiro acesso: formulário `/setup` (US-004)

`app/setup/setup-form.tsx` (client) é a referência de formulário de auth com
validação em tempo real: força (`passwordStrength`), checklist
(`passwordCriteria`), `mismatch` e `canSubmit` (`setupSchema.safeParse`) são
DERIVADOS do estado no render — nenhum `useEffect`. O medidor é um `div`
`role="meter"` (0–3, `aria-valuetext` = `PASSWORD_STRENGTH_LABELS`) com 3
`span`s; a checklist copia o padrão visual do `ChangePasswordDialog`. Erros
por campo vêm de `fieldErrors` da action e somem no `onChange` do campo;
erro geral guarda `{ code, message }` (o link "Ir para o login" depende do
`code === "already_configured"`, nunca do texto). Sucesso = `completeSetup`
→ `authClient.signIn.email` no client → `router.push("/projects")` +
`router.refresh()`. O dataset de exemplo semeado pelo setup aparece em
`/datasets` (o seed cria datasets, não projetos).

`__tests__/setup-form.test.ts` lê o fonte do componente (não há DOM no
vitest) e trava: sem `useEffect`, `role="meter"`, nenhuma string de
`SETUP_MESSAGES`/`PASSWORD_CRITERIA_LABELS` literal no JSX. Ao mudar copy,
mude a constante, não o JSX.
