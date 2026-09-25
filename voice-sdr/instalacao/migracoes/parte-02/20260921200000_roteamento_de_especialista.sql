-- Roteamento do especialista: para quem vai a reunião que a Sarah marca.
-- Referência: docs/PRD-implementacao.md seções 3.1 e 3.9, docs/PRD.md RF-506,
-- docs/revisao-tecnica.md L-16 e T-22.
--
-- `account_settings` nasce aqui, e nasce tipada (T-22). A alternativa da
-- referência era um `jsonb` de configuração pendurado na conta, e ela abre
-- quatro buracos de uma vez: nenhum check recusa valor desconhecido, nenhum
-- padrão é verificável, toda alteração reescreve o blob inteiro e a trilha de
-- auditoria passa a registrar "settings mudou" em vez de dizer o que mudou.
--
-- Só as colunas de roteamento entram agora. Janela de discagem, intervalo
-- mínimo, tetos por número e por dia, retenção de áudio, limiares da fila de
-- exceções e duração máxima de chamada estão na seção 3.1 e entram nas fatias
-- que as lerem. Coluna de configuração que ninguém lê é configuração que mente
-- — a tela promete um efeito que não existe —, e é o que o princípio 4 do PRD
-- proíbe.
--
-- L-16: `routing_weight` sozinho não faz rodízio, porque não guarda quem foi o
-- último. O modo mora aqui, na conta; a marca do rodízio mora em
-- `specialists.last_assigned_at`, escrita a cada agendamento.

create table public.account_settings (
  id uuid primary key default gen_random_uuid(),
  -- Uma linha por conta: configuração é da empresa, não de quem a editou por
  -- último. O unique é o que sustenta o `on conflict` do gatilho abaixo.
  account_id uuid not null unique references public.accounts (id) on delete cascade,
  routing_mode text not null default 'area'
    check (routing_mode in ('area', 'round_robin', 'fixed')),
  -- Recusa apagar o especialista que a conta roteia: sem isso a configuração
  -- ficaria apontando para ninguém, e o `fixed` cairia calado de volta no
  -- rodízio. A recusa é `no action deferrable initially deferred` e não
  -- `restrict`, que é a mesma regra com um detalhe a mais: `restrict` confere na
  -- hora e não sabe esperar o fim da transação. Apagar a **conta** dispara duas
  -- cascatas no mesmo comando — uma para `specialists`, outra para esta tabela —
  -- e qual das duas o Postgres roda primeiro depende da ordem dos gatilhos
  -- internos de integridade, que é ordem de nome gerado e não é contrato. Se a
  -- de `specialists` vier antes, `restrict` derrubaria a exclusão da conta. Com
  -- a conferência adiada, as duas ordens dão no mesmo, porque no fim da
  -- transação a configuração já se foi junto.
  fixed_specialist_id uuid references public.specialists (id)
    on delete no action deferrable initially deferred,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Modo que não aponta para ninguém é configuração que não é lida: `fixed` sem
  -- especialista faria a ferramenta de agenda cair silenciosamente de volta no
  -- rodízio, e a tela continuaria dizendo "fixo". O lado contrário é o mesmo
  -- engano ao contrário: especialista apontado em modo `area` é um destino que
  -- ninguém honra. A igualdade cobra os dois de uma vez.
  constraint account_settings_destino_do_modo check (
    (routing_mode = 'fixed') = (fixed_specialist_id is not null)
  )
);

comment on table public.account_settings is
  'Configuração tipada da conta, uma linha por conta (T-22). Hoje só o roteamento do especialista: as demais áreas da seção 3.1 entram nas fatias que as lerem, porque coluna que ninguém lê promete efeito que não existe.';

comment on column public.account_settings.routing_mode is
  'Como a reunião escolhe especialista (RF-506, L-16): area casa pela área do lead, round_robin usa specialists.last_assigned_at, fixed manda tudo para uma pessoa.';

comment on column public.account_settings.fixed_specialist_id is
  'Destino do modo fixed, e nulo nos outros dois — o check cobra os dois lados. Apagar o especialista apontado é recusado, para a conta não ficar sem roteamento em silêncio.';

-- A linha nasce com a conta. Sem isto, a primeira leitura da tela de roteamento
-- teria que criar a linha, e criar linha é escrita: quem só lê veria erro.
create or replace function public.criar_configuracao_da_conta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $configuracao$
begin
  insert into public.account_settings (account_id)
  values (new.id)
  on conflict (account_id) do nothing;
  return null;
end;
$configuracao$;

comment on function public.criar_configuracao_da_conta() is
  'Cria a linha de account_settings da conta recém-criada, no roteamento padrão. Conta sem configuração faria a leitura da tela virar escrita.';

create trigger accounts_criar_configuracao
  after insert on public.accounts
  for each row execute function public.criar_configuracao_da_conta();

create trigger account_settings_set_updated_at
  before update on public.account_settings
  for each row execute function public.set_updated_at();

-- Isolamento (classe Configuração da seção 3.9) ------------------------------------
-- Membro lê, administrador escreve. Não há política de insert nem de delete, e é
-- deliberado, como em `onboarding_state`: a linha nasce com a conta, pelo
-- gatilho, e morre com ela, por cascata. Um insert de cliente só poderia
-- duplicar o que já existe, e o unique o recusaria de qualquer forma.
alter table public.account_settings enable row level security;

create policy account_settings_leitura_de_membro
  on public.account_settings for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy account_settings_leitura_de_membro on public.account_settings is
  'Classe Configuração: todo membro lê o modo de roteamento, porque a ficha da reunião explica por que ela caiu naquele especialista.';

create policy account_settings_alteracao_de_admin
  on public.account_settings for update to authenticated
  using ((select public.has_role(account_id, 'admin')))
  with check ((select public.has_role(account_id, 'admin')));

comment on policy account_settings_alteracao_de_admin on public.account_settings is
  'Classe Configuração: trocar o modo de roteamento muda para quem vão as reuniões da conta inteira. Operador não mexe.';

-- Auditoria ------------------------------------------------------------------------
-- Trocar o modo de roteamento redireciona a receita de uma equipe para outra
-- pessoa, e é exatamente a mudança que alguém vai querer datar meses depois.
create trigger account_settings_auditoria
  after update or delete on public.account_settings
  for each row execute function public.registrar_auditoria();

-- Conta que já existia quando esta migração chegou também tem configuração.
--
-- O backfill fica no fim, depois de toda a DDL, e não junto da criação da
-- tabela. `db push` aplica as migrações pendentes numa transação só: um insert
-- que dispara gatilho deixa eventos pendentes, e o `alter table ... enable row
-- level security` seguinte é recusado com 55006 ("cannot ALTER TABLE because it
-- has pending trigger events"). Em banco vazio o insert não afeta linha e o erro
-- não aparece — foi assim que isto passou no PGlite e quebrou no Postgres real,
-- na primeira conta de verdade. Estrutura primeiro, dado depois.
insert into public.account_settings (account_id)
select a.id from public.accounts as a
on conflict (account_id) do nothing;
