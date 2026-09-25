-- A redação de `integration_events` passa a cobrir a chave `prompt`.
-- Referência: docs/PRD-implementacao.md seção 3.8, US-063 (`playbook-draft`).
--
-- `playbook-draft` manda ao modelo a descrição do negócio que a conta escreveu,
-- e o registro da chamada ao modelo carrega o pedido. Descrição de negócio é
-- dado do cliente, e tabela de observabilidade não é lugar de guardá-lo: quem
-- depura precisa saber que o pedido saiu, com que modelo e de que tamanho, e
-- não do texto.
--
-- A regra continua sendo sobre o NOME DA CHAVE, como a de
-- `redigir_evento_externo` já era: a borda põe o texto enviado ao modelo sob
-- `prompt`, e o gatilho `before` troca o valor por `[redigido]` antes de a linha
-- existir. Função nova que falar com modelo nasce coberta pelo mesmo nome, sem
-- ninguém lembrar de acrescentar campo a lista.
--
-- A troca é `create or replace` da função do gatilho de redação: o gatilho
-- `integration_events_redacao` continua o mesmo e passa a chamar a versão nova.

create or replace function public.redigir_evento_externo(dado jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $redacao$
declare
  v_chave text;
  v_saida jsonb;
begin
  if dado is null then
    return null;
  end if;

  if jsonb_typeof(dado) = 'object' then
    v_saida := '{}'::jsonb;
    for v_chave in select chave from jsonb_object_keys(dado) as chave loop
      v_saida := v_saida || jsonb_build_object(
        v_chave,
        case
          when v_chave ~* '(token|secret|senha|password|authorization|api[_-]?key|sid|prompt)'
            then to_jsonb('[redigido]'::text)
          else public.redigir_evento_externo(dado -> v_chave)
        end
      );
    end loop;
    return v_saida;
  end if;

  if jsonb_typeof(dado) = 'array' then
    return coalesce(
      (
        select jsonb_agg(public.redigir_evento_externo(item) order by ordem)
          from jsonb_array_elements(dado) with ordinality as lista(item, ordem)
      ),
      '[]'::jsonb
    );
  end if;

  return dado;
end;
$redacao$;

comment on function public.redigir_evento_externo(jsonb) is
  'Troca por [redigido] o valor de toda chave cujo nome indique segredo ou texto mandado a modelo (prompt), em qualquer profundidade do objeto. A regra é sobre o nome da chave para que provedor novo nasça coberto.';
