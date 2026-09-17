# PRD: AutoML Pocket — versão individual (SQLite, conta única, deploy em 1 clique no Render)

> Data: 2026-09-11. Repositório: `automl-pocket` (fork do `automl`).
> Numeração de stories começa em US-001 — este PRD gera um `prd.json` novo (branch `ralph/pocket`).

## Emendas em 2026-09-11 — ver prd-primeiro-acesso-e-envs.md

> Copiado de `tasks/prd-primeiro-acesso-e-envs.md` (seção "Emendas ao PRD Pocket") no checkpoint US-008
> daquela PRD, em 2026-09-12. Quem pegar US-018–021 deste PRD lê isto antes de começar.

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

## Introdução

O AutoML foi construído para um beta com ~100 executivos: multiusuário, convites, políticas LGPD,
MFA, cotas, notificações, leads comerciais, chat de dados com IA e home pública. O **Pocket** é a
mesma ferramenta reduzida ao núcleo para **uma pessoa** rodar por conta própria: subir a planilha,
visualizar e preparar os dados, treinar e avaliar o modelo, e publicar (Web App, API e MCP) —
exatamente como está hoje nessas quatro etapas.

Tudo o que existe para operar uma turma sai. O banco passa a ser um arquivo SQLite, a conta é única
e definida por variáveis de ambiente, e o produto sobe **em 1 clique no Render** a partir de um
`render.yaml` (Blueprint), com `docker-compose.yml` para desenvolvimento local.

### Decisões de produto (respostas do owner em 2026-09-11)

| # | Tema | Decisão |
| --- | --- | --- |
| 1 | Fila de jobs | **Manter Redis + BullMQ** como está (web enfileira, worker Python consome). O SQLite substitui só o Postgres. |
| 2 | Conta | **Conta única** criada no boot a partir de `POCKET_EMAIL` / `POCKET_PASSWORD` / `POCKET_NAME`. Sem `/signup`, sem verificação de e-mail, sem "esqueci a senha", sem Resend. Troca de senha continua em Configurações. |
| 2b | MFA (2FA/TOTP) | **Remover** (confirmado em 2026-09-11). |
| 3 | IA (OpenRouter/e2b) | **Remover tudo**: chat do Explore, "Insights da IA" do relatório e "Guia do problema". Produto 100% offline. |
| 4 | Extras | Saem: **(A)** convites/waitlist + aceite/páginas de política, **(B)** leads enterprise/CTAs de consultoria, **(C)** notificações in-app + e-mail + rota `/api/internal`, **(D)** onboarding (boas-vindas, checklist, confetti, sugestão de MFA), **(H)** página `/docs`. **Ficam**: datasets de exemplo (reduzidos a **1**, `Credit_Card_Fraud_Example.csv`, semeado para a conta única), auditoria (`audit_logs`), rate limits, flags `INTERNAL_ORIGIN_MODE`/`API_AUTH_FAIL_MODE`, cota de armazenamento, `TRAINING_MAX_ROWS`, revisão de layout de planilha. |
| 5 | Execução | **Docker**: `render.yaml` como caminho principal (1 clique) e `docker-compose.yml` para dev. |
| — | Login social | O social login existente é **Google** (não há Microsoft no código); é ele que sai. |
| — | Marca | O produto continua **"AutoML"** na UI, com o selo **"Beta"** que já existe na sidebar. "Pocket" é só o nome do repositório/documentação — não aparece para a usuária. |
| — | CI | **Sem CI**: a pasta `.github/` sai do repositório. Qualidade é garantida pelos checks locais das stories (`typecheck`, `lint`, `test`, `pytest`). |
| — | Repositório | O Pocket terá um **`origin` novo** (repo próprio no GitHub), criado antes da US-020 — o botão "Deploy to Render" aponta para ele. |

### Decisão de arquitetura para o Render: um único container `app` (web + worker)

No Render, um **disco persistente pertence a um único serviço** — não dá para montar o mesmo disco
no `web` e no `worker`. Hoje os dois compartilham o volume `uploads` (arquivos enviados, parquets,
artefatos de modelo) e, com SQLite, também precisariam compartilhar o arquivo do banco. Por isso o
Pocket empacota **web (Next standalone) e worker (Python) na mesma imagem**, iniciados por um
`start.sh`, com um disco em `/data` (`/data/pocket.db` + `/data/uploads`). O Redis é um
**Render Key Value** separado (não precisa de disco compartilhado). Isso também garante um único
escritor no SQLite (um processo Node e um Python, no mesmo host, com WAL + `busy_timeout`).

Consequências aceitas: uma instância só (Render desliga zero-downtime deploy quando há disco — é o
que queremos com SQLite); plano `starter` do web service (disco não existe no plano free);
Key Value `free` é efêmero (fila vazia após restart do Redis — aceitável: um job perdido só exige
clicar de novo).

## Objetivos

- Fluxo completo **login → projeto → upload → Preparar → Predição (treino + relatório) → Publicar (Web App/API/MCP)** funcionando igual ao produto atual, sem nenhuma dependência externa além do Redis.
- Zero chamadas a serviços externos: sem OpenRouter, e2b, Resend, Google OAuth.
- Subida em 1 clique no Render via `render.yaml`; localmente `docker compose up` sobe `app` + `redis`.
- Banco em arquivo (`SQLITE_PATH`), com migrations regeneradas do zero (uma só) — sem Postgres no caminho principal.
- Conta única provisionada por env no primeiro boot, com o dataset de exemplo já semeado.
- Redução significativa do código: ~12 tabelas a menos, ~30 arquivos de `lib/` a menos, 4 grupos de rotas a menos, ~9 dependências npm a menos.
- Critério de **go/no-go** explícito para o SQLite (US-017): se não passar, o plano B (Postgres) está descrito e não bloqueia o resto.

## Estratégia de ondas

Cada onda termina com o produto **rodando de ponta a ponta** — nunca ficamos "meio migrados".

- **Onda 1 — Remoções (ainda em Postgres):** tirar superfícies, tabelas e envs; conta única; checkpoint no Postgres. O schema menor torna a Onda 2 muito mais barata.
- **Onda 2 — SQLite:** web (Drizzle + libsql), worker (`sqlite3` stdlib), reescrita do SQL cru, checkpoint go/no-go.
- **Onda 3 — Empacotamento:** Dockerfile único, `docker-compose.yml` de dev, `render.yaml`, README.

Ordem de execução das stories dentro de uma onda é a numeração. A Onda 3 pode começar pela US-018 em paralelo à Onda 2 se necessário (só o `start.sh` depende do SQLite).

## User Stories

### Onda 1 · Remoções e conta única (Postgres ainda no lugar)

#### US-001: Remover a home pública e redirecionar `/`
**Description:** Como usuária do Pocket, ao abrir a raiz do site quero cair direto no login (ou em `/projects` se já logada), sem página de marketing.

**Acceptance Criteria:**
- [ ] Apagados: `apps/web/src/app/(marketing)/` (layout, page, actions), `apps/web/src/components/marketing/` inteiro, `apps/web/src/lib/marketing/` inteiro, `apps/web/scripts/og-image.mts` e `apps/web/scripts/screenshot.mjs` (e seus scripts em `package.json`, se existirem)
- [ ] `apps/web/src/proxy.ts`: a rota `/` deixa de ser caso especial público — sem sessão redireciona para `/login`, com sessão para `/projects` (um `redirect` server-side em `apps/web/src/app/page.tsx` ou no proxy, um só lugar)
- [ ] `getOptionalSession` em `lib/session.ts` removido se ficar sem uso
- [ ] `apps/web/src/app/layout.tsx`: metadata da home (OG image, descrição de marketing, JSON-LD) reduzida a `title` "AutoML" + `description` curta; arquivos estáticos de OG em `public/` removidos
- [ ] Dependência `motion` removida do `package.json` **somente se** nenhum arquivo fora de `components/marketing` e `onboarding-confetti.tsx` a importar (o confetti sai na US-007; se ainda estiver lá, deixar a remoção da dep para a US-007)
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser using dev-browser skill: `/` deslogado → `/login`; `/` logado → `/projects`

#### US-002: Remover a aba Explorar e o sandbox e2b
**Description:** Como usuária do Pocket, não quero ver a aba "Explorar" nem nenhum resquício do chat de dados.

**Acceptance Criteria:**
- [ ] Apagados: `apps/web/src/app/(project)/projects/[projectId]/explore/`, `apps/web/src/app/api/explore/`, `apps/web/src/lib/explore/`, `apps/web/src/lib/sandbox.ts`, testes correspondentes em `lib/__tests__` e `lib/explore`
- [ ] Aba "Explorar" removida de `tabs` em `apps/web/src/app/(project)/projects/[projectId]/layout.tsx` (ícone `Search` sai do import); a navbar fica **Preparar · Predição · Publicar**
- [ ] Tabelas `explore_chats` e `explore_messages` e enums `explore_message_role`/`explore_message_status` removidos de `apps/web/src/db/schema.ts`; migration Drizzle gerada (`npm run db:generate`) com os `DROP`s
- [ ] `proxy.ts`/`app-origin.ts`/`rate-limit-policy.ts`: entradas específicas do Explore removidas (política de origem e rate limit do chat); `EXPLORE_OFFTOPIC_MODE`, `EXPLORE_MODEL`, `E2B_API_KEY`, `E2B_TEMPLATE` removidos de `.env.example`, `docker-compose.yml` e README
- [ ] Deps `@e2b/code-interpreter`, `plotly.js-dist-min` e `react-markdown` removidas do `package.json` (confirmado: só o Explore as importa)
- [ ] `apps/web/CLAUDE.md`: parágrafo "CSV gerado no client" deixa de citar `explore/result-panel.tsx` (manter a referência a `forecast-sections.tsx`)
- [ ] Typecheck passes · Lint passes · `npm test` passes
- [ ] Verify in browser using dev-browser skill: navbar do projeto com 3 abas; `/projects/<id>/explore` → 404

#### US-003: Remover o restante da IA (Insights da IA, Guia do problema, cotas de LLM)
**Description:** Como usuária do Pocket, quero o relatório do modelo e a tela de fonte de dados sem nenhuma função que dependa de LLM.

**Acceptance Criteria:**
- [ ] Relatório: apagados `predict/ai-insight-section.tsx`, `predict/insight-actions.ts`, `lib/model-insight.ts`; `predict/page.tsx`/`model-report.tsx` deixam de montar a seção; coluna `models.ai_insight` removida do schema
- [ ] Guia do problema: apagados `app/(project)/projects/[projectId]/guia/`, `app/(app)/projects/brief-actions.ts`, `lib/problem-brief.ts`, `lib/problem-brief-template.ts`, `components/project/problem-brief-card.tsx`, `components/project/data-help-cta-card.tsx`, rota `app/api/projects/[projectId]/template/`; coluna `projects.problem_brief` removida. **Fica** o card "Problema de negócio" (`problem-description-card.tsx`, coluna `projects.problem_description`) — é texto livre, sem IA
- [ ] **Fica** a planilha modelo genérica: `lib/spreadsheet-template.ts`, `lib/template-links.ts`, `components/app/template-download-links.tsx`, rota `app/api/templates/planilha-modelo/` (e a dep `exceljs`)
- [ ] Apagados `lib/llm.ts`, `lib/llm-metered.ts`, `lib/llm-quota.ts`, `lib/llm-usage.ts`, `lib/llm-pricing.ts` e testes; tabela `llm_usage` e enum `llm_feature` removidos do schema; migration gerada
- [ ] Card "IA" em Configurações (`app/(app)/settings/page.tsx`, bloco "Uso e limites") removido
- [ ] Envs removidas de `.env.example`, `docker-compose.yml`, README: `OPENROUTER_API_KEY`, `LLM_PRICING_JSON`, `LLM_BUDGET_MODE`, `DAILY_LLM_CALLS_LIMIT`, `MONTHLY_LLM_CALLS_LIMIT`, `DAILY_LLM_BUDGET_USD`
- [ ] Eventos de auditoria `llm.*` deixam de existir no código (`lib/audit.ts` — tipos/união de ações atualizados)
- [ ] Typecheck passes · Lint passes · `npm test` passes
- [ ] Verify in browser using dev-browser skill: relatório de um modelo treinado sem seção de IA; tela de fonte de dados sem card de ajuda; link "Baixar planilha modelo" continua funcionando

#### US-004: Remover CTAs de consultoria/enterprise e "Reportar bug"
**Description:** Como usuária do Pocket, não quero ver convites para contratar consultoria nem botão de reportar bug em nenhuma tela.

**Acceptance Criteria:**
- [ ] Enterprise/consultoria apagados: `app/(app)/enterprise/`, `components/app/enterprise-inline-cta.tsx`, `request-enterprise-dialog.tsx`, `settings-enterprise-card.tsx`, `sidebar-enterprise-card.tsx`, `components/project/production-cta-banner.tsx`, `lib/production-cta.ts`, `lib/contact.ts`, `lib/enterprise-lead.ts`, `lib/enterprise-lead-request.ts` e testes; tabela `enterprise_leads` removida; todo texto "Solicitar para empresa"/"Fale com a AutoML"/"consultoria" some do app (grep -ri "consultoria\|enterprise\|AutoML" em `apps/web/src` sem ocorrências fora de comentários históricos)
- [ ] Problem reports apagados: `components/app/problem-report-button.tsx`, `problem-report-collector.tsx`, `lib/problem-report/` inteiro, `app/api/problem-reports/`; tabela `problem_reports` removida; `ProblemReportCollector` sai de `app/(app)/layout.tsx` e de `app/(project)/projects/[projectId]/layout.tsx`; entradas do `proxy.ts`/origem/rate limit correspondentes removidas
- [ ] Dep `modern-screenshot` removida do `package.json`
- [ ] `app-sidebar.tsx` sem `ProblemReportButton` nem `SidebarEnterpriseCard`; layout do rodapé da sidebar (menu do usuário) continua alinhado com a sidebar recolhida e expandida
- [ ] Migration gerada com os `DROP`s
- [ ] Typecheck passes · Lint passes · `npm test` passes
- [ ] Verify in browser using dev-browser skill: sidebar, Configurações, tela do projeto, relatório e telas de Publicar sem CTAs

#### US-005: Remover notificações, e-mail e a rota interna web↔worker
**Description:** Como usuária do Pocket (uma pessoa só, olhando a tela), não preciso de sino de notificações nem de e-mail "modelo pronto".

**Acceptance Criteria:**
- [ ] Web apagados: `components/app/notifications-bell.tsx`, `notification-dialog.tsx`, `notifications-actions.ts`, `lib/notifications.ts`, `lib/notifications-server.ts`, `lib/notification-copy.ts`, `lib/notification-email.ts`, `lib/internal-api.ts`, `lib/email.ts`, `lib/email-templates.ts`, `app/api/internal/`; tabela `notifications` removida; migration gerada
- [ ] `app/(app)/layout.tsx` e `app/(project)/projects/[projectId]/layout.tsx` + `components/project/project-navbar.tsx`: `countUnread`/`initialUnread`/`NotificationsBell` removidos; o header do projeto mantém voltar + nome editável + abas
- [ ] Worker apagados: `apps/worker/jobs/notifications_email.py`, `apps/worker/jobs/notification_copy.py`; `model_train.py` deixa de gravar notificação e de chamar a rota interna (a UI de progresso continua por polling, como hoje)
- [ ] Toast de "modelo pronto" (se disparado a partir do sino) substituído por nada — o redirecionamento automático da tela de progresso para o relatório, que já existe, é o feedback
- [ ] Dep `resend` removida; envs `RESEND_API_KEY`, `EMAIL_FROM`, `INTERNAL_API_TOKEN`, `WEB_INTERNAL_URL` removidas de `.env.example`, `docker-compose.yml`, README
- [ ] O e-mail "Sua senha foi alterada" de `lib/password-change-audit.ts` deixa de ser enviado (a auditoria `auth.password_changed` fica)
- [ ] Typecheck passes · Lint passes · `npm test` passes · testes do worker passam
- [ ] Verify in browser using dev-browser skill: header sem sino; treinar um modelo até o fim e conferir o redirecionamento para o relatório

#### US-006: Remover a cota de predições e a página `/docs`
**Description:** Como usuária do Pocket, quero prever quantas linhas quiser pelo Web App, API e MCP sem contador mensal.

**Acceptance Criteria:**
- [ ] Apagados `lib/inference-quota.ts` e testes; tabela `inference_usage` removida; migration gerada
- [ ] Chamadas removidas em `app/api/v1/predict/route.ts`, `app/api/mcp/route.ts`, `app/app/[slug]/actions.ts`, `app/app/[slug]/batch/route.ts`, `app/(project)/projects/[projectId]/predict/actions.ts` e `predict/page.tsx` — sem checagem nem contagem; nenhum texto "limite mensal"/"predições restantes" no app
- [ ] `MONTHLY_INFERENCE_LIMIT` removida de `.env.example`, `docker-compose.yml`, README. **Ficam** `API_PREDICT_MAX_ROWS` (limite por chamada, proteção do worker) e o limite de 1 MB de body
- [ ] Card "Predições" em Configurações removido; o card "Uso e limites" passa a mostrar só "Armazenamento" (renomear para "Armazenamento")
- [ ] `app/docs/` apagado; links para `/docs` (telas de Publicar/API, README) removidos ou trocados pelo bloco de exemplo `curl` que já existe na tela `deploy/api`
- [ ] Typecheck passes · Lint passes · `npm test` passes
- [ ] Verify in browser using dev-browser skill: Web App publicado prevendo em lote; tela `deploy/api` sem link quebrado; `/docs` → 404

#### US-007: Remover onboarding (boas-vindas, checklist, confetti, sugestão de MFA)
**Description:** Como usuária do Pocket, quero a lista de projetos limpa, sem painel de boas-vindas nem checklist.

**Acceptance Criteria:**
- [ ] Apagados: `components/app/welcome-panel.tsx`, `onboarding-checklist.tsx`, `onboarding-confetti.tsx`, `components/project/onboarding-step-banner.tsx`, `lib/onboarding.ts`, `lib/onboarding-copy.ts`, `lib/onboarding-server.ts`, `lib/mfa-suggestion.ts`, `lib/mfa-suggestion-server.ts`, `app/(app)/projects/onboarding-actions.ts` e testes
- [ ] `app/(app)/projects/page.tsx` e `projects-view.tsx` sem `getOnboardingState`/`maybeCreateMfaSuggestionOncePerHour`; estado vazio da lista de projetos vira um card simples "Crie seu primeiro projeto" com o botão que já existe
- [ ] Colunas `users.onboarding_welcome_seen_at`, `onboarding_dismissed_at`, `onboarding_completed_at`, `mfa_prompt_dismissed_at`, `mfa_prompt_snoozed_until` removidas; migration gerada
- [ ] Banner de "passo do onboarding" removido das telas de Preparar/Predição onde `OnboardingStepBanner` era montado
- [ ] Dep `motion` removida (último consumidor era o confetti)
- [ ] Typecheck passes · Lint passes · `npm test` passes
- [ ] Verify in browser using dev-browser skill: `/projects` com 0 projetos e com 2 projetos; Preparar sem banner

#### US-008: Autenticação — remover Google, 2FA, cadastro e fluxos de e-mail
**Description:** Como usuária do Pocket, quero uma tela de login com apenas e-mail e senha.

**Acceptance Criteria:**
- [ ] `lib/auth.ts`: `socialProviders` removido; plugin `twoFactor` removido; `emailAndPassword.requireEmailVerification: false`; `sendVerificationEmail`/`sendResetPassword` removidos; `loginAuditPlugin` reduzido a `auth.login` (email) + troca de senha (`auth.password_changed`/`password_change_failed`) — os caminhos de 2FA/OAuth saem do matcher
- [ ] Apagados: `app/signup/`, `app/verify-email/`, `app/forgot-password/`, `app/reset-password/`, `app/2fa/`, `components/auth/google-icon.tsx`, `components/app/two-factor-*.tsx`, `components/app/security-card.tsx` (ou reduzido a "Trocar senha" se o card for o container do botão), `lib/two-factor-*.ts`, `lib/two-factor-login.ts`, `lib/verify-email.ts`, `lib/signup-ref.ts`, `lib/auth-email-rate-limit.ts` e testes
- [ ] `app/login/page.tsx`: só e-mail + senha + botão "Entrar"; sem "Entrar com Google", sem "Criar conta", sem "Esqueci minha senha"; texto de apoio: "Use o e-mail e a senha definidos na configuração do Pocket."
- [ ] Tabela `two_factors` e coluna `users.two_factor_enabled` removidas; migration gerada; dep `qrcode` (+ `@types/qrcode`) removida
- [ ] `lib/auth-client.ts` sem plugin de 2FA; `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` removidas de `.env.example`, `docker-compose.yml`, README
- [ ] `proxy.ts`: `PUBLIC_PATHS` fica com `/login`, `/app` (Web App público) e as rotas de API públicas já existentes (`/api/v1`, `/api/mcp`, `/api/auth`)
- [ ] Typecheck passes · Lint passes · `npm test` passes
- [ ] Verify in browser using dev-browser skill: login com e-mail/senha; `/signup`, `/2fa`, `/forgot-password` → 404; Configurações → trocar senha funciona

#### US-009: Remover convites/waitlist, aceite de políticas e gates de sessão
**Description:** Como usuária do Pocket, quero entrar e usar, sem tela de aceite de política nem código de convite.

**Acceptance Criteria:**
- [ ] Apagados: `app/waitlist/`, `app/aceite-politica/`, `app/politica-de-privacidade/`, `app/politica-de-uso/`, `lib/invites.ts`, `lib/invite-cookie.ts`, `lib/policy.ts`, `lib/policy-acceptance.ts` e testes
- [ ] Tabelas `invite_codes`, `invite_redemptions`, `policy_acceptances` e coluna `users.approved_at` removidas; migration gerada
- [ ] `lib/session.ts` (`requireSession`): sem gate de aprovação do beta e sem gate de aceite de política — só "tem sessão? senão `/login`"
- [ ] `lib/auth.ts`: hooks de `redeemInvite`, `recordPolicyAcceptance`, cookies de signup removidos; `seedExampleDatasets` sai do hook de cadastro (volta na US-010, chamado pelo bootstrap)
- [ ] Rodapé/links para políticas removidos do login e de Configurações
- [ ] Typecheck passes · Lint passes · `npm test` passes
- [ ] Verify in browser using dev-browser skill: login → `/projects` direto, sem tela intermediária

#### US-010: Conta única provisionada por variáveis de ambiente
**Description:** Como dona do Pocket, quero definir e-mail e senha nas variáveis de ambiente e, no primeiro boot, já ter minha conta criada com os datasets de exemplo.

**Acceptance Criteria:**
- [ ] Novo `apps/web/scripts/bootstrap.mjs` (executado pelo `CMD` do Dockerfile **depois** de `migrate.mjs` e antes do `server.js`): se a tabela `users` estiver vazia, cria a organização (`organizations`) e o usuário via API server-side do Better Auth (`auth.api.signUpEmail`, mesma hash bcrypt de 12 rounds) com `POCKET_EMAIL`, `POCKET_PASSWORD` (mínimo `PASSWORD_MIN_LENGTH`), `POCKET_NAME` (default "Você"), `emailVerified = true`, e grava `auth.bootstrap` em `audit_logs`
- [ ] `apps/web/seed-assets/` fica só com `Credit_Card_Fraud_Example.csv` (classificação); `Projects_Example.xlsx` e `Sales_Example.xlsx` apagados e `EXAMPLE_DATASET_FILES` em `lib/example-datasets.ts` reduzido a essa entrada (testes ajustados); o `Dockerfile` do worker que copia fixtures do web (`web-fixtures`) é conferido para não referenciar os arquivos removidos
- [ ] Depois de criar o usuário, chama `seedExampleDatasets(orgId)` (o exemplo entra na fila `datasets` como hoje). Se o Redis estiver indisponível nesse momento, o bootstrap loga aviso e segue — o seed é idempotente por nome e pode ser reexecutado no próximo boot enquanto o usuário não tiver datasets de exemplo
- [ ] Idempotente: com usuário já existente, o script não faz nada (nem sobrescreve senha — trocar senha é em Configurações). Com `users` vazia e envs ausentes/inválidas, sai com código ≠ 0 e mensagem em pt-BR dizendo quais envs faltam (o container não sobe "sem porta de entrada")
- [ ] O bootstrap reutiliza `getDb()`/`auth` do build (importa do `.next/standalone` ou é compilado com `tsx` no build — decidir na implementação; o Dockerfile já copia `migrate.mjs`, seguir o mesmo padrão)
- [ ] `apps/web/src/instrumentation.ts`: se hoje ele semeia/aprova algo por usuário no boot, ajustar para não conflitar com o bootstrap
- [ ] `.env.example` documenta `POCKET_EMAIL`, `POCKET_PASSWORD`, `POCKET_NAME`; `docker-compose.yml` repassa ao `web`
- [ ] Teste unitário para a função pura que valida as envs (mensagens de erro) em `lib/__tests__`
- [ ] Typecheck passes · Lint passes · `npm test` passes
- [ ] Verify: banco zerado + `docker compose up` → login com as credenciais das envs → `/datasets` mostra o exemplo processado

#### US-011: Configurações, sidebar e layouts enxutos
**Description:** Como usuária do Pocket, quero uma tela de Configurações com só o que faz sentido para uma pessoa.

**Acceptance Criteria:**
- [ ] `app/(app)/settings/page.tsx` com três cards: **Conta** (nome, e-mail, botão "Trocar senha" com o `change-password-dialog.tsx` atual), **Armazenamento** (usado/cota, como hoje), **Sessão** (botão "Sair"). Nada de enterprise, IA, predições, 2FA, políticas
- [ ] `components/app/app-sidebar.tsx`: itens Projetos, Datasets; rodapé com nome/e-mail, link Configurações e Sair; nenhum card promocional
- [ ] `app/(app)/layout.tsx` e `app/(project)/projects/[projectId]/layout.tsx` sem imports mortos (`countUnread`, `ProblemReportCollector`, `NotificationsBell`)
- [ ] Varredura de código morto: `npx knip` (ou `ts-prune`) executado uma vez e todos os exports/arquivos sem uso listados no relatório removidos ou justificados no `progress.txt`; `package.json` sem deps órfãs (comparar com a lista da seção Considerações técnicas)
- [ ] `lib/audit.ts`: união de ações contém só eventos que ainda são emitidos (grep de cada `action:` no código)
- [ ] Typecheck passes · Lint passes · `npm test` passes
- [ ] Verify in browser using dev-browser skill: Configurações em 1280 px e 375 px; sidebar recolhida/expandida

#### US-012: Checkpoint da Onda 1 — fluxo completo ainda em Postgres
**Description:** Como time, queremos provar que as remoções não quebraram o núcleo antes de trocar o banco.

**Acceptance Criteria:**
- [ ] `docker compose up --build` (compose atual, ainda com postgres) sobe os 4 serviços saudáveis; migrations aplicadas em banco zerado sem erro
- [ ] Roteiro executado e registrado no `progress.txt` com prints/observações: login com a conta única → criar projeto → enviar CSV (~500 linhas, alvo categórico) → Preparar mostra grade + distribuições → aplicar uma limpeza (nova versão) → Predição modo Rápido → progresso → relatório com acurácia/matriz/campos → Publicar Web App e prever 1 linha e em lote → publicar API e chamar `/api/v1/predict` via `curl` → publicar MCP e listar a tool
- [ ] Repetir treino em **regressão** e **forecasting** (só até o relatório)
- [ ] `npm run typecheck && npm run lint && npm test` verdes; `uv run pytest` do worker verde
- [ ] Contagem de tabelas no schema = 13: `organizations, users, sessions, accounts, verifications, projects, datasets, dataset_versions, dataset_columns, training_jobs, models, deployments, audit_logs`
- [ ] Nenhuma env da lista "Removidas" (seção Considerações técnicas) aparece em `apps/`, `docker-compose.yml`, `.env.example` ou README (`grep -rn` vazio)

### Onda 2 · SQLite

#### US-013: Schema Drizzle em SQLite, driver libsql e migrations do zero
**Description:** Como desenvolvedora, quero o web falando com um arquivo SQLite via Drizzle, com uma única migration inicial.

**Acceptance Criteria:**
- [ ] `apps/web/src/db/schema.ts` reescrito com `sqliteTable` seguindo a **tabela de mapeamento de tipos** (Considerações técnicas): `pgEnum` → `text({ enum: [...] })`; `uuid().defaultRandom()` → `text().$defaultFn(() => crypto.randomUUID())`; `jsonb` → `text({ mode: "json" }).$type<...>()`; `timestamp withTimezone` → `integer({ mode: "timestamp_ms" })` (Date no TS, epoch ms no banco); `bigint` → `integer`; `numeric` → `real`; `boolean` → `integer({ mode: "boolean" })`; índices únicos parciais (`where`) mantidos onde o SQLite suporta, senão viram checagem em código com comentário
- [ ] `apps/web/src/db/index.ts`: `drizzle-orm/libsql` + `@libsql/client` (`createClient({ url: "file:" + SQLITE_PATH })`), singleton em `globalThis` como hoje; ao abrir, executa `PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL`
- [ ] Motivo de libsql e não better-sqlite3 documentado em comentário: as 3 `db.transaction(async …)` restantes (`(app)/datasets/actions.ts`, `prepare/actions.ts`) exigem driver assíncrono — o `better-sqlite3` do Drizzle só aceita callback síncrono
- [ ] `drizzle.config.ts`: `dialect: "sqlite"`, `dbCredentials.url = "file:" + (SQLITE_PATH ?? "./data/pocket.db")`
- [ ] Pasta `apps/web/drizzle/` apagada e regenerada: **uma** migration `0000_pocket.sql` + `meta/`; `scripts/migrate.mjs` sem advisory lock (instância única), usando o migrator do libsql
- [ ] Better Auth: `drizzleAdapter(db, { provider: "sqlite", schema })`; tabelas `users/sessions/accounts/verifications` com os tipos que o adapter espera (datas como `integer timestamp_ms` funcionam com o adapter Drizzle)
- [ ] Deps: `+ @libsql/client`, `- pg`, `- @types/pg`; `DATABASE_URL` substituída por `SQLITE_PATH` em todo o web (default `./data/pocket.db`; a pasta é criada se não existir)
- [ ] `.gitignore` inclui `data/`
- [ ] Typecheck passes · Lint passes · `npm test` passes (testes são puros — não tocam banco)
- [ ] Verify: `npm run db:migrate` em pasta vazia cria `data/pocket.db` com as 13 tabelas (`sqlite3 data/pocket.db .tables`)

#### US-014: Reescrever o SQL cru e os idiomas Postgres do web
**Description:** Como desenvolvedora, quero que toda consulta que usava operadores/funções do Postgres funcione no SQLite.

**Acceptance Criteria:**
- [ ] `lib/training-eta.ts`: `jsonb_typeof(metadata->'durationSeconds') = 'number'` → `json_type(metadata, '$.durationSeconds') = 'integer' OR … = 'real'`; `metadata->>'datasetId'` → `json_extract(metadata, '$.datasetId')`; `::text` removido; testes existentes continuam verdes
- [ ] `lib/mcp-predict.ts`, `lib/deployment-last-used.ts`, `lib/api-key-rotation.ts`, `lib/storage-quota.ts`, `lib/datasets.ts`, `lib/deployments.ts`, `lib/predictions.ts`, `lib/audit.ts`: qualquer `sql\`` revisado — `now()` → `new Date()` passado como parâmetro; `ON CONFLICT … DO UPDATE` mantido (SQLite suporta); `count(*)`/`sum` com `cast(... as integer)` onde o Drizzle devolver string
- [ ] Comparações de data em `where` usam `Date` (o driver converte para epoch ms) — nenhuma string ISO literal em SQL
- [ ] Buscas `ilike` (se houver) → `like` com `lower()` dos dois lados
- [ ] `grep -rn "jsonb\|::uuid\|::text\|now()\|ilike\|FOR UPDATE\|pg_" apps/web/src` vazio (fora de comentários)
- [ ] Typecheck passes · Lint passes · `npm test` passes
- [ ] Verify: roteiro curto no navegador (upload → Preparar → treino Rápido → relatório) contra o SQLite, com estimativa de tempo de treino exibida na tela de progresso (exercita o `training-eta`)

#### US-015: Worker Python em SQLite
**Description:** Como desenvolvedora, quero o worker lendo e gravando no mesmo arquivo SQLite, sem psycopg.

**Acceptance Criteria:**
- [ ] `apps/worker/jobs/db.py`: `connect()` abre `sqlite3.connect(SQLITE_PATH, timeout=5, isolation_level=None)` com `PRAGMA journal_mode=WAL; busy_timeout=5000; foreign_keys=ON`, `row_factory = sqlite3.Row`; helper `now_ms()` (epoch ms UTC) e `new_id()` (`str(uuid4())`); funções `json_dump`/`json_load` substituem `Jsonb`
- [ ] Em `dataset_parse.py`, `dataset_profile.py`, `dataset_transform.py`, `model_train.py`, `model_predict.py`, `model_predict_batch.py`: placeholders `%s` → `?`; casts `::uuid`/`::int` removidos; `now()` → `?` com `now_ms()`; `Jsonb(x)` → `json_dump(x)`; leituras de colunas JSON passam por `json_load`; booleanos gravados como 0/1; `RETURNING` mantido (SQLite ≥ 3.35 — o `python:3.12-slim-bookworm` traz 3.40); `ON CONFLICT` mantido
- [ ] Ids gerados no Python onde o Postgres gerava via `gen_random_uuid()` (`dataset_versions`, `models`, etc.) — conferir cada `INSERT` sem `id`
- [ ] Timestamps lidos do banco (ex.: `created_at` para ETA/snapshots) convertidos de epoch ms; nenhum `datetime` com tz enviado direto ao driver
- [ ] Transações explícitas (`BEGIN IMMEDIATE … COMMIT`) nos blocos que hoje usam `with conn.transaction()`, com `except sqlite3.OperationalError` ("database is locked") → retry com backoff (3 tentativas) nas gravações de progresso de treino
- [ ] `pyproject.toml`: `- psycopg[binary]`; `SQLITE_PATH` documentada no `apps/worker/CLAUDE.md` (substituindo `DATABASE_URL`)
- [ ] Testes do worker: os que mockam `db.connect`/cursor ajustados; um teste novo grava e lê um dataset em um SQLite temporário aplicando a `0000_pocket.sql` do web (fixture lê o arquivo de `apps/web/drizzle/`)
- [ ] `uv run pytest` verde
- [ ] Verify: `docker compose up` (compose provisório com `app` ou `web`+`worker` apontando para o mesmo arquivo via volume) → upload processado, treino concluído

#### US-016: Concorrência e defaults do Pocket
**Description:** Como usuária, quero que treinos e uploads simultâneos não travem o banco nem corrompam o arquivo.

**Acceptance Criteria:**
- [ ] `TRAINING_CONCURRENCY` default **2** no Pocket (web e worker leem o mesmo default; a estimativa de espera na tela de progresso usa o valor); `MODEL_N_JOBS` default 2 mantido
- [ ] Teste de estresse manual registrado no `progress.txt`: 3 uploads + 2 treinos disparados em <10 s → todos concluem; `grep "database is locked"` nos logs sem falhas definitivas (retries podem aparecer)
- [ ] Nenhum processo além de web e worker abre o arquivo; o `start.sh` (US-018) não roda `migrate.mjs` concorrentemente com o worker (worker só inicia após migrate+bootstrap terminarem)
- [ ] `PRAGMA wal_checkpoint(TRUNCATE)` executado pelo worker ao ficar ocioso por 5 min (evita `-wal` crescer sem limite no disco do Render) — ou justificar por que o checkpoint automático basta
- [ ] Typecheck passes · testes do worker verdes

#### US-017: Checkpoint go/no-go do SQLite
**Description:** Como owner, quero uma decisão explícita e documentada: SQLite fica, ou voltamos ao Postgres.

**Acceptance Criteria:**
- [ ] Roteiro completo da US-012 repetido em SQLite (classificação, regressão, forecasting; Web App, API, MCP) e registrado no `progress.txt`
- [ ] Critérios de **GO** (todos verdadeiros): (1) roteiro passa sem erro; (2) nenhum "database is locked" definitivo no estresse da US-016; (3) tempo de parse de um CSV de 50k linhas ≤ 2× o medido em Postgres na mesma máquina; (4) `npm test` + `pytest` verdes; (5) tamanho do `pocket.db` após o roteiro < 200 MB
- [ ] Se **NO-GO**: registrar o motivo e aplicar o **Plano B** (Considerações técnicas → Plano B) em uma story nova; as Ondas 1 e 3 não dependem disso
- [ ] Decisão escrita no topo do `README.md` da seção "Banco de dados"

### Onda 3 · Empacotamento e deploy

#### US-018: Dockerfile único (web + worker) e `start.sh`
**Description:** Como dona do Pocket, quero uma única imagem que sobe o app inteiro, para caber num serviço do Render com um disco.

**Acceptance Criteria:**
- [ ] Novo `Dockerfile` na **raiz** do repositório, multi-stage: (a) `node:22-bookworm-slim` — `npm ci` + `next build` (standalone) do `apps/web` (**não usar alpine**: o binário nativo do libsql precisa de glibc igual ao runtime); (b) `ghcr.io/astral-sh/uv:python3.12-bookworm-slim` — `uv sync --frozen --no-dev` do `apps/worker`; (c) runner `python:3.12-slim-bookworm` com o binário `node` copiado de (a) (`COPY --from=… /usr/local/bin/node /usr/local/bin/node`), `.next/standalone`, `public`, `.next/static`, `scripts/migrate.mjs`, `scripts/bootstrap.mjs`, `drizzle/`, `seed-assets/`, o `.venv` e o código do worker
- [ ] `start.sh` (raiz, `ENTRYPOINT`): `set -e`; `mkdir -p "$DATA_DIR/uploads"`; exporta `SQLITE_PATH="$DATA_DIR/pocket.db"` e `UPLOAD_DIR="$DATA_DIR/uploads"` se não definidos; roda `node scripts/migrate.mjs` → `node scripts/bootstrap.mjs`; então `node server.js &` e `python main.py &`; `wait -n` — se qualquer um dos dois morrer, mata o outro (`trap`) e sai com o mesmo código, para o Render reiniciar o container
- [ ] Usuário não-root (`app`) dono de `/data`; `EXPOSE 3000`; `HEALTHCHECK` chamando `/api/health`
- [ ] Nova rota `apps/web/src/app/api/health/route.ts`: `GET` → 200 `{ ok: true }` se `SELECT 1` no SQLite e `PING` no Redis respondem; 503 com `{ ok: false, db, redis }` caso contrário; pública no `proxy.ts`
- [ ] `apps/web/next.config.*`: `output: "standalone"` já existe (conferir) e `serverExternalPackages` inclui `@libsql/client` se o build reclamar do binário
- [ ] Variáveis lidas pela imagem documentadas no topo do `Dockerfile`: `DATA_DIR` (default `/data`), `REDIS_URL`, `AUTH_SECRET`, `BETTER_AUTH_URL`, `POCKET_EMAIL`, `POCKET_PASSWORD`, `POCKET_NAME`, `MAX_UPLOAD_MB`, `STORAGE_QUOTA_MB`, `TRAINING_CONCURRENCY`, `MODEL_N_JOBS`, `TRAINING_MAX_ROWS`, `API_PREDICT_MAX_ROWS`, `LAYOUT_REVIEW_ENABLED`, `INTERNAL_ORIGIN_MODE`, `API_AUTH_FAIL_MODE`
- [ ] `docker build -t pocket .` conclui; `docker run` com Redis externo sobe, `/api/health` → 200, imagem final < 1,5 GB
- [ ] `apps/web/Dockerfile` e `apps/worker/Dockerfile` removidos (um só ponto de verdade)

#### US-019: `docker-compose.yml` de desenvolvimento
**Description:** Como desenvolvedora, quero `docker compose up` subindo o Pocket inteiro localmente igual ao Render.

**Acceptance Criteria:**
- [ ] `docker-compose.yml` reescrito com 2 serviços: `app` (build `.`, porta `3000:3000`, volume nomeado `data:/data`, `env_file: .env`, `depends_on: redis (healthy)`) e `redis` (`redis:7`, `--maxmemory-policy noeviction`, healthcheck); volumes `data`, `redis`
- [ ] `docker-compose.prod.yml` removido
- [ ] `.env.example` reescrito com **apenas** as envs da US-018, com comentário de uma linha cada e valores de dev prontos (`POCKET_EMAIL=voce@exemplo.com`, `POCKET_PASSWORD=troque-esta-senha`, `AUTH_SECRET=` com instrução `openssl rand -base64 32`, `BETTER_AUTH_URL=http://localhost:3000`, `REDIS_URL=redis://redis:6379`)
- [ ] Seção "Desenvolvimento nativo (hot reload)" no README: `redis` via compose (`docker compose up redis`), `npm run dev` em `apps/web` com `SQLITE_PATH=../../data/pocket.db REDIS_URL=redis://localhost:6379`, `uv run python main.py` em `apps/worker` com os mesmos valores; os dois processos apontam para o mesmo arquivo e mesma pasta `uploads`
- [ ] Verify: clone limpo → `cp .env.example .env` → `docker compose up --build` → login → dataset de exemplo processado → treino Rápido até o relatório

#### US-020: `render.yaml` (Blueprint) para deploy em 1 clique
**Description:** Como dona do Pocket, quero clicar em "Deploy to Render", informar e-mail e senha, e ter o app no ar.

**Acceptance Criteria:**
- [ ] `render.yaml` na raiz com: serviço `type: web`, `name: automl-pocket`, `runtime: docker`, `dockerfilePath: ./Dockerfile`, `plan: starter`, `region` documentada (Render não tem região no Brasil — usar `ohio` ou `oregon`; deixar comentário), `healthCheckPath: /api/health`, `disk: { name: data, mountPath: /data, sizeGB: 5 }`, `autoDeploy: true`
- [ ] Serviço `type: keyvalue`, `name: automl-pocket-redis`, `plan: free`, `ipAllowList: []` (só rede interna), `maxmemoryPolicy: noeviction` (exigido pelo BullMQ — com `allkeys-lru` a fila perde jobs silenciosamente)
- [ ] `envVars` do web: `REDIS_URL` via `fromService: { type: keyvalue, name: automl-pocket-redis, property: connectionString }`; `AUTH_SECRET` com `generateValue: true`; `POCKET_EMAIL`, `POCKET_PASSWORD`, `POCKET_NAME` com `sync: false` (o Render pergunta na criação); `DATA_DIR=/data`; `TRAINING_CONCURRENCY=2`; `MAX_UPLOAD_MB=25`; `STORAGE_QUOTA_MB=2000`
- [ ] `BETTER_AUTH_URL`: o web passa a aceitar fallback — `process.env.BETTER_AUTH_URL ?? process.env.RENDER_EXTERNAL_URL` (env injetada pelo Render) em `lib/auth.ts`, `lib/app-origin.ts` e onde mais a URL pública for lida (um único helper `publicBaseUrl()` em `lib/app-origin.ts`); sem nenhuma das duas, o app falha no boot com mensagem clara
- [ ] Pré-requisito desta story: repositório novo no GitHub criado e `git remote set-url origin <novo>` feito (o `origin` atual aponta para `rprrafa/automl`)
- [ ] Botão no README: `[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=<URL do repositório>)` com a URL real do repo novo
- [ ] Seção "Deploy no Render" no README: pré-requisitos (conta Render, repo no GitHub), o que o Blueprint cria, custo estimado (`starter` do web ≈ US$ 7/mês + disco 5 GB ≈ US$ 1,25/mês; Key Value free), aviso de que o Key Value free é efêmero (fila reinicia vazia — rejogar o treino) e como trocar a senha depois (Configurações → Trocar senha; as envs só valem no primeiro boot)
- [ ] Verify: Blueprint aplicado em uma conta Render de teste → serviço healthy → login → upload → treino → relatório → Web App público acessível pela URL `onrender.com`. Registrar URL, tempo de build e observações no `progress.txt`

#### US-021: README, CLAUDE.md e limpeza final do repositório
**Description:** Como quem chega no repositório, quero entender em 2 minutos o que é o Pocket, como rodar e como publicar.

**Acceptance Criteria:**
- [ ] `README.md` reescrito: o que é (3 linhas), arquitetura (tabela com `app` = web+worker, `redis`, disco `/data`), "Rodar localmente" (compose e nativo), "Deploy no Render" (US-020), "Variáveis de ambiente" (tabela única com as envs da US-018), "Banco de dados" (SQLite, onde fica o arquivo, como fazer backup: copiar `/data` ou `sqlite3 pocket.db ".backup x.db"`), "Diferenças para o AutoML completo" (lista do que saiu)
- [ ] `SECURITY.md` substituído por uma seção curta "Segurança" no README (conta única, HTTPS pelo Render, chaves de API dos deployments, `INTERNAL_ORIGIN_MODE`/`API_AUTH_FAIL_MODE`); `docs/metricas-uso.md` removido (consultas eram do Postgres multiusuário)
- [ ] PRDs antigos de `tasks/` (todos exceto este) e o runbook movidos para `tasks/legado/` (histórico do produto completo); `prd.json`/`progress.txt` da rodada anterior já estão em `archive/2026-09-11-ux-mcp-home-tour-notificacoes/` — não mexer
- [ ] `apps/web/CLAUDE.md` e `apps/worker/CLAUDE.md` atualizados: SQLite/libsql no lugar de Postgres/psycopg, regras de timestamp (epoch ms) e JSON (text), sem menções a Explore, notificações, e-mail, LLM
- [ ] Pasta `.github/` removida por completo (decisão: sem CI); README tem uma linha "Checks locais" com os comandos `npm run typecheck && npm run lint && npm test` e `uv run pytest`
- [ ] `package.json` do web: `name: "automl-pocket-web"`; scripts `db:*` apontando para o config sqlite; script `seed:examples` mantido
- [ ] `grep -rni "postgres\|psycopg\|openrouter\|resend\|e2b\|google" --exclude-dir=node_modules --exclude-dir=tasks .` vazio (fora de `tasks/legado/`)
- [ ] Verify: seguir o README do zero em máquina limpa (ou container) e chegar ao relatório do modelo

## Functional Requirements

**Acesso**
- FR-1: `/` redireciona para `/login` sem sessão e para `/projects` com sessão; não existe página pública além de `/login`, `/app/[slug]` (Web App publicado) e as APIs (`/api/v1/*`, `/api/mcp`, `/api/auth/*`, `/api/health`).
- FR-2: O login aceita apenas e-mail + senha. Não existem rotas de cadastro, verificação de e-mail, recuperação de senha, 2FA, convite, waitlist ou aceite de política.
- FR-3: No primeiro boot com banco vazio, o sistema cria exatamente uma organização e um usuário a partir de `POCKET_EMAIL`/`POCKET_PASSWORD`/`POCKET_NAME` e semeia o dataset de exemplo (`Credit_Card_Fraud_Example.csv`). Boots seguintes não alteram a conta.
- FR-4: A senha pode ser trocada em Configurações (senha atual + nova, ≥ `PASSWORD_MIN_LENGTH`), com auditoria `auth.password_changed`.

**Núcleo preservado (sem mudança funcional)**
- FR-5: Projetos e Datasets (listas, criação, renome, exclusão, escolha de fonte, upload CSV/XLSX/JSON, planilha modelo, revisão de layout quando `LAYOUT_REVIEW_ENABLED`) funcionam como hoje.
- FR-6: Preparar (grade virtualizada, distribuições, tipos, versões, "Limpar dataset") funciona como hoje.
- FR-7: Predição (classificação, regressão, forecasting; modos de treino; progresso com ETA; relatório de insights) funciona como hoje, **exceto** a seção "Insights da IA", que deixa de existir.
- FR-8: Publicar (Web App público com predição unitária e em lote; API `/api/v1/predict` com chave; servidor MCP `/api/mcp`) funciona como hoje, sem contagem nem bloqueio por cota mensal de predições. `API_PREDICT_MAX_ROWS` e o limite de 1 MB por chamada permanecem.
- FR-9: Cota de armazenamento (`STORAGE_QUOTA_MB`), `MAX_UPLOAD_MB`, `TRAINING_MAX_ROWS`, rate limits (Redis) e as flags `INTERNAL_ORIGIN_MODE`/`API_AUTH_FAIL_MODE` continuam valendo com os defaults atuais.
- FR-10: `audit_logs` continua registrando login, upload, treino, deployments e troca de senha; eventos de features removidas somem da união de tipos.

**Persistência**
- FR-11: Todos os dados relacionais vivem em um arquivo SQLite em `SQLITE_PATH`; arquivos enviados e artefatos em `UPLOAD_DIR`; ambos sob `DATA_DIR` (default `/data`) no container.
- FR-12: Web e worker abrem o mesmo arquivo com WAL, `busy_timeout` 5 s e `foreign_keys` ligado; timestamps são epoch ms (inteiro) e JSON é `text`, em ambos os lados.
- FR-13: As migrations são regeneradas do zero (uma única `0000_pocket.sql`); não há caminho de migração de dados do produto completo para o Pocket.

**Empacotamento**
- FR-14: Uma única imagem Docker (raiz) sobe migrate → bootstrap → web + worker; a morte de qualquer processo derruba o container.
- FR-15: `GET /api/health` responde 200 só se SQLite e Redis estiverem acessíveis.
- FR-16: `render.yaml` cria web service (docker, disco em `/data`) + Key Value com `noeviction`, pedindo apenas e-mail/senha/nome na criação; `AUTH_SECRET` é gerado pelo Render; a URL pública é resolvida por `BETTER_AUTH_URL ?? RENDER_EXTERNAL_URL`.
- FR-17: `docker-compose.yml` sobe `app` + `redis` localmente com a mesma imagem.

## Non-Goals (fora de escopo)

- Multiusuário, times, permissões, convites, aprovação de contas, políticas/LGPD, MFA, login social.
- Qualquer função com LLM (chat de dados, insights gerados, guia do problema) ou sandbox de código.
- Notificações (in-app, e-mail), envio de e-mail de qualquer tipo, rota interna web↔worker.
- CTAs comerciais, leads, reportar bug, página de docs da API, home/marketing, SEO.
- Cotas de predição e observabilidade de uso de IA/predições; consultas de métricas do beta.
- Migrar dados existentes do AutoML (Postgres) para o Pocket.
- Substituir Redis/BullMQ (decisão 1A) ou mudar o algoritmo/UX de Preparar, Predição e Publicar.
- Alta disponibilidade, múltiplas réplicas, backup automático (o README explica backup manual).
- Suporte a outras plataformas de deploy além de Render + Docker local (Fly/Railway ficam como ideia futura).

## Design Considerations

- Nenhuma tela nova, exceto o estado vazio simples da lista de projetos (US-007) e a tela de login reduzida (US-008). Reutilizar `Card`, `Button` e `AuthShell` existentes.
- Navbar do projeto com 3 abas: **Preparar · Predição · Publicar** (ícones atuais `SlidersHorizontal`, `Sparkles`, `Rocket`).
- Configurações com 3 cards: Conta, Armazenamento, Sessão.
- Textos em pt-BR, mesma voz do produto; a marca continua **"AutoML"** no `<title>`, logo e login, com o selo "Beta" existente na sidebar (`app-sidebar.tsx`). Nenhuma menção a "Pocket" na UI.
- Copy travada por teste onde já existir esse padrão (`lib/*-copy.ts` — ver `apps/web/CLAUDE.md`).

## Technical Considerations

### Inventário do que sai (referência para as stories da Onda 1)

| Área | Rotas/páginas | `lib/` | Componentes | Tabelas | Deps npm | Envs |
| --- | --- | --- | --- | --- | --- | --- |
| Home | `(marketing)/`, `scripts/og-image.mts`, `scripts/screenshot.mjs` | `marketing/` | `components/marketing/` | — | `motion` | — |
| Explore | `[projectId]/explore/`, `api/explore/` | `explore/`, `sandbox.ts` | — | `explore_chats`, `explore_messages` | `@e2b/code-interpreter`, `plotly.js-dist-min`, `react-markdown` | `OPENROUTER_API_KEY`, `EXPLORE_MODEL`, `EXPLORE_OFFTOPIC_MODE`, `E2B_*` |
| IA restante | `[projectId]/guia/`, `api/projects/[id]/template/`, `projects/brief-actions.ts`, `predict/ai-insight-section.tsx`, `predict/insight-actions.ts` | `llm*.ts`, `model-insight.ts`, `problem-brief*.ts` | `problem-brief-card`, `data-help-cta-card` | `llm_usage`; colunas `models.ai_insight`, `projects.problem_brief` | — | `LLM_*`, `DAILY_*`, `MONTHLY_LLM_*` |
| Enterprise / bug | `(app)/enterprise/`, `api/problem-reports/` | `contact.ts`, `enterprise-lead*.ts`, `production-cta.ts`, `problem-report/` | `enterprise-inline-cta`, `request-enterprise-dialog`, `settings-enterprise-card`, `sidebar-enterprise-card`, `production-cta-banner`, `problem-report-*` | `enterprise_leads`, `problem_reports` | `modern-screenshot` | — |
| Notificações / e-mail | `api/internal/` | `notifications*.ts`, `notification-*.ts`, `internal-api.ts`, `email.ts`, `email-templates.ts` | `notifications-bell`, `notification-dialog`, `notifications-actions` | `notifications` | `resend` | `RESEND_API_KEY`, `EMAIL_FROM`, `INTERNAL_API_TOKEN`, `WEB_INTERNAL_URL` |
| Onboarding | `projects/onboarding-actions.ts` | `onboarding*.ts`, `mfa-suggestion*.ts` | `welcome-panel`, `onboarding-checklist`, `onboarding-confetti`, `onboarding-step-banner` | colunas `users.onboarding_*`, `users.mfa_prompt_*` | — | — |
| Auth | `signup/`, `verify-email/`, `forgot-password/`, `reset-password/`, `2fa/`, `waitlist/`, `aceite-politica/`, `politica-*` | `two-factor-*.ts`, `verify-email.ts`, `signup-ref.ts`, `auth-email-rate-limit.ts`, `invites.ts`, `invite-cookie.ts`, `policy*.ts` | `google-icon`, `two-factor-*`, `security-card` | `two_factors`, `invite_codes`, `invite_redemptions`, `policy_acceptances`; colunas `users.two_factor_enabled`, `users.approved_at` | `qrcode`, `@types/qrcode` | `GOOGLE_CLIENT_*` |
| Cota de predições / docs | `docs/` | `inference-quota.ts` | — | `inference_usage` | — | `MONTHLY_INFERENCE_LIMIT` |
| Banco | — | — | — | — | `pg`, `@types/pg` (→ `@libsql/client`) | `DATABASE_URL`, `POSTGRES_*` (→ `SQLITE_PATH`, `DATA_DIR`) |

Worker: saem `notifications_email.py`, `notification_copy.py` e a dependência `psycopg[binary]`.

### Mapeamento de tipos Postgres → SQLite (Drizzle)

| Postgres (hoje) | SQLite (Pocket) | Observação |
| --- | --- | --- |
| `pgEnum(...)` (11 enums) | `text({ enum: [...] })` | Sem enum no banco; validação em TS. Worker grava a string. |
| `uuid().defaultRandom()` | `text().$defaultFn(() => crypto.randomUUID())` | Worker: `str(uuid4())` onde insere. |
| `jsonb` (21 colunas) | `text({ mode: "json" })` | Worker: `json.dumps`/`json.loads`. Consultas: `json_extract`, `json_type`. |
| `timestamp({ withTimezone })` / `defaultNow()` | `integer({ mode: "timestamp_ms" }).$defaultFn(() => new Date())` | Epoch ms. Worker: `int(time.time() * 1000)`. Nunca string ISO no banco. |
| `bigint` | `integer` | SQLite integer é 64 bits. |
| `numeric` | `real` | Só 1 coluna. |
| `boolean` | `integer({ mode: "boolean" })` | Worker grava 0/1. |
| `text`, `integer` | iguais | — |
| índice único parcial (`where`) | suportado pelo SQLite | Drizzle sqlite aceita `.where()` em `uniqueIndex`. |
| `FOR UPDATE` | — | Só em `invites.ts` (removido). |
| advisory lock no `migrate.mjs` | — | Instância única. |

### Por que libsql e não better-sqlite3

O Drizzle com `better-sqlite3` só aceita `db.transaction((tx) => { … })` **síncrono**; o código tem 3 transações assíncronas que sobrevivem à Onda 1 (`(app)/datasets/actions.ts`, `prepare/actions.ts` ×2). `@libsql/client` (`file:` URL) tem API assíncrona, prebuilt para linux-x64-gnu/arm64-gnu, e o Better Auth aceita o adapter Drizzle com `provider: "sqlite"`. Build e runtime em **bookworm (glibc)** — nada de alpine.

### Concorrência SQLite

- WAL permite leituras concorrentes com um escritor; `busy_timeout=5000` faz o segundo escritor esperar em vez de falhar.
- Escritores no Pocket: Next (uploads, ações, chaves) e worker (progresso de treino, versões). Com `TRAINING_CONCURRENCY=2` a contenção é baixa. Retry com backoff nas gravações de progresso do worker cobre o resto.
- `wal_checkpoint(TRUNCATE)` periódico evita o arquivo `-wal` crescer no disco do Render.

### Render — pontos de atenção

- Disco só em plano pago do web service; um disco por serviço → web e worker na mesma imagem (decisão de arquitetura acima).
- Com disco, o Render faz deploy com downtime curto (para a instância antiga antes de subir a nova) — necessário para o SQLite.
- Key Value `free`: 25 MB, sem persistência; `maxmemoryPolicy: noeviction` obrigatório para BullMQ.
- `RENDER_EXTERNAL_URL` é injetada automaticamente — usada como fallback de `BETTER_AUTH_URL`.
- Sem região no Brasil; latência de ~150 ms de São Paulo a Ohio — irrelevante para uso individual.
- Secrets pedidas na criação do Blueprint via `sync: false`.

### Plano B (se o SQLite for NO-GO na US-017)

Manter o schema Postgres da Onda 1 (já enxuto) e: `render.yaml` ganha `databases: [{ name: automl-pocket-db, plan: basic-256mb }]` com `DATABASE_URL` via `fromDatabase`; a imagem única continua (uploads e artefatos precisam do disco compartilhado de qualquer forma); `docker-compose.yml` volta a ter `postgres`. Custo sobe ~US$ 6/mês. As Ondas 1 e 3 não mudam.

### Testes

- Vitest do web não toca banco (confirmado) — a troca de driver não quebra testes; ajustar só os que importam módulos removidos.
- Worker: testes atuais treinam artefatos em memória; adicionar 1 teste de integração com SQLite temporário aplicando a migration do web (US-015).
- Cada onda fecha com roteiro manual documentado no `progress.txt` (US-012, US-017, US-020).

## Success Metrics

- `docker compose up` do zero até o primeiro relatório de modelo em **< 10 minutos** (incluindo build), sem editar nada além do `.env`.
- Deploy no Render em 1 clique: do "Deploy to Render" ao login funcional em **< 20 minutos**, informando só e-mail/senha/nome.
- Zero chamadas de rede a terceiros durante o fluxo completo (verificável desligando a internet do container após o build, exceto Redis).
- Redução de código: ≤ 13 tabelas, `lib/` com ≤ 45 arquivos (hoje 97), `package.json` sem as 10 deps listadas, `.env.example` com ≤ 16 variáveis (hoje 29).
- Paridade funcional: o roteiro da US-012 passa igual em Postgres (fim da Onda 1) e SQLite (US-017).
- Custo mensal no Render ≈ US$ 8 (starter + disco), Key Value free.

## Open Questions

Resolvidas em 2026-09-11: MFA sai; 1 dataset de exemplo; sem CI; `origin` novo; marca continua "AutoML" (beta).

1. **Working tree**: há alterações não commitadas em `apps/web/src/app/(app)/layout.tsx` e `notifications-bell.tsx` (e o `ci.yml` apagado). Assumido: **descartar** antes de começar a Onda 1 — a US-005 remove o sino e a US-021 remove `.github/`. Avisar se essas mudanças devem ser preservadas.
2. **Defaults de capacidade**: assumidos `MAX_UPLOAD_MB=25` e `STORAGE_QUOTA_MB=2000` (hoje 10 / 200 para o beta) e disco de 5 GB no Render. Ajustar na US-020 se quiser outros valores.
3. **Revisão de layout (4G, mantida)**: continua atrás da flag `LAYOUT_REVIEW_ENABLED=false` por default (comportamento atual). Ligar por padrão é uma mudança de uma linha no `render.yaml`/`.env.example` se preferir.
