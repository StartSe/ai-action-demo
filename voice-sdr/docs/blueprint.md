# Sarah SDR — Blueprint funcional

Agente de pré-vendas por voz. A Sarah liga, conversa em português, qualifica o lead,
consulta a agenda de um especialista, marca a reunião, confirma na véspera, resgata
quem não apareceu e devolve tudo registrado no pipeline.

Documento de arquitetura e escopo. Decisões travadas, fatias de entrega e critérios
de aceite. Layout e identidade visual ficam fora daqui de propósito.

---

## 1. Decisões travadas

| Decisão | Escolha |
|---|---|
| Canal do MVP | Voz (outbound e inbound) |
| Banco / backend | Projeto Supabase próprio: Postgres + RLS + Storage + Edge Functions + pg_cron |
| Motor de conversa | ElevenLabs Conversational AI (STT + LLM + TTS + turn-taking num agente só) |
| Telefonia | Twilio (número, tronco, status de chamada) |
| Frontend | React + Vite + TanStack Router + TanStack Query + Tailwind + shadcn/ui |
| Schema | Migrations versionadas no repositório desde o primeiro commit |
| Idioma | PT-BR em toda a interface, nos prompts e nas mensagens de erro |

Duas decisões continuam abertas e estão na seção 9.

---

## 2. O ciclo que a Sarah fecha

```
  lead entra                    Sarah liga                    resultado registrado
  ─────────────                 ──────────                    ────────────────────
  CSV / formulário / API  ──►   guard de discagem      ──►    lead qualificado
  campanha                      contexto da chamada           etapa + score + briefing
  cadência de follow-up         conversa + tools              reunião na agenda
  lembrete de reunião           encerramento                  transcrição + gravação
  resgate de no-show                                          sentimento da conversa
                                       │
                                       ▼
                        reunião marcada ──► lembrete T-15min ──► compareceu?
                                                                  ├── sim  → reunião realizada
                                                                  └── não  → resgate de no-show
                                                                             (até N tentativas)
```

Cada seta é uma peça de software listada na seção 5.

---

## 3. Os quatro propósitos de chamada

Toda ligação nasce com um `call_purpose`. Ele determina o roteiro, quais ferramentas
o agente pode usar e como o resultado é interpretado. É o eixo central do produto.

| Propósito | Quando dispara | O que a Sarah faz | Ferramentas liberadas |
|---|---|---|---|
| `discovery` | Lead novo (campanha, importação, inbound) | Descobre contexto, qualifica em 4–5 turnos, propõe reunião | agenda, marcar, qualificar |
| `reminder` | 15 min antes da reunião | Confirma presença; se não puder, remarca na hora | confirmar, agenda, remarcar |
| `noshow_rescue` | Reunião passou sem confirmação de presença | Acolhe sem cobrar, oferece novo horário | agenda, remarcar, qualificar |
| `followup` | Passo de cadência | Retoma o assunto com base no briefing anterior | agenda, marcar, qualificar |

Restringir ferramenta por propósito evita a classe de bug mais cara desse produto:
o agente marcar uma reunião nova durante uma ligação de lembrete.

---

## 4. Modelo de dados

Nomes em inglês, estáveis, sem vocabulário de nenhum vertical específico.

### Conta e acesso
- `accounts` — workspace. Guarda fuso, configuração comercial e feature flags.
- `account_members` — usuário × conta × papel (`owner` | `admin` | `operator` | `viewer`).
- `profiles` — dados do usuário.
- `account_secrets` — credenciais por conta no Vault do Postgres. Valor **nunca** trafega para o browser: só funções `SECURITY DEFINER` chamadas por edge function leem.

### Lead e funil
- `leads` — pessoa. Telefone E.164 como chave natural dentro da conta, `score` 0–100, `briefing` estruturado (dor, fit, objeções, próximo passo), `last_sentiment`, `stage_id`, `source`.
- `pipelines` / `pipeline_stages` — etapa tem **`key` imutável** (`new`, `contacted`, `qualified`, `meeting_booked`, `won`, `lost`) e `label` editável pelo cliente. Toda a lógica referencia `key`; o cliente renomeia a coluna do kanban sem quebrar classificação.
- `lead_events` — trilha append-only de tudo que aconteceu com o lead (ligação, mudança de etapa, reunião, opt-out). Fonte única para auditoria e para o briefing de contexto.

### Agenda
- `specialists` — quem recebe a reunião. Nome, área, modalidades atendidas, duração padrão.
- `specialist_availability` — janelas semanais (`weekday`, `start_time`, `end_time`).
- `specialist_blocks` — bloqueios pontuais (férias, compromissos).
- `meetings` — reunião. `starts_at`, `status` (`scheduled` | `confirmed` | `attended` | `no_show` | `rescheduled` | `canceled`), `specialist_id`, `lead_id`, `modality`, `briefing`, `reminder_sent_at`, `confirmed_at`, `detected_no_show_at`, `rescue_count`.

### Voz
- `agents` — a persona. Prompt do cliente, voz, parâmetros de fala, modelo, `provider_agent_id`, `status`.
- `playbooks` — **as regras do fluxo como dado, não como código.** Um registro versionado por `call_purpose`, editável no painel, com histórico. Cada chamada grava qual versão usou → dá para explicar por que a Sarah disse o que disse.
- `phone_lines` — número. Comportamento no inbound, agente fixado, habilitação de saída, id do número no provedor.
- `calls` — chamada. Direção, status, propósito, `provider_conversation_id`, transcrição, caminho da gravação, duração, custo, sentimento, classificação, `playbook_version`.
- `call_attempts` — log de toda tentativa de discagem, inclusive as bloqueadas. Base do rate-limit e da auditoria de compliance.

### Compliance
- `dnc_entries` — lista de bloqueio por conta, com motivo e origem.
- `dialing_policies` — janela horária por dia da semana, intervalo mínimo entre tentativas, teto diário por número, texto do aviso de gravação.

### Automação
- `cadences` — sequência de follow-up. `trigger` (`stage_entered` | `no_show` | `meeting_attended` | `manual`) + passos (`offset_hours`, `purpose`).
- `cadence_enrollments` — lead × cadência, passo atual, próximo disparo, histórico.
- `campaigns` / `campaign_targets` — disparo em lote, com concorrência máxima, retentativas e progresso.

### Operação
- `onboarding_state` — progresso da configuração inicial da conta.
- `integration_events` — entregas de webhook e chamadas a provedores, com corpo e status. Depurar telefonia sem isso é adivinhação.
- `audit_log` — quem mudou o quê.

**RLS em tudo**, via duas funções: `is_member(account_id)` e `has_role(account_id, role)`. Nenhuma tabela exposta sem política.

---

## 5. Superfície de backend

Cerca de vinte edge functions. Cada uma faz uma coisa.

### Agente
| Função | Papel |
|---|---|
| `agent-sync` | Compila a persona + o playbook do propósito num agente no provedor: prompt final, voz, parâmetros de fala, modelo, ferramentas declaradas, webhooks e critérios de avaliação. Cria na primeira vez, atualiza nas seguintes. |
| `agent-preview` | Gera áudio de amostra da voz escolhida com texto em PT-BR. |
| `voices-list` | Lista vozes disponíveis, filtradas por PT-BR. |

### Ciclo da chamada
| Função | Papel |
|---|---|
| `call-place` | **Único caminho de discagem.** Aplica o guard, cria a linha em `calls` antes de tocar no provedor, injeta as variáveis do propósito, dispara. Todo dispatcher (manual, cadência, lembrete, resgate, campanha) passa por aqui. |
| `call-init` | Webhook de início de chamada. Devolve ao provedor o contexto daquela ligação específica: quem é o lead, o que já aconteceu, qual reunião está em jogo, qual playbook vale. Em chamada de saída preserva o que o dispatcher mandou; em chamada de entrada identifica o número e monta o contexto. |
| `call-events` | Webhook de fim de chamada. Valida a assinatura e apenas agenda a finalização. Best-effort por natureza. |
| `call-finalize` | **Fonte canônica do pós-chamada.** Idempotente. Puxa transcrição e áudio, grava o áudio no Storage, atualiza a chamada e dispara classificação e sentimento em paralelo. |
| `call-classify` | Rede de segurança: quando o agente não chamou `qualify_lead`, extrai da transcrição etapa, score, briefing e sentimento — com a mesma tabela de mapeamento da ferramenta ao vivo. |
| `call-audio` | Serve a gravação por URL assinada, sem expor credencial do provedor. |
| `call-cancel` | Cancela chamada em fila ou em andamento. |

### Ferramentas do agente (chamadas durante a conversa)
| Ferramenta | Contrato |
|---|---|
| `tool-availability` | Recebe área ou nome do especialista, devolve até N horários livres **já formatados em PT-BR** para leitura em voz alta, cada um com o identificador a ser usado na marcação. |
| `tool-book-meeting` | Marca. Exige identificador de especialista e horário vindos da consulta anterior. Devolve a frase de confirmação pronta. |
| `tool-confirm-meeting` | Confirma presença. Só liberada em `reminder`. |
| `tool-reschedule-meeting` | Remarca ou cancela, com motivo. |
| `tool-qualify-lead` | Registra o lead: etapa, temperatura, sentimento, dor, próxima ação. Pedido de não-contato entra no bloqueio automaticamente. |

Regras que valem para as cinco:
1. Autenticação por segredo compartilhado em header. Sem segredo válido, 401.
2. O identificador da conversa viaja em header/variável de sistema — nunca é o LLM que memoriza UUID.
3. A resposta sempre traz uma frase pronta em PT-BR. O agente lê, não formata data nem inventa horário.
4. Campo não confirmado vai `null`. Inventar dado é o pior defeito possível aqui.
5. São HTTP puro: testáveis por contrato, sem telefonia.

### Crons
| Job | Frequência | Papel |
|---|---|---|
| `cron-meeting-reminder` | 1 min | Reuniões em ~15 min sem lembrete → chamada `reminder`. Idempotente por marca de envio. |
| `cron-meeting-noshow` | 5 min | Reunião passou sem presença → marca, incrementa tentativa, dispara `noshow_rescue`; estourou o limite, move para `lost`. |
| `cron-cadence` | 5 min | Avança inscrições vencidas, dispara o passo, marca sucesso ou erro. |
| `cron-call-recovery` | 2 min | Chamadas sem finalização → chama `call-finalize`. É o que garante que nada se perde quando o webhook falha. |
| `cron-campaign-dispatch` | 1 min | Alimenta campanhas em execução respeitando a concorrência máxima. |

### Configuração
| Função | Papel |
|---|---|
| `integrations-status` | Estado real de cada provedor: crédito, quota consumida, número registrado, agente sincronizado. Alimenta o onboarding e o alerta de saldo. |
| `phone-register` | Registra o número no provedor de voz e o vincula ao agente. |
| `leads-import` | Importação CSV com normalização E.164, checagem de duplicidade e prévia antes de gravar. |

### Módulos compartilhados
`guard` (discagem) · `secrets` (Vault) · `playbook` (composição de prompt) · `leads` (resolução e mapeamento) · `voice-provider` · `telephony` · `logger`.

---

## 6. Os cinco mecanismos que sustentam o produto

### 6.1 Playbook em camadas
O prompt final é montado em três camadas, nesta ordem:

1. **Regras inegociáveis** — identificação, aviso de gravação, frases curtas, nunca prometer preço/prazo/condição, escalar quando o lead se irrita, encerrar quando pedem para não ligar mais.
2. **Roteiro do propósito** — o passo a passo de `discovery`, `reminder`, `noshow_rescue` ou `followup`, incluindo quando chamar cada ferramenta.
3. **Personalidade da conta** — o que o cliente escreve no painel: tom, vocabulário, contexto do negócio.

O cliente edita a camada 3 à vontade e **não consegue quebrar as camadas 1 e 2**. As três vivem em `playbooks`, versionadas, e cada chamada grava a versão que usou.

### 6.2 Guard de discagem
Ponto único, antes de qualquer chamada externa:
normalizar E.164 (padrão BR) → lista de bloqueio → dia e janela horária permitidos →
intervalo mínimo desde a última tentativa → teto diário por número → registrar a tentativa.

Todo bloqueio devolve motivo tipado e mensagem em PT-BR pronta para a interface.
Campanha tem concorrência e teto próprios, então pula os dois últimos — nunca os dois
primeiros.

### 6.3 Dupla via no pós-chamada
Webhook e cron chegam no mesmo `call-finalize`, que é idempotente. O webhook dá
latência baixa; o cron dá garantia. Chamada sem transcrição por falha de webhook é
o defeito mais comum de produto de voz — e some com essas duas linhas de defesa.

### 6.4 Classificação com duas fontes e uma tabela
`tool-qualify-lead` (durante a conversa, confiança alta) e `call-classify` (depois,
a partir da transcrição) escrevem o mesmo resultado usando **a mesma tabela** de
`fase → etapa + score`, com ajuste por temperatura. O que difere é a confiança
registrada, nunca a regra.

### 6.5 Credenciais por conta
Cascata: Vault da conta → configuração do recurso → variável de ambiente global.
Cache curto. Cliente traz a própria chave sem tocar em deploy, e o valor nunca sai
do backend.

---

## 7. Fatias de entrega

Cada fatia termina em algo demonstrável. Nenhuma depende de fatia futura.

**F1 — Fundação**
Auth, multi-tenant com RLS, Vault de credenciais, importação de leads, onboarding
mínimo, `integrations-status`.
*Aceite:* criar conta, salvar credenciais, importar CSV, ver o painel de integrações verde.

**F2 — A ligação**
Agente + `agent-sync`, linha telefônica, `call-place` com guard, `call-init`,
`call-events`, `call-finalize`, `cron-call-recovery`.
*Aceite:* discar do painel, conversar em PT-BR, e em até 1 min ver transcrição e gravação na chamada.

**F3 — O resultado**
`tool-qualify-lead`, kanban de pipeline, `call-classify`, sentimento.
*Aceite:* após a ligação, o lead aparece na etapa certa com score, briefing e sentimento — sem ninguém digitar nada.

**F4 — A agenda**
Especialistas, disponibilidade, bloqueios, `tool-availability`, `tool-book-meeting`, tela de reuniões.
*Aceite:* a Sarah oferece horários reais e marca uma reunião que aparece na agenda.

**F5 — A persistência**
`cron-meeting-reminder`, `tool-confirm-meeting`, `tool-reschedule-meeting`,
`cron-meeting-noshow`, cadências.
*Aceite:* reunião marcada recebe lembrete; falta gera resgate automático; cadência avança sozinha.

**F6 — Escala**
Campanhas em lote, concorrência, retentativa, alertas de saldo e quota.
*Aceite:* campanha de 50 leads roda dentro da janela e da concorrência configuradas, sem estourar quota.

---

## 8. Qualidade

- **Contrato das ferramentas**: as cinco são HTTP. Suíte de testes cobrindo payload válido, campo faltando, segredo inválido, conversa inexistente e horário já ocupado. Roda no CI, sem telefonia.
- **Regras puras testadas**: normalização E.164, janela horária, geração de horários livres, mapeamento fase→etapa. São funções puras; não têm desculpa para não ter teste.
- **Avaliação automática da chamada**: cada ligação é pontuada ao final contra critérios objetivos — avisou da gravação, identificou-se, qualificou de fato, não prometeu condição comercial, respeitou pedido de não-contato. Compliance vira métrica observável, não intenção declarada.
- **Roteiro de aceite manual** por fatia, para o que só o telefone prova.

---

## 9. Decisões em aberto

1. **Hospedagem do frontend** — Coolify (padrão de engenharia da casa) ou o mesmo provedor de borda usado no restante da stack.
2. **Domínio comercial da Sarah** — o que ela oferece, quem é o especialista que recebe a reunião, e o que caracteriza um lead qualificado. Não bloqueia F1 nem F2; bloqueia o playbook de `discovery` e a modelagem de `specialists` na F3/F4.
