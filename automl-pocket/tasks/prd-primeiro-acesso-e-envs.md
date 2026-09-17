# PRD: Primeiro acesso pela interface e limpeza de variáveis de ambiente

> Data: 2026-09-11. Repositório: `automl-pocket`, a partir de `main` (US-016 do PRD Pocket concluída).
> PRD **independente** de `tasks/prd-versao-pocket.md`: gera um `prd.json` novo (branch sugerida
> `ralph/pocket-primeiro-acesso`). As stories US-017 a US-021 do PRD Pocket continuam válidas —
> a seção **"Emendas ao PRD Pocket"** no fim lista exatamente quais critérios delas ficam obsoletos.

## Introdução

O Pocket hoje cria a conta única no boot do container a partir de `POCKET_EMAIL`, `POCKET_PASSWORD`
e `POCKET_NAME` (`apps/web/scripts/bootstrap.ts`, US-010). Isso obriga quem instala a definir uma
senha em texto puro num `.env` ou num painel do Render antes de ver a aplicação, e deixa a senha
inicial registrada fora do banco. Ao mesmo tempo, `.env.example`, `docker-compose.yml` e
`docker-compose.prod.yml` ainda descrevem Postgres e mais de vinte variáveis de recursos removidos
nas Ondas 1 e 2 (LLM, e2b, Resend, Google, cota de inferência…), embora o código já esteja em
SQLite e não leia nenhuma delas.

Esta PRD faz três coisas:

1. **Tela de primeiro acesso** (`/setup`): com o banco sem usuário, qualquer visita cai numa tela
   onde a pessoa define nome, e-mail, senha e confirmação, com indicador de força da senha. Ao
   concluir, a conta é criada, o dataset de exemplo é semeado e a pessoa entra logada.
2. **Fim do bootstrap por variáveis de ambiente**: `POCKET_*` deixam de existir; o cadastro público
   do Better Auth fica bloqueado assim que a primeira (e única) conta existe.
3. **Variáveis de ambiente enxutas**: `.env.example` e os arquivos de compose passam a listar
   **apenas** o que o código do web e do worker realmente lê hoje.

### Estado atual relevante (levantado em 2026-09-11)

- Banco: SQLite via `@libsql/client` (web) e `sqlite3` stdlib (worker), env `SQLITE_PATH`. `pg` e
  `psycopg` já não são dependências. Falta o checkpoint go/no-go (US-017) e a Onda 3 (US-018–021).
- Conta: `bootstrap.ts` → `getAuth().api.signUpEmail(...)` server-side, `emailVerified=true`,
  auditoria `auth.bootstrap`, depois `seedExampleDatasets(orgId)` com timeout de 15 s. O Dockerfile
  do web roda `migrate.mjs && bootstrap.mjs && server.js`. `instrumentation.ts` faz backfill do
  dataset de exemplo a cada boot (`SEED_EXAMPLES_ON_BOOT`).
- Login: `app/login/page.tsx` (client component) com `AuthShell`, `Logo`, `PasswordInput`;
  `proxy.ts` redireciona sem cookie para `/login`; `requireSession` idem.
- Senha: `PASSWORD_MIN_LENGTH = 8` em `lib/password-change.ts`; checklist em tempo real no diálogo
  "Alterar senha" (`passwordRequirements`). Não há medidor de força em lugar nenhum.
- Envs lidas pelo código (fonte da verdade desta PRD):
  - web: `SQLITE_PATH`, `REDIS_URL`, `AUTH_SECRET`, `BETTER_AUTH_URL`, `UPLOAD_DIR`,
    `MAX_UPLOAD_MB`, `STORAGE_QUOTA_MB`, `TRAINING_CONCURRENCY`, `TRAINING_MAX_ROWS`,
    `API_PREDICT_MAX_ROWS`, `INTERNAL_ORIGIN_MODE`, `API_AUTH_FAIL_MODE`, `LAYOUT_REVIEW_ENABLED`,
    `SEED_ASSETS_DIR`, `SEED_EXAMPLES_ON_BOOT`
  - worker: `SQLITE_PATH`, `REDIS_URL`, `UPLOAD_DIR`, `TRAINING_CONCURRENCY`, `MODEL_N_JOBS`,
    `OMP_NUM_THREADS`, `LAYOUT_REVIEW_ENABLED`
- Envs mortas ainda documentadas/injetadas: `POSTGRES_USER/PASSWORD/DB/HOST_PORT`, `DATABASE_URL`,
  `POCKET_EMAIL/PASSWORD/NAME`, `OPENROUTER_API_KEY`, `EXPLORE_MODEL`, `EXPLORE_OFFTOPIC_MODE`,
  `E2B_API_KEY`, `E2B_TEMPLATE`, `LLM_BUDGET_MODE`, `LLM_PRICING_JSON`, `DAILY_LLM_BUDGET_USD`,
  `DAILY_LLM_CALLS_LIMIT`, `MONTHLY_LLM_CALLS_LIMIT`, `MONTHLY_INFERENCE_LIMIT`, `RESEND_API_KEY`,
  `EMAIL_FROM`, `INTERNAL_API_TOKEN`, `WEB_INTERNAL_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Código morto correlato: `apps/worker/scripts/load_test_training.py` importa `psycopg` e lê
  `DATABASE_URL` (não roda mais).

### Decisões de produto (respostas do owner em 2026-09-11)

| # | Tema | Decisão |
| --- | --- | --- |
| 1 | Relação com o PRD Pocket | PRD **independente**. US-017–021 seguem no `prd.json` atual; esta PRD registra as emendas (seção final). |
| 2 | Força da senha | **Regras locais**, sem dependência nova: comprimento, maiúscula+minúscula, número, símbolo → **fraca / média / forte**. Envio **bloqueado** abaixo de "média". |
| 3 | Editar nome/e-mail depois | **Não.** Só a senha continua editável (Configurações → Alterar senha). |
| 4 | Dataset de exemplo | Semeado **ao concluir o primeiro acesso**, na mesma ação; se o Redis estiver fora, a conta é criada mesmo assim e o backfill do boot (`instrumentation.ts`) tenta de novo — comportamento atual preservado. |

## Objetivos

- Subir o Pocket do zero (`docker compose up`) sem editar **nenhuma** variável além de `AUTH_SECRET`
  e chegar logado ao primeiro relatório de modelo.
- Zero segredo de usuário em variável de ambiente: `POCKET_*` não existem mais em código, docs,
  compose, Dockerfile nem nos scripts.
- Exatamente **uma** conta possível: depois do primeiro acesso, `POST /api/auth/sign-up/email`
  responde 403 e a tela `/setup` redireciona para `/login`.
- Senha inicial com qualidade mínima verificável: nível "média" ou "forte" pela régua definida em
  `lib/password-strength.ts`, validada igual no client e no servidor.
- `.env.example` com **exatamente** as 17 variáveis lidas pelo código (lista acima), uma linha de
  comentário cada; nenhum arquivo do repositório (fora de `tasks/`, `archive/`, `progress.txt`,
  `prd.json`) menciona `POSTGRES`, `DATABASE_URL`, `POCKET_` ou as envs de recursos removidos.

## User Stories

### US-001: Módulo puro de validação do primeiro acesso e força da senha
**Description:** Como desenvolvedora, quero as regras de nome/e-mail/senha e a régua de força num
módulo puro e testado, para o formulário e o servidor validarem exatamente igual.

**Acceptance Criteria:**
- [ ] Novo `apps/web/src/lib/password-strength.ts` (client-safe, sem `@/db`/`server-only`) exportando:
  - `PASSWORD_MAX_LENGTH = 72` com comentário de uma linha: bcrypt ignora bytes além de 72 — sem o
    teto a senha seria truncada em silêncio
  - `passwordCriteria(password)` → lista ordenada de `{ code, label, met }` com os códigos
    `min_length` ("Pelo menos 8 caracteres", usa `PASSWORD_MIN_LENGTH`), `long` ("12 caracteres ou
    mais"), `mixed_case` ("Letras maiúsculas e minúsculas"), `digit` ("Pelo menos um número"),
    `symbol` ("Pelo menos um símbolo, ex.: ! ? # @")
  - `passwordStrength(password)` → `"fraca" | "media" | "forte"`: `fraca` se `min_length` não
    atendido **ou** ≤ 2 critérios atendidos; `media` com exatamente 3; `forte` com 4 ou 5
  - `PASSWORD_STRENGTH_LABELS = { fraca: "Fraca", media: "Média", forte: "Forte" }` e
    `MIN_ACCEPTED_STRENGTH = "media"`
- [ ] Novo `apps/web/src/lib/setup.ts` (client-safe) exportando `SETUP_NAME_MAX_LENGTH = 80`,
  `setupSchema` (zod): `name` trim 1–80, `email` trim + lowercase + `.email()`, `password` 8–72
  **e** `passwordStrength(password) !== "fraca"` (refine com mensagem `SETUP_MESSAGES.weakPassword`),
  `confirm` igual a `password` (refine no campo `confirm` com `SETUP_MESSAGES.mismatch`); e
  `SETUP_MESSAGES` com todas as mensagens pt-BR do fluxo (`nameRequired`, `nameTooLong`,
  `invalidEmail`, `weakPassword` = "Escolha uma senha pelo menos média.", `mismatch` = "As senhas não
  coincidem.", `alreadyConfigured` = "Esta instância do AutoML já tem uma conta. Entre com ela.", `generic` =
  "Não foi possível criar a conta. Tente novamente.")
- [ ] Testes vitest em `src/lib/__tests__/password-strength.test.ts` e `setup.test.ts`: tabela de
  casos cobrindo cada nível (`abcdefgh` → fraca; `abcdefghijkl` → fraca; `Abcdefgh1` → media;
  `Abcdefgh1!` → forte; `Abcdefghijkl1` → forte), o teto de 72, e cada refine do schema com a
  mensagem exata
- [ ] `lib/auth.ts`: `emailAndPassword.maxPasswordLength: PASSWORD_MAX_LENGTH` (mesma constante)
- [ ] Typecheck passes · Lint passes · `npm test` passes

### US-002: Criação da conta pelo servidor e bloqueio do cadastro público
**Description:** Como dona do Pocket, quero que a conta seja criada por uma ação do servidor que só
funciona enquanto não existe usuário, e que nenhum outro caminho consiga criar uma segunda conta.

**Acceptance Criteria:**
- [ ] Novo `apps/web/src/lib/setup-state.ts` (`server-only`): `hasAccount(): Promise<boolean>` =
  `select id from users limit 1`; sem cache entre requisições (uma query trivial no SQLite)
- [ ] Nova Server Action `apps/web/src/app/setup/actions.ts` → `completeSetup(input)`:
  1. valida com `setupSchema` (US-001); erro de validação devolve `{ ok: false, fieldErrors }`
  2. serializa execuções concorrentes com um lock em `globalThis` (promise chain; Pocket é
     instância única) e, **dentro** do lock, chama `hasAccount()` — se já existe conta, devolve
     `{ ok: false, code: "already_configured" }`
  3. cria o usuário via `getAuth().api.signUpEmail({ body: { name, email, password } })` (mesmo
     caminho do antigo bootstrap: o `databaseHooks.user.create.before` cria a organização)
  4. marca `users.emailVerified = true` e grava `audit_logs` com `action: "auth.setup_completed"`,
     `orgId`, `userId`, `metadata: { email }`, ip/userAgent de `requestMeta(await headers())`
  5. dispara `seedExampleDatasets(orgId)` **sem bloquear a resposta** (`void …catch(console.warn)`)
     com o mesmo timeout de 15 s do bootstrap; falha só loga (o backfill de `instrumentation.ts`
     cobre o próximo boot)
  6. devolve `{ ok: true }` — o login em si acontece no client (US-004) pelo mesmo
     `authClient.signIn.email` da tela de login, gerando a auditoria `auth.login` de sempre
- [ ] `lib/auth.ts`, `hooks.before`: se `ctx.path === "/sign-up/email"` e `hasAccount()` → lançar
  `APIError("FORBIDDEN", { message: "Cadastro desativado." })`. Como o `signUpEmail` server-side
  também passa pelos hooks, o fluxo da action continua funcionando porque roda **antes** de existir
  usuário
- [ ] `lib/auth.ts`, `databaseHooks.user.create.before`: última linha de defesa — se `users` não
  está vazia, lançar `APIError("FORBIDDEN")` antes de criar a organização
- [ ] União de ações de auditoria (onde `auth.bootstrap` está declarada): `+ auth.setup_completed`,
  `- auth.bootstrap`
- [ ] Verify (curl, servidor de dev com banco vazio): `POST /api/auth/sign-up/email` com JSON válido
  → **201/200** (cria); repetir com outro e-mail → **403**; `sqlite3 data/pocket.db "select count(*)
  from users"` → `1`. Registrar os comandos no `progress.txt`
- [ ] Typecheck passes · Lint passes · `npm test` passes

### US-003: Roteamento — tudo leva a `/setup` enquanto não há conta, e nunca depois
**Description:** Como pessoa abrindo o Pocket pela primeira vez, quero cair direto na tela de primeiro
acesso, e depois de configurar quero que essa tela não exista mais.

**Acceptance Criteria:**
- [ ] `proxy.ts`: `"/setup"` adicionado a `PUBLIC_PATHS` (comentário atualizado: tela de primeiro
  acesso; a decisão "há conta?" fica no servidor, o proxy edge não abre o SQLite)
- [ ] `app/login/page.tsx` vira **server component**: `if (!(await hasAccount())) redirect("/setup")`;
  o formulário atual passa para `app/login/login-form.tsx` (`"use client"`, mesmo conteúdo)
- [ ] `app/setup/page.tsx` (server component): `if (await hasAccount()) redirect("/login")`; renderiza
  `<SetupForm />` (US-004); `app/setup/layout.tsx` com `metadata = { title: "Primeiro acesso" }`
- [ ] Com sessão válida, `/setup` redireciona para `/projects` (checar `getAuth().api.getSession`
  antes do `hasAccount()` — quem está logado nunca vê a tela)
- [ ] Copy do login: "Use o e-mail e a senha definidos na configuração do Pocket." → "Use o e-mail e a
  senha definidos no primeiro acesso."
- [ ] Verify in browser using dev-browser skill: banco vazio → `http://localhost:3000/` → termina em
  `/setup`; `/login` → `/setup`; `/projects` → `/login` → `/setup`. Após criar a conta (US-004):
  `/setup` → `/login` (sem sessão) e `/setup` → `/projects` (com sessão)
- [ ] Typecheck passes · Lint passes

### US-004: Tela de primeiro acesso
**Description:** Como pessoa configurando o Pocket, quero definir nome, e-mail e senha numa tela
clara, ver a força da senha enquanto digito e entrar logada ao concluir.

**Acceptance Criteria:**
- [ ] `app/setup/setup-form.tsx` (`"use client"`) dentro de `AuthShell`, com `Logo`, título
  **"Primeiro acesso"** e subtítulo "Crie a conta única desta instância do AutoML. Guarde bem a senha: não há
  recuperação por e-mail." (o produto não envia e-mail — decisão do PRD Pocket)
- [ ] Campos, nesta ordem, cada um com `<label>` associado e `autoComplete` correto: **Nome**
  (`name`, max 80), **E-mail** (`email`), **Senha** (`PasswordInput`, `new-password`), **Confirmar
  senha** (`PasswordInput`, `new-password`)
- [ ] Sob "Senha": **medidor de força** com 3 segmentos (`role="meter"`, `aria-valuenow` 1–3,
  `aria-valuetext` com o rótulo) preenchidos conforme `passwordStrength`: fraca = 1 segmento
  `bg-destructive`, média = 2 `bg-amber-500`, forte = 3 `bg-emerald-500`; rótulo textual ao lado
  ("Fraca" / "Média" / "Forte"); com o campo vazio, medidor cinza (`bg-muted`) e sem rótulo
- [ ] Sob o medidor: **checklist** dos 5 critérios de `passwordCriteria` no mesmo padrão visual do
  diálogo "Alterar senha" (`Check`/`X` de lucide, texto `text-muted-foreground` até atender)
- [ ] Sob "Confirmar senha": `SETUP_MESSAGES.mismatch` em `text-destructive` **somente** depois que o
  campo de confirmação tem conteúdo e difere (não mostrar erro enquanto digita a primeira senha)
- [ ] Botão **"Criar conta e entrar"** (`w-full`) desabilitado enquanto `setupSchema.safeParse`
  falhar ou a requisição estiver pendente ("Criando conta…" com `Loader2`)
- [ ] Envio: `completeSetup` → em `ok`, `authClient.signIn.email({ email, password })` → `router.push("/projects")` + `router.refresh()`. Erros: `fieldErrors` vão para o campo
  correspondente; `already_configured` mostra `SETUP_MESSAGES.alreadyConfigured` com link "Ir para o
  login"; falha de rede/500 mostra `SETUP_MESSAGES.generic` (`role="alert"`)
- [ ] Nenhum `useEffect` com `setState` síncrono (regra do lint do repo); força/critérios são
  **derivados** do estado no render
- [ ] Verify in browser using dev-browser skill: (1) digitar `abcdefgh` → "Fraca", botão desabilitado;
  `Abcdefgh1` → "Média", botão habilita quando a confirmação bate; `Abcdefgh1!` → "Forte";
  (2) confirmação diferente → mensagem de mismatch; (3) concluir → cai em `/projects` logado, com
  o card do dataset de exemplo aparecendo (processando ou pronto) em até 30 s; (4) Configurações
  mostra nome e e-mail informados; (5) responsivo a 375 px de largura (painel esquerdo oculto,
  formulário sem scroll horizontal)
- [ ] Typecheck passes · Lint passes · `npm test` passes

### US-005: Remover o bootstrap por variáveis de ambiente
**Description:** Como desenvolvedora, quero que nada no repositório dependa de `POCKET_*`, para não
haver dois jeitos de criar a conta.

**Acceptance Criteria:**
- [ ] Apagados: `apps/web/scripts/bootstrap.ts`, `apps/web/scripts/bootstrap.mjs` (artefato),
  `apps/web/src/lib/bootstrap-env.ts`, `apps/web/src/lib/__tests__/bootstrap-env.test.ts`
- [ ] `apps/web/package.json`: scripts `bootstrap` e `build:bootstrap` removidos; `esbuild` removido
  das devDependencies **se** nada mais o usar (`grep -rn esbuild apps/web --exclude-dir=node_modules`)
- [ ] `apps/web/Dockerfile`: `RUN npm run build:bootstrap` e o `COPY … bootstrap.mjs` removidos;
  `CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]`; comentários atualizados
- [ ] `.env.example`, `docker-compose.yml`, `docker-compose.prod.yml` (se ainda existir nesta
  altura), `README.md`, `SECURITY.md`, `apps/web/CLAUDE.md`, `apps/web/AGENTS.md`: toda menção a
  `POCKET_EMAIL/POCKET_PASSWORD/POCKET_NAME` e ao bootstrap por env removida; onde havia "a conta é
  criada no primeiro boot a partir das envs", passa a dizer "a conta é criada na tela de primeiro
  acesso (`/setup`) na primeira visita"
- [ ] Comentários de código que citam `bootstrap.ts`/US-010 (`instrumentation.ts`, `lib/auth.ts`,
  `example-datasets.ts`, `session.ts`…) atualizados para o fluxo novo — `grep -rn "bootstrap"
  apps/web/src apps/web/scripts` só devolve ocorrências que não se referem à conta
- [ ] `grep -rn "POCKET_" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=archive
  --exclude-dir=tasks --exclude=progress.txt --exclude=prd.json .` vazio
- [ ] `docker build` do `apps/web` conclui e `docker run` sobe até `/setup` sem as envs `POCKET_*`
- [ ] Typecheck passes · Lint passes · `npm test` passes

### US-006: Variáveis de ambiente enxutas em `.env.example`, compose e docs
**Description:** Como quem instala o Pocket, quero abrir o `.env.example` e ver só o que existe, com
valores de desenvolvimento prontos.

**Acceptance Criteria:**
- [ ] `.env.example` reescrito com **exatamente** as 17 variáveis lidas pelo código (lista em "Estado
  atual"), agrupadas em: **Obrigatórias** (`AUTH_SECRET` vazio + instrução `openssl rand -base64 32`,
  `BETTER_AUTH_URL=http://localhost:3000`, `REDIS_URL=redis://redis:6379`), **Armazenamento**
  (`SQLITE_PATH=/data/pocket.db`, `UPLOAD_DIR=/data/uploads`, `MAX_UPLOAD_MB=25`,
  `STORAGE_QUOTA_MB=2000`), **Treino** (`TRAINING_CONCURRENCY=2`, `MODEL_N_JOBS=2`,
  `OMP_NUM_THREADS=2`, `TRAINING_MAX_ROWS` com o default atual do código), **API/segurança**
  (`API_PREDICT_MAX_ROWS=500`, `INTERNAL_ORIGIN_MODE=report`, `API_AUTH_FAIL_MODE=report`),
  **Avançado** (`LAYOUT_REVIEW_ENABLED=false`, `SEED_ASSETS_DIR`, `SEED_EXAMPLES_ON_BOOT=1`);
  uma linha de comentário por variável; nada de `POSTGRES_*`, `DATABASE_URL`, `POCKET_*`
- [ ] `docker-compose.yml`: serviço `postgres` e volume dele removidos; `web` e `worker` recebem
  `env_file: .env`, compartilham o volume nomeado `data:/data` (SQLite + uploads) e `depends_on:
  redis (condition: service_healthy)`; **nenhuma** env fora da lista das 17 (as de recursos
  removidos saem); `worker` só inicia após `web` estar saudável (`depends_on` com healthcheck no
  `web`, ex.: `wget -qO- http://localhost:3000/login`) para o `migrate.mjs` rodar antes do worker
  abrir o arquivo — o único ponto onde os dois processos ainda não são orquestrados pelo `start.sh`
  da US-018
- [ ] `docker-compose.prod.yml` removido (100 % Postgres, sem uso; antecipa o critério da US-019)
- [ ] `apps/worker/scripts/load_test_training.py` removido (importa `psycopg`/`DATABASE_URL`, não
  roda desde a US-015); comentário em `apps/worker/tests/test_model_predict.py:145` deixa de citar
  `DATABASE_URL`
- [ ] `README.md`: tabela de variáveis reescrita com as mesmas 17 e o mesmo agrupamento; seções que
  descrevem Postgres/`DATABASE_URL`/`POSTGRES_HOST_PORT` reescritas para SQLite (arquivo em
  `SQLITE_PATH`, backup = copiar `/data`). `SECURITY.md`: menções a Postgres e a envs removidas
  ajustadas (reescrita completa fica para a US-021)
- [ ] `grep -rniE "POSTGRES|DATABASE_URL|OPENROUTER|E2B_|RESEND|EMAIL_FROM|INTERNAL_API_TOKEN|
  WEB_INTERNAL_URL|GOOGLE_CLIENT|LLM_|MONTHLY_INFERENCE|psycopg" --exclude-dir=node_modules
  --exclude-dir=.git --exclude-dir=archive --exclude-dir=tasks --exclude=progress.txt
  --exclude=prd.json .` vazio (fora de `apps/web/CLAUDE.md`/`apps/worker/CLAUDE.md`, que podem
  citar Postgres como "o que era antes" em uma frase)
- [ ] Verify: clone limpo → `cp .env.example .env` → preencher só `AUTH_SECRET` → `docker compose up
  --build` → `http://localhost:3000` abre `/setup`
- [ ] Typecheck passes · Lint passes · `npm test` passes · `uv run pytest` passes

### US-007: Checkpoint — fluxo completo do zero e emendas registradas
**Description:** Como owner, quero a prova de que alguém sem contexto sobe o Pocket e chega ao relatório
sem tocar em nada além de `AUTH_SECRET`, e quero as consequências para a Onda 3 anotadas.

**Acceptance Criteria:**
- [ ] Roteiro registrado no `progress.txt` com tempos: `docker compose up --build` em pasta limpa →
  `/setup` → conta criada → dataset de exemplo `ready` → treino Rápido → relatório → Web App
  publicado acessível → logout → login com as credenciais criadas → Configurações → Alterar senha
  → login com a senha nova
- [ ] Segurança conferida e registrada: após o setup, `POST /api/auth/sign-up/email` → 403;
  `GET /setup` sem sessão → 307 para `/login`; `audit_logs` contém, nesta ordem, `auth.signup`,
  `auth.setup_completed`, `auth.login`
- [ ] Reinício do container (`docker compose restart web`) **não** recria nem altera a conta;
  `select count(*) from users` continua `1`
- [ ] Seção **"Emendas ao PRD Pocket"** desta PRD copiada para o topo de
  `tasks/prd-versao-pocket.md` (bloco "Emendas em 2026-09-11 — ver prd-primeiro-acesso-e-envs.md"),
  para quem pegar US-018–021 ler antes de começar
- [ ] `README.md` ganha a subseção "Primeiro acesso" (3–5 linhas) na seção de instalação

## Functional Requirements

**Estado sem conta**
- FR-1: Enquanto a tabela `users` estiver vazia, `/`, `/login` e qualquer rota protegida terminam em
  `/setup`. `/app/*`, `/api/v1/*`, `/api/mcp` e `/api/auth/*` continuam com o comportamento atual.
- FR-2: `/setup` exibe o formulário com nome, e-mail, senha e confirmação de senha; nenhum outro
  campo.
- FR-3: A força da senha é calculada no client a cada tecla por `passwordStrength` e exibida como
  medidor de 3 níveis + rótulo + checklist de 5 critérios.
- FR-4: O envio só é possível quando `setupSchema` valida: nome 1–80 caracteres, e-mail válido, senha
  8–72 caracteres com força ≥ média, confirmação idêntica.
- FR-5: O servidor revalida com o mesmo `setupSchema`; nunca confia no client.

**Criação da conta**
- FR-6: `completeSetup` cria exatamente um usuário e uma organização, marca o e-mail como verificado,
  grava `auth.setup_completed` e dispara o seed do dataset de exemplo sem bloquear a resposta.
- FR-7: Duas submissões simultâneas resultam em uma conta criada e uma resposta
  `already_configured`; nunca duas contas.
- FR-8: Concluído o setup, o client entra com as credenciais recém-criadas e é levado a `/projects`.

**Estado com conta**
- FR-9: Com um usuário existente, `/setup` redireciona para `/login` (sem sessão) ou `/projects` (com
  sessão), e `POST /api/auth/sign-up/email` responde 403.
- FR-10: Nome e e-mail não são editáveis pela interface; a senha continua editável em Configurações.
- FR-11: Reiniciar o container nunca cria, apaga ou altera a conta.

**Variáveis de ambiente**
- FR-12: O código não lê `POCKET_EMAIL`, `POCKET_PASSWORD` nem `POCKET_NAME`, e nenhum arquivo do
  repositório as documenta.
- FR-13: `.env.example`, `docker-compose.yml` e a tabela do README listam exatamente o conjunto de
  variáveis lidas pelo código do web e do worker — nem uma a mais, nem uma a menos.
- FR-14: `docker compose up --build` funciona com o `.env.example` copiado e apenas `AUTH_SECRET`
  preenchido.

## Non-Goals (fora de escopo)

- Editar nome ou e-mail depois do primeiro acesso (decisão 3).
- Recuperação de senha, verificação de e-mail, segunda conta, convite — continuam fora (PRD Pocket).
- Medidor de força no diálogo "Alterar senha" de Configurações — `lib/password-strength.ts` fica
  pronto para reuso, mas o diálogo não muda nesta PRD.
- Reescrever `docker-compose.yml` para o serviço único `app` — é a US-019 (depende do Dockerfile
  único da US-018). Aqui o compose só é **consertado** para SQLite com `web` + `worker` + `redis`.
- `render.yaml`, `start.sh`, Dockerfile único, README completo — Onda 3 do PRD Pocket.
- Mover a decisão "há conta?" para o proxy edge (exigiria cookie/flag; a checagem no servidor da
  página basta e é sempre correta).
- Migrar contas criadas pelo bootstrap antigo: não há nada a migrar — um banco com usuário
  simplesmente nunca vê `/setup`.

## Design Considerations

- Reutilizar `AuthShell`, `Logo`, `PasswordInput`, `Input`, `Button` e o padrão visual do checklist do
  `ChangePasswordDialog` (`Check`/`X`, `text-muted-foreground`). Nenhum componente novo além de
  `SetupForm` e um `PasswordStrengthMeter` local ao formulário.
- Cores do medidor com tokens/utilitários já presentes no projeto: `bg-destructive`, `bg-amber-500`
  (mesmo tom de alerta usado em Configurações), `bg-emerald-500`, `bg-muted`.
- Copy em pt-BR, voz do produto, marca "AutoML" (nenhuma menção a "Pocket" na UI). Mensagens
  centralizadas em `SETUP_MESSAGES` e travadas por teste, como em `lib/password-change.ts`.
- Acessibilidade: labels explícitos, `role="meter"` com `aria-valuetext`, erros com `role="alert"`,
  ordem de tabulação natural (o botão mostrar/ocultar do `PasswordInput` já fica fora dela).
- Sem confetti, tour ou passo-a-passo: uma tela, um botão.

## Technical Considerations

- **Proxy edge não abre SQLite**: a decisão "há conta?" fica nos server components de `/login` e
  `/setup` e no `hooks.before` do Better Auth. `/setup` entra em `PUBLIC_PATHS` apenas para o proxy
  não exigir cookie.
- **Concorrência**: lock por promise chain em `globalThis` + recheck de `hasAccount()` dentro do lock
  + guarda no `databaseHooks.user.create.before`. Três camadas porque a action, o endpoint HTTP
  `/sign-up/email` e qualquer chamada futura a `signUpEmail` passam por caminhos diferentes.
- **Seed não bloqueante**: o parse do dataset de exemplo vai para a fila BullMQ; sem Redis a promise
  rejeita depois de 15 s e só loga. `instrumentation.ts` continua fazendo backfill no boot — nada
  muda ali além de comentários.
- **Login após criar**: usar `authClient.signIn.email` no client evita repassar `Set-Cookie` da API
  server-side para a resposta da action e mantém a auditoria `auth.login` no mesmo plugin.
- **Compose provisório** (US-006): `web` e `worker` num volume compartilhado; o worker precisa
  esperar o `migrate.mjs` do web — `depends_on` com healthcheck resolve até a US-018 unificar tudo
  no `start.sh`. Registrar no `progress.txt` se aparecer `SQLITE_CORRUPT` (risco documentado na
  US-016) — nesse caso a US-017 do PRD Pocket fica como primeira prioridade.
- **Ordem das stories**: US-001 → US-002 → US-003 → US-004 → US-005 → US-006 → US-007. A US-005
  (remover bootstrap) só pode vir depois da US-004, senão não há como criar conta.
- **Testes**: vitest puro para `password-strength`/`setup`; auth hooks verificados por curl no
  Verify da US-002 (o projeto não tem teste de integração do Better Auth e não vale criar infra só
  para isso); worker sem mudança funcional (`uv run pytest` só confirma a remoção do script morto).

## Success Metrics

- Instalação do zero até o relatório do modelo em **< 10 minutos**, editando só `AUTH_SECRET`.
- `.env.example` com **17** variáveis, todas lidas pelo código (hoje 20 documentadas, 8 mortas, 1
  lida e não documentada).
- `POST /api/auth/sign-up/email` → **403** após o setup; `select count(*) from users` = **1** após
  reinícios e tentativas concorrentes.
- Zero ocorrências de `POCKET_`, `POSTGRES`, `DATABASE_URL` e das envs de recursos removidos fora de
  `tasks/`, `archive/`, `progress.txt`, `prd.json`.
- Senha inicial sempre ≥ "média" pela régua de `lib/password-strength.ts` (verificável nos testes e
  no Verify da US-004).

## Emendas ao PRD Pocket (`tasks/prd-versao-pocket.md`)

Ficam **obsoletos** ou mudam com esta PRD — quem pegar essas stories deve ler isto antes:

| Story / item | Antes | Depois desta PRD |
| --- | --- | --- |
| Decisão 2 | Conta criada no boot por `POCKET_EMAIL/PASSWORD/NAME` | Conta criada em `/setup` na primeira visita; `POCKET_*` não existem |
| FR-3 | Bootstrap cria org + usuário a partir das envs | Substituída por FR-6/FR-11 desta PRD |
| FR-16 | Blueprint pede e-mail/senha/nome na criação | Blueprint pede **nada** além do que o Render gera (`AUTH_SECRET`); a pessoa abre a URL e conclui `/setup` |
| US-018 | `start.sh` roda `migrate.mjs` → `bootstrap.mjs`; imagem copia `bootstrap.mjs`; lista de envs inclui `POCKET_*` | `start.sh` roda só `migrate.mjs`; sem `bootstrap.mjs`; lista de envs = as 17 desta PRD (+ `DATA_DIR`) |
| US-019 | `.env.example` com `POCKET_EMAIL/POCKET_PASSWORD`; `docker-compose.prod.yml` removido; Verify começa em "login" | `.env.example` da US-006 (sem `POCKET_*`); `docker-compose.prod.yml` **já removido** aqui; Verify começa em "primeiro acesso → login" |
| US-020 | `envVars` com `POCKET_EMAIL/POCKET_PASSWORD/POCKET_NAME` `sync: false`; README "informar e-mail e senha" | Sem `POCKET_*`; README: "abrir a URL do serviço e concluir o primeiro acesso"; "trocar a senha depois" continua em Configurações |
| US-021 | README "Segurança" fala de conta única por env | Fala de conta única criada em `/setup`, cadastro bloqueado após a primeira conta |
| Success Metrics | "informando só e-mail/senha/nome" | "sem informar nada" |

## Open Questions

1. **Sequenciamento com o `prd.json` atual** (US-017–021 pendentes): recomendação é rodar esta PRD
   **antes** da Onda 3 (US-018–020 dependem das emendas acima), arquivando o `prd.json` vigente em
   `archive/` durante a rodada e restaurando-o com as emendas aplicadas ao final. A US-017 (go/no-go
   do SQLite) pode rodar antes ou depois — não conflita. Confirmar.
2. **Copy desatualizada encontrada fora do escopo**: `passwordChangeSuccessMessage` em
   `lib/password-change.ts` ainda diz "Enviamos um email de confirmação para …", mas o produto não
   envia e-mail desde a US-005 do PRD Pocket. Sugestão: corrigir na US-011-style de limpeza da
   US-021, ou abrir uma story de uma linha. Não incluído aqui para não misturar escopos.
3. **`SEED_EXAMPLES_ON_BOOT` e `SEED_ASSETS_DIR`** são kill-switch/override operacionais. Ficam no
   `.env.example` na seção "Avançado" para a lista bater com o código. Se preferir escondê-las
   (documentar só no CLAUDE.md), a contagem-alvo cai para 15 — decidir na US-006.
