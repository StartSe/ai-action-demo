# PRD: Convites de Beta Fechado, Lista de Espera e Aceite de Política

## Introdução

A plataforma entra em beta fechado e o acesso passa a ser controlado por códigos de convite distribuídos via URL (ex.: `https://app.exemplo.com/signup?invite=IA_PARA_NEGOCIOS`). Cada código tem um limite de utilizações (ex.: 200). Quem se cadastra sem convite consegue criar a conta normalmente, mas cai em uma lista de espera: vê uma mensagem explicando que o beta é fechado e que precisa de um convite para acessar. O uso de convites é auditável — cada resgate registra quem usou, quando e de onde.

Junto com o gate de acesso, todo usuário passa a registrar o aceite da política de uso da plataforma, com IP, localização aproximada, user agent, timestamp e versão da política aceita — seguindo boas práticas de mercado para evidência de consentimento.

Não há UI de administração: códigos são criados e ajustados diretamente no banco de dados.

## Goals

- Restringir o acesso à plataforma a usuários com convite válido, sem impedir a criação de conta.
- Suportar múltiplos códigos de convite, cada um com limite próprio de utilizações (o primeiro: `IA_PARA_NEGOCIOS`, 200 usos).
- Garantir 1 convite por usuário; uma vez aprovado, o acesso é permanente e direto.
- Tornar cada resgate de convite auditável: usuário, código, IP, user agent e timestamp.
- Registrar o aceite da política de uso de todos os usuários (novos e existentes), com IP, local aproximado, user agent, timestamp e versão da política.
- Não quebrar o acesso de usuários já existentes no banco: são aprovados automaticamente na migração.

## User Stories

### US-001: Schema de convites, resgates e status de acesso
**Description:** Como desenvolvedor, preciso das tabelas de convites e resgates e do status de acesso no usuário, para que o gate de acesso e a auditoria tenham onde persistir dados.

**Acceptance Criteria:**
- [ ] Tabela `invite_codes`: `id` (uuid), `code` (text, unique, armazenado em UPPERCASE), `max_uses` (integer), `active` (boolean, default true), timestamps
- [ ] Tabela `invite_redemptions`: `id`, `invite_code_id` (FK para `invite_codes`), `user_id` (FK para `users`, **unique** — garante 1 convite por usuário no nível do banco), `ip`, `user_agent`, timestamps
- [ ] Coluna `users.approved_at` (timestamp nullable): `NULL` = lista de espera; preenchido = acesso liberado
- [ ] Migração gerada com `drizzle-kit generate` e aplicada com sucesso
- [ ] Migração de dados: todos os usuários existentes recebem `approved_at = now()` (aprovação retroativa, sem convite associado)
- [ ] Seed (via SQL na própria migração ou script documentado): códigos `IA_PARA_NEGOCIOS` com `max_uses = 200` e `PRODUCT_TEAM` com `max_uses = 50`
- [ ] Typecheck passa

### US-002: Resgate de convite no cadastro por email/senha
**Description:** Como visitante com link de convite, quero me cadastrar por `?invite=CODIGO` e já entrar aprovado, sem passos extras.

**Acceptance Criteria:**
- [ ] A página `/signup` lê `?invite=` da URL e envia o código junto com o cadastro (campo oculto ou estado do form)
- [ ] No backend, após criar o usuário, o código é validado e resgatado dentro de uma transação: código existe, está ativo e a contagem de resgates é menor que `max_uses` (com lock/update atômico para não exceder o limite sob concorrência)
- [ ] Resgate válido: cria linha em `invite_redemptions` (com IP e user agent da requisição) e preenche `users.approved_at`
- [ ] Código inválido, inativo ou esgotado: a conta é criada normalmente, mas fica na lista de espera (sem erro bloqueante; a tela de espera informa que o código não pôde ser aplicado)
- [ ] Comparação de código é case-insensitive (`ia_para_negocios` funciona)
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

### US-003: Convite sobrevive ao fluxo de login com Google
**Description:** Como visitante com link de convite, quero que o código funcione também quando me cadastro com Google, mesmo com os redirects do OAuth.

**Acceptance Criteria:**
- [ ] Ao iniciar o fluxo Google a partir de uma página com `?invite=`, o código é preservado em cookie (httpOnly, expiração curta, ex.: 1 hora)
- [ ] Ao concluir o OAuth com criação de usuário novo, o código do cookie é resgatado com as mesmas regras da US-002 e o cookie é limpo
- [ ] Usuário Google sem convite cai na lista de espera igual ao fluxo de email/senha
- [ ] Login Google de usuário já existente e aprovado não é afetado
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

### US-004: Gate de acesso e tela de lista de espera
**Description:** Como usuário sem convite, quero conseguir criar minha conta e entender que estou em uma lista de espera, para saber que preciso de um convite para acessar.

**Acceptance Criteria:**
- [ ] Usuário autenticado com `approved_at IS NULL` é redirecionado para uma página de lista de espera ao tentar acessar qualquer rota do app (páginas e APIs de produto retornam 403 para não aprovados)
- [ ] A página explica que a plataforma está em beta fechado, que a conta está na lista de espera e que um convite libera o acesso
- [ ] Rotas de auth (login, logout, signup) e a própria página de espera permanecem acessíveis
- [ ] Usuário aprovado nunca vê a página de espera
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

### US-005: Aplicar convite depois do cadastro (URL ou campo manual)
**Description:** Como usuário na lista de espera, quero informar um código de convite — colando na tela de espera ou acessando um link com `?invite=` — para liberar meu acesso na hora.

**Acceptance Criteria:**
- [ ] A página de espera tem um campo de texto para digitar o código, com botão de aplicar
- [ ] Acessar qualquer URL do app com `?invite=CODIGO` estando logado e não aprovado aplica o código automaticamente
- [ ] Endpoint autenticado de resgate reutiliza a mesma lógica transacional da US-002 (validação, limite, auditoria)
- [ ] Sucesso: usuário é redirecionado para o app imediatamente, sem novo login
- [ ] Falha (inválido/esgotado/inativo): mensagem clara na tela de espera, sem revelar detalhes do código (ex.: "Código inválido ou esgotado")
- [ ] Usuário já aprovado que informa outro código não gera novo resgate (constraint de 1 convite por usuário)
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

### US-006: Auditoria de resgates no audit log
**Description:** Como operador da plataforma, quero consultar no banco quem usou cada convite e quando, para acompanhar a distribuição dos códigos.

**Acceptance Criteria:**
- [ ] Todo resgate bem-sucedido grava também em `audit_logs`: `action = "invite.redeemed"`, `resource_type = "invite_code"`, `resource_id` do código, `user_id`, IP, user agent e `metadata` com o código em texto
- [ ] Tentativa de resgate com código inválido/esgotado grava `action = "invite.redeem_failed"` com o código tentado em `metadata`
- [ ] Uma query SQL documentada (comentário no schema ou em `tasks/`) lista, por código: usos, restantes e quem resgatou
- [ ] Typecheck passa

### US-007: Página e schema da política de uso
**Description:** Como usuário, quero ler a política de uso da plataforma em uma página pública, para saber o que estou aceitando.

**Acceptance Criteria:**
- [ ] Tabela `policy_acceptances`: `id`, `user_id` (FK), `policy_version` (text, ex.: `"2026-08-24"`), `ip`, `user_agent`, `location` (text nullable, ex.: `"São Paulo, BR"`), `accepted_at` — com unique em (`user_id`, `policy_version`)
- [ ] Versão vigente da política definida em constante única no código (ex.: `CURRENT_POLICY_VERSION`)
- [ ] Página pública `/politica-de-uso` com o texto da política (conteúdo placeholder simples em beta: uso da plataforma, tratamento de dados enviados, limitação de responsabilidade, contato) e a versão/data visível
- [ ] Migração gerada e aplicada; typecheck passa
- [ ] Verify in browser using dev-browser skill

### US-008: Aceite da política no cadastro
**Description:** Como novo usuário, preciso aceitar a política de uso ao criar a conta, para que meu consentimento fique registrado com evidências.

**Acceptance Criteria:**
- [ ] Checkbox obrigatório no signup (email/senha): "Li e aceito a [Política de Uso]" com link abrindo a página em nova aba; o submit fica bloqueado sem o aceite
- [ ] No backend, o cadastro grava `policy_acceptances` com versão vigente, IP real do cliente (respeitando `x-forwarded-for` atrás de proxy), user agent, timestamp e localização aproximada derivada do IP (best-effort; `NULL` se indisponível, nunca bloqueia o cadastro)
- [ ] Fluxo Google: o aceite é coletado na primeira entrada do usuário novo (mesma tela de aceite da US-009), já que não há form de signup
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

### US-009: Aceite da política para usuários existentes
**Description:** Como usuário já cadastrado, preciso aceitar a versão vigente da política no meu próximo acesso, para que a base inteira tenha consentimento registrado.

**Acceptance Criteria:**
- [ ] Usuário autenticado sem `policy_acceptances` na versão vigente é interceptado e vê uma tela de aceite (resumo + link para a política completa + botão "Aceitar e continuar")
- [ ] O aceite grava a linha em `policy_acceptances` com os mesmos campos da US-008 e libera a navegação imediatamente
- [ ] O gate de política funciona junto com o gate de convite (US-004) sem loop de redirect — ordem: política primeiro, depois waitlist
- [ ] Publicar uma nova versão (mudar a constante) exige novo aceite de todos no próximo acesso, preservando os aceites anteriores como histórico
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: O sistema deve suportar múltiplos códigos de convite, cada um com `max_uses` próprio e flag `active`; gestão (criar, desativar, alterar limite) é feita diretamente no banco de dados, sem UI.
- FR-2: O cadastro deve aceitar o código via query param `?invite=` tanto no fluxo email/senha quanto no fluxo Google (preservado via cookie durante o OAuth).
- FR-3: Um resgate só é válido se o código existir, estiver ativo e o número de resgates for menor que `max_uses`; a verificação e o insert devem ocorrer na mesma transação para nunca exceder o limite sob concorrência.
- FR-4: Cada usuário pode resgatar no máximo 1 convite (unique constraint em `invite_redemptions.user_id`); o resgate é permanente — não há revogação de acesso no escopo desta feature.
- FR-5: Usuário sem convite cria a conta normalmente e fica com `approved_at IS NULL`; toda rota de produto (páginas e APIs) deve bloquear usuários não aprovados, redirecionando para a tela de lista de espera.
- FR-6: A tela de lista de espera deve comunicar o beta fechado e oferecer campo manual para código; acessar o app logado com `?invite=` na URL também aplica o código.
- FR-7: Todo resgate (sucesso e falha) deve ser auditável via `invite_redemptions` e `audit_logs`, com usuário, código, IP, user agent e timestamp.
- FR-8: O signup por email/senha deve exigir checkbox de aceite da política; o aceite deve ser registrado em `policy_acceptances` com versão da política, IP, user agent, localização aproximada (best-effort) e timestamp.
- FR-9: Usuários sem aceite da versão vigente da política (incluindo existentes e novos via Google) devem ver a tela de aceite antes de acessar o produto; o histórico de aceites de versões anteriores é preservado.
- FR-10: A migração inicial deve aprovar retroativamente todos os usuários existentes e criar os códigos `IA_PARA_NEGOCIOS` (limite de 200 usos) e `PRODUCT_TEAM` (limite de 50 usos).
- FR-11: Códigos são case-insensitive na entrada e armazenados em maiúsculas; mensagens de erro ao usuário não distinguem "código inexistente" de "código esgotado".

## Non-Goals (Out of Scope)

- UI de administração de convites (criação, listagem, dashboards) — gestão é 100% via banco.
- E-mails automáticos (confirmação de waitlist, aviso de aprovação, convite por e-mail).
- Aprovação manual em massa da lista de espera via produto (se necessário, direto no banco: `UPDATE users SET approved_at = now()`).
- Revogação de acesso ou expiração de convites por data.
- Convites pessoais/nominais de uso único por e-mail.
- Editor/CMS para o texto da política; múltiplos idiomas; políticas distintas por segmento.
- Consentimentos granulares de marketing/cookies (LGPD consent management completo) — apenas o aceite da política de uso.

## Technical Considerations

- **Auth:** better-auth (email/senha + Google). O resgate no cadastro deve se integrar aos hooks/callbacks do better-auth (ex.: after-signup) em vez de duplicar o fluxo de criação de usuário.
- **Gate de acesso:** implementar a checagem de `approved_at` e do aceite de política em um ponto central (middleware do Next.js ou helper de sessão usado pelas rotas), evitando espalhar a verificação por página.
- **Concorrência no limite de usos:** usar `SELECT ... FOR UPDATE` no código ou insert condicional com contagem na mesma transação; 200 usos com divulgação simultânea torna a corrida realista.
- **IP real:** a aplicação roda atrás de proxy (docker-compose de produção) — extrair IP de `x-forwarded-for` com fallback, reutilizando o padrão já usado em `audit_logs`/`sessions`.
- **Geolocalização:** best-effort e nunca bloqueante. Preferir headers do proxy/CDN se existirem; senão, lookup local (ex.: `geoip-lite`) ou serviço externo com timeout curto. Falhou → `location = NULL`.
- **Tabelas existentes:** reutilizar `audit_logs` (já tem `ip`, `user_agent`, `metadata`) para os eventos de convite; seguir o padrão de `timestamps` e uuid do `schema.ts`.
- **Cookie do convite no OAuth:** httpOnly, `SameSite=Lax`, TTL curto; limpar após uso ou expiração.

## Success Metrics

- 100% dos usuários aprovados possuem exatamente 1 linha em `invite_redemptions` ou aprovação retroativa da migração — verificável por query.
- Nenhum código ultrapassa `max_uses`, mesmo com cadastros simultâneos.
- Uma única query responde "quem usou o código X e quando".
- 100% dos usuários ativos têm aceite registrado da versão vigente da política, com IP e timestamp.
- Usuário com link de convite válido vai do clique ao app funcional sem nenhuma tela intermediária além do signup.

## Open Questions

- Texto final da política de uso: quem redige/revisa (jurídico?) antes do beta? A US-007 entra com placeholder estruturado.
- A tela de lista de espera deve capturar algo além do cadastro (ex.: "conte seu caso de uso") para priorizar aprovações manuais?
- Vale expor a contagem de usos restantes de um código em algum lugar (mesmo que só num endpoint interno), ou a query SQL documentada basta?
