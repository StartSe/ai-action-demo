-- A política de discagem, os tetos, a privacidade e a operação da conta, em
-- colunas tipadas.
-- Referência: docs/PRD-implementacao.md seções 3.1 e 3.9, docs/PRD.md RF-010,
-- RF-421, RF-610, RF-612, RF-801 a RF-803, RF-806, RF-807, RNF-12 e RNF-13,
-- docs/revisao-tecnica.md T-22 e R-10.
--
-- `account_settings` nasceu na migração de roteamento com uma área só, e a
-- razão está escrita lá: coluna de configuração que ninguém lê promete efeito
-- que não existe. A F2 lê estas. A janela e o intervalo mínimo são os passos 4
-- e 5 da guarda (US-058), os tetos são os passos 6 e 7, a duração máxima entra
-- na publicação do agente (L-12), a gravação decide a retenção pedida ao
-- provedor (L-18) e o disparo por lead novo é a rotina de speed-to-lead.
--
-- T-22 outra vez, e é o ponto da história inteira: cada área é coluna com tipo,
-- padrão e check, e não uma chave dentro de um `jsonb` de configuração. O blob
-- perde quatro coisas de uma vez — nenhum check recusa valor desconhecido,
-- nenhum padrão é verificável, toda escrita reescreve o objeto inteiro (duas
-- telas abertas e a última salva desfaz a outra) e a auditoria passa a dizer
-- "settings mudou" em vez de "o teto diário foi de 200 para 5000".
--
-- O QUE NÃO ENTRA, e a ausência é decisão: os limiares da fila de exceções
-- (RF-915) são F4, e `retry_policy` e a janela de campanha são F7. Chegam com
-- as fatias que as lerem.

alter table public.account_settings
  -- Política de discagem (RF-801 a RF-803) ------------------------------------
  -- A janela é `jsonb` e não uma tabela filha porque é uma faixa por dia da
  -- semana, sempre: a conta não tem duas janelas de discagem, ao contrário do
  -- especialista, que tem manhã e tarde com almoço no meio
  -- (`specialist_availability`). O que o `jsonb` custa é a validação, e ela vem
  -- logo abaixo, em gatilho, porque um `check` só saberia dizer "recusado".
  add column dialing_window jsonb not null default
    '{"1": {"start": "09:00", "end": "18:00"},
      "2": {"start": "09:00", "end": "18:00"},
      "3": {"start": "09:00", "end": "18:00"},
      "4": {"start": "09:00", "end": "18:00"},
      "5": {"start": "09:00", "end": "18:00"}}'::jsonb,
  add column min_interval_minutes integer not null default 60
    constraint account_settings_intervalo_minimo
      check (min_interval_minutes between 0 and 10080),
  add column daily_attempts_per_number smallint not null default 3
    constraint account_settings_tentativas_por_numero
      check (daily_attempts_per_number between 1 and 20),

  -- Tetos (RF-010, RNF-12, RNF-13, RF-421) ------------------------------------
  add column daily_calls_cap integer not null default 200
    constraint account_settings_teto_diario
      check (daily_calls_cap between 1 and 100000),
  add column daily_spend_cap_cents integer default null
    constraint account_settings_teto_de_gasto
      check (daily_spend_cap_cents is null or daily_spend_cap_cents > 0),
  add column max_concurrent smallint not null default 5
    constraint account_settings_simultaneidade
      check (max_concurrent between 1 and 10),
  add column max_duration_seconds integer not null default 600
    constraint account_settings_duracao_maxima
      check (max_duration_seconds between 30 and 3600),

  -- Privacidade (RF-806, RF-807) ----------------------------------------------
  add column recording_enabled boolean not null default true,
  add column recording_notice_text text default null
    constraint account_settings_aviso_de_gravacao
      check (recording_notice_text is null or btrim(recording_notice_text) <> ''),
  add column retention_days integer not null default 90
    constraint account_settings_retencao
      check (retention_days between 1 and 3650),

  -- Operação (RF-610, RF-612) -------------------------------------------------
  add column credit_alert_cents integer default null
    constraint account_settings_aviso_de_credito
      check (credit_alert_cents is null or credit_alert_cents > 0),
  add column speed_to_lead_enabled boolean not null default false,
  add column speed_to_lead_minutes smallint not null default 5
    constraint account_settings_janela_de_resposta
      check (speed_to_lead_minutes between 1 and 1440);

comment on table public.account_settings is
  'Configuração tipada da conta, uma linha por conta (T-22): roteamento do especialista, política de discagem, tetos, privacidade e operação. Fora daqui de propósito: os limiares da fila de exceções (RF-915) são F4, e retry_policy e a janela de campanha são F7 — entram com as fatias que as lerem, porque coluna que ninguém lê promete efeito que não existe.';

comment on column public.account_settings.dialing_window is
  'Janela de discagem, uma faixa por dia da semana (RF-801). Chave é o dia como em extract(dow from ...), 0 é domingo e 6 é sábado; valor é {"start": "HH:MM", "end": "HH:MM"}. Dia ausente é dia sem discagem. As horas valem no fuso do LEAD e nunca no da conta nem em UTC (R-10, T-21): quem decide é a guarda, com at time zone. A faixa é fechada no início e aberta no fim — 09:00 disca, 18:00 não.';

comment on column public.account_settings.min_interval_minutes is
  'Minutos mínimos entre duas tentativas ao mesmo número (RF-802). Zero é permitido e significa sem espera, que é escolha consciente e não descuido: o teto por número continua de pé.';

comment on column public.account_settings.daily_attempts_per_number is
  'Tentativas por dia ao mesmo número de destino (RF-803). Conta tentativa, não conversa: caixa postal e não atende também gastam a cota.';

comment on column public.account_settings.daily_calls_cap is
  'Teto diário de ligações da conta (RF-010). Atingido, a conta para de discar; não é aviso.';

comment on column public.account_settings.daily_spend_cap_cents is
  'Teto de gasto do dia em centavos (RNF-12), somando call_costs. Nulo é sem teto de gasto, e é o padrão porque o preço por minuto só se conhece depois da primeira fatura — teto de gasto chutado pararia a conta por engano no primeiro dia.';

comment on column public.account_settings.max_concurrent is
  'Chamadas simultâneas da conta (RNF-13). Entre 1 e 10: o limite de cima não é capacidade nossa, é o que a linha e o provedor sustentam sem a fila virar espera.';

comment on column public.account_settings.max_duration_seconds is
  'Duração máxima de uma chamada, em segundos (RF-421). Vai para a publicação do agente (L-12) e é o que o vigia da rotina de recuperação cobra quando o provedor não encerra.';

comment on column public.account_settings.recording_enabled is
  'Gravação ligada (RF-806). Desligada, a publicação pede ao provedor que não retenha áudio (L-18) — não basta deixar de baixar o arquivo.';

comment on column public.account_settings.recording_notice_text is
  'Aviso de gravação da conta (RF-806). Nulo é o padrão e significa a frase da camada 1, em FALAS_DE_TODO_PROPOSITO.avisoDeGravacao: a frase não se copia para cá, senão a camada 1 muda e as contas antigas seguem dizendo a anterior. Escrito, sobrescreve.';

comment on column public.account_settings.retention_days is
  'Dias de retenção de gravação e de transcrição (RF-807). A rotina de expurgo apaga no Storage e no provedor depois do prazo.';

comment on column public.account_settings.credit_alert_cents is
  'Crédito no provedor abaixo do qual a conta é avisada, em centavos (RF-612). Nulo é sem aviso.';

comment on column public.account_settings.speed_to_lead_enabled is
  'Lead novo vira ligação sozinho (RF-610). Falso por padrão, e é o padrão certo: ligar sem que ninguém tenha pedido é o modo mais rápido de a primeira importação virar reclamação.';

comment on column public.account_settings.speed_to_lead_minutes is
  'Minutos entre o lead chegar e a Sarah ligar, quando speed_to_lead_enabled (RF-610). Só vale dentro da janela de discagem: a pressa não fura a janela.';

-- Validação da janela ---------------------------------------------------------------
-- Em gatilho e não em `check` por uma razão só: a mensagem. Um `check` sobre o
-- `jsonb` diria "account_settings_janela viola a restrição" e deixaria quem
-- escreveu adivinhando qual dos sete dias está torto. O gatilho nomeia o dia, a
-- chave e o valor que chegou, que é o que a tela tem para mostrar.
--
-- Gatilho `before`, então ele roda antes de qualquer `check` da tabela — é por
-- isso que a coluna não tem um `check` de forma junto: ele nunca seria o que
-- levanta o erro, e restrição que nunca dispara é restrição que ninguém mantém.
create or replace function public.validar_janela_de_discagem()
returns trigger
language plpgsql
set search_path = ''
as $janela$
declare
  -- Hora e minuto, com zero à esquerda. A largura fixa é o que deixa a
  -- comparação de fim contra início ser comparação de texto: '09:00' < '18:00'
  -- ordena igual ao relógio, e nenhum `time` precisa entrar aqui.
  c_hora constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  v_dia text;
  v_faixa jsonb;
  v_inicio text;
  v_fim text;
  v_chaves text[];
begin
  if jsonb_typeof(new.dialing_window) <> 'object' then
    raise exception
      'dialing_window precisa ser um objeto com um dia da semana por chave, e veio %',
      jsonb_typeof(new.dialing_window)
      using errcode = '22023',
        hint = 'Exemplo: {"1": {"start": "09:00", "end": "18:00"}}, com 0 para domingo e 6 para sábado.';
  end if;

  for v_dia, v_faixa in select chave, valor from jsonb_each(new.dialing_window) as j(chave, valor)
  loop
    if v_dia !~ '^[0-6]$' then
      raise exception
        'dialing_window traz o dia "%", e o dia da semana vai de 0 (domingo) a 6 (sábado)',
        v_dia
        using errcode = '22023';
    end if;

    if jsonb_typeof(v_faixa) <> 'object' then
      raise exception
        'dialing_window["%"] precisa ser um objeto com start e end, e veio %',
        v_dia, jsonb_typeof(v_faixa)
        using errcode = '22023';
    end if;

    select coalesce(array_agg(chave order by chave), array[]::text[])
      into v_chaves
      from jsonb_object_keys(v_faixa) as chave;

    if v_chaves <> array['end', 'start'] then
      raise exception
        'dialing_window["%"] aceita exatamente start e end, e veio: %',
        v_dia, array_to_string(v_chaves, ', ')
        using errcode = '22023',
          hint = 'Dia sem discagem se escreve tirando a chave do dia, não com uma faixa vazia.';
    end if;

    v_inicio := v_faixa ->> 'start';
    v_fim := v_faixa ->> 'end';

    if v_inicio is null or v_inicio !~ c_hora then
      raise exception
        'dialing_window["%"].start precisa ser hora e minuto de 00:00 a 23:59, e veio "%"',
        v_dia, coalesce(v_inicio, 'null')
        using errcode = '22023';
    end if;

    -- `24:00` é o fim do dia inteiro e não existe como hora do relógio, então
    -- ele entra à mão em vez de afrouxar a expressão: aceitar `24:30` por
    -- descuido daria uma janela que nunca fecha.
    if v_fim is null or (v_fim !~ c_hora and v_fim <> '24:00') then
      raise exception
        'dialing_window["%"].end precisa ser hora e minuto de 00:01 a 24:00, e veio "%"',
        v_dia, coalesce(v_fim, 'null')
        using errcode = '22023';
    end if;

    if v_fim <= v_inicio then
      raise exception
        'dialing_window["%"] começa às % e termina às %: a faixa precisa ter duração',
        v_dia, v_inicio, v_fim
        using errcode = '22023',
          hint = 'Faixa que atravessa a meia-noite se escreve como dois dias, cada um com a sua.';
    end if;
  end loop;

  return new;
end;
$janela$;

comment on function public.validar_janela_de_discagem() is
  'Gatilho before insert or update em account_settings: recusa dialing_window malformada nomeando o dia, a chave e o valor que chegou. Em gatilho e não em check porque check só sabe dizer que recusou.';

create trigger account_settings_validar_janela
  before insert or update on public.account_settings
  for each row execute function public.validar_janela_de_discagem();
