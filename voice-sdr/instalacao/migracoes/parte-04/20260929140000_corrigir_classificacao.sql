-- A correção humana da classificação, com autor, hora e auditoria (US-130,
-- RF-008, RF-415, F4).
--
-- 1. **Só gente com sessão corrige.** O autor é `auth.uid()`, nunca parâmetro:
--    correção assinada por outro é pior do que correção nenhuma. Execução só
--    para `authenticated`, e o papel mínimo é operator na conta da chamada.
-- 2. **Motivo é obrigatório.** Auditoria sem razão não explica nada meses
--    depois; motivo vazio devolve `classificacao_invalida`.
-- 3. **A trava da US-129 é a fronteira.** Este RPC é o único escritor que passa
--    por ela, levantando `app.corrigindo_classificacao` e derrubando o
--    parâmetro antes de devolver. Qualquer update seguinte, inclusive da
--    retaguarda, não altera o que a correção gravou.
-- 4. **Correção que muda a etapa move o lead** pelo RPC mover_lead_de_etapa,
--    por `stage_key`, na mesma transação. Com sessão, o autor do evento é quem
--    corrigiu.
-- 5. **calls não tem gatilho de auditoria** (SEM_AUDITORIA, classe Servidor),
--    então a trilha é insert direto em audit_log com o motivo em `reason`, e o
--    motivo também vai para `app.audit_reason`, que o gatilho de `leads`
--    e de lead_events leem se houver.

create or replace function public.corrigir_classificacao(
  p_call_id uuid,
  p_classificacao jsonb,
  p_motivo text
)
returns text
language plpgsql
security definer
set search_path = ''
as $corrigir$
declare
  v_conta uuid;
  v_lead uuid;
  v_antes jsonb;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_etapa text;
  v_movido text;
begin
  select c.account_id, c.lead_id, c.classification into v_conta, v_lead, v_antes
    from public.calls as c where c.id = p_call_id
     for update;

  if v_conta is null then
    return 'chamada_inexistente';
  end if;

  if not (select public.is_member(v_conta)) then
    return 'chamada_de_outra_conta';
  end if;

  if not (select public.has_role(v_conta, 'operator')) then
    return 'sem_permissao';
  end if;

  if p_classificacao is null or jsonb_typeof(p_classificacao) <> 'object' or v_motivo is null then
    return 'classificacao_invalida';
  end if;

  v_etapa := p_classificacao ->> 'stage_key';
  if v_etapa is not null and not exists (
    select 1 from public.pipeline_stages as s where s.account_id = v_conta and s.key = v_etapa
  ) then
    return 'classificacao_invalida';
  end if;

  perform set_config('app.audit_reason', v_motivo, true);
  perform set_config('app.corrigindo_classificacao', 'on', true);

  update public.calls
     set classification = p_classificacao,
         classification_source = 'human',
         classification_confidence = null,
         classification_corrected_by = auth.uid(),
         classification_corrected_at = now()
   where id = p_call_id;

  perform set_config('app.corrigindo_classificacao', '', true);

  insert into public.audit_log (account_id, actor, actor_id, source, action, target_type, target_id, reason, payload)
  values (v_conta, 'user', auth.uid(), 'rpc:corrigir_classificacao', 'correct_classification', 'calls',
          p_call_id, v_motivo, jsonb_build_object('antes', v_antes, 'depois', p_classificacao));

  if v_etapa is not null and v_lead is not null then
    select m.resultado into v_movido
      from public.mover_lead_de_etapa(v_lead, v_etapa, 'user', auth.uid(), v_motivo) as m;
  end if;

  return 'corrigida';
end;
$corrigir$;

comment on function public.corrigir_classificacao(uuid, jsonb, text) is
  'Correção humana da classificação (RF-415): grava classification, source human, autor auth.uid() e instante, anula a confiança, escreve audit_log com o motivo e, quando a etapa muda, move o lead por mover_lead_de_etapa pela chave. Motivo vazio é classificacao_invalida. Devolve corrigida, chamada_inexistente, chamada_de_outra_conta, sem_permissao ou classificacao_invalida. Só authenticated executa.';

revoke execute on function public.corrigir_classificacao(uuid, jsonb, text) from public, anon, service_role;
grant execute on function public.corrigir_classificacao(uuid, jsonb, text) to authenticated;
