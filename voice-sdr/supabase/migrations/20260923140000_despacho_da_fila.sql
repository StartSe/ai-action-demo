-- O consumidor da fila: o que `cron-dial` lê e como ele toma o item (L-14,
-- seção 4.6, RF-011).
-- Referência: docs/PRD-implementacao.md seções 3.7 e 4.6,
-- docs/revisao-tecnica.md L-14, T-04 e R-02, migração
-- 20260922080000_fila_de_discagem.sql.
--
-- Três peças, e as três existem porque a regra só vale se o banco a medir:
--
-- 1. **`dial_queue.failures`** conta as falhas transitórias do item. É o que
--    dá recuo crescente sem mexer em `attempt`: `attempt` é metade do único de
--    R-09 e significa "discagem nova" (RF-417), e reprogramar o mesmo item
--    depois de um erro de rede não é discagem nova.
-- 2. **`situacao_da_fila(instante)`**: as contas com item pronto, com o freio,
--    o teto de simultaneidade e quantas chamadas estão no ar. A simultaneidade
--    se mede no dado — `calls` em `queued`, `ringing` e `in_progress`, mais o
--    item já tomado que ainda não virou chamada —, nunca em memória: a rotina
--    roda a cada minuto e pode se sobrepor à anterior, e a memória de uma
--    passagem não enxerga o que a outra discou.
-- 3. **`reivindicar_da_fila(conta, limite, instante)`**: toma até `limite`
--    itens da conta com `for update skip locked` e os marca `claimed` na mesma
--    instrução. Antes, trava a linha de `account_settings` da conta e recalcula
--    as vagas: duas passagens sobrepostas que leram a mesma situação chegam
--    aqui em fila, e a segunda vê o que a primeira acabou de tomar. A decisão
--    de quantos pedir é do módulo portável; esta função é a rede embaixo, e
--    nunca devolve mais do que cabe. Conta parada devolve zero, e o item fica
--    `queued` (é o par de `_shared/discagem/pausa.ts`).
--
-- As duas funções são da rotina, com a chave de serviço, e de mais ninguém:
-- `revoke` de `public` e `grant` só a `service_role`. Com `authenticated`,
-- tomar item da fila seria discar por fora de `cron-dial`.

alter table public.dial_queue
  add column failures integer not null default 0
    constraint dial_queue_falhas_nao_negativas check (failures >= 0);

comment on column public.dial_queue.failures is
  'Quantas falhas transitórias o item já teve (rede, provedor fora, configuração faltando). Dá o recuo crescente de cron-dial sem mexer em attempt, que é metade do único de R-09 e quer dizer discagem nova.';

create or replace function public.situacao_da_fila(p_instante timestamptz)
returns table (
  account_id uuid,
  dialing_paused_at timestamptz,
  max_concurrent smallint,
  ativas integer,
  primeira_pronta timestamptz
)
language sql
stable
set search_path = ''
as $situacao$
  select q.account_id,
         a.dialing_paused_at,
         s.max_concurrent,
         (
           (select count(*)::integer
              from public.calls as c
             where c.account_id = q.account_id
               and c.status in ('queued', 'ringing', 'in_progress'))
           +
           (select count(*)::integer
              from public.dial_queue as t
             where t.account_id = q.account_id
               and t.status = 'claimed'
               and t.call_id is null)
         ) as ativas,
         min(q.run_at) as primeira_pronta
    from public.dial_queue as q
    join public.accounts as a on a.id = q.account_id
    join public.account_settings as s on s.account_id = q.account_id
   where q.status = 'queued'
     and q.run_at <= p_instante
   group by q.account_id, a.dialing_paused_at, s.max_concurrent
   order by min(q.run_at), q.account_id
$situacao$;

comment on function public.situacao_da_fila(timestamptz) is
  'As contas com item pronto na fila, com o freio, o teto de simultaneidade e as chamadas no ar (calls em queued, ringing e in_progress, mais item tomado sem chamada). A conta mais antiga primeiro. Só service_role: é a leitura de cron-dial.';

revoke execute on function public.situacao_da_fila(timestamptz) from public;
grant execute on function public.situacao_da_fila(timestamptz) to service_role;

create or replace function public.reivindicar_da_fila(
  p_account_id uuid,
  p_limite integer,
  p_instante timestamptz
)
returns setof public.dial_queue
language plpgsql
set search_path = ''
as $reivindicacao$
declare
  v_teto smallint;
  v_parada timestamptz;
  v_ativas integer;
  v_vagas integer;
begin
  -- A trava da conta serializa as passagens sobrepostas: a segunda espera a
  -- primeira terminar a tomada e então conta o que ela tomou. A espera é curta
  -- (só a instrução de baixo), e é o preço de o teto valer com duas passagens.
  select s.max_concurrent into v_teto
    from public.account_settings as s
   where s.account_id = p_account_id
     for update;
  if v_teto is null then
    return;
  end if;

  select a.dialing_paused_at into v_parada
    from public.accounts as a
   where a.id = p_account_id;
  if v_parada is not null then
    return;
  end if;

  select
    (select count(*)::integer
       from public.calls as c
      where c.account_id = p_account_id
        and c.status in ('queued', 'ringing', 'in_progress'))
    +
    (select count(*)::integer
       from public.dial_queue as t
      where t.account_id = p_account_id
        and t.status = 'claimed'
        and t.call_id is null)
    into v_ativas;

  -- 25 é o teto do envelope (_shared/rotinas/execucao.ts, R-02), repetido aqui
  -- como rede: pedido maior não passa nem se o módulo errar a conta.
  v_vagas := least(coalesce(p_limite, 0), v_teto - v_ativas, 25);
  if v_vagas <= 0 then
    return;
  end if;

  return query
    with alvo as (
      select q.id
        from public.dial_queue as q
       where q.account_id = p_account_id
         and q.status = 'queued'
         and q.run_at <= p_instante
       order by q.run_at, q.id
       for update skip locked
       limit v_vagas
    )
    update public.dial_queue as q
       set status = 'claimed',
           claimed_at = now()
      from alvo
     where q.id = alvo.id
    returning q.*;
end;
$reivindicacao$;

comment on function public.reivindicar_da_fila(uuid, integer, timestamptz) is
  'Toma até p_limite itens prontos da conta com for update skip locked e os marca claimed (L-14). Trava account_settings da conta e recalcula as vagas contra max_concurrent, então nunca devolve mais do que cabe; conta parada devolve zero e o item fica queued. Só service_role.';

revoke execute on function public.reivindicar_da_fila(uuid, integer, timestamptz) from public;
grant execute on function public.reivindicar_da_fila(uuid, integer, timestamptz) to service_role;
