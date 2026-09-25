-- Os números de teste da conta (`account_test_numbers`): o conjunto para o qual,
-- e só para o qual, a F2 libera discagem enquanto o portão da fatia está
-- fechado.
-- Referência: docs/PRD-implementacao.md seções 3.1, 3.9 e 6 (passo 2 da guarda),
-- docs/revisao-tecnica.md L-03 e O-02, docs/PRD.md RF-912.
--
-- A migração anterior (20260922000000_operacao_da_conta.sql) criou o portão em
-- `accounts` e anotou que o outro lado dele — a lista de números que passa
-- enquanto o portão está fechado — era esta história. É esta tabela.
--
-- Três decisões que o esquema carrega:
--
-- 1. **Forma conferida pelo banco, normalização fora dele.** O check é o mesmo
--    de `leads.phone_e164` da F1, letra por letra: quem transforma "(11)
--    99000-0000" em `+5511990000000` é `_shared/telefone.ts`, o módulo portável
--    que a tela e a borda dividem. O banco só recusa o que chegou torto.
-- 2. **Teto de doze por conta, por gatilho.** É conjunto de teste, não base de
--    leads. Uma lista que crescesse sem limite viraria o caminho para discar em
--    lote antes da F3, passando por cima do portão em vez de esperar por ele.
--    Doze cabe numa tela sem paginar e cobre time, clientes-cobaia e os números
--    de operadora que se quer conferir antes de abrir.
-- 3. **Autor e hora vêm do banco.** `created_by` é `auth.uid()` carimbado por
--    gatilho, não campo de formulário: acrescentar um número é o ato que abre a
--    discagem para ele, e "quem pôs esse número aqui?" é a primeira pergunta
--    depois de uma ligação sair para onde não devia. Alterar e apagar entram na
--    trilha por `registrar_auditoria`; o insert já tem autor e hora na própria
--    linha, que é o que a função de auditoria não saberia contar (ela lê `old`).

-- A tabela ---------------------------------------------------------------------
create table public.account_test_numbers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- E.164: o `+`, o país sem zero à esquerda e de 8 a 15 dígitos no total. O
  -- mesmo check de `leads.phone_e164`, e de propósito o mesmo: um número que a
  -- guarda vai comparar com o do lead precisa ter nascido da mesma régua, senão
  -- o portão recusaria o próprio número de teste por diferença de forma.
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  -- De quem é este número. Obrigatório e não em branco porque uma lista de
  -- números sem dono na tela não diz para quem se está ligando, e o operador
  -- que precisa tirar um da lista não saberia qual.
  label text not null check (length(btrim(label)) > 0),
  -- Quem acrescentou. Nulo quando não houve sessão — o servidor semeando pela
  -- chave de serviço —, e é a cascata de `profiles` que o esvazia depois, sem
  -- levar o número junto: perder o autor não pode apagar a permissão de discar.
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- O mesmo número duas vezes na mesma conta não acrescenta permissão nenhuma e
  -- deixa a tela com duas linhas que o operador não sabe distinguir. Na conta
  -- vizinha entra: o telefone do time de suporte pode ser teste em duas contas.
  constraint account_test_numbers_unico_por_conta unique (account_id, phone_e164)
);

comment on table public.account_test_numbers is
  'Os números de teste da conta (L-03). Enquanto feature_flags.real_dialing é falso ou accounts.first_test_call_ok_at é nulo, o passo 2 da guarda só deixa discar para um número desta lista. Teto de doze por conta, por gatilho: é conjunto de teste, não base de leads, e uma lista sem limite seria o caminho para discar em lote antes da F3.';

comment on column public.account_test_numbers.phone_e164 is
  'Telefone em E.164, forma conferida pelo banco com o mesmo check de leads.phone_e164. Normalizar é do módulo portável _shared/telefone.ts.';

comment on column public.account_test_numbers.label is
  'De quem é o número: "meu celular", "Ana do suporte", "linha da Vivo". Obrigatório porque uma lista sem dono não diz para quem se está ligando.';

comment on column public.account_test_numbers.created_by is
  'Quem acrescentou o número, carimbado de auth.uid() pelo gatilho e não pelo cliente. Nulo quando não houve sessão. O insert não passa por registrar_auditoria — a função lê old —, então autor e hora do nascimento moram aqui.';

create trigger account_test_numbers_set_updated_at
  before update on public.account_test_numbers
  for each row execute function public.set_updated_at();

-- Autor ------------------------------------------------------------------------
-- O autor é do banco, como o número da versão do playbook: cliente que mandar o
-- id de outra pessoa recebe o próprio. Sem sessão (chave de serviço) o que veio
-- no insert fica, porque aí não há `auth.uid()` que contradiga.
create or replace function public.carimbar_autor_do_numero_de_teste()
returns trigger
language plpgsql
security definer
set search_path = ''
as $autor$
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end;
$autor$;

comment on function public.carimbar_autor_do_numero_de_teste() is
  'Gatilho before insert: escreve auth.uid() em created_by, descartando o que o cliente mandar. Sem sessão, mantém o que veio.';

revoke execute on function public.carimbar_autor_do_numero_de_teste() from public;

create trigger account_test_numbers_carimbar_autor
  before insert on public.account_test_numbers
  for each row execute function public.carimbar_autor_do_numero_de_teste();

-- Teto -------------------------------------------------------------------------
-- Doze por conta. A trava na linha da conta serializa dois inserts simultâneos:
-- sem ela, os dois leriam a mesma fotografia de onze e entrariam os dois.
-- `update of account_id` está no gatilho porque mudar a conta de um número é um
-- insert na conta de destino com outro nome, e passaria pelo teto sem ser visto.
create or replace function public.limitar_numeros_de_teste()
returns trigger
language plpgsql
security definer
set search_path = ''
as $teto$
declare
  -- O teto mora aqui e não em configuração: afrouxá-lo é decidir que a conta
  -- disca em lote antes do portão, e isso é migração, não campo de tela.
  c_teto constant integer := 12;
  v_total integer;
begin
  -- Update que não troca de conta não acrescenta linha nenhuma: sair aqui evita
  -- que a própria linha, já contada, faça a décima segunda recusar a si mesma.
  if tg_op = 'UPDATE' and new.account_id = old.account_id then
    return new;
  end if;

  perform 1 from public.accounts as a where a.id = new.account_id for update;

  select count(*)
    into v_total
    from public.account_test_numbers as t
   where t.account_id = new.account_id;

  if v_total >= c_teto then
    raise exception
      'a conta já tem os % números de teste que a fatia permite: apague um antes de acrescentar outro',
      c_teto
      using errcode = '23514',
            hint = 'account_test_numbers é o conjunto de teste da conta, não a base de leads.';
  end if;

  return new;
end;
$teto$;

comment on function public.limitar_numeros_de_teste() is
  'Gatilho before insert or update of account_id: recusa o décimo terceiro número de teste da conta, com a linha da conta travada. O teto é de doze e mora no corpo da função, não em configuração.';

revoke execute on function public.limitar_numeros_de_teste() from public;

create trigger account_test_numbers_limitar
  before insert or update of account_id on public.account_test_numbers
  for each row execute function public.limitar_numeros_de_teste();

-- Isolamento (classe Configuração da seção 3.9) --------------------------------
alter table public.account_test_numbers enable row level security;

create policy account_test_numbers_leitura_de_membro
  on public.account_test_numbers for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy account_test_numbers_leitura_de_membro on public.account_test_numbers is
  'Classe Configuração: todo membro lê a lista, porque é ela que explica ao operador por que a discagem recusou um número que não está nela.';

create policy account_test_numbers_insercao_de_admin
  on public.account_test_numbers for insert to authenticated
  with check ((select public.has_role(account_id, 'admin')));

comment on policy account_test_numbers_insercao_de_admin on public.account_test_numbers is
  'Classe Configuração: acrescentar um número é abrir a discagem para ele enquanto o portão da fatia está fechado (L-03). Operador não abre.';

create policy account_test_numbers_alteracao_de_admin
  on public.account_test_numbers for update to authenticated
  using ((select public.has_role(account_id, 'admin')))
  with check ((select public.has_role(account_id, 'admin')));

comment on policy account_test_numbers_alteracao_de_admin on public.account_test_numbers is
  'Classe Configuração: trocar o número de uma linha existente é abrir a discagem para outro destino, e vale o mesmo que acrescentar.';

create policy account_test_numbers_exclusao_de_admin
  on public.account_test_numbers for delete to authenticated
  using ((select public.has_role(account_id, 'admin')));

comment on policy account_test_numbers_exclusao_de_admin on public.account_test_numbers is
  'Classe Configuração: tirar um número fecha a discagem para ele, e quem abre é quem fecha.';

-- Auditoria --------------------------------------------------------------------
-- Alterar e apagar entram na trilha (RF-008). O insert não: `registrar_auditoria`
-- lê `old`, e o nascimento já tem autor e hora em created_by e created_at.
create trigger account_test_numbers_auditoria
  after update or delete on public.account_test_numbers
  for each row execute function public.registrar_auditoria('account_id');
