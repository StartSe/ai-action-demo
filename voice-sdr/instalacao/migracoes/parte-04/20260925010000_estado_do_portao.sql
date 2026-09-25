-- O estado do portão, lido pela tela de discagem (US-119, RF-912, L-03).
-- Referência: 20260924130000_janela_e_numero_de_teste.sql (passo 2 de
-- `guard_dial`) e 20260925000000_portao_de_lead_real.sql.
--
-- `/config/discagem` mostra se a conta já pode ligar para lead real e o que
-- falta. A tela não calcula isso: ela lê esta função e desenha. A regra mora
-- na guarda, e esta função repete o passo 2 dela com as mesmas duas leituras
-- da mesma linha — a bandeira com `coalesce(..., false)` e a marca da primeira
-- ligação de teste. O teste de banco (testes/banco/estado-do-portao.test.ts)
-- confere as quatro combinações contra `guard_dial`: se um lado mudar sem o
-- outro, a tela passa a prometer o que a guarda recusa.
--
-- O que falta sai como lista de códigos, na ordem em que as coisas acontecem
-- (a bandeira primeiro, a ligação de teste depois), e cada condição separada:
-- uma resposta única "não liberado" esconderia qual das duas falta. Os códigos
-- são do banco (`real_dialing`, `first_test_call`); a interface os traduz para
-- o vocabulário de `_shared/discagem/portao.ts`.
--
-- `security invoker`: quem lê é a RLS de `accounts`, a mesma da leitura
-- direta. Quem não é membro da conta recebe zero linha, e não um portão
-- fechado inventado. Leitura de membro, sem distinção de papel, porque o
-- estado do portão explica a recusa que o operador recebe no discador.

create function public.estado_do_portao(p_account_id uuid)
returns table (
  real_dialing boolean,
  first_test_call_ok_at timestamptz,
  falta text[]
)
language sql
stable
security invoker
set search_path = ''
as $estado$
  select c.bandeira,
         c.marca,
         array_remove(
           array[
             case when not c.bandeira then 'real_dialing' end,
             case when c.marca is null then 'first_test_call' end
           ],
           null
         )
    from (
      select coalesce((a.feature_flags ->> 'real_dialing')::boolean, false) as bandeira,
             a.first_test_call_ok_at as marca
        from public.accounts a
       where a.id = p_account_id
    ) as c
$estado$;

comment on function public.estado_do_portao(uuid) is
  'O estado do portão de lead real (passo 2 de guard_dial) para a tela de discagem: a bandeira, a marca da primeira ligação de teste e o que falta, em código. security invoker: a RLS de accounts decide quem lê.';

revoke execute on function public.estado_do_portao(uuid) from public, anon;
grant execute on function public.estado_do_portao(uuid) to authenticated, service_role;
