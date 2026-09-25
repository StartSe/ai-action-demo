-- Gravar a política de discagem com autor e motivo.
-- Referência: docs/PRD.md RF-008, RF-010, RF-421, RF-801 a RF-803, RNF-12 e
-- RNF-13; docs/revisao-tecnica.md L-12 e L-20.
--
-- As colunas já existem desde a migração da política da conta, com os checks e
-- o gatilho de validação da janela. O que faltava é o caminho de escrita da
-- tela `/config/discagem`, e ele é um RPC, não um `update` direto pelo
-- PostgREST, por uma razão só: o motivo. RF-008 pede autor **e** motivo na
-- trilha, e o motivo chega a `registrar_auditoria()` por
-- `set_config('app.audit_reason', ...)` na mesma transação da escrita — o que o
-- cliente não tem como fazer, porque `set_config` não vive em schema exposto.
--
-- A política de update de `account_settings` continua de pé para admin, e o
-- RPC não a substitui: `security definer` desliga a RLS aqui dentro, e o
-- `has_role(..., 'admin')` do corpo é a única barreira que sobra. Não é
-- redundância.
--
-- O QUE O RPC NÃO CONFERE, e é decisão: o limite de simultaneidade do provedor
-- de voz e da telefonia (L-20). O banco não sabe quantas sessões a conta
-- contratou lá fora, e o número muda sem migração nenhuma; quem confere é a
-- tela, lendo `integrations-status`. O que o banco garante é o teto do check da
-- coluna, que vale com ou sem provedor.

create or replace function public.definir_politica_de_discagem(
  p_account_id uuid,
  p_politica jsonb,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $politica$
declare
  -- As chaves são os nomes das colunas, e só estas: o RPC existe para a
  -- política de discagem, e aceitar `routing_mode` ou `recording_enabled` por
  -- aqui abriria outra porta para configuração que tem tela própria.
  c_chaves constant text[] := array[
    'dialing_window',
    'min_interval_minutes',
    'daily_attempts_per_number',
    'daily_calls_cap',
    'daily_spend_cap_cents',
    'max_duration_seconds',
    'max_concurrent'
  ];
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_desconhecidas text[];
  v_resultado jsonb;
begin
  if not public.has_role(p_account_id, 'admin') then
    raise exception 'a política de discagem é definida por quem administra a conta'
      using errcode = '42501';
  end if;

  if v_motivo = '' then
    raise exception 'a mudança da política de discagem precisa de motivo escrito'
      using errcode = '22023',
        hint = 'O motivo vai para a trilha de auditoria junto com o autor (RF-008).';
  end if;

  if p_politica is null or jsonb_typeof(p_politica) <> 'object' then
    raise exception 'a política precisa ser um objeto com as colunas a mudar'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(chave order by chave), array[]::text[])
    into v_desconhecidas
    from jsonb_object_keys(p_politica) as chave
   where chave <> all (c_chaves);

  if cardinality(v_desconhecidas) > 0 then
    raise exception 'a política de discagem não tem: %', array_to_string(v_desconhecidas, ', ')
      using errcode = '22023',
        hint = 'Aceitas: ' || array_to_string(c_chaves, ', ') || '.';
  end if;

  perform set_config('app.audit_reason', v_motivo, true);

  -- Chave ausente é "não mexi"; chave presente com null só faz sentido no teto
  -- de gasto, onde nulo é "sem teto". Nas demais o `not null` da coluna recusa.
  update public.account_settings as s
     set dialing_window = case when p_politica ? 'dialing_window'
           then p_politica -> 'dialing_window' else s.dialing_window end,
         min_interval_minutes = case when p_politica ? 'min_interval_minutes'
           then (p_politica ->> 'min_interval_minutes')::integer else s.min_interval_minutes end,
         daily_attempts_per_number = case when p_politica ? 'daily_attempts_per_number'
           then (p_politica ->> 'daily_attempts_per_number')::smallint else s.daily_attempts_per_number end,
         daily_calls_cap = case when p_politica ? 'daily_calls_cap'
           then (p_politica ->> 'daily_calls_cap')::integer else s.daily_calls_cap end,
         daily_spend_cap_cents = case when p_politica ? 'daily_spend_cap_cents'
           then (p_politica ->> 'daily_spend_cap_cents')::integer else s.daily_spend_cap_cents end,
         max_duration_seconds = case when p_politica ? 'max_duration_seconds'
           then (p_politica ->> 'max_duration_seconds')::integer else s.max_duration_seconds end,
         max_concurrent = case when p_politica ? 'max_concurrent'
           then (p_politica ->> 'max_concurrent')::smallint else s.max_concurrent end
   where s.account_id = p_account_id
  returning jsonb_build_object(
    'dialing_window', s.dialing_window,
    'min_interval_minutes', s.min_interval_minutes,
    'daily_attempts_per_number', s.daily_attempts_per_number,
    'daily_calls_cap', s.daily_calls_cap,
    'daily_spend_cap_cents', s.daily_spend_cap_cents,
    'max_duration_seconds', s.max_duration_seconds,
    'max_concurrent', s.max_concurrent
  ) into v_resultado;

  if v_resultado is null then
    raise exception 'a conta não tem configuração' using errcode = 'P0002';
  end if;

  -- O motivo não pode vazar para a escrita seguinte da mesma transação de quem
  -- chamou: ela entraria na trilha com a razão desta.
  perform set_config('app.audit_reason', '', true);

  return v_resultado;
end;
$politica$;

comment on function public.definir_politica_de_discagem(uuid, jsonb, text) is
  'Grava a política de discagem de account_settings (janela, intervalo, tetos, duração máxima e simultaneidade) com o motivo na trilha (RF-008). Exige admin. Chave ausente não muda a coluna; chave fora da política é recusada. Não confere o limite do provedor (L-20), que é da tela.';

revoke execute on function public.definir_politica_de_discagem(uuid, jsonb, text) from public;
grant execute on function public.definir_politica_de_discagem(uuid, jsonb, text) to authenticated;
