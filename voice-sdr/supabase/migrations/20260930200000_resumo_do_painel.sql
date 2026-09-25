-- O resumo do painel numa consulta só (US-143, L-21, RF-901 a RF-907, RF-518).
--
-- `dashboard_summary(conta, de, ate)` devolve em `jsonb` tudo o que o painel
-- desenha sobre o período `[de, ate)`. O painel não agrega no cliente: somar
-- `calls` com a RLS no navegador fica lento com volume (L-21) e, pior, cada
-- tela somaria de um jeito.
--
-- 1. **Quem pede.** `security definer`, porque a leitura atravessa `calls`,
--    `call_costs`, `lead_events`, `leads` e `pipeline_stages` numa passada; por
--    isso toda consulta aqui filtra `account_id = p_account_id` à mão, e a
--    porta é `(select public.is_member(p_account_id))` logo na entrada. Quem
--    não é membro recebe `sem_permissao` (42501), e conta inexistente cai no
--    mesmo código: dizer "essa conta não existe" a um estranho já é dizer algo.
-- 2. **O ensaio fica fora de toda métrica (T-16).** Chamada vem de
--    `chamadas_reais`, que é o filtro num lugar só; lead vem com
--    `not is_synthetic`. A fatura do ensaio continua em `call_costs` e aparece
--    na ficha da chamada dele, mas não entra no custo do período, que é custo
--    de operação.
-- 3. **O funil é por key.** A etapa se identifica pela chave; o rótulo é o
--    atual, só para desenhar. `entraram` é quantos leads distintos chegaram à
--    etapa no período, pelo evento `stage_change` (`payload.para.key`), e na
--    etapa `new` também os leads que nasceram no período, porque o lead nasce
--    nela sem evento de mudança. `taxa_de_passagem` é `entraram` da etapa
--    sobre `entraram` da anterior, na ordem de `position`, com a etapa de perda
--    fora da cadeia: perda é desfecho, não passo. Renomear "Qualificado" para
--    "Tem fit" não muda número nenhum, porque o evento guarda a chave.
-- 4. **Sentimento em três faixas com a régua da conta.** Negativo é o que a
--    fila já chama de negativo, `sentiment <= account_settings.sentiment_floor`;
--    positivo é o espelho, `sentiment >= -sentiment_floor`; o meio é neutro.
--    Uma segunda régua só para o painel faria o painel dizer "neutro" da
--    chamada que a fila levantou como negativa.
-- 5. **Custo por componente e por moeda.** `call_costs` guarda a moeda de cada
--    parcela, e o provedor de voz cobra em dólar: somar centavos de moedas
--    diferentes num número só seria inventar câmbio. O período do custo é o da
--    chamada (`started_at`), o mesmo das ligações, para as duas colunas do
--    painel falarem das mesmas chamadas.
--
-- **O QUE A F4 NÃO TEM, O RPC NÃO INVENTA.** Zero se lê como "nenhuma
-- reunião", e é mentira por omissão. Cada campo abaixo devolve
-- `{"codigo": "indisponivel_nesta_fase", "fatia": ...}`:
--
-- - reuniões marcadas, confirmadas e próximas reuniões (RF-904, RF-907): F5.
--   A tabela `meetings` já chegou pela frente de dados da F5 (US-160), mas o
--   caminho que a enche (a ferramenta de agendamento publicada, a
--   sincronização de calendário) não fecha na F4. Contar a tabela agora daria
--   zero, e zero é exatamente a mentira que este campo existe para não contar.
--   Quem liga o número é a história da F5 que fechar o agendamento.
-- - reuniões realizadas, faltas e taxa de comparecimento (RF-904): F6. Só a
--   apuração em três fontes diz que a reunião aconteceu; sem ela, "realizada"
--   seria a marcação manual que o PRD trocou pela apuração.
-- - custo por reunião realizada (RF-901): F6. A regra de atribuição de T-20,
--   escrita aqui e NÃO implementada: custo da reunião = soma das chamadas do
--   lead entre a criação do lead e a reunião realizada, mais as chamadas de
--   lembrete e de resgate ligadas a ela por `meeting_id`. Sem reunião
--   realizada não há a que atribuir, e implementar por palpite é o que faz
--   "custo por reunião realizada" ter dez respostas.
-- - taxa de apuração e degradação da métrica norte (RF-518): F6. A apuração em
--   três fontes é da F6, e T-13 (o link de um clique que robô de e-mail abre)
--   é o achado que a torna confiável; taxa sobre apuração que ainda não existe
--   seria número sem lastro, que é o que RF-518 existe para impedir.
--
-- **Saúde (RF-906) não mora aqui.** Crédito, cota, números ativos e rotinas vêm
-- de `integrations-status` (que pergunta ao provedor, com credencial que o
-- banco não tem) e de `job_runs`. São retratos do agora, não do período: pôr
-- no mesmo RPC amarraria o painel ao tempo de resposta do provedor externo.
--
-- **Índices.** A consulta das chamadas usa `calls_lista_da_conta (account_id,
-- started_at desc)`, que existe desde a F2. `call_costs` se alcança pelo único
-- `(call_id, component, source)`. Falta o recorte das mudanças de etapa por
-- período, que entra aqui como índice parcial em `lead_events`. Vai por
-- `create index` comum, na mesma migração: nenhuma tabela desta instalação tem
-- volume ainda (o ambiente real é de desenvolvimento, com dado de teste), e
-- `concurrently` não roda dentro da transação em que a migração é aplicada.
-- Índice novo sobre tabela que já tenha volume vai por `create index
-- concurrently`, sozinho numa migração própria (seção 10).

create index if not exists lead_events_mudancas_de_etapa_idx
  on public.lead_events (account_id, occurred_at)
  where kind = 'stage_change';

comment on index public.lead_events_mudancas_de_etapa_idx is
  'O funil do período em dashboard_summary: as mudanças de etapa da conta num intervalo. Parcial porque o funil só lê stage_change.';

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

  return jsonb_build_object(
    'periodo', jsonb_build_object('de', p_de, 'ate', p_ate),
    'ligacoes', v_ligacoes,
    'funil', v_funil,
    'avaliacao', v_avaliacao,
    'sentimento', v_sentimento,
    'custo', v_custo,
    'ultimas_ligacoes', v_ultimas,
    'reunioes', jsonb_build_object(
      'marcadas', jsonb_build_object('codigo', 'indisponivel_nesta_fase', 'fatia', 'F5'),
      'confirmadas', jsonb_build_object('codigo', 'indisponivel_nesta_fase', 'fatia', 'F5'),
      'realizadas', jsonb_build_object('codigo', 'indisponivel_nesta_fase', 'fatia', 'F6'),
      'faltas', jsonb_build_object('codigo', 'indisponivel_nesta_fase', 'fatia', 'F6'),
      'taxa_de_comparecimento', jsonb_build_object('codigo', 'indisponivel_nesta_fase', 'fatia', 'F6')
    ),
    'custo_por_reuniao_realizada', jsonb_build_object('codigo', 'indisponivel_nesta_fase', 'fatia', 'F6'),
    'proximas_reunioes', jsonb_build_object('codigo', 'indisponivel_nesta_fase', 'fatia', 'F5'),
    'apuracao', jsonb_build_object(
      'taxa_de_apuracao', jsonb_build_object('codigo', 'indisponivel_nesta_fase', 'fatia', 'F6'),
      'degradacao_da_metrica_norte', jsonb_build_object('codigo', 'indisponivel_nesta_fase', 'fatia', 'F6')
    )
  );
end;
$resumo$;

comment on function public.dashboard_summary(uuid, timestamptz, timestamptz) is
  'O painel do período [de, ate) numa consulta: ligações, funil por key com taxa de passagem, avaliação, sentimento pela régua da fila, custo por componente e moeda e as últimas ligações, sem o ensaio (T-16). Reuniões, custo por reunião realizada, próximas reuniões e apuração devolvem {codigo: indisponivel_nesta_fase, fatia} em vez de zero. Saúde (RF-906) vem de integrations-status e job_runs. Recusa sem_permissao a quem não é membro.';

revoke execute on function public.dashboard_summary(uuid, timestamptz, timestamptz)
  from public, anon, service_role;
grant execute on function public.dashboard_summary(uuid, timestamptz, timestamptz)
  to authenticated;
