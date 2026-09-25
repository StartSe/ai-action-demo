-- O painel conta as reuniões (D-01 de docs/validacao-por-persona.md).
--
-- `dashboard_summary` nasceu na F4 devolvendo `indisponivel_nesta_fase` em
-- todo campo de reunião, porque `meetings` ainda não tinha quem a enchesse.
-- Hoje a assistente marca (`agendar_reuniao`), a equipe marca o desfecho à mão
-- (`marcar_desfecho_da_reuniao`) e a reunião aparece em Reuniões; o painel
-- dizendo "ainda não apurável" era mentira no sentido contrário. Esta migração
-- redefine a função com `create or replace` (mesma assinatura, mesmo `jsonb`
-- de saída) e liga o que o dado sustenta, e só isso:
--
-- - **marcadas**: reuniões criadas no período (`created_at`), sem as que
--   nasceram de remarcação (`rescheduled_from_id`), para a remarcação não
--   contar a mesma reunião duas vezes.
-- - **confirmadas**: reuniões com `confirmed_at` no período.
-- - **realizadas** e **faltas**: reuniões com início no período e desfecho
--   apurado (`attestation_status = 'attested'`) como `attended` ou `no_show`.
--   Nunca há desfecho inferido (RF-516): reunião cujo horário passou sem
--   ninguém marcar o desfecho não é falta nem realizada, é `sem_apuracao`, e
--   o painel diz isso com todas as letras.
-- - **taxa_de_comparecimento**: realizadas sobre realizadas mais faltas, só da
--   amostra apurada; nula sem amostra.
-- - **sem_apuracao** (campo novo): reuniões com início no período, horário já
--   passado, ainda marcadas ou confirmadas e sem desfecho.
-- - **próximas reuniões**: quantas reuniões ativas (marcadas ou confirmadas)
--   começam daqui em diante. Não depende do período: "próxima" é a partir de
--   agora.
-- - **custo por reunião realizada** (T-20): para cada reunião realizada no
--   período, a soma de `call_costs` das chamadas reais do lead que começaram
--   antes do início da reunião, mais a ligação de confirmação quando houve.
--   A soma de todas as realizadas, por moeda, dividida pelo número delas.
--   Por moeda, como o custo do período: somar dólar com real seria inventar
--   câmbio. Sem realizada, nulo. `calls` não tem `meeting_id`; quando as
--   ligações de lembrete e resgate ganharem o vínculo, elas entram aqui.
-- - **taxa de apuração**: das reuniões com início no período cujo horário já
--   passou e que não foram canceladas, quantas têm desfecho. Nula sem base.
-- - **degradação da métrica norte** (RF-518): verdadeiro quando a taxa de
--   apuração fica abaixo de 70% (o padrão do PRD; a conta ainda não tem
--   coluna própria para o limiar), falso acima, nulo sem base.
--
-- O resto do corpo (ligações, funil, avaliação, sentimento, custo, últimas
-- ligações) é o mesmo da migração 20260930200000, copiado sem mudança.
-- Reunião de ensaio fica fora por `reunioes_reais`, e lead sintético por
-- `not is_synthetic`, como toda métrica daqui.

create or replace function public.dashboard_summary(
  p_account_id uuid,
  p_de timestamptz,
  p_ate timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $resumo$
declare
  v_piso numeric;
  v_ligacoes jsonb;
  v_funil jsonb;
  v_avaliacao jsonb;
  v_sentimento jsonb;
  v_custo jsonb;
  v_ultimas jsonb;
  v_reunioes jsonb;
  v_custo_por_realizada jsonb;
  v_proximas bigint;
  v_realizadas bigint;
  v_faltas bigint;
  v_passadas bigint;
  v_apuradas bigint;
  v_taxa_de_apuracao numeric;
begin
  if not (select public.is_member(p_account_id)) then
    raise exception 'sem_permissao'
      using errcode = '42501',
            detail = 'quem chama não participa da conta cujo painel foi pedido';
  end if;

  if p_de is null or p_ate is null or p_de >= p_ate then
    raise exception 'periodo_invalido'
      using errcode = '22023',
            detail = 'o período é [de, ate), com de anterior a ate';
  end if;

  -- Ligações (RF-903) ------------------------------------------------------------
  select jsonb_build_object(
           'total', count(*),
           'atendidas', count(*) filter (where c.answered_at is not null),
           'taxa_de_atendimento',
             case when count(*) = 0 then null
                  else round((count(*) filter (where c.answered_at is not null))::numeric / count(*), 4)
             end,
           'duracao_media_seg',
             round(avg(c.duration_sec) filter (where c.answered_at is not null), 1)
         )
    into v_ligacoes
    from public.chamadas_reais as c
   where c.account_id = p_account_id
     and c.started_at >= p_de and c.started_at < p_ate;

  -- Funil do período (RF-902), sempre por key -----------------------------------
  with etapas as (
    select s.key, s.label, s.position, s.is_lost
      from public.pipeline_stages as s
      join public.pipelines as p on p.id = s.pipeline_id
     where p.account_id = p_account_id and p.is_default
  ),
  chegadas as (
    select e.payload -> 'para' ->> 'key' as key, e.lead_id
      from public.lead_events as e
      join public.leads as l on l.id = e.lead_id
     where e.account_id = p_account_id
       and e.kind = 'stage_change'
       and e.occurred_at >= p_de and e.occurred_at < p_ate
       and not l.is_synthetic
    union
    select 'new', l.id
      from public.leads as l
     where l.account_id = p_account_id
       and not l.is_synthetic
       and l.created_at >= p_de and l.created_at < p_ate
  ),
  contagem as (
    select t.key, t.label, t.position, t.is_lost,
           (select count(distinct ch.lead_id) from chegadas as ch where ch.key = t.key) as entraram
      from etapas as t
  ),
  cadeia as (
    select k.*,
           case when k.is_lost then null
                else lag(k.entraram) over (partition by k.is_lost order by k.position)
           end as anterior
      from contagem as k
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'key', z.key,
             'label', z.label,
             'posicao', z.position,
             'entraram', z.entraram,
             'taxa_de_passagem',
               case when z.anterior is null or z.anterior = 0 then null
                    else round(z.entraram::numeric / z.anterior, 4)
               end
           ) order by z.position), '[]'::jsonb)
    into v_funil
    from cadeia as z;

  -- Avaliação e sentimento (RF-905) ---------------------------------------------
  select s.sentiment_floor into v_piso
    from public.account_settings as s where s.account_id = p_account_id;
  v_piso := coalesce(v_piso, -0.5);

  select jsonb_build_object(
           'nota_media', round(avg(c.evaluation_score), 2),
           'avaliadas', count(c.evaluation_score)
         ),
         jsonb_build_object(
           'positivo', count(*) filter (where c.sentiment >= -v_piso),
           'neutro', count(*) filter (where c.sentiment > v_piso and c.sentiment < -v_piso),
           'negativo', count(*) filter (where c.sentiment <= v_piso),
           'sem_sentimento', count(*) filter (where c.sentiment is null),
           'piso', v_piso
         )
    into v_avaliacao, v_sentimento
    from public.chamadas_reais as c
   where c.account_id = p_account_id
     and c.started_at >= p_de and c.started_at < p_ate;

  -- Custo do período (RNF-11, T-20) ---------------------------------------------
  with parcelas as (
    select cc.component, cc.currency, sum(cc.amount_cents)::bigint as centavos
      from public.call_costs as cc
      join public.chamadas_reais as c on c.id = cc.call_id
     where cc.account_id = p_account_id
       and c.account_id = p_account_id
       and c.started_at >= p_de and c.started_at < p_ate
     group by cc.component, cc.currency
  )
  select jsonb_build_object(
           'por_componente', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'componente', x.component, 'moeda', x.currency, 'centavos', x.centavos
                    ) order by x.currency, x.component)
               from parcelas as x), '[]'::jsonb),
           'total', coalesce((
             select jsonb_agg(jsonb_build_object('moeda', y.currency, 'centavos', y.centavos)
                    order by y.currency)
               from (select currency, sum(centavos)::bigint as centavos
                       from parcelas group by currency) as y), '[]'::jsonb)
         )
    into v_custo;

  -- Últimas ligações (RF-907, parte) --------------------------------------------
  select coalesce(jsonb_agg(u.linha order by u.started_at desc, u.id), '[]'::jsonb)
    into v_ultimas
    from (
      select c.id, c.started_at,
             jsonb_build_object(
               'id', c.id,
               'lead_id', c.lead_id,
               'lead_nome', l.name,
               'proposito', c.purpose,
               'status', c.status,
               'iniciada_em', c.started_at,
               'duracao_seg', c.duration_sec,
               'nota', c.evaluation_score,
               'sentimento', c.sentiment,
               'motivo_do_fim', c.end_reason
             ) as linha
        from public.chamadas_reais as c
        left join public.leads as l on l.id = c.lead_id
       where c.account_id = p_account_id
         and c.started_at >= p_de and c.started_at < p_ate
       order by c.started_at desc, c.id
       limit 10
    ) as u;


  -- Reuniões (RF-901, RF-904, RF-907, RF-518) -----------------------------------
  with reunioes as (
    select m.*
      from public.reunioes_reais as m
      join public.leads as l on l.id = m.lead_id
     where m.account_id = p_account_id
       and l.account_id = p_account_id
       and not l.is_synthetic
  )
  select
    count(*) filter (where r.status = 'attended' and r.attestation_status = 'attested'
                       and r.starts_at >= p_de and r.starts_at < p_ate),
    count(*) filter (where r.status = 'no_show' and r.attestation_status = 'attested'
                       and r.starts_at >= p_de and r.starts_at < p_ate),
    count(*) filter (where r.starts_at >= p_de and r.starts_at < p_ate
                       and r.ends_at <= now() and r.status <> 'canceled'
                       and r.status <> 'rescheduled'),
    count(*) filter (where r.starts_at >= p_de and r.starts_at < p_ate
                       and r.ends_at <= now() and r.status <> 'canceled'
                       and r.status <> 'rescheduled'
                       and r.attestation_status = 'attested'),
    count(*) filter (where r.status in ('scheduled', 'confirmed') and r.starts_at >= now()),
    jsonb_build_object(
      'marcadas', count(*) filter (where r.created_at >= p_de and r.created_at < p_ate
                                     and r.rescheduled_from_id is null),
      'confirmadas', count(*) filter (where r.confirmed_at >= p_de and r.confirmed_at < p_ate),
      'sem_apuracao', count(*) filter (where r.starts_at >= p_de and r.starts_at < p_ate
                                         and r.ends_at <= now()
                                         and r.status in ('scheduled', 'confirmed')
                                         and r.attestation_status <> 'attested')
    )
    into v_realizadas, v_faltas, v_passadas, v_apuradas, v_proximas, v_reunioes
    from reunioes as r;

  v_reunioes := v_reunioes || jsonb_build_object(
    'realizadas', v_realizadas,
    'faltas', v_faltas,
    'taxa_de_comparecimento',
      case when v_realizadas + v_faltas = 0 then null
           else round(v_realizadas::numeric / (v_realizadas + v_faltas), 4)
      end
  );

  v_taxa_de_apuracao := case when v_passadas = 0 then null
                             else round(v_apuradas::numeric / v_passadas, 4) end;

  -- Custo por reunião realizada (T-20), por moeda --------------------------------
  if v_realizadas > 0 then
    with realizadas as (
      select m.id, m.lead_id, m.starts_at, m.confirmed_call_id
        from public.reunioes_reais as m
        join public.leads as l on l.id = m.lead_id
       where m.account_id = p_account_id
         and l.account_id = p_account_id
         and not l.is_synthetic
         and m.status = 'attended' and m.attestation_status = 'attested'
         and m.starts_at >= p_de and m.starts_at < p_ate
    ),
    chamadas_da_reuniao as (
      select distinct r.id as reuniao_id, c.id as chamada_id
        from realizadas as r
        join public.chamadas_reais as c
          on c.account_id = p_account_id
         and c.lead_id = r.lead_id
         and (c.started_at < r.starts_at or c.id = r.confirmed_call_id)
    ),
    por_moeda as (
      select cc.currency, sum(cc.amount_cents)::numeric as centavos
        from chamadas_da_reuniao as x
        join public.call_costs as cc on cc.call_id = x.chamada_id
       where cc.account_id = p_account_id
       group by cc.currency
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'moeda', p.currency,
             'centavos', round(p.centavos / v_realizadas)::bigint
           ) order by p.currency), '[]'::jsonb)
      into v_custo_por_realizada
      from por_moeda as p;
  end if;

  return jsonb_build_object(
    'periodo', jsonb_build_object('de', p_de, 'ate', p_ate),
    'ligacoes', v_ligacoes,
    'funil', v_funil,
    'avaliacao', v_avaliacao,
    'sentimento', v_sentimento,
    'custo', v_custo,
    'ultimas_ligacoes', v_ultimas,
    'reunioes', v_reunioes,
    'custo_por_reuniao_realizada', v_custo_por_realizada,
    'proximas_reunioes', v_proximas,
    'apuracao', jsonb_build_object(
      'taxa_de_apuracao', v_taxa_de_apuracao,
      'degradacao_da_metrica_norte',
        case when v_taxa_de_apuracao is null then null
             else v_taxa_de_apuracao < 0.7 end
    )
  );
end;
$resumo$;

comment on function public.dashboard_summary(uuid, timestamptz, timestamptz) is
  'O painel do período [de, ate) numa consulta: ligações, funil por key com taxa de passagem, avaliação, sentimento pela régua da fila, custo por componente e moeda, últimas ligações e reuniões (marcadas, confirmadas, realizadas e faltas apuradas, sem apuração, comparecimento da amostra apurada, próximas, custo por reunião realizada por moeda, taxa de apuração e degradação abaixo de 70%), sem o ensaio (T-16) e sem desfecho inferido (RF-516). Recusa sem_permissao a quem não é membro.';

revoke execute on function public.dashboard_summary(uuid, timestamptz, timestamptz)
  from public, anon, service_role;
grant execute on function public.dashboard_summary(uuid, timestamptz, timestamptz)
  to authenticated;
