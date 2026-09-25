-- A fila de exceções em versão mínima: o lugar onde cai o que a Sarah não
-- resolve sozinha.
-- Referência: docs/PRD-implementacao.md seções 3.8 e 3.9, docs/revisao-tecnica.md
-- L-24, docs/PRD.md fatia F3 e RF-909.
--
-- Quatro decisões:
--
-- 1. **Três gêneros, e não sete.** A fatia F3 pede pedido de humano, pedido de
--    bloqueio e falha repetida. Os outros quatro de RF-909 (sentimento muito
--    negativo, avaliação reprovada, reunião sem especialista, crédito baixo)
--    são da F4 e entram trocando o check `exception_items_genero_conhecido`,
--    não por tabela nova: uma segunda fila seria um segundo lugar para a tela
--    esquecer de ler.
-- 2. **`meeting_id` sem chave enquanto `meetings` não existir.** A tabela é da
--    F5. A migração pergunta por `to_regclass`: com ela, a chave entra aqui;
--    sem ela, a coluna nasce uuid solta e a migração da F5 que cria `meetings`
--    acrescenta a chave.
-- 3. **Lead e chamada pela chave composta com a conta.** Com chave simples, um
--    item da conta B se penduraria num lead da conta A e levaria o nome dele
--    para a fila de quem não o atende. `leads` ganha o único (id, account_id)
--    que a chave composta exige; `calls` já o tem (`calls_id_conta`). Apagar o
--    lead ou a chamada zera só a coluna dela, e o item fica, porque o que foi
--    resolvido e por quem é trilha de operação.
-- 4. **Dois caminhos de escrita, cada um com o seu dono.** Item que nasce de
--    ferramenta (tool-transfer sem destino, tool-dnc, falha repetida) entra por
--    RPC `security definer` chamado com a chave de serviço (L-24, US-116). A
--    política de insert do cliente cobre só a inclusão manual pelo operador.

-- O único que a chave composta de lead exige --------------------------------------
do $lead_da_conta$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.leads'::regclass
       and conname = 'leads_id_conta'
  ) then
    alter table public.leads add constraint leads_id_conta unique (id, account_id);
  end if;
end;
$lead_da_conta$;

-- A tabela ----------------------------------------------------------------------
create table public.exception_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  kind text not null,
  severity text not null default 'media',
  lead_id uuid,
  call_id uuid,
  meeting_id uuid,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'aberto',
  resolved_by uuid,
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exception_items_genero_conhecido
    check (kind in ('human_requested', 'dnc_requested', 'repeated_failure')),
  constraint exception_items_severidade_conhecida
    check (severity in ('baixa', 'media', 'alta')),
  constraint exception_items_status_conhecido
    check (status in ('aberto', 'resolvido')),
  -- Aberto não tem resolução; resolvido tem as três, com texto. É o que faz
  -- "resolver registra autor e hora" valer para qualquer caminho de escrita.
  -- Escrito em implicações para não opinar sobre status desconhecido: quem
  -- recusa esse é exception_items_status_conhecido, com o nome certo na
  -- mensagem (o Postgres confere os checks em ordem alfabética).
  constraint exception_items_resolucao_completa check (
    (status <> 'aberto' or (
      resolved_by is null
      and resolved_at is null
      and resolution is null))
    and (status <> 'resolvido' or (
      resolved_by is not null
      and resolved_at is not null
      and btrim(coalesce(resolution, '')) <> ''))
  ),
  constraint exception_items_contexto_objeto
    check (jsonb_typeof(context) = 'object'),
  constraint exception_items_lead_da_conta
    foreign key (lead_id, account_id)
    references public.leads (id, account_id) on delete set null (lead_id),
  constraint exception_items_chamada_da_conta
    foreign key (call_id, account_id)
    references public.calls (id, account_id) on delete set null (call_id)
);

do $reuniao$
begin
  if to_regclass('public.meetings') is not null then
    alter table public.exception_items
      add constraint exception_items_reuniao
      foreign key (meeting_id) references public.meetings (id) on delete set null;
  end if;
end;
$reuniao$;

comment on table public.exception_items is
  'Fila de exceções (seção 3.8, RF-909): o que a Sarah não resolve sozinha vira item com lugar definido, e resolver registra autor, hora e o que foi feito. Classe Operação da seção 3.9. Item que nasce de ferramenta entra por RPC security definer com a chave de serviço (L-24); a política de insert do cliente é só a inclusão manual pelo operador.';

comment on column public.exception_items.kind is
  'O gênero do item. Na F3, a versão mínima da fatia: human_requested (pediu humano e não havia destino), dnc_requested (pediu para não ser chamado) e repeated_failure (falhas seguidas no mesmo lead). Os quatro restantes de RF-909 (sentimento muito negativo, avaliação reprovada, reunião sem especialista, crédito baixo) são da F4 e entram trocando o check exception_items_genero_conhecido, não por tabela nova.';

comment on column public.exception_items.severity is
  'baixa, media ou alta. Ordena a atenção de quem opera; não muda o que o item é.';

comment on column public.exception_items.meeting_id is
  'A reunião a que o item se refere. meetings é da F5: se a tabela já existia quando esta migração rodou, a chave exception_items_reuniao entrou aqui; se não, a coluna é uuid sem chave, e a migração da F5 que cria meetings acrescenta exception_items_reuniao.';

comment on column public.exception_items.context is
  'O recorte da conversa que explica o item e o call_id por onde a tela pede o áudio. Sem áudio embutido e sem transcrição inteira: a gravação vive no Storage e sai por URL assinada, e a transcrição inteira está na chamada.';

comment on column public.exception_items.resolution is
  'O que quem resolveu fez, em texto. Preenchido junto com resolved_by e resolved_at, e só quando status é resolvido (exception_items_resolucao_completa).';

-- A tela lê a fila aberta da conta, a mais nova primeiro.
create index exception_items_fila_da_conta
  on public.exception_items (account_id, status, created_at desc);

-- Isolamento (classe Operação da seção 3.9) ---------------------------------------
alter table public.exception_items enable row level security;

create policy exception_items_leitura_de_membro
  on public.exception_items for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy exception_items_leitura_de_membro on public.exception_items is
  'Classe Operação: todo membro lê a fila, inclusive o viewer, que acompanha o que ficou para gente resolver.';

create policy exception_items_insercao_de_operador
  on public.exception_items for insert to authenticated
  with check ((select public.has_role(account_id, 'operator')));

comment on policy exception_items_insercao_de_operador on public.exception_items is
  'Classe Operação: cobre só a inclusão manual pelo operador. O item que nasce das ferramentas do agente não passa por aqui: entra pelo RPC security definer chamado com a chave de serviço (L-24, US-116).';

create policy exception_items_alteracao_de_operador
  on public.exception_items for update to authenticated
  using ((select public.has_role(account_id, 'operator')))
  with check ((select public.has_role(account_id, 'operator')));

comment on policy exception_items_alteracao_de_operador on public.exception_items is
  'Classe Operação: resolver o item é de operator. O with check repete o using para a linha não sair do alcance. Não há política de delete: item resolvido é trilha, e sai só pela chave de serviço.';

-- Carimbo e trilha -----------------------------------------------------------------
create trigger exception_items_set_updated_at
  before update on public.exception_items
  for each row execute function public.set_updated_at();

create trigger exception_items_auditoria
  after update or delete on public.exception_items
  for each row execute function public.registrar_auditoria('account_id');
