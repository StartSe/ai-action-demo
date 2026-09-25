-- A estimativa de custo antes de ligar (D-14 de docs/validacao-por-persona.md).
--
-- Nenhuma tela dizia quanto uma ligação custa antes de ela sair: o custo só
-- aparecia depois, na ficha e no painel. A conta pergunta "quanto dá por
-- ligação" antes de apertar o botão. Esta função responde com o que a própria
-- conta já mediu, e só com isso:
--
-- - **A amostra são as últimas ligações atendidas com preço.** Até
--   `c_amostra` chamadas de `chamadas_reais` (o ensaio fica fora, T-16), já
--   encerradas, atendidas, com `duration_sec > 0` e com pelo menos uma linha
--   em `call_costs`. Ligação sem preço ainda (a telefonia chega minutos
--   depois, T-20) fica de fora, senão puxaria a média para baixo.
-- - **Por moeda, nunca somando dólar com real.** A voz cobra em dólar e a
--   linha em real; somar as duas seria inventar câmbio, como no painel.
-- - **Duas medidas**: o custo médio por ligação (a soma da amostra sobre o
--   número de ligações, que já carrega a duração típica da conta) e o custo
--   por minuto (a soma sobre os minutos da amostra).
-- - **Sem amostra, a lista vem vazia**, e a tela diz que a estimativa aparece
--   depois da primeira ligação medida. Nenhum preço de tabela de provedor
--   entra aqui: preço de provedor muda, e número inventado é pior que
--   nenhum. É a mesma regra do roteiro de apresentação (não prometer número
--   antes das ligações reais).
--
-- Leitura de membro, como o painel: `security definer` para a soma ler
-- `call_costs` e `calls` numa passada só, com a conferência de membro na
-- frente. Quem não participa da conta recebe `sem_permissao`.

create or replace function public.estimativa_de_custo(p_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $estimativa$
declare
  -- Quantas ligações entram na média. Poucas o bastante para acompanhar uma
  -- mudança de voz ou de roteiro, muitas o bastante para uma ligação longa
  -- não decidir sozinha.
  c_amostra constant integer := 20;
  v_ligacoes integer;
  v_segundos bigint;
  v_ids uuid[];
  v_por_ligacao jsonb;
  v_por_minuto jsonb;
begin
  if not (select public.is_member(p_account_id)) then
    raise exception 'sem_permissao'
      using errcode = '42501',
            detail = 'quem chama não participa da conta cuja estimativa foi pedida';
  end if;

  -- A amostra se refaz nas duas consultas, e não numa tabela temporária:
  -- função `stable` não escreve, nem em tabela temporária.
  with amostra as (
    select c.id, c.duration_sec as duracao
      from public.chamadas_reais as c
     where c.account_id = p_account_id
       and c.status = 'ended'
       and c.answered_at is not null
       and c.duration_sec > 0
       and exists (
             select 1
               from public.call_costs as cc
              where cc.call_id = c.id
                and cc.account_id = p_account_id
           )
     order by c.started_at desc nulls last, c.id
     limit c_amostra
  )
  select count(*)::integer, coalesce(sum(a.duracao), 0)::bigint,
         array_agg(a.id)
    into v_ligacoes, v_segundos, v_ids
    from amostra as a;

  if v_ligacoes = 0 then
    return jsonb_build_object(
      'ligacoes_medidas', 0,
      'duracao_media_seg', null,
      'por_ligacao', '[]'::jsonb,
      'por_minuto', '[]'::jsonb
    );
  end if;

  with por_moeda as (
    select cc.currency, sum(cc.amount_cents)::numeric as centavos
      from public.call_costs as cc
     where cc.account_id = p_account_id
       and cc.call_id = any (v_ids)
     group by cc.currency
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'moeda', p.currency,
           'centavos', round(p.centavos / v_ligacoes)::bigint
         ) order by p.currency), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object(
           'moeda', p.currency,
           'centavos', round(p.centavos * 60 / v_segundos)::bigint
         ) order by p.currency), '[]'::jsonb)
    into v_por_ligacao, v_por_minuto
    from por_moeda as p;

  return jsonb_build_object(
    'ligacoes_medidas', v_ligacoes,
    'duracao_media_seg', round(v_segundos::numeric / v_ligacoes)::integer,
    'por_ligacao', v_por_ligacao,
    'por_minuto', v_por_minuto
  );
end;
$estimativa$;

comment on function public.estimativa_de_custo(uuid) is
  'A estimativa de custo antes de ligar (D-14): das últimas 20 ligações atendidas da conta com preço em call_costs, sem o ensaio (T-16), o custo médio por ligação e por minuto, por moeda, e a duração média. Sem amostra, listas vazias: nenhum preço de tabela de provedor entra. Recusa sem_permissao a quem não é membro.';

revoke execute on function public.estimativa_de_custo(uuid)
  from public, anon, service_role;
grant execute on function public.estimativa_de_custo(uuid)
  to authenticated;
