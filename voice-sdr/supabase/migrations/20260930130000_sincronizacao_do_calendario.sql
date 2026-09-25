-- cron-calendar-sync: a reivindicação dos calendários, a gravação reconciliada
-- da ocupação e o agendamento de cinco em cinco minutos.
-- Referência: docs/PRD-implementacao.md seção 4.6 e 3.3, docs/revisao-tecnica.md
-- T-10, T-26, L-13 e RNF-06.
--
-- A rotina lê a ocupação dos próximos trinta dias de cada calendário conectado
-- e a grava em `specialist_busy_blocks`, porque a ferramenta de agenda não tem
-- prazo para consultar o provedor dentro da ligação (T-10). Três peças moram no
-- banco, porque só aqui elas são atômicas:
--
-- 1. **A reivindicação** (`reivindicar_calendarios_para_sincronizar`), com
--    `for update skip locked` e a marca `sync_claimed_at` na mesma transação:
--    dois disparos sobrepostos pegam calendários diferentes, e a passagem
--    seguinte não repega o que a anterior acabou de tomar.
-- 2. **A gravação reconciliada** (`gravar_ocupacao_do_calendario`): o retrato
--    novo substitui o velho numa transação. Evento que continua é atualizado
--    pela chave única, evento novo entra, e evento que sumiu do provedor sai.
--    Sem a remoção, compromisso cancelado bloquearia horário para sempre. E
--    `synced_at` só avança aqui, junto com a ocupação, nunca antes.
-- 3. **O job**, pelo mesmo `disparar_rotina` das rotinas da F2: endereço e
--    segredo lidos de `app_config` e do Vault na hora do disparo (T-26).

-- A marca da reivindicação -----------------------------------------------------
alter table public.specialist_calendars
  add column sync_claimed_at timestamptz;

comment on column public.specialist_calendars.sync_claimed_at is
  'Quando cron-calendar-sync tomou este calendário pela última vez. É o que tira o calendário da fila entre uma reivindicação e a gravação: skip locked só vale dentro da transação da reivindicação, e a leitura do provedor acontece fora dela.';

-- A trilha continua registrando conectar e trocar de agenda, e não as passagens
-- da rotina: a marca nova entra na lista das colunas fora da comparação, ao
-- lado de `synced_at` e `sync_error`.
drop trigger specialist_calendars_auditoria on public.specialist_calendars;
create trigger specialist_calendars_auditoria
  after update or delete on public.specialist_calendars
  for each row execute function public.registrar_auditoria('account_id', 'synced_at', 'sync_error', 'sync_claimed_at');

-- De qual calendário veio cada bloco ------------------------------------------
-- A reconciliação apaga o que sumiu do provedor, e "sumiu" é relativo a um
-- calendário: um especialista pode ter um calendário por provedor, e apagar
-- pela pessoa faria a passagem de um calendário limpar a ocupação do outro.
-- Nula para linha que não veio da rotina. A cascata cumpre o que a política de
-- exclusão do calendário promete: desconectar a agenda devolve o horário.
alter table public.specialist_busy_blocks
  add column calendar_id uuid references public.specialist_calendars (id) on delete cascade;

comment on column public.specialist_busy_blocks.calendar_id is
  'O calendário de onde a rotina leu o bloco. É o recorte da reconciliação: a passagem de um calendário só remove blocos dele. Desconectar a agenda apaga os blocos em cascata.';

create index specialist_busy_blocks_por_calendario
  on public.specialist_busy_blocks (calendar_id);

-- A reivindicação --------------------------------------------------------------
create or replace function public.reivindicar_calendarios_para_sincronizar(
  p_limite integer,
  p_instante timestamptz
)
returns table (
  id uuid,
  account_id uuid,
  specialist_id uuid,
  provider text,
  external_id text,
  refresh_secret_id uuid,
  timezone text
)
language plpgsql
set search_path = ''
as $reivindicacao$
#variable_conflict use_column
begin
  -- 25 é o teto do envelope (_shared/rotinas/execucao.ts, R-02), repetido
  -- aqui como rede.
  return query
    with alvo as (
      select k.id
        from public.specialist_calendars as k
        join public.specialists as e on e.id = k.specialist_id
       -- Especialista desativado não recebe oferta, e ler a agenda dele é
       -- gastar cota do provedor à toa. Reativado, volta na passagem seguinte.
       where e.active
         -- Quatro minutos de folga: menos que a cadência de cinco, para a
         -- passagem seguinte retomar o calendário, e mais que uma passagem,
         -- para a sobreposta não pegá-lo de novo.
         and (k.sync_claimed_at is null
              or k.sync_claimed_at <= p_instante - interval '4 minutes')
       -- O que nunca foi tomado primeiro, depois o que está há mais tempo sem
       -- passar: com mais de 25 calendários, a fila anda em rodízio.
       order by k.sync_claimed_at nulls first, k.id
       for update of k skip locked
       limit least(coalesce(p_limite, 0), 25)
    ),
    tomados as (
      update public.specialist_calendars as k
         set sync_claimed_at = p_instante
        from alvo
       where k.id = alvo.id
      returning k.id, k.account_id, k.specialist_id, k.provider, k.external_id, k.refresh_secret_id
    )
    select t.id, t.account_id, t.specialist_id, t.provider, t.external_id, t.refresh_secret_id, e.timezone
      from tomados as t
      join public.specialists as e on e.id = t.specialist_id
     order by t.id;
end;
$reivindicacao$;

comment on function public.reivindicar_calendarios_para_sincronizar(integer, timestamptz) is
  'Toma até p_limite calendários de especialistas ativos com for update skip locked e grava sync_claimed_at (seção 4.6, L-13). Não devolve o tomado há menos de 4 minutos. Devolve o fuso do especialista, que é como o adaptador lê data local do provedor. Só service_role.';

revoke execute on function public.reivindicar_calendarios_para_sincronizar(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.reivindicar_calendarios_para_sincronizar(integer, timestamptz) to service_role;

-- A gravação reconciliada ------------------------------------------------------
-- `p_blocos` é um array jsonb de `{external_id, starts_at, ends_at}`. Repetido
-- pelo mesmo `external_id` fica o primeiro: `on conflict do update` não aceita
-- a mesma linha duas vezes no mesmo comando, e a duplicata derrubaria a
-- passagem inteira do calendário por um defeito do provedor.
create or replace function public.gravar_ocupacao_do_calendario(
  p_calendar_id uuid,
  p_blocos jsonb,
  p_instante timestamptz
)
returns integer
language plpgsql
set search_path = ''
as $gravacao$
declare
  v_calendario public.specialist_calendars%rowtype;
  v_lidos jsonb;
  v_quantos integer;
begin
  select * into v_calendario
    from public.specialist_calendars as k
   where k.id = p_calendar_id;
  -- Calendário desconectado no meio da passagem: nada a gravar, e a cascata
  -- já levou os blocos dele.
  if not found then
    return 0;
  end if;

  if jsonb_typeof(coalesce(p_blocos, '[]'::jsonb)) <> 'array' then
    raise exception 'a ocupação do calendário % não é uma lista', p_calendar_id;
  end if;

  -- O retrato limpo, uma vez: sem chave, sem duração ou repetido não entra.
  select coalesce(jsonb_agg(jsonb_build_object(
           'external_id', l.external_id, 'starts_at', l.starts_at, 'ends_at', l.ends_at)), '[]'::jsonb)
    into v_lidos
    from (
      select distinct on (b.external_id) b.external_id, b.starts_at, b.ends_at
        from jsonb_to_recordset(coalesce(p_blocos, '[]'::jsonb))
               as b (external_id text, starts_at timestamptz, ends_at timestamptz)
       where b.external_id is not null
         and length(btrim(b.external_id)) > 0
         and b.starts_at is not null
         and b.ends_at > b.starts_at
       order by b.external_id, b.starts_at
    ) as l;

  -- O que sumiu do provedor sai. As linhas sem calendário do mesmo
  -- especialista saem junto: são de antes de a coluna existir, e ninguém mais
  -- as reescreveria.
  delete from public.specialist_busy_blocks as o
   where o.specialist_id = v_calendario.specialist_id
     and (o.calendar_id = v_calendario.id or o.calendar_id is null)
     and not exists (
       select 1
         from jsonb_to_recordset(v_lidos) as l (external_id text)
        where l.external_id = o.external_id
     );

  insert into public.specialist_busy_blocks
    (account_id, specialist_id, calendar_id, external_id, starts_at, ends_at, synced_at)
  select v_calendario.account_id, v_calendario.specialist_id, v_calendario.id,
         l.external_id, l.starts_at, l.ends_at, p_instante
    from jsonb_to_recordset(v_lidos) as l (external_id text, starts_at timestamptz, ends_at timestamptz)
  on conflict (specialist_id, external_id) do update
     set calendar_id = excluded.calendar_id,
         starts_at = excluded.starts_at,
         ends_at = excluded.ends_at,
         synced_at = excluded.synced_at;

  v_quantos := jsonb_array_length(v_lidos);

  -- Na mesma transação da ocupação: synced_at que avança sem o retrato novo
  -- faria agenda velha parecer em dia.
  update public.specialist_calendars as k
     set synced_at = p_instante,
         sync_error = null
   where k.id = v_calendario.id;

  return v_quantos;
end;
$gravacao$;

comment on function public.gravar_ocupacao_do_calendario(uuid, jsonb, timestamptz) is
  'Substitui a ocupação lida de um calendário numa transação (T-10, RNF-06): atualiza pela chave (specialist_id, external_id), insere o novo, remove o que sumiu do provedor, e só então avança synced_at e limpa sync_error. Devolve quantos blocos ficaram. Só service_role.';

revoke execute on function public.gravar_ocupacao_do_calendario(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.gravar_ocupacao_do_calendario(uuid, jsonb, timestamptz) to service_role;

-- A falha de um calendário -----------------------------------------------------
-- Grava a frase em `sync_error` e deixa `synced_at` como estava: é a
-- comparação de `synced_at` com o relógio que diz há quanto tempo a ocupação
-- está velha. Os blocos também ficam: a última ocupação conhecida protege
-- melhor o especialista do que nenhuma.
create or replace function public.registrar_falha_de_sincronizacao(
  p_calendar_id uuid,
  p_mensagem text
)
returns void
language plpgsql
set search_path = ''
as $falha$
begin
  update public.specialist_calendars as k
     set sync_error = coalesce(nullif(btrim(left(p_mensagem, 1000)), ''), 'a sincronização falhou sem motivo informado')
   where k.id = p_calendar_id;
end;
$falha$;

comment on function public.registrar_falha_de_sincronizacao(uuid, text) is
  'Grava em sync_error a frase da falha de um calendário, sem tocar em synced_at nem na ocupação. Só service_role.';

revoke execute on function public.registrar_falha_de_sincronizacao(uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_falha_de_sincronizacao(uuid, text) to service_role;

-- O token de renovação ---------------------------------------------------------
-- O degrau do recurso da cascata de `_shared/secrets.ts`: o `index.ts` de quem
-- fala com o calendário (`cron-calendar-sync`, `tool-book-meeting`) lê o token
-- por aqui, a partir de `refresh_secret_id`. Mesma porta de
-- `get_account_secret`: security definer, e o grant só para service_role é a
-- fronteira. A conta entra no filtro para que um id de calendário vindo de
-- outra conta não resolva nada.
create or replace function public.token_do_calendario(
  p_account_id uuid,
  p_calendar_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $token$
  select v.decrypted_secret
    from public.specialist_calendars as k
    join vault.decrypted_secrets as v on v.id = k.refresh_secret_id
   where k.id = p_calendar_id
     and k.account_id = p_account_id;
$token$;

comment on function public.token_do_calendario(uuid, uuid) is
  'Token de renovação do calendário do especialista, em claro, lido do Vault por refresh_secret_id. Só service_role executa: é a porta das funções de servidor, nunca do navegador.';

revoke execute on function public.token_do_calendario(uuid, uuid) from public, anon, authenticated;
grant execute on function public.token_do_calendario(uuid, uuid) to service_role;

-- Agendamento (seção 4.6) -------------------------------------------------------
-- Cadência da tabela da seção 4.6. O comando é só a chamada a
-- `disparar_rotina`, sem endereço e sem segredo: os dois são lidos de
-- `app_config` e do Vault na hora do disparo (T-26).
select cron.schedule(
  'cron-calendar-sync',
  '*/5 * * * *',
  format('select public.disparar_rotina(%L)', 'cron-calendar-sync')
);
