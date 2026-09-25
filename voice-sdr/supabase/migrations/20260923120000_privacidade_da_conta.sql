-- Privacidade da conta: gravação, aviso e retenção, gravados pelo dono.
-- Referência: docs/PRD.md RF-008, RF-806 e RF-807; docs/revisao-tecnica.md
-- L-18 e P-10.
--
-- As três colunas existem desde a migração da política da conta. Esta migração
-- entrega o que a tela `/config/privacidade` precisa e o banco ainda não tinha:
--
-- 1. **Quem altera é o dono.** A política de update de `account_settings` é de
--    admin, porque o resto da tabela é configuração. Privacidade é da classe
--    Dono da matriz 3.9: desligar a gravação ou encurtar a retenção muda o que
--    a conta guarda sobre cada lead, e o expurgo não se desfaz. Uma segunda
--    política não resolveria — políticas permissivas somam, e a de admin
--    continuaria deixando passar. Quem segura é um gatilho `before update`
--    que recusa a mudança dessas três colunas a quem tem sessão e não é dono.
--    Sem sessão (`auth.uid()` nulo) é o servidor, e ele passa.
-- 2. **Motivo na trilha (RF-008).** Como a política de discagem, a escrita é
--    um RPC que levanta `app.audit_reason` antes do `update`.
-- 3. **Quantas chamadas o prazo novo alcança.** `chamadas_fora_do_prazo` conta
--    o que a próxima execução diária do expurgo apagaria com um prazo dado. A
--    regra mora aqui, e não na tela, para `cron-retention` (US-080) aplicar a
--    mesma: dois critérios de "fora do prazo" dariam à tela um número e ao
--    expurgo outro.

-- Guarda do dono ----------------------------------------------------------------------
create or replace function public.guardar_privacidade_do_dono()
returns trigger
language plpgsql
set search_path = ''
as $guarda$
begin
  if (new.recording_enabled, new.recording_notice_text, new.retention_days)
       is not distinct from
     (old.recording_enabled, old.recording_notice_text, old.retention_days) then
    return new;
  end if;

  if auth.uid() is not null and not public.has_role(old.account_id, 'owner') then
    raise exception 'a privacidade da conta é definida pelo dono'
      using errcode = '42501',
        hint = 'Gravação, aviso e retenção são da classe Dono (RF-806, RF-807).';
  end if;

  return new;
end;
$guarda$;

comment on function public.guardar_privacidade_do_dono() is
  'Recusa a quem tem sessão e não é dono a mudança de recording_enabled, recording_notice_text e retention_days. Sem sessão é o servidor, que passa. É gatilho e não política porque a política de update de admin continuaria somando.';

create trigger account_settings_privacidade_do_dono
  before update of recording_enabled, recording_notice_text, retention_days
  on public.account_settings
  for each row execute function public.guardar_privacidade_do_dono();

-- Escrita com motivo ------------------------------------------------------------------
create or replace function public.definir_privacidade(
  p_account_id uuid,
  p_privacidade jsonb,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $privacidade$
declare
  c_chaves constant text[] := array[
    'recording_enabled',
    'recording_notice_text',
    'retention_days'
  ];
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_desconhecidas text[];
  v_resultado jsonb;
begin
  -- `security definer` desliga a RLS aqui dentro, e este `has_role` é a
  -- primeira barreira. O gatilho do dono é a segunda, e vale para quem vier
  -- por `update` direto.
  if not public.has_role(p_account_id, 'owner') then
    raise exception 'a privacidade da conta é definida pelo dono'
      using errcode = '42501';
  end if;

  if v_motivo = '' then
    raise exception 'a mudança de privacidade precisa de motivo escrito'
      using errcode = '22023',
        hint = 'O motivo vai para a trilha de auditoria junto com o autor (RF-008).';
  end if;

  if p_privacidade is null or jsonb_typeof(p_privacidade) <> 'object' then
    raise exception 'a privacidade precisa ser um objeto com as colunas a mudar'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(chave order by chave), array[]::text[])
    into v_desconhecidas
    from jsonb_object_keys(p_privacidade) as chave
   where chave <> all (c_chaves);

  if cardinality(v_desconhecidas) > 0 then
    raise exception 'a privacidade não tem: %', array_to_string(v_desconhecidas, ', ')
      using errcode = '22023',
        hint = 'Aceitas: ' || array_to_string(c_chaves, ', ') || '.';
  end if;

  perform set_config('app.audit_reason', v_motivo, true);

  -- Chave ausente é "não mexi". Aviso nulo é "a frase da camada 1", que é o
  -- padrão da coluna; o check dela recusa o texto em branco.
  update public.account_settings as s
     set recording_enabled = case when p_privacidade ? 'recording_enabled'
           then (p_privacidade ->> 'recording_enabled')::boolean else s.recording_enabled end,
         recording_notice_text = case when p_privacidade ? 'recording_notice_text'
           then p_privacidade ->> 'recording_notice_text' else s.recording_notice_text end,
         retention_days = case when p_privacidade ? 'retention_days'
           then (p_privacidade ->> 'retention_days')::integer else s.retention_days end
   where s.account_id = p_account_id
  returning jsonb_build_object(
    'recording_enabled', s.recording_enabled,
    'recording_notice_text', s.recording_notice_text,
    'retention_days', s.retention_days
  ) into v_resultado;

  if v_resultado is null then
    raise exception 'a conta não tem configuração' using errcode = 'P0002';
  end if;

  perform set_config('app.audit_reason', '', true);

  return v_resultado;
end;
$privacidade$;

comment on function public.definir_privacidade(uuid, jsonb, text) is
  'Grava gravação, aviso e retenção de account_settings com o motivo na trilha (RF-008). Exige dono. Chave ausente não muda a coluna; chave fora da privacidade é recusada. Desligar a gravação não chega ao provedor sozinho: é preciso republicar o agente (L-18).';

revoke execute on function public.definir_privacidade(uuid, jsonb, text) from public;
grant execute on function public.definir_privacidade(uuid, jsonb, text) to authenticated;

-- Quantas chamadas um prazo alcança ---------------------------------------------------
-- Fora do prazo é a chamada que já terminou (`ended` ou `failed`), ainda tem
-- conteúdo (arquivo de áudio ou transcrição não vazia) e cujo fim — ou início,
-- quando o fim não foi gravado — é mais antigo que o prazo. Chamada em curso
-- nunca conta: o expurgo não a alcança.
--
-- `security invoker`: a contagem corre sob a RLS de quem pergunta, e membro de
-- outra conta recebe zero.
create or replace function public.chamadas_fora_do_prazo(
  p_account_id uuid,
  p_dias integer
)
returns integer
language sql
stable
set search_path = ''
as $contagem$
  select count(*)::integer
    from public.calls as c
   where c.account_id = p_account_id
     and c.status in ('ended', 'failed')
     and (c.recording_path is not null or c.transcript <> '{}'::jsonb)
     and coalesce(c.ended_at, c.started_at) < now() - make_interval(days => p_dias);
$contagem$;

comment on function public.chamadas_fora_do_prazo(uuid, integer) is
  'Quantas chamadas da conta a próxima execução do expurgo apagaria com o prazo de p_dias (RF-807): terminadas, com áudio ou transcrição, e com o fim mais antigo que o prazo. É a régua que cron-retention (US-080) aplica.';

revoke execute on function public.chamadas_fora_do_prazo(uuid, integer) from public;
grant execute on function public.chamadas_fora_do_prazo(uuid, integer) to authenticated, service_role;
