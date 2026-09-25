-- Conformidade: a lista de bloqueio completa, antes de a primeira ferramenta do
-- agente escrever nela.
-- Referência: docs/PRD-implementacao.md seções 3.6, 3.9 e 10 (expandir e
-- contrair), docs/revisao-tecnica.md T-02 e R-02, docs/PRD.md RF-804, RF-805 e
-- RF-422.
--
-- A F2 criou `dnc_entries` (20260922030000_bloqueios.sql), porque o passo 3 da
-- guarda a consulta. Esta migração não a recria: confere com `to_regclass`,
-- acrescenta o que faltar com `add column if not exists` e reemite o que é
-- idempotente. Só cria a tabela inteira se ela não existir, e aí com RLS na
-- mesma migração.
--
-- Três mudanças de fato:
--
-- 1. **A origem da ligação passa a se chamar `lead_request`.** A F2 chamava de
--    `call`, que diz por onde o pedido chegou e não quem pediu. O que importa
--    para a conformidade é que foi o interlocutor quem pediu (RF-805), e é isso
--    que separa esta origem de `wrong_number`, que também nasce na ligação e
--    que ninguém pediu. As linhas antigas migram na mesma transação.
-- 2. **Origem fora da lista é recusada em português.** O check continua, com
--    nome estável; um gatilho `before` o antecede com a mensagem que a tela e a
--    borda mostram, porque a mensagem de check do Postgres não se escreve.
-- 3. **Sai a política de `delete` do cliente.** RF-804 pede remoção registrada,
--    e um `delete` do operador apagava o bloqueio sem deixar quem, quando e por
--    quê na própria linha. Remover passa a ter um caminho só, o `update` dos
--    três campos da remoção. A chave de serviço continua podendo apagar, que é
--    o expurgo de RF-808 e não uma decisão de operação.

-- A tabela ----------------------------------------------------------------------
do $conferencia$
begin
  if to_regclass('public.dnc_entries') is null then
    create table public.dnc_entries (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references public.accounts (id) on delete cascade,
      phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
      reason text not null check (length(btrim(reason)) > 0),
      source text not null default 'manual',
      notes text check (notes is null or length(btrim(notes)) > 0),
      removed_at timestamptz,
      removed_by uuid,
      removal_reason text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    alter table public.dnc_entries enable row level security;
  end if;
end;
$conferencia$;

-- O que a seção 3.6 pede, conferido coluna a coluna. Em banco que veio da F2
-- nenhuma destas linhas muda nada; elas existem para o banco que chegou aqui
-- por outro caminho.
alter table public.dnc_entries add column if not exists reason text;
alter table public.dnc_entries add column if not exists source text not null default 'manual';
alter table public.dnc_entries add column if not exists notes text;
alter table public.dnc_entries add column if not exists removed_at timestamptz;
alter table public.dnc_entries add column if not exists removed_by uuid;
alter table public.dnc_entries add column if not exists removal_reason text;
alter table public.dnc_entries add column if not exists created_at timestamptz not null default now();
alter table public.dnc_entries add column if not exists updated_at timestamptz not null default now();

do $remocao$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.dnc_entries'::regclass
       and conname = 'dnc_entries_remocao_completa'
  ) then
    alter table public.dnc_entries add constraint dnc_entries_remocao_completa check (
      (removed_at is null
        and removed_by is null
        and removal_reason is null)
      or (removed_at is not null
        and removed_by is not null
        and btrim(coalesce(removal_reason, '')) <> '')
    );
  end if;
end;
$remocao$;

-- A origem ----------------------------------------------------------------------
alter table public.dnc_entries drop constraint if exists dnc_entries_source_check;
alter table public.dnc_entries drop constraint if exists dnc_entries_origem_conhecida;

update public.dnc_entries set source = 'lead_request' where source = 'call';

alter table public.dnc_entries add constraint dnc_entries_origem_conhecida
  check (source in ('manual', 'import', 'lead_request', 'wrong_number'));

create or replace function public.conferir_origem_do_bloqueio()
returns trigger
language plpgsql
set search_path = ''
as $origem$
begin
  if new.source is null
     or new.source not in ('manual', 'import', 'lead_request', 'wrong_number') then
    raise exception
      'origem de bloqueio desconhecida: %. As origens são manual, import, lead_request e wrong_number',
      coalesce(new.source, 'nula')
      using errcode = '23514',
            constraint = 'dnc_entries_origem_conhecida',
            hint = 'Origem nova exige migração: valor que nenhum caminho escreve é filtro que nunca traz linha.';
  end if;
  return new;
end;
$origem$;

comment on function public.conferir_origem_do_bloqueio() is
  'Gatilho before insert or update of source de dnc_entries: recusa origem fora das quatro com mensagem em português. O check dnc_entries_origem_conhecida fica por baixo, para o caso de o gatilho ser desligado.';

revoke execute on function public.conferir_origem_do_bloqueio() from public;

drop trigger if exists dnc_entries_conferir_origem on public.dnc_entries;
create trigger dnc_entries_conferir_origem
  before insert or update of source on public.dnc_entries
  for each row execute function public.conferir_origem_do_bloqueio();

comment on column public.dnc_entries.source is
  'De onde veio o bloqueio: manual na tela, import na carga de lista, lead_request quando o interlocutor pede para não ser chamado e tool-dnc atende dentro da chamada (RF-805), e wrong_number quando a Sarah identifica a pessoa errada. É wrong_number que fecha RF-422 sem tabela nova (T-02): marcar o número como incorreto é o mesmo ato de recusar rediscagem que a lista já faz, e uma segunda tabela seria um segundo lugar para a guarda esquecer de consultar.';

-- Um bloqueio ativo por número ----------------------------------------------------
create unique index if not exists dnc_entries_ativo_unico_por_conta
  on public.dnc_entries (account_id, phone_e164)
  where removed_at is null;

comment on index public.dnc_entries_ativo_unico_por_conta is
  'Um bloqueio ativo por número por conta, e o índice do passo 3 da guarda. Parcial porque remover é update: a linha removida sai do único e o número pode ser bloqueado de novo.';

comment on table public.dnc_entries is
  'Lista de bloqueio por conta (seção 3.6, RF-804). Consultada no passo 3 da guarda de discagem. A remoção passa por update de removed_at, removed_by e removal_reason, e só por ele: não há política de delete para o cliente, porque RF-804 pede remoção registrada e um delete não deixa rastro. Apagar a linha é da chave de serviço, no expurgo de RF-808.';

-- Isolamento (classe Operação da seção 3.9) ---------------------------------------
alter table public.dnc_entries enable row level security;

drop policy if exists dnc_entries_leitura_de_membro on public.dnc_entries;
create policy dnc_entries_leitura_de_membro
  on public.dnc_entries for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy dnc_entries_leitura_de_membro on public.dnc_entries is
  'Classe Operação: todo membro lê a lista, inclusive o viewer. A recusa da guarda por bloqueio só se explica com a lista à vista.';

drop policy if exists dnc_entries_insercao_de_operador on public.dnc_entries;
create policy dnc_entries_insercao_de_operador
  on public.dnc_entries for insert to authenticated
  with check ((select public.has_role(account_id, 'operator')));

comment on policy dnc_entries_insercao_de_operador on public.dnc_entries is
  'Classe Operação: bloquear um número é trabalho de quem opera. O viewer só acompanha.';

drop policy if exists dnc_entries_alteracao_de_operador on public.dnc_entries;
create policy dnc_entries_alteracao_de_operador
  on public.dnc_entries for update to authenticated
  using ((select public.has_role(account_id, 'operator')))
  with check ((select public.has_role(account_id, 'operator')));

comment on policy dnc_entries_alteracao_de_operador on public.dnc_entries is
  'Classe Operação: remover o bloqueio é update dos três campos da remoção, e é de operator. É o único caminho de remoção do cliente (RF-804). O with check repete o using para a linha não sair do alcance.';

drop policy if exists dnc_entries_exclusao_de_operador on public.dnc_entries;

-- Carimbo e trilha -----------------------------------------------------------------
drop trigger if exists dnc_entries_set_updated_at on public.dnc_entries;
create trigger dnc_entries_set_updated_at
  before update on public.dnc_entries
  for each row execute function public.set_updated_at();

drop trigger if exists dnc_entries_auditoria on public.dnc_entries;
create trigger dnc_entries_auditoria
  after update or delete on public.dnc_entries
  for each row execute function public.registrar_auditoria('account_id');
