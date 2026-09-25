-- Disponibilidade do especialista: o que está aberto (`specialist_availability`)
-- e o que está fechado (`specialist_blocks`).
-- Referência: docs/PRD-implementacao.md seções 3.3 e 3.9, docs/PRD.md RF-502 e
-- RF-503, docs/revisao-tecnica.md T-21.
--
-- As duas tabelas são o par da US-157: `specialists` diz *quem* recebe reunião
-- e com que teto; estas dizem *quando*. A regra semanal é a base, e o bloqueio
-- é a exceção pontual — férias, consulta médica, viagem. O gerador de horários
-- da US-164 lê a primeira, subtrai a segunda e devolve o que sobrou.
--
-- A escolha de tipo separa as duas na raiz. A disponibilidade é `time`, sem
-- data e sem fuso, porque "toda terça das 9 às 12" é regra recorrente e não
-- instante: guardá-la em `timestamptz` obrigaria a reescrever a linha a cada
-- mudança de horário de verão. O bloqueio é `timestamptz`, porque "de 3 a 10 de
-- março" é um trecho do calendário, com começo e fim que existem no relógio.

-- specialist_availability ---------------------------------------------------------
create table public.specialist_availability (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  specialist_id uuid not null references public.specialists (id) on delete cascade,
  -- 0 é domingo, como em `extract(dow from ...)`. A convenção do Postgres em vez
  -- da do JavaScript por acaso coincidirem: quem gera horário consulta o banco.
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Faixa de duração zero ou invertida não é agenda, é engano de digitação.
  -- Faixa que atravessa a meia-noite se escreve como duas linhas, uma em cada
  -- dia da semana; `24:00` é hora válida em `time` e fecha o dia inteiro.
  constraint specialist_availability_faixa_util check (end_time > start_time),
  -- Duas faixas no mesmo dia são o caso comum (manhã e tarde, com almoço no
  -- meio), então a chave carrega o horário de início. O que ela impede é a
  -- linha repetida, não a sobreposta.
  unique (specialist_id, weekday, start_time)
);

comment on table public.specialist_availability is
  'Disponibilidade semanal do especialista. As horas valem no fuso do especialista (specialists.timezone), nunca no da conta nem em UTC (T-21). Faixas sobrepostas do mesmo dia convivem aqui e são unidas pelo gerador de horários: nenhuma expressão imutável sobre time serve de chave de exclusão, então a união é do gerador e não do banco.';

comment on column public.specialist_availability.weekday is
  'Dia da semana, 0 é domingo e 6 é sábado, como em extract(dow from ...).';

comment on column public.specialist_availability.start_time is
  'Início da faixa, no fuso do especialista. Sem data e sem fuso de propósito: a regra é semanal e não pode ser reescrita a cada horário de verão.';

comment on column public.specialist_availability.end_time is
  'Fim da faixa, no fuso do especialista. Maior que o início; faixa que cruza a meia-noite se escreve como duas linhas.';

create trigger specialist_availability_set_updated_at
  before update on public.specialist_availability
  for each row execute function public.set_updated_at();

-- specialist_blocks ---------------------------------------------------------------
create table public.specialist_blocks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  specialist_id uuid not null references public.specialists (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Nula é estado normal: quem bloqueia a agenda não deve satisfação ao banco.
  -- Vazia não é, que seria motivo em branco na tela de quem for olhar depois.
  reason text check (reason is null or length(btrim(reason)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint specialist_blocks_intervalo_util check (ends_at > starts_at),
  -- Dois bloqueios sobrepostos da mesma pessoa não dizem nada que um só não
  -- dissesse, e cada um deles é uma consulta a mais no gerador de horários. O
  -- intervalo é fechado no início e aberto no fim, então bloqueio que termina
  -- às 10h convive com o que começa às 10h. btree_gist vem da migração da F0 e
  -- é o que permite misturar a igualdade do especialista com a sobreposição do
  -- intervalo na mesma restrição.
  constraint specialist_blocks_sem_sobreposicao exclude using gist (
    specialist_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
);

comment on table public.specialist_blocks is
  'Bloqueios pontuais do especialista: férias, compromisso, ausência. O que a disponibilidade semanal abre, o bloqueio fecha. Ocupação vinda de calendário externo não entra aqui, e sim em specialist_busy_blocks, porque uma é declarada e a outra é lida de fora.';

comment on column public.specialist_blocks.reason is
  'Motivo do bloqueio, para quem for olhar a agenda depois. Nulo é normal.';

create trigger specialist_blocks_set_updated_at
  before update on public.specialist_blocks
  for each row execute function public.set_updated_at();

-- Isolamento (classe Configuração da seção 3.9) ------------------------------------
-- As duas carregam `account_id` ainda que a conta também venha pelo especialista.
-- É a coluna que a política lê, que o check:sql cobra e que a varredura de
-- travessia usa; declará-las em LIGACOES_DECLARADAS esconderia a política atrás
-- de um join.
alter table public.specialist_availability enable row level security;

create policy specialist_availability_leitura_de_membro
  on public.specialist_availability for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy specialist_availability_leitura_de_membro on public.specialist_availability is
  'Classe Configuração: todo membro lê a disponibilidade, porque a agenda e a ficha da reunião mostram quando cada pessoa atende.';

create policy specialist_availability_insercao_de_admin
  on public.specialist_availability for insert to authenticated
  with check ((select public.has_role(account_id, 'admin')));

comment on policy specialist_availability_insercao_de_admin on public.specialist_availability is
  'Classe Configuração: abrir faixa é decidir quando a Sarah pode marcar reunião com alguém, então é de administrador.';

create policy specialist_availability_alteracao_de_admin
  on public.specialist_availability for update to authenticated
  using ((select public.has_role(account_id, 'admin')))
  with check ((select public.has_role(account_id, 'admin')));

comment on policy specialist_availability_alteracao_de_admin on public.specialist_availability is
  'Classe Configuração: mudar a faixa muda a agenda de outra pessoa. Operador não mexe.';

create policy specialist_availability_exclusao_de_admin
  on public.specialist_availability for delete to authenticated
  using ((select public.has_role(account_id, 'admin')));

comment on policy specialist_availability_exclusao_de_admin on public.specialist_availability is
  'Classe Configuração: fechar a faixa toda é de administrador, como abri-la.';

alter table public.specialist_blocks enable row level security;

create policy specialist_blocks_leitura_de_membro
  on public.specialist_blocks for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy specialist_blocks_leitura_de_membro on public.specialist_blocks is
  'Classe Configuração: todo membro lê os bloqueios, porque a agenda precisa mostrar por que aquele horário não aparece.';

create policy specialist_blocks_insercao_de_admin
  on public.specialist_blocks for insert to authenticated
  with check ((select public.has_role(account_id, 'admin')));

comment on policy specialist_blocks_insercao_de_admin on public.specialist_blocks is
  'Classe Configuração: bloquear agenda tira horário do que a Sarah oferece, então é de administrador.';

create policy specialist_blocks_alteracao_de_admin
  on public.specialist_blocks for update to authenticated
  using ((select public.has_role(account_id, 'admin')))
  with check ((select public.has_role(account_id, 'admin')));

comment on policy specialist_blocks_alteracao_de_admin on public.specialist_blocks is
  'Classe Configuração: mover um bloqueio devolve horário à oferta. Operador não decide isso pelo especialista.';

create policy specialist_blocks_exclusao_de_admin
  on public.specialist_blocks for delete to authenticated
  using ((select public.has_role(account_id, 'admin')));

comment on policy specialist_blocks_exclusao_de_admin on public.specialist_blocks is
  'Classe Configuração: apagar bloqueio reabre a agenda, e reabrir agenda alheia é de administrador.';

-- Auditoria ------------------------------------------------------------------------
-- As duas têm updated_at, e mudança de agenda é exatamente o que alguém vai
-- procurar na trilha quando um horário aparecer — ou sumir — sem explicação.
create trigger specialist_availability_auditoria
  after update or delete on public.specialist_availability
  for each row execute function public.registrar_auditoria();

create trigger specialist_blocks_auditoria
  after update or delete on public.specialist_blocks
  for each row execute function public.registrar_auditoria();
