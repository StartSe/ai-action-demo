-- Configuração inicial: em que passo a conta está e o que cada pendência
-- impede de funcionar.
-- Referência: docs/PRD.md RF-911, docs/PRD-implementacao.md seções 3.8
-- (onboarding_state), 4.5 (onboarding_health) e 3.9 (classe Configuração).
--
-- Duas coisas diferentes moram aqui, e misturá-las é o erro que esta migração
-- existe para evitar:
--
-- 1. O **progresso declarado** — em que passo a pessoa está, o que ela marcou
--    como visto, se dispensou o assistente. É estado da conta, escrito pelo
--    cliente, e mora em `onboarding_state`.
-- 2. A **pendência medida** — se há chave de voz, se há número, se há
--    especialista. Isso não se declara: se mede, olhando o dado. É o que
--    `onboarding_health` calcula.
--
-- Marcar um passo como feito não faz a Sarah ligar. Por isso `pendente` vem
-- sempre do dado e nunca da marcação: um checklist que se deixa enganar por
-- quem o preenche informa menos do que checklist nenhum.
--
-- O catálogo de passos alcança tabelas que ainda não existem — número,
-- especialista e lead chegam nas fases seguintes. Um passo cuja tabela ainda
-- não nasceu volta `pendente` e `disponivel = false`: continua pendente,
-- porque não há número mesmo, mas a interface sabe que ainda não há onde
-- resolvê-lo. Fingir que o passo não existe esconderia metade da configuração
-- de quem acabou de criar a conta.

-- Catálogo de passos ---------------------------------------------------------
-- Dado, não `case`: passo novo entra na lista e nasce com medição, com
-- bloqueio e com teste. Cada linha diz onde a evidência do passo mora
-- (`tabela` mais `condicao`) e que funcionalidade fica de fora enquanto ela
-- não existir (`bloqueia`).
--
-- Os códigos de `bloqueia` são três, e a frase de cada um é da interface:
--   ligacao      a Sarah não consegue fazer nem receber chamada
--   agendamento  a conversa não vira reunião marcada
--   campanha     não há para quem ligar em lote
-- Passo opcional bloqueia lista vazia, e a lista vazia é a resposta: convidar
-- a equipe deixa a conta mais confortável e não desbloqueia nada.
create or replace function public.passos_de_configuracao()
returns table (
  passo text,
  ordem smallint,
  tabela text,
  condicao text,
  bloqueia text[]
)
language sql
immutable
set search_path = ''
as $catalogo$
  select *
    from (values
      -- A chave do provedor de voz é o primeiro degrau de tudo: sem ela não
      -- há agente publicado, e sem agente não há ligação.
      ('credenciais', 1::smallint, 'account_secrets', 'provider = ''voz''',
       array['ligacao']),
      ('agente', 2::smallint, 'agents', null::text,
       array['ligacao']),
      -- Roteiro conta quando está publicado. Rascunho não vai para chamada.
      ('roteiro', 3::smallint, 'playbook_versions', 'status = ''published''',
       array['ligacao']),
      -- Linha desligada é o mesmo que linha inexistente para quem disca.
      ('numero', 4::smallint, 'phone_lines', 'enabled',
       array['ligacao']),
      ('especialista', 5::smallint, 'specialists', null::text,
       array['agendamento']),
      -- Sem calendário conectado a agenda é chute: a Sarah marcaria em cima de
      -- compromisso existente.
      ('agenda', 6::smallint, 'specialist_calendars', null::text,
       array['agendamento']),
      ('leads', 7::smallint, 'leads', null::text,
       array['campanha']),
      -- Único passo opcional, e por isso o único que não bloqueia nada.
      ('equipe', 8::smallint, 'account_members', 'role <> ''owner''',
       array[]::text[])
    ) as p (passo, ordem, tabela, condicao, bloqueia);
$catalogo$;

comment on function public.passos_de_configuracao() is
  'Os oito passos da configuração inicial: onde a evidência de cada um mora e que funcionalidade ele destrava.';

-- Passo que não está no catálogo não entra na coluna: sem esta conferência,
-- um erro de digitação no cliente viraria um passo fantasma que nunca fecha.
create or replace function public.passos_conhecidos(p_passos text[])
returns boolean
language sql
immutable
set search_path = ''
as $conhecidos$
  select coalesce(p_passos, array[]::text[])
         <@ (select array_agg(c.passo) from public.passos_de_configuracao() as c);
$conhecidos$;

comment on function public.passos_conhecidos(text[]) is
  'Verdadeiro quando todo elemento é um passo do catálogo. Usada nos check de onboarding_state.';

-- onboarding_state -------------------------------------------------------------
create table public.onboarding_state (
  id uuid primary key default gen_random_uuid(),
  -- Uma linha por conta, e não uma por pessoa: a configuração é da empresa.
  -- Quem entra depois encontra o progresso de quem começou.
  account_id uuid not null unique references public.accounts (id) on delete cascade,
  current_step text check (current_step is null or public.passos_conhecidos(array[current_step])),
  completed_steps text[] not null default array[]::text[]
    check (public.passos_conhecidos(completed_steps)),
  -- Quem fecha o assistente não some com a pendência: o checklist continua no
  -- painel. O que muda é o assistente parar de abrir sozinho.
  dismissed_at timestamptz,
  -- Retrato do último cálculo de onboarding_health, para a tela abrir sem
  -- esperar a medição. Escrito só por onboarding_health_refresh.
  health jsonb not null default '{}'::jsonb check (jsonb_typeof(health) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.onboarding_state is
  'Progresso declarado da configuração inicial, uma linha por conta. A pendência real não está aqui: está em onboarding_health.';

comment on column public.onboarding_state.current_step is
  'Passo em que o assistente parou. Nulo quando não há passo em curso.';

comment on column public.onboarding_state.completed_steps is
  'Passos que a pessoa marcou como vistos. Marcar não desfaz a pendência medida.';

comment on column public.onboarding_state.health is
  'Retrato do último onboarding_health_refresh. Cache do servidor: o cliente não escreve nesta coluna.';

create trigger onboarding_state_set_updated_at
  before update on public.onboarding_state
  for each row execute function public.set_updated_at();

-- A coluna health é cálculo do servidor, e a política de update é de admin:
-- sem esta trava, a mesma escrita que avança o assistente poderia gravar um
-- retrato inventado, e a tela mostraria tudo verde numa conta que não liga. O
-- portão é o parâmetro de sessão que onboarding_health_refresh levanta, no
-- mesmo espírito de app.audit_reason.
--
-- O alcance da trava é o do cliente, e é o que basta: pelo PostgREST não há
-- como chamar set_config, que vive em pg_catalog e não é exposto. Quem executa
-- SQL arbitrário no banco já passa por cima de tudo, aqui e em qualquer outra
-- tabela.
create or replace function public.proteger_retrato_de_configuracao()
returns trigger
language plpgsql
set search_path = ''
as $retrato$
begin
  if coalesce(current_setting('app.onboarding_retrato', true), '') <> 'on' then
    new.health := old.health;
  end if;
  return new;
end;
$retrato$;

comment on function public.proteger_retrato_de_configuracao() is
  'Descarta escrita de onboarding_state.health que não venha de onboarding_health_refresh.';

create trigger onboarding_state_protege_retrato
  before update on public.onboarding_state
  for each row execute function public.proteger_retrato_de_configuracao();

-- A linha nasce com a conta. Sem isto, a primeira leitura do assistente teria
-- que criar a linha, e criar linha é escrita: a tela viraria escrita em quem
-- só tem leitura.
create or replace function public.criar_configuracao_inicial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $inicial$
begin
  insert into public.onboarding_state (account_id, current_step)
  values (
    new.id,
    (select c.passo from public.passos_de_configuracao() as c order by c.ordem limit 1)
  )
  on conflict (account_id) do nothing;
  return null;
end;
$inicial$;

comment on function public.criar_configuracao_inicial() is
  'Cria a linha de onboarding_state da conta recém-criada, no primeiro passo do catálogo.';

create trigger accounts_configuracao_inicial
  after insert on public.accounts
  for each row execute function public.criar_configuracao_inicial();

-- Conta que já existia quando esta migração chegou também tem configuração.
insert into public.onboarding_state (account_id, current_step)
select a.id,
       (select c.passo from public.passos_de_configuracao() as c order by c.ordem limit 1)
  from public.accounts as a
on conflict (account_id) do nothing;

-- Isolamento ---------------------------------------------------------------------
-- Classe Configuração: membro lê, admin escreve. Não há política de insert nem
-- de delete, e é deliberado: a linha nasce com a conta, pelo gatilho, e morre
-- com ela, por cascata. Um insert de cliente só conseguiria duplicar o que já
-- existe, e o unique o recusaria de qualquer forma.
alter table public.onboarding_state enable row level security;

create policy onboarding_state_leitura_membro
  on public.onboarding_state
  for select
  to authenticated
  using ((select public.is_member(account_id)));

comment on policy onboarding_state_leitura_membro on public.onboarding_state is
  'Classe Configuração: qualquer membro acompanha o que falta configurar na própria conta.';

create policy onboarding_state_atualizacao_admin
  on public.onboarding_state
  for update
  to authenticated
  using ((select public.has_role(account_id, 'admin')))
  with check ((select public.has_role(account_id, 'admin')));

comment on policy onboarding_state_atualizacao_admin on public.onboarding_state is
  'Classe Configuração: avançar o assistente é ato de quem administra a conta. A coluna health fica fora, por gatilho.';

-- A trilha guarda quem dispensou o assistente e quando o progresso andou. O
-- segundo argumento tira `health` da comparação: recalcular o retrato é
-- trabalho do servidor, não fato auditável, e sem isso cada leitura da tela
-- viraria uma linha de auditoria.
create trigger onboarding_state_auditoria
  after update or delete on public.onboarding_state
  for each row execute function public.registrar_auditoria('account_id', 'health');

-- Medição ------------------------------------------------------------------------
-- O catálogo aponta para tabelas de fases futuras, então a medição pergunta
-- antes se a tabela existe. Existir e não ter account_id é caso de erro, não
-- de passo silenciosamente pendente: seria uma tabela que a varredura de
-- isolamento também não saberia ligar à conta.
create or replace function public.tabela_de_passo_medivel(p_tabela text)
returns boolean
language plpgsql
stable
set search_path = ''
as $medivel$
declare
  v_tabela oid := to_regclass('public.' || quote_ident(p_tabela));
begin
  if v_tabela is null then
    return false;
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_attribute as a
     where a.attrelid = v_tabela
       and a.attname = 'account_id'
       and a.attnum > 0
       and not a.attisdropped
  ) then
    raise exception 'public.% não tem account_id e a configuração inicial não sabe quais linhas são da conta', p_tabela
      using hint = 'declare a ligação em passos_de_configuracao ou dê account_id à tabela';
  end if;

  return true;
end;
$medivel$;

comment on function public.tabela_de_passo_medivel(text) is
  'Verdadeiro quando a tabela do passo já existe neste banco e carrega account_id.';

-- onboarding_health ----------------------------------------------------------------
-- Uma linha por passo, na ordem do assistente. `pendente` é medido, `marcado`
-- é declarado, e os dois aparecem porque dizem coisas diferentes: passo
-- marcado e pendente é justamente o que a tela precisa apontar.
--
-- security definer porque a medição atravessa tabela que o cliente não lê
-- (`account_secrets` não tem política nenhuma). O que sai daqui é contagem
-- reduzida a sim ou não — nunca a linha, nunca o valor.
create or replace function public.onboarding_health(p_account_id uuid)
returns table (
  passo text,
  ordem smallint,
  pendente boolean,
  marcado boolean,
  disponivel boolean,
  bloqueia text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $saude$
declare
  v_catalogo record;
  v_marcados text[];
  v_tem boolean;
begin
  if not public.is_member(p_account_id) then
    raise exception 'a configuração inicial é da conta de que se participa'
      using errcode = '42501';
  end if;

  select coalesce(o.completed_steps, array[]::text[])
    into v_marcados
    from public.onboarding_state as o
   where o.account_id = p_account_id;
  v_marcados := coalesce(v_marcados, array[]::text[]);

  for v_catalogo in
    select c.passo, c.ordem, c.tabela, c.condicao, c.bloqueia
      from public.passos_de_configuracao() as c
     order by c.ordem
  loop
    disponivel := public.tabela_de_passo_medivel(v_catalogo.tabela);

    if disponivel then
      execute format(
        'select exists (select 1 from public.%I as t where t.account_id = $1 and (%s))',
        v_catalogo.tabela,
        coalesce(v_catalogo.condicao, 'true')
      )
      into v_tem
      using p_account_id;
    else
      v_tem := false;
    end if;

    passo := v_catalogo.passo;
    ordem := v_catalogo.ordem;
    pendente := not v_tem;
    marcado := v_catalogo.passo = any (v_marcados);
    bloqueia := v_catalogo.bloqueia;
    return next;
  end loop;
end;
$saude$;

comment on function public.onboarding_health(uuid) is
  'Um passo por linha: se está pendente (medido no dado), se foi marcado, se já dá para resolver e o que ele bloqueia enquanto não for feito.';

revoke execute on function public.onboarding_health(uuid) from public;
grant execute on function public.onboarding_health(uuid) to authenticated, service_role;

-- Retrato ----------------------------------------------------------------------------
-- Guarda em `health` o resultado da medição, para o painel abrir sem esperá-la,
-- e devolve o mesmo objeto a quem pediu. `bloqueado` já vem resolvido: é a
-- união do que os passos pendentes impedem, que é a pergunta que o painel faz.
create or replace function public.onboarding_health_refresh(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $refresh$
declare
  v_retrato jsonb;
begin
  -- Sem conferir o vínculo aqui: onboarding_health já recusa quem não é
  -- membro, e duas recusas para a mesma regra é uma a mais para divergir.
  with saude as (
    select * from public.onboarding_health(p_account_id)
  )
  select jsonb_build_object(
    'calculado_em', now(),
    'passos', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'passo', s.passo,
            'ordem', s.ordem,
            'pendente', s.pendente,
            'marcado', s.marcado,
            'disponivel', s.disponivel,
            'bloqueia', to_jsonb(s.bloqueia)
          )
          order by s.ordem
        ),
        '[]'::jsonb
      )
      from saude as s
    ),
    'pendentes', (select count(*) from saude as s where s.pendente),
    'bloqueado', (
      select coalesce(jsonb_agg(distinct funcionalidade), '[]'::jsonb)
        from saude as s, unnest(s.bloqueia) as funcionalidade
       where s.pendente
    )
  )
  into v_retrato;

  perform set_config('app.onboarding_retrato', 'on', true);
  update public.onboarding_state as o
     set health = v_retrato
   where o.account_id = p_account_id;
  -- O portão fecha na mesma passagem: numa transação longa, deixá-lo aberto
  -- permitiria a escrita seguinte gravar o retrato que quisesse.
  perform set_config('app.onboarding_retrato', '', true);

  return v_retrato;
end;
$refresh$;

comment on function public.onboarding_health_refresh(uuid) is
  'Recalcula a configuração inicial, grava o retrato em onboarding_state.health e o devolve. Única escrita legítima dessa coluna.';

revoke execute on function public.onboarding_health_refresh(uuid) from public;
grant execute on function public.onboarding_health_refresh(uuid) to authenticated, service_role;
