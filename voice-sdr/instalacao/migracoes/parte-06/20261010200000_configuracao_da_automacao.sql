-- As configurações de automação da conta, com o caminho de escrita da tela
-- (US-190, RF-008).
-- Referência: docs/PRD-implementacao.md seções 3.1 e 3.9, docs/revisao-tecnica.md
-- T-22.
--
-- As colunas da automação da F6 nasceram com as histórias que as leem, cada uma
-- com padrão que já opera e check de faixa:
--
-- | Coluna | Padrão | Quem lê |
-- |---|---|---|
-- | `reminder_window_start_minutes`, `reminder_window_end_minutes` | 5 e 20 | `enfileirar_lembretes_de_reuniao` |
-- | `retry_max_attempts`, `retry_backoff_minutes`, `retry_busy_minutes`, `retry_shifts` | 4, {60,180,1440}, 15, três turnos | `reprogramar_tentativa` |
-- | `rescue_max_attempts`, `rescue_backoff_minutes` | 2 e 1440 | `enfileirar_resgates` |
--
-- O limiar da taxa de apuração e a janela da média móvel do alarme de laço
-- ficam para as histórias que os leem (US-206 e US-187), pela regra de T-22:
-- coluna que ninguém lê promete efeito que não existe.
--
-- O que esta migração acrescenta é a escrita pela tela. É RPC, e não `update`
-- direto, pela razão de `definir_politica_de_discagem`: o motivo (RF-008) só
-- chega a `registrar_auditoria()` por `set_config('app.audit_reason')` na
-- mesma transação, e o cliente não tem como levantá-lo. A política de update de
-- admin em `account_settings` continua de pé e não é recriada; o
-- `has_role(..., 'admin')` do corpo é a barreira que sobra dentro do
-- `security definer`.

create or replace function public.definir_automacao_da_conta(
  p_account_id uuid,
  p_automacao jsonb,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $automacao$
declare
  c_chaves constant text[] := array[
    'reminder_window_start_minutes',
    'reminder_window_end_minutes',
    'retry_max_attempts',
    'retry_backoff_minutes',
    'retry_busy_minutes',
    'retry_shifts',
    'rescue_max_attempts',
    'rescue_backoff_minutes'
  ];
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_desconhecidas text[];
  v_resultado jsonb;
begin
  if not public.has_role(p_account_id, 'admin') then
    raise exception 'a automação é definida por quem administra a conta' using errcode = '42501';
  end if;

  if v_motivo = '' then
    raise exception 'a mudança da automação precisa de motivo escrito'
      using errcode = '22023',
        hint = 'O motivo vai para a trilha de auditoria junto com o autor (RF-008).';
  end if;

  if p_automacao is null or jsonb_typeof(p_automacao) <> 'object' then
    raise exception 'a automação precisa ser um objeto com as colunas a mudar' using errcode = '22023';
  end if;

  select coalesce(array_agg(chave order by chave), array[]::text[])
    into v_desconhecidas
    from jsonb_object_keys(p_automacao) as chave
   where chave <> all (c_chaves);

  if cardinality(v_desconhecidas) > 0 then
    raise exception 'a automação não tem: %', array_to_string(v_desconhecidas, ', ')
      using errcode = '22023',
        hint = 'Aceitas: ' || array_to_string(c_chaves, ', ') || '.';
  end if;

  perform set_config('app.audit_reason', v_motivo, true);

  update public.account_settings as s
     set reminder_window_start_minutes = case when p_automacao ? 'reminder_window_start_minutes'
           then (p_automacao ->> 'reminder_window_start_minutes')::smallint else s.reminder_window_start_minutes end,
         reminder_window_end_minutes = case when p_automacao ? 'reminder_window_end_minutes'
           then (p_automacao ->> 'reminder_window_end_minutes')::smallint else s.reminder_window_end_minutes end,
         retry_max_attempts = case when p_automacao ? 'retry_max_attempts'
           then (p_automacao ->> 'retry_max_attempts')::smallint else s.retry_max_attempts end,
         retry_backoff_minutes = case when p_automacao ? 'retry_backoff_minutes'
           then array(select (v)::integer from jsonb_array_elements_text(p_automacao -> 'retry_backoff_minutes') as v)
           else s.retry_backoff_minutes end,
         retry_busy_minutes = case when p_automacao ? 'retry_busy_minutes'
           then (p_automacao ->> 'retry_busy_minutes')::integer else s.retry_busy_minutes end,
         retry_shifts = case when p_automacao ? 'retry_shifts'
           then p_automacao -> 'retry_shifts' else s.retry_shifts end,
         rescue_max_attempts = case when p_automacao ? 'rescue_max_attempts'
           then (p_automacao ->> 'rescue_max_attempts')::smallint else s.rescue_max_attempts end,
         rescue_backoff_minutes = case when p_automacao ? 'rescue_backoff_minutes'
           then (p_automacao ->> 'rescue_backoff_minutes')::integer else s.rescue_backoff_minutes end
   where s.account_id = p_account_id
  returning jsonb_build_object(
    'reminder_window_start_minutes', s.reminder_window_start_minutes,
    'reminder_window_end_minutes', s.reminder_window_end_minutes,
    'retry_max_attempts', s.retry_max_attempts,
    'retry_backoff_minutes', to_jsonb(s.retry_backoff_minutes),
    'retry_busy_minutes', s.retry_busy_minutes,
    'retry_shifts', s.retry_shifts,
    'rescue_max_attempts', s.rescue_max_attempts,
    'rescue_backoff_minutes', s.rescue_backoff_minutes
  ) into v_resultado;

  if v_resultado is null then
    raise exception 'a conta não tem configuração' using errcode = 'P0002';
  end if;

  perform set_config('app.audit_reason', '', true);
  return v_resultado;
end;
$automacao$;

comment on function public.definir_automacao_da_conta(uuid, jsonb, text) is
  'Grava a automação da F6 em account_settings (janela do lembrete, retentativa por resultado e resgate) com o motivo na trilha (RF-008). Exige admin. Chave ausente não muda a coluna; chave fora da lista é recusada; os checks das colunas recusam valor fora da faixa.';

revoke execute on function public.definir_automacao_da_conta(uuid, jsonb, text) from public;
grant execute on function public.definir_automacao_da_conta(uuid, jsonb, text) to authenticated;
