-- Freio de emergência, portão de lead real e modo de credencial: o estado de
-- operação da conta, em colunas que a guarda de discagem consegue consultar
-- antes de discar.
-- Referência: docs/PRD-implementacao.md seções 3.1, 3.9, 6 (passos 1 e 2) e 8,
-- docs/PRD.md RF-011, RF-912, docs/revisao-tecnica.md L-03, L-04, T-12 e O-02.
--
-- Migração de expansão (seção 10): nada é removido nem renomeado. As cinco
-- colunas entram em `accounts` porque as três perguntas que elas respondem são
-- da conta inteira e são feitas antes de qualquer linha de chamada existir:
--
-- 1. **Esta conta está parada?** (`dialing_paused_*`, L-04, RF-011) O freio de
--    emergência é o passo 1 da guarda. Ele não é configuração — é um ato, com
--    autor e motivo, e a conta volta a discar quando alguém o desfaz.
-- 2. **Esta conta pode ligar para lead real?** (`first_test_call_ok_at`, L-03,
--    RF-912) O passo 2 da guarda exige `feature_flags.real_dialing` verdadeiro
--    E a primeira chamada de teste concluída. Enquanto um dos dois faltar, só
--    número de `account_test_numbers` passa.
-- 3. **Esta conta usa a chave de quem?** (`credentials_mode`, T-12) É a coluna
--    que a US-010 da F0 anotou como pendência: `resolveSecret` já mede o degrau
--    da plataforma contra ela (`_shared/secrets.ts`) e `integrations-status`
--    já a consulta — até hoje contra uma coluna que não existia, caindo no
--    mais restritivo por falta dela.
--
-- O QUE NÃO ENTRA, e a ausência é decisão: `account_test_numbers` é a US-047 e
-- `guard_dial` é a US-058. Aqui fica só o estado; quem o lê chega depois.
-- Nenhuma migração desta fatia liga `real_dialing` — veja o bloco do portão.

-- Colunas ---------------------------------------------------------------------
alter table public.accounts
  -- O freio (L-04, RF-011) ----------------------------------------------------
  add column dialing_paused_at timestamptz,
  -- Sem chave estrangeira para `profiles`, pelo mesmo motivo de
  -- `audit_log.actor_id`: quem puxou o freio pode sair da conta, e o registro
  -- de quem parou a operação precisa sobreviver à saída. Um `on delete set
  -- null` aqui ainda teria um segundo efeito, pior: ele deixaria a linha com
  -- `dialing_paused_at` preenchido e `dialing_paused_by` nulo, que é
  -- exatamente o estado que o check abaixo existe para impedir — a exclusão de
  -- um perfil passaria a derrubar a conta inteira por violação de restrição.
  add column dialing_paused_by uuid,
  add column dialing_paused_reason text,

  -- O portão (L-03, RF-912) ---------------------------------------------------
  add column first_test_call_ok_at timestamptz,

  -- O modo de credencial (T-12) -----------------------------------------------
  add column credentials_mode text not null default 'account'
    constraint accounts_modo_de_credencial
      check (credentials_mode in ('account', 'platform'));

-- Os três campos do freio andam juntos. Sem este check, "pausado por ninguém,
-- sem motivo" passaria a ser um estado possível, e é o pior de todos: a conta
-- fica parada, a tela não tem o que mostrar e ninguém sabe se pode religar.
-- O motivo em branco entra na mesma recusa — string vazia é o mesmo nada com
-- outro nome.
alter table public.accounts
  add constraint accounts_freio_completo check (
    (dialing_paused_at is null
      and dialing_paused_by is null
      and dialing_paused_reason is null)
    or (dialing_paused_at is not null
      and dialing_paused_by is not null
      and btrim(coalesce(dialing_paused_reason, '')) <> '')
  );

comment on column public.accounts.dialing_paused_at is
  'Instante em que a conta parou de discar (RF-011, L-04). Nulo é conta operando. É o passo 1 da guarda de discagem, e anda junto com dialing_paused_by e dialing_paused_reason por check.';

comment on column public.accounts.dialing_paused_by is
  'Quem puxou o freio. Sem chave estrangeira de propósito: o registro sobrevive à saída da pessoa, e um on delete set null quebraria o check dos três campos.';

comment on column public.accounts.dialing_paused_reason is
  'Por que a conta parou. Obrigatório quando há pausa: freio sem motivo é conta parada que ninguém sabe religar.';

comment on column public.accounts.first_test_call_ok_at is
  'Instante da primeira chamada de teste da conta que terminou com transcrição (RF-912, L-03). Preenchida por call-finalize, nunca pelo cliente: é medição do servidor, e uma conta que a preenchesse sozinha abriria o portão da fatia por conta própria. Com ela nula, a guarda só aceita número de account_test_numbers.';

comment on column public.accounts.credentials_mode is
  'De quem é a chave do provedor que esta conta usa (T-12). account é o padrão e exige chave própria em produção; platform abre mão disso e aceita a chave da plataforma, com o crédito e a identidade que vêm junto. Só o dono muda, por definir_modo_de_credencial.';

-- O portão nasce fechado (O-02, L-03) ------------------------------------------
-- `feature_flags.real_dialing` decide, com `first_test_call_ok_at`, se a conta
-- disca para lead real. Ele nasce FALSO em toda conta — nas que chegarem, pelo
-- default; nas que já existem, pelo update logo abaixo — e NENHUMA migração
-- desta fatia o liga.
--
-- Quem liga é a migração da F3, e a razão é o que a F2 não entrega: sem ensaio,
-- sem tool-transfer, sem tool-dnc e sem fila de exceções, uma ligação para lead
-- real é a Sarah conversando com um cliente sem ninguém para quem transferir e
-- sem caminho para o "não me ligue mais". A F2 prova a ligação contra número de
-- teste; a F3 abre a porta.
--
-- Escrever `false` e não deixar a chave ausente é deliberado: chave ausente faz
-- toda leitura depender de um `coalesce` correto em cada chamador, e basta um
-- esquecer para o portão virar `null`, que não é falso. O valor explícito
-- também deixa a tela de operação mostrar o estado sem inventar o padrão.
alter table public.accounts
  alter column feature_flags set default '{"real_dialing": false}'::jsonb;

update public.accounts
   set feature_flags = jsonb_set(feature_flags, '{real_dialing}', 'false'::jsonb)
 where not (feature_flags ? 'real_dialing');

-- Fora do alcance do cliente ----------------------------------------------------
-- `credentials_mode` e `first_test_call_ok_at` ficam fora do que a política de
-- update de `accounts` alcança, e a fronteira NÃO é grant de coluna: o Supabase
-- reconcede privilégio por `alter default privileges`, e uma trava que o
-- ambiente desfaz sozinho é pior do que não ter trava. O portão é o mesmo de
-- `onboarding_state.health`: um parâmetro de sessão que só quem tem direito
-- levanta, com gatilho `before update` devolvendo o valor antigo quando ele não
-- está de pé.
--
-- São dois parâmetros e não um porque os dois escritores são diferentes: o modo
-- de credencial é ato do dono, por `definir_modo_de_credencial`, que chega
-- nesta migração; a primeira chamada de teste é medição de `call-finalize`, que
-- chega pela chave de serviço e cujo RPC entra com a US-069 — ele levanta
-- `app.primeira_chamada_de_teste` e é concedido só a `service_role`. Um
-- parâmetro só faria quem pode uma coisa poder a outra.
--
-- Até a US-069, a coluna não tem escritor nenhum, e é o estado certo para a
-- fatia: nula é o portão fechado, e fechado é onde ele nasce.
--
-- O alcance da trava é o do cliente, e é o que basta: pelo PostgREST não há
-- como chamar `set_config`, que vive em `pg_catalog` e não é exposto. Quem
-- executa SQL arbitrário no banco já passa por cima de tudo.
create or replace function public.proteger_operacao_da_conta()
returns trigger
language plpgsql
set search_path = ''
as $operacao$
begin
  if coalesce(current_setting('app.modo_de_credencial', true), '') <> 'on' then
    new.credentials_mode := old.credentials_mode;
  end if;

  if coalesce(current_setting('app.primeira_chamada_de_teste', true), '') <> 'on' then
    new.first_test_call_ok_at := old.first_test_call_ok_at;
  end if;

  return new;
end;
$operacao$;

comment on function public.proteger_operacao_da_conta() is
  'Descarta escrita de accounts.credentials_mode que não venha de definir_modo_de_credencial e de accounts.first_test_call_ok_at que não venha de call-finalize. Cada uma tem o seu parâmetro de sessão, porque os dois escritores são diferentes.';

create trigger accounts_protege_operacao
  before update on public.accounts
  for each row execute function public.proteger_operacao_da_conta();

-- Troca do modo de credencial ----------------------------------------------------
-- Classe Dono da matriz (seção 3.9): a política de update de `accounts` é de
-- admin, e este ato é do owner. `security definer` desliga a RLS, então o
-- `has_role(..., 'owner')` aqui dentro não é redundância — é a única barreira
-- que resta.
--
-- Trocar para `platform` é a conta abrindo mão da própria chave em produção:
-- ela passa a ligar com a identidade da plataforma e a gastar o crédito dela.
-- É pouco para um admin decidir, e é por isso que o ato entra na trilha com
-- motivo escrito, pelo gatilho que `accounts` já tem.
create or replace function public.definir_modo_de_credencial(
  p_account_id uuid,
  p_modo text
)
returns text
language plpgsql
security definer
set search_path = ''
as $modo$
declare
  v_modo text := lower(btrim(coalesce(p_modo, '')));
begin
  if not public.has_role(p_account_id, 'owner') then
    raise exception 'o modo de credencial da conta é decisão de quem é dono dela'
      using errcode = '42501';
  end if;

  -- O domínio se confere aqui além do `check` da coluna para que a recusa
  -- chegue como erro de argumento, com os valores aceitos escritos, e não como
  -- violação de restrição com o nome da tabela dentro. O `check` continua sendo
  -- a trava.
  if v_modo not in ('account', 'platform') then
    raise exception 'o modo de credencial é account ou platform, e veio "%"', v_modo
      using errcode = '22023';
  end if;

  perform set_config('app.modo_de_credencial', 'on', true);
  perform set_config(
    'app.audit_reason',
    case v_modo
      when 'platform' then 'a conta passou a usar a chave da plataforma'
      else 'a conta voltou a usar a própria chave'
    end,
    true
  );

  update public.accounts
     set credentials_mode = v_modo
   where id = p_account_id;

  if not found then
    raise exception 'conta inexistente' using errcode = 'P0002';
  end if;

  -- O parâmetro cai antes de a função devolver. Sem isto, o resto da transação
  -- de quem chamou escreveria a coluna por update direto, e a trava valeria
  -- apenas até a primeira chamada legítima do dia.
  perform set_config('app.modo_de_credencial', '', true);

  return v_modo;
end;
$modo$;

comment on function public.definir_modo_de_credencial(uuid, text) is
  'Troca accounts.credentials_mode (T-12). Exige owner: passar para platform é a conta abrindo mão da própria chave em produção. Levanta o parâmetro de sessão que o gatilho de proteção exige e o derruba antes de devolver.';

revoke execute on function public.definir_modo_de_credencial(uuid, text) from public;
grant execute on function public.definir_modo_de_credencial(uuid, text) to authenticated;

-- Trilha -------------------------------------------------------------------------
-- `accounts_auditoria` já existe, com `registrar_auditoria('id')` e nenhuma
-- coluna fora da comparação, e continua assim de propósito: `dialing_paused_at`,
-- `credentials_mode` e `first_test_call_ok_at` são exatamente as ações que
-- alguém vai querer explicar depois — por que a conta parou, quem mandou usar a
-- chave da plataforma, quando o portão de teste fechou. Coluna que entra na
-- lista de ignoradas é coluna de ruído recalculado pelo servidor
-- (`onboarding_state.health` é o caso), e `accounts` não tem nenhuma.
--
-- `testes/banco/operacao-da-conta.test.ts` cobra isso pelo catálogo: o gatilho
-- tem um argumento só. Acrescentar um segundo reprova ali.

-- A exceção da redação -------------------------------------------------------------
-- `redigir_auditoria` casa com o NOME da coluna, e é isso que faz coluna
-- sensível de fase futura nascer coberta. O preço é este caso: `credentials_mode`
-- contém `credential` e sairia da trilha como `[redigido] → [redigido]`, que é
-- uma linha de auditoria que não explica nada — e explicar é a única razão de
-- a coluna estar na trilha.
--
-- A correção é uma lista de exceções nomeadas, e não afrouxar a expressão: o
-- padrão continua sendo redigir, e o que escapa dele está escrito, com a razão.
-- Coluna que guarda VALOR de credencial nunca entra aqui; `credentials_mode`
-- guarda de quem é a chave, não a chave.
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
        when chave <> all (array['credentials_mode'])
         and chave ~ '(token|secret|senha|password|hash|chave|credential)'
          then to_jsonb('[redigido]'::text)
        else dado -> chave
      end
    ),
    '{}'::jsonb
  )
  from jsonb_object_keys(coalesce(dado, '{}'::jsonb)) as chave;
$$;

comment on function public.redigir_auditoria(jsonb) is
  'Troca por [redigido] o valor de toda coluna cujo nome indique segredo. A lista de exceções é nominal e curta: credentials_mode diz de quem é a chave, não qual é. Aplicada antes de o payload entrar em audit_log.';
