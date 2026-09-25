-- De qual modelo a conta fala, e por qual porta (US-246).
--
-- Até aqui o modelo era constante do código e a chave era da instalação
-- (`SARAH_MODELO_API_KEY`): uma conta não escolhia nada, e quem pagava a conta
-- do modelo era a plataforma. Esta migração abre a segunda porta — a conta
-- conecta o OpenRouter por OAuth, a chave vai para o cofre que já existe
-- (`account_secrets`, provedor `openrouter`), e o modelo de cada tarefa passa a
-- ser escolha de quem administra.
--
-- **AS DUAS PORTAS CONVIVEM.** `provider = 'platform'` é o que toda conta já
-- tem hoje e continua tendo: a chave da instalação, com os modelos fixos do
-- código. Só a conta que conectar o OpenRouter troca de porta. Sem isso, ligar
-- esta migração tiraria o rascunho por IA e a classificação de toda conta que
-- ainda não conectou — inclusive a que já está no ar.
--
-- **O MODELO É NULO POR PADRÃO, E NULO QUER DIZER "O DO CÓDIGO".** Guardar o
-- padrão como texto aqui congelaria a escolha do dia da migração: quando o
-- código trocar o modelo de redação, a conta que nunca escolheu nada continuaria
-- no antigo sem saber por quê.
--
-- **O PKCE EM VOO TEM TABELA PRÓPRIA E CURTA.** `model_auth_states` guarda o
-- `code_verifier` entre a ida e a volta do OAuth. Ele fica em claro, e isso é
-- deliberado: o verifier precisa voltar inteiro para o provedor, então não há
-- hash que sirva. O que o protege é o resto — a tabela não tem política de
-- leitura de cliente, a linha vale dez minutos, serve uma vez só, e depois de
-- usada não abre porta nenhuma (o que ela troca por chave é um código que o
-- provedor já invalidou). A chave que o fluxo produz é que vai para o Vault.

-- model_settings ----------------------------------------------------------------
create table public.model_settings (
  id uuid primary key default gen_random_uuid(),
  -- Uma linha por conta: "de qual modelo esta conta fala" é uma resposta só, e
  -- a segunda linha faria a resolução escolher por sorte.
  account_id uuid not null unique references public.accounts (id) on delete cascade,
  -- `platform` é a chave da instalação com os modelos do código; `openrouter` é
  -- a credencial da conta no cofre. Porta nova é migração, porque cada uma tem
  -- um formato de pedido e um adaptador.
  provider text not null default 'platform' check (provider in ('platform', 'openrouter')),
  -- O modelo de cada tarefa, no identificador do provedor escolhido
  -- (`anthropic/claude-opus-5` no OpenRouter). Nulo é "o do código": ver o
  -- cabeçalho.
  model_for_draft text check (model_for_draft is null or length(btrim(model_for_draft)) > 0),
  model_for_classify text check (model_for_classify is null or length(btrim(model_for_classify)) > 0),
  model_for_review text check (model_for_review is null or length(btrim(model_for_review)) > 0),
  -- O que dá para mostrar na tela sobre a conexão: rótulo da chave, nome de
  -- quem autorizou no provedor, limite de crédito. Nunca a chave.
  connection jsonb not null default '{}'::jsonb check (jsonb_typeof(connection) = 'object'),
  connected_at timestamptz,
  connected_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Porta de conta sem data de conexão é uma conta que acha que conectou e não
  -- conectou: a resolução iria ao cofre e não acharia chave nenhuma.
  constraint model_settings_conectada_tem_data
    check (provider = 'platform' or connected_at is not null)
);

comment on table public.model_settings is
  'De qual modelo a conta fala e por qual porta (US-246). provider platform é a chave da instalação com os modelos do código; openrouter é a credencial da conta em account_secrets. Modelo nulo quer dizer o padrão do código, e não um padrão congelado aqui.';

comment on column public.model_settings.provider is
  'platform ou openrouter. As duas convivem: só a conta que conectar troca de porta, e nenhuma conta existente é afetada por esta migração.';

comment on column public.model_settings.model_for_draft is
  'O modelo que redige roteiro (playbook-draft). Nulo é o padrão do código, para a conta que nunca escolheu acompanhar a troca de padrão em vez de congelar a do dia em que a linha nasceu.';

comment on column public.model_settings.connection is
  'O que a tela mostra sobre a conexão: rótulo da chave e o que o provedor devolveu de público. Nunca a chave, que mora no Vault por account_secrets.';

create trigger model_settings_set_updated_at
  before update on public.model_settings
  for each row execute function public.set_updated_at();

-- model_auth_states -------------------------------------------------------------
-- O OAuth em voo. Ver o cabeçalho para por que o verifier fica em claro.
create table public.model_auth_states (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  provider text not null check (provider in ('openrouter')),
  -- O que volta na URL de retorno, e o que amarra a volta à conta certa. Único
  -- global: um estado que se repetisse deixaria a volta de uma conta cair na
  -- outra.
  state text not null unique check (length(btrim(state)) > 0),
  -- O segredo do PKCE, que volta inteiro para o provedor na troca.
  code_verifier text not null check (length(btrim(code_verifier)) >= 43),
  -- Para onde o provedor devolve. Guardado porque a troca precisa bater com o
  -- que a ida declarou, e porque ambiente diferente tem retorno diferente.
  callback_url text not null check (length(btrim(callback_url)) > 0),
  created_by uuid references public.profiles (id) on delete set null,
  -- Dez minutos: é quanto dura o código do provedor. Estado que vivesse mais
  -- seria uma linha aberta esperando um código que já não vale.
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.model_auth_states is
  'O OAuth PKCE em voo, entre a ida e a volta (US-246). Classe Servidor, sem leitura de cliente. A linha vale dez minutos, serve uma vez, e o que ela produz vai para o Vault.';

comment on column public.model_auth_states.code_verifier is
  'O segredo do PKCE, em claro porque precisa voltar inteiro ao provedor. O que o protege é a ausência de política de leitura, a validade de dez minutos e o uso único.';

create index model_auth_states_vencidos_idx
  on public.model_auth_states (expires_at)
  where used_at is null;

-- resolver_modelo_da_conta ------------------------------------------------------
-- A porta e o modelo de uma tarefa, numa leitura só. Existe como função e não
-- como consulta na borda porque `model_settings` não tem leitura de cliente
-- para o servidor: quem resolve é a chave de serviço, e a regra de "nulo quer
-- dizer o do código" precisa morar num lugar só.
--
-- Devolve a porta sempre; o modelo vem nulo quando a conta não escolheu, e é o
-- chamador que põe o padrão do código. A função não conhece os padrões de
-- propósito: eles mudam com o produto, e um padrão escrito em SQL
-- envelheceria sem ninguém notar.
create or replace function public.resolver_modelo_da_conta(
  p_account_id uuid,
  p_tarefa text
)
returns table (provider text, model text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(s.provider, 'platform') as provider,
    case p_tarefa
      when 'draft' then s.model_for_draft
      when 'classify' then s.model_for_classify
      when 'review' then s.model_for_review
    end as model
  from (select 1) as sempre
  left join public.model_settings s on s.account_id = p_account_id;
$$;

comment on function public.resolver_modelo_da_conta(uuid, text) is
  'A porta e o modelo da conta para uma tarefa (draft, classify, review). Conta sem linha devolve platform e modelo nulo, que é o estado de toda conta antes de conectar. Modelo nulo quer dizer o padrão do código.';

revoke all on function public.resolver_modelo_da_conta(uuid, text) from public;
revoke all on function public.resolver_modelo_da_conta(uuid, text) from anon;
revoke all on function public.resolver_modelo_da_conta(uuid, text) from authenticated;
grant execute on function public.resolver_modelo_da_conta(uuid, text) to service_role;

-- abrir_autorizacao_de_modelo ---------------------------------------------------
-- Grava o estado do PKCE e apaga o que venceu na mesma passagem: sem a limpeza,
-- a tabela cresceria para sempre com idas que ninguém completou, e nenhuma
-- rotina precisa existir só para varrê-la.
create or replace function public.abrir_autorizacao_de_modelo(
  p_account_id uuid,
  p_provider text,
  p_state text,
  p_code_verifier text,
  p_callback_url text,
  p_created_by uuid,
  p_validade interval default interval '10 minutes'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  delete from public.model_auth_states
   where expires_at < now() - interval '1 hour';

  insert into public.model_auth_states
    (account_id, provider, state, code_verifier, callback_url, created_by, expires_at)
  values
    (p_account_id, p_provider, p_state, p_code_verifier, p_callback_url, p_created_by, now() + p_validade)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.abrir_autorizacao_de_modelo(uuid, text, text, text, text, uuid, interval) is
  'Grava o PKCE em voo e limpa o que venceu há mais de uma hora. Só service_role: quem chama é a borda model-connect.';

revoke all on function public.abrir_autorizacao_de_modelo(uuid, text, text, text, text, uuid, interval) from public;
revoke all on function public.abrir_autorizacao_de_modelo(uuid, text, text, text, text, uuid, interval) from anon;
revoke all on function public.abrir_autorizacao_de_modelo(uuid, text, text, text, text, uuid, interval) from authenticated;
grant execute on function public.abrir_autorizacao_de_modelo(uuid, text, text, text, text, uuid, interval) to service_role;

-- consumir_autorizacao_de_modelo ------------------------------------------------
-- Toma o estado da volta, uma vez só. O `used_at is null` na condição do update
-- é o que faz duas voltas simultâneas — o dedo duplo no link de retorno —
-- resolverem uma e receberem vazio na outra, em vez de trocarem o mesmo código
-- duas vezes e a segunda falhar contra o provedor.
create or replace function public.consumir_autorizacao_de_modelo(p_state text)
returns table (account_id uuid, provider text, code_verifier text, callback_url text, created_by uuid)
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.model_auth_states
     set used_at = now()
   where state = p_state
     and used_at is null
     and expires_at > now()
  returning account_id, provider, code_verifier, callback_url, created_by;
$$;

comment on function public.consumir_autorizacao_de_modelo(text) is
  'Toma o PKCE em voo pela volta do provedor, uma vez só. Vazio quer dizer estado desconhecido, já usado ou vencido, e os três levam à mesma recusa: nenhum deles diz ao cliente qual foi.';

revoke all on function public.consumir_autorizacao_de_modelo(text) from public;
revoke all on function public.consumir_autorizacao_de_modelo(text) from anon;
revoke all on function public.consumir_autorizacao_de_modelo(text) from authenticated;
grant execute on function public.consumir_autorizacao_de_modelo(text) to service_role;

-- concluir_conexao_de_modelo ----------------------------------------------------
-- Liga a porta da conta depois de a chave já estar no cofre. Separada da
-- gravação do segredo de propósito: quem grava no Vault é `set_account_secret`,
-- que já existe e já exige owner, e duplicar aquela lógica aqui criaria um
-- segundo caminho para escrever credencial.
create or replace function public.concluir_conexao_de_modelo(
  p_account_id uuid,
  p_provider text,
  p_connection jsonb,
  p_connected_by uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.model_settings
    (account_id, provider, connection, connected_at, connected_by)
  values
    (p_account_id, p_provider, coalesce(p_connection, '{}'::jsonb), now(), p_connected_by)
  on conflict (account_id) do update
     set provider = excluded.provider,
         connection = excluded.connection,
         connected_at = excluded.connected_at,
         connected_by = excluded.connected_by;
end;
$$;

comment on function public.concluir_conexao_de_modelo(uuid, text, jsonb, uuid) is
  'Liga a porta da conta depois de a chave estar no cofre. Preserva os modelos escolhidos: reconectar é trocar a credencial, não recomeçar a configuração.';

revoke all on function public.concluir_conexao_de_modelo(uuid, text, jsonb, uuid) from public;
revoke all on function public.concluir_conexao_de_modelo(uuid, text, jsonb, uuid) from anon;
revoke all on function public.concluir_conexao_de_modelo(uuid, text, jsonb, uuid) from authenticated;
grant execute on function public.concluir_conexao_de_modelo(uuid, text, jsonb, uuid) to service_role;

-- desconectar_modelo_da_conta ---------------------------------------------------
-- Volta a conta para a porta da plataforma. Os modelos escolhidos são zerados
-- junto porque eles são identificadores do OpenRouter
-- (`anthropic/claude-opus-5`), e a porta da plataforma não os entende: deixá-los
-- gravados faria a próxima chamada pedir à Anthropic um modelo que não existe
-- lá. Apagar a chave do cofre é chamada separada, de `delete_account_secret`.
create or replace function public.desconectar_modelo_da_conta(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.model_settings
     set provider = 'platform',
         connection = '{}'::jsonb,
         connected_at = null,
         connected_by = null,
         model_for_draft = null,
         model_for_classify = null,
         model_for_review = null
   where account_id = p_account_id;
end;
$$;

comment on function public.desconectar_modelo_da_conta(uuid) is
  'Volta a conta para a porta da plataforma e zera os modelos escolhidos, que são identificadores do OpenRouter e não valem na outra porta.';

revoke all on function public.desconectar_modelo_da_conta(uuid) from public;
revoke all on function public.desconectar_modelo_da_conta(uuid) from anon;
revoke all on function public.desconectar_modelo_da_conta(uuid) from authenticated;
grant execute on function public.desconectar_modelo_da_conta(uuid) to service_role;

-- escolher_modelo_da_conta ------------------------------------------------------
-- A escolha de modelo de uma tarefa. RPC, e não política de update, porque a
-- tabela guarda duas coisas de naturezas diferentes: a escolha, que é de quem
-- administra, e a conexão, que é do OAuth. Com uma política de update de
-- administrador, a mesma escrita que troca o modelo poderia declarar a conta
-- conectada ao OpenRouter sem nunca ter autorizado nada — e toda chamada ao
-- modelo passaria a falhar por chave ausente no cofre. Aqui a função escreve
-- uma coluna só, e nenhuma das colunas da conexão é alcançável pelo cliente.
--
-- `p_modelo` nulo apaga a escolha, que é como a conta volta ao padrão do
-- código sem precisar saber qual ele é.
create or replace function public.escolher_modelo_da_conta(
  p_account_id uuid,
  p_tarefa text,
  p_modelo text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_modelo text := nullif(btrim(coalesce(p_modelo, '')), '');
begin
  if not public.has_role(p_account_id, 'admin') then
    raise exception 'escolher o modelo exige administrador da conta'
      using errcode = '42501';
  end if;

  if p_tarefa not in ('draft', 'classify', 'review') then
    raise exception 'tarefa desconhecida: %', p_tarefa using errcode = '22023';
  end if;

  -- A linha pode não existir: a conta que nunca conectou nada também escolhe
  -- modelo, e nasce em `platform`, que é o padrão da coluna.
  insert into public.model_settings (account_id)
  values (p_account_id)
  on conflict (account_id) do nothing;

  update public.model_settings
     set model_for_draft = case when p_tarefa = 'draft' then v_modelo else model_for_draft end,
         model_for_classify = case when p_tarefa = 'classify' then v_modelo else model_for_classify end,
         model_for_review = case when p_tarefa = 'review' then v_modelo else model_for_review end
   where account_id = p_account_id;
end;
$$;

comment on function public.escolher_modelo_da_conta(uuid, text, text) is
  'Escolhe o modelo de uma tarefa (draft, classify, review). Exige administrador. Modelo nulo apaga a escolha e devolve a conta ao padrão do código. Não alcança nenhuma coluna da conexão.';

revoke all on function public.escolher_modelo_da_conta(uuid, text, text) from public;
revoke all on function public.escolher_modelo_da_conta(uuid, text, text) from anon;
grant execute on function public.escolher_modelo_da_conta(uuid, text, text) to authenticated;

-- Auditoria ---------------------------------------------------------------------
-- Trocar o modelo muda o texto que a Sarah fala e o custo da conta, e conectar
-- ou desconectar o provedor muda quem paga por ele. As duas são decisões
-- humanas que alguém vai querer reconstruir meses depois — "por que a Sarah
-- piorou em março?" começa por saber que o modelo mudou naquele dia e quem o
-- mudou. Daí a trilha genérica.
--
-- `connection` fica fora da comparação: ela é o resumo que o provedor devolveu,
-- reescrito a toda reconexão, e uma linha de trilha dizendo "o final da chave
-- mudou" é ruído ao lado da que diz que a conta trocou de provedor.
create trigger model_settings_auditoria
  after update or delete on public.model_settings
  for each row execute function public.registrar_auditoria('account_id', 'connection');

-- Isolamento --------------------------------------------------------------------
-- `model_settings` tem leitura de membro e **nenhuma escrita de cliente**. As
-- duas coisas que a tabela guarda mudam por porta própria: a escolha do modelo
-- por `escolher_modelo_da_conta`, que confere o papel; a conexão por
-- `concluir_conexao_de_modelo` e `desconectar_modelo_da_conta`, que só o
-- servidor executa, depois do OAuth. Uma política de update de administrador
-- juntaria as duas na mesma escrita, e quem pode trocar o modelo passaria a
-- poder declarar a conta conectada sem ter autorizado nada.
alter table public.model_settings enable row level security;

create policy model_settings_leitura_de_membro
  on public.model_settings for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy model_settings_leitura_de_membro on public.model_settings is
  'Todo membro lê de qual modelo a conta fala, porque é isso que explica o custo e o texto que a Sarah recebe. Escrever é por RPC: a escolha confere o papel, a conexão é do servidor.';

-- `model_auth_states` é classe Servidor e fechada: RLS ligada e nenhuma
-- política. Nem leitura — o `code_verifier` está em claro nela, e a única coisa
-- que precisa lê-lo é a RPC de consumo, que roda como service_role.
alter table public.model_auth_states enable row level security;
