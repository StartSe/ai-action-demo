# Segurança

Este documento descreve o modelo de segurança da plataforma AutoML educacional
e o que ainda falta para a trilha SOC 2. Público-alvo: operadores da plataforma
(deploy no Coolify) e revisores de segurança.

## Modelo de acesso

- **Autenticação e conta única**: Better Auth só com email/senha (hash
  bcrypt, 12 rounds); não há OAuth. A única conta nasce na tela `/setup`
  (primeiro acesso): enquanto a tabela `users` está vazia, qualquer rota
  redireciona para lá e a Server Action `completeSetup` cria a conta, grava
  `auth.setup_completed` na auditoria e entra logado. Depois disso `/setup`
  redireciona para `/login` e o cadastro público
  (`POST /api/auth/sign-up/email`) responde 403 — hook `before` mais uma
  guarda em `databaseHooks` em `apps/web/src/lib/auth.ts`, ambos lendo
  `hasAccount()` de `lib/setup-state.ts`; a decisão nunca fica no proxy edge.
  Não existe recuperação de senha nem segunda conta: a senha só muda em
  Configurações → Segurança, confirmando a senha atual. Sessão em cookie
  `httpOnly`, `sameSite=lax` e `secure` quando `BETTER_AUTH_URL` é `https`.
  Todas as rotas exigem sessão, exceto `/login`, `/setup` e `/api/auth/*`
  (enforcement em `apps/web/src/proxy.ts`).
- **Isolamento por organização (multi-tenant)**: cada usuário pertence a uma
  organization pessoal criada no cadastro. Todo recurso de domínio (projeto,
  dataset, training job, modelo) tem `org_id`. O acesso a recursos passa pelo
  helper central `apps/web/src/lib/org-scope.ts`, que **injeta o `org_id` da
  sessão em toda query** — nunca um org vindo da request. Recurso de outra org
  (ou inexistente) resulta em 404 e a tentativa é gravada na auditoria como
  `authz.denied`.
- **Validação de input**: rotas de API validam entrada com Zod; uploads são
  validados por extensão, tamanho (`MAX_UPLOAD_MB`) e magic bytes
  (`apps/web/src/lib/upload-validation.ts`); ids são validados como UUID antes
  de chegar ao banco.
- **Rate limiting**: janela fixa no Redis (`apps/web/src/lib/rate-limit.ts`) —
  30 req/min por IP nas rotas de auth e 15 uploads/min por usuário. Respostas
  429 com `Retry-After`. A troca de senha (`/change-password`) tem regra
  própria no rate limiter do Better Auth (`rateLimit.customRules` em
  `apps/web/src/lib/auth.ts`): 5 tentativas por hora por IP, porque a rota
  confere a senha atual a cada chamada. Na UI (Configurações → Segurança →
  "Alterar senha") o usuário informa a senha atual e pode encerrar as sessões
  dos outros dispositivos na mesma operação (opção ligada por padrão).
- **Security headers**: CSP, HSTS (2 anos, includeSubDomains),
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` e
  `Referrer-Policy` configurados globalmente em `apps/web/next.config.ts`.

## Trilha de auditoria

A tabela `audit_logs` grava `user_id`, `org_id`, ação, tipo/id do recurso, IP,
user-agent e timestamp (`created_at`) para:

- autenticação: `auth.signup`, `auth.login` (metadata `method` —
  `email`|`google` no login sem MFA; `totp`|`backup_code` quando a sessão
  nasce da verificação do segundo fator —, gravado só quando a sessão existe
  de fato), `auth.login_failed`, `auth.logout`, `auth.email_verified`,
  `auth.email_rate_limited` (metadata `route`, `limitScope` — `ip`|`email` —,
  `email`), `auth.password_changed` (troca de senha em Configurações com a
  senha atual confirmada; metadata `revokeOtherSessions` — o usuário recebe
  em seguida o email "Sua senha do AutoML foi alterada", com data/hora,
  link para redefinir a senha caso não tenha sido ele e orientação para
  ativar a 2FA) e
  `auth.password_change_failed` (senha atual incorreta em `/change-password`;
  metadata `reason: invalid_current_password`, nunca as senhas — a rota é
  limitada a 5 tentativas por hora por IP pelo rate limiter do Better Auth);
- segundo fator (TOTP, plugin twoFactor do Better Auth): `auth.2fa_challenge`
  quando a senha está certa mas a MFA está pendente (o login ainda não
  aconteceu; metadata `method: email`), `auth.2fa_enabled` quando o usuário
  confirma o primeiro código do app autenticador ao ativar a MFA (sessão já
  existia antes da verificação; metadata `method: totp`), `auth.2fa_failed` em
  toda verificação recusada em `/two-factor/verify-*` (metadata `method` —
  `totp`|`backup_code`|`otp` —, `status` e `code` do erro do Better Auth, como
  `INVALID_CODE` ou `ACCOUNT_TEMPORARILY_LOCKED`; nunca o código digitado) e
  `auth.2fa_rate_limited` quando o usuário do desafio passa de 5 tentativas
  por minuto (metadata `method`, `limitScope` — `user`|`ip` —, `count`,
  `limit`, `windowSec`; a resposta é 429). `user_id` vem da sessão ou do
  cookie assinado `two_factor` do desafio. Gestão da MFA já ativa, sempre com
  senha confirmada: `auth.2fa_backup_regenerated` quando o usuário gera novos
  códigos de recuperação em Configurações (os anteriores deixam de valer;
  metadata `count` — quantidade gerada, nunca os códigos) e `auth.2fa_disabled`
  quando desativa o segundo fator (a UI exige senha + código atual do app;
  metadata `method: totp`). Senha errada nesses dois fluxos não gera evento
  próprio (o plugin responde 400 sem alterar nada). Segundo passo do login
  concluído na tela `/2fa`: além do `auth.login` (`method` `totp`|`backup_code`),
  `auth.2fa_verified` com metadata `method` — `totp`|`backup` — e
  `trustedDevice` (true quando o usuário marcou "Confiar neste dispositivo por
  30 dias" e o cookie `trust_device` foi gravado);
- projetos: `project.create` (metadata `projectName`, `hasProblemDescription`), `project.delete`, `project.dataset_link`, `project.update_description` (edição da descrição do problema de negócio; metadata `projectName`, `hasDescription`, `descriptionLength`, `briefCleared` — nunca o texto), `project.brief.generate` (guia do problema gerado pela IA e salvo em `problem_brief`; metadata `projectId`, `projectName`, `problemType`, `featureCount`, `regenerate` — nunca a descrição nem o conteúdo do guia), `project.brief.download` (download da planilha modelo montada a partir do guia; metadata `format`, `projectId`, `projectName`);
- datasets: `dataset.upload`, `dataset.delete`, `dataset.download`, `dataset.template_download` (download da planilha modelo; metadata `format`, `source`), `dataset.layout_reviewed` (confirmação da tela "Revisar planilha"; metadata `needsReview`, `sheets` — quantidade —, `combined`, `headerRow`, `transposed`; nunca o conteúdo do arquivo);
- treinamento: `training.start`, `training.retry`;
- leads comerciais: `lead.enterprise_request` (pedido de consultoria / ambiente exclusivo gravado em `enterprise_leads`; metadata `interest`, `teamSize`, `source` — nunca empresa, cargo nem mensagem, que ficam só na tabela; máximo de 3 pedidos por usuário a cada 24 h);
- deployments publicados: `api.predict` e `mcp.predict` (sem `user_id` nem os
  dados enviados; metadata `rows` e `keyLocation` — `header`|`body` na API,
  `header`|`query` no MCP — para medir a migração da chave para o header
  `Authorization: Bearer`); ciclo de vida da chave: `deployment.publish`,
  `deployment.rotate_key` (nova chave; a anterior continua válida por 24 h;
  metadata `apiKeyPrefix`, `previousApiKeyPrefix`, `previousKeyExpiresAt` —
  nunca a chave nem o hash), `deployment.revoke_key` (atual e anterior
  deixam de valer na hora; metadata `apiKeyPrefix`, `hadPreviousKey`) e
  `deployment.unpublish`;
- falha de autenticação na API pública e no MCP: `api.auth_failed` em toda
  resposta 401 de `/api/v1/predict` e `/api/mcp` (sem `user_id`; metadata
  `channel` — `api`|`mcp` —, `keyPrefix` com o prefixo identificador da chave
  tentada (`dos_live_` + 4 chars nas chaves novas, 8 chars nas `ak_` antigas)
  ou null, `ip`; a chave inteira nunca é gravada) e
  `api.auth_bruteforce_suspected` quando um IP passa de 10 falhas por minuto
  (`API_AUTH_FAIL_MODE` report ou enforce; metadata `channel`, `keyPrefix`,
  `ip`, `count`, `limit`, `windowSec`, `mode`; em enforce a resposta vira 429
  com `Retry-After`);
- acesso negado a recurso de outra org: `authz.denied`;
- requisição cross-origin a rota interna: `authz.cross_origin`
  (`INTERNAL_ORIGIN_MODE` report ou enforce; metadata `path`, `origin`,
  `via` — `sec-fetch-site`|`origin` —, `mode`, `method`; IP e user-agent
  preenchidos; em enforce a resposta é 403).

A escrita de auditoria nunca derruba o fluxo principal (`logAudit` não lança).

## 2FA por app autenticador

Verificação em duas etapas por TOTP (plugin `twoFactor` do Better Auth),
opcional e só para contas com senha. Conta que entra pelo Google não passa
pelo segundo fator do AutoML — o hook do plugin só intercepta
`/sign-in/email` (o retorno do OAuth em `/callback/*` nunca devolve
`twoFactorRedirect`) e Configurações nem mostra o card Segurança para essa
conta — a proteção é gerenciada na própria conta Google.

Fluxo:

1. **Ativação** (Configurações → Segurança): senha → QR code (`otpauth://`,
   emissor "AutoML", 6 dígitos a cada 30 s) → confirmação do primeiro
   código → 10 códigos de recuperação de uso único (`xxxxx-xxxxx`, cifrados com
   `AUTH_SECRET` em `two_factors.backup_codes`). A MFA só vale depois do
   primeiro código confirmado (`skipVerificationOnEnable: false`).
2. **Login**: email + senha corretos com MFA ativa não criam sessão — o
   servidor grava o cookie assinado `two_factor` (10 min) e responde
   `{ twoFactorRedirect: true }`; a tela `/2fa` (rota pública, redireciona para
   `/login` sem o cookie e para `/` com sessão) pede o código de 6 dígitos com
   envio automático, ou um código de recuperação pelo link "Usar código de
   recuperação". Código inválido responde "Código inválido. Verifique o horário
   do seu celular e tente novamente."; o desafio aceita 5 falhas (depois é
   apagado e o login recomeça), a conta bloqueia 15 min após 10 falhas e o
   rate limit de 5 tentativas por minuto por usuário (US-034) responde 429 com
   o tempo de espera. Sucesso segue a jornada normal (gates de política e
   lista de espera intactos).
3. **Dispositivo confiável**: o checkbox "Confiar neste dispositivo por 30
   dias" grava o cookie assinado `trust_device` (HMAC de `userId!identificador`
   - registro em `verifications` com expiração de 30 dias). O sign-in seguinte
     nesse navegador valida e rotaciona o cookie e pula o desafio; o cookie some
     ao desativar a MFA, ao expirar ou ao limpar os cookies. A escolha fica na
     trilha (`auth.2fa_verified.trustedDevice`).
4. **Recuperação**: cada código de recuperação vale uma vez e é removido da
   lista ao ser usado; Configurações avisa quando restam 2 ou menos e permite
   gerar 10 novos (os antigos deixam de valer). Quem perdeu o celular entra
   com um código de recuperação e refaz a ativação em Configurações (desativar
   e ativar de novo com o aparelho novo).

Procedimento manual de suporte (usuário sem celular E sem códigos de
recuperação): confirmar a identidade por canal independente (email cadastrado

- dado que só o titular conhece), registrar o pedido e desligar a MFA direto
  no banco — a próxima entrada exige só a senha e o usuário reativa em
  Configurações:

```sql
BEGIN;
UPDATE users SET two_factor_enabled = false WHERE id = '<user_id>';
DELETE FROM two_factors WHERE user_id = '<user_id>';
-- opcional: revogar dispositivos confiáveis e desafios pendentes do usuário
DELETE FROM verifications WHERE value = '<user_id>'
  AND (identifier LIKE 'trust-device-%' OR identifier LIKE '2fa-%');
COMMIT;
```

Não há evento automático para esse procedimento: registrar manualmente em
`audit_logs` (`action = 'auth.2fa_disabled'`, `metadata = {"method":"support"}`)
para a trilha continuar completa. Nunca enviar códigos, segredos TOTP ou
códigos de recuperação por email/chat.

## Chaves de API dos deployments

A API pública (`/api/v1/predict`) e o servidor MCP (`/api/mcp`) autenticam pela
chave do deployment. Formato: `dos_live_` + 32 bytes aleatórios em base64url
(chaves antigas `ak_…` continuam válidas). O banco guarda só o SHA-256
(`deployments.api_key_hash`) e um prefixo identificador (`api_key_prefix`); a
chave em claro aparece uma única vez, na resposta do publish/rotate.

- **Rotação com graça**: rotacionar gera uma chave nova e move a atual para
  `previous_api_key_hash` com `previous_key_expires_at` = agora + 24 h. As duas
  autenticam nesse período, para a integração trocar sem indisponibilidade;
  depois só a nova vale. Só uma chave anterior é mantida — rotacionar de novo
  encerra a mais antiga na hora.
- **Revogação imediata**: zera a chave atual E a anterior; o deployment
  continua publicado, mas nenhuma chamada autentica até uma nova rotação
  (caminho recomendado para chave vazada). Despublicar também apaga as duas.
- **Último uso**: `last_used_at`/`last_used_ip` são atualizados após uma
  predição bem-sucedida, com no máximo 1 UPDATE por minuto por deployment
  (reserva `SET NX EX 60` no Redis, chave `deployment:last-used:<id>`).
- **Operação pela UI**: a tela do deploy (API e MCP) tem "Rotacionar chave"
  (com o aviso de que a anterior vale por 24 h e a linha "Chave anterior
  expira em HH:MM"), "Revogar agora" (com confirmação) e "Último uso: há X
  min, de <ip>" / "Nunca usada".
- **Canais descontinuados**: `api_key` no body (`/api/v1/predict`) e `?token=`
  na URL (`/api/mcp`) continuam aceitos, mas toda resposta a uma chamada que
  os use sai com `Deprecation: true` e `Link: </docs>; rel="deprecation"`
  (RFC 9745), sem mudar status nem corpo. A página pública `/docs` explica a
  migração para `Authorization: Bearer`.
- **Chave fora dos logs**: nenhuma rota de API/MCP loga `request.url` cru —
  `requestLogContext` (`src/lib/audit.ts`) passa a URL por `scrubUrl`
  (`src/lib/scrub-url.ts`), que remove `token` da query. A trilha de
  auditoria nunca grava URL, só IP/user-agent (`requestMeta`).
- **Limites de payload**: `/api/v1/predict` aceita no máximo
  `API_PREDICT_MAX_ROWS` linhas por chamada (default 500, derivado do maior
  lote observado — metadata `rows` de `api.predict` em `audit_logs`) e 1 MB de
  body;
  acima disso responde 413 "Envie até N linhas por chamada ou use o lote pelo
  web app" antes de autenticar ou consultar o banco. O teto de bytes é checado
  pelo `Content-Length` e, depois, pelo tamanho real em UTF-8.
- **Higiene de resposta**: toda resposta de `/api/v1/predict` e `/api/mcp`
  (200, 4xx, 5xx, 405) sai com `Cache-Control: no-store` e
  `X-Content-Type-Options: nosniff` (`withPublicApiHeaders`). As mensagens de
  erro são fixas em português: nunca incluem valores das linhas enviadas
  (a validação troca a mensagem padrão do Zod por texto fixo e não usa o
  input) nem stack trace (falha inesperada vira 500 genérico; o detalhe fica
  só no log do servidor). As mensagens do worker de predição
  (`PredictionError`) também são fixas.
- **Bloco "Boas práticas de segurança"** nas telas dos deploys API e MCP:
  guardar a chave em variável de ambiente, nunca no front-end, rotacionar se
  exposta, revogar em caso de vazamento.

## CORS e origem

- **Rotas internas negam cross-origin por política.** As rotas que o próprio
  app consome com a sessão do usuário — `/api/explore/chat`,
  `/api/datasets/upload`, `/api/datasets/[datasetId]/rows`,
  `/api/datasets/[datasetId]/download`, `/api/problem-reports`,
  `/api/templates/planilha-modelo` e `/app/[slug]/batch` — chamam
  `internalApiPolicy` (`apps/web/src/lib/internal-api.ts`) antes de qualquer
  outra coisa e exportam um `OPTIONS` que responde 204 sem nenhum header
  `Access-Control-*`. Assim o preflight de outro site falha no navegador e,
  em `enforce`, requisições com `Sec-Fetch-Site: cross-site` ou `Origin`
  diferente da origem de `BETTER_AUTH_URL` recebem 403. Nenhuma rota emite
  `Access-Control-Allow-Origin`; o teste
  `apps/web/src/lib/__tests__/internal-routes-cors.test.ts` varre todos os
  `route.ts` e falha se uma rota interna deixar de exportar `OPTIONS`, deixar
  de aplicar a política ou responder qualquer `Access-Control-*`.
- **API pública e MCP sem CORS por design.** `/api/v1/*` e `/api/mcp` são
  para uso server-to-server (integrações, clientes MCP) autenticado por
  `Authorization: Bearer`: não recebem a política `INTERNAL_ORIGIN_MODE` nem
  headers CORS, então um site no navegador não consegue chamá-los com a chave
  embutida. `/api/auth/*` é do Better Auth e também fica fora.
- **MCP recusa `Origin` estranho sempre (403, sem modo report).** Clientes
  MCP de desktop/servidor não enviam `Origin`; um navegador envia sempre. Em
  `/api/mcp`, header `Origin` presente e diferente da origem de
  `BETTER_AUTH_URL` (ou `Origin: null`, ou `BETTER_AUTH_URL` ausente) responde
  403 antes de rate limit, autenticação e banco — sem contar como falha de
  autenticação. `tools/list` expõe só as tools do deployment resolvido pela
  chave (`predict` e `model_info`, ambas presas ao mesmo modelo); não existe
  tool administrativa nem visão de outros deployments.
- **Falhas de autenticação da API/MCP são contadas por IP.** Toda resposta
  401 de `/api/v1/predict` e `/api/mcp` grava `api.auth_failed` e conta no
  limite `API_AUTH_FAIL_RATE_LIMIT` (10 falhas por minuto por IP, só em 401 —
  requisições autenticadas não entram). Chave inexistente e deployment
  despublicado respondem o **mesmo** 401, então um cliente não descobre se
  uma chave já existiu. Com `API_AUTH_FAIL_MODE=report` (default) estourar o
  limite só grava `api.auth_bruteforce_suspected`; com `enforce` o IP recebe
  429 com `Retry-After` no lugar do 401. Antes de ligar `enforce`, acompanhe
  em `audit_logs` os IPs com mais `api.auth_failed` nas últimas 24 h por
  alguns dias e confira se os IPs listados são integrações mal
  configuradas (poucas falhas, um prefixo de chave real) ou adivinhação
  (muitos prefixos distintos). Sem IP identificável (sem proxy na frente)
  não há contagem — só a auditoria.
- **Como ligar `enforce`.** O default é `report`: a requisição passa, mas
  grava `authz.cross_origin` na trilha de auditoria. Antes de bloquear,
  acompanhe em `audit_logs` os eventos `authz.cross_origin` por
  `metadata.path` e `metadata.origin` dos últimos 7 dias; se só aparecerem
  origens desconhecidas (ou nenhuma), defina `INTERNAL_ORIGIN_MODE=enforce` no
  `.env` e reinicie o web. `BETTER_AUTH_URL` precisa ser exatamente a origem pública do app
  (scheme + host + porta), senão o próprio front pode ser bloqueado. Para
  reverter, volte para `report`. O roteiro completo, para todas as flags, está
  em [Modo observação → enforce](#modo-observação--enforce).

## Modo observação → enforce

Toda proteção nova nasce em modo de observação: a requisição passa e um evento
vai para `audit_logs`. Ligar o bloqueio é operação de ambiente — mudar o valor
da variável no `.env` e reiniciar o `web` — sem deploy de código nem
migration; reverter é o mesmo caminho ao contrário. A tabela completa das
variáveis (default e efeito de cada valor) está no
[README.md](README.md#variáveis-de-ambiente); toda a evidência citada abaixo
sai da tabela `audit_logs` do SQLite (`sqlite3 /data/pocket.db "SELECT ..."`
no volume `data`, filtrando por `action` e lendo `metadata` com
`json_extract`).

### Antes de qualquer `enforce`

1. **Período de observação**: pelo menos 7 dias em `report` com uso real (uma
   turma completa, se a plataforma é usada em aulas). Sem eventos porque não
   houve uso não é evidência.
2. **`BETTER_AUTH_URL` exato** (scheme + host + porta) — é a referência de
   "mesma origem" de `INTERNAL_ORIGIN_MODE` e do 403 do MCP. Errado, o próprio
   front vira cross-origin.
3. **IP real chega ao app**: `requestMeta` lê `X-Forwarded-For` (primeiro IP)
   ou `X-Real-IP`. Confira em `audit_logs` (`api.auth_failed`, coluna `ip`)
   que os IPs são variados; se todos os
   eventos têm o mesmo IP (o do proxy), `API_AUTH_FAIL_MODE=enforce`
   bloquearia todo mundo junto — corrija o proxy antes.
4. **Uma flag por vez**, anotando data e valor anterior. Observe 24–48 h antes
   da próxima: os mesmos eventos continuam sendo gravados em `enforce`, agora
   com `metadata.mode = 'enforce'`, então as consultas mostram quem foi
   bloqueado de fato.

### Checklist por flag

| Flag                                          | O que rodar                                                                                                       | Ligar `enforce` quando                                                                                                                                                                                                                                  | Reverter se                                                                                                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INTERNAL_ORIGIN_MODE` (`report` → `enforce`) | `authz.cross_origin` dos últimos 7 dias, agrupado por `metadata.path` e `metadata.origin`.                        | A lista está vazia ou só tem origens que não são suas (sites de terceiros, scanners). Se a **própria** origem do app aparece, `BETTER_AUTH_URL` está errado — corrija antes de ligar. Se um domínio antigo seu aparece, ajuste `BETTER_AUTH_URL` antes. | Você recebe 403 em upload ou download, ou os eventos mostram `metadata.mode = 'enforce'` com a origem do app: volte para `report`.                                                           |
| `API_AUTH_FAIL_MODE` (`report` → `enforce`)   | `api.auth_failed` das últimas 24 h agrupado por `metadata.ip`, contando os `metadata.keyPrefix` distintos por IP. | Os IPs com `api.auth_bruteforce_suspected` têm muitos prefixos distintos (adivinhação) e nenhum IP de integração conhecida passa de 10 falhas/min. Integração com chave antiga (1 prefixo, poucas falhas) deve ser avisada e corrigida, não bloqueada.  | Uma integração legítima recebe 429 (`api.auth_bruteforce_suspected` com `mode = 'enforce'` e um `keyPrefix` de chave real): volte para `report` — a janela de 1 min expira sozinha no Redis. |
| `API_PREDICT_MAX_ROWS` (baixar o valor)       | Máximo e p95 de `metadata.rows` em `api.predict` nos últimos 30 dias, por deployment (`resource_id`).             | O novo teto fica acima do maior lote observado (ou você avisou quem envia os lotes maiores). Subir o valor não precisa de consulta.                                                                                                                     | Integração recebe 413: suba o teto de volta (o efeito é imediato após o restart).                                                                                                            |

### Flags de capacidade (não têm modo `report`)

- **`TRAINING_CONCURRENCY`**: vale para os **dois** serviços (o compose
  repassa o mesmo `.env`). Depois, compare o ETA mostrado na fila com a
  duração real dos treinos (`training.start` → `training.succeeded` em
  `audit_logs`): a estimativa usa o valor lido pelo web; se ela passa a errar
  para cima logo após a mudança, web e worker estão lendo valores diferentes.
- **`LAYOUT_REVIEW_ENABLED`**: ligar em produção só depois de passar as
  planilhas do runbook de aula pela tela "Revisar planilha" em dev. Com a flag
  ligada, datasets podem parar em `needs_review` esperando um clique; para
  reverter, desligue a flag nos dois serviços e reprocesse os datasets pausados
  (a tela de revisão continua funcionando para os já pausados).

### Como reverter

Toda flag volta ao comportamento anterior trocando o valor (`report`, `off` ou
o default) e reiniciando o serviço. Nada fica persistido: os contadores
(falhas de autenticação por IP) vivem no Redis com expiração própria, e os
eventos de
auditoria já gravados apenas documentam o período em `enforce`. A única flag
com efeito em dados é `LAYOUT_REVIEW_ENABLED` (datasets em `needs_review`),
tratada acima.

## Gestão de secrets

- O único segredo é `AUTH_SECRET` (e `REDIS_URL`, se o Redis tiver senha):
  vive **apenas** no `.env` do host, fora do repositório, ou nas Environment
  Variables do orquestrador (Coolify etc.) marcadas como secret. O
  `.env.example` documenta as 17 variáveis sem valores sensíveis.
- `AUTH_SECRET` deve ter ≥ 32 bytes aleatórios (`openssl rand -base64 32`).
- Rotação: trocar o valor e reiniciar o `web`. Sessões ativas são invalidadas
  ao rotacionar `AUTH_SECRET`.

## Backup do SQLite e dos uploads

Todo o estado do Pocket fica no volume `data` (`/data`): o banco SQLite em
`SQLITE_PATH` e as planilhas, Parquet e artefatos de modelo em `UPLOAD_DIR`.

- **Backup diário** agendado no host (cron ou scheduled task do orquestrador),
  de uma de duas formas: parar `web` e `worker` e copiar a pasta `/data`
  inteira; ou, sem parar nada, `sqlite3 /caminho/pocket.db ".backup
backup-$(date +%F).db"` para o banco mais rsync/snapshot de `uploads/`.
  Nunca copie `pocket.db` "quente" sem o `.backup`: o `-wal` ao lado pode
  conter transações ainda não aplicadas ao arquivo principal.
- **Retenção**: 7 diários + 4 semanais, armazenados fora do host de produção
  (ex.: object storage com acesso restrito).
- **Restore testado**: parar os serviços, repor `pocket.db` (sem `-wal`/`-shm`
  antigos) e a pasta `uploads`, subir de novo; o `web` reaplica migrations
  pendentes no boot.

## TLS

- TLS é terminado no proxy reverso do Coolify (Traefik) com certificados
  Let's Encrypt renovados automaticamente; os containers conversam apenas na
  rede interna do compose.
- HSTS já é emitido pela aplicação; manter o domínio sempre atrás do proxy
  (não expor a porta 3000 diretamente).

## Roadmap SOC 2 (pendente)

Itens ainda **não** implementados, necessários para a trilha SOC 2:

- **SSO corporativo** (SAML/OIDC além do Google OAuth). A MFA por app
  autenticador já existe (seção "2FA por app autenticador"), mas é opcional:
  falta a política de MFA obrigatória por organização.
- **Retenção e arquivamento de logs**: política formal de retenção de
  `audit_logs` e logs de aplicação, com export para armazenamento imutável.
- **Disaster Recovery**: RTO/RPO definidos, restore automatizado e testado
  periodicamente, cópia do volume `data` fora do host.
- **Pentest** externo periódico e programa de correção de achados.
- **Vendor review**: avaliação formal de fornecedores (Coolify, provedores de
  nuvem, Google OAuth) e DPAs correspondentes.

## Reporte de vulnerabilidades

Encontrou uma vulnerabilidade? Abra um issue privado ou contate o operador da
plataforma. Não explore dados de outras organizações em produção.
