-- Conexão de telefonia por autorização, em vez de chave colada na tela.
-- Referência: docs/referencia-de-integracoes.md seção 2 e docs/PRD.md RF-006,
-- RF-007 e RF-911.
--
-- A Twilio permite que o cliente autorize a plataforma em vez de entregar
-- credencial: ele aceita uma vez, a Twilio cria uma subconta sob a conta dele e
-- devolve o identificador dessa subconta. A plataforma passa a agir com esse
-- identificador mais o próprio segredo — a credencial do cliente nunca sai da
-- casa dele.
--
-- Três coisas melhoram de uma vez:
--
-- 1. **Não há segredo do cliente para guardar.** O que se guarda é o
--    identificador da subconta, que não é credencial: sozinho não abre nada.
--    Por isso esta tabela não usa o Vault, ao contrário de `account_secrets`.
-- 2. **O consumo é cobrado na conta do cliente.** Número e minutos entram na
--    fatura dele, e a plataforma não intermedia pagamento de telefonia.
-- 3. **O pacote regulatório é dele.** Comprar número no Brasil exige documento
--    da empresa que vai usá-lo, e na subconta quem responde é o cliente. Sai da
--    lista de esperas da plataforma (O-03) e vira passo da configuração inicial
--    de cada conta.
--
-- A chave colada continua valendo: conta que já configurou por chave não
-- precisa reconectar, e provedor que não oferece autorização (o de voz, hoje)
-- continua pelo cofre. É `resolveSecret` que escolhe, e a ordem está no
-- comentário de `modo_de_telefonia`.

create table public.telephony_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- Mesmo vocabulário de `phone_lines.provider`, normalizado na escrita.
  provider text not null default 'twilio'
    check (provider = lower(btrim(provider)) and provider <> ''),
  -- O identificador da subconta que o provedor devolve depois do aceite. Não é
  -- segredo: sem o segredo da plataforma ele não autentica nada. É por isso que
  -- mora aqui, em texto, e não no Vault.
  provider_account_id text not null
    check (length(btrim(provider_account_id)) > 0),
  -- Quem autorizou e quando. A autorização é ação sensível (RF-008) e a
  -- pergunta "quem ligou esta conta ao provedor" precisa de resposta.
  authorized_by uuid references public.profiles (id),
  authorized_at timestamptz not null default now(),
  -- O cliente pode revogar do lado do provedor a qualquer momento. Quando a
  -- revogação chega, a linha não some: ela ganha data, para a tela explicar o
  -- que aconteceu em vez de voltar ao estado "nunca conectado".
  revoked_at timestamptz,
  revoked_reason text,
  -- O que a autorização concedeu, como o provedor informou. Guardado como veio,
  -- para a tela poder dizer "falta permissão de cobrança" em vez de só falhar
  -- na hora de comprar número.
  scopes text[] not null default array[]::text[],
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.telephony_connections is
  'Autorização do cliente para a plataforma operar a telefonia dele. Guarda o identificador da subconta, nunca credencial.';

comment on column public.telephony_connections.provider_account_id is
  'Identificador da subconta no provedor. Não é segredo: sozinho não autentica. Por isso fica aqui e não no Vault.';

comment on column public.telephony_connections.revoked_at is
  'Preenchida quando o cliente revoga do lado do provedor. A linha fica, para a tela distinguir revogado de nunca conectado.';

-- Uma conexão viva por provedor e por conta. Parcial, porque conexão revogada
-- fica no histórico e não deve disputar a unicidade com a nova.
create unique index telephony_connections_uma_viva_por_provedor
  on public.telephony_connections (account_id, provider)
  where revoked_at is null;

create trigger telephony_connections_set_updated_at
  before update on public.telephony_connections
  for each row execute function public.set_updated_at();

-- Como esta conta fala com a telefonia ---------------------------------------
-- Responde a pergunta que `call-place` e `phone-register` fazem antes de tocar
-- no provedor. A ordem é: autorização viva ganha da chave no cofre, porque
-- quem conectou depois quis conectar. Sem nenhuma das duas, a conta não disca.
create or replace function public.modo_de_telefonia(p_account_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $modo$
  select case
    when exists (
      select 1 from public.telephony_connections as c
       where c.account_id = p_account_id
         and c.provider = 'twilio'
         and c.revoked_at is null
    ) then 'conectado'
    when exists (
      select 1 from public.account_secrets as s
       where s.account_id = p_account_id
         and s.provider = 'telefonia'
    ) then 'chave'
    else 'ausente'
  end;
$modo$;

comment on function public.modo_de_telefonia(uuid) is
  'Como a conta fala com a telefonia: conectado (autorização viva), chave (segredo no cofre) ou ausente. Autorização ganha da chave.';

revoke execute on function public.modo_de_telefonia(uuid) from public;
grant execute on function public.modo_de_telefonia(uuid) to authenticated, service_role;

-- Registrar a autorização -----------------------------------------------------
-- Chamada pela função de borda que recebe o retorno do provedor, em nome do
-- serviço. Substituir uma conexão viva por outra é reautorizar: a anterior é
-- revogada na mesma transação, para o índice parcial não recusar a nova e para
-- o histórico guardar as duas.
create or replace function public.registrar_conexao_de_telefonia(
  p_account_id uuid,
  p_provider_account_id text,
  p_authorized_by uuid default null,
  p_scopes text[] default array[]::text[],
  p_provider text default 'twilio'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $registro$
declare
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_conta_do_provedor text := btrim(coalesce(p_provider_account_id, ''));
  v_id uuid;
begin
  if v_provider = '' or v_conta_do_provedor = '' then
    raise exception 'provedor e identificador da conta no provedor são obrigatórios'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.accounts as a where a.id = p_account_id) then
    raise exception 'conta inexistente'
      using errcode = '23503';
  end if;

  update public.telephony_connections
     set revoked_at = now(),
         revoked_reason = 'substituída por nova autorização'
   where account_id = p_account_id
     and provider = v_provider
     and revoked_at is null;

  insert into public.telephony_connections
    (account_id, provider, provider_account_id, authorized_by, scopes)
  values
    (p_account_id, v_provider, v_conta_do_provedor, p_authorized_by,
     coalesce(p_scopes, array[]::text[]))
  returning id into v_id;

  insert into public.audit_log
    (account_id, actor, actor_id, source, action,
     target_type, target_id, reason, payload)
  values (
    p_account_id,
    case when p_authorized_by is null then 'system' else 'user' end,
    p_authorized_by,
    'rpc:registrar_conexao_de_telefonia',
    'insert',
    'telephony_connections',
    v_id,
    'autorização de telefonia concedida',
    jsonb_build_object('provedor', v_provider, 'escopos', coalesce(p_scopes, array[]::text[]))
  );

  return v_id;
end;
$registro$;

comment on function public.registrar_conexao_de_telefonia(uuid, text, uuid, text[], text) is
  'Guarda a autorização devolvida pelo provedor, revogando a anterior na mesma transação. Grava auditoria. Só o serviço chama.';

revoke execute on function public.registrar_conexao_de_telefonia(uuid, text, uuid, text[], text) from public;
-- Só o serviço: quem chama é a função de borda que recebeu o retorno do
-- provedor e já conferiu a assinatura dele. Cliente não declara autorização.
grant execute on function public.registrar_conexao_de_telefonia(uuid, text, uuid, text[], text) to service_role;

-- Revogar ---------------------------------------------------------------------
create or replace function public.revogar_conexao_de_telefonia(
  p_account_id uuid,
  p_reason text default null,
  p_provider text default 'twilio'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $revoga$
declare
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_usuario uuid := auth.uid();
  v_afetadas integer;
begin
  -- Quem revoga pela interface precisa administrar a conta; quem revoga pelo
  -- aviso do provedor é o serviço, e aí não há sessão.
  if v_usuario is not null and not public.has_role(p_account_id, 'admin') then
    raise exception 'desconectar a telefonia é de administrador'
      using errcode = '42501';
  end if;

  update public.telephony_connections
     set revoked_at = now(),
         revoked_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where account_id = p_account_id
     and provider = v_provider
     and revoked_at is null;

  get diagnostics v_afetadas = row_count;

  if v_afetadas > 0 then
    insert into public.audit_log
      (account_id, actor, actor_id, source, action,
       target_type, target_id, reason, payload)
    values (
      p_account_id,
      case when v_usuario is null then 'system' else 'user' end,
      v_usuario,
      'rpc:revogar_conexao_de_telefonia',
      'update',
      'telephony_connections',
      null,
      nullif(btrim(coalesce(p_reason, '')), ''),
      jsonb_build_object('provedor', v_provider)
    );
  end if;

  return v_afetadas;
end;
$revoga$;

comment on function public.revogar_conexao_de_telefonia(uuid, text, text) is
  'Revoga a autorização viva. Pela interface exige administrador; pelo aviso do provedor roda sem sessão.';

revoke execute on function public.revogar_conexao_de_telefonia(uuid, text, text) from public;
grant execute on function public.revogar_conexao_de_telefonia(uuid, text, text) to authenticated, service_role;

-- Isolamento (classe Configuração da seção 3.9) -------------------------------
alter table public.telephony_connections enable row level security;

create policy telephony_connections_leitura_de_membro
  on public.telephony_connections for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy telephony_connections_leitura_de_membro on public.telephony_connections is
  'Classe Configuração: todo membro vê se a telefonia está conectada, porque é isso que explica por que a discagem funciona ou não.';

-- Sem política de insert, update ou delete: a autorização entra pelo retorno do
-- provedor e sai pelo RPC de revogação, os dois em nome do serviço. Cliente que
-- pudesse escrever aqui declararia uma autorização que nunca aconteceu.

create trigger telephony_connections_auditoria
  after update or delete on public.telephony_connections
  for each row execute function public.registrar_auditoria();
