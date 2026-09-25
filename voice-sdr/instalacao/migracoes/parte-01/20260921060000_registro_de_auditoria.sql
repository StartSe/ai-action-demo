-- Registro de auditoria: quem mudou o quê, quando, e o que a linha era antes.
-- Referência: docs/PRD.md RNF de rastreabilidade, docs/PRD-implementacao.md
-- seções 3.1 (audit_log) e 3.9 (classe Servidor).
--
-- A decisão que dá valor a esta tabela é uma só: o registro não é escrito pelo
-- cliente. Ele nasce de gatilho `after update or delete`, dentro da mesma
-- transação da mudança. Duas consequências:
--
-- 1. Mudança e registro vivem ou morrem juntos. Não existe escrita que o
--    `rollback` desfaça e auditoria que sobreviva, nem o contrário.
-- 2. Não há caminho por onde o cliente forje uma linha. `audit_log` tem RLS
--    ligada e uma única política, de leitura, para membro da conta. Sem
--    política de insert, update ou delete, o padrão nega — inclusive para o
--    owner. Quem escreve é a função de gatilho, que é `security definer` e
--    roda como dona da tabela.
--
-- Não há `revoke insert ... from authenticated` aqui, e é escolha consciente:
-- o Supabase reconcede os privilégios de `public` por `alter default
-- privileges`, e uma trava que o ambiente desfaz sozinho é pior do que não ter
-- trava nenhuma. A fronteira real é a ausência de política, que
-- testes/banco/registro-de-auditoria.test.ts prova pelos dois lados.

-- audit_log --------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- Quem agiu. `user` é gente com sessão; `agent` é a Sarah decidindo sozinha;
  -- `system` é rotina do servidor, sem sessão e sem agente.
  actor text not null check (actor in ('user', 'agent', 'system')),
  -- Sem chave estrangeira para profiles de propósito: o registro precisa
  -- sobreviver à saída de quem o gerou. `on delete set null` apagaria
  -- justamente o que a auditoria existe para guardar.
  actor_id uuid,
  -- De onde veio a escrita: `trigger`, `rpc:<nome>`, `edge:<função>`. Diz por
  -- qual porta a mudança entrou, que é diferente de qual tabela ela tocou.
  source text not null check (length(btrim(source)) > 0),
  action text not null check (length(btrim(action)) > 0),
  target_type text not null check (length(btrim(target_type)) > 0),
  target_id uuid,
  reason text,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  -- Ação de gente sem autor identificado não é auditoria, é ruído.
  check (actor <> 'user' or actor_id is not null),
  check (actor <> 'system' or actor_id is null)
);

comment on table public.audit_log is
  'Trilha de auditoria por conta. Escrita por gatilho ou RPC na mesma transação da mudança; o cliente só lê.';

comment on column public.audit_log.actor_id is
  'Usuário ou agente que agiu. Sem chave estrangeira: o registro sobrevive a quem o gerou.';

comment on column public.audit_log.source is
  'Porta por onde a mudança entrou: trigger, rpc:<nome>, edge:<função>.';

comment on column public.audit_log.payload is
  'Antes e depois dos campos que mudaram, já redigidos. Nunca o valor de uma credencial.';

-- A tela de auditoria lê a conta em ordem decrescente de data, e é só isso que
-- ela faz. O segundo índice atende "o que aconteceu com esta linha".
create index audit_log_conta_recente_idx
  on public.audit_log (account_id, created_at desc);

create index audit_log_alvo_idx
  on public.audit_log (account_id, target_type, target_id);

-- Isolamento --------------------------------------------------------------------
-- Classe Servidor: membro lê a própria conta, ninguém escreve pelo cliente.
alter table public.audit_log enable row level security;

create policy audit_log_leitura_membro
  on public.audit_log
  for select
  to authenticated
  using ((select public.is_member(account_id)));

comment on policy audit_log_leitura_membro on public.audit_log is
  'Classe Servidor: membro lê a trilha da própria conta. Não há política de escrita, e é o ponto da tabela.';

-- Redação ------------------------------------------------------------------------
-- O payload guarda o valor anterior dos campos, e há campos cujo valor anterior
-- não pode ser guardado em lugar nenhum: hash de token de convite, ponteiro do
-- cofre, senha. A regra é sobre o nome da coluna, não sobre a tabela, para que
-- coluna sensível de fase futura nasça coberta.
create or replace function public.redigir_auditoria(dado jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(
      chave,
      case
        when chave ~ '(token|secret|senha|password|hash|chave|credential)'
          then to_jsonb('[redigido]'::text)
        else dado -> chave
      end
    ),
    '{}'::jsonb
  )
  from jsonb_object_keys(coalesce(dado, '{}'::jsonb)) as chave;
$$;

comment on function public.redigir_auditoria(jsonb) is
  'Troca por [redigido] o valor de toda coluna cujo nome indique segredo. Aplicada antes de o payload entrar em audit_log.';

-- Gatilho -------------------------------------------------------------------------
-- Um gatilho só, parametrizado pela coluna que carrega a conta: `accounts` se
-- liga por `id`, as demais por `account_id`. Tabela de configuração nova ganha
-- auditoria com uma linha de `create trigger`, sem código novo.
create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $auditoria$
declare
  -- Colunas fora da comparação: `updated_at` muda em toda escrita, por gatilho,
  -- e um registro que só diz "updated_at mudou" é ruído puro. Do segundo
  -- argumento em diante, o gatilho acrescenta as suas: coluna de cache que o
  -- servidor recalcula (`onboarding_state.health`) não é fato auditável, e sem
  -- tirá-la da comparação cada recálculo viraria uma linha de trilha.
  c_ignoradas constant text[] :=
    array['updated_at'] || coalesce(tg_argv[1:], array[]::text[]);
  v_coluna text := coalesce(tg_argv[0], 'account_id');
  v_antes jsonb := to_jsonb(old);
  v_depois jsonb;
  v_account_id uuid;
  v_alvo uuid;
  v_usuario uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(current_setting('app.audit_reason', true), '')), '');
  v_mudancas text[];
  v_payload jsonb;
begin
  v_account_id := (v_antes ->> v_coluna)::uuid;
  if v_account_id is null then
    return null;
  end if;

  -- Apagar a conta cascateia para as filhas, e o gatilho de cada filha correria
  -- para gravar auditoria de uma conta que já não existe: a chave estrangeira
  -- recusaria a linha e a exclusão inteira falharia. A trilha da conta some
  -- junto com ela de qualquer forma, então não há o que preservar aqui.
  if not exists (select 1 from public.accounts as a where a.id = v_account_id) then
    return null;
  end if;

  v_alvo := (v_antes ->> 'id')::uuid;

  if tg_op = 'UPDATE' then
    v_depois := to_jsonb(new);

    select coalesce(array_agg(chave order by chave), array[]::text[])
      into v_mudancas
      from jsonb_object_keys(v_antes || v_depois) as chave
     where chave <> all (c_ignoradas)
       and (v_antes -> chave) is distinct from (v_depois -> chave);

    -- Update que não mudou nada além de updated_at não é fato auditável.
    if cardinality(v_mudancas) = 0 then
      return null;
    end if;

    v_payload := jsonb_build_object(
      'campos', to_jsonb(v_mudancas),
      'antes', public.redigir_auditoria(
        (select coalesce(jsonb_object_agg(k, v_antes -> k), '{}'::jsonb)
           from unnest(v_mudancas) as k)
      ),
      'depois', public.redigir_auditoria(
        (select coalesce(jsonb_object_agg(k, v_depois -> k), '{}'::jsonb)
           from unnest(v_mudancas) as k)
      )
    );
  else
    v_payload := jsonb_build_object('antes', public.redigir_auditoria(v_antes));
  end if;

  insert into public.audit_log
    (account_id, actor, actor_id, source, action, target_type, target_id, reason, payload)
  values (
    v_account_id,
    case when v_usuario is null then 'system' else 'user' end,
    v_usuario,
    'trigger',
    lower(tg_op),
    tg_table_name,
    v_alvo,
    v_reason,
    v_payload
  );

  return null;
end;
$auditoria$;

comment on function public.registrar_auditoria() is
  'Gatilho after update or delete: grava em audit_log o autor (auth.uid()) e os campos que mudaram. O primeiro argumento é a coluna que aponta para a conta; do segundo em diante, colunas a deixar fora da comparação.';

-- Tabelas de configuração existentes ------------------------------------------------
-- `profiles` fica de fora e por um motivo estrutural, não por esquecimento: ela
-- não tem conta. O mesmo usuário serve várias contas, e não há account_id para
-- onde mandar o registro.
create trigger accounts_auditoria
  after update or delete on public.accounts
  for each row execute function public.registrar_auditoria('id');

create trigger account_members_auditoria
  after update or delete on public.account_members
  for each row execute function public.registrar_auditoria();

create trigger invitations_auditoria
  after update or delete on public.invitations
  for each row execute function public.registrar_auditoria();

create trigger account_secrets_auditoria
  after update or delete on public.account_secrets
  for each row execute function public.registrar_auditoria();
