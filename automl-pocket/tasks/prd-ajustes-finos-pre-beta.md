# PRD: Ajustes Finos Pré-Beta

## Introdução

Conjunto de pequenos ajustes de produto e operação antes da abertura do beta em `automl.example.com`. Cobre: (a) recuperação de senha funcional com envio de email real via Resend (hoje o `sendResetPassword` em `src/lib/auth.ts` é um TODO que só loga o token em dev — o fluxo não existe para o usuário), (b) visão de uso (storage e inferências) nas configurações, (c) exclusão segura com confirmação digitada, (d) melhorias no campo de senha do cadastro, (e) links de termos/privacidade no cadastro, e (f) ajustes menores de UI e de infraestrutura.

**Pré-requisito de execução:** este PRD assume que o run `ralph/convites-beta-waitlist` foi concluído (em especial a US-008 de lá, que adiciona o checkbox da Política de Uso no cadastro, e a página `/politica-de-uso`).

## Goals

- Usuário consegue redefinir a senha sozinho, por email, sem intervenção manual.
- Usuário vê nas configurações quanto do limite de armazenamento e de inferências já consumiu.
- Exclusões destrutivas (dataset e projeto) exigem digitar DELETAR, eliminando cliques acidentais.
- Cadastro com confirmação de senha, indicador de força e mostrar/ocultar senha.
- Links de Política de Uso e Política de Privacidade visíveis na tela de cadastro.
- Badge "Beta" da sidebar sem encostar na linha divisória do menu.
- Banco de produção acessível temporariamente do computador local (porta exposta no compose prod, com aviso de remoção).
- Card Organização nas configurações com label "Org" em vez de "Nome".

## User Stories

### US-001: Módulo de envio de email com Resend
**Description:** Como desenvolvedor, preciso de um módulo de envio de email plugado no Resend, para que fluxos transacionais (começando pela redefinição de senha) enviem emails reais em produção.

**Acceptance Criteria:**
- [ ] Dependência `resend` adicionada em `apps/web`
- [ ] Módulo `src/lib/email.ts` com função `sendEmail({to, subject, html, text})` de dependências injetáveis (cliente Resend injetável, seguindo o padrão dos módulos testáveis do projeto)
- [ ] Envs `RESEND_API_KEY` e `EMAIL_FROM` (ex.: `AutoML <nao-responda@automl.example.com>`) lidas pelo módulo e documentadas nos dois docker-compose e no README
- [ ] Sem `RESEND_API_KEY` definida (dev), o módulo loga o conteúdo no console em vez de enviar — nunca lança erro por falta de configuração
- [ ] Falha de envio é logada e retornada como `{ok: false}` sem lançar exceção (caller decide o que fazer)
- [ ] Testes unitários do módulo passam (vitest, cliente fake)
- [ ] Typecheck/lint passam

### US-002: Fluxo completo de esqueci a senha
**Description:** Como usuário que esqueceu a senha, quero pedir um link de redefinição por email e criar uma senha nova, para voltar a acessar sem depender de suporte.

**Acceptance Criteria:**
- [ ] Link "Esqueceu a senha?" na página de login, levando a `/forgot-password`
- [ ] Página `/forgot-password` com campo de email; submit chama `requestPasswordReset` do better-auth client; resposta é sempre a mesma mensagem neutra ("Se o email existir, enviaremos um link") — não revela se a conta existe
- [ ] `sendResetPassword` em `src/lib/auth.ts` passa a enviar email real via `sendEmail` da US-001, com template simples em português (saudação, botão/link de redefinição, aviso de expiração)
- [ ] Página `/reset-password` lê o token da URL, tem campos de nova senha + confirmar senha e chama `resetPassword` do better-auth; sucesso redireciona para o login com mensagem de confirmação
- [ ] Token inválido/expirado mostra mensagem clara com link para pedir novo email
- [ ] Rotas `/forgot-password` e `/reset-password` acessíveis sem login (PUBLIC_PATHS do proxy)
- [ ] Rate limit no pedido de reset (usar `enforceRateLimit`, ex.: 3/hora por email, registrado em `rate-limit-policy.ts`)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-003: Visão de uso nas configurações
**Description:** Como usuário, quero ver nas configurações quanto já usei dos meus limites de armazenamento e de inferências, para entender minha situação antes de bater no teto.

**Acceptance Criteria:**
- [ ] Novo card "Uso" na página `/settings` com duas linhas: armazenamento (reutilizando `getUserStorageUsage` e `STORAGE_QUOTA_MB`) e inferências do mês (reutilizando o contador de `inference_usage` e `MONTHLY_INFERENCE_LIMIT`)
- [ ] Cada linha mostra texto "X de Y" (ex.: "134 MB de 200 MB", "1.240 de 5.000 predições este mês") + barra de progresso
- [ ] Barra muda para tom de alerta a partir de 80% do limite (mesmo padrão já usado nos indicadores de datasets e Predição)
- [ ] Linha de inferências indica quando o contador reseta (dia 1º do próximo mês)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-004: Exclusão segura com confirmação digitada
**Description:** Como usuário, quero que excluir um dataset ou projeto exija digitar DELETAR, para nunca apagar dados por clique acidental.

**Acceptance Criteria:**
- [ ] Diálogos de exclusão de dataset e de projeto ganham campo de texto com instrução "Digite DELETAR para confirmar"
- [ ] Botão de confirmar fica desabilitado até o texto digitado ser exatamente DELETAR (case-sensitive); Enter no campo com texto correto confirma
- [ ] O diálogo continua listando o que será perdido (comportamento atual preservado — nome do recurso visível no diálogo)
- [ ] Campo limpa ao fechar/reabrir o diálogo
- [ ] Todos os pontos de exclusão desses recursos usam o mesmo componente/comportamento (datasets na tela de datasets, dataset dentro do projeto, projeto na lista de projetos)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-005: Ajuste fino do badge Beta na sidebar
**Description:** Como usuário, quero o badge "Beta" da sidebar visualmente confortável, sem encostar na linha que separa o header dos itens do menu.

**Acceptance Criteria:**
- [ ] Badge "Beta" em `src/components/app/app-sidebar.tsx` com respiro visível para a borda inferior do header (border-b) — sem tocar ou sobrepor a linha
- [ ] Logo, badge e botões (reportar problema, recolher) seguem alinhados como hoje; altura do header pode ser ajustada se necessário
- [ ] Modo recolhido da sidebar segue sem badge e sem regressão visual
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-006: Confirmar senha, força e mostrar/ocultar no cadastro
**Description:** Como novo usuário, quero confirmar a senha, ver a força dela e poder visualizá-la, para não errar a senha na criação da conta.

**Acceptance Criteria:**
- [ ] Campo "Confirmar senha" no cadastro; submit bloqueado com mensagem clara quando os campos divergem
- [ ] Indicador de força da senha abaixo do campo (fraca/média/forte) calculado no client por comprimento + variedade de caracteres — critério simples, sem biblioteca pesada; mínimo de 8 caracteres continua valendo (config do better-auth)
- [ ] Botão de olho (mostrar/ocultar) nos campos de senha do cadastro, do login e das páginas de reset da US-002, com `aria-label` adequado
- [ ] Componente de campo de senha reutilizável (um único componente compartilhado entre cadastro, login e reset)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-007: Política de Privacidade e links no cadastro
**Description:** Como novo usuário, quero acessar os termos de uso e a política de privacidade a partir da tela de cadastro, para saber como meus dados são tratados antes de criar a conta.

**Acceptance Criteria:**
- [ ] Página pública `/politica-de-privacidade` (mesmo padrão da `/politica-de-uso`: placeholder estruturado em português — dados coletados, finalidade, compartilhamento, direitos do titular, contato — com versão/data visível; adicionada aos PUBLIC_PATHS)
- [ ] Texto do aceite no cadastro passa a linkar os dois documentos: "Li e aceito a [Política de Uso] e a [Política de Privacidade]", ambos abrindo em nova aba
- [ ] Rodapé das telas de auth (login/cadastro) com links discretos para os dois documentos
- [ ] O registro de aceite existente (`policy_acceptances`) segue inalterado — um único aceite cobre os dois documentos nesta fase
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-008: Expor porta do Postgres no compose de produção (temporário)
**Description:** Como operador, quero acessar o banco de produção do meu computador local durante o beta, para inspecionar convites, reports e usage sem entrar na VM.

**Acceptance Criteria:**
- [ ] `docker-compose.prod.yml`: serviço postgres com `ports: "5433:5432"`
- [ ] Comentário no compose marcando como TEMPORÁRIO para o beta, com instrução de remoção
- [ ] README/instruções de deploy documentam: a porta fica exposta na VM e o acesso deve ser restrito no firewall/NSG da Azure ao IP do operador (não deixar 0.0.0.0 aberto para o mundo)
- [ ] Compose de dev inalterado (já expõe via `POSTGRES_HOST_PORT`)
- [ ] `docker compose -f docker-compose.prod.yml config` valida sem erro

### US-009: Renomear label "Nome" para "Org" no card Organização
**Description:** Como usuário, quero ver o label "Org" no card Organização das configurações, para o rótulo não repetir o "Nome" do card de conta.

**Acceptance Criteria:**
- [ ] Em `/settings`, o `InfoRow` do card "Organização" usa label "Org" (o do card de conta segue "Nome")
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: O sistema deve enviar emails transacionais via Resend (`RESEND_API_KEY`, `EMAIL_FROM`), com fallback de log no console quando a chave não estiver configurada.
- FR-2: O fluxo de redefinição de senha deve existir de ponta a ponta: link no login → `/forgot-password` → email com link → `/reset-password` → senha nova → login.
- FR-3: O pedido de reset nunca deve revelar se um email está cadastrado e deve ter rate limit próprio.
- FR-4: A página `/settings` deve exibir uso de armazenamento e de inferências do mês, com barra de progresso e alerta a partir de 80%.
- FR-5: Excluir dataset ou projeto deve exigir digitar DELETAR num campo de confirmação; o botão fica desabilitado até o texto exato.
- FR-6: O badge "Beta" da sidebar não deve encostar na linha divisória do header.
- FR-7: O cadastro deve ter confirmação de senha, indicador de força e mostrar/ocultar; login e reset também ganham mostrar/ocultar.
- FR-8: Deve existir página pública `/politica-de-privacidade`, linkada no aceite do cadastro junto com a Política de Uso e no rodapé das telas de auth.
- FR-9: O compose de produção deve expor o Postgres em `5433:5432` com comentário de temporário e orientação de firewall.
- FR-10: O card Organização em `/settings` deve usar o label "Org".

## Non-Goals (Out of Scope)

- Verificação de email no cadastro (confirmar conta por email) — só redefinição de senha nesta fase.
- Outros emails transacionais (boas-vindas, avisos de waitlist/aprovação) — o módulo fica pronto, mas só o reset usa.
- Editor/CMS para os textos das políticas; revisão jurídica do conteúdo (placeholder).
- Alterar a mecânica de registro de aceite (`policy_acceptances`) ou exigir re-aceite pela nova página de privacidade.
- Medidor de força de senha com biblioteca dedicada (zxcvbn) ou políticas corporativas de senha.
- Túnel SSH ou VPN como alternativa ao acesso direto ao banco (fica como recomendação pós-beta).
- Quota/usage por organização (o corte segue por usuário).

## Design Considerations

- Reutilizar componentes existentes: Card/InfoRow dos settings, AlertDialog/Dialog, Badge, barra de progresso já usada nos indicadores de uso.
- Indicador de força: três segmentos coloridos (vermelho/âmbar/verde) + texto curto; sem bloquear submit por força baixa (só o mínimo de 8 caracteres bloqueia).
- Template de email: HTML simples de coluna única, logo textual "AutoML", botão com fallback de URL em texto — sem framework de email.

## Technical Considerations

- Better Auth já tem os endpoints de reset (`requestPasswordReset`/`resetPassword`); o trabalho é o client/UI e trocar o TODO do `sendResetPassword` pelo envio real.
- O domínio de envio precisa ser verificado no painel do Resend (registros SPF/DKIM no DNS de `example.com` ou subdomínio) antes do beta; até lá o fallback de console cobre dev.
- `getUserStorageUsage` e o contador de `inference_usage` já existem (run preparação beta) — a US-003 é só leitura/apresentação.
- A exclusão segura é mudança apenas de UI — as server actions de delete existentes permanecem como estão.
- Porta exposta em prod: a proteção real é o NSG da Azure (regra por IP de origem); documentar explicitamente, pois o Docker publica em 0.0.0.0 por padrão.

## Success Metrics

- Usuário redefine a senha de ponta a ponta sem suporte (email chega em < 1 min).
- Zero exclusões acidentais reportadas durante o beta.
- Usuário encontra seu consumo de storage/inferências em ≤ 2 cliques (sidebar → Configurações).
- Operador conecta ao Postgres de produção do computador local via `psql`/GUI apontando para `automl.example.com:5433`.

## Open Questions

- Endereço remetente definitivo: `nao-responda@automl.example.com` ou outro subdomínio já verificado da AutoML?
- O texto placeholder da Política de Privacidade passa por revisão jurídica antes ou durante o beta?
- Após o beta, a porta do Postgres volta a fechar — quem fica responsável por remover a linha do compose e a regra do NSG?
