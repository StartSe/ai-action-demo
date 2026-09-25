-- O portão: a F3 liga `feature_flags.real_dialing` (US-118, O-02, L-03, RF-912).
-- Referência: docs/PRD-implementacao.md seções 6 (passo 2) e 11,
-- docs/revisao-tecnica.md O-02 e L-03, e o cabeçalho de
-- 20260922000000_operacao_da_conta.sql, onde a bandeira nasceu falsa.
--
-- É a ÚLTIMA migração da fatia. A F2 disca só para número de teste; a F3 traz
-- o que faltava para ligar para lead de verdade — o bloqueio dentro da
-- chamada, a transferência, o ensaio e a fila de exceções — e esta migração é
-- a que abre a porta depois de tudo isso estar no banco.
--
-- Três decisões:
--
-- 1. **Confere antes de ligar.** O bloco de prontidão levanta exceção, com a
--    razão escrita, quando falta qualquer objeto da fatia. Portão que se liga
--    sem a fatia pronta não é portão, é comentário: um deploy que pulasse uma
--    migração da F3, ou a reordenasse para depois desta, abriria a discagem
--    para lead real sem o "não me ligue mais". Cada condição se confere pelo
--    catálogo, e cada uma tem sabotagem em testes/banco/portao-de-lead-real.test.ts.
--
-- 2. **Ligar a bandeira não libera sozinho.** O passo 2 de `guard_dial` exige
--    `real_dialing` verdadeiro E `first_test_call_ok_at` preenchido. A conta
--    que nunca fez a ligação de teste continua restrita a
--    `account_test_numbers` — é isso que impede a primeira ligação de uma
--    conta mal configurada de ser para um cliente real. Por isso a guarda com
--    o passo 2 é uma das condições da prontidão: sem ela, esta migração seria
--    a liberação inteira, e não a metade dela.
--
-- 3. **Conta nova nasce igual às antigas.** O `update` alcança quem já existia;
--    o `default` alcança quem nasce depois. Sinalizador que só vale para conta
--    existente é portão com furo no dia seguinte: a conta criada amanhã
--    nasceria com a F2 dentro da F3.

-- Prontidão da F3 ----------------------------------------------------------------
do $prontidao$
declare
  v_faltas text[] := '{}'::text[];
  v_guarda regprocedure;
  v_corpo text;
begin
  -- `dnc_entries` aceita a origem `wrong_number` (US-096, US-104): o número
  -- errado vira bloqueio dentro da chamada.
  if to_regclass('public.dnc_entries') is null or not exists (
    select 1 from pg_catalog.pg_constraint c
     where c.conrelid = 'public.dnc_entries'::regclass
       and c.contype = 'c'
       and pg_catalog.pg_get_constraintdef(c.oid) like '%source%'
       and pg_catalog.pg_get_constraintdef(c.oid) like '%''wrong_number''%'
  ) then
    v_faltas := v_faltas || 'dnc_entries não aceita a origem wrong_number'::text;
  end if;

  -- `exception_items` com os três gêneros (US-097).
  if to_regclass('public.exception_items') is null or not exists (
    select 1 from pg_catalog.pg_constraint c
     where c.conrelid = 'public.exception_items'::regclass
       and c.contype = 'c'
       and pg_catalog.pg_get_constraintdef(c.oid) like '%kind%'
       and pg_catalog.pg_get_constraintdef(c.oid) like '%''human_requested''%'
       and pg_catalog.pg_get_constraintdef(c.oid) like '%''dnc_requested''%'
       and pg_catalog.pg_get_constraintdef(c.oid) like '%''repeated_failure''%'
  ) then
    v_faltas := v_faltas
      || 'exception_items não existe com os três gêneros (human_requested, dnc_requested, repeated_failure)'::text;
  end if;

  -- `rehearsals` (US-098).
  if to_regclass('public.rehearsals') is null then
    v_faltas := v_faltas || 'rehearsals não existe'::text;
  end if;

  -- Os dois RPC da fila (US-116): quem abre o item e quem o resolve.
  if to_regprocedure('public.criar_excecao(uuid, text, text, uuid, uuid, jsonb)') is null then
    v_faltas := v_faltas || 'o RPC de criação da fila (criar_excecao) não existe'::text;
  end if;
  if to_regprocedure('public.resolver_excecao(uuid, text)') is null then
    v_faltas := v_faltas || 'o RPC de resolução da fila (resolver_excecao) não existe'::text;
  end if;

  -- A guarda com o passo 2: recusa `real_dialing_gate` quando a bandeira está
  -- desligada OU a primeira ligação de teste está nula. O corpo se lê do
  -- catálogo porque é ele que roda; o comentário da função pode mentir.
  v_guarda := to_regprocedure(
    'public.guard_dial(uuid, text, uuid, text, uuid, text, uuid, text[], timestamptz)'
  );
  if v_guarda is not null then
    select p.prosrc into v_corpo from pg_catalog.pg_proc p where p.oid = v_guarda;
  end if;
  if v_corpo is null
     or v_corpo not like '%''real_dialing_gate''%'
     or v_corpo not like '%not v_conta.real_dialing%'
     or v_corpo not like '%v_conta.first_test_call_ok_at is null%'
  then
    v_faltas := v_faltas
      || 'guard_dial não tem o passo 2 (real_dialing verdadeiro E first_test_call_ok_at preenchido)'::text;
  end if;

  if cardinality(v_faltas) > 0 then
    raise exception 'o portão de lead real não liga: a F3 não está completa'
      using errcode = 'object_not_in_prerequisite_state',
            detail = array_to_string(v_faltas, '; '),
            hint = 'Aplique as migrações da F3 antes desta; ela é a última da fatia.';
  end if;
end;
$prontidao$;

-- O portão liga --------------------------------------------------------------------
alter table public.accounts
  alter column feature_flags set default '{"real_dialing": true}'::jsonb;

select set_config(
  'app.audit_reason',
  'a F3 entrou: a discagem para lead real fica liberada para a conta que já fez a ligação de teste',
  true
);

update public.accounts
   set feature_flags = jsonb_set(feature_flags, '{real_dialing}', 'true'::jsonb)
 where (feature_flags ->> 'real_dialing') is distinct from 'true';

comment on column public.accounts.feature_flags is
  'Sinalizadores da conta. real_dialing nasceu falso na F2 e a migração 20260925000000_portao_de_lead_real.sql o liga em toda conta, antiga e nova, depois de conferir que a F3 está no banco. Ligado não libera sozinho: o passo 2 de guard_dial exige também first_test_call_ok_at preenchido.';
