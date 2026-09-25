-- O convite por e-mail da reunião, para o lead e para o especialista.
-- Referência: docs/PRD.md RF-509, docs/PRD-implementacao.md seção 4.6,
-- docs/revisao-tecnica.md R-05.
--
-- A entrega é registrada por destinatário, na própria linha da reunião: um
-- quarteto de colunas para o lead e outro para o especialista. Os dois lados
-- andam separados porque falham por razões diferentes (lead sem e-mail é caso
-- normal; especialista sempre tem) e porque o convite que já saiu não pode
-- sair de novo quando o outro lado tenta de novo.
--
-- `*_invite_sent_at` só é gravado depois de 2xx do provedor (R-05): marca
-- antes do 2xx é como se perde convite sem ninguém saber. Falha soma a
-- tentativa, grava a frase e agenda a próxima; na tentativa do teto a próxima
-- fica nula, e a tela de reuniões mostra o convite pendente. O teto e o recuo
-- moram no código (`_shared/agenda/convite-de-reuniao.ts`), que é quem decide.
--
-- O convite nasce em `tool-book-meeting`, na mesma requisição do agendamento,
-- e a nova tentativa é de `cron-meeting-invite`, pela reivindicação abaixo.

alter table public.meetings
  add column lead_invite_sent_at timestamptz,
  add column lead_invite_attempts smallint not null default 0 check (lead_invite_attempts >= 0),
  add column lead_invite_error text check (lead_invite_error is null or length(btrim(lead_invite_error)) > 0),
  add column lead_invite_retry_at timestamptz,
  add column specialist_invite_sent_at timestamptz,
  add column specialist_invite_attempts smallint not null default 0 check (specialist_invite_attempts >= 0),
  add column specialist_invite_error text check (
    specialist_invite_error is null or length(btrim(specialist_invite_error)) > 0
  ),
  add column specialist_invite_retry_at timestamptz,
  add column invite_claimed_at timestamptz;

comment on column public.meetings.lead_invite_sent_at is
  'Quando o provedor de e-mail respondeu 2xx ao convite do lead. Nunca antes do 2xx (R-05).';

comment on column public.meetings.lead_invite_attempts is
  'Quantas vezes o envio do convite do lead falhou no provedor. Lead sem e-mail não conta tentativa: não houve envio.';

comment on column public.meetings.lead_invite_error is
  'Por que o convite do lead ainda não saiu, já em português: a falha do provedor traduzida ou a falta de e-mail do lead.';

comment on column public.meetings.lead_invite_retry_at is
  'Quando cron-meeting-invite tenta de novo o convite do lead. Nulo depois do envio e quando as tentativas chegaram ao teto.';

comment on column public.meetings.specialist_invite_sent_at is
  'Quando o provedor de e-mail respondeu 2xx ao convite do especialista. Nunca antes do 2xx (R-05).';

comment on column public.meetings.specialist_invite_attempts is
  'Quantas vezes o envio do convite do especialista falhou no provedor.';

comment on column public.meetings.specialist_invite_error is
  'A frase da última falha ao enviar o convite do especialista, já traduzida: nunca o código do provedor.';

comment on column public.meetings.specialist_invite_retry_at is
  'Quando cron-meeting-invite tenta de novo o convite do especialista. Nulo depois do envio e quando as tentativas chegaram ao teto.';

comment on column public.meetings.invite_claimed_at is
  'Quando cron-meeting-invite tomou a reunião pela última vez. É o que tira a reunião da fila entre a reivindicação e o envio: skip locked só vale dentro da transação da reivindicação, e a ida ao provedor acontece fora dela.';

-- O que a rotina procura: reuniões ativas com algum convite por sair.
create index meetings_convite_pendente
  on public.meetings (starts_at)
  where status in ('scheduled', 'confirmed')
    and (lead_invite_sent_at is null or specialist_invite_sent_at is null);

-- A reivindicação --------------------------------------------------------------
create or replace function public.reivindicar_convites_para_enviar(
  p_limite integer,
  p_instante timestamptz,
  p_teto integer
)
returns setof uuid
language plpgsql
set search_path = ''
as $reivindicacao$
begin
  -- 25 é o teto do envelope (_shared/rotinas/execucao.ts, R-02), repetido
  -- aqui como rede.
  return query
    with alvo as (
      select m.id
        from public.meetings as m
       where m.status in ('scheduled', 'confirmed')
         -- Convite de reunião que já começou não serve a ninguém.
         and m.starts_at > p_instante
         -- Dois minutos para a ferramenta terminar o envio da mesma
         -- requisição do agendamento: sem essa folga, a rotina que caísse no
         -- mesmo segundo mandaria o mesmo convite em paralelo.
         and m.created_at <= p_instante - interval '2 minutes'
         -- Quatro minutos de folga: menos que a cadência de cinco, para a
         -- passagem seguinte retomar a reunião, e mais que uma passagem,
         -- para a sobreposta não pegá-la de novo.
         and (m.invite_claimed_at is null
              or m.invite_claimed_at <= p_instante - interval '4 minutes')
         and (
           (m.lead_invite_sent_at is null
            and m.lead_invite_attempts < p_teto
            and (m.lead_invite_retry_at is null or m.lead_invite_retry_at <= p_instante))
           or
           (m.specialist_invite_sent_at is null
            and m.specialist_invite_attempts < p_teto
            and (m.specialist_invite_retry_at is null or m.specialist_invite_retry_at <= p_instante))
         )
       order by m.starts_at, m.id
       for update of m skip locked
       limit least(coalesce(p_limite, 0), 25)
    )
    update public.meetings as m
       set invite_claimed_at = p_instante
      from alvo
     where m.id = alvo.id
    returning m.id;
end;
$reivindicacao$;

comment on function public.reivindicar_convites_para_enviar(integer, timestamptz, integer) is
  'Toma até p_limite reuniões ativas e futuras com convite por sair (abaixo do teto e com a próxima tentativa vencida), com for update skip locked, e grava invite_claimed_at (seção 4.6). Não devolve a reunião nascida há menos de 2 minutos nem a tomada há menos de 4. Só service_role.';

revoke execute on function public.reivindicar_convites_para_enviar(integer, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.reivindicar_convites_para_enviar(integer, timestamptz, integer) to service_role;

-- Auditoria --------------------------------------------------------------------
-- O convite e suas tentativas são marcas do servidor, como o evento no
-- calendário: cada nova tentativa viraria uma linha de trilha e esconderia as
-- mudanças de gente.
drop trigger meetings_auditoria on public.meetings;

create trigger meetings_auditoria
  after update or delete on public.meetings
  for each row execute function public.registrar_auditoria(
    'account_id',
    'reminder_sent_at',
    'rescue_count',
    'external_event_id',
    'event_attempts',
    'event_error',
    'event_retry_at',
    'lead_invite_sent_at',
    'lead_invite_attempts',
    'lead_invite_error',
    'lead_invite_retry_at',
    'specialist_invite_sent_at',
    'specialist_invite_attempts',
    'specialist_invite_error',
    'specialist_invite_retry_at',
    'invite_claimed_at'
  );

-- Agendamento (seção 4.6) -------------------------------------------------------
-- Cadência da tabela da seção 4.6. O comando é só a chamada a
-- `disparar_rotina`, sem endereço e sem segredo: os dois são lidos de
-- `app_config` e do Vault na hora do disparo (T-26).
select cron.schedule(
  'cron-meeting-invite',
  '*/5 * * * *',
  format('select public.disparar_rotina(%L)', 'cron-meeting-invite')
);
