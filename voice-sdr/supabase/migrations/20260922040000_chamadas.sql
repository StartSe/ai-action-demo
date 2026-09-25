-- A chamada: a tabela que registra cada ligação, do momento em que ela entra na
-- fila até a finalização (seção 3.5).
-- Referência: docs/PRD-implementacao.md seções 3.5, 3.9 e 4.2,
-- docs/revisao-tecnica.md T-07, T-15, T-20, L-15 e L-23, docs/PRD.md RF-419,
-- RF-418, RF-806 e RF-810.
--
-- Ela chega antes de qualquer função que disque, porque a discagem idempotente
-- é uma propriedade do esquema e não do código que grava. Cinco decisões que a
-- tabela carrega:
--
-- 1. **Único em (account_id, idempotency_key)**, que é a correção de T-07. Sem
--    ele, "não discar duas vezes pela mesma fonte" viraria ler antes de
--    escrever — a mesma corrida que a guarda tem, só que agora com a operadora
--    do outro lado e a conta pagando as duas ligações. Com o único, a segunda
--    tentativa bate na restrição e `call-place` devolve a chamada que já
--    existe. A coluna é `not null` de propósito: nula, o único deixaria passar
--    quantas linhas quisessem, e quem esquecesse de gerar a chave criaria
--    duplicata em silêncio. A chamada de entrada também tem fonte — o
--    identificador que o provedor manda no webhook de início.
-- 2. **`campaign_id` e `cadence_enrollment_id` entram sem chave estrangeira.**
--    `campaigns` é da F7 e `cadence_enrollments` é da F6, e a coluna precisa
--    existir antes porque `call-place` já a recebe. A restrição entra na fatia
--    que criar cada tabela, junto com ela; até lá o banco guarda o
--    identificador sem conferir a existência.
-- 3. **`end_reason` é lista fechada.** Quem escreve são as rotinas de
--    recuperação e as três ferramentas de sistema do provedor (T-02, T-03).
--    Motivo fora da lista não é dado novo, é defeito: significa que alguém
--    escreveu um valor que nenhuma tela sabe traduzir e nenhuma rotina sabe
--    reconhecer.
-- 4. **`transcript_tsv` é coluna gerada, não índice sobre expressão** (L-15,
--    RF-419). A busca por palavra dentro da transcrição é da ficha da chamada e
--    do relatório; sem a coluna, cada busca varreria o `jsonb` de todas as
--    chamadas da conta. A configuração é `portuguese`, e o teste confirma que
--    ela responde no Postgres embarcado dos testes.
-- 5. **Classe Servidor da seção 3.9.** Membro lê; ninguém escreve pelo cliente.
--    Quem grava é `call-place` (a discagem), `call-init` (o início, inclusive o
--    da ligação recebida) e `call-finalize` (o fim). Uma política de insert de
--    cliente daria à conta o poder de inventar uma chamada que nunca houve, com
--    transcrição e custo, e é exatamente isso que a ausência impede.

-- O texto da transcrição -------------------------------------------------------
-- Extrai a fala de cada turno na ordem em que foi dita. `immutable` porque a
-- coluna gerada exige: o Postgres calcula o valor no insert e não volta a
-- perguntar.
--
-- A forma da transcrição é `{"turns": [{"role": ..., "text": ..., "at": ...}]}`,
-- e o `case` é o que faz a função atravessar transcrição vazia, transcrição
-- ainda não puxada e transcrição de forma inesperada sem derrubar o insert da
-- chamada: uma ligação que aconteceu vale mais do que a busca dentro dela.
--
-- Sem `revoke execute from public`, ao contrário das funções que a interface
-- chama por RPC: esta não lê nada do banco, só recorta o argumento que já
-- recebeu, e revogá-la de `public` faria o insert da chamada falhar por falta
-- de privilégio sobre a expressão da coluna gerada.
create or replace function public.texto_da_transcricao(transcricao jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(string_agg(turno->>'text', ' ' order by ordem), '')
    from jsonb_array_elements(
           case
             when jsonb_typeof(transcricao->'turns') = 'array'
               then transcricao->'turns'
             else '[]'::jsonb
           end
         ) with ordinality as t(turno, ordem)
$$;

comment on function public.texto_da_transcricao(jsonb) is
  'Recorta a fala de cada turno da transcrição, na ordem, para a coluna gerada calls.transcript_tsv (L-15, RF-419). Immutable porque coluna gerada exige, e tolerante à forma inesperada porque uma ligação que aconteceu vale mais do que a busca dentro dela.';

-- A chamada ---------------------------------------------------------------------
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- Para quem se ligou. Nulo na ligação recebida de número que ainda não virou
  -- lead e no ensaio, que fala com uma persona e não com gente. Cascata na
  -- exclusão do lead pelo motivo de `consent_records.lead_id`: RF-808 apaga
  -- todos os dados do lead, e a transcrição é o dado mais pessoal que existe
  -- aqui.
  lead_id uuid references public.leads (id) on delete cascade,
  -- Por qual linha. `on delete set null` porque apagar uma linha telefônica é
  -- configuração, e configuração apagada não pode levar o histórico junto —
  -- o número de origem continua em `from_number`, que é o que a ficha mostra.
  phone_line_id uuid references public.phone_lines (id) on delete set null,
  -- Qual publicação do agente atendeu, e com qual versão do playbook. `set
  -- null` pela mesma razão: republicar o agente ou apagar um playbook não pode
  -- apagar a chamada. O que foi dito sobrevive na transcrição.
  agent_publication_id uuid references public.agent_publications (id) on delete set null,
  playbook_version_id uuid references public.playbook_versions (id) on delete set null,
  -- Os quatro propósitos da seção 3.4, os mesmos de `agent_publications`.
  purpose text not null
    check (purpose in ('discovery', 'reminder', 'rescue', 'followup')),
  -- Quem começou a ligação. `rehearsal` é o ensaio da F3, que grava chamada
  -- como qualquer outra para reusar transcrição e avaliação (T-16).
  direction text not null
    check (direction in ('outbound', 'inbound', 'rehearsal')),
  -- Onde a chamada está. `queued` é a fila, `ringing` é o provedor discando,
  -- `in_progress` é a conversa, `ended` é o fim normal e `failed` é o fim sem
  -- conversa. São esses três primeiros que a varredura periódica procura.
  status text not null default 'queued'
    check (status in ('queued', 'ringing', 'in_progress', 'ended', 'failed')),
  -- Os dois identificadores do provedor. O `sid` é da telefonia; o
  -- `conversation_id` é da conversa do agente de voz, e é por ele que as sete
  -- ferramentas resolvem de qual chamada estão falando (seção 4.6).
  provider_call_sid text
    check (provider_call_sid is null or length(btrim(provider_call_sid)) > 0),
  provider_conversation_id text
    check (provider_conversation_id is null or length(btrim(provider_conversation_id)) > 0),
  -- De onde e para onde, em E.164, com a mesma régua de `leads.phone_e164` e de
  -- `phone_lines.e164`. Nulos no ensaio, que não passa pela telefonia.
  from_number text check (from_number ~ '^\+[1-9][0-9]{7,14}$'),
  to_number text check (to_number ~ '^\+[1-9][0-9]{7,14}$'),
  -- A linha do tempo da chamada. `started_at` é quando a linha nasceu, e por
  -- isso tem padrão; os outros dois são fatos que podem não acontecer.
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_sec integer check (duration_sec is null or duration_sec >= 0),
  -- Soma materializada de `call_costs`, por gatilho que chega na US-052. Não se
  -- escreve à mão: valor digitado aqui seria apagado pela próxima parcela de
  -- custo que chegasse, e a conta veria o número mudar sozinho.
  cost_cents integer not null default 0 check (cost_cents >= 0),
  -- A transcrição, como o provedor a devolve, no formato
  -- `{"turns": [{"role": ..., "text": ..., "at": ...}]}`. Objeto, para a forma
  -- não variar entre quem escreve em momentos diferentes.
  transcript jsonb not null default '{}'::jsonb
    check (jsonb_typeof(transcript) = 'object'),
  -- A busca por palavra dentro da conversa (L-15, RF-419), com índice GIN
  -- abaixo. Gerada, e não índice sobre expressão, porque a ficha da chamada
  -- também destaca o trecho encontrado.
  transcript_tsv tsvector generated always as (
    to_tsvector('portuguese', public.texto_da_transcricao(transcript))
  ) stored,
  -- O áudio no Storage e a data do expurgo (RF-807). O caminho é relativo ao
  -- balde; a URL assinada é de `call-audio` e não mora no banco.
  recording_path text
    check (recording_path is null or length(btrim(recording_path)) > 0),
  recording_expires_at timestamptz,
  -- Sentimento da conversa, no intervalo convencional de -1 a 1. Fora dele o
  -- número não se compara com o de outra chamada, que é a única coisa que a
  -- coluna serve para fazer.
  sentiment numeric check (sentiment is null or (sentiment >= -1 and sentiment <= 1)),
  -- O que a chamada concluiu sobre o lead, e de onde veio a conclusão: `tool`
  -- quando `tool-qualify` foi chamada durante a conversa, `backfill` quando
  -- `call-classify` reconstruiu depois. A distinção importa porque a segunda é
  -- inferência sobre a transcrição, não resposta do interlocutor.
  classification jsonb not null default '{}'::jsonb
    check (jsonb_typeof(classification) = 'object'),
  classification_source text
    check (classification_source is null or classification_source in ('tool', 'backfill')),
  -- A avaliação da chamada, que a F3 escreve. Nota de 0 a 10; trocar a escala é
  -- migração, porque nota sem escala declarada não se compara entre chamadas.
  evaluation jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evaluation) = 'object'),
  evaluation_score numeric
    check (evaluation_score is null or (evaluation_score >= 0 and evaluation_score <= 10)),
  -- Quem atendeu (RF-418). `machine` vem da ferramenta de sistema
  -- `voicemail_detection` (T-03); `unknown` é o caso em que a detecção não
  -- respondeu, e vale mais do que fingir `human`.
  answered_by text
    check (answered_by is null or answered_by in ('human', 'machine', 'unknown')),
  -- Por que a chamada terminou. Lista fechada: `completed` é a despedida
  -- normal, `voicemail` é a caixa postal, `max_duration` é o teto de duração da
  -- conta, `dial_lost` e `provider_lost` são as duas perdas que a varredura
  -- periódica fecha, `canceled` é call-cancel ou o freio de emergência,
  -- `no_answer`, `busy` e `invalid_number` vêm da telefonia e `transferred` é a
  -- ferramenta de sistema `transfer_to_number`.
  end_reason text
    check (end_reason is null or end_reason in (
      'completed', 'voicemail', 'max_duration', 'dial_lost', 'provider_lost',
      'canceled', 'no_answer', 'busy', 'invalid_number', 'transferred'
    )),
  -- O instante em que o aviso de gravação foi dado (RF-806, RF-810, L-23).
  -- `call-finalize` o lê da transcrição e grava aqui e em `consent_records`.
  consent_notice_at timestamptz,
  -- De qual campanha e de qual inscrição em cadência. Sem chave estrangeira:
  -- `campaigns` é da F7 e `cadence_enrollments` é da F6. A restrição entra na
  -- fatia que criar cada tabela.
  campaign_id uuid,
  cadence_enrollment_id uuid,
  -- A fonte da discagem, que torna a segunda tentativa da mesma origem um
  -- conflito e não uma ligação (T-07). Ver o único mais abaixo.
  idempotency_key text not null check (length(btrim(idempotency_key)) > 0),
  -- A reivindicação da finalização (T-15). `call-finalize` toma a chamada com
  -- um update condicionado a estas colunas; só quem recebe a linha continua.
  finalize_started_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- O único de T-07. Por conta, porque a chave vem de quem pediu a discagem e
  -- duas contas podem usar a mesma sem se conhecerem.
  constraint calls_idempotencia_unica unique (account_id, idempotency_key)
);

comment on table public.calls is
  'A ligação (seção 3.5). Classe Servidor da seção 3.9: membro lê, ninguém escreve pelo cliente — quem grava é call-place, call-init e call-finalize. O único por (account_id, idempotency_key) é a correção de T-07.';

comment on column public.calls.lead_id is
  'Para quem se ligou. Nulo na ligação recebida de número que ainda não virou lead e no ensaio. Cascata na exclusão do lead porque RF-808 apaga todos os dados dele, e a transcrição é o dado mais pessoal desta tabela.';

comment on column public.calls.phone_line_id is
  'A linha de origem. on delete set null porque apagar configuração não pode levar o histórico junto; o número continua em from_number.';

comment on column public.calls.agent_publication_id is
  'Qual publicação do agente atendeu. on delete set null pela razão de phone_line_id: republicar não pode apagar a chamada.';

comment on column public.calls.playbook_version_id is
  'Com qual versão do playbook a Sarah falou. on delete set null: o que foi dito sobrevive na transcrição.';

comment on column public.calls.status is
  'Onde a chamada está. queued, ringing e in_progress são os três estados que a varredura periódica procura; ended e failed são os dois fins.';

comment on column public.calls.provider_conversation_id is
  'O identificador da conversa no provedor de voz. É por ele que as sete ferramentas resolvem de qual chamada estão falando (seção 4.6), e por isso o único parcial abaixo.';

comment on column public.calls.from_number is
  'Número de origem em E.164, com a mesma régua de leads.phone_e164 e phone_lines.e164. Nulo no ensaio, que não passa pela telefonia.';

comment on column public.calls.to_number is
  'Número de destino em E.164, com a mesma régua de leads.phone_e164. Nulo no ensaio.';

comment on column public.calls.cost_cents is
  'Soma materializada de call_costs, escrita por gatilho a partir da US-052 (T-20). NÃO se escreve à mão: valor digitado aqui seria apagado pela próxima parcela de custo, e a conta veria o número mudar sozinho.';

comment on column public.calls.transcript is
  'A transcrição como o provedor a devolve, no formato {"turns": [{"role", "text", "at"}]}. Objeto, para a forma não variar entre quem escreve em momentos diferentes.';

comment on column public.calls.transcript_tsv is
  'Coluna gerada com configuração portuguese para a busca dentro da transcrição (L-15, RF-419), com índice GIN. Sem ela, cada busca varreria o jsonb de todas as chamadas da conta.';

comment on column public.calls.classification_source is
  'De onde veio a classificação: tool quando tool-qualify foi chamada durante a conversa, backfill quando call-classify reconstruiu depois. A distinção importa porque a segunda é inferência sobre a transcrição, não resposta do interlocutor.';

comment on column public.calls.evaluation_score is
  'Nota da chamada, de 0 a 10, escrita pela F3. Trocar a escala é migração: nota sem escala declarada não se compara entre chamadas.';

comment on column public.calls.answered_by is
  'Quem atendeu (RF-418). machine vem da ferramenta de sistema voicemail_detection (T-03); unknown é a detecção que não respondeu, e vale mais do que fingir human.';

comment on column public.calls.end_reason is
  'Por que a chamada terminou, em lista fechada que as rotinas de recuperação e as ferramentas de sistema escrevem. Motivo fora da lista é defeito, não dado novo: nenhuma tela saberia traduzi-lo e nenhuma rotina saberia reconhecê-lo.';

comment on column public.calls.consent_notice_at is
  'Instante em que o aviso de gravação foi dado (RF-806, RF-810). call-finalize o lê da transcrição e grava aqui e em consent_records (L-23).';

comment on column public.calls.campaign_id is
  'De qual campanha veio a discagem. Sem chave estrangeira por ordem de fatia: campaigns é da F7, e a restrição entra com a tabela.';

comment on column public.calls.cadence_enrollment_id is
  'De qual inscrição em cadência veio a discagem. Sem chave estrangeira por ordem de fatia: cadence_enrollments é da F6, e a restrição entra com a tabela.';

comment on column public.calls.idempotency_key is
  'A fonte da discagem. not null de propósito: nula, o único de T-07 deixaria passar quantas linhas quisessem, e quem esquecesse de gerar a chave criaria duplicata em silêncio. A chamada de entrada usa o identificador que o provedor manda no webhook de início.';

comment on column public.calls.finalize_started_at is
  'Quando alguém reivindicou a finalização (T-15). call-finalize toma a chamada com update condicionado a esta coluna; só quem recebe a linha continua.';

comment on constraint calls_idempotencia_unica on public.calls is
  'A correção de T-07: sem este único, não discar duas vezes pela mesma fonte dependeria de ler antes de escrever, que é a mesma corrida da guarda — só que com a operadora do outro lado e a conta pagando as duas ligações.';

create trigger calls_set_updated_at
  before update on public.calls
  for each row execute function public.set_updated_at();

-- Os índices --------------------------------------------------------------------
-- A lista de chamadas da conta, da mais recente para a mais antiga. É a consulta
-- da tela e a do relatório.
create index calls_lista_da_conta
  on public.calls (account_id, started_at desc);

-- As chamadas que ainda não terminaram. Parcial porque a varredura periódica e o
-- freio de emergência só olham para elas, e o índice inteiro seria quase todo
-- chamada encerrada — o que a consulta nunca quer.
create index calls_em_curso
  on public.calls (account_id, status)
  where status in ('queued', 'ringing', 'in_progress');

comment on index public.calls_em_curso is
  'As chamadas que ainda não terminaram, para a varredura periódica e para o freio de emergência. Parcial porque o índice inteiro seria quase todo chamada encerrada.';

-- A chave pela qual as ferramentas do agente resolvem a chamada. Única e global,
-- e não por conta: o identificador vem do provedor, e duas chamadas com o mesmo
-- fariam a ferramenta escrever na conta errada — que é o pior defeito possível
-- num sistema cujo contrato é o isolamento.
create unique index calls_conversa_do_provedor_unica
  on public.calls (provider_conversation_id)
  where provider_conversation_id is not null;

comment on index public.calls_conversa_do_provedor_unica is
  'A chave pela qual as sete ferramentas resolvem a chamada (seção 4.6). Global e não por conta: duas chamadas com o mesmo identificador fariam a ferramenta escrever na conta errada.';

-- A busca dentro da transcrição (L-15, RF-419).
create index calls_transcricao_busca
  on public.calls using gin (transcript_tsv);

-- Isolamento (classe Servidor da seção 3.9) --------------------------------------
alter table public.calls enable row level security;

create policy calls_leitura_de_membro
  on public.calls for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy calls_leitura_de_membro on public.calls is
  'Classe Servidor: membro lê as chamadas da própria conta, inclusive o viewer. Não há política de insert, update nem delete, nem para o owner, e é esse o ponto da tabela: quem escreve é call-place, call-init e call-finalize. Uma política de insert de cliente daria à conta o poder de inventar uma chamada que nunca houve, com transcrição e custo.';

-- Sem gatilho de auditoria, e a ausência tem razão: `calls` é tabela de
-- servidor, e cada chamada passa por fila, toque, conversa e finalização —
-- dezenas de linhas de trilha por ligação, dizendo o que a própria linha já diz,
-- e nenhuma com autor humano, porque quem escreve é a borda. O que precisa de
-- autor é a decisão de discar, e essa `call-place` registra no lugar certo.

-- O par declarado em 20260922030000_bloqueios.sql ---------------------------------
-- `consent_records.call_id` nasceu sem chave estrangeira porque `calls` só
-- existe aqui. Cascata na exclusão da chamada porque a prova do consentimento é
-- um trecho da transcrição dela: sem a chamada, o registro aponta para nada.
alter table public.consent_records
  add constraint consent_records_call_id_fkey
  foreign key (call_id) references public.calls (id) on delete cascade;

comment on column public.consent_records.call_id is
  'Em qual chamada o aviso foi dado. A chave estrangeira entra na migração de calls, que é onde a tabela nasce. Cascata porque a prova do consentimento é um trecho da transcrição dela.';
