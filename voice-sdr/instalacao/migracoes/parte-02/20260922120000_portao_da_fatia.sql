-- O portão da fatia: quem preenche `accounts.first_test_call_ok_at` (L-03,
-- O-02, RF-912).
-- Referência: docs/PRD-implementacao.md seção 6 (passo 2),
-- docs/revisao-tecnica.md L-03 e O-02, docs/PRD.md RF-912.
--
-- O passo 2 de `guard_dial` já recusa lead real enquanto `real_dialing` for
-- falso OU `first_test_call_ok_at` for nulo. Faltava o escritor da segunda
-- metade: a coluna nasceu protegida por `proteger_operacao_da_conta`, que só a
-- deixa mudar com `app.primeira_chamada_de_teste` levantado, e ninguém o
-- levantava. Este RPC é esse escritor, e `call-finalize` o chama depois de
-- gravar o desfecho da chamada.
--
-- Três decisões:
--
-- 1. **Quem decide se a chamada prova alguma coisa é o banco, e não a borda.**
--    A borda só chama quando houve conversa, mas a conferência mora aqui: a
--    chamada é de saída, terminou (`status = 'ended'`), foi para um número da
--    lista de teste da própria conta e tem pelo menos um turno com fala. Uma
--    ligação que caiu não é prova de configuração correta, e transcrição sem
--    fala é o mesmo nada com outra forma.
-- 2. **Só a primeira.** `first_test_call_ok_at` é o instante da PRIMEIRA
--    chamada de teste bem-sucedida; a segunda não a reescreve. O `where ... is
--    null` é o que garante, e não uma leitura antes do update: duas
--    finalizações ao mesmo tempo gravam uma vez só.
-- 3. **Só `service_role`.** A conta que pudesse chamar isto abriria a metade do
--    portão que é dela sem ligação nenhuma — bastaria apontar para uma chamada
--    qualquer. Quem chama é `call-finalize`, com a chave de serviço.
--
-- O QUE NÃO ENTRA: a bandeira `real_dialing`. Nenhuma migração da F2 a liga, e
-- `testes/estatica/portao-da-fatia.test.ts` reprova a que tentar. Quem liga é a
-- migração da F3.

create or replace function public.registrar_primeira_chamada_de_teste(p_call_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $primeira$
declare
  v_chamada record;
  v_teve_fala boolean;
  v_gravadas integer;
begin
  select c.id, c.account_id, c.direction, c.status, c.to_number, c.transcript,
         coalesce(c.ended_at, now()) as terminou_em
    into v_chamada
    from public.calls c
   where c.id = p_call_id;

  if not found then
    raise exception 'registrar_primeira_chamada_de_teste: chamada % não existe', p_call_id
      using errcode = 'P0002';
  end if;

  if v_chamada.direction <> 'outbound' or v_chamada.status <> 'ended' then
    return 'nao_terminou';
  end if;

  -- Pelo menos um turno com texto. `texto_da_transcricao` já atravessa forma
  -- inesperada sem levantar erro, e é a mesma leitura da busca na ficha.
  v_teve_fala := btrim(public.texto_da_transcricao(v_chamada.transcript)) <> '';
  if not v_teve_fala then
    return 'sem_transcricao';
  end if;

  if not exists (
    select 1 from public.account_test_numbers t
     where t.account_id = v_chamada.account_id
       and t.phone_e164 = v_chamada.to_number
  ) then
    return 'nao_e_numero_de_teste';
  end if;

  perform set_config('app.primeira_chamada_de_teste', 'on', true);
  perform set_config(
    'app.audit_reason',
    'a primeira ligação de teste da conta terminou com transcrição',
    true
  );

  update public.accounts
     set first_test_call_ok_at = v_chamada.terminou_em
   where id = v_chamada.account_id
     and first_test_call_ok_at is null;
  -- Lido já: o `perform` logo abaixo reescreveria `found`.
  get diagnostics v_gravadas = row_count;

  -- O parâmetro cai antes de devolver: sem isto, o resto da transação de quem
  -- chamou escreveria a coluna por update direto.
  perform set_config('app.primeira_chamada_de_teste', '', true);

  if v_gravadas > 0 then
    return 'registrada';
  end if;
  return 'ja_registrada';
end;
$primeira$;

comment on function public.registrar_primeira_chamada_de_teste(uuid) is
  'Preenche accounts.first_test_call_ok_at com o fim da primeira chamada de teste que terminou com fala na transcrição (L-03, RF-912). Chamada por call-finalize depois de gravar o desfecho. Confere no banco: saída, status ended, número em account_test_numbers da conta e ao menos um turno com texto. Só grava quando a coluna ainda é nula. Devolve registrada, ja_registrada, sem_transcricao, nao_terminou ou nao_e_numero_de_teste. Só service_role executa: a conta que a chamasse abriria a metade do portão que é dela sem ligar para ninguém.';

revoke execute on function public.registrar_primeira_chamada_de_teste(uuid) from public;
grant execute on function public.registrar_primeira_chamada_de_teste(uuid) to service_role;
