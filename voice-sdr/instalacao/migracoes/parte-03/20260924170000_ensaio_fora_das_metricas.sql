-- O ensaio fora das métricas e das listagens de operação (US-099, T-16).
--
-- **O FILTRO MORA NUM LUGAR SÓ.** `chamadas_reais` é `calls` sem o ensaio, e
-- toda listagem e contagem de operação lê dela. Filtro repetido consulta por
-- consulta é o filtro que a próxima consulta esquece, e o ensaio entra na taxa
-- de atendimento sem ninguém perceber. Quem lê `calls` direto precisa citar
-- `direction` ou estar declarado isento, com a razão, em
-- testes/banco/ensaio-fora-das-metricas.test.ts.
--
-- **`security_invoker = on` NÃO É ENFEITE.** Sem ele a visão roda com os
-- privilégios de quem a criou, que no Supabase passa por cima da RLS de
-- `calls`: todo membro de toda conta leria as chamadas de todas as outras.
--
-- **CUSTO REAL NÃO É MÉTRICA DE OPERAÇÃO.** O ensaio por voz consome crédito
-- do provedor de verdade, e `call_costs` continua recebendo os componentes
-- dele: a fatura não se esconde. O que o ensaio não faz é entrar em taxa de
-- atendimento, tentativas do dia, simultaneidade ou custo por reunião.
--
-- **ENSAIO NÃO CONSOME TETO.** Ele não passa pela guarda nem grava
-- `call_attempts` (`abrir_ensaio` só escreve em `calls` e `rehearsals`), e a
-- simultaneidade da fila passa a contar só chamada real: um ensaio que ficou
-- `in_progress` porque a aba fechou não segura vaga de discagem.

-- chamadas_reais ----------------------------------------------------------------
create view public.chamadas_reais
  with (security_invoker = on)
as
  select c.*
    from public.calls as c
   where c.direction <> 'rehearsal';

comment on view public.chamadas_reais is
  'As chamadas de operação: calls sem direction rehearsal (T-16). Toda listagem e contagem de operação lê daqui. security_invoker = on faz a RLS de calls valer para quem consulta. Custo real e métrica de operação são coisas diferentes: o ensaio por voz gasta crédito do provedor e continua em call_costs, mas não entra em taxa de atendimento, tentativas nem custo por reunião. A ficha de uma chamada de ensaio continua em calls, por id.';

grant select on public.chamadas_reais to authenticated, service_role;

-- A simultaneidade da fila ------------------------------------------------------
-- Reescritas de 20260923140000_despacho_da_fila.sql, iguais exceto pela
-- contagem das chamadas no ar, que passa a ler de `chamadas_reais`.
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
              from public.chamadas_reais as c
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
  'As contas com item pronto na fila, com o freio, o teto de simultaneidade e as chamadas no ar (chamadas_reais em queued, ringing e in_progress, mais item tomado sem chamada). O ensaio não conta. A conta mais antiga primeiro. Só service_role: é a leitura de cron-dial.';

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

  -- O ensaio não ocupa vaga (T-16): conta-se por `chamadas_reais`.
  select
    (select count(*)::integer
       from public.chamadas_reais as c
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
  'Toma até p_limite itens prontos da conta com for update skip locked e os marca claimed (L-14). Trava account_settings da conta e recalcula as vagas contra max_concurrent, contando só chamadas_reais (o ensaio não ocupa vaga), então nunca devolve mais do que cabe; conta parada devolve zero e o item fica queued. Só service_role.';
