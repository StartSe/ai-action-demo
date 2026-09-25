-- Especialistas: quem recebe a reunião que a Sarah marca.
-- Referência: docs/PRD-implementacao.md seções 3.3 e 3.9, docs/PRD.md RF-501,
-- RF-504, RF-505, RF-506, e docs/revisao-tecnica.md T-21 e L-16.
--
-- Esta tabela vem antes de qualquer ferramenta de agenda porque é ela que diz
-- *quando* uma pessoa pode receber reunião. Teto diário, antecedência mínima e
-- máxima e duração padrão são regra de produto que muda por especialista: um
-- consultor sênior atende quatro por dia com dois dias de antecedência, um
-- pré-vendas atende dez com duas horas. Nascendo como coluna com padrão, a
-- regra é editável por quem administra a conta; nascendo como constante no
-- código da ferramenta, seria editável por quem faz deploy.
--
-- `timezone` é o par da T-21: o horário se gera no fuso do especialista e se
-- fala no fuso do lead ("14h no seu horário, 15h aqui em São Paulo"). Sem a
-- coluna, a regra não tem onde morar e o gerador cairia no fuso da conta, que
-- é o fuso de quem contratou e não o de quem atende.
--
-- `last_assigned_at` é a marca do rodízio (L-16): `routing_weight` sozinho não
-- distribui carga, porque não guarda quem foi o último. Ela é escrita pelo
-- servidor a cada agendamento, e por isso fica fora da trilha de auditoria.

create table public.specialists (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  -- Nula é estado normal: conta que roteia por rodízio ou por especialista fixo
  -- nunca preenche área. Vazia não é: seria área com nome em branco no filtro.
  area text check (area is null or length(btrim(area)) > 0),
  -- Herdado da conta no insert, pelo gatilho abaixo, e editável depois.
  timezone text not null check (length(btrim(timezone)) > 0),
  -- Sem padrão de propósito: quem cadastra escolhe como a pessoa atende, e
  -- adivinhar 'video' para todo mundo agendaria presencial como vídeo.
  modalities text[] not null,
  default_duration_min smallint not null default 30,
  daily_cap smallint not null default 6,
  min_notice_min integer not null default 120,
  max_notice_days smallint not null default 30,
  -- Nulo aceito: RF-501 registra que a referência não guardava nem link de sala
  -- nem e-mail, e especialista que só atende presencial não tem sala nenhuma.
  room_url text check (room_url is null or length(btrim(room_url)) > 0),
  -- O e-mail não é opcional: RF-509 manda o convite da reunião para o
  -- especialista, e sem endereço a reunião nasce sem quem atenda sabendo dela.
  email text not null check (position('@' in btrim(email)) > 1),
  last_assigned_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Subconjunto não vazio das três modalidades. `<@` cobre o "subconjunto" e
  -- `cardinality` cobre o "não vazio": array vazio é subconjunto de qualquer
  -- coisa, e um especialista que não atende de jeito nenhum não é cadastro.
  constraint specialists_modalidades_conhecidas check (
    cardinality(modalities) > 0
    and modalities <@ array['video', 'telefone', 'presencial']::text[]
  ),
  constraint specialists_duracao_util check (default_duration_min between 15 and 240),
  constraint specialists_teto_util check (daily_cap between 1 and 20),
  constraint specialists_antecedencia_minima check (min_notice_min between 0 and 10080),
  constraint specialists_antecedencia_maxima check (max_notice_days between 1 and 90)
);

comment on table public.specialists is
  'Quem recebe a reunião. Teto diário, antecedência e duração padrão são colunas porque variam por pessoa e são editadas por quem administra a conta.';

comment on column public.specialists.timezone is
  'Fuso do especialista, herdado da conta no cadastro (T-21). O horário se gera neste fuso e se fala no fuso do lead.';

comment on column public.specialists.modalities is
  'Subconjunto não vazio de video, telefone e presencial. Modalidade nova é trabalho de migração: exige decidir o que a Sarah oferece.';

comment on column public.specialists.daily_cap is
  'Teto de reuniões por dia (RF-504). Sem ele o agente lota a agenda de uma pessoa só.';

comment on column public.specialists.min_notice_min is
  'Antecedência mínima em minutos (RF-505). Duas horas de padrão: a referência só evitava os trinta minutos seguintes.';

comment on column public.specialists.max_notice_days is
  'Antecedência máxima em dias (RF-505). Reunião marcada para daqui a três meses não acontece.';

comment on column public.specialists.room_url is
  'Endereço da sala de vídeo. Nulo é normal: RF-501 registra que a referência não guardava link, e quem atende presencial não tem sala.';

comment on column public.specialists.last_assigned_at is
  'Quando este especialista recebeu a última reunião. É a marca do rodízio (L-16), escrita pelo servidor no agendamento, e por isso fora da trilha de auditoria.';

-- Duas pessoas com o mesmo nome na mesma conta seriam duas linhas
-- indistinguíveis na tela de roteamento. A comparação ignora caixa e espaço de
-- borda, que é como quem digita erra.
create unique index specialists_nome_por_conta
  on public.specialists (account_id, lower(btrim(name)));

-- A consulta do roteamento por área: os ativos daquela área, naquela conta.
-- Parcial em `active` porque especialista desativado não entra em sorteio
-- nenhum, e mantê-lo no índice só engorda a varredura.
create index specialists_por_area
  on public.specialists (account_id, area)
  where active;

-- O fuso nasce com o da conta ------------------------------------------------------
-- A coluna é `not null`, e o `not null` é conferido **depois** dos gatilhos
-- `before`: quem cadastra pode omitir o fuso e recebe o da conta, quem informa
-- fica com o que informou. `security definer` porque a conta pode não estar ao
-- alcance da sessão — e nesse caso quem recusa é a política de insert, com a
-- mensagem certa, não um "fuso nulo" enganoso.
create or replace function public.herdar_fuso_da_conta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fuso$
begin
  if new.timezone is null then
    select a.timezone into new.timezone
      from public.accounts as a
     where a.id = new.account_id;
  end if;

  return new;
end;
$fuso$;

comment on function public.herdar_fuso_da_conta() is
  'Preenche timezone com o fuso da conta quando o insert o omite. Um default de coluna não alcança outra tabela.';

create trigger specialists_herdar_fuso
  before insert on public.specialists
  for each row execute function public.herdar_fuso_da_conta();

create trigger specialists_set_updated_at
  before update on public.specialists
  for each row execute function public.set_updated_at();

-- Isolamento (classe Configuração da seção 3.9) ------------------------------------
alter table public.specialists enable row level security;

create policy specialists_leitura_de_membro
  on public.specialists for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy specialists_leitura_de_membro on public.specialists is
  'Classe Configuração: todo membro lê os especialistas, porque a agenda e a ficha da reunião mostram quem atende.';

create policy specialists_insercao_de_admin
  on public.specialists for insert to authenticated
  with check ((select public.has_role(account_id, 'admin')));

comment on policy specialists_insercao_de_admin on public.specialists is
  'Classe Configuração: cadastrar especialista muda para onde a Sarah manda reunião, então é de administrador.';

create policy specialists_alteracao_de_admin
  on public.specialists for update to authenticated
  using ((select public.has_role(account_id, 'admin')))
  with check ((select public.has_role(account_id, 'admin')));

comment on policy specialists_alteracao_de_admin on public.specialists is
  'Classe Configuração: teto, antecedência e fuso decidem quando alguém recebe reunião. Operador não muda a agenda alheia.';

create policy specialists_exclusao_de_admin
  on public.specialists for delete to authenticated
  using ((select public.has_role(account_id, 'admin')));

comment on policy specialists_exclusao_de_admin on public.specialists is
  'Classe Configuração: apagar especialista é de administrador. Desativar por active é o caminho comum, porque a reunião passada continua apontando para ele.';

-- Auditoria ------------------------------------------------------------------------
-- `last_assigned_at` fora da comparação: o servidor a escreve a cada
-- agendamento, e sem tirá-la da trilha cada reunião marcada viraria um registro
-- de "especialista alterado" — o ruído afogaria a mudança de teto ou de fuso,
-- que é o fato que alguém vai procurar ali.
create trigger specialists_auditoria
  after update or delete on public.specialists
  for each row execute function public.registrar_auditoria('account_id', 'last_assigned_at');
