-- O expurgo do conteúdo da chamada: o que cron-retention lê e onde marca
-- (seção 4.6, RF-611, RF-807, RNF-09, P-10).
-- Referência: docs/PRD-implementacao.md seção 4.6, docs/revisao-tecnica.md
-- P-10 e R-05, migração 20260923120000_privacidade_da_conta.sql.
--
-- `cron-retention` roda uma vez por dia e apaga a gravação e a transcrição das
-- chamadas cujo prazo de `account_settings.retention_days` venceu. O módulo
-- portável (`cron-retention/expurgo.ts`) decide; esta migração dá a ele o que
-- ler e onde marcar. Quatro decisões:
--
-- 1. **O expurgo tem dois lados, e cada um tem a sua marca** (P-10). O provedor
--    de voz guarda o áudio e a transcrição de cada conversa, e apagar só o
--    arquivo do balde faria a conta acreditar num expurgo que não aconteceu.
--    `purge_storage_at` e `purge_provider_at` são as confirmações de cada lado,
--    gravadas só depois do 2xx daquele lado; é o que faz a execução seguinte
--    não apagar de novo o lado que já saiu.
-- 2. **A marca de expurgo vem depois dos dois 2xx** (R-05 aplicado aqui).
--    `content_purged_at` é gravada no mesmo update que zera `recording_path` e
--    esvazia `transcript`, e só quando os dois lados confirmaram. Marcar antes
--    seria perder o registro do que ainda precisa ser apagado lá fora e manter
--    o dado no provedor.
-- 3. **O que expira é o conteúdo, não o fato.** A linha de `calls` continua,
--    com duração, custo, classificação e `provider_conversation_id`. O
--    identificador fica porque é ele que prova qual conversa foi apagada, e
--    porque sem ele a segunda via do lado do provedor não teria o que pedir.
-- 4. **Nenhuma chamada é tentada para sempre (R-01).** `purge_attempts` conta
--    as passagens que falharam; na quinta a rotina grava `purge_gave_up_at`, a
--    chamada sai da reivindicação e a razão fica em `purge_note` e numa linha
--    da conta em `job_runs`, para apuração manual. Sem teto, uma conversa que o
--    provedor recusa sempre ocuparia uma das 25 vagas diárias para sempre.
--
-- A régua de "fora do prazo" é a de `chamadas_fora_do_prazo` (a tela de
-- privacidade mostra quantas o prazo alcança): terminada, com o fim — ou o
-- início, quando o fim não foi gravado — mais antigo que o prazo. Chamada em
-- curso nunca entra, e `ringing` é em curso (nenhuma borda da F2 grava
-- `in_progress`).
--
-- Só `service_role` executa a reivindicação: quem chama é a rotina, com a chave
-- de serviço.

-- A chamada no expurgo -------------------------------------------------------------
alter table public.calls
  add column content_purged_at timestamptz,
  add column purge_storage_at timestamptz,
  add column purge_provider_at timestamptz,
  add column purge_claimed_at timestamptz,
  add column purge_attempts integer not null default 0
    constraint calls_tentativas_de_expurgo check (purge_attempts >= 0),
  add column purge_note text,
  add column purge_gave_up_at timestamptz;

comment on column public.calls.content_purged_at is
  'A marca de expurgo (RF-807): quando cron-retention apagou a gravação e a transcrição dos dois lados. Gravada só depois do 2xx do Storage e do provedor de voz, no mesmo update que zera recording_path e esvazia transcript. A chamada continua existindo: o que expira é o conteúdo, não o fato.';

comment on column public.calls.purge_storage_at is
  'Quando o Storage confirmou a remoção do arquivo de áudio. Preenchida, a execução seguinte não pede a remoção de novo.';

comment on column public.calls.purge_provider_at is
  'Quando o provedor de voz confirmou a remoção da conversa (P-10). Preenchida, a execução seguinte não pede a remoção de novo.';

comment on column public.calls.purge_claimed_at is
  'Quando cron-retention tomou a chamada pela última vez, com for update skip locked. Ordena a fila: a olhada há mais tempo volta primeiro.';

comment on column public.calls.purge_attempts is
  'Quantas passagens de cron-retention falharam em algum dos dois lados. Na quinta a rotina desiste e registra a razão.';

comment on column public.calls.purge_note is
  'A razão da última falha do expurgo, para apuração manual. Nunca contém conteúdo da conversa.';

comment on column public.calls.purge_gave_up_at is
  'Quando cron-retention desistiu da chamada depois de cinco falhas. Preenchida, a chamada sai da reivindicação; a razão está em purge_note e na linha da conta em job_runs.';

-- A reivindicação ------------------------------------------------------------------
create or replace function public.reivindicar_expurgo(
  p_limite integer,
  p_instante timestamptz
)
returns table (
  id uuid,
  account_id uuid,
  recording_path text,
  recording_expires_at timestamptz,
  provider_conversation_id text,
  purge_storage_at timestamptz,
  purge_provider_at timestamptz,
  purge_attempts integer,
  retention_days integer
)
language plpgsql
set search_path = ''
as $expurgo$
#variable_conflict use_column
begin
  -- 25 é o teto do envelope (_shared/rotinas/execucao.ts, R-02), repetido
  -- aqui como rede.
  return query
    with alvo as (
      select c.id, coalesce(s.retention_days, 90) as dias
        from public.calls as c
        left join public.account_settings as s on s.account_id = c.account_id
       where c.status in ('ended', 'failed')
         and c.content_purged_at is null
         and c.purge_gave_up_at is null
         -- Há o que apagar em algum dos lados. A conversa no provedor conta
         -- mesmo sem transcrição do nosso lado: é lá que P-10 mora.
         and (c.recording_path is not null
              or c.transcript <> '{}'::jsonb
              or c.provider_conversation_id is not null)
         and coalesce(c.ended_at, c.started_at)
             < p_instante - make_interval(days => coalesce(s.retention_days, 90))
         -- Uma hora de folga: a cadência é diária, e só uma execução manual
         -- sobreposta cairia dentro dela.
         and (c.purge_claimed_at is null
              or c.purge_claimed_at <= p_instante - interval '1 hour')
       order by c.purge_claimed_at nulls first, coalesce(c.ended_at, c.started_at), c.id
       for update of c skip locked
       limit least(coalesce(p_limite, 0), 25)
    ),
    tomadas as (
      update public.calls as c
         set purge_claimed_at = p_instante
        from alvo
       where c.id = alvo.id
      returning c.id, c.account_id, c.recording_path, c.recording_expires_at,
                c.provider_conversation_id, c.purge_storage_at, c.purge_provider_at,
                c.purge_attempts, alvo.dias, coalesce(c.ended_at, c.started_at) as fim
    )
    select t.id, t.account_id, t.recording_path, t.recording_expires_at,
           t.provider_conversation_id, t.purge_storage_at, t.purge_provider_at,
           t.purge_attempts, t.dias
      from tomadas as t
     order by t.fim, t.id;
end;
$expurgo$;

comment on function public.reivindicar_expurgo(integer, timestamptz) is
  'Toma até p_limite chamadas terminadas cujo prazo de account_settings.retention_days (padrão 90) venceu e que ainda têm conteúdo em algum dos lados (RF-807, P-10), com for update skip locked, e grava purge_claimed_at. Não devolve a já expurgada, a que desistiu, a em curso nem a tomada há menos de uma hora. Só service_role.';

revoke execute on function public.reivindicar_expurgo(integer, timestamptz) from public;
grant execute on function public.reivindicar_expurgo(integer, timestamptz) to service_role;
