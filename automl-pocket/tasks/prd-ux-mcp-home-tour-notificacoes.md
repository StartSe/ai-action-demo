# PRD: Servidor MCP simplificado, revisão da Home, primeiros passos e central de notificações

## Introdução

Cinco frentes de UX pedidas após a rodada da homepage pública (PRD `prd-homepage-executivos.md`, entregue em 2026-09-04):

| Frente | Pedido | Situação hoje (auditoria do código) |
|---|---|---|
| A | Simplificar a tela **Servidor MCP**; o botão "Publicar" fica escondido e a tela está poluída, mas as opções de integração precisam continuar visíveis | `deploy/mcp/mcp-config.tsx` (US-051) empilha, numa só tela e sem hierarquia: faixa de 3 passos, sidebar com nome + descrição + lista de campos (até 288 px de scroll interno) + status da chave + **botões Publicar/Salvar no fim da sidebar**; à direita, URL do endpoint com token, busca de agente, grade de 7 cards, instruções, bloco "Tool predict" com todos os campos e "Boas práticas de segurança". Em 1366×768 o "Publicar" fica abaixo da dobra; em rascunho, 60 % da tela (agentes, URL, tool) está desabilitada ou inútil. |
| B | Revisar a estrutura da **Home Page** e melhorar interface e navegação; remover "Empresas que confiam" | Home pública `/` em `(marketing)/page.tsx`: Hero → TrustedBy → UseCases → HowItWorks → AgentShowcase → Features → FinalCta. `TrustedBy` não renderiza (sem logos autorizados) mas segue no código. Header com âncoras sem indicação de seção ativa; em mobile "Entrar" e "Começar grátis" só existem dentro do menu; footer com 3 links; sem FAQ; sem skip-link. Depois do login o usuário cai em `/projects`, que abre direto na grade de projetos. |
| C | Breve tour de "por onde começar" após criar a conta, **sem ser repetitivo** | Não existe onboarding. Após cadastro → verificação de email → aceite da política → (waitlist) → `/projects` vazio com "Novo projeto". O fluxo real (projeto → dados → Preparar → Predição → Publicar) só se descobre navegando. |
| D | Sugerir a configuração de **MFA** para quem entra com email e senha, sem pesar o onboarding, como notificação | 2FA TOTP existe e é opcional (`SecurityCard` em Configurações, só para conta com `accounts.provider_id = "credential"`). Nada convida o usuário a ativar. |
| E | Usar a mesma notificação quando um **treinamento termina** | O worker grava `training.succeeded`/`training.failed` em `audit_logs` (`model_train.py`). A UI só descobre via `router.refresh()` a cada poucos segundos **na página do job**; quem sai da tela não é avisado. Não há tabela nem UI de notificações; feedback efêmero é só `sonner`. |

A frente D e a E dependem da mesma infraestrutura: uma **central de notificações in-app** (tabela + sino + lista), que passa a ser o canal padrão para avisos não urgentes.

## Objetivos

- Na tela MCP, a ação primária (Publicar / Salvar alterações) fica visível sem rolar em 1366×768 e em mobile, e o usuário em rascunho vê só o que precisa para publicar; após publicar, a tela vira uma tela de **conexão** com as 7 integrações visíveis.
- Home pública: navegação com seção ativa, ações de conta acessíveis em mobile sem abrir menu, seção de FAQ e footer completo, sem regressão de Lighthouse (≥ 90 mobile) nem do orçamento de JS da US-021.
- Onboarding: todo usuário novo vê **uma vez** um painel de boas-vindas e depois um checklist "Primeiros passos" que se completa sozinho pelo progresso real e desaparece ao concluir ou ao ser dispensado. Nunca reaparece em outro dispositivo depois de dispensado (estado no servidor, não em `localStorage`).
- Central de notificações: sino no app com contador de não lidas, lista com marcar como lida, tipos tipados e desduplicados; treino concluído/falho gera notificação **na mesma transação** do status no worker; sugestão de MFA gera uma notificação só, no momento certo, com "Lembrar depois" e "Não sugerir de novo".
- Tudo em pt-BR, acessível (foco, `aria-live`, contraste AA), coberto por testes Vitest nas regras puras, e sem novas dependências além das já usadas (Radix via shadcn, `motion`, `sonner`).

## Decisões de produto

### Qual "Home Page"?

**A home pública `/`** (confirmado em 2026-09-04 junto com o pedido de remover "Empresas que confiam"). A tela inicial de quem está logado (`/projects`) também muda nesta PRD, mas pela frente E (é onde o tour vive).

### Remover "Empresas que confiam"

A faixa `TrustedBy` sai da home (pedido de 2026-09-04). Hoje ela já não renderiza quando `TRUSTED_LOGOS` está vazio, mas o componente, o copy, os SVGs em `public/marketing/logos` e o teste que os cobre continuam no código. A US-016 remove tudo e ajusta o ritmo entre o hero e "Casos de uso" para não sobrar um vão em branco. A ordem passa a ser: Hero → UseCases → HowItWorks → AgentShowcase → Features → FAQ (nova, US-014) → FinalCta.

### MCP: um passo de cada vez, sem esconder as integrações

- A tela passa a ter um **cabeçalho fixo** (sticky) com título, badge de status e a **ação primária à direita**: "Publicar" em rascunho, "Salvar alterações" (habilitado só com mudança) quando publicado. Em telas < `sm` o cabeçalho vira uma barra inferior fixa com a mesma ação.
- **Rascunho**: o conteúdo é só o passo 1 (Configurar): nome, descrição, campos. As integrações **continuam visíveis** como uma faixa compacta de ícones + nomes dos 7 agentes ("Depois de publicar, conecte a: Claude, Claude Code, ChatGPT, Cursor, VS Code, Gemini CLI ou outro cliente MCP") — sem busca, sem cards clicáveis, sem URL com placeholder.
- **Publicado**: o conteúdo principal vira o passo 2 (Conectar): bloco da chave (revelada logo após publicar/rotacionar, com o aviso de "copie agora"), cards dos agentes com busca, instruções do agente escolhido. A URL do endpoint aparece **uma vez**, dentro das instruções (hoje aparece no topo e de novo no código de cada agente). A configuração (nome, descrição, campos) fica numa seção recolhida "Configuração do servidor" com resumo em uma linha ("Predição — Churn · 8 campos"); "Despublicar" e as ações da chave (Rotacionar/Revogar) ficam num menu "Mais ações" no cabeçalho, com os diálogos de confirmação atuais.
- "Tool predict" (lista de parâmetros) e "Boas práticas de segurança" viram seções recolhíveis (fechadas por padrão) no fim; a faixa dos 3 passos vira um **stepper** de uma linha que marca o passo atual (1 Configurar → 2 Conectar → 3 Usar).
- A mecânica de estado, as server actions e `DeploymentKeyStatus`/`DeploymentKeyActions`/`DeploymentSecurityPractices` não mudam; é rearranjo de layout e disclosure. A tela da API (`deploy/api/api-config.tsx`) **não** muda nesta PRD (non-goal), mas o cabeçalho fixo nasce como componente reutilizável para ela depois.

### Central de notificações: in-app, tipada, desduplicada

- Nova tabela `notifications` (ver US-004). Recipiente por `user_id`; o worker, que só conhece `org_id`, resolve os usuários da organização na hora de inserir (hoje toda org é pessoal, 1:1 — a consulta já fica pronta para orgs com vários membros).
- Tipos nesta PRD: `training.succeeded`, `training.failed`, `security.mfa_suggestion`. Cada tipo tem título, corpo, ícone, `href` e regra de desduplicação (`dedupe_key` único por usuário: `training:<job_id>`, `mfa-suggestion`).
- UI (decisão de 2026-09-04): **sino no canto superior direito** de todas as telas logadas, com badge de não lidas (máx. "9+"). Nas telas do grupo `(app)` (`/projects`, `/datasets`, `/settings`) ele fica ancorado no topo direito da área de conteúdo, via `(app)/layout.tsx`; nas telas de projeto fica no `ProjectNavbar`, à direita, ao lado de "Relatar problema". Clique abre um **popover com a lista resumida** (as 20 mais recentes, lidas e não lidas diferenciadas, "Marcar todas como lidas", "Carregar mais"). Clicar num item **abre um modal** com a notificação completa (título, corpo, quando, detalhes e o botão de ação, ex.: "Ver relatório do modelo" ou "Ativar agora"); abrir o modal marca como lida. **Não há página `/notificacoes`.**
- Atualização: polling leve a cada 30 s via server action `getUnreadNotifications()` (só contador + itens novos desde o último `id`); quando chega notificação nova de treino **e o usuário não está na página do job**, mostra também um toast `sonner` com o mesmo título e o link. Sem SSE/WebSocket (non-goal).
- **E-mail** (decisão de 2026-09-04): treino concluído ou falho também vai por e-mail, porque é justamente quando o usuário saiu da plataforma que o aviso importa. O e-mail sai pelo web (`lib/email.ts`, Resend, templates em `email-templates.ts`) para os templates ficarem num só lugar: o worker, depois do commit, chama uma rota interna do web que envia e marca `emailed_at` (US-017). A sugestão de MFA **não** vai por e-mail (evita parecer phishing).
- **Tom da falha**: neutro. Ícone `AlertCircle` em âmbar, título "Treinamento de {projeto} não concluído" e corpo objetivo com a causa em uma frase; o botão do modal leva à página do job, que já tem "Tentar novamente". Nada em vermelho, nenhum "erro" no título.

### Sugestão de MFA: uma vez, no momento certo, e só para quem tem senha

- Público: usuário com conta `credential` e `two_factor_enabled = false`. Contas só Google nunca recebem (o Google já cobre; mesma regra do `SecurityCard`).
- Momento: **não** no primeiro login. A notificação é criada no primeiro login que acontece **≥ 24 h após o cadastro** ou logo após o **primeiro treinamento concluído**, o que vier primeiro. Assim o onboarding inicial fica leve e a sugestão chega quando a conta já tem algo a proteger.
- Texto: "Proteja sua conta com verificação em duas etapas" / "Você entra com email e senha. Ative o código do app autenticador em Configurações → Segurança; leva 2 minutos." Ações: **Ativar agora** (vai para `/settings?ativar-2fa=1`, que abre o `TwoFactorEnableDialog` já existente), **Lembrar depois** (marca lida e agenda nova sugestão em 30 dias), **Não sugerir de novo** (`users.mfa_prompt_dismissed_at`; nunca mais cria).
- Ao ativar o 2FA, notificações `mfa-suggestion` pendentes são marcadas como lidas automaticamente.

### Primeiros passos: checklist que se completa sozinho

- Sem *coachmarks* em cadeia (tooltips que bloqueiam a tela); são repetitivos e frágeis. Em vez disso:
  1. **Painel de boas-vindas**, uma vez só, em `/projects` na primeira visita depois do aceite da política: título "Bem-vindo(a), {nome}", uma frase do que dá para fazer, os 4 passos ilustrados (Criar projeto → Enviar dados → Treinar modelo → Usar predições) e dois botões: "Criar meu primeiro projeto" (abre o `CreateProjectDialog`) e "Explorar por conta própria" (fecha). Fechar grava `onboarding_welcome_seen_at`.
  2. **Card "Primeiros passos"** no topo de `/projects` (acima das abas), com 4 itens marcáveis automaticamente pelo estado real da conta: projeto criado (`projects` ≥ 1), dados enviados (`projects.dataset_id` não nulo em algum projeto), modelo treinado (`models` ≥ 1), predição feita ou endpoint publicado (`inference_usage` > 0 **ou** `deployments.status = 'published'`). Cada item tem um link para a próxima ação ("Criar projeto", "Enviar dados", "Ir para Predição", "Publicar"). Barra "2 de 4".
  3. Regras de não repetição: o card só existe enquanto houver item pendente; ao completar os 4 mostra "Tudo pronto" com confete discreto (`motion`, respeitando `prefers-reduced-motion`) **uma vez** e some; botão "Ocultar" (X) grava `onboarding_dismissed_at` e o card nunca mais volta; o estado fica em `users` (não em `localStorage`), então vale em qualquer dispositivo. Usuários pré-existentes com ≥ 1 modelo treinado recebem `onboarding_dismissed_at` preenchido na migração (não veem nada).
  4. Dentro do projeto novo (tela "Escolha uma fonte de dados") **nada muda**: ela já é auto-explicativa. Em Preparar, o card recolhido do guia do problema já cumpre o papel.

## User Stories

### Frente A: Servidor MCP

### US-001: Cabeçalho fixo com a ação primária sempre visível
**Description:** Como usuário, quero ver e clicar em "Publicar" (ou "Salvar alterações") sem rolar, em qualquer tamanho de tela.

**Acceptance Criteria:**
- [ ] Novo componente `components/app/deployment-page-header.tsx` (client): à esquerda link "← Publicar" (volta para `/projects/{id}/deploy`), título "Servidor MCP" e badge de status (Publicado / Não publicado); à direita a **ação primária** e um `DropdownMenu` "Mais ações" (ícone `MoreHorizontal`); `sticky top-0 z-20` com `bg-background/95 backdrop-blur border-b`
- [ ] Em rascunho a ação primária é "Publicar" (ícone `Globe`); publicado é "Salvar alterações" (ícone `Check`, `disabled` quando não há mudança, como hoje); estado de carregamento com `Loader2` (comportamento idêntico ao atual, só muda a posição)
- [ ] "Salvar rascunho" (rascunho) vira item do menu "Mais ações"; publicado, o menu tem "Rotacionar chave", "Revogar chave" e "Despublicar", reutilizando os diálogos de `DeploymentKeyActions` (extrair os diálogos para aceitarem `trigger` customizado se necessário, sem duplicar texto)
- [ ] Abaixo de `sm` (< 640 px) o cabeçalho mantém título/status no topo e a ação primária vai para uma **barra inferior fixa** (`fixed bottom-0`, `pb-[env(safe-area-inset-bottom)]`), com `padding-bottom` no conteúdo para nada ficar coberto
- [ ] Em 1366×768 com a lista de campos com 20 itens, "Publicar" está visível sem rolagem (verificar no browser)
- [ ] Erros de validação ("Informe um nome para o servidor.", "Selecione pelo menos um campo.") continuam junto dos campos e a ação primária continua `disabled` nesses casos; ao clicar na ação desabilitada nada acontece, mas o `title`/tooltip explica o motivo
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill (1366×768, 1280×720, 375×812)

### US-002: Rascunho mostra só o passo Configurar, com as integrações visíveis
**Description:** Como usuário que ainda não publicou, quero uma tela curta com o que preciso preencher, mas já sabendo com quais agentes vou poder conectar.

**Acceptance Criteria:**
- [ ] Stepper de uma linha substitui a faixa de 3 cards: "1 Configurar · 2 Conectar · 3 Usar", com o passo atual em `text-primary` e os demais em `text-muted-foreground`; ícones atuais (`Globe`, `Plug`, `MessageSquareText`) mantidos em 16 px; `aria-current="step"` no passo atual
- [ ] Em rascunho (`status === "draft"`) o conteúdo principal, em coluna única `max-w-2xl` centralizada, tem só: Nome do servidor, Descrição, "Selecionar campos" (mesma lista com "Selecionar todos", agora com `max-h` de 40 vh e contador "8 de 12 campos selecionados")
- [ ] Abaixo, faixa "Depois de publicar, conecte a:" com **4 chips não clicáveis** (Claude, ChatGPT, Cursor, VS Code — ícone + nome, `aria-hidden` no ícone) e um quinto chip "e outros" com `Tooltip` listando os demais de `AGENTS` (Claude Code, Gemini CLI, Outro cliente MCP); sem campo de busca, sem URL, sem placeholder `SUA_CHAVE_API`; a lista dos 4 em destaque vem de uma constante `FEATURED_AGENT_IDS` ao lado de `AGENTS`
- [ ] "Tool predict" e "Boas práticas de segurança" ficam em `<details>`/accordion fechados por padrão no fim da página, com resumo em uma linha ("Tool predict — 8 parâmetros" / "Boas práticas de segurança — 4 itens")
- [ ] O aviso âmbar "Publique o servidor primeiro…" deixa de existir (não há mais nada desabilitado na tela)
- [ ] Nenhuma mudança em `actions.ts`, no payload nem na lógica de `dirty`/`canSubmit`
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-003: Publicado vira a tela "Conectar", com configuração recolhida
**Description:** Como usuário com o servidor publicado, quero ir direto às instruções de conexão do meu agente e mexer na configuração só quando precisar.

**Acceptance Criteria:**
- [ ] Logo após publicar (ou rotacionar), a primeira seção é o bloco da chave de `DeploymentKeyStatus` com a chave revelada e o aviso atual "Copie a chave agora — ela não será exibida de novo" em destaque (`border-primary`); depois de sair da tela, o bloco mostra prefixo, "Último uso" e "Chave anterior expira em" como hoje
- [ ] Seção "Escolha seu agente de IA": busca + grade de cards (comportamento atual), agora sempre habilitada; ao selecionar um agente, as instruções aparecem **logo abaixo do card** (não numa coluna separada) e a página rola suavemente até elas (`scrollIntoView({ block: "nearest" })`, desligado sob `prefers-reduced-motion`)
- [ ] A URL do endpoint só aparece dentro das instruções do agente escolhido (já acontece em `buildInstructions`); o bloco "Endpoint MCP" do topo é removido; um link discreto "Ver URL e header genéricos" abre as instruções do agente "Outro (genérico)"
- [ ] Seção recolhida "Configuração do servidor" (accordion) com resumo "{título} · {n} campos" e, ao abrir, Nome, Descrição e a lista de campos; editar qualquer coisa habilita "Salvar alterações" no cabeçalho (US-001) e mostra um chip "Alterações não salvas" ao lado do resumo
- [ ] Ao despublicar, a tela volta ao layout de rascunho da US-002 e o agente selecionado é limpo (comportamento atual de `handleUnpublish`)
- [ ] Largura máxima da coluna `max-w-3xl`; em `lg` a grade de agentes tem 4 colunas, em `sm` 3, abaixo 2 (como hoje)
- [ ] Contagem de elementos interativos visíveis na tela publicada sem agente selecionado ≤ 14 (cabeçalho 3, chave 2, busca 1, 7 cards, 1 accordion) — hoje são 25+
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill: publicar → chave revelada → escolher Claude → copiar → recarregar → abrir configuração → alterar campo → salvar → despublicar

### Frente B: Central de notificações (infraestrutura)

### US-004: Tabela `notifications`, tipos e regras puras
**Description:** Como desenvolvedor, preciso de um lugar durável e tipado para notificações in-app, com desduplicação, para que web e worker gravem do mesmo jeito.

**Acceptance Criteria:**
- [ ] Migration Drizzle `0028_notifications.sql` + schema: tabela `notifications` com `id uuid pk`, `user_id uuid not null references users on delete cascade`, `org_id uuid not null references organizations`, `type text not null`, `title text not null`, `body text`, `href text`, `dedupe_key text`, `metadata jsonb`, `read_at timestamptz`, `created_at`/`updated_at` (helper `timestamps`); índice `(user_id, read_at, created_at desc)`; **unique parcial** `(user_id, dedupe_key) where dedupe_key is not null`
- [ ] Módulo puro client-safe `src/lib/notifications.ts`: `NOTIFICATION_TYPES = ["training.succeeded", "training.failed", "security.mfa_suggestion"] as const`, `notificationIcon(type)` (lucide: `CheckCircle2`, `AlertCircle`, `ShieldCheck`), `formatNotificationTime(createdAt, now)` (reusa `formatRelativeAgo` de `deployment-key-format.ts`), `MAX_UNREAD_BADGE = 9` e `unreadBadgeLabel(n)` ("9+")
- [ ] Módulo server-only `src/lib/notifications-server.ts`: `createNotification({ userId, orgId, type, title, body, href, dedupeKey, metadata })` com `onConflictDoNothing` na unique; `listNotifications(userId, { limit, before })`; `countUnread(userId)`; `markRead(userId, ids)`; `markAllRead(userId)`; `resolveByDedupeKey(userId, key)` (marca lida)
- [ ] Textos de cada tipo em `src/lib/notification-copy.ts` (`trainingSucceededNotification({ projectName, modelName, metricLabel })`, `trainingFailedNotification(...)`, `MFA_SUGGESTION_NOTIFICATION`) — o worker replica só os dois de treino (ver US-006) e um teste trava a igualdade dos títulos entre TS e Python via fixture JSON `src/lib/__fixtures__/notification-copy.json` lida pelos dois lados
- [ ] Testes Vitest: desduplicação (segundo insert com a mesma `dedupe_key` não cria), `unreadBadgeLabel`, ordenação e paginação de `listNotifications` (com o helper de banco de teste já usado nos testes de `deployments`)
- [ ] Typecheck/lint passam; testes passam

### US-005: Sino no canto superior direito, lista resumida e modal de detalhe
**Description:** Como usuário, quero ver no canto superior direito quantas notificações novas tenho, passar o olho na lista resumida e abrir a que me interessa.

**Acceptance Criteria:**
- [ ] Componente client `components/app/notifications-bell.tsx` com prop `variant: "app" | "navbar"`: botão de 36 px com ícone `Bell`, `aria-label="Notificações, {n} não lidas"` e badge com `unreadBadgeLabel` (oculta em 0); `variant="navbar"` segue o estilo do `ProblemReportButton variant="navbar"` (fundo escuro); `variant="app"` usa `variant="ghost"` sobre `bg-background`
- [ ] Posição no grupo `(app)`: `(app)/layout.tsx` envolve `main` em `relative` e renderiza `<NotificationsBell variant="app" />` em `absolute top-4 right-6 z-30`; as linhas de cabeçalho de `/projects` (busca + "Novo projeto"), `/datasets` e `/settings` ganham `pr-12` no bloco da direita para nada ficar por baixo do sino. Nas telas de projeto, o sino entra no `ProjectNavbar` à esquerda de "Relatar problema" (`variant="navbar"`); o `AppSidebar` **não** recebe sino
- [ ] `initialUnread` vem do servidor (`countUnread` nos dois layouts) para o badge não piscar no carregamento
- [ ] Popover (Radix `Popover` via `components/ui/popover.tsx`, adicionar por shadcn) de 380 px alinhado à direita: cabeçalho "Notificações" + botão de texto "Marcar todas como lidas" (só quando há não lidas); lista das 20 mais recentes, cada item com ícone do tipo, título (`font-medium`, 1 linha), corpo resumido (`line-clamp-1`) e tempo relativo; **não lidas** com ponto `bg-primary` à esquerda e `bg-muted/40`, **lidas** em `text-muted-foreground`; rodapé "Carregar mais" (cursor `before`, 20 por vez) enquanto houver
- [ ] Clicar num item **abre um `Dialog`** (`components/app/notification-dialog.tsx`) com: ícone do tipo, título, "há X min · DD/MM/AAAA HH:MM", corpo completo, bloco de detalhes por tipo (treino: projeto, duração, métrica e valor a partir de `metadata`; MFA: as três ações da US-009) e botão primário com o rótulo definido pelo tipo (`notificationActionLabel(type)`: "Ver relatório do modelo", "Ver detalhes do treinamento", "Ativar agora") que navega para `href`; abrir o modal chama `markRead` e atualiza a lista e o badge na hora; fechar volta ao popover fechado (não reabre o popover)
- [ ] Estado vazio: ícone `BellOff` em círculo `bg-muted` e "Nenhuma notificação por enquanto. Avisamos aqui quando um treinamento terminar."
- [ ] Polling: `useEffect` com `setInterval` de 30 s chamando a server action `pollNotifications(sinceId)` (devolve `{ unread, items }` só com itens mais novos); pausa quando `document.hidden`; nunca `setState` síncrono no corpo do effect (regra do projeto)
- [ ] Notificação nova de `training.*` que chega pelo polling **fora** de `/projects/{id}/predict/jobs/{jobId}` dispara `toast(title, { description: body, action: { label: "Abrir", onClick: abre o modal } })`; dentro da página do job não dispara (a tela já mostra o resultado)
- [ ] `aria-live="polite"` numa região visualmente oculta anuncia "Você tem {n} notificações não lidas" quando o contador aumenta; popover e modal com foco gerenciado pelo Radix e fechamento por Esc
- [ ] Nenhuma rota nova: não existe página `/notificacoes`; o histórico é acessível só por "Carregar mais"
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill: `/projects` (sino não colide com "Novo projeto"), `/settings`, navbar do projeto, popover com lidas/não lidas, abrir modal e ver badge cair, "Carregar mais", 375 px

### Frente C: Notificação de treinamento

### US-006: Worker grava a notificação na mesma transação do status
**Description:** Como usuário, quero ser avisado quando o treino terminar (ou falhar), mesmo que eu tenha saído da tela.

**Acceptance Criteria:**
- [ ] Em `apps/worker/jobs/model_train.py`, novo helper `_notify_training_outcome(conn, *, org_id, training_job_id, project_id, project_name, outcome, metadata)` que insere em `notifications` **um registro por usuário** de `users where org_id = %s` (hoje 1), com `dedupe_key = 'training:<job_id>'`, `ON CONFLICT DO NOTHING`, chamado **antes do `conn.commit()`** tanto no caminho `succeeded` (junto de `_log_training_event(action="training.succeeded")`) quanto no `failed`
- [ ] Textos vêm de `apps/worker/jobs/notification_copy.py`, que lê `apps/web/src/lib/__fixtures__/notification-copy.json` em tempo de import (caminho relativo ao repo, com fallback embutido idêntico para a imagem Docker do worker, que copia o JSON no `Dockerfile`): sucesso "Modelo de {projeto} pronto" / "Treinamento concluído em {duração}. {métrica}: {valor}. Veja o relatório."; falha em **tom neutro**: "Treinamento de {projeto} não concluído" / "Não foi possível terminar o treinamento: {primeira frase da error_message, ≤ 140 chars, sem stack trace, mesma sanitização do training.failed}. Você pode tentar de novo."
- [ ] `href = /projects/{project_id}/predict` no sucesso e `/projects/{project_id}/predict/jobs/{job_id}` na falha; `metadata = { trainingJobId, modelId?, durationSeconds, metricName?, metricValue? }` — nunca dados do dataset
- [ ] Retreino: cada job gera a sua (dedupe por job); projeto excluído antes de o usuário ler: `href` leva a 404 amigável já existente, notificação continua listável (não há FK para `projects`, de propósito)
- [ ] Testes pytest no worker: sucesso e falha criam exatamente uma notificação por usuário da org; rodar o job duas vezes não duplica; texto bate com o fixture
- [ ] Nenhuma mudança no web além do fixture; typecheck/lint/test do web e `pytest` do worker passam

### US-007: Tela do job usa a notificação como fonte e o redirect fica opcional
**Description:** Como usuário, quero que o aviso de "Treinamento concluído" na própria tela e a notificação contem a mesma história, sem me tirar da tela sem querer.

**Acceptance Criteria:**
- [ ] Em `training-progress.tsx`, ao detectar `status === "succeeded"`, o redirect automático de 2 s para `/predict` vira um botão primário "Ver relatório do modelo" + link secundário "Voltar aos projetos"; a contagem automática é removida (evita o salto enquanto o usuário lê as métricas)
- [ ] A notificação correspondente é marcada como lida quando a página do job renderiza `succeeded`/`failed` (server: `resolveByDedupeKey(user.id, 'training:<jobId>')` em `jobs/[jobId]/page.tsx`)
- [ ] Sem toast duplicado: o `NotificationsBell` não emite toast para itens já lidos nem para a rota atual (regra da US-005)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill: iniciar treino, navegar para `/projects`, ver o sino contar e o toast aparecer; voltar ao job e ver a notificação lida

### Frente D: Sugestão de MFA por notificação

### US-008: Regra de elegibilidade e criação da sugestão
**Description:** Como usuário que entra com senha, quero ser convidado a ativar a verificação em duas etapas num momento que não atrapalhe meu começo.

**Acceptance Criteria:**
- [ ] Migration: `users.mfa_prompt_dismissed_at timestamptz` e `users.mfa_prompt_snoozed_until timestamptz`
- [ ] Módulo puro `src/lib/mfa-suggestion.ts`: `shouldSuggestMfa({ hasPasswordAccount, twoFactorEnabled, createdAt, now, dismissedAt, snoozedUntil, hasTrainedModel })` devolve `true` só se: conta com senha, 2FA desligado, não dispensado, não em snooze, e (`now - createdAt ≥ 24 h` **ou** `hasTrainedModel`); `MFA_SNOOZE_DAYS = 30`
- [ ] Gatilho 1 (login): no plugin de auditoria de login em `src/lib/auth.ts` (o after hook que grava `auth.login` com método `email`), após gravar o evento chama `maybeCreateMfaSuggestion(userId)` (server-only, em `src/lib/mfa-suggestion-server.ts`) que carrega os dados, aplica `shouldSuggestMfa` e chama `createNotification` com `dedupe_key = 'mfa-suggestion'`; login Google não passa por aqui
- [ ] Gatilho 2 (primeiro treino concluído): o worker **não** decide sobre MFA (regra fica no web); em vez disso, `pollNotifications` e a página `/projects` chamam `maybeCreateMfaSuggestion` no máximo uma vez por sessão de página (memo em `cookies`/`unstable_cache` por 1 h) — assim a sugestão aparece na próxima interação depois do treino
- [ ] Texto e `href` de `MFA_SUGGESTION_NOTIFICATION` (US-004): título "Proteja sua conta com verificação em duas etapas", corpo "Você entra com email e senha. Ative o código do app autenticador em Configurações → Segurança; leva 2 minutos.", `href = /settings?ativar-2fa=1`
- [ ] Ao ativar o 2FA (rota do plugin já auditada como `auth.2fa_enabled`), `resolveByDedupeKey(userId, 'mfa-suggestion')`; ao desativar, nada é criado imediatamente (só no próximo login elegível)
- [ ] Evento `security.mfa_suggested` em `audit_logs` na criação (métrica de funil em `docs/metricas-uso.md`: sugeridos → ativados em 30 dias)
- [ ] Testes Vitest de `shouldSuggestMfa` cobrindo cada condição (senha/Google, 24 h, modelo treinado, dismiss, snooze expirado e não expirado)
- [ ] Typecheck/lint passam; testes passam

### US-009: Ações da notificação de MFA e abertura direta do diálogo
**Description:** Como usuário, quero decidir "agora", "depois" ou "nunca" direto na notificação e, se escolher agora, cair no passo de ativação.

**Acceptance Criteria:**
- [ ] No modal de detalhe (US-005), itens `security.mfa_suggestion` renderizam três ações: **Ativar agora** (primário, navega para o `href`), **Lembrar depois** (grava `mfa_prompt_snoozed_until = now + 30 d`, marca lida, fecha o modal, toast "Vamos lembrar você em 30 dias"), **Não sugerir de novo** (grava `mfa_prompt_dismissed_at`, marca lida, fecha o modal, toast "Você pode ativar quando quiser em Configurações → Segurança") — server actions em `components/app/notifications-actions.ts` (`"use server"`); no popover o item mostra só o resumo, como os demais
- [ ] `/settings?ativar-2fa=1`: `settings/page.tsx` passa `autoOpenEnable` para `SecurityCard`, que abre o `TwoFactorEnableDialog` na montagem (estado derivado da prop; `replaceState` remove o param ao fechar, padrão do CLAUDE.md); se a conta não tem senha ou já tem 2FA, o param é ignorado e a página rola até o card "Segurança" (`id="seguranca"`)
- [ ] Depois do "Lembrar depois", passados 30 dias e ainda elegível, a próxima chamada de `maybeCreateMfaSuggestion` cria de novo (a unique por `dedupe_key` exige apagar a antiga lida antes de inserir — `createNotification` com `replaceIfRead: true` para esse tipo)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill: conta email/senha com `created_at` manipulado para −25 h → login → sino mostra 1 → "Ativar agora" abre o diálogo de QR; testar "Lembrar depois" e "Não sugerir de novo"

### Frente E: Primeiros passos após criar a conta

### US-010: Estado de onboarding no servidor e cálculo do progresso
**Description:** Como desenvolvedor, preciso saber o que o usuário já fez e o que ele dispensou, para o checklist nunca se repetir.

**Acceptance Criteria:**
- [ ] Migration: `users.onboarding_welcome_seen_at timestamptz`, `users.onboarding_dismissed_at timestamptz`, `users.onboarding_completed_at timestamptz`; backfill na própria migration: `onboarding_dismissed_at = now()` para usuários cuja org tem ≥ 1 linha em `models`
- [ ] Módulo puro `src/lib/onboarding.ts`: `ONBOARDING_STEPS` (4 passos com `key`, `title`, `description`, `ctaLabel`, `href(builder)`), `computeOnboarding({ projectsCount, projectsWithDataset, modelsCount, inferenceCount, publishedDeployments, welcomeSeenAt, dismissedAt, completedAt })` devolvendo `{ steps: [{ key, done }], doneCount, showWelcome, showChecklist, justCompleted }`; `showChecklist = !dismissedAt && !completedAt && doneCount < 4`; `justCompleted = doneCount === 4 && !completedAt`
- [ ] Server-only `src/lib/onboarding-server.ts`: `getOnboardingState(user)` com uma consulta agregada por `org_id` (counts em `projects`, `models`, `deployments` publicados, `inference_usage`), e actions `markWelcomeSeen()`, `dismissOnboarding()`, `markOnboardingCompleted()`
- [ ] Testes Vitest de `computeOnboarding`: usuário novo, cada passo concluído em sequência, dispensado, concluído, usuário antigo com backfill
- [ ] Typecheck/lint passam; testes passam

### US-011: Painel de boas-vindas (uma vez) e checklist "Primeiros passos"
**Description:** Como usuário novo, quero entender em 10 segundos por onde começar e acompanhar meu progresso sem ser interrompido de novo.

**Acceptance Criteria:**
- [ ] `(app)/projects/page.tsx` chama `getOnboardingState` e passa para `ProjectsView` (`onboarding` prop); nada muda para quem tem `showWelcome === false && showChecklist === false`
- [ ] **Painel de boas-vindas** (`components/app/welcome-panel.tsx`): `Dialog` do design system, aberto na montagem quando `showWelcome`; título "Bem-vindo(a) ao AutoML, {primeiro nome}"; frase "Transforme uma planilha em previsões em 4 passos:"; os 4 passos em linha (ícone `FolderPlus`, `FileUp`, `BarChart3`, `Plug`) com título e uma frase cada; botões "Criar meu primeiro projeto" (fecha e abre `CreateProjectDialog`) e "Explorar por conta própria" (fecha); fechar por qualquer caminho chama `markWelcomeSeen` (nunca reabre, em nenhum dispositivo)
- [ ] **Card "Primeiros passos"** (`components/app/onboarding-checklist.tsx`) acima das abas Desenvolvimento/Arquivados quando `showChecklist`: título, barra "{n} de 4" (`role="progressbar"`), 4 linhas com `CheckCircle2` preenchido (feito) ou `Circle` (pendente), título + descrição curta e, no primeiro pendente, o botão de CTA ("Criar projeto" abre o dialog; "Enviar dados" leva a `/projects/{ultimoProjetoSemDataset}`; "Treinar modelo" leva a `/projects/{projeto}/predict`; "Usar predições" leva a `/projects/{projeto}/predict` com dica "Faça uma predição ou publique um endpoint"); botão X "Ocultar" (`aria-label`) chama `dismissOnboarding` com toast "Ok, não mostramos mais. Se precisar, a documentação está em /docs."
- [ ] Ao carregar com `justCompleted`: o card mostra "Tudo pronto! Você já domina o fluxo." com animação de 3 confetes SVG via `motion` (≤ 600 ms, nenhuma sob `prefers-reduced-motion`), chama `markOnboardingCompleted` e, no próximo carregamento, não existe mais
- [ ] Copy em `src/lib/onboarding-copy.ts`; nenhum texto literal no JSX
- [ ] Layout: card `max-w-6xl` como a grade; em mobile os 4 passos empilham; sem deslocar a barra de busca/botão "Novo projeto"
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill: conta nova → dialog → criar projeto → voltar a `/projects` e ver 1 de 4 → ocultar → recarregar → nada; conta antiga com modelo → nada

### US-012: Primeiro projeto sem atrito
**Description:** Como usuário novo, quero que criar o primeiro projeto e enviar dados sejam um caminho contínuo, sem voltar a `/projects` no meio.

**Acceptance Criteria:**
- [ ] Após criar o projeto pelo painel de boas-vindas ou pelo checklist, o redirect atual para `/projects/{id}` (tela "Escolha uma fonte de dados") ganha um banner discreto no topo, só quando o usuário ainda tem `showChecklist`: "Passo 2 de 4 — Envie uma planilha para começar" com link "Baixar planilha de exemplo" (reusa `template-download-links.tsx`), removível com X (estado só desta visita, em memória)
- [ ] O `CreateProjectDialog` sugere nome padrão "Meu primeiro projeto" quando `projectsCount === 0` (placeholder, não valor)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### Frente F: Home pública

### US-013: Navegação com seção ativa e ações de conta em mobile
**Description:** Como visitante, quero saber em que parte da página estou e, no celular, entrar ou me cadastrar sem abrir o menu.

**Acceptance Criteria:**
- [ ] `site-header.tsx`: scroll spy com `IntersectionObserver` (rootMargin compensando `--marketing-header-height`) marca o `NavLink` da seção visível com `aria-current="location"` e `text-foreground` + sublinhado de 2 px `bg-primary` (transição 150 ms, `motion-reduce:transition-none`); ao clicar numa âncora o destaque muda imediatamente; sem `IntersectionObserver` (SSR/teste) nenhum item fica ativo
- [ ] Mobile (< `md`): o header mostra Logo, botão "Entrar" (ghost, `size="sm"`) e o botão de menu; o menu (Sheet) mantém as âncoras e passa a ter "Começar grátis" como botão primário de largura total no topo; o `Sheet` fecha ao escolher uma âncora (já fecha) e o foco volta ao botão do menu (já volta)
- [ ] Barra de CTA móvel: em telas < `md`, depois de rolar além do hero (`#inicio` fora da viewport), aparece uma barra inferior fixa com "Começar grátis" (`prefetch={false}`) e "Falar com nosso time" (abre o `ContactDialog`); some no `FinalCta` (`#comecar` visível) e nunca aparece em desktop; `pb-[env(safe-area-inset-bottom)]`; não cobre o footer (padding no `main` quando a barra está visível)
- [ ] Skip link "Ir para o conteúdo" como primeiro elemento focável do layout `(marketing)`, visível só em foco, apontando para `#inicio`
- [ ] Textos novos em `lib/marketing/copy.ts`; testes de copy existentes atualizados
- [ ] Lighthouse mobile ≥ 90 (Performance e Acessibilidade) e o orçamento de JS de primeiro carregamento da US-021 não cresce mais de 3 kB gzip (scroll spy e barra são código pequeno, sem lib)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill: 1280 px rolando as seções (destaque acompanha), 375 px (Entrar visível, barra inferior aparece/some)

### US-014: Seção "Perguntas frequentes"
**Description:** Como executivo avaliando a plataforma, quero respostas rápidas sobre beta, dados, segurança e custo antes de criar conta.

**Acceptance Criteria:**
- [ ] Novo `components/marketing/faq.tsx` (server, sem `motion` além do `Reveal` do título) inserido entre `Features` e `FinalCta`; `id = SECTION_IDS.perguntas` ("perguntas"); item "Perguntas" entra em `HEADER_NAV` antes de "Docs"
- [ ] 6 perguntas em `FAQ_ITEMS` (`copy.ts`), acordeão com `<details>/<summary>` nativo (sem JS), ícone `ChevronDown` que gira via CSS `[open]`, `summary` com `text-base font-medium` e foco visível: (1) "Preciso saber programar ou ter cientista de dados?" (2) "Que tipo de planilha funciona?" (3) "Meus dados ficam seguros? Quem acessa?" — menciona organização isolada, chaves de API rotacionáveis e verificação em duas etapas, com link para `/politica-de-privacidade` (4) "Quanto custa?" — beta gratuito, sem cartão, ambiente exclusivo para empresas via "Falar com nosso time" (5) "Como funciona o beta e a lista de espera?" (6) "Como uso as previsões no dia a dia?" — web app, API e agentes de IA (MCP), link para `/docs`
- [ ] `lib/marketing/seo.ts` ganha `homeFaqJsonLd()` (`FAQPage` com `mainEntity` a partir de `FAQ_ITEMS`) renderizado na page junto do `SoftwareApplication`, via `serializeJsonLd`
- [ ] Teste Vitest trava: 6 itens, nenhum texto vazio, JSON-LD com 6 `Question`, e `SECTION_IDS.perguntas` presente em `HEADER_NAV`
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill (abrir/fechar itens por teclado; âncora "Perguntas" do header)

### US-015: Footer completo e rodapé de confiança
**Description:** Como visitante, quero um rodapé que me ajude a navegar e mostre quem está por trás do produto.

**Acceptance Criteria:**
- [ ] `site-footer.tsx` em 3 colunas a partir de `md` (empilhadas abaixo): **Produto** (Casos de uso, Como funciona, Agente, Recursos, Perguntas — âncoras; Docs), **Conta** (Entrar, Começar grátis — com `marketingAuthHref` e `prefetch={false}`; "Falar com nosso time" abre o `ContactDialog`), **Legal** (Política de Uso, Política de Privacidade, Contato `mailto:` atual)
- [ ] Linha inferior: Logo + `footerCopyright(ano)` + frase "Um produto AutoML." (texto em `copy.ts`; sem logotipo de terceiros além do já autorizado)
- [ ] Nas páginas com header `compact` (`/docs`, políticas) o footer é o mesmo, mas os links de âncora apontam para `/#secao` (absolutos), não `#secao`
- [ ] Contraste AA em todos os links (`text-muted-foreground` sobre `bg-background`, já validado na US-021) e `aria-label` do `nav` por coluna
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill (1280 px e 375 px; `/docs` com âncoras absolutas funcionando)

### US-016: Ajustes de hierarquia nas seções
**Description:** Como visitante, quero uma leitura mais fluida da página, com menos repetição entre seções e um ritmo visual consistente.

**Acceptance Criteria:**
- [ ] Padronizar o espaçamento vertical das seções numa só escala (`py-16 sm:py-24`) via classe utilitária `marketing-section` em `globals.css`, e o par "rótulo pequeno em `text-primary` + H2 + subtítulo" num componente `SectionHeading` reutilizado por UseCases, HowItWorks, AgentShowcase, Features e FAQ (hoje cada seção monta o seu)
- [ ] **Remover a seção "Empresas que confiam"**: apagar `components/marketing/trusted-by.tsx`, as constantes `TRUSTED_BY_LABEL`, `TRUSTED_LOGO_HEIGHT` e `TRUSTED_LOGOS` de `copy.ts`, os SVGs em `public/marketing/logos/` e o `<TrustedBy />` da page; atualizar o comentário de ordem das seções na page e os testes de copy/JSON-LD que a citarem; `grep -ri "trusted" apps/web/src` não devolve nada
- [ ] Sem a faixa, o `Hero` passa a fechar com `pb-12 sm:pb-16` (hoje `pb-16 lg:pb-24`) para "Casos de uso" entrar sem vão em branco; verificar que o `scroll-margin-top` da primeira âncora continua correto
- [ ] `HowItWorks`: cada passo ganha um link discreto "Ver detalhes" para a seção correspondente quando existir (passo 2 → `#agente`, passo 4 → `#recursos`); passos sem seção não ganham link
- [ ] `FinalCta`: subtítulo ganha a linha do beta (`HERO_BETA_NOTICE`) para não prometer acesso imediato no fim da página (hoje só o hero avisa)
- [ ] Nenhuma mudança de copy fora das constantes; testes de copy atualizados; Lighthouse mobile ≥ 90 mantido
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill (rolagem completa em 1280 px e 375 px)

### Frente G: E-mail de treinamento

### US-017: E-mail de treino concluído ou não concluído
**Description:** Como usuário que fechou a plataforma enquanto o modelo treinava, quero receber um e-mail quando terminar, com link direto para o resultado.

**Acceptance Criteria:**
- [ ] Migration (junta com `0028_notifications`): coluna `notifications.emailed_at timestamptz`
- [ ] Rota interna `POST /api/internal/notifications/email` em `apps/web/src/app/api/internal/notifications/email/route.ts`: exige header `X-Internal-Token` igual a `INTERNAL_API_TOKEN` (comparação em tempo constante; sem env, responde 503 e loga uma vez), body `{ notificationId }`; carrega a notificação, e se `type` começa com `training.` e `emailed_at` é nulo, monta o e-mail com `buildTrainingOutcomeEmail` (novo em `email-templates.ts`, mesmo layout dos e-mails de senha: título, 1 parágrafo, botão com link absoluto via `appOrigin()`, rodapé), envia por `sendEmail` e grava `emailed_at` (`UPDATE … WHERE emailed_at IS NULL` para idempotência); demais tipos respondem 204 sem enviar; rota fora de `PUBLIC_PATHS` do proxy? **Não**: é server-to-server, então entra numa allowlist própria `INTERNAL_PATHS` no `proxy.ts` que só exige o header (nunca sessão)
- [ ] Worker: em `model_train.py`, **depois do `conn.commit()`** de sucesso e de falha, `_dispatch_notification_emails(notification_ids)` faz o POST para `WEB_INTERNAL_URL` + rota com o token, timeout 5 s, 1 retry; falha só loga (`logger.warning`) — a notificação in-app já está gravada e o e-mail pode ser reenviado manualmente pelo id
- [ ] Texto do e-mail: assunto igual ao título da notificação; corpo igual ao corpo + botão ("Ver relatório do modelo" / "Ver detalhes do treinamento"); tom neutro na falha (mesma regra da US-006); nunca inclui dados do dataset
- [ ] `docker-compose.yml`/`docker-compose.prod.yml` e `.env.example` ganham `INTERNAL_API_TOKEN` e `WEB_INTERNAL_URL` (documentados no `README.md` do worker); `SECURITY.md` registra a rota interna e o token
- [ ] Testes Vitest da rota: sem token 401, token errado 401, notificação de treino envia uma vez (segunda chamada 204 sem reenviar), tipo MFA não envia; teste pytest do worker com o POST mockado (chamado após commit, não antes)
- [ ] Typecheck/lint/test do web e `pytest` do worker passam

## Requisitos funcionais

- FR-1: A tela MCP deve exibir a ação primária (Publicar / Salvar alterações) num cabeçalho fixo visível sem rolagem em qualquer viewport ≥ 375 px de largura.
- FR-2: Em rascunho, a tela MCP deve mostrar somente nome, descrição, campos e a faixa informativa dos agentes suportados; nenhum controle desabilitado.
- FR-3: Publicada, a tela MCP deve mostrar chave, seleção de agente e instruções, e manter a configuração acessível numa seção recolhida; a URL do endpoint aparece apenas nas instruções.
- FR-4: O sistema deve armazenar notificações por usuário em `notifications`, com desduplicação por `(user_id, dedupe_key)`.
- FR-5: O worker deve criar a notificação de treino concluído/falho na mesma transação que grava o status do job.
- FR-6: O app deve exibir um sino no canto superior direito de toda tela logada, com contador de não lidas, atualizado a cada 30 s e pausado com a aba oculta.
- FR-7: O sino deve abrir uma lista resumida com lidas e não lidas diferenciadas; clicar num item abre um modal com a notificação completa e a ação principal, e marca o item como lido.
- FR-7a: Notificações de treino recebidas fora da página do job devem gerar um toast que abre o modal.
- FR-7b: Treino concluído ou falho deve também ser enviado por e-mail ao usuário, com o mesmo texto e link da notificação, no máximo uma vez por job.
- FR-8: A sugestão de MFA só pode ser criada para contas com senha, sem 2FA, não dispensadas, fora de snooze, e após 24 h de conta ou primeiro modelo treinado.
- FR-9: A sugestão de MFA deve oferecer Ativar agora, Lembrar depois (30 dias) e Não sugerir de novo; ativar o 2FA resolve a sugestão.
- FR-10: O painel de boas-vindas deve aparecer uma única vez por usuário, em qualquer dispositivo, e o checklist deve sumir ao concluir os 4 passos ou ao ser dispensado.
- FR-11: Os passos do checklist devem ser calculados a partir do estado real (projetos, datasets, modelos, predições/deployments), nunca marcados manualmente.
- FR-12: A home pública deve indicar a seção ativa na navegação, oferecer "Entrar" no header mobile e uma barra de CTA móvel após o hero.
- FR-13: A home deve ter seção de FAQ com dados estruturados `FAQPage` e footer em 3 colunas.
- FR-14: Todas as strings novas ficam em módulos de copy (pt-BR) e são travadas por testes onde já há esse padrão.

## Non-Goals (fora de escopo)

- Redesenho da tela **API** (`deploy/api`) e do **Web App**; só o cabeçalho fixo nasce reutilizável.
- E-mail para outros tipos além de treino (a sugestão de MFA é só in-app); push ou Slack; SSE/WebSocket para tempo real; preferências de e-mail por usuário (entra quando houver mais de um tipo por e-mail).
- Página dedicada de notificações: o histórico vive no popover com "Carregar mais".
- Preferências de notificação por tipo (ligar/desligar) e notificações para outros eventos (dataset processado, quota atingida, chave rotacionada).
- Tornar o MFA obrigatório, ou sugerir MFA para contas Google.
- Tour com coachmarks passo a passo dentro das telas do projeto; vídeo ou onboarding por e-mail.
- Reordenar as demais seções da home ou trocar o palco do hero; novas páginas públicas (preços, blog, sobre). A única remoção é "Empresas que confiam".
- Organizações com vários membros (a consulta de recipientes fica pronta, a UI não).

## Considerações de design

- Reutilizar `Badge`, `Button`, `Card`, `Dialog`, `DropdownMenu`, `Tabs`, `Tooltip`, `Sheet`, `Skeleton`; adicionar `Popover` e `Accordion` via shadcn só se necessário (preferir `<details>` onde não há interação complexa).
- Sino: ícone `Bell` 16 px; badge 18 px, `bg-primary text-white text-[10px]` (o tom neutro vale também aqui; vermelho só se algum dia houver tipo crítico), posicionada `-top-1 -right-1`; contraste do número validado. Popover de 380 px; modal `max-w-md` com a mesma hierarquia dos diálogos de 2FA (ícone em círculo, título, texto de apoio, ações no rodapé).
- Checklist: mesma linguagem dos cards de projeto (borda `border-border`, `rounded-xl`, `shadow-sm`); ícones dos passos os mesmos usados nas telas de destino (`FileUp` da fonte de dados, `BarChart3` da Predição, `Plug` do Publicar) para criar reconhecimento.
- MCP: o resumo da configuração recolhida usa o padrão de resumo em uma linha do `SecurityCard` ("Ativado desde…"); as instruções por agente mantêm `pre` com `whitespace-pre-wrap break-all` e botão "Copiar".
- Home: manter os princípios de animação da PRD anterior (reveal ≤ 600 ms, nada em loop além do palco, `prefers-reduced-motion` desliga tudo); scroll spy e barra móvel sem biblioteca.

## Considerações técnicas

- Next 16 / React 19 / React Compiler: nenhum `setState` síncrono em `useEffect`; estado derivado de URL (`?ativar-2fa=1`) segue o padrão `pushState/replaceState` do CLAUDE.md.
- Worker (psycopg 3) insere em `notifications` com SQL cru, como já faz em `audit_logs`; o fixture JSON de copy é a única fonte compartilhada entre TS e Python e precisa ser copiado no `Dockerfile` do worker (ou embutido com teste de igualdade).
- `training_jobs` não tem `user_id`; recipientes = `users.org_id = training_jobs.org_id`. Orgs são pessoais hoje.
- Polling: server action leve (uma consulta com `id > sinceId` + `count`), sem ORM pesado; pausa em `visibilitychange`.
- Migrations desta PRD: `0028_notifications`, `0029_users-mfa-prompt`, `0030_users-onboarding` (com backfill). Rodar `drizzle-kit generate` e revisar o SQL gerado; o backfill do onboarding é SQL manual na mesma migration.
- Auditoria: novos eventos `security.mfa_suggested`, `onboarding.dismissed`, `onboarding.completed`, `notification.read_all` (só este último por lote, sem detalhar itens) em `audit_logs`, seguindo `logAudit`.
- Testes: regras puras (`notifications.ts`, `mfa-suggestion.ts`, `onboarding.ts`, copy de marketing) em Vitest; worker em pytest; verificação visual pelo dev-browser skill como nas PRDs anteriores.

## Métricas de sucesso

- MCP: tempo do primeiro acesso à tela até "Publicado" cai para < 60 s em teste com usuário (hoje > 2 min por procurar o botão); zero relatos de "não achei o Publicar" via `problem_reports` em 30 dias.
- Notificações: ≥ 80 % das notificações `training.*` lidas em 24 h; consulta em `docs/metricas-uso.md`.
- MFA: taxa de ativação de 2FA entre contas com senha sobe de ~0 para ≥ 15 % em 60 dias (`auth.2fa_enabled` / contas `credential` elegíveis); ≤ 20 % escolhem "Não sugerir de novo".
- Onboarding: ≥ 60 % dos novos usuários criam projeto na primeira sessão (hoje sem medição; evento `project.create` já existe) e ≥ 40 % chegam a "modelo treinado" em 7 dias; taxa de "Ocultar" antes do passo 2 < 30 %.
- Home: Lighthouse mobile ≥ 90 mantido; cliques em "Entrar" no header mobile e na barra de CTA medidos por `ref` (`ref=home-mobile-bar`); CTR do FAQ para `/docs` e "Falar com nosso time".

## Ondas de entrega

| Onda | Stories | Resultado |
|---|---|---|
| 1 — MCP | US-001, US-002, US-003 | Tela MCP simplificada, Publicar sempre visível, integrações visíveis nos dois estados |
| 2 — Notificações | US-004, US-005, US-006, US-007, US-017 | Sino + modal funcionando, treino concluído/falho in-app e por e-mail |
| 3 — MFA | US-008, US-009 | Sugestão de 2FA por notificação, com snooze e dismiss |
| 4 — Primeiros passos | US-010, US-011, US-012 | Boas-vindas única + checklist auto-completável |
| 5 — Home | US-013, US-014, US-015, US-016 | Navegação, mobile, FAQ, footer e ritmo visual da home pública |

## Perguntas em aberto

Resolvidas em 2026-09-04 (registradas em "Decisões de produto"): e-mail de treino **sim** (US-017); falha em tom **neutro**; gatilho de MFA em **24 h**; chips **4 + "e outros"**; sino no **canto superior direito** com lista resumida e **modal** no clique, sem página dedicada.

1. Quais usuários já existentes devem receber e-mail de treino? Proposta: todos, a partir do deploy; sem opt-out até haver preferências (non-goal).
2. O worker chama o web por HTTP (US-017). Se o web estiver fora do ar no fim do treino, o e-mail se perde (fica só o in-app). Aceitável no beta, ou vale um reenvio na próxima vez que o web sobe (`emailed_at IS NULL` com mais de 5 min)? Proposta: aceitar no beta e medir.
