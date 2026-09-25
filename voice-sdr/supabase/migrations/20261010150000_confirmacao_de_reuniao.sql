-- A confirmação de presença na ligação de lembrete (RF-602, US-195, segundo
-- critério de aceite da F6).
-- Referência: docs/PRD-implementacao.md seções 3.3 e 5, docs/revisao-tecnica.md
-- T-01, T-16 e T-23.
--
-- `tool-confirm-meeting` chama esta função quando o lead diz que vai. Três
-- decisões:
--
-- 1. **A reunião vem da chamada, nunca da conversa.** A função recebe a conta
--    que o segredo da ferramenta provou e a chamada do cabeçalho, e resolve a
--    reunião por `reuniao_em_jogo`. Chamada de outra conta não confirma nada:
--    a conferência de conta vem antes de qualquer leitura da reunião.
-- 2. **A confirmação é o `update ... where status = 'scheduled' returning`.**
--    Confirmar duas vezes na mesma chamada deixa um `confirmed_at` só, o
--    primeiro, e a segunda volta `ja_confirmada` sem segundo evento no lead.
--    Verificar o status e depois gravar deixaria duas invocações simultâneas
--    gravarem as duas.
-- 3. **`confirmed_call_id` é a chamada do cabeçalho** (T-23): é o que liga a
--    reunião à ligação que a confirmou, no custo por reunião.
--
-- O evento no lead é `automation` com `acao: 'reuniao_confirmada'`, pelo RPC
-- de evento, com `actor = 'agent'`: foi a assistente que ouviu a confirmação.

create or replace function public.confirmar_reuniao(
  p_account_id uuid,
  p_call_id uuid,
  p_agora timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $confirmar$
declare
  v_conta_da_chamada uuid;
  v_reuniao record;
  v_lead uuid;
begin
  select c.account_id into v_conta_da_chamada from public.calls as c where c.id = p_call_id;
  if v_conta_da_chamada is null or v_conta_da_chamada <> p_account_id then
    return jsonb_build_object('resultado', 'sem_reuniao');
  end if;

  select r.* into v_reuniao from public.reuniao_em_jogo(p_call_id) as r;
  if v_reuniao.meeting_id is null then
    return jsonb_build_object('resultado', 'sem_reuniao');
  end if;

  update public.meetings as m
     set status = 'confirmed',
         confirmed_at = p_agora,
         confirmed_call_id = p_call_id
   where m.id = v_reuniao.meeting_id
     and m.account_id = p_account_id
     and m.status = 'scheduled'
  returning m.lead_id into v_lead;

  if found then
    if v_lead is not null then
      perform public.registrar_evento_de_lead(
        v_lead,
        'automation',
        'agent',
        null,
        null,
        jsonb_build_object('acao', 'reuniao_confirmada', 'meeting_id', v_reuniao.meeting_id, 'call_id', p_call_id)
      );
    end if;
    return jsonb_build_object(
      'resultado', 'confirmada',
      'meeting_id', v_reuniao.meeting_id,
      'starts_at', v_reuniao.starts_at
    );
  end if;

  return jsonb_build_object(
    'resultado', case when v_reuniao.status = 'confirmed' then 'ja_confirmada' else 'status_nao_elegivel' end,
    'meeting_id', v_reuniao.meeting_id,
    'status', v_reuniao.status,
    'starts_at', v_reuniao.starts_at
  );
end;
$confirmar$;

comment on function public.confirmar_reuniao(uuid, uuid, timestamptz) is
  'RF-602: confirma a reunião em jogo da chamada (status confirmed, confirmed_at, confirmed_call_id) por update where status = scheduled returning, com evento automation reuniao_confirmada no lead. Devolve confirmada, ja_confirmada, status_nao_elegivel ou sem_reuniao. Chamada de outra conta é sem_reuniao. Só service_role.';

revoke execute on function public.confirmar_reuniao(uuid, uuid, timestamptz) from public;
grant execute on function public.confirmar_reuniao(uuid, uuid, timestamptz) to service_role;
