-- O ensaio conferido contra a seção 3.5 (US-098, T-16).
--
-- RECONCILIAÇÃO: `rehearsals` nasceu em 20260924120000_ensaio.sql (US-247).
-- Esta migração não recria: confere coluna a coluna com `add column if not
-- exists` e completa o que a seção 3.5 e a decisão de T-16 pedem e a primeira
-- versão deixou aberto.
--
-- **NÃO EXISTE ENSAIO SEM PUBLICAÇÃO.** `agent_publication_id` passa a ser
-- obrigatório. A primeira versão o deixava nulo com `on delete set null`, e
-- coluna nula aqui é a porta pela qual um segundo tempo de execução nosso
-- voltaria: um ensaio que não aponta para o agente publicado ensaiou outra
-- coisa. A chave passa a `no action`: apagar uma publicação que foi ensaiada é
-- recusado, porque o ensaio é o registro do que foi testado antes de ir ao ar.
-- A chave é `deferrable initially deferred` pela regra de supabase/CLAUDE.md
-- para duas filhas da mesma conta: apagar a conta cascateia para a publicação
-- e para o ensaio no mesmo comando, em ordem que não é contrato, e a
-- conferência no fim da transação é a forma que sobrevive às duas ordens.
--
-- **ENSAIO PENDURADO EM CHAMADA REAL É DADO SUJO.** O gatilho recusa o ensaio
-- cuja chamada não seja `direction = 'rehearsal'`, de outra conta, ou cuja
-- publicação seja de outra conta ou de outro propósito. Depois que um ensaio
-- aponta para uma ligação de verdade, ninguém mais separa um do outro.

-- Colunas da seção 3.5 ----------------------------------------------------------
alter table public.rehearsals add column if not exists account_id uuid;
alter table public.rehearsals add column if not exists call_id uuid;
alter table public.rehearsals add column if not exists agent_publication_id uuid;
alter table public.rehearsals add column if not exists playbook_version_id uuid;
alter table public.rehearsals add column if not exists persona_profile jsonb not null default '{}'::jsonb;
alter table public.rehearsals add column if not exists mode text;
alter table public.rehearsals add column if not exists finished_at timestamptz;

alter table public.rehearsals alter column account_id set not null;
alter table public.rehearsals alter column call_id set not null;
alter table public.rehearsals alter column mode set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.rehearsals'::regclass and conname = 'rehearsals_um_por_chamada'
  ) then
    alter table public.rehearsals
      add constraint rehearsals_um_por_chamada unique (call_id);
  end if;
end;
$$;

-- A publicação obrigatória ------------------------------------------------------
-- `set not null` falha sozinho se houver ensaio sem publicação, e é o que se
-- quer: um ensaio desses não se conserta inventando para qual agente ele foi.
alter table public.rehearsals drop constraint if exists rehearsals_agent_publication_id_fkey;
alter table public.rehearsals
  add constraint rehearsals_agent_publication_id_fkey
  foreign key (agent_publication_id) references public.agent_publications (id)
  on delete no action deferrable initially deferred;
alter table public.rehearsals alter column agent_publication_id set not null;

comment on column public.rehearsals.agent_publication_id is
  'Contra qual publicação se ensaiou. Obrigatória: não existe segundo tempo de execução nosso (T-16), e coluna nula aqui seria a porta pela qual ele voltaria. Apagar a publicação ensaiada é recusado.';

comment on table public.rehearsals is
  'Uma conversa de ensaio com a Sarah, sem telefone (T-16, RF-312). A transcrição não se duplica aqui: vem de calls, porque o ensaio é uma chamada com direction rehearsal contra o agente publicado, e é isso que faz a ficha e as ferramentas chamadas aparecerem pelo mesmo caminho da ligação real.';

-- calls.direction aceita o ensaio -----------------------------------------------
-- A F2 já cria o check com os três valores. Se alguma instalação ficou com um
-- check que não aceita `rehearsal`, ele é trocado por um que aceite os três.
do $$
declare
  v_nome text;
  v_definicao text;
begin
  select c.conname, pg_get_constraintdef(c.oid) into v_nome, v_definicao
    from pg_constraint as c
   where c.conrelid = 'public.calls'::regclass
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%direction%'
   limit 1;

  if v_definicao is null or v_definicao not like '%rehearsal%' then
    if v_nome is not null then
      execute format('alter table public.calls drop constraint %I', v_nome);
    end if;
    alter table public.calls
      add constraint calls_direction_check
      check (direction in ('outbound', 'inbound', 'rehearsal'));
  end if;
end;
$$;

-- conferir_chamada_do_ensaio ----------------------------------------------------
create or replace function public.conferir_chamada_do_ensaio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chamada record;
  v_publicacao record;
begin
  select account_id, direction, purpose into v_chamada
    from public.calls where id = new.call_id;

  if not found then
    raise exception 'O ensaio aponta para uma chamada que não existe.'
      using errcode = '23503';
  end if;

  if v_chamada.direction <> 'rehearsal' then
    raise exception 'Ensaio só se pendura em chamada de ensaio: esta chamada é %.', v_chamada.direction
      using errcode = '23514';
  end if;

  if v_chamada.account_id <> new.account_id then
    raise exception 'O ensaio e a chamada são de contas diferentes.'
      using errcode = '23514';
  end if;

  if new.agent_publication_id is null then
    raise exception 'Não existe ensaio sem publicação: ensaia-se contra o agente que vai ao ar.'
      using errcode = '23502';
  end if;

  select account_id, purpose into v_publicacao
    from public.agent_publications where id = new.agent_publication_id;

  if found and v_publicacao.account_id <> new.account_id then
    raise exception 'O ensaio e a publicação são de contas diferentes.'
      using errcode = '23514';
  end if;

  if found and v_publicacao.purpose <> v_chamada.purpose then
    raise exception 'A publicação é de %, e a chamada do ensaio é de %.', v_publicacao.purpose, v_chamada.purpose
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.conferir_chamada_do_ensaio() is
  'Recusa ensaio pendurado em chamada que não é rehearsal, de outra conta, ou contra publicação de outra conta ou de outro propósito. Ensaio misturado com ligação real é dado sujo que ninguém separa depois.';

revoke all on function public.conferir_chamada_do_ensaio() from public;

drop trigger if exists rehearsals_conferir_chamada on public.rehearsals;
create trigger rehearsals_conferir_chamada
  before insert or update of account_id, call_id, agent_publication_id on public.rehearsals
  for each row execute function public.conferir_chamada_do_ensaio();

-- Isolamento --------------------------------------------------------------------
-- Classe Servidor da seção 3.9. Reemitida para a conferência não depender de a
-- primeira versão ter criado a política com este nome.
alter table public.rehearsals enable row level security;

drop policy if exists rehearsals_leitura_de_membro on public.rehearsals;
create policy rehearsals_leitura_de_membro
  on public.rehearsals for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy rehearsals_leitura_de_membro on public.rehearsals is
  'Classe Servidor: todo membro lê os ensaios da conta. Não há política de escrita de cliente: quem escreve é a função de borda rehearsal-session, por abrir_ensaio e encerrar_ensaio, que é a única que sabe contra qual agente publicado a conversa aconteceu.';
