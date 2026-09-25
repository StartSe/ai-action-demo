-- Calendário externo do especialista: o vínculo (`specialist_calendars`) e a
-- ocupação lida de fora (`specialist_busy_blocks`).
-- Referência: docs/PRD-implementacao.md seções 3.3 e 3.9, docs/PRD.md RF-507 e
-- RF-508, docs/revisao-tecnica.md L-06 e T-10.
--
-- As duas tabelas existem por causa do prazo. T-10 mede a conta: função fria
-- mais consulta de ocupação no provedor mais geração de horários estoura os 2 s
-- do p95 com frequência. A correção é ler o calendário fora da ligação — a
-- rotina `cron-calendar-sync` grava a ocupação dos próximos trinta dias aqui, e
-- a ferramenta de agenda lê só do banco.
--
-- A divisão entre elas é a divisão entre credencial e dado. `specialist_calendars`
-- é configuração: quem administra a conta conecta a agenda de cada especialista,
-- e a linha guarda para onde escrever e por onde renovar o acesso.
-- `specialist_busy_blocks` é retrato: o que a rotina leu da última vez, jogado
-- fora e reescrito a cada passagem. Uma é de classe Configuração, a outra de
-- classe Servidor, e é por isso que a segunda não tem política de escrita.
--
-- A espera do produto está registrada na US-156: a verificação do aplicativo
-- OAuth para escopo sensível de calendário não foi aberta, então nada nesta
-- migração é exercitado contra provedor real ainda. O esquema entra agora
-- porque é ele que a rotina e a ferramenta de agenda pressupõem; o que falta é
-- credencial, não tabela.

-- Contrato com a plataforma ---------------------------------------------------
-- `refresh_secret_id` aponta para o Vault, como `account_secrets.secret_id`.
-- Vale a mesma regra: o Vault é do Supabase e não se cria aqui, se confere. Uma
-- migração que falha dizendo a razão é melhor do que uma coluna que só quebra
-- quando o primeiro especialista conecta a agenda.
do $contrato$
begin
  if to_regclass('vault.secrets') is null then
    raise exception 'o calendário do especialista guarda o token de renovação no Vault e o schema vault não existe neste banco'
      using hint = 'habilite a extensão supabase_vault antes de aplicar esta migração';
  end if;
end
$contrato$;

-- specialist_calendars --------------------------------------------------------
create table public.specialist_calendars (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  specialist_id uuid not null references public.specialists (id) on delete cascade,
  -- Normalizado na escrita, como em `account_secrets`: sem isso, 'Google' e
  -- 'google' seriam dois calendários do mesmo provedor e a chave única não
  -- veria a duplicata.
  provider text not null check (provider = lower(btrim(provider)) and provider <> ''),
  -- Identificador da agenda no provedor. É o endereço de escrita do evento, e
  -- por isso não é opcional: calendário conectado sem saber em qual agenda
  -- escrever não serve para agendar nada.
  external_id text not null check (length(btrim(external_id)) > 0),
  -- Ponteiro para vault.secrets, nunca o token. Único pela mesma razão do
  -- cofre: dois ponteiros para o mesmo segredo fariam a desconexão de um
  -- deixar o outro pendurado no vazio.
  refresh_secret_id uuid not null unique,
  synced_at timestamptz,
  sync_error text check (sync_error is null or length(btrim(sync_error)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Um calendário por provedor por especialista. Duas linhas do mesmo provedor
  -- seriam duas agendas concorrendo pela mesma pessoa, e a rotina não teria
  -- como decidir em qual escrever o evento.
  unique (specialist_id, provider)
);

comment on table public.specialist_calendars is
  'Vínculo do especialista com o calendário externo (L-06). Guarda para onde escrever o evento e o ponteiro do Vault por onde renovar o acesso. O token não mora aqui.';

comment on column public.specialist_calendars.provider is
  'Provedor do calendário, em minúsculas. Provedor novo não exige migração: a coluna é texto normalizado, e quem conhece cada um é a função de borda.';

comment on column public.specialist_calendars.external_id is
  'Identificador da agenda no provedor, que é para onde o evento da reunião é escrito.';

comment on column public.specialist_calendars.refresh_secret_id is
  'Id em vault.secrets do token de renovação. A tabela nunca guarda o token: o valor só sai por vault.decrypted_secrets, dentro de função security definer. O ponteiro pode ser lido pelo cliente porque o schema vault não é alcançável por papel de cliente.';

comment on column public.specialist_calendars.synced_at is
  'Quando a sincronização deste calendário terminou pela última vez. Só avança no fim da passagem: avançar no começo faria uma rotina interrompida parecer bem-sucedida.';

comment on column public.specialist_calendars.sync_error is
  'Última falha da sincronização, em texto, ou nulo quando a última passagem terminou bem. Nulo com synced_at antigo significa rotina parada, e não agenda vazia: quem for olhar a ocupação precisa comparar synced_at com o relógio antes de concluir que o especialista está livre.';

create trigger specialist_calendars_set_updated_at
  before update on public.specialist_calendars
  for each row execute function public.set_updated_at();

-- specialist_busy_blocks ------------------------------------------------------
create table public.specialist_busy_blocks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  specialist_id uuid not null references public.specialists (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Identificador do evento no provedor. É a chave da idempotência: a rotina
  -- roda a cada cinco minutos sobre a mesma janela de trinta dias, e sem ele
  -- cada passagem duplicaria a ocupação inteira.
  external_id text not null check (length(btrim(external_id)) > 0),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint specialist_busy_blocks_intervalo_util check (ends_at > starts_at),
  unique (specialist_id, external_id)
);

comment on table public.specialist_busy_blocks is
  'Retrato da ocupação lida do calendário externo (T-10), escrito por cron-calendar-sync. Classe Servidor: o cliente lê, e quem escreve é a rotina com a chave de serviço. A ferramenta de agenda consulta esta tabela e nunca o provedor, porque a consulta ao vivo estoura o prazo da ligação.';

comment on column public.specialist_busy_blocks.external_id is
  'Identificador do evento no provedor. Com a chave única por especialista, é o que faz a sincronização ser idempotente: a passagem seguinte atualiza a linha em vez de criar outra.';

comment on column public.specialist_busy_blocks.synced_at is
  'Quando esta linha foi lida do provedor. Linha com synced_at velho é evento que sumiu da agenda de lá e ainda não foi removido daqui.';

-- Sem restrição de exclusão, ao contrário de `specialist_blocks`. Ali o
-- bloqueio é declarado por gente da conta, e dois sobrepostos são engano; aqui
-- a ocupação vem de fora, e uma agenda com dois eventos no mesmo horário é
-- estado comum de quem foi convidado para duas reuniões. Recusar a segunda
-- linha faria a rotina falhar por causa da agenda alheia, e o efeito no gerador
-- de horários é o mesmo: o intervalo está ocupado de qualquer jeito.

-- A consulta da geração de horários: a ocupação daquele especialista a partir
-- de um instante. Sem o índice, ela varre a tabela inteira dentro da ligação.
create index specialist_busy_blocks_por_inicio
  on public.specialist_busy_blocks (specialist_id, starts_at);

-- Isolamento ------------------------------------------------------------------
-- `specialist_calendars` é classe Configuração da seção 3.9: membro lê,
-- administrador escreve. Conectar a agenda de outra pessoa decide para onde a
-- reunião vai parar, e é decisão de quem administra a conta.
alter table public.specialist_calendars enable row level security;

create policy specialist_calendars_leitura_de_membro
  on public.specialist_calendars for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy specialist_calendars_leitura_de_membro on public.specialist_calendars is
  'Classe Configuração: todo membro lê o vínculo, porque a tela do especialista mostra se a agenda está conectada e quando a sincronização passou pela última vez. O que a leitura entrega é o ponteiro do Vault, não o token — o schema vault não é alcançável por papel de cliente.';

create policy specialist_calendars_insercao_de_admin
  on public.specialist_calendars for insert to authenticated
  with check ((select public.has_role(account_id, 'admin')));

comment on policy specialist_calendars_insercao_de_admin on public.specialist_calendars is
  'Classe Configuração: conectar calendário é dar a uma agenda de fora o poder de bloquear horário da Sarah, então é de administrador.';

create policy specialist_calendars_alteracao_de_admin
  on public.specialist_calendars for update to authenticated
  using ((select public.has_role(account_id, 'admin')))
  with check ((select public.has_role(account_id, 'admin')));

comment on policy specialist_calendars_alteracao_de_admin on public.specialist_calendars is
  'Classe Configuração: trocar a agenda de destino muda onde o evento da reunião nasce. Operador não mexe.';

create policy specialist_calendars_exclusao_de_admin
  on public.specialist_calendars for delete to authenticated
  using ((select public.has_role(account_id, 'admin')));

comment on policy specialist_calendars_exclusao_de_admin on public.specialist_calendars is
  'Classe Configuração: desconectar a agenda apaga a ocupação lida e devolve horário à oferta, como apagar um bloqueio. É de administrador.';

-- `specialist_busy_blocks` é classe Servidor: RLS ligada, uma só política, de
-- leitura. Nenhuma política de escrita de cliente, e isso é o mecanismo, não o
-- comentário: sem política, `insert`, `update` e `delete` são negados a
-- `authenticated` e a `anon`, inclusive para quem for admin ou owner. Quem
-- escreve é `cron-calendar-sync`, com a chave de serviço, que passa por cima da
-- RLS. Revogar o privilégio não serviria: o Supabase o reconcede por
-- `alter default privileges`.
alter table public.specialist_busy_blocks enable row level security;

create policy specialist_busy_blocks_leitura_de_membro
  on public.specialist_busy_blocks for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy specialist_busy_blocks_leitura_de_membro on public.specialist_busy_blocks is
  'Classe Servidor: membro lê, ninguém do cliente escreve. A agenda precisa mostrar por que um horário não foi oferecido, e a ocupação vem do calendário externo — corrigi-la pela tela seria mentir sobre o que a agenda de fora diz.';

-- Auditoria -------------------------------------------------------------------
-- `specialist_calendars` tem updated_at e é configuração: conectar e
-- desconectar agenda é exatamente o que alguém vai procurar na trilha quando um
-- especialista parar de receber reunião. `synced_at` e `sync_error` ficam de
-- fora porque são escritas pela rotina a cada cinco minutos, e cada passagem
-- viraria uma linha de "calendário alterado" — o ruído afogaria a conexão e a
-- troca de agenda, que são os fatos auditáveis. `refresh_secret_id` entra
-- redigido, pela regra de nome de coluna de `redigir_auditoria`.
create trigger specialist_calendars_auditoria
  after update or delete on public.specialist_calendars
  for each row execute function public.registrar_auditoria('account_id', 'synced_at', 'sync_error');

-- `specialist_busy_blocks` não entra na trilha e não tem updated_at, de
-- propósito: ela é retrato reescrito pela rotina, não decisão de ninguém. A
-- varredura estrutural de testes/banco/registro-de-auditoria.test.ts cobra
-- gatilho só de quem tem updated_at, então a ausência da coluna é o que declara
-- a ausência do gatilho.
