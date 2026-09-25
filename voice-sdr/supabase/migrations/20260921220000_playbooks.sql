-- Os playbooks: um roteiro por propósito (`playbooks`) e o histórico de versões
-- dele (`playbook_versions`), com uma publicada por vez.
-- Referência: docs/PRD-implementacao.md seções 3.4 e 3.9, docs/PRD.md RF-303 e
-- RF-304, docs/decisao-do-agente.md (os quatro propósitos) e
-- docs/revisao-tecnica.md T-01.
--
-- A pergunta que este par de tabelas existe para responder é uma só: meses
-- depois de uma ligação, por que a Sarah disse aquilo? Responder isso exige que
-- o roteiro tenha versão, que a versão tenha autor e nota, e que a que estava no
-- ar naquele dia continue no banco. Daí as três decisões:
--
-- 1. **Versão é linha, não coluna.** Editar não sobrescreve: cria a versão
--    seguinte. O que arquiva a anterior é publicar a próxima.
-- 2. **Uma publicada por playbook, e o banco é quem garante.** Único parcial em
--    (playbook_id) where status = 'published'. Sem ele, duas abas abertas
--    publicariam duas versões e ninguém saberia qual a Sarah leu.
-- 3. **O número da versão nasce de gatilho.** Duas abas que salvam ao mesmo
--    tempo não podem criar duas versões 3; quem numera é o banco, com a linha do
--    playbook travada, e o único em (playbook_id, version) é a rede embaixo.
--
-- A camada 1 do roteiro — o que vale para toda Sarah, de toda conta — **não é
-- coluna**: é constante versionada no repositório, e entra na compilação vinda
-- de lá. Ela muda com o produto, não com a conta, e guardá-la por conta faria
-- cada correção nossa exigir uma migração de dado em todas elas. A US-044 é
-- quem a escreve; aqui ficam só as camadas 2 (body_script, o roteiro da conta)
-- e 3 (body_house, o estilo da casa).

-- playbooks --------------------------------------------------------------------
create table public.playbooks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- Os mesmos quatro de `agent_publications`, e pela mesma razão: cada propósito
  -- tem o seu conjunto de ferramentas (T-01), e um roteiro de descoberta não
  -- serve para lembrar de reunião. Chave em inglês, rótulo em português na
  -- interface, como os `stage_key` da F1.
  purpose text not null check (purpose in ('discovery', 'reminder', 'rescue', 'followup')),
  -- A versão que está no ar. Nula enquanto nenhuma foi publicada, que é o estado
  -- da conta recém-criada. Quem a mantém é o gatilho de publicação, e a garantia
  -- de que existe uma só é o índice parcial de `playbook_versions` — esta coluna
  -- é o atalho que o compilador e a tela leem sem subconsulta.
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Um playbook por propósito por conta. A quinta linha seria uma segunda
  -- resposta para "qual é o roteiro de descoberta?", e a compilação escolheria
  -- por sorte.
  constraint playbooks_um_por_proposito unique (account_id, purpose),
  -- O par que a versão aponta de volta, para que nenhuma versão fique sob a
  -- conta errada. Ver o comentário da chave composta em `playbook_versions`.
  constraint playbooks_id_conta unique (id, account_id)
);

comment on table public.playbooks is
  'Um roteiro por propósito por conta (discovery, reminder, rescue, followup). O conteúdo não mora aqui: mora nas versões, e current_version_id aponta para a que está no ar. A camada 1 do roteiro não é coluna de tabela nenhuma — é constante versionada no repositório (US-044), porque muda com o produto e não com a conta.';

comment on column public.playbooks.purpose is
  'discovery, reminder, rescue ou followup, os mesmos quatro das publicações do agente. Propósito novo exige decidir o conjunto de ferramentas dele, então é migração.';

comment on column public.playbooks.current_version_id is
  'A versão publicada, ou nulo enquanto nenhuma foi. Mantida pelo gatilho de publicação; a garantia de unicidade é o índice parcial em playbook_versions.';

create trigger playbooks_set_updated_at
  before update on public.playbooks
  for each row execute function public.set_updated_at();

-- playbook_versions ------------------------------------------------------------
create table public.playbook_versions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  playbook_id uuid not null,
  -- Sequencial por playbook, e escrito pelo gatilho: o que o cliente mandar
  -- aqui é descartado. Ver `numerar_versao_de_playbook`.
  version integer not null check (version > 0),
  -- draft é o que está sendo escrito, published é o que a Sarah lê, archived é o
  -- que já esteve no ar. Não há "excluída": versão que saiu do ar continua no
  -- banco, senão a pergunta "por que ela disse aquilo em março?" fica sem
  -- resposta.
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  -- Camada 2: o roteiro da conta. Nasce vazio de propósito — a conta acabou de
  -- existir e ninguém escreveu nada ainda. Publicar vazio é que não pode, e
  -- quem recusa é o check de publicação completa, logo abaixo.
  body_script text not null default '',
  -- Camada 3: o estilo da casa, o que a Sarah nunca diz, como ela trata quem
  -- atende. Vazio é estado normal: a conta que não quer estilo próprio herda o
  -- da camada 1.
  body_house text not null default '',
  -- Por que esta versão existe. Viaja no payload da trilha quando ela é
  -- publicada, e é o que alguém lê meses depois em vez de diferenciar dois
  -- textos longos linha a linha.
  change_note text check (change_note is null or length(btrim(change_note)) > 0),
  -- Sem cascata para a saída de quem escreveu: a versão sobrevive ao autor, como
  -- a trilha de auditoria sobrevive a quem agiu. Nulo é a versão que nasceu com
  -- a conta, escrita por ninguém.
  author_id uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- O número é sequencial por playbook, e a rede embaixo do gatilho: se um dia
  -- duas transações escaparem da trava, a segunda cai aqui em vez de criar a
  -- segunda versão 3.
  constraint playbook_versions_uma_por_numero unique (playbook_id, version),
  -- O par que `playbooks.current_version_id` aponta de volta. Ver a chave
  -- composta de `playbooks`, logo abaixo.
  constraint playbook_versions_id_playbook unique (id, playbook_id),
  -- A versão pertence ao playbook **e** à conta dele. Chave composta em vez de
  -- duas simples porque duas simples deixariam passar uma versão da conta B
  -- pendurada num playbook da conta A: a política de escrita de B a aceitaria, e
  -- a linha ficaria invisível para quem é dono do playbook. Aqui o banco recusa.
  constraint playbook_versions_do_playbook_da_conta
    foreign key (playbook_id, account_id)
    references public.playbooks (id, account_id) on delete cascade,
  -- Publicar vazio é pôr a Sarah no ar sem roteiro. E publicada sem data seria
  -- uma versão no ar que ninguém sabe desde quando — a data vem do gatilho, e o
  -- check é o que garante que ninguém a apague depois com um update.
  constraint playbook_versions_publicada_completa check (
    status <> 'published'
    or (length(btrim(body_script)) > 0 and published_at is not null)
  )
);

comment on table public.playbook_versions is
  'O histórico do roteiro: uma linha por versão, sequencial por playbook e numerada pelo banco. body_script é a camada 2 (o roteiro da conta) e body_house é a camada 3 (o estilo da casa); a camada 1 não é coluna aqui, é constante versionada no repositório (US-044). Uma versão publicada por playbook, garantida pelo índice parcial, e publicar arquiva a anterior na mesma transação.';

comment on column public.playbook_versions.version is
  'Sequencial por playbook. Vem do gatilho numerar_versao_de_playbook, e o que o cliente mandar é descartado: duas abas abertas não podem criar duas versões 3.';

comment on column public.playbook_versions.status is
  'draft, published ou archived. Versão que saiu do ar fica archived e continua no banco, porque é ela que explica o que a Sarah disse naquele dia.';

comment on column public.playbook_versions.body_script is
  'Camada 2, o roteiro desta conta. Nasce vazio; publicar vazio é recusado pelo check de publicação completa.';

comment on column public.playbook_versions.body_house is
  'Camada 3, o estilo da casa. Vazio é normal: a conta sem estilo próprio herda o da camada 1, que mora no repositório.';

comment on column public.playbook_versions.change_note is
  'Por que esta versão existe. Viaja no payload da trilha quando ela é publicada.';

comment on column public.playbook_versions.author_id is
  'Quem escreveu. Nulo na versão que nasceu com a conta, e nulo de novo se a pessoa sair: a versão sobrevive ao autor.';

-- Uma publicada por playbook, e quem garante é o banco. Índice parcial e não
-- check porque a regra é entre linhas: o check só enxerga a linha que está
-- entrando.
create unique index playbook_versions_uma_publicada
  on public.playbook_versions (playbook_id)
  where status = 'published';

-- A consulta da tela de playbooks e da compilação: as versões daquele playbook,
-- da mais nova para a mais velha.
create index playbook_versions_por_playbook
  on public.playbook_versions (playbook_id, version desc);

-- O par da chave composta: `current_version_id` só aceita versão **deste**
-- playbook. Um `check` não serviria — check não consulta outra tabela —, e uma
-- chave simples para `playbook_versions (id)` aceitaria a versão de qualquer
-- playbook, inclusive de outra conta. O `set null` nomeia a coluna porque a
-- chave tem duas e a outra é a chave primária: zerar `id` seria impossível.
alter table public.playbooks
  add constraint playbooks_versao_atual_do_proprio
  foreign key (current_version_id, id)
  references public.playbook_versions (id, playbook_id)
  on delete set null (current_version_id)
  deferrable initially deferred;

create trigger playbook_versions_set_updated_at
  before update on public.playbook_versions
  for each row execute function public.set_updated_at();

-- Numeração --------------------------------------------------------------------
-- O número da versão é do banco, não do cliente. A trava na linha do playbook
-- serializa duas transações que salvem ao mesmo tempo: a segunda espera, lê o
-- máximo já com a primeira gravada, e nasce uma versão adiante em vez de colidir.
create or replace function public.numerar_versao_de_playbook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $numerar$
declare
  v_proxima integer;
begin
  perform 1 from public.playbooks as p where p.id = new.playbook_id for update;

  select coalesce(max(v.version), 0) + 1
    into v_proxima
    from public.playbook_versions as v
   where v.playbook_id = new.playbook_id;

  -- Sempre sobrescreve, e não só quando vem nulo: o número não é campo de
  -- formulário. Cliente que mandar 7 recebe o que vier na fila.
  new.version := v_proxima;
  return new;
end;
$numerar$;

comment on function public.numerar_versao_de_playbook() is
  'Numera a versão nova a partir do maior número do playbook, com a linha do playbook travada. Descarta o que o cliente mandar em version.';

revoke execute on function public.numerar_versao_de_playbook() from public;

create trigger playbook_versions_numerar
  before insert on public.playbook_versions
  for each row execute function public.numerar_versao_de_playbook();

-- Publicação -------------------------------------------------------------------
-- Publicar é um ato com três efeitos, e os três são da mesma transação: a
-- anterior vai para archived, a nova ganha a data, e o playbook passa a apontar
-- para ela. Arquivar acontece **antes** de a linha nova entrar, senão o índice
-- parcial recusaria a segunda publicada antes de qualquer gatilho `after` rodar.
create or replace function public.arquivar_publicacao_anterior()
returns trigger
language plpgsql
security definer
set search_path = ''
as $arquivar$
begin
  -- Só na transição. Sem esta guarda, corrigir uma vírgula da versão que está no
  -- ar reescreveria a data em que ela subiu, e a ficha da chamada passaria a
  -- dizer que a Sarah leu um roteiro publicado depois de a ligação acontecer.
  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  update public.playbook_versions as v
     set status = 'archived'
   where v.playbook_id = new.playbook_id
     and v.status = 'published'
     and v.id <> new.id;

  -- A data é do banco. Aceitá-la do cliente deixaria publicar uma versão
  -- "desde o ano passado", e a ficha da chamada diria que a Sarah leu um
  -- roteiro que ainda não existia.
  new.published_at := now();
  return new;
end;
$arquivar$;

comment on function public.arquivar_publicacao_anterior() is
  'Arquiva a versão publicada do mesmo playbook e carimba published_at, antes de a nova entrar. Publicar e arquivar são a mesma transação.';

revoke execute on function public.arquivar_publicacao_anterior() from public;

create trigger playbook_versions_publicar
  before insert or update on public.playbook_versions
  for each row
  when (new.status = 'published')
  execute function public.arquivar_publicacao_anterior();

-- O ponteiro e a trilha, depois que a linha já existe. São o mesmo ato: sem a
-- linha da trilha, "quem publicou isto, e por quê" não tem resposta; sem o
-- ponteiro, a compilação teria que procurar a publicada a cada chamada.
create or replace function public.concluir_publicacao_de_playbook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $concluir$
declare
  v_anterior uuid;
  v_versao_anterior integer;
  v_usuario uuid := auth.uid();
begin
  select p.current_version_id into v_anterior
    from public.playbooks as p
   where p.id = new.playbook_id;

  -- Nada a fazer quando a mesma versão publicada é atualizada de novo: o
  -- ponteiro já aponta para ela e o ato já está na trilha.
  if v_anterior is not distinct from new.id then
    return null;
  end if;

  select v.version into v_versao_anterior
    from public.playbook_versions as v
   where v.id = v_anterior;

  update public.playbooks as p
     set current_version_id = new.id
   where p.id = new.playbook_id;

  insert into public.audit_log
    (account_id, actor, actor_id, source, action, target_type, target_id, payload)
  values (
    new.account_id,
    case when v_usuario is null then 'system' else 'user' end,
    v_usuario,
    'trigger',
    'publish',
    'playbook_versions',
    new.id,
    jsonb_build_object(
      'version', new.version,
      'change_note', new.change_note,
      'versao_arquivada', v_versao_anterior
    )
  );

  return null;
end;
$concluir$;

comment on function public.concluir_publicacao_de_playbook() is
  'Aponta o playbook para a versão recém-publicada e registra a publicação na trilha, com a change_note no payload.';

revoke execute on function public.concluir_publicacao_de_playbook() from public;

create trigger playbook_versions_concluir_publicacao
  after insert or update on public.playbook_versions
  for each row
  when (new.status = 'published')
  execute function public.concluir_publicacao_de_playbook();

-- Os quatro playbooks nascem com a conta -----------------------------------------
-- Mesmo desenho do funil padrão e de `account_settings`: a lógica numa função
-- que recebe a conta, e o gatilho só a chama. Conta que chega à tela de
-- playbooks sem lugar onde escrever faria a primeira leitura virar escrita, e
-- quem só lê veria erro.
create or replace function public.criar_playbooks_para(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $playbooks$
declare
  v_purpose text;
  v_playbook uuid;
begin
  foreach v_purpose in array array['discovery', 'reminder', 'rescue', 'followup']
  loop
    insert into public.playbooks (account_id, purpose)
    values (p_account_id, v_purpose)
    on conflict (account_id, purpose) do nothing
    returning id into v_playbook;

    -- A versão vazia é o lugar onde escrever. Ela nasce draft: publicar é ato de
    -- gente, e uma conta nova não tem roteiro nenhum no ar.
    if v_playbook is not null then
      insert into public.playbook_versions (account_id, playbook_id)
      values (p_account_id, v_playbook);
    end if;
  end loop;
end;
$playbooks$;

comment on function public.criar_playbooks_para(uuid) is
  'Cria os quatro playbooks da conta, cada um com uma versão draft vazia. Chamada pelo gatilho em accounts e pelo remendo desta migração.';

revoke execute on function public.criar_playbooks_para(uuid) from public;

create or replace function public.criar_playbooks_da_conta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $gatilho$
begin
  perform public.criar_playbooks_para(new.id);
  return null;
end;
$gatilho$;

comment on function public.criar_playbooks_da_conta() is
  'Cria os quatro playbooks quando a conta nasce. Conta sem playbook não teria onde escrever o roteiro.';

create trigger accounts_criar_playbooks
  after insert on public.accounts
  for each row execute function public.criar_playbooks_da_conta();

-- Isolamento (classe Configuração da seção 3.9) ------------------------------------
-- Leitura de membro, escrita de administrador, nas duas. Não há política de
-- insert nem de delete em `playbooks`: as quatro linhas nascem com a conta, pelo
-- gatilho, e morrem com ela, por cascata — um insert de cliente só poderia
-- duplicar o que o único já recusa. E não há política de delete em
-- `playbook_versions` pela razão da tabela: histórico que o cliente apaga não é
-- histórico. A versão morre com o playbook, que morre com a conta.
alter table public.playbooks enable row level security;

create policy playbooks_leitura_de_membro
  on public.playbooks for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy playbooks_leitura_de_membro on public.playbooks is
  'Classe Configuração: todo membro lê o roteiro, porque a ficha da chamada mostra qual versão a Sarah leu.';

create policy playbooks_alteracao_de_admin
  on public.playbooks for update to authenticated
  using ((select public.has_role(account_id, 'admin')))
  with check ((select public.has_role(account_id, 'admin')));

comment on policy playbooks_alteracao_de_admin on public.playbooks is
  'Classe Configuração: trocar a versão no ar muda o que a Sarah fala com todo mundo. Operador não publica.';

alter table public.playbook_versions enable row level security;

create policy playbook_versions_leitura_de_membro
  on public.playbook_versions for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy playbook_versions_leitura_de_membro on public.playbook_versions is
  'Classe Configuração: todo membro lê o histórico do roteiro, porque é ele que explica o que a Sarah disse naquele dia.';

create policy playbook_versions_insercao_de_admin
  on public.playbook_versions for insert to authenticated
  with check ((select public.has_role(account_id, 'admin')));

comment on policy playbook_versions_insercao_de_admin on public.playbook_versions is
  'Classe Configuração: escrever versão nova é escrever o que a Sarah vai dizer, então é de administrador.';

create policy playbook_versions_alteracao_de_admin
  on public.playbook_versions for update to authenticated
  using ((select public.has_role(account_id, 'admin')))
  with check ((select public.has_role(account_id, 'admin')));

comment on policy playbook_versions_alteracao_de_admin on public.playbook_versions is
  'Classe Configuração: editar o rascunho e publicá-lo são a mesma escrita, e as duas são de administrador.';

-- Auditoria ------------------------------------------------------------------------
-- `status`, `published_at` e `current_version_id` saem da comparação genérica
-- porque quem os move é sempre a publicação, e a publicação tem linha própria,
-- com a nota e o número da versão que ela arquivou. Duas linhas para o mesmo ato
-- seriam ruído, e a que sobreviveria seria a pior das duas — a que diz "status
-- mudou" sem dizer por quê. O que a trilha genérica cobre aqui é a edição do
-- roteiro: quem mudou o texto, e o que ele era antes.
create trigger playbooks_auditoria
  after update or delete on public.playbooks
  for each row execute function public.registrar_auditoria('account_id', 'current_version_id');

create trigger playbook_versions_auditoria
  after update or delete on public.playbook_versions
  for each row execute function public.registrar_auditoria('account_id', 'status', 'published_at');

-- Retroação, no fim e depois de toda a DDL -------------------------------------
-- `db push` aplica as migrações pendentes numa transação só. Um insert que
-- dispara gatilho deixa eventos pendentes, e o `alter table ... enable row level
-- security` seguinte é recusado com 55006 ("cannot ALTER TABLE because it has
-- pending trigger events"). Em banco vazio a retroação não afeta linha nenhuma e
-- o erro não aparece — foi assim que isto passou no PGlite e quebrou no Postgres
-- real, na primeira conta de verdade. Estrutura primeiro, dado depois.
do $$
declare
  v_conta record;
begin
  for v_conta in select id from public.accounts loop
    perform public.criar_playbooks_para(v_conta.id);
  end loop;
end;
$$;
