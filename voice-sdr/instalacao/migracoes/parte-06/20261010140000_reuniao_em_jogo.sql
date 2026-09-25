-- A reunião em jogo numa chamada de lembrete ou de resgate (US-194 a US-196,
-- RF-601 a RF-604, seção 5: "o meeting_id vem do contexto da chamada, nunca da
-- conversa").
--
-- `call-init` diz o motivo da ligação com o horário da reunião, e
-- `tool-confirm-meeting` e `tool-reschedule` agem sobre ela. Os três precisam
-- da mesma resposta para a mesma pergunta, e por isso ela é uma função só:
--
-- 1. **Primeiro a fila.** A chamada que saiu de um item `rem` ou `rescue`
--    carrega a reunião no `source_ref` (T-07: `rem:{reunião}`,
--    `rescue:{reunião}:{n}`). É a reunião que a rotina escolheu lembrar, e é
--    ela que vale, mesmo que o lead tenha outra.
-- 2. **Depois o lead.** Chamada de lembrete discada à mão não passou pela fila:
--    vale a reunião ativa do lead (`meetings_one_active_per_lead` garante que é
--    uma só).
-- 3. **Sempre na conta da chamada.** A reunião de outra conta não é devolvida
--    nem pela fila, porque o join exige a mesma conta.
--
-- O fuso do lead é o dele, senão o da conta, como em toda fala de horário.
-- Só service_role executa: quem chama são as bordas, com a chave de serviço.

create or replace function public.reuniao_em_jogo(p_call_id uuid)
returns table (
  meeting_id uuid,
  account_id uuid,
  lead_id uuid,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  modality text,
  specialist_id uuid,
  specialist_name text,
  specialist_timezone text,
  lead_timezone text
)
language plpgsql
stable
security definer
set search_path = ''
as $reuniao$
#variable_conflict use_column
declare
  v_chamada public.calls;
  v_reuniao uuid;
begin
  select c.* into v_chamada from public.calls as c where c.id = p_call_id;
  if not found then
    return;
  end if;

  select split_part(q.source_ref, ':', 1)::uuid
    into v_reuniao
    from public.dial_queue as q
   where q.call_id = p_call_id
     and q.source in ('rem', 'rescue')
     and split_part(q.source_ref, ':', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   order by q.attempt desc
   limit 1;

  if v_reuniao is null and v_chamada.lead_id is not null then
    select m.id into v_reuniao
      from public.meetings as m
     where m.lead_id = v_chamada.lead_id
       and m.account_id = v_chamada.account_id
       and m.status in ('scheduled', 'confirmed')
     limit 1;
  end if;

  if v_reuniao is null then
    return;
  end if;

  return query
  select m.id, m.account_id, m.lead_id, m.status, m.starts_at, m.ends_at, m.modality,
         s.id, s.name, s.timezone,
         coalesce(nullif(btrim(l.timezone), ''), a.timezone)
    from public.meetings as m
    join public.specialists as s on s.id = m.specialist_id
    join public.accounts as a on a.id = m.account_id
    left join public.leads as l on l.id = m.lead_id
   where m.id = v_reuniao
     and m.account_id = v_chamada.account_id;
end;
$reuniao$;

comment on function public.reuniao_em_jogo(uuid) is
  'A reunião de uma chamada de lembrete ou resgate: a do item rem/rescue da fila que discou, senão a reunião ativa do lead, sempre na conta da chamada. Devolve horário, modalidade, especialista e o fuso do lead (o dele, senão o da conta). Só service_role.';

revoke execute on function public.reuniao_em_jogo(uuid) from public;
grant execute on function public.reuniao_em_jogo(uuid) to service_role;
