-- A medição que a finalização grava na avaliação da chamada (RF-422, US-109).
-- Referência: docs/PRD.md RF-422 e RF-909, docs/PRD-implementacao.md seção 3.5.
--
-- `calls.evaluation` tem dois escritores. `call-classify` grava o juízo do
-- modelo (`criterios`, `modelo`); `call-finalize` grava o que se mede sobre a
-- transcrição sem modelo nenhum, sob `medicoes`, uma chave por critério — hoje
-- só `encerramento_pessoa_errada`, a contagem de falas da Sarah depois de
-- identificar pessoa errada.
--
-- **A escrita é mescla no banco, e não `update` do objeto inteiro.** A
-- finalização pode passar duas vezes pela mesma chamada (reivindicação vencida,
-- R-02), e o PostgREST só sabe trocar a coluna inteira: ler, mesclar e gravar
-- pela borda apagaria o que a classificação escreveu entre a leitura e a
-- escrita. Aqui o `jsonb_set` lê e grava na mesma linha travada pelo `update`.
-- A classificação faz o caminho de volta: carrega `medicoes` para o objeto que
-- ela grava (`call-classify/classificacao.ts`).
--
-- `security definer` com execução só para `service_role`: quem mede é a borda,
-- e sessão de cliente escrevendo avaliação seria nota fabricada.

create or replace function public.registrar_medicao_da_avaliacao(
  p_account_id uuid,
  p_call_id uuid,
  p_criterio text,
  p_medicao jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $medir$
declare
  v_linhas integer;
begin
  if p_criterio is null or p_criterio !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception 'criterio_invalido'
      using errcode = '22023',
            detail = format('O critério é uma chave em minúsculas com sublinhado; chegou %s.', coalesce(p_criterio, 'nulo'));
  end if;
  if p_medicao is null or jsonb_typeof(p_medicao) <> 'object' then
    raise exception 'medicao_invalida'
      using errcode = '22023',
            detail = 'A medição é um objeto jsonb.';
  end if;

  update public.calls c
     set evaluation = jsonb_set(
           c.evaluation,
           '{medicoes}',
           (case when jsonb_typeof(c.evaluation -> 'medicoes') = 'object'
                 then c.evaluation -> 'medicoes'
                 else '{}'::jsonb end)
             || jsonb_build_object(p_criterio, p_medicao),
           true
         )
   where c.account_id = p_account_id
     and c.id = p_call_id;

  get diagnostics v_linhas = row_count;
  return v_linhas > 0;
end;
$medir$;

comment on function public.registrar_medicao_da_avaliacao(uuid, uuid, text, jsonb) is
  'Grava em calls.evaluation.medicoes a medição de um critério sobre a transcrição (RF-422), mesclando com o que já existe: o juízo do modelo e as outras medições ficam. Devolve falso quando a chamada não é da conta. Execução só para service_role.';

revoke execute on function public.registrar_medicao_da_avaliacao(uuid, uuid, text, jsonb) from public;
grant execute on function public.registrar_medicao_da_avaliacao(uuid, uuid, text, jsonb) to service_role;
