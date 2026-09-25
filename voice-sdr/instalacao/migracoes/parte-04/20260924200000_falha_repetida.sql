-- O item de falha repetida: três tentativas seguidas ao mesmo número sem
-- ninguém atender viram item na fila (L-24, RF-909, RF-915).
-- Referência: docs/PRD-implementacao.md seção 3.8, docs/revisao-tecnica.md
-- L-24 e T-05, docs/PRD.md RF-909 e RF-915.
--
-- Quatro decisões:
--
-- 1. **A tentativa se conta em `call_attempts`, a mesma tabela da guarda**
--    (T-05), e não em `calls`. É a unidade que o teto por número já conta, e é
--    a única que distingue o que saiu do que a guarda recusou. Só `outcome =
--    'placed'` entra: recusa da guarda é decisão nossa, não do interlocutor, e
--    três recusas por fora da janela não dizem nada sobre o número. O sucesso
--    é a chamada que nasceu da tentativa ter sido atendida por gente
--    (`answered_by = 'human'`, a régua da recuperação); caixa postal, ninguém
--    atendeu e tentativa sem chamada são falha. `calls.status` não serve de
--    régua: `ended` vale para a caixa postal, e `failed` é também o que a
--    varredura escreve quando perde o provedor.
-- 2. **O limiar chega por parâmetro**, e quem o declara é
--    `call-finalize/falha-repetida.ts` (`LIMIAR_DE_FALHA_REPETIDA`, o padrão
--    explícito de RF-915). O limiar configurável por conta é da F4, e entra
--    como coluna de `account_settings` lida aqui no lugar do parâmetro.
-- 3. **Um item aberto por número**, pelo único parcial abaixo, e o insert o
--    infere (`on conflict ... do nothing`): duas finalizações simultâneas do
--    mesmo número não abrem dois. Resolvido o item, só contam as tentativas
--    posteriores à resolução: quem resolveu já viu as anteriores, e sem esse
--    corte a finalização seguinte reabriria o item com duas falhas velhas e
--    uma nova.
-- 4. **O número mora em `context.phone_e164`**, porque é por ele que a regra
--    recorta e é ele que o operador precisa ver. A tentativa ancora na chamada
--    que está sendo finalizada: ensaio e ligação recebida não têm tentativa, e
--    saem sem item.

-- Um item aberto por número -----------------------------------------------------
create unique index exception_items_falha_repetida_aberta
  on public.exception_items (account_id, (context->>'phone_e164'))
  where kind = 'repeated_failure' and status = 'aberto';

comment on index public.exception_items_falha_repetida_aberta is
  'Um item de falha repetida aberto por número da conta (RF-909). É o que abrir_item_de_falha_repetida infere no on conflict: duas finalizações simultâneas do mesmo número não abrem dois itens.';

-- O RPC -------------------------------------------------------------------------
create or replace function public.abrir_item_de_falha_repetida(
  p_account_id uuid,
  p_call_id uuid,
  p_limiar integer
)
returns table (situacao text, item_id uuid)
language plpgsql
security definer
set search_path = ''
as $falha$
declare
  v_telefone text;
  v_lead uuid;
  v_ancora timestamptz;
  v_desde timestamptz;
  v_total integer;
  v_falhas integer;
  v_tentativas jsonb;
  v_id uuid;
begin
  if p_limiar is null or p_limiar < 1 then
    raise exception 'limiar_invalido'
      using errcode = '22023',
            detail = format('O limiar é um inteiro positivo; chegou %s.', coalesce(p_limiar::text, 'nulo'));
  end if;

  -- A tentativa que discou esta chamada. Sem ela (ensaio, ligação recebida),
  -- não há o que contar.
  select a.phone_e164, a.lead_id, a.attempted_at
    into v_telefone, v_lead, v_ancora
    from public.call_attempts a
   where a.account_id = p_account_id
     and a.call_id = p_call_id
     and a.outcome = 'placed'
   order by a.attempted_at desc
   limit 1;

  if v_telefone is null then
    return query select 'sem_tentativa'::text, null::uuid;
    return;
  end if;

  select e.id into v_id
    from public.exception_items e
   where e.account_id = p_account_id
     and e.kind = 'repeated_failure'
     and e.status = 'aberto'
     and e.context->>'phone_e164' = v_telefone;

  if v_id is not null then
    return query select 'ja_aberto'::text, v_id;
    return;
  end if;

  select max(e.resolved_at) into v_desde
    from public.exception_items e
   where e.account_id = p_account_id
     and e.kind = 'repeated_failure'
     and e.status = 'resolvido'
     and e.context->>'phone_e164' = v_telefone;

  -- As últimas tentativas que saíram, até a desta chamada e depois da última
  -- resolução. `chamadas_reais` e não `calls`: a tentativa nunca aponta para
  -- ensaio, e a visão diz isso sem precisar de filtro.
  select count(*)::integer,
         count(*) filter (where c.answered_by is distinct from 'human')::integer,
         coalesce(jsonb_agg(u.call_id order by u.attempted_at), '[]'::jsonb)
    into v_total, v_falhas, v_tentativas
    from (
      select a.call_id, a.attempted_at
        from public.call_attempts a
       where a.account_id = p_account_id
         and a.phone_e164 = v_telefone
         and a.outcome = 'placed'
         and a.attempted_at <= v_ancora
         and (v_desde is null or a.attempted_at > v_desde)
       order by a.attempted_at desc, a.id desc
       limit p_limiar
    ) u
    left join public.chamadas_reais c on c.id = u.call_id;

  if v_total < p_limiar or v_falhas < p_limiar then
    return query select 'abaixo_do_limiar'::text, null::uuid;
    return;
  end if;

  insert into public.exception_items (account_id, kind, severity, call_id, lead_id, context)
  values (
    p_account_id,
    'repeated_failure',
    'media',
    p_call_id,
    v_lead,
    jsonb_build_object(
      'phone_e164', v_telefone,
      'call_id', p_call_id,
      'limiar', p_limiar,
      'tentativas', v_tentativas
    )
  )
  on conflict (account_id, (context->>'phone_e164'))
    where kind = 'repeated_failure' and status = 'aberto'
    do nothing
  returning id into v_id;

  if v_id is null then
    select e.id into v_id
      from public.exception_items e
     where e.account_id = p_account_id
       and e.kind = 'repeated_failure'
       and e.status = 'aberto'
       and e.context->>'phone_e164' = v_telefone;
    return query select 'ja_aberto'::text, v_id;
    return;
  end if;

  return query select 'criado'::text, v_id;
end;
$falha$;

comment on function public.abrir_item_de_falha_repetida(uuid, uuid, integer) is
  'Abre o item repeated_failure quando as p_limiar últimas tentativas que saíram ao número desta chamada não foram atendidas por gente (L-24, RF-909, RF-915). Conta em call_attempts, só outcome placed: recusa da guarda não é falha de ligação. Um item aberto por número; resolvido, só contam as tentativas posteriores à resolução. Devolve sem_tentativa, ja_aberto, abaixo_do_limiar ou criado. Só service_role: quem chama é call-finalize.';

revoke execute on function public.abrir_item_de_falha_repetida(uuid, uuid, integer) from public;
grant execute on function public.abrir_item_de_falha_repetida(uuid, uuid, integer) to service_role;
