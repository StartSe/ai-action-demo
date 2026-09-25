-- O bloqueio pedido dentro da chamada e o item de fila que nasce de ferramenta.
-- Referência: docs/PRD-implementacao.md seções 3.6, 3.8 e 5, docs/revisao-tecnica.md
-- T-02, L-24 e R-02, docs/PRD.md RF-805 e RF-422.
--
-- Duas funções, as duas `security definer` com execução só para `service_role`,
-- porque quem as chama é a borda com a chave de serviço:
--
-- 1. **`bloquear_numero_pela_ferramenta`** é a escrita de `tool-dnc`. O único
--    parcial de `dnc_entries` é o que absorve o pedido repetido na mesma
--    chamada, e ele só se alcança por `on conflict ... where removed_at is null`:
--    o `upsert` do PostgREST não repete o predicado do índice, e sem o
--    predicado o Postgres não infere índice parcial nenhum. A função devolve o
--    instante do bloqueio vigente e se foi ela quem o criou; é pelo `criado` que
--    a ferramenta decide abrir o item da fila uma vez só.
-- 2. **`criar_excecao`** é o caminho de L-24: o item que nasce de ferramenta
--    (`tool-dnc`, `tool-transfer`, falha repetida) entra por aqui, e não pela
--    política de insert do cliente, que é só a inclusão manual do operador.
--    Grant só para `service_role` é o que impede uma sessão comum de fabricar
--    item de fila em nome da Sarah. A resolução (`resolver_excecao`) é a irmã
--    que chega com a tela da fila (US-116).

-- O bloqueio pela ferramenta ------------------------------------------------------
create or replace function public.bloquear_numero_pela_ferramenta(
  p_account_id uuid,
  p_phone_e164 text,
  p_source text,
  p_reason text,
  p_notes text,
  p_blocked_at timestamptz
)
returns table (blocked_at timestamptz, criado boolean)
language plpgsql
security definer
set search_path = ''
as $bloquear$
declare
  v_instante timestamptz;
begin
  -- Só as duas origens que acontecem dentro da chamada. `manual` e `import`
  -- têm autor humano e caminho próprio; aceitá-las aqui daria à borda um jeito
  -- de gravar bloqueio com a origem de outra pessoa.
  if p_source is null or p_source not in ('lead_request', 'wrong_number') then
    raise exception 'origem_invalida'
      using errcode = '22023',
            detail = format('A ferramenta grava lead_request ou wrong_number; chegou %s.', coalesce(p_source, 'nula'));
  end if;

  insert into public.dnc_entries (account_id, phone_e164, reason, source, notes, created_at)
  values (
    p_account_id,
    p_phone_e164,
    p_reason,
    p_source,
    nullif(btrim(coalesce(p_notes, '')), ''),
    coalesce(p_blocked_at, now())
  )
  on conflict (account_id, phone_e164) where removed_at is null do nothing
  returning public.dnc_entries.created_at into v_instante;

  if v_instante is not null then
    return query select v_instante, true;
    return;
  end if;

  -- Já havia bloqueio ativo: o instante devolvido é o dele, e a linha não muda.
  select d.created_at into v_instante
    from public.dnc_entries d
   where d.account_id = p_account_id
     and d.phone_e164 = p_phone_e164
     and d.removed_at is null;

  return query select v_instante, false;
end;
$bloquear$;

comment on function public.bloquear_numero_pela_ferramenta(uuid, text, text, text, text, timestamptz) is
  'Escrita de tool-dnc durante a chamada (RF-805). Insere em dnc_entries com on conflict no único parcial de bloqueio ativo, que é o que torna o pedido repetido idempotente: devolve o created_at do bloqueio vigente e criado = false, sem segunda linha e sem alterar a primeira. Só aceita lead_request e wrong_number. Execução só para service_role.';

revoke execute on function public.bloquear_numero_pela_ferramenta(uuid, text, text, text, text, timestamptz) from public;
grant execute on function public.bloquear_numero_pela_ferramenta(uuid, text, text, text, text, timestamptz) to service_role;

-- O item de fila que nasce de ferramenta ------------------------------------------
create or replace function public.criar_excecao(
  p_account_id uuid,
  p_kind text,
  p_severity text,
  p_call_id uuid,
  p_lead_id uuid,
  p_context jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $criar$
declare
  v_id uuid;
begin
  -- Gênero, severidade e contexto são conferidos pelos checks da tabela, e a
  -- chamada e o lead pela chave composta com a conta: um item não se pendura
  -- em chamada de outra conta nem por aqui.
  insert into public.exception_items (account_id, kind, severity, call_id, lead_id, context)
  values (
    p_account_id,
    p_kind,
    coalesce(p_severity, 'media'),
    p_call_id,
    p_lead_id,
    coalesce(p_context, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$criar$;

comment on function public.criar_excecao(uuid, text, text, uuid, uuid, jsonb) is
  'Cria item na fila de exceções pelo caminho das ferramentas (L-24): tool-dnc, tool-transfer e falha repetida. Execução só para service_role, para o cliente não fabricar item em nome da Sarah; a inclusão manual do operador continua pela política de insert.';

revoke execute on function public.criar_excecao(uuid, text, text, uuid, uuid, jsonb) from public;
grant execute on function public.criar_excecao(uuid, text, text, uuid, uuid, jsonb) to service_role;
