-- Chave do endereço público de entrada de leads, por conta.
-- Referência: docs/PRD.md RF-107, docs/PRD-implementacao.md seções 3.9 e 4.5,
-- docs/revisao-tecnica.md L-02.
--
-- A conta recebe lead de fora por um endereço público — formulário do site,
-- integração de terceiro — e o que separa um lead legítimo de qualquer um com
-- a URL é esta chave. Ela é segredo de portador, e por isso segue exatamente a
-- disciplina de `invitations.token_hash`:
--
-- 1. A coluna guarda `sha256(chave)` em hexadecimal, nunca a chave. O `check`
--    de formato é a trava estrutural: valor que não pareça sha-256 em
--    hexadecimal não entra, então a chave em claro não tem como ser gravada
--    aqui nem por engano.
-- 2. O índice único faz a chave resolver a conta numa consulta por igualdade —
--    é assim que a borda de entrada acha a conta sem receber o id de fora — e
--    impede que duas contas fiquem com a mesma chave.
-- 3. A chave em claro nasce no navegador de quem a gira (`gerarChaveDeEntrada`
--    em `supabase/functions/_shared/chave-de-entrada.ts`) e só o hash chega ao
--    banco. O RPC de rotação não devolve nem a chave nem o hash: quem não
--    copiou na hora gira de novo.
--
-- Rotação é o ponto da história. Chave que vazou não se conserta escondendo o
-- endereço; se conserta trocando a chave, e a troca precisa deixar rastro de
-- quem trocou e quando, porque ela invalida toda integração já publicada.

-- Colunas ---------------------------------------------------------------------
alter table public.accounts
  add column intake_key_hash text
    check (intake_key_hash ~ '^[0-9a-f]{64}$'),
  add column intake_key_rotated_at timestamptz,
  add column intake_key_rotated_by uuid
    references public.profiles (id) on delete set null;

comment on column public.accounts.intake_key_hash is
  'sha-256 hexadecimal da chave do endereço público de entrada. Nunca a chave. Nulo enquanto a conta não girou nenhuma.';

comment on column public.accounts.intake_key_rotated_at is
  'Instante da última rotação. É o único dado que girar_chave_de_entrada devolve.';

comment on column public.accounts.intake_key_rotated_by is
  'Quem girou. Sem chave estrangeira para auth.users porque profiles é o espelho público; on delete set null preserva a data mesmo quando a pessoa sai.';

-- Uma consulta por igualdade resolve a conta a partir da chave, e duas contas
-- não colidem. O índice é parcial porque conta que ainda não girou chave tem
-- `null` aqui, e `null` não é colisão de ninguém — mas o parcial deixa isso
-- explícito em vez de depender do comportamento de null no índice único.
create unique index accounts_intake_key_hash_idx
  on public.accounts (intake_key_hash)
  where intake_key_hash is not null;

-- Rotação ---------------------------------------------------------------------
-- `accounts` é classe Configuração da seção 3.9, e a política de update dela já
-- exige admin. A rotação mesmo assim passa por RPC, por duas razões:
--
-- - A conferência de papel fica explícita e testável fora da RLS. `security
--   definer` desliga a política, então a exigência de `has_role(..., 'admin')`
--   aqui dentro não é redundância: é a única barreira que resta.
-- - O retorno é escolhido. Um `update ... returning` pelo PostgREST devolveria
--   a linha inteira, com o hash. Este RPC devolve só o instante, e a garantia
--   é estrutural: não há coluna de hash na assinatura para alguém esquecer de
--   remover da consulta.
--
-- Viewer e operator recebem recusa: quem gira a chave invalida toda integração
-- publicada da conta, e isso é decisão de quem administra.
create or replace function public.girar_chave_de_entrada(
  p_account_id uuid,
  p_hash text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := lower(btrim(coalesce(p_hash, '')));
  v_agora timestamptz := now();
begin
  if not public.has_role(p_account_id, 'admin') then
    raise exception 'a chave do endereço público é girada por quem administra a conta'
      using errcode = '42501';
  end if;

  -- O formato se confere aqui além do `check` da coluna para que a recusa
  -- chegue ao cliente como erro de argumento, e não como violação de
  -- constraint com o nome da tabela dentro. O `check` continua sendo a trava.
  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'a chave de entrada precisa chegar como sha-256 em hexadecimal'
      using errcode = '22023';
  end if;

  -- O motivo viaja para a trilha de auditoria pelo gatilho que accounts já tem.
  -- O payload sai redigido: `redigir_auditoria` casa com o nome da coluna, e
  -- `intake_key_hash` contém `hash`.
  perform set_config('app.audit_reason', 'rotação da chave do endereço público', true);

  update public.accounts
     set intake_key_hash = v_hash,
         intake_key_rotated_at = v_agora,
         intake_key_rotated_by = (select auth.uid())
   where id = p_account_id;

  if not found then
    raise exception 'conta inexistente' using errcode = 'P0002';
  end if;

  return v_agora;
end;
$$;

comment on function public.girar_chave_de_entrada(uuid, text) is
  'Grava o hash da nova chave do endereço público e devolve só o instante da rotação. Exige admin, porque accounts é classe Configuração (seção 3.9) e girar a chave derruba toda integração publicada. Nunca devolve chave nem hash.';

revoke execute on function public.girar_chave_de_entrada(uuid, text) from public;
grant execute on function public.girar_chave_de_entrada(uuid, text) to authenticated;
