-- A janela de discagem não vale para número de teste (US-248).
--
-- **Por que a exceção existe.** A janela (T-21, R-10) protege o lead de ser
-- incomodado fora de hora: é regra de conduta com gente que não pediu a
-- ligação. No número da lista de teste não há lead do outro lado — ele é da
-- própria empresa, cadastrado por quem administra a conta, e é o único destino
-- que o portão da fatia deixa passar enquanto `real_dialing` está desligado.
-- Barrar o teste às 19h apenas impede a conta de conferir a Sarah fora do
-- horário comercial, sem proteger ninguém.
--
-- **A EXCEÇÃO É DO NÚMERO, NÃO DE QUEM PEDE.** Ela não entra em
-- `PASSOS_PULAVEIS`, e `p_bypass` não a alcança. Se a janela virasse um passo
-- pulável, uma campanha poderia pular a janela de um lead real — que é
-- exatamente o que a regra existe para impedir. Aqui só o destino decide, e o
-- destino está numa lista que só o dono da conta escreve.
--
-- **Os passos 2 e 4 passam a fazer a mesma pergunta**, e por isso ela é feita
-- uma vez só, em `v_e_numero_de_teste`: duas consultas iguais divergiriam no
-- dia em que uma delas ganhasse um critério a mais.
--
-- Recria `guard_dial` inteira, que é como `create or replace` de função
-- funciona. O corpo abaixo é o da migração 20260922110000 com as três
-- mudanças acima; nenhum outro passo muda.

create or replace function public.guard_dial(
  p_account_id uuid,
  p_phone_e164 text,
  p_lead_id uuid default null,
  p_actor text default 'system',
  p_actor_id uuid default null,
  p_source text default 'manual',
  p_campaign_id uuid default null,
  -- Só `min_interval` e `daily_per_number` têm efeito, e a lista de quem pode
  -- ser pulado é DAQUI: nome desconhecido no array não faz nada, em vez de
  -- levantar erro, porque a campanha que passasse um nome a mais derrubaria a
  -- discagem inteira em vez de ser ignorada no passo que não a conhece.
  p_bypass text[] default '{}'::text[],
  -- O relógio da decisão. Padrão `now()`, que dentro de uma transação é o
  -- instante de abertura dela — os nove passos veem o mesmo instante, e não um
  -- relógio que anda entre o passo 4 e o passo 6. Parâmetro, e não literal,
  -- porque `cron-dial` decide pelo instante em que tomou o item da fila e
  -- porque a prova da janela precisa de um relógio que o teste possa mover.
  p_instante timestamptz default now()
)
returns table (
  allowed boolean,
  reason text,
  dados jsonb,
  phone_line_id uuid
)
language plpgsql
security definer
set search_path = ''
as $guarda$
#variable_conflict use_column
declare
  v_conta record;
  v_config record;
  v_telefone text;
  v_fuso_do_lead text;
  v_inicio_do_dia timestamptz;
  v_fim_do_dia timestamptz;
  v_permitido boolean := false;
  v_motivo text;
  v_dados jsonb := '{}'::jsonb;
  v_linha_id uuid;
  v_bloqueio record;
  v_ultima timestamptz;
  v_contagem integer;
  v_gasto bigint;
  v_linha record;
  v_candidatas integer;
  v_pula_intervalo boolean := 'min_interval' = any(p_bypass);
  -- Calculada uma vez, logo depois de o telefone normalizar, e usada nos
  -- passos 2 e 4. Ver o cabeçalho desta migração.
  v_e_numero_de_teste boolean := false;
  v_pula_por_numero boolean := 'daily_per_number' = any(p_bypass);
begin
  -- A conta, de uma vez: o freio, o portão e o fuso vêm da mesma linha, e ler
  -- três vezes a mesma linha não tornaria o passo 0 mais cedo do que já é.
  select a.id, a.timezone, a.dialing_paused_at, a.first_test_call_ok_at,
         coalesce((a.feature_flags ->> 'real_dialing')::boolean, false) as real_dialing
    into v_conta
    from public.accounts a
   where a.id = p_account_id;

  if not found then
    raise exception 'guard_dial: conta % não existe', p_account_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Trava 1 de 2: a conta. Sempre a primeira, e é a ordem que impede espera
  -- cruzada entre duas chamadas da mesma conta a números diferentes.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('guard_dial:conta:' || p_account_id::text)
  );

  -- Passo 0: o freio de emergência, antes de qualquer outra consulta (T-06) ----
  if v_conta.dialing_paused_at is not null then
    v_motivo := 'dialing_paused';
    v_dados := jsonb_build_object('paused_at', v_conta.dialing_paused_at);
  end if;

  -- Passo 1: normaliza para E.164 com região BR -------------------------------
  --
  -- Roda mesmo quando o passo 0 já recusou, e não é desperdício: o passo 9 grava
  -- a recusa, e a linha só cabe na tabela com o número na forma do check. Freio
  -- puxado sem registro seria freio sem memória.
  v_telefone := public.normalizar_e164_br(p_phone_e164);

  -- Telefone que não normaliza NÃO é motivo de recusa, e a ausência dele na
  -- lista de `call_attempts.outcome` é de propósito: a linha não caberia na
  -- tabela, porque o check de `phone_e164` a recusaria antes. Essa recusa é da
  -- borda, em `guarda.ts`, que normaliza pelo módulo completo antes de chegar
  -- aqui — se um número inválido chegou, o erro é de quem chamou.
  if v_telefone is null or v_telefone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'guard_dial: % não normaliza para E.164', p_phone_e164
      using errcode = 'invalid_parameter_value';
  end if;

  -- Trava 2 de 2: o número, já normalizado.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('guard_dial:numero:' || p_account_id::text || ':' || v_telefone)
  );

  -- O lead, quando há um. Lead de outra conta é erro de quem chamou, e não
  -- recusa: aceitá-lo em silêncio leria a janela no fuso de um lead que esta
  -- conta não tem.
  v_fuso_do_lead := v_conta.timezone;
  if p_lead_id is not null then
    select coalesce(l.timezone, v_conta.timezone)
      into v_fuso_do_lead
      from public.leads l
     where l.id = p_lead_id and l.account_id = p_account_id;

    if not found then
      raise exception 'guard_dial: lead % não é da conta %', p_lead_id, p_account_id
        using errcode = 'foreign_key_violation';
    end if;
  end if;

  select * into v_config
    from public.account_settings s
   where s.account_id = p_account_id;

  if not found then
    raise exception 'guard_dial: conta % não tem account_settings', p_account_id
      using errcode = 'no_data_found';
  end if;

  -- O dia da conta, uma vez só, para os passos 6, 7 e 8.
  v_inicio_do_dia := date_trunc('day', p_instante at time zone v_conta.timezone)
                       at time zone v_conta.timezone;
  v_fim_do_dia := v_inicio_do_dia + interval '1 day';

  -- Passo 2: o portão de lead real (L-03, O-02) --------------------------------
  -- Fechado enquanto `real_dialing` é falso OU a conta nunca completou a
  -- primeira chamada de teste. Fechado, só número da lista de teste sai.
  -- O número é da lista de teste da conta? Pergunta feita uma vez, usada nos
  -- passos 2 e 4.
  select exists (
    select 1 from public.account_test_numbers t
     where t.account_id = p_account_id and t.phone_e164 = v_telefone
  ) into v_e_numero_de_teste;

  if v_motivo is null
     and (not v_conta.real_dialing or v_conta.first_test_call_ok_at is null)
     and not v_e_numero_de_teste
  then
    v_motivo := 'real_dialing_gate';
    v_dados := jsonb_build_object(
      'real_dialing', v_conta.real_dialing,
      'first_test_call_ok_at', v_conta.first_test_call_ok_at
    );
  end if;

  -- Passo 3: a lista de bloqueio (RF-804) --------------------------------------
  if v_motivo is null then
    select d.reason, d.source, d.created_at
      into v_bloqueio
      from public.dnc_entries d
     where d.account_id = p_account_id
       and d.phone_e164 = v_telefone
       and d.removed_at is null
     limit 1;

    if found then
      v_motivo := 'dnc_active';
      v_dados := jsonb_build_object(
        'dnc_reason', v_bloqueio.reason,
        'dnc_source', v_bloqueio.source,
        'dnc_since', v_bloqueio.created_at
      );
    end if;
  end if;

  -- Passo 4: a janela, no fuso do lead (T-21, R-10) -----------------------------
  -- Não se aplica a número da lista de teste: ver o cabeçalho desta migração.
  -- A exceção é do número, e não de quem pede — `p_bypass` não a alcança, e
  -- campanha nenhuma consegue ligar para lead real fora de hora.
  if v_motivo is null
     and not v_e_numero_de_teste
     and not public.dentro_da_janela_de_discagem(
       v_config.dialing_window, p_instante, v_fuso_do_lead
     )
  then
    v_motivo := 'outside_window';
    v_dados := jsonb_build_object(
      'timezone', v_fuso_do_lead,
      'window', v_config.dialing_window,
      'next_open_at', public.proxima_abertura_de_discagem(
        v_config.dialing_window, p_instante, v_fuso_do_lead
      )
    );
  end if;

  -- Passo 5: o intervalo mínimo desde a última tentativa (RF-802) ---------------
  if v_motivo is null and not v_pula_intervalo and v_config.min_interval_minutes > 0 then
    select max(c.attempted_at)
      into v_ultima
      from public.call_attempts c
     where c.account_id = p_account_id
       and c.phone_e164 = v_telefone
       and c.outcome = 'placed';

    if v_ultima is not null
       and v_ultima > p_instante - make_interval(mins => v_config.min_interval_minutes)
    then
      v_motivo := 'min_interval';
      v_dados := jsonb_build_object(
        'min_interval_minutes', v_config.min_interval_minutes,
        'last_attempt_at', v_ultima,
        'next_allowed_at', v_ultima + make_interval(mins => v_config.min_interval_minutes)
      );
    end if;
  end if;

  -- Passo 6: o teto do dia por número de destino (RF-803) -----------------------
  if v_motivo is null and not v_pula_por_numero then
    select count(*)
      into v_contagem
      from public.call_attempts c
     where c.account_id = p_account_id
       and c.phone_e164 = v_telefone
       and c.attempted_at >= v_inicio_do_dia
       and c.attempted_at < v_fim_do_dia
       and c.outcome = 'placed';

    if v_contagem >= v_config.daily_attempts_per_number then
      v_motivo := 'daily_per_number';
      v_dados := jsonb_build_object(
        'cap', v_config.daily_attempts_per_number,
        'count', v_contagem,
        'day_start', v_inicio_do_dia
      );
    end if;
  end if;

  -- Passo 7: o teto do dia da conta e o teto de gasto (RF-010, RNF-12) ----------
  if v_motivo is null then
    select count(*)
      into v_contagem
      from public.call_attempts c
     where c.account_id = p_account_id
       and c.attempted_at >= v_inicio_do_dia
       and c.attempted_at < v_fim_do_dia
       and c.outcome = 'placed';

    if v_contagem >= v_config.daily_calls_cap then
      v_motivo := 'daily_per_account';
      v_dados := jsonb_build_object(
        'cap', v_config.daily_calls_cap,
        'count', v_contagem,
        'day_start', v_inicio_do_dia
      );
    end if;
  end if;

  if v_motivo is null and v_config.daily_spend_cap_cents is not null then
    select coalesce(sum(k.amount_cents), 0)
      into v_gasto
      from public.call_costs k
     where k.account_id = p_account_id
       and k.recorded_at >= v_inicio_do_dia
       and k.recorded_at < v_fim_do_dia;

    if v_gasto >= v_config.daily_spend_cap_cents then
      v_motivo := 'daily_spend_cap';
      v_dados := jsonb_build_object(
        'cap_cents', v_config.daily_spend_cap_cents,
        'spent_cents', v_gasto,
        'day_start', v_inicio_do_dia
      );
    end if;
  end if;

  -- Passo 8: o teto da linha e o rodízio (R-04) ---------------------------------
  --
  -- O rodízio é determinístico e o desempate é estável: primeiro a linha que
  -- menos discou hoje, depois a que discou há mais tempo, e o `id` no fim. Sem
  -- a terceira chave, duas linhas zeradas sairiam na ordem que o planejador
  -- resolvesse devolver, e "qual linha a Sarah usou" deixaria de ser explicável.
  if v_motivo is null then
    select count(*)
      into v_candidatas
      from public.phone_lines p
     where p.account_id = p_account_id
       and p.enabled
       and p.in_rotation
       and p.outbound_enabled;

    select p.id, p.e164, p.daily_cap, u.usadas, u.ultima
      into v_linha
      from public.phone_lines p
      cross join lateral (
        select count(*) as usadas, max(c.attempted_at) as ultima
          from public.call_attempts c
         where c.phone_line_id = p.id
           and c.attempted_at >= v_inicio_do_dia
           and c.attempted_at < v_fim_do_dia
           and c.outcome = 'placed'
      ) u
     where p.account_id = p_account_id
       and p.enabled
       and p.in_rotation
       and p.outbound_enabled
       and u.usadas < p.daily_cap
     order by u.usadas asc, u.ultima asc nulls first, p.id asc
     limit 1;

    if found then
      v_linha_id := v_linha.id;
      v_permitido := true;
      v_motivo := 'placed';
      v_dados := jsonb_build_object(
        'from_number', v_linha.e164,
        'line_daily_cap', v_linha.daily_cap,
        'line_used_today', v_linha.usadas,
        'timezone', v_fuso_do_lead,
        'day_start', v_inicio_do_dia
      );
    else
      -- Recusa própria, e não erro: conta sem linha saudável é configuração
      -- incompleta ou saúde caída (R-04), e as duas se explicam na tela.
      v_motivo := 'no_phone_line';
      v_dados := jsonb_build_object(
        'lines_in_rotation', v_candidatas,
        'day_start', v_inicio_do_dia
      );
    end if;
  end if;

  -- Passo 9: grava a tentativa, inclusive quando recusa (RF-406) ----------------
  v_dados := v_dados || jsonb_build_object('phone_e164', v_telefone);

  insert into public.call_attempts (
    account_id, lead_id, phone_e164, phone_line_id, outcome,
    actor, actor_id, source, campaign_id, attempted_at
  )
  values (
    p_account_id, p_lead_id, v_telefone, v_linha_id, v_motivo,
    p_actor, p_actor_id, p_source, p_campaign_id, p_instante
  );

  return query select v_permitido, v_motivo, v_dados, v_linha_id;
end;
$guarda$;
