-- `leads`: a tabela que a fatia inteira serve.
-- Referência: docs/PRD-implementacao.md seções 3.2 e 3.9, docs/revisao-tecnica.md
-- T-19, docs/PRD.md RF-101 a RF-116.
--
-- Três decisões estruturam esta migração:
--
-- 1. `phone_e164` é `not null` e tem forma conferida pelo banco. O produto só
--    fala por telefone: lead sem número não é lead, é anotação. Normalizar é
--    trabalho do módulo portável (US-023); o banco apenas recusa o que chegou
--    torto, para que nenhum caminho de escrita — importação, endereço público,
--    cadastro manual — grave um formato diferente dos outros.
-- 2. A duplicata é decidida por índice, não por consulta. O único parcial em
--    (`account_id`, `phone_e164`) onde `merged_into_id is null` é o que faz
--    `registrar_lead` (US-025) poder confiar no `on conflict` em vez de ler
--    antes de escrever — e é ele que devolve o telefone quando o lead é
--    mesclado, porque a partir daí quem responde por aquele número é o outro.
-- 3. O lead nasce numa etapa. `stage_id` nulo na escrita é o caso comum, e um
--    gatilho o resolve para a etapa `new` do funil padrão da conta. Quem
--    importa mil linhas não deveria precisar saber o id de uma etapa.

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text,
  -- E.164: o `+`, o país sem zero à esquerda e de 8 a 15 dígitos no total.
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text,
  -- Cidade, estado e fuso costumam vir resolvidos do DDD (RF-109), mas a
  -- planilha do cliente pode trazê-los escritos de outro jeito, e não é o banco
  -- que arbitra grafia de cidade.
  city text,
  state text,
  timezone text,
  company text,
  -- De onde o lead veio (`import`, `intake`, `manual`) e o identificador dele
  -- na origem, quando houver: nome do arquivo, id do formulário, id do CRM.
  source text,
  source_ref text,
  -- Sem `on delete restrict`: apagar a conta cascateia para etapas e para leads
  -- no mesmo comando, e a ordem entre as duas cascatas não é garantida — o
  -- restrict derrubaria a exclusão da conta. Etapa canônica é travada na F4,
  -- que é onde alguém pode apagá-la.
  stage_id uuid references public.pipeline_stages (id) on delete set null,
  score smallint check (score between 0 and 100),
  temperature text check (temperature in ('frio', 'morno', 'quente')),
  -- Escala de -1 a 1, calculada pelo servidor depois da ligação. Sem check:
  -- o provedor de análise é da F2 e ainda não se sabe o intervalo dele.
  last_sentiment numeric,
  last_activity_at timestamptz,
  -- `pain`, `fit`, `objections`, `next_action` (T-19).
  briefing jsonb not null default '{}'::jsonb
    check (jsonb_typeof(briefing) = 'object'),
  blocked_at timestamptz,
  blocked_reason text,
  merged_into_id uuid references public.leads (id) on delete set null,
  custom jsonb not null default '{}'::jsonb
    check (jsonb_typeof(custom) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lead que aponta para si mesmo some da lista e não tem para onde mandar
  -- quem o procurar: o `merged_into_id` deixaria de ser um destino.
  check (merged_into_id is null or merged_into_id <> id),
  -- Bloqueio sem motivo escrito não informa nada a quem for revisar a lista de
  -- exceções, e desbloquear precisa limpar os dois campos juntos (RF-008).
  check ((blocked_at is null) = (blocked_reason is null))
);

comment on table public.leads is
  'Leads da conta. Classe Operação da seção 3.9: membro lê, operator escreve.';

comment on column public.leads.phone_e164 is
  'Telefone em E.164, forma conferida pelo banco. Normalizar é do módulo portável _shared/telefone.ts.';

comment on column public.leads.merged_into_id is
  'Lead que absorveu este. Preenchido libera o telefone para outro lead, pelo índice único parcial.';

comment on column public.leads.briefing is
  'pain, fit, objections e next_action, escritos pela Sarah depois da ligação (T-19).';

comment on column public.leads.custom is
  'Colunas da planilha do cliente que não têm destino no esquema. Preservadas para não perder dado na importação.';

-- Duplicata é decisão de índice ------------------------------------------------
-- O `where` é o ponto: mesclar dois leads devolve o telefone ao acervo, e o
-- lead que sobrou continua sendo o único dono dele. Sem o `where`, o telefone
-- ficaria preso ao registro mesclado para sempre.
create unique index leads_telefone_unico_por_conta
  on public.leads (account_id, phone_e164)
  where merged_into_id is null;

-- A lista de leads filtra por etapa e ordena por atividade (RF-111).
create index leads_conta_etapa_idx on public.leads (account_id, stage_id);

create index leads_conta_atividade_idx
  on public.leads (account_id, last_activity_at desc nulls last);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- O lead nasce numa etapa --------------------------------------------------------
-- `security definer` porque quem grava pelo endereço público de entrada (F1,
-- US-029) chega sem sessão de usuário, e a etapa precisa ser resolvida do mesmo
-- jeito nos três caminhos de escrita.
create or replace function public.preencher_etapa_inicial_do_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $etapa$
begin
  if new.stage_id is not null then
    return new;
  end if;

  select s.id
    into new.stage_id
    from public.pipeline_stages as s
    join public.pipelines as p on p.id = s.pipeline_id
   where s.account_id = new.account_id
     and p.is_default
     and s.key = 'new'
   limit 1;

  if new.stage_id is null then
    raise exception 'a conta não tem funil padrão com a etapa new'
      using errcode = '23502';
  end if;

  return new;
end;
$etapa$;

comment on function public.preencher_etapa_inicial_do_lead() is
  'Resolve stage_id para a etapa new do funil padrão da conta quando a escrita não informa etapa.';

revoke execute on function public.preencher_etapa_inicial_do_lead() from public;

create trigger leads_etapa_inicial
  before insert on public.leads
  for each row execute function public.preencher_etapa_inicial_do_lead();

-- Isolamento (classe Operação da seção 3.9) --------------------------------------
alter table public.leads enable row level security;

create policy leads_leitura_de_membro
  on public.leads for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy leads_leitura_de_membro on public.leads is
  'Classe Operação: todo membro lê os leads da conta, inclusive o viewer, que é quem acompanha sem mexer.';

create policy leads_insercao_de_operador
  on public.leads for insert to authenticated
  with check ((select public.has_role(account_id, 'operator')));

comment on policy leads_insercao_de_operador on public.leads is
  'Classe Operação: cadastrar lead é trabalho de quem opera. O viewer só acompanha.';

create policy leads_alteracao_de_operador
  on public.leads for update to authenticated
  using ((select public.has_role(account_id, 'operator')))
  with check ((select public.has_role(account_id, 'operator')));

comment on policy leads_alteracao_de_operador on public.leads is
  'Classe Operação: editar, bloquear e mesclar lead é de operator. O with check repete o using para a linha não sair do alcance.';

create policy leads_exclusao_de_operador
  on public.leads for delete to authenticated
  using ((select public.has_role(account_id, 'operator')));

comment on policy leads_exclusao_de_operador on public.leads is
  'Classe Operação: excluir lead é de operator, e a exclusão fica na trilha de auditoria (RF-008).';

-- Auditoria ------------------------------------------------------------------------
-- Excluir e bloquear lead é ação sensível e precisa de trilha (RF-008). O que
-- fica de fora são as colunas que o servidor recalcula sozinho a cada ligação:
-- sem tirá-las da comparação, uma conta em operação escreveria uma linha de
-- auditoria por chamada e o fato real se perderia no meio delas.
create trigger leads_auditoria
  after update or delete on public.leads
  for each row execute function public.registrar_auditoria(
    'account_id', 'last_activity_at', 'last_sentiment', 'score', 'briefing'
  );
