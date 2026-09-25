-- A guarda de discagem: os nove passos da seção 6 numa transação só, com trava
-- (T-05, T-06, RF-010, RF-406, RF-801 a RF-803, RNF-12).
-- Referência: docs/PRD-implementacao.md seções 3.5, 3.9 e 6,
-- docs/revisao-tecnica.md T-04, T-05, T-06, T-21, R-10, L-03 e O-02,
-- docs/PRD.md RF-010, RF-406, RF-801, RF-802, RF-803, RF-804 e RNF-12.
--
-- O problema que esta função existe para resolver é um só, e é o de T-05:
-- verificar e gravar precisam ser o mesmo ato. Duas discagens simultâneas que
-- leem o mesmo contador passam as duas, e o teto deixa de ser teto — a conta
-- descobre pela fatura. Por isso a decisão não é uma consulta que a borda faz e
-- depois um insert que ela faz: é uma transação que toma o advisory lock, conta,
-- decide, GRAVA `call_attempts` e devolve. A borda normaliza e chama.
--
-- Seis decisões que a função carrega:
--
-- 1. **Duas travas, em ordem fixa.** A trava por conta é a que torna os tetos da
--    conta (passos 7 e 8) verdadeiros; a trava por (conta, número) é a que torna
--    o intervalo mínimo e o teto por número (passos 5 e 6) verdadeiros. A ordem
--    é sempre conta e depois número, e a ordem fixa é o que impede espera
--    cruzada: duas chamadas que tomassem as mesmas duas travas em ordens
--    diferentes se travariam uma na outra. A trava do número vem DEPOIS do passo
--    1 de propósito — travar o número cru deixaria `11999998888` e
--    `+5511999998888` esperando em filas diferentes pelo mesmo telefone.
-- 2. **O passo 0 vem antes de qualquer consulta** (T-06). Freio de emergência
--    puxado é a pergunta mais barata e a mais importante: a conta parou, e
--    descobrir por que ela também estaria fora da janela não interessa a
--    ninguém. A precedência tem teste próprio, com os três motivos verdadeiros
--    ao mesmo tempo.
-- 3. **A contagem do dia conta o que SAIU, e não toda tentativa.** As recusas
--    são gravadas (passo 9, RF-406) mas não consomem cota, e a razão é que o
--    contrário se morde: três recusas por fora da janela às 8h da manhã
--    queimariam o teto por número daquele telefone, e o número não poderia mais
--    ser discado no dia em que a janela abrisse. Teto é de ligação feita.
-- 4. **O dia é o da conta, e não o do lead.** A janela do passo 4 se lê no fuso
--    do lead, porque é a casa dele que toca; os tetos dos passos 6, 7 e 8 se
--    contam no fuso da conta, porque a operação é dela. Uma conta com leads em
--    três fusos teria, do outro jeito, três dias diferentes e um teto que
--    ninguém sabe quando reinicia.
-- 5. **DIVERGÊNCIA DECLARADA da seção 6.** A seção prevê `message` e
--    `alternative` em português no retorno do SQL. Aqui o banco devolve o código
--    do motivo e os NÚMEROS do limite (a janela, o teto, a contagem, o horário
--    da próxima abertura), em `dados`, e a frase é da borda — é a convenção do
--    projeto, a mesma que separa `app/src/copy/` do que o servidor decide. Quem
--    monta a frase é `guarda.ts`, com os números daqui.
-- 6. **Só `service_role` executa.** A guarda que o cliente pudesse chamar seria
--    a guarda que o cliente pode consultar sem discar: bastaria varrer números
--    com `bypass` para descobrir quem está na lista de bloqueio da conta, quanto
--    da cota sobrou e quais linhas estão saudáveis, sem deixar uma ligação de
--    rastro. Quem chama é `call-place`, e mais ninguém.

-- Normalização para E.164, região BR (passo 1) ---------------------------------
--
-- É a metade portável do passo 1: o que dá para decidir sem lista de DDD nem
-- tabela de operadora. A normalização de verdade — DDD válido, nono dígito,
-- celular contra fixo — é de `_shared/telefone.ts`, e quem a aplica é
-- `guarda.ts`, antes de chamar aqui. Esta função existe porque a guarda não pode
-- depender de a borda ter feito o trabalho: número que chega em forma nacional
-- precisa travar, contar e bloquear no MESMO lugar do número que chega em E.164,
-- senão o passo 3 procura um bloqueio que existe escrito de outro jeito.
create or replace function public.normalizar_e164_br(p_numero text)
returns text
language plpgsql
immutable
set search_path = ''
as $normaliza$
declare
  v_digitos text;
  v_tinha_mais boolean;
begin
  if p_numero is null then return null; end if;

  v_tinha_mais := btrim(p_numero) like '+%';
  v_digitos := regexp_replace(p_numero, '[^0-9]', '', 'g');
  if v_digitos = '' then return null; end if;

  -- Com `+`, o número já declarou o país: só se tira a pontuação.
  if v_tinha_mais then
    return '+' || v_digitos;
  end if;

  -- Sem `+`, a região padrão é o Brasil. Dez dígitos é fixo com DDD, onze é
  -- celular com o nono; doze e treze são os mesmos dois já com o 55 na frente,
  -- que é como planilha de cliente costuma chegar.
  if length(v_digitos) in (10, 11) then
    return '+55' || v_digitos;
  end if;
  if length(v_digitos) in (12, 13) and left(v_digitos, 2) = '55' then
    return '+' || v_digitos;
  end if;

  -- Qualquer outra coisa não é número brasileiro nem número internacional
  -- escrito por extenso: devolver um palpite aqui seria discar para o palpite.
  return null;
end;
$normaliza$;

-- A guarda ----------------------------------------------------------------------
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
  if v_motivo is null
     and (not v_conta.real_dialing or v_conta.first_test_call_ok_at is null)
     and not exists (
       select 1 from public.account_test_numbers t
        where t.account_id = p_account_id and t.phone_e164 = v_telefone
     )
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
  if v_motivo is null
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

comment on function public.guard_dial(uuid, text, uuid, text, uuid, text, uuid, text[], timestamptz) is
  'A guarda de discagem: os nove passos da seção 6 numa transação só, com advisory lock por conta e por (conta, número), gravando call_attempts inclusive na recusa (T-05, T-06, RF-406). DIVERGÊNCIA DECLARADA da seção 6: o retorno é (allowed, reason, dados, phone_line_id) — código do motivo e os números do limite, e não message e alternative em português. A frase é da borda, em guarda.ts, pela convenção do projeto: decisão do banco, texto da interface. As contagens do dia contam o que SAIU (outcome = placed) e não toda tentativa: recusa que consumisse cota queimaria o teto do número antes de a janela abrir. O dia é o da conta; a janela é a do fuso do lead.';

comment on function public.normalizar_e164_br(text) is
  'Passo 1 da guarda: a metade portável da normalização para E.164 com região padrão BR. Com + na frente, só tira a pontuação; sem ele, dez ou onze dígitos ganham +55, e doze ou treze começados por 55 ganham só o +. A normalização de verdade (DDD, nono dígito) é de _shared/telefone.ts, aplicada por guarda.ts antes da chamada — esta existe para que número em forma nacional trave, conte e seja bloqueado no mesmo lugar do número em E.164.';

-- Quem pode chamar ---------------------------------------------------------------
--
-- Só a borda de serviço, e a razão é que a guarda responde perguntas que a conta
-- não deveria poder fazer sem discar: quem está na lista de bloqueio, quanto da
-- cota sobrou, quais linhas estão saudáveis. Com `execute` para `authenticated`,
-- varrer números com a guarda seria um oráculo silencioso — sem ligação, sem
-- fatura e sem nada na tela. Quem chama é `call-place`.
revoke execute on function public.guard_dial(uuid, text, uuid, text, uuid, text, uuid, text[], timestamptz) from public;
revoke execute on function public.normalizar_e164_br(text) from public;

grant execute on function public.guard_dial(uuid, text, uuid, text, uuid, text, uuid, text[], timestamptz) to service_role;
grant execute on function public.normalizar_e164_br(text) to service_role;
