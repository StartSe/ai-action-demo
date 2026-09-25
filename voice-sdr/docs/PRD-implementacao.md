# PRD de implementação: Sarah Voice SDR

**Projeto:** `toolkit-sarah-voice-sdr`
**Versão:** 2.0
**Status:** para aprovação técnica
**Documentos irmãos:** `PRD.md` (produto, 135 RF e 16 RNF), `padrao-de-interface.md`, `briefing-design.md`, `revisao-tecnica.md`

Este documento diz **como construir**. O que construir está no `PRD.md`, e cada
item aqui cita o requisito que atende.

A versão 2.0 incorpora a revisão técnica registrada em `revisao-tecnica.md`:
2 bloqueadores e 43 achados graves. As correções estão marcadas com o número do
achado. Os 35 achados menores estão na seção 14, como lista de pendências com
dono e fatia.

---

## 1. Decisões de stack

| Camada | Escolha | Razão |
|---|---|---|
| Interface | React 19, Vite, TypeScript, TanStack Router, TanStack Query, Tailwind v4 | Ecossistema já usado na casa. Carga de dados na rota, que é o que as telas densas pedem |
| Backend | Projeto Supabase próprio: Postgres 15 com `btree_gist`, `pg_trgm`, `pgcrypto`, `pg_cron` e `pg_net`; RLS, Storage, Edge Functions em Deno | Um provedor cobre identidade, dado, arquivo, função e agendador |
| Voz conversacional | ElevenLabs Conversational AI | Reconhecimento, raciocínio, síntese e controle de turno num agente publicado |
| Telefonia | Twilio | Número, tronco, estado de chamada, encerramento forçado |
| Modelo dentro da chamada | A definir na F2 (P-02) | Move latência de turno, custo por minuto e confiabilidade da chamada de ferramenta. Decisão medida, não assumida |
| Modelo fora da chamada | `claude-sonnet-5` na classificação e no sentimento; `claude-opus-5` no resto | Classificação, resumo de passagem, sentimento, justificativa de avaliação, rascunho de roteiro. A classificação trocou de modelo pela medição de P-03 (ver abaixo) |
| Calendário | Google Calendar | Ocupação real e criação de evento |
| E-mail transacional | Resend | Convite de reunião, apuração de comparecimento, convite de equipe, aviso de crédito |
| Implantação da interface | Coolify | Padrão de implantação da casa |
| Repositório | Monorepo: `app/`, `supabase/`, `docs/` | Front e funções compartilham os tipos gerados do banco |

### Decisões tomadas por padrão

| Ponto | Assumido | Custo de mudar depois |
|---|---|---|
| Multiempresa desde o início | Sim. Toda tabela de negócio nasce com `account_id` e política de isolamento | Alto |
| Hospedagem da interface | Coolify, com Supabase gerenciado | Baixo |
| Integração com CRM | Fora da primeira versão. O webhook de saída (RF-914) cobre até lá | Baixo |
| Região do projeto de dados | Medir São Paulo contra Virgínia na F0 antes de fixar (P-12) | Alto depois de haver dado |

### Sobre o modelo de classificação

A revisão propôs trocar `claude-opus-5` por um modelo mais rápido no caminho de
classificação, para caber na meta de 60 segundos da F2. A medição de P-03
decidiu: o opus sobre transcrição de 10 minutos leva de 15 a 40 s só nesta
etapa. `call-classify` usa `claude-sonnet-5`, e a razão está escrita no
cabeçalho de `supabase/functions/call-classify/classificacao.ts`. A ficha
continua entrando em "processando" assim que o webhook chega, sem esperar a
classificação. O opus fica com o rascunho de roteiro (US-063).

---

## 2. Arquitetura

```
  navegador
     │  sessão Supabase, consultas sob RLS
     ▼
  interface React ──────────► Edge Functions (Deno)
                                   │
   ┌───────────────────────────────┼───────────────────────────────┐
   ▼                               ▼                               ▼
 Postgres + RLS            provedor de voz                   telefonia
 Storage (áudio)      4 agentes publicados por conta         número, tronco
 pg_cron + pg_net      (um por propósito, T-01)              encerramento forçado
   │                             │
   │                             │ chama de volta:
   │                             │   call-init   (contexto)
   │                             │   tool-*      (7 ferramentas)
   │                             │   call-events (fim de chamada)
   │                             │
   └── dial_queue ──► cron-dial ──► call-place ──► guarda (SQL, atômica)
```

Fronteira, do princípio 1 do `PRD.md`: o provedor de voz produz a fala. As
funções `tool-*` produzem o dado.

---

## 3. Modelo de dados

45 tabelas e uma visão. Todas com `id uuid primary key default gen_random_uuid()`,
`created_at timestamptz not null default now()` e, onde há edição, `updated_at`
por gatilho. Tabelas de negócio têm `account_id uuid not null references
accounts(id) on delete cascade`. As exceções estão marcadas.

### 3.1 Conta e acesso

**`accounts`** `name`, `timezone` (padrão `America/Sao_Paulo`), `status`,
`feature_flags jsonb`, `intake_key_hash` (L-02), `dialing_paused_at`,
`dialing_paused_by`, `dialing_paused_reason` (L-04),
`first_test_call_ok_at` (L-03), `credentials_mode` (`account` | `platform`,
padrão `account`, T-12). Sem `account_id`.

**`account_settings`** uma linha por conta, com colunas tipadas e `check` em vez
de um blob (T-22): janela de discagem por dia, intervalo mínimo, teto por
número, teto diário da conta, teto de gasto diário em centavos, retenção de
áudio e de transcrição em dias, gravação ligada, texto do aviso, limiares da
fila de exceções, política de retentativa, modo de roteamento,
`max_concurrent`, duração máxima de chamada.

**`account_members`** `user_id`, `role` (`owner` | `admin` | `operator` |
`viewer`), `last_seen_at`. Único em (`account_id`, `user_id`). Índice em
(`user_id`, `account_id`).

**`profiles`** espelha `auth.users`. Sem `account_id`.

**`invitations`** `email`, `role`, `token_hash`, `expires_at`, `accepted_at`,
`invited_by` (L-01).

**`account_secrets`** `provider`, `key_name`, `secret_id` (Vault),
`metadata jsonb`. Único em (`account_id`, `provider`, `key_name`). Tabela de
servidor, sem política de cliente.

**`account_test_numbers`** `phone_e164`, `label` (L-03).

**`audit_log`** `actor` (`user` | `agent` | `system`), `actor_id`, `source`,
`action`, `target_type`, `target_id`, `reason`, `payload jsonb`. Escrita por
gatilho ou por RPC, nunca pelo cliente (T-11).

### 3.2 Funil e leads

**`pipelines`** `name`, `is_default`.

**`pipeline_stages`** `pipeline_id`, `key` imutável (`new`, `contacted`,
`qualified`, `meeting_booked`, `won`, `lost`), `label` editável, `position`,
`color`, `is_won`, `is_lost` (RF-203).

**`leads`** `name`, `phone_e164 not null`, `email`, `city`, `state`,
`timezone`, `company`, `source`, `source_ref`, `stage_id`, `score smallint`,
`temperature`, `last_sentiment numeric`, `last_activity_at`, `briefing jsonb`
(`pain`, `fit`, `objections`, `next_action`), `blocked_at`, `blocked_reason`,
`merged_into_id`, `custom jsonb` (T-19). Índice único parcial em
(`account_id`, `phone_e164`) onde `merged_into_id is null`.

**`lead_events`** `lead_id`, `kind`, `actor`, `actor_id`, `call_id`, `summary`,
`payload jsonb`, `occurred_at`. Só inserção, por RPC. Fonte da linha do tempo
(RF-113).

**`deletion_requests`** `lead_id`, `requested_by`, `requested_at`, `due_at`
(15 dias), `fulfilled_at` (L-10, RNF-10).

### 3.3 Agenda

**`specialists`** `name`, `area`, `timezone` (T-21), `modalities text[]`,
`default_duration_min`, `daily_cap`, `min_notice_min`, `max_notice_days`,
`room_url`, `email`, `last_assigned_at` (L-16), `active`.

**`specialist_availability`** `specialist_id`, `weekday`, `start_time`,
`end_time`.

**`specialist_blocks`** `specialist_id`, `starts_at`, `ends_at`, `reason`.

**`specialist_calendars`** `specialist_id`, `provider`, `external_id`,
`refresh_secret_id`, `synced_at`, `sync_error` (L-06).

**`specialist_busy_blocks`** `specialist_id`, `starts_at`, `ends_at`,
`external_id`, `synced_at`. Preenchida por `cron-calendar-sync` (T-10).

**`meetings`** `lead_id`, `specialist_id`, `starts_at`, `ends_at`, `modality`,
`status`, `attestation_status`, `attested_by`, `attested_at`,
`attested_source`, `handoff_summary jsonb`, `external_event_id`,
`booked_call_id`, `confirmed_call_id` (T-23), `reminder_sent_at`,
`confirmed_at`, `detected_no_show_at`, `rescue_count`, `rescheduled_from_id`,
`cancel_reason`.

Duas restrições e um lock (T-08):

```sql
alter table meetings add constraint meetings_no_overlap
  exclude using gist (
    specialist_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('scheduled','confirmed'));

create unique index meetings_one_active_per_lead
  on meetings (lead_id) where status in ('scheduled','confirmed');
```

O teto diário do especialista (RF-504) e a antecedência (RF-505) não cabem em
restrição declarativa. `tool-book-meeting` insere dentro de uma função SQL que
toma `pg_advisory_xact_lock` por (`specialist_id`, dia) e conta antes de
inserir. A violação `23P01` é resultado esperado, tratada na seção 5.

**`meeting_attestations`** `meeting_id`, `token_hash`, `expires_at`, `sent_at`,
`send_attempts`, `last_send_error`, `used_at`, `answer` (R-05).

### 3.4 Agente

**`agents`** `name`, `company_name`, `offer_line`, `never_claim text[]`,
`transfer_target`, `voice_id`, `voice_settings jsonb`, `first_message`,
`status`. Sem `provider_agent_id` (T-01).

**`agent_publications`** `agent_id`, `purpose`, `provider_agent_id`,
`published_hash`, `published_at`, `status`. Único em (`agent_id`, `purpose`).
Quatro publicações por agente, uma por propósito, cada uma com o conjunto de
ferramentas daquele propósito (T-01, RF-309).

**`playbooks`** `purpose`, `current_version_id`. Único em (`account_id`,
`purpose`).

**`playbook_versions`** `playbook_id`, `version`, `status`, `body_script`
(camada 2), `body_house` (camada 3), `change_note`, `author_id`,
`published_at`. A camada 1 é constante versionada no repositório.

**`knowledge_entries`** `question`, `answer`, `tags text[]`, `source`,
`provider_doc_id`, `indexed_at` (L-09), mais `indexed_hash` (sha-256 do
documento mandado, que diz se a entrada mudou depois de indexada),
`sync_error` (código da última falha) e `removed_at` (marcada para sair). As
quatro colunas de sincronização são do servidor, por gatilho, e só os RPCs
`marcar_conhecimento_*` de `knowledge-sync` as gravam. Entrada indexada não se
apaga direto: o cliente marca `removed_at`, e a linha sai depois de o provedor
confirmar a remoção do documento.

### 3.5 Voz

**`phone_lines`** `e164`, `label`, `provider`, `provider_number_id`,
`provider_voice_id`, `inbound_behavior`, `forward_to`, `outbound_enabled`,
`daily_cap`, `rotation_group`, `health jsonb`, `in_rotation`, `enabled`.

**`calls`** `lead_id`, `phone_line_id`, `agent_publication_id`,
`playbook_version_id`, `purpose`, `direction` (`outbound` | `inbound` |
`rehearsal`), `status`, `provider_call_sid`, `provider_conversation_id`,
`from_number`, `to_number`, `started_at`, `answered_at`, `ended_at`,
`duration_sec`, `cost_cents` (soma materializada), `transcript jsonb`,
`transcript_tsv tsvector` gerada com configuração `portuguese` e índice GIN
(L-15), `recording_path`, `recording_expires_at`, `sentiment numeric`,
`classification jsonb`, `classification_source`, `evaluation jsonb`,
`evaluation_score`, `answered_by`, `end_reason`, `consent_notice_at`,
`campaign_id`, `cadence_enrollment_id`, `idempotency_key`,
`finalize_started_at`, `finalized_at`, `cost_sync_claimed_at`,
`cost_sync_attempts`, `cost_sync_gave_up_at` (a busca do preço que chega
tarde, T-20), `content_purged_at`, `purge_storage_at`, `purge_provider_at`,
`purge_claimed_at`, `purge_attempts`, `purge_note`, `purge_gave_up_at` (o
expurgo de RF-807 nos dois lados, P-10).
Único em (`account_id`, `idempotency_key`) (T-07).

**`call_live`** visão fina para assinatura em tempo real: `call_id`, `status`,
`purpose`, `lead_id`, `started_at`, `duration_sec`. A transcrição nunca trafega
por assinatura (R-08).

**`call_slot_offers`** `call_id`, `position smallint` (1 a 4),
`specialist_id`, `starts_at`, `ends_at`, `expires_at`. Substitui o
`slot_token` (T-09).

**`call_attempts`** `lead_id`, `phone_e164`, `phone_line_id`, `outcome`,
`campaign_id`, `call_id`, `source`, `attempted_at`. Índices em
(`account_id`, `attempted_at`), (`account_id`, `phone_e164`, `attempted_at`) e
(`phone_line_id`, `attempted_at`) (T-05).

**`call_tool_invocations`** `call_id`, `tool`, `request jsonb`,
`response jsonb`, `latency_ms`, `error`, `at`. Inclui as ferramentas de sistema
do provedor, lidas da transcrição na finalização (T-02).

**`call_costs`** `call_id`, `component` (`telephony` | `voice` | `model` |
`infra`), `amount_cents`, `currency`, `source`, `recorded_at`. Gatilho
materializa a soma em `calls.cost_cents` (T-20).

**`rehearsals`** `call_id`, `agent_publication_id`, `playbook_version_id`,
`persona_profile`, `mode`, `finished_at`. A transcrição vem de `calls` (T-16).

### 3.6 Conformidade

**`dnc_entries`** `phone_e164`, `reason`, `source`, `notes`, `removed_at`,
`removed_by`, `removal_reason`. Único parcial em (`account_id`, `phone_e164`)
onde `removed_at is null`. `source='wrong_number'` cobre RF-422 (T-02).

**`consent_records`** `lead_id`, `call_id`, `kind`, `granted`, `evidence`,
`at`.

### 3.7 Automação

**`dial_queue`** `lead_id`, `purpose`, `run_at`, `source`, `source_ref`,
`attempt`, `status`, `claimed_at`, `call_id`, `last_error`. Único em
(`account_id`, `source`, `source_ref`, `attempt`). Fila única alimentada pelas
cinco rotinas produtoras e consumida por `cron-dial` (L-14, promovido de menor
para estrutural porque resolve T-04, T-05 e T-07 de uma vez).

**`speed_to_lead_skips`** `lead_id` (chave primária), `account_id`, `reason`,
`detail`. O lead do formulário que `cron-speed-to-lead` examinou e não
enfileirou: fora da janela de `speed_to_lead_minutes`, mesclado, bloqueado ou
com telefone que não normaliza (RF-610). Responde "por que a Sarah não ligou" e
tira o lead da passagem seguinte.

**`cadences`** `name`, `trigger`, `trigger_stage_key`, `steps jsonb`,
`exit_conditions jsonb`, `enabled`.

**`cadence_enrollments`** `cadence_id`, `lead_id`, `current_step`,
`next_run_at`, `status`, `last_error`, `exited_reason`. Único parcial em
(`cadence_id`, `lead_id`) onde `status='active'` (L-17).

**`campaigns`** `name`, `audience jsonb`, `purpose`, `playbook_version_id`,
`phone_line_ids uuid[]`, `window jsonb`, `max_concurrent`,
`retry_policy jsonb`, `status`, `preview jsonb`, `started_at`, `finished_at`,
contadores.

**`campaign_targets`** `campaign_id`, `lead_id`, `phone_e164`, `status`,
`attempts`, `next_attempt_at`, `call_id`, `skip_reason`.

### 3.8 Operação

**`exception_items`** `kind`, `severity`, `lead_id`, `call_id`, `meeting_id`,
`context jsonb`, `status`, `resolved_by`, `resolved_at`, `resolution`.

**`onboarding_state`** `current_step`, `completed_steps text[]`,
`dismissed_at`, `health jsonb`.

**`job_runs`** `routine`, `started_at`, `finished_at`, `items`, `error`
(L-13, RF-613).

**`provider_alerts`** `provider`, `kind` (`credito`, `cota`), `message`,
`observed jsonb`, `alerted_at`, `rearmed_at`. Um aviso aberto por conta,
provedor e tipo (único parcial onde `rearmed_at` é nulo); o crédito que volta
acima do limiar rearma (RF-612). **`provider_watch`** `account_id`,
`claimed_at`: a fila de contas do vigia de crédito.

**`integration_events`** `direction`, `provider`, `endpoint`, `request jsonb`,
`response jsonb`, `status_code`, `latency_ms`, `correlation_id`, `at`. Só
chamada externa (RNF-16).

**`outbound_webhooks`** `url`, `secret_id`, `events text[]`, `enabled`.
**`outbound_deliveries`** `webhook_id`, `event`, `payload jsonb`, `attempts`,
`status`, `last_error`, `next_retry_at`.

### 3.9 Isolamento

O formato único da v1.0 abria quatro brechas (T-11). Passa a valer uma matriz
com quatro classes:

| Classe | Tabelas | Leitura | Escrita |
|---|---|---|---|
| Operação | `leads`, `meetings`, `exception_items`, `dnc_entries`, `campaign_targets`, `cadence_enrollments` | membro | `operator` |
| Configuração | `agents`, `agent_publications`, `playbooks`, `playbook_versions`, `knowledge_entries`, `phone_lines`, `specialists` e filhas, `cadences`, `campaigns`, `pipelines`, `pipeline_stages`, `outbound_webhooks`, `account_settings`, `accounts`, `account_test_numbers` | membro | `admin` |
| Dono | `account_secrets` (sem leitura por ninguém), exclusão de `accounts`, `credentials_mode` | `owner` | `owner` |
| Servidor | `audit_log`, `lead_events`, `calls`, `call_*`, `meeting_attestations`, `integration_events`, `job_runs`, `outbound_deliveries`, `dial_queue`, `speed_to_lead_skips`, `provider_alerts`, `provider_watch`, `deletion_requests`, `specialist_busy_blocks` | membro, só `select` | nenhuma política de cliente |

`is_member(uuid)` e `has_role(uuid, text)` são `stable security definer`,
sempre invocadas como `(select is_member(account_id))` para o planejador
cachear por consulta. `has_role` é hierárquica: `owner` contém `admin`, que
contém `operator`, que contém `viewer`.

Toda mutação sensível passa por RPC `security definer` que grava ação e
auditoria na mesma transação. Tabelas de configuração ganham gatilho
`after update or delete` que escreve em `audit_log` com `auth.uid()`.
O cliente nunca insere em `audit_log` nem em `lead_events`.

---

## 4. Funções de servidor

44 funções de borda, mais 5 RPC no banco. A coluna "auth" indica `jwt` (sessão de usuário), `secret`
(segredo compartilhado do provedor), `interna` (segredo de serviço) ou
`pública` (chave da conta em cabeçalho).

### 4.1 Agente

| Função | Auth | Papel |
|---|---|---|
| `agent-publish` | jwt | Compila camada 1, camada 2 e camada 3, e publica **quatro agentes**, um por propósito, cada um com o conjunto de ferramentas daquele propósito, a duração máxima da conta (L-12), a retenção conforme a gravação estiver ligada ou desligada (L-18) e os critérios de avaliação. Grava `published_hash` por publicação (T-01, RF-313) |
| `knowledge-sync` | jwt | Envia e remove documentos da base no provedor e anexa às quatro publicações (L-09, RF-310) |
| `playbook-draft` | jwt | Gera rascunho de roteiro a partir da descrição do negócio, com `claude-opus-5`, e grava `playbook_versions` em `draft` (L-08, RF-305) |
| `voice-catalog` | jwt | Vozes em português e amostra da frase de abertura real (RF-302, RF-304) |
| `rehearsal-session` | jwt | Cria `calls` com `direction='rehearsal'` e devolve sessão assinada contra o agente publicado. Texto ou voz no navegador (T-16, RF-312) |

### 4.2 Ciclo da chamada

| Função | Auth | Papel |
|---|---|---|
| `call-place` | jwt **ou** interna | Caminho único de discagem. Autenticação dupla: sessão de usuário, ou segredo de serviço com `actor='system'` e `source` (T-04). Chama a guarda, grava `calls`, escolhe a publicação pelo propósito, dispara |
| `call-init` | secret | Webhook de início. Em chamada de entrada, identifica a linha por `called_number`, resolve ou cria o lead por `caller_id` e **grava `calls`** (T-14, RF-108). Fonte única de contexto: `call-place` passa apenas `call_id` como variável dinâmica (T-25) |
| `inbound-twiml` | secret | Atende `forward` e `voicemail`, que o número registrado no provedor de voz não serve (T-14, RF-409) |
| `call-events` | secret | Webhook de fim. Valida assinatura e aciona a finalização |
| `call-finalize` | interna | Fonte canônica. Reivindica a chamada por `update ... where finalize_started_at is null or < now() - 5 min returning id`; só quem recebe a linha continua (T-15). Puxa transcrição e áudio, lê as invocações de ferramenta de sistema da transcrição, reaplica ferramentas que falharam (R-02), grava `consent_notice_at` (L-23), dispara classificação e sentimento |
| `call-classify` | interna | Classificação de retaguarda quando `tool-qualify` não foi chamada. `classification_source='backfill'` |
| `call-audio` | jwt | URL assinada de validade curta, respeitando o expurgo |
| `call-cancel` | jwt | Cancela chamada em fila ou em curso |
| `emergency-stop` | jwt | Grava `dialing_paused_at`, encerra chamadas em curso pela telefonia e pausa campanhas em até 10 s (L-04, RF-011) |

### 4.3 Ferramentas do agente

Sete funções, auth `secret`. Contrato na seção 5.
`tool-availability`, `tool-book-meeting`, `tool-confirm-meeting`,
`tool-reschedule`, `tool-qualify`, `tool-transfer`, `tool-dnc`.

Mais três **ferramentas de sistema do provedor**, declaradas na publicação e
sem função nossa (T-02):

| Ferramenta de sistema | Propósitos | Captura |
|---|---|---|
| `end_call` | todos | `call-finalize` lê a invocação na transcrição e grava `end_reason` |
| `transfer_to_number` | todos | Encadeada após `tool-transfer` devolver o número de destino |
| `voicemail_detection` | todos | Define `answered_by='machine'` e `end_reason='voicemail'` (T-03, RF-418) |

`tool-transfer` decide e devolve o destino ou `queued`. Quem transfere é a
ferramenta de sistema. `tool-dnc` grava o bloqueio e devolve a despedida; quem
encerra é `end_call`.

### 4.4 Entrada e saída de dados

| Função | Auth | Papel |
|---|---|---|
| `lead-intake` | pública | Endereço por conta, autenticado por `intake_key_hash`, com limite de taxa. Cria o lead e enfileira em `dial_queue` quando a conta pede (L-02, RF-107, RF-610) |
| `leads-import` | jwt | Prévia e confirmação. Nada gravado antes da confirmação (RF-101 a RF-105) |
| `lead-export` | jwt | Exportação filtrada e exportação individual sob solicitação (L-10, RF-115, RF-809) |
| `lead-erase` | jwt | Apaga Storage, transcrição, `calls` e **a conversa no provedor de voz**, que também guarda áudio e texto (L-10, P-10, RF-808, RNF-10) |
| `invite-accept` | pública | Resolve o token e cria `account_members` (L-01, RF-005) |
| `meeting-attest` | pública | O link abre página com os dois botões. A resposta é POST. GET nunca muda estado (T-13, RF-514) |
| `calendar-connect` / `calendar-callback` | jwt / pública | Fluxo OAuth, grava `refresh_secret_id` no Vault (L-06, RF-507) |
| `webhook-dispatch` | interna | Entrega com nova tentativa e recuo (RF-914) |
| `integrations-status` | jwt | Estado real de cada provedor, limites de sessões e de canais (L-20, RNF-13), e comparação do hash do agente publicado contra o provedor (R-06) |
| `phone-register` | jwt | Registra o número conforme `inbound_behavior` |

### 4.5 RPC no banco

`lead_merge(source, target)` (L-11, RF-114), `dashboard_summary(period)`
(L-21), `onboarding_health()` (L-22), `guard_dial(...)` (seção 6), e a função
de inserção de reunião com lock por especialista e dia (T-08).

### 4.6 Rotinas agendadas

Produtoras escrevem em `dial_queue`. Só `cron-dial` disca (L-14).

| Rotina | Cadência | Papel |
|---|---|---|
| `cron-dial` | 1 min | Consome `dial_queue` com `for update skip locked`, respeita `max_concurrent` por conta, chama `call-place` |
| `cron-speed-to-lead` | 1 min | Enfileira lead recém-recebido (RF-610) |
| `cron-meeting-reminder` | 1 min | Enfileira lembrete (RF-601) |
| `cron-meeting-rescue` | 5 min | Enfileira resgate **somente** em `status='no_show'` atestado (T-17, RF-604) |
| `cron-cadence` | 5 min | Avança inscrições e enfileira (RF-606) |
| `cron-campaign-dispatch` | 1 min | Alimenta a fila respeitando janela e simultaneidade (RF-707) |
| `cron-call-recovery` | 2 min | Finaliza chamadas pendentes; marca `queued` sem SID há mais de 3 min como `dial_lost` (T-07); encerra chamada além da duração máxima (L-12); aplica idade máxima e disjuntor quando o provedor cai (R-01) |
| `cron-attestation` | 30 min | Envia o e-mail de apuração e o lembrete de 24 h, com marca só após 2xx (R-05, RF-514) |
| `cron-calendar-sync` | 5 min | Ocupação dos próximos 30 dias em `specialist_busy_blocks` (T-10) |
| `cron-meeting-invite` | 5 min | Nova tentativa do convite de reunião por e-mail, por destinatário, com marca só após 2xx (R-05, RF-509) |
| `cron-cost-sync` | 15 min | Busca preços que chegaram tarde (T-20, P-07) |
| `cron-line-health` | 1 h | Taxa de atendimento por linha em janela de 50 tentativas; abaixo do limiar, tira do rodízio e cria item na fila (R-04, RF-709) |
| `cron-retention` | diária | Expurgo no Storage **e no provedor** (P-10, RF-611) |
| `cron-credit-watch` | 15 min | Aviso de crédito e cota (RF-612) |

Toda rotina grava em `job_runs`, é idempotente, usa `skip locked` e processa no
máximo 25 itens por execução, o que espalha a retomada depois de uma queda
(R-02). pg_cron chama as funções por `pg_net`, com URL e segredo lidos de
`app_config` e do Vault dentro do SQL do job, nunca em texto na migração
(T-26).

---

## 5. Contrato das ferramentas

**Autenticação.** Cabeçalho `x-tool-secret`. O segredo da conta é derivado,
`HMAC(chave_servidor, account_id)`, o que permite comparar antes de conhecer a
conta (T-18). Rotação aceita dois segredos por 24 h (R-07).

**Identificação da chamada.** Cabeçalho `x-conversation-id`, resolvido contra
`calls.provider_conversation_id`. Nenhum identificador transita pela conversa.

**Restrição por propósito.** Garantida na publicação, porque a ferramenta não
existe no agente daquele propósito (T-01). A verificação em tempo de execução
permanece como segunda linha e devolve 409 com frase de contorno.

**Resposta.** `{ ok, data, speech }`. O `speech` é a frase pronta em português,
formatada no fuso do lead, dizendo o fuso quando diferir do especialista
(T-21).

**Prazo.** `response_timeout_secs` definido explicitamente na publicação, em
5 s. Alvo de 2 s no p95 (P-01).

**Falha.** `speech: "deixa eu confirmar isso com o time e já te retorno"`.

**Ensaio.** Quando a chamada tem `direction='rehearsal'`, as ferramentas fazem
toda a leitura de verdade e pulam os efeitos: sem inserir reunião, sem
calendário, sem e-mail, sem bloqueio. Métricas e listagens excluem ensaios
(T-16).

**Registro.** Toda invocação grava em `call_tool_invocations`.

| Ferramenta | Entrada | `data` | Propósitos |
|---|---|---|---|
| `tool-availability` | `area`, `specialist_id`, `duration_min`, `days_ahead` | até 4 ofertas gravadas em `call_slot_offers`, devolvidas como "opção um, opção dois" | todos |
| `tool-book-meeting` | `slot_position` (1 a 4), `modality`, `email`, `notes` | `meeting_id`, `starts_at` | descoberta, retomada |
| `tool-confirm-meeting` | nenhuma; usa o `meeting_id` do contexto | `status` | lembrete |
| `tool-reschedule` | `action`, `slot_position`, `reason` | `meeting_id`, `starts_at` | lembrete, resgate |
| `tool-qualify` | `stage_key`, `temperature`, `sentiment`, `pain`, `next_action`, `meeting_outcome`, dados do lead | `lead_id`, `score` | descoberta, retomada, resgate, pós-reunião |
| `tool-transfer` | `reason`, `urgency` | número de destino ou `queued` | todos |
| `tool-dnc` | `reason` (inclui `wrong_number`) | `blocked_at` | todos |

O modelo escolhe "a segunda opção", e não reproduz identificador (T-09). As
ofertas expiram no fim da chamada.

`tool-book-meeting` trata `23P01` como resultado esperado e devolve
`speech: "esse horário acabou de ser preenchido, deixa eu ver outro"`, e o
roteiro chama `tool-availability` de novo (T-08).

`tool-qualify` ganha `meeting_outcome` (`attended` | `no_show` | `unknown`),
válido quando o contexto traz `meeting_id`. É a terceira fonte de apuração da
métrica norte (L-07, RF-517).

---

## 6. Guarda de discagem

Função SQL `security definer` `guard_dial(...)`, chamada só por `call-place`.
Toma `pg_advisory_xact_lock` por (`account_id`, `phone_e164`) e um segundo por
conta, faz as contagens, grava `call_attempts` e devolve a decisão **na mesma
transação** (T-05). O módulo `guard.ts` apenas normaliza e chama.

Ordem:

0. `accounts.dialing_paused_at` preenchido: recusa antes de qualquer consulta (T-06).
1. Normaliza para E.164 com região padrão BR.
2. Portão de lead real: se `feature_flags.real_dialing` é falso ou `first_test_call_ok_at` é nulo, só aceita número em `account_test_numbers` (L-03, O-02).
3. `dnc_entries` ativas.
4. Janela do dia da semana no fuso do lead, com `at time zone` (T-21, R-10).
5. Intervalo mínimo desde a última tentativa ao mesmo número.
6. Teto diário por número de destino.
7. Teto diário da conta e teto de gasto do dia, somando `call_costs` (T-06, RNF-12).
8. Teto diário da linha de origem e escolha da linha no rodízio, entre as que estão `in_rotation`.
9. Grava `call_attempts`, inclusive quando recusa.

Resposta: `{ allowed, reason, message, alternative, phone_line_id }`. O
`message` está em português e o `alternative` traz a saída. Campanha passa
`bypass: ['min_interval','daily_per_number']`, e nunca pula os passos 0, 2, 3
e 4.

---

## 7. Interface

### Rotas

```
/entrar  /convite/:token  /recuperar-senha
/configuracao-inicial

/                      painel
/fila                  precisam de você
/funil
/leads  /leads/:id  /leads/importar
/chamadas  /chamadas/:id
/conversas  /conversas/:id
/reunioes  /reunioes/:id

/sarah/identidade  /sarah/voz  /sarah/playbooks
/sarah/conhecimento  /sarah/ensaio
/campanhas  /campanhas/:id
/cadencias  /cadencias/:id
/numeros  /especialistas

/config/conta  /config/integracoes  /config/discagem
/config/bloqueios  /config/privacidade  /config/equipe
/config/webhooks  /config/auditoria
```

### Tokens e componentes

Os valores de `padrao-de-interface.md` entram como variáveis CSS em `:root` e
como tema do Tailwind. Corpo em 13,5px, entrelinha 1,45. `JetBrains Mono` por
classe `.val` em telefone, duração, custo, nota e horário.

Componentes de base: `SeloProposito`, `CartaoLead`, `BlocoResumo`,
`LinhaDoTempo`, `LinhaChamada`, `Reprodutor`, `IndicadorPublicacao`,
`CartaoProvedor`, `AvisoBloqueio`, `CartaoMetrica`, `SeletorPeriodo`,
`EstadoVazio`, `TabelaDensa`. Cada um com os quatro estados.

### Dados e tempo real

TanStack Query com carga na rota. Assinatura em tempo real em `call_live`,
`exception_items` e `campaign_targets`. O painel lê `dashboard_summary`, e não
agrega no cliente (L-21).

### Texto

Literais de interface em `app/src/copy/`, agrupados por tela. Falas da Sarah em
`supabase/functions/_shared/speech/`, porque quem as emite é o servidor. As
regras da seção 4 de `padrao-de-interface.md` valem para todo texto novo.

---

## 8. Segurança

Credencial no Vault, lida só por função de servidor, resolvida por
`_shared/secrets.ts` com `resolveSecret(account_id, provider, key_name)` e
cache de 60 s invalidado na escrita (T-12).

Em `producao`, a chave da conta é obrigatória. A exceção é
`accounts.credentials_mode='platform'`, gravada pelo Dono e auditada. Em
`local` e `homologacao`, a cascata completa vale: conta, recurso, plataforma.

Segredos que saem por necessidade, e que a seção declara em vez de esconder: o
SID e o token da telefonia vão para o provedor de voz no registro do número; o
`x-tool-secret` derivado fica na configuração do agente publicado. "O valor
nunca sai" vale para o navegador.

Webhooks de entrada validam assinatura. `lead-intake` valida a chave da conta e
tem limite de taxa, porque o endereço dispara ligação e chave vazada vira custo
(L-02).

Auditoria em toda ação sensível, na mesma transação, por gatilho ou por RPC.

Retenção padrão de 90 dias, com expurgo no Storage e no provedor. Exclusão sob
solicitação em até 15 dias corridos, registrada em `deletion_requests`.

---

## 9. Testes

### 9.1 Escada de validação

O laço de execução autônoma não sobe container, não faz login e não aciona
automação de navegador. Diálogo de permissão do sistema operacional trava o laço
e exige um humano, o que anula a autonomia. A validação local roda inteira
dentro do processo do executor de testes.

| Onde | Comando | O que faz | Quem roda |
|---|---|---|---|
| Laço local | `npm run check` | typecheck, lint, testes de componente em jsdom, testes de banco em PGlite e validação estática das migrações | Toda mudança |
| CI | `npm run check:full` | Supabase local, `db reset`, suíte completa e Playwright | Envio que toca `supabase/`, e a branch principal |

**Banco em processo.** Os testes de banco rodam em PGlite, um Postgres
compilado para WebAssembly que sobe em memória sem daemon e sem container. O
auxiliar aplica as migrações em ordem e cria um esquema `auth` mínimo com
`auth.uid()` lendo um parâmetro de sessão, o que permite exercitar políticas de
RLS sem o serviço de autenticação.

**Onde PGlite não chega.** Concorrência. PGlite é uma conexão em um processo,
e nele uma transação nunca espera o commit de outra; duas ligações disputando
o mesmo horário ficam para o CI contra Postgres real. `btree_gist` existe no
PGlite desta versão (`@electric-sql/pglite/contrib/btree_gist`), então a
restrição de exclusão de `meetings` se prova em processo: recusa o sobreposto
com 23P01, aceita o encostado e libera o horário quando o status sai do
predicado. O que falta a ela é só o paralelismo.

**Validação estática.** `check:sql` percorre as migrações e falha quando: uma
tabela criada não habilita RLS, uma tabela de negócio não tem `account_id`, uma
chamada a `is_member` aparece fora da forma `(select is_member(...))`, ou uma
migração carrega chave, URL ou segredo literal. Pega a maior parte dos erros de
isolamento em segundos e sem banco.

**Interface.** Verificação por teste de componente em jsdom com Testing Library.
A confirmação visual fica com o CI e com a revisão humana. É a contrapartida
aceita por não abrir navegador no laço.

**Dívidas do degrau 3.** O que o laço local não tem como medir fica escrito
aqui, e não no comentário de um arquivo só:

| Dívida | De quem | Por que não cabe no laço |
|---|---|---|
| Os 2 s de RF-107, do pedido chegar ao `lead-intake` até o lead gravado | F1, `lead-intake` | Depende de rede, do isolado do Deno acordando e de Postgres real. O laço mede o caminho portável da função, com orçamento de 50 ms, e é isso que ele garante |
| O limite de taxa do `lead-intake` valer no total, e não por isolado | F1, `lead-intake` | A janela vive na memória do isolado, e sob carga há mais de um. O teto que segura o custo é o teto diário de ligações (RF-010), que é do banco e é da F2; um contador compartilhado exige Redis ou tabela, e a escolha é da fase que tiver a carga |
| Duas ligações simultâneas no mesmo horário do mesmo especialista, e duas na sexta vaga de um teto 6 | F5, `testes/concorrencia/agenda-simultanea.test.ts` (`npm run test:agenda:postgres`) | PGlite é uma conexão em um processo e não faz uma transação esperar o commit da outra. A exclusão e o teto já se provam em série no laço (`reunioes.test.ts`, `agendamento-de-reuniao.test.ts`); o que o CI acrescenta é o paralelismo |
| O agendamento real das rotinas, a granularidade de um minuto e a sobreposição de jobs (P-09) | F2, `20260923130000_rotinas_agendadas.sql` | pg_cron e pg_net são da plataforma e o PGlite não tem nenhum dos dois: o preâmbulo de `testes/auxiliares/banco-de-teste.ts` os recria de mentira, registrando em `espionagem.chamadas` o que seria agendado e mandado. Chamar a função por `net.http_post` exige rede |
| A consulta real de preço da telefonia e a prova de P-07: encerrar uma chamada por duração máxima e conferir o preço 30 min depois | F2, `supabase/functions/cron-cost-sync/index.ts` | Exige a API da telefonia com credencial real e uma ligação de verdade. O laço prova a decisão com a telefonia dublada, e o formato da resposta (`price` negativo em `price_unit`) é suposição declarada em `cron-cost-sync/custos.ts` |
| A consulta real de crédito e de cota nos provedores, e o `deno check` de `cron-credit-watch/index.ts` | F2, `supabase/functions/cron-credit-watch/index.ts` | Exige credencial real de cada provedor. O laço prova a decisão (limiar, indisponível, um aviso por queda, rearme) com a sondagem dublada, e a leitura de cada API em `integrations-status/sondas.ts` segue a documentação pública do provedor |
| O expurgo real no Storage e a remoção da conversa no provedor de voz (P-10), e o `deno check` de `cron-retention/index.ts` | F2, `supabase/functions/cron-retention/index.ts` | Exige o balde `recordings` e a API do provedor com credencial real. O laço prova a decisão (os dois lados, a marca só depois do 2xx duplo, a idempotência, a desistência na quinta falha) com o Storage e o provedor dublados, e a régua do prazo em PGlite. Que `DELETE convai/conversations/{id}` responda 2xx ao apagar é suposição declarada em `cron-retention/expurgo.ts`; o 404 conta como falha |
| A chamada real ao modelo que escreve o rascunho de roteiro, e o `deno check` de `playbook-draft/index.ts` | F2, `supabase/functions/playbook-draft/index.ts` | Exige uma conta com o OpenRouter conectado (o modelo é sempre o da conta; a instalação não tem chave de modelo). O laço prova a decisão com o modelo dublado: o rascunho nasce `draft` com nota e autor, a camada 3 é carregada da versão vigente, o texto que promete horário é recusado sem gravar, e o `prompt` sai redigido pelo gatilho de `integration_events` (PGlite). Que o modelo respeite o formato `json_schema` pedido é suposição do adaptador; resposta fora dele vira `resposta_ilegivel` |
| A sincronização real da base de conhecimento com o provedor de voz, e o `deno check` de `knowledge-sync/index.ts` | F2, `supabase/functions/knowledge-sync/index.ts` | Exige a API do provedor com credencial real. O laço prova a decisão com o provedor dublado (envio, atualização por remoção e reenvio, remoção, idempotência contada, falha por entrada, `indexed_at` só depois do 2xx, anexo às quatro publicações) e o esquema em PGlite. São suposições declaradas em `knowledge-sync/sincronizacao.ts`: a remoção forçada de documento anexado é aceita e o tira dos agentes, e o `PATCH` de `agent-publish` não apaga `knowledge_base` do agente. Se apagar, `agent-publish` passa a levar a lista junto |
| A suíte de contrato das ferramentas contra as funções implantadas, que é o portão de produção da seção 9.2 | F3, `scripts/contrato-das-ferramentas.ts` (`npm run check:contrato`) | Exige as funções no ar, `SARAH_TOOL_SERVER_KEY` e uma conversa de ensaio semeada em homologação. O laço prova o mesmo contrato no esqueleto, com a porta dublada (`supabase/functions/_shared/tools/esqueleto.test.ts`); a suíte sai com zero sem `SARAH_TOOLS_BASE_URL` |
| A publicação real das três ferramentas de sistema e das duas ferramentas de negócio da F3: `transfer_to_number` com destino por variável da conversa (`phone_dynamic_variable`), escrita pela resposta de `tool-transfer` (`assignments`), e as ferramentas nossas em `api_schema` com corpo declarado | F3, `supabase/functions/agent-publish/formato-do-provedor.ts` | Exige a API do provedor com credencial real. O laço prova a compilação: o conjunto exato por propósito, o destino sem número fixo, o caminho da resposta de `tool-transfer` e o hash que muda com a lista (`agent-publish/publicacao.test.ts`, `_shared/agente/compilador.test.ts`). `scripts/sonda-de-publicacao.ts` confere a forma do webhook e o cabeçalho da conversa, mas não a transferência por variável, que é suposição declarada no cabeçalho do formato |

### 9.2 Cobertura por camada

| Camada | Cobre | Ferramenta |
|---|---|---|
| Contrato das ferramentas | As sete, com carga válida, campo faltante, segredo inválido, conversa inexistente, propósito errado, oferta expirada, `23P01` e modo ensaio | Vitest |
| Funções puras | E.164, janela horária no fuso do lead, geração de horários, mapeamento de etapa, score, rodízio | Vitest |
| Guarda | Cada um dos nove passos, com concorrência: duas chamadas simultâneas não passam do teto | Vitest de integração com transações paralelas |
| Isolamento | Travessia de conta em toda tabela, mais as quatro classes da matriz | SQL no CI (RNF-07) |
| Idempotência | Cada rotina duas vezes em sequência; finalização por webhook e varredura no mesmo segundo | Vitest de integração |
| Migração | Banco vazio, mais aplicação sobre dump anonimizado de homologação (R-03) | CI (RNF-14) |
| Interface | Fluxos de F0 a F3 (O-08) | Playwright |

Portão do CI: nenhuma função de ferramenta entra em produção sem suíte de
contrato verde.

---

## 10. Ambientes e implantação

Três ambientes, cada um com projeto Supabase próprio. Migrações versionadas
desde o primeiro commit, aplicadas por CI, nunca pelo painel do provedor.

Padrão expandir e contrair: nenhuma migração remove ou renomeia coluna que o
código em produção lê, e a remoção vem na versão seguinte. `create index
concurrently` fora de transação e em migração própria. Correção sempre para a
frente. Ponto de restauração antes de cada implantação. Verificação
pós-implantação que roda a suíte de isolamento e um `select` por tabela (R-03).

Semente determinística com o cenário Vexo Tecnologia, lead Marcos Ferreira da
Fluxo Cargo, especialista Marina Alcântara.

---

## 11. Ordem de construção

| Fatia | Construção |
|---|---|
| **F0** | Migrações base, matriz de isolamento, papéis, `invitations` e `invite-accept`, Vault e `resolveSecret`, auditoria com tela consultável, `integrations-status`, assistente de configuração inicial, casca da interface com os tokens, autenticação. **Abre as três esperas externas: pacote regulatório de telefonia, verificação OAuth do Google e DNS do e-mail** (O-03, P-04) |
| **F1** | `leads-import`, `lead-intake`, DDD para fuso, lista de leads com filtros e ações em lote, `lead_merge`, `lead-export` |
| **F2** | `agent-publish` com as quatro publicações, `voice-catalog`, `playbook-draft`, `knowledge-sync`, `phone-register`, `inbound-twiml`, `dial_queue`, `cron-dial`, `call-place` com `guard_dial`, `call-init`, `call-events`, `call-finalize`, `call-classify`, `call-audio`, `call-cancel`, `cron-call-recovery`, `emergency-stop`, `call_costs` e `cron-cost-sync`, `cron-speed-to-lead`, `cron-retention`, `cron-credit-watch`, detecção de secretária eletrônica, tela de números, ficha da chamada (O-01, O-04, O-07) |
| **F3** | `rehearsal-session` e tela de ensaio, `tool-transfer`, `tool-dnc`, ferramentas de sistema, fila de exceções mínima. **Migração que liga `feature_flags.real_dialing`** (O-02) |
| **F4** | `tool-qualify`, funil, ficha do lead, avaliação automática, correção humana, fila completa com limiares, painel com `dashboard_summary` |
| **F5** | Especialistas, disponibilidade, `calendar-connect`, `cron-calendar-sync`, `tool-availability`, `tool-book-meeting`, tela de reuniões, convite por e-mail |
| **F6** | `cron-meeting-reminder`, `tool-confirm-meeting`, `tool-reschedule`, `cron-meeting-rescue`, cadências, `cron-attestation` e a apuração da métrica norte |
| **F7** | Campanhas com prévia, `cron-campaign-dispatch`, `cron-line-health` e rodízio, busca em transcrições, `webhook-dispatch` |

Duas decisões precisam ser tomadas antes de codar, porque refazem F2 e F3 se
vierem depois (O-05): o agente por propósito (T-01, com o teste de meia hora
contra o provedor) e o ensaio pelo agente publicado (T-16).

O estado das três esperas externas da F0 fica em `esperas-externas.md`, uma
seção por espera, com o que foi pedido, a quem, as datas, o prazo do terceiro e
a fatia que a espera destrava. `testes/estatica/esperas-externas.test.ts`
reprova quando falta estado ou data de conferência, para que a pendência não
envelheça calada enquanto ninguém responde.

Na F2 a Sarah liga com o playbook de descoberta e **nenhuma ferramenta de
agenda**. A camada 2 de descoberta precisa de variante "sem agenda" para F2 a
F4, senão a ligação de teste termina em promessa que o sistema não cumpre
(O-06).

---

## 12. Riscos de operação

| Risco | Resposta |
|---|---|
| Provedor de voz cai no meio da chamada (R-01) | Idade máxima na recuperação: `in_progress` além de `max_duration + 10 min` vira `provider_lost`, item na fila e reprogramação. Disjuntor por conta e por campanha: N falhas em M minutos pausam a discagem e criam item de severidade alta |
| Banco indisponível durante campanha (R-02) | `call-finalize` reaplica ferramentas que falharam, lidas da transcrição. Um `tool-dnc` que falhou vira `dnc_entries` na finalização. A camada 1 instrui a Sarah a prometer o bloqueio em voz alta e encerrar. Retomada espalhada por `skip locked` e limite de 25 itens |
| Migração falha em produção (R-03) | Expandir e contrair, ponto de restauração, correção para a frente, verificação pós-implantação, simulação sobre dump anonimizado |
| Número marcado como spam (R-04) | `cron-line-health` tira a linha do rodízio sozinha e cria item na fila. Campanha sem linha saudável pausa |
| E-mail de apuração falha (R-05) | `sent_at` gravado só após 2xx, até 5 tentativas com recuo, e item na fila para apuração manual |
| Agente editado no painel do provedor (R-06) | `integrations-status` compara o hash do publicado e mostra "alterado fora da plataforma" |
| Rotação de segredo (R-07) | Dois segredos aceitos por 24 h |
| Laço de automação (R-09) | Unicidade de `dial_queue` por fonte, mais alarme quando o volume de uma rotina passa de 3 vezes a média móvel |

---

## 13. Definição de pronto

Um item está pronto quando o requisito do `PRD.md` está atendido, o critério de
aceite da fatia passa, existe teste na camada que lhe cabe, o texto segue o
padrão de interface, os quatro estados de tela existem, a ação sensível grava
auditoria na mesma transação, e a função é idempotente quando roda mais de uma
vez.

---

## 14. Pendências menores

Os 35 achados menores de `revisao-tecnica.md` seguem como lista de trabalho,
cada um com a fatia em que entra. Nenhum bloqueia o início. Os que mudam
schema entram na migração da própria fatia, e não depois: T-19 (colunas de
`leads`), T-21 (fuso do especialista), T-22 (`account_settings` tipada), T-23
(vínculo reunião e chamada), L-13 (`job_runs`), L-15 (busca em transcrição),
L-16 (roteamento), L-17 (inscrição dupla), L-19 (saúde da linha), L-24 (quem
cria item na fila).

---

## Apêndice: o que a revisão confirmou

Fica registrado para não ser reaberto. A restrição de exclusão por intervalo em
`meetings` resolve duas ligações simultâneas, verificada no índice com bloqueio
de linha, sem depender de leitura prévia. O caminho único de discagem com
guarda compartilhada, a finalização canônica em via dupla, a gravação de
`calls` antes de tocar no provedor, a frase pronta devolvida pela ferramenta, a
etapa referenciada por `key`, a camada 1 como constante do repositório, as
falas no servidor, as migrações desde o primeiro commit e a semente com o
cenário Vexo seguem como estavam.
