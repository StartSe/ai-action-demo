-- O caminho único para mover lead de etapa (US-128, RF-202, RF-203, RF-205, F4).
--
-- 1. **A etapa se resolve pela chave, nunca pelo rótulo.** A consulta busca
--    (pipeline_id, key) dentro da conta do lead; `label` não entra em `where`
--    nenhum. É isso que faz renomear "Qualificado" para "Tem fit" não quebrar
--    automação (RF-203, terceiro critério de aceite da F4).
-- 2. **Três escritas numa transação**: `leads.stage_id`, `leads.last_activity_at`
--    e o evento `stage_change` em `lead_events`, pelo RPC de evento (nunca por
--    insert direto), com de e para por chave E por rótulo. A linha do tempo
--    mostra o nome de então, e renomear depois não reescreve a história.
-- 3. **Autor.** Com sessão, o autor é `auth.uid()` e o papel mínimo é
--    operator; sem sessão só chega a chave de serviço (a ferramenta e a
--    retaguarda), e aí vale `p_actor`. `agent` é o que o cartão do quadro lê
--    para mostrar o sinal da Sarah (RF-205).
-- 4. **Etapa de desfecho não inventa desfecho.** Mover para `won` ou `lost` é só
--    mover: reunião, ganho e perda apurados são das fatias seguintes (F5, F6),
--    e apurar aqui seria afirmar o que ninguém conferiu.
-- 5. **Recusa por código**, nunca frase: lead_inexistente, lead_de_outra_conta,
--    etapa_inexistente, mesma_etapa (sem segundo evento) e sem_permissao.
--    `lead_de_outra_conta` é o lead que existe numa conta em que a sessão não
--    é membro.

create or replace function public.mover_lead_de_etapa(
  p_lead_id uuid,
  p_stage_key text,
  p_actor text,
  p_actor_id uuid,
  p_motivo text default null
)
returns table (resultado text, stage_id uuid)
language plpgsql
security definer
set search_path = ''
as $mover$
#variable_conflict use_column
declare
  v_conta uuid;
  v_etapa_atual uuid;
  v_funil uuid;
  v_de record;
  v_para record;
  v_chamador uuid := auth.uid();
begin
  select l.account_id, l.stage_id into v_conta, v_etapa_atual
    from public.leads as l where l.id = p_lead_id;

  if v_conta is null then
    return query select 'lead_inexistente'::text, null::uuid;
    return;
  end if;

  if v_chamador is not null then
    if not (select public.is_member(v_conta)) then
      return query select 'lead_de_outra_conta'::text, null::uuid;
      return;
    end if;
    if not (select public.has_role(v_conta, 'operator')) then
      return query select 'sem_permissao'::text, null::uuid;
      return;
    end if;
  elsif p_actor is null or p_actor not in ('user', 'agent', 'system') then
    return query select 'sem_permissao'::text, null::uuid;
    return;
  end if;

  -- O funil é o da etapa atual; lead sem etapa usa o padrão da conta.
  select s.pipeline_id into v_funil from public.pipeline_stages as s where s.id = v_etapa_atual;
  if v_funil is null then
    select p.id into v_funil from public.pipelines as p
     where p.account_id = v_conta and p.is_default;
  end if;

  select s.id, s.key, s.label into v_para
    from public.pipeline_stages as s
   where s.pipeline_id = v_funil and s.account_id = v_conta and s.key = p_stage_key;

  if v_para.id is null then
    return query select 'etapa_inexistente'::text, null::uuid;
    return;
  end if;

  if v_para.id = v_etapa_atual then
    return query select 'mesma_etapa'::text, v_para.id;
    return;
  end if;

  select s.key, s.label into v_de from public.pipeline_stages as s where s.id = v_etapa_atual;

  update public.leads as l
     set stage_id = v_para.id, last_activity_at = now()
   where l.id = p_lead_id;

  perform public.registrar_evento_de_lead(
    p_lead_id,
    'stage_change',
    p_actor,
    case when p_actor = 'system' then null else p_actor_id end,
    p_motivo,
    jsonb_build_object(
      'de', jsonb_build_object('key', v_de.key, 'label', v_de.label),
      'para', jsonb_build_object('key', v_para.key, 'label', v_para.label),
      'motivo', p_motivo
    )
  );

  return query select 'movido'::text, v_para.id;
end;
$mover$;

comment on function public.mover_lead_de_etapa(uuid, text, text, uuid, text) is
  'Único caminho para mover lead de etapa. Resolve a etapa por (funil, key) dentro da conta do lead, nunca por label, e é isso que faz renomear a coluna não quebrar automação (RF-203). Grava stage_id, last_activity_at e o evento stage_change com de e para por chave e rótulo, na mesma transação. Devolve movido, mesma_etapa, lead_inexistente, lead_de_outra_conta, etapa_inexistente ou sem_permissao.';

revoke execute on function public.mover_lead_de_etapa(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.mover_lead_de_etapa(uuid, text, text, uuid, text)
  to authenticated, service_role;
