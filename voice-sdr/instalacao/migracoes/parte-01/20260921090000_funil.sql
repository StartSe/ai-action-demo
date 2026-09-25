-- O funil: `pipelines` e `pipeline_stages`.
-- Referência: docs/PRD-implementacao.md seção 3.2 e docs/PRD.md RF-201 a RF-207.
--
-- Vem antes de `leads` porque o lead nasce apontando para uma etapa. A etapa
-- tem duas identidades: `key`, que a automação usa e que nunca muda, e `label`,
-- que aparece na tela e que o cliente renomeia à vontade. Renomear "Qualificado"
-- para "Tem fit" não pode quebrar nada, e é a chave imutável que garante isso
-- (RF-203). Um gatilho recusa a alteração da chave em vez de confiar em quem
-- escreve o update.
--
-- O quadro do funil é da F4. Aqui existe só o esquema que a lista de leads e a
-- importação consomem.

-- pipelines --------------------------------------------------------------------
create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, name)
);

comment on table public.pipelines is
  'Funis da conta. Uma conta nasce com um funil padrão, criado pelo gatilho em accounts.';

-- Um só padrão por conta. Índice parcial em vez de check: a regra é entre
-- linhas, e `unique (account_id, is_default)` permitiria dois `false`.
create unique index pipelines_um_padrao_por_conta
  on public.pipelines (account_id)
  where is_default;

create trigger pipelines_set_updated_at
  before update on public.pipelines
  for each row execute function public.set_updated_at();

-- pipeline_stages --------------------------------------------------------------
create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  pipeline_id uuid not null references public.pipelines (id) on delete cascade,
  -- A identidade que a automação cita. Ampliar a lista é trabalho de migração,
  -- não de código: etapa nova exige decidir o que a Sarah faz com ela.
  key text not null check (
    key in ('new', 'contacted', 'qualified', 'meeting_booked', 'won', 'lost')
  ),
  label text not null check (length(btrim(label)) > 0),
  position smallint not null check (position >= 0),
  color text,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pipeline_id, key),
  unique (pipeline_id, position),
  -- Desfecho é da etapa, não do rótulo: `won` é ganho e `lost` é perda, e
  -- nenhuma outra etapa pode se declarar desfecho.
  check (is_won = (key = 'won')),
  check (is_lost = (key = 'lost'))
);

comment on table public.pipeline_stages is
  'Etapas do funil. `key` é imutável e é o que a automação cita; `label` é o que aparece na tela e o cliente renomeia.';

comment on column public.pipeline_stages.key is
  'Identificador estável da etapa. Um gatilho recusa alteração: renomear é mexer em label (RF-203).';

create trigger pipeline_stages_set_updated_at
  before update on public.pipeline_stages
  for each row execute function public.set_updated_at();

-- A chave não muda ---------------------------------------------------------------
-- Sem este gatilho, a promessa de RF-203 dependeria de ninguém escrever o
-- update errado. A recusa é do banco, e a mensagem é em português porque chega
-- à tela.
create or replace function public.recusar_troca_de_chave_de_etapa()
returns trigger
language plpgsql
set search_path = ''
as $recusa$
begin
  if new.key is distinct from old.key then
    raise exception 'a chave da etapa não muda: renomeie o rótulo'
      using errcode = '42501';
  end if;

  return new;
end;
$recusa$;

comment on function public.recusar_troca_de_chave_de_etapa() is
  'Recusa update que altere pipeline_stages.key. A automação cita a chave, então mudá-la quebraria o que já está escrito.';

create trigger pipeline_stages_chave_imutavel
  before update on public.pipeline_stages
  for each row execute function public.recusar_troca_de_chave_de_etapa();

-- O funil padrão nasce com a conta ----------------------------------------------
-- Mesmo desenho do gatilho de `onboarding_state`: a conta não precisa saber
-- criar o próprio funil, e conta criada por qualquer caminho já nasce completa.
-- A lógica fica numa função que recebe a conta, e o gatilho só a chama. Assim
-- ela serve aos dois casos: a conta que nasce agora e a que já existia quando
-- esta migração rodou.
create or replace function public.criar_funil_padrao_para(p_account_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $funil$
declare
  v_pipeline uuid;
begin
  insert into public.pipelines (account_id, name, is_default)
  values (p_account_id, 'Funil padrão', true)
  returning id into v_pipeline;

  insert into public.pipeline_stages
    (account_id, pipeline_id, key, label, position, is_won, is_lost)
  values
    (p_account_id, v_pipeline, 'new',            'Novo',            0, false, false),
    (p_account_id, v_pipeline, 'contacted',      'Contatado',       1, false, false),
    (p_account_id, v_pipeline, 'qualified',      'Qualificado',     2, false, false),
    (p_account_id, v_pipeline, 'meeting_booked', 'Reunião marcada', 3, false, false),
    (p_account_id, v_pipeline, 'won',            'Ganho',           4, true,  false),
    (p_account_id, v_pipeline, 'lost',           'Perdido',         5, false, true);

  return v_pipeline;
end;
$funil$;

comment on function public.criar_funil_padrao_para(uuid) is
  'Cria o funil padrão e as seis etapas para uma conta. Chamada pelo gatilho em accounts e pelo remendo desta migração.';

-- Quem chama é o gatilho, em nome do sistema. Ninguém cria funil padrão à mão.
revoke execute on function public.criar_funil_padrao_para(uuid) from public;

create or replace function public.criar_funil_padrao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $gatilho$
begin
  perform public.criar_funil_padrao_para(new.id);
  return new;
end;
$gatilho$;

comment on function public.criar_funil_padrao() is
  'Cria o funil padrão quando a conta nasce. Conta sem etapa não teria onde pendurar o primeiro lead.';

create trigger accounts_criar_funil_padrao
  after insert on public.accounts
  for each row execute function public.criar_funil_padrao();

-- Conta que já existe também ganha o funil: a migração roda sobre banco com
-- dado, e sem isto a conta anterior ficaria sem etapa para o lead apontar.
do $$
declare
  v_conta record;
begin
  for v_conta in select id from public.accounts loop
    if not exists (
      select 1 from public.pipelines as p where p.account_id = v_conta.id
    ) then
      perform public.criar_funil_padrao_para(v_conta.id);
    end if;
  end loop;
end;
$$;

-- Isolamento (classe Configuração da seção 3.9) ----------------------------------
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;

create policy pipelines_leitura_de_membro
  on public.pipelines for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy pipelines_leitura_de_membro on public.pipelines is
  'Classe Configuração: todo membro lê o funil, porque toda tela de lead mostra etapa.';

-- Uma política por comando, e nunca `for all`: `for all` inclui `select`, e a
-- leitura ganharia um segundo caminho por onde o administrador entra. Além de
-- embaralhar a intenção, isso faz a varredura de travessia deixar de medir a
-- política de leitura — derrubá-la não fecharia nada.
create policy pipelines_insercao_de_admin
  on public.pipelines for insert to authenticated
  with check ((select public.has_role(account_id, 'admin')));

comment on policy pipelines_insercao_de_admin on public.pipelines is
  'Classe Configuração: criar funil muda o significado do dado de todo mundo, então é de administrador.';

create policy pipelines_alteracao_de_admin
  on public.pipelines for update to authenticated
  using ((select public.has_role(account_id, 'admin')))
  with check ((select public.has_role(account_id, 'admin')));

comment on policy pipelines_alteracao_de_admin on public.pipelines is
  'Classe Configuração: renomear ou trocar o funil padrão é de administrador.';

create policy pipelines_exclusao_de_admin
  on public.pipelines for delete to authenticated
  using ((select public.has_role(account_id, 'admin')));

comment on policy pipelines_exclusao_de_admin on public.pipelines is
  'Classe Configuração: apagar funil é de administrador. O lead aponta para etapa, então a cascata é sentida por todo mundo.';

create policy pipeline_stages_leitura_de_membro
  on public.pipeline_stages for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy pipeline_stages_leitura_de_membro on public.pipeline_stages is
  'Classe Configuração: todo membro lê as etapas, porque o quadro e a ficha do lead as mostram.';

create policy pipeline_stages_insercao_de_admin
  on public.pipeline_stages for insert to authenticated
  with check ((select public.has_role(account_id, 'admin')));

comment on policy pipeline_stages_insercao_de_admin on public.pipeline_stages is
  'Classe Configuração: etapa nova é de administrador. A chave é restrita por check, então nem ele inventa etapa que a automação não conhece.';

create policy pipeline_stages_alteracao_de_admin
  on public.pipeline_stages for update to authenticated
  using ((select public.has_role(account_id, 'admin')))
  with check ((select public.has_role(account_id, 'admin')));

comment on policy pipeline_stages_alteracao_de_admin on public.pipeline_stages is
  'Classe Configuração: renomear ou reordenar etapa é de administrador; a chave não muda nem para ele, e quem recusa é o gatilho.';

create policy pipeline_stages_exclusao_de_admin
  on public.pipeline_stages for delete to authenticated
  using ((select public.has_role(account_id, 'admin')));

comment on policy pipeline_stages_exclusao_de_admin on public.pipeline_stages is
  'Classe Configuração: apagar etapa é de administrador. O lead aponta para ela, então a F4 é que trava as canônicas.';

-- Auditoria ----------------------------------------------------------------------
-- As duas têm `updated_at`, então a varredura estrutural de
-- testes/banco/registro-de-auditoria.test.ts cobra o gatilho.
create trigger pipelines_auditoria
  after update or delete on public.pipelines
  for each row execute function public.registrar_auditoria();

create trigger pipeline_stages_auditoria
  after update or delete on public.pipeline_stages
  for each row execute function public.registrar_auditoria();
