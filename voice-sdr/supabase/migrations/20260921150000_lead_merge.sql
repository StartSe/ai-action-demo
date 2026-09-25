-- `lead_merge`: juntar dois cadastros da mesma pessoa sem perder nada.
-- Referência: docs/revisao-tecnica.md L-11, docs/PRD.md RF-114,
-- docs/PRD-implementacao.md seções 3.2 e 4.5.
--
-- A deduplicação de `registrar_lead` só alcança o que chega pelo mesmo
-- telefone. Quem cadastrou a mesma pessoa com dois números — o fixo da empresa
-- e o celular — fica com duas fichas, cada uma com metade da história. Mesclar
-- é o conserto, e ele tem que ser reversível em leitura: o lead de origem não
-- some, ele passa a apontar para quem o absorveu.
--
-- Quatro decisões o estruturam:
--
-- 1. **O que reaponta é uma lista declarada, não um `for` sobre o catálogo.**
--    L-11 nomeia seis tabelas com `lead_id`; nesta fatia só `lead_events`
--    existe. `to_regclass` devolve nulo para a que ainda não foi criada e a
--    volta a pula, então a fatia que criar `calls` acrescenta o nome à lista e
--    nada mais. Varrer o catálogo atrás de colunas `lead_id` pegaria também
--    tabela que não deve ser reapontada, e o erro seria silencioso.
-- 2. **Preencher vazio, nunca sobrescrever.** É a mesma regra de
--    `registrar_lead` com `atualizar`, e pelo mesmo motivo: o destino é o
--    cadastro que sobrevive, e o que já está escrito nele foi escrito por
--    alguém. A origem só entra onde havia buraco.
-- 3. **O bloqueio viaja.** `blocked_at` e `blocked_reason` ficam fora da lista
--    de colunas mescláveis e são tratados como par, porque a metade de um
--    quebra o `check` da tabela. E são copiados mesmo não sendo campo comum:
--    se a origem está bloqueada e o destino não, perder o bloqueio na mesclagem
--    é ligar para quem pediu para não ser chamado (RF-008).
-- 4. **A recusa é código, nunca frase.** `mesmo_lead`, `lead_inexistente`,
--    `lead_de_outra_conta`, `ja_mesclado` e `sem_permissao` sobem como
--    `message` da exceção, que é como o resto desta base as reconhece; a frase
--    é da tela.

create or replace function public.lead_merge(
  p_origem uuid,
  p_destino uuid
)
returns table (resultado text)
language plpgsql
security definer
set search_path = ''
as $merge$
declare
  -- As tabelas que L-11 manda reapontar. Só a primeira existe nesta fatia; as
  -- demais entram com a fatia que as criar, e aqui só o nome muda.
  --
  -- Quem acrescentar tabela com unique que inclua `lead_id` (o caso previsto é
  -- `campaign_targets`, com unique por campanha e lead) precisa decidir aqui o
  -- que fazer quando os dois leads estiverem na mesma campanha: reapontar cru
  -- viola o unique e derruba a mesclagem inteira.
  c_tabelas_com_lead constant text[] := array[
    'lead_events',
    'calls',
    'meetings',
    'cadence_enrollments',
    'campaign_targets',
    'consent_records'
  ];
  -- O que a origem preenche no destino quando o destino está vazio.
  -- `phone_e164` fica de fora porque é o que identifica cada um dos dois, e
  -- `stage_id` porque mover de etapa é `stage_change`, evento próprio (F4).
  -- `last_sentiment` também: ele é leitura da última ligação do lead, e a do
  -- outro lead não o descreve.
  c_mesclaveis constant text[] := array[
    'name', 'email', 'city', 'state', 'timezone',
    'company', 'source', 'source_ref', 'score', 'temperature'
  ];
  v_origem public.leads%rowtype;
  v_destino public.leads%rowtype;
  v_origem_json jsonb;
  v_destino_json jsonb;
  v_preencher jsonb := '{}'::jsonb;
  v_briefing jsonb;
  v_custom jsonb;
  v_depois public.leads%rowtype;
  v_tabela text;
  v_coluna text;
begin
  if p_origem is null or p_destino is null then
    raise exception 'lead_inexistente'
      using errcode = '23503',
            detail = 'a mesclagem precisa dos dois leads';
  end if;

  if p_origem = p_destino then
    raise exception 'mesmo_lead'
      using errcode = '22023',
            detail = 'origem e destino são o mesmo lead; não há o que juntar';
  end if;

  -- Travar as duas linhas em ordem de id, e não na ordem dos argumentos: duas
  -- mesclagens simultâneas do mesmo par em sentidos opostos travariam uma a
  -- linha da outra e as duas esperariam para sempre.
  perform 1
     from public.leads as l
    where l.id in (p_origem, p_destino)
    order by l.id
      for update;

  select * into v_origem from public.leads as l where l.id = p_origem;
  select * into v_destino from public.leads as l where l.id = p_destino;

  if v_origem.id is null or v_destino.id is null then
    raise exception 'lead_inexistente'
      using errcode = '23503',
            detail = 'um dos dois leads não existe';
  end if;

  if v_origem.account_id <> v_destino.account_id then
    raise exception 'lead_de_outra_conta'
      using errcode = '42501',
            detail = 'mesclar atravessando conta juntaria dado de dois clientes';
  end if;

  -- `security definer` desliga a RLS, então esta linha é a única barreira que
  -- resta: sem ela, o operador de qualquer conta mesclaria lead alheio.
  if not public.has_role(v_destino.account_id, 'operator') then
    raise exception 'sem_permissao'
      using errcode = '42501',
            detail = 'mesclar lead é de operator para cima, e na conta de que se participa';
  end if;

  -- Mesclar o que já foi mesclado dobraria o evento e reapontaria a linha do
  -- tempo de novo. Vale para os dois lados: absorver um cadastro para dentro de
  -- uma lápide esconderia a história em quem já não é procurado por ninguém.
  if v_origem.merged_into_id is not null or v_destino.merged_into_id is not null then
    raise exception 'ja_mesclado'
      using errcode = '23505',
            detail = 'um dos dois leads já foi mesclado em outro';
  end if;

  -- Reapontar o histórico ----------------------------------------------------
  foreach v_tabela in array c_tabelas_com_lead loop
    if to_regclass('public.' || quote_ident(v_tabela)) is not null then
      execute format(
        'update public.%I set lead_id = $1 where lead_id = $2',
        v_tabela
      ) using p_destino, p_origem;
    end if;
  end loop;

  -- Preencher o destino ------------------------------------------------------
  v_origem_json := to_jsonb(v_origem);
  v_destino_json := to_jsonb(v_destino);

  foreach v_coluna in array c_mesclaveis loop
    if (v_destino_json ->> v_coluna) is null
      and (v_origem_json ->> v_coluna) is not null
    then
      v_preencher := v_preencher || jsonb_build_object(v_coluna, v_origem_json -> v_coluna);
    end if;
  end loop;

  if v_destino.blocked_at is null and v_origem.blocked_at is not null then
    v_preencher := v_preencher || jsonb_build_object(
      'blocked_at', v_origem_json -> 'blocked_at',
      'blocked_reason', v_origem_json -> 'blocked_reason'
    );
  end if;

  -- A chave do destino por cima da da origem, pela mesma razão de
  -- `registrar_lead`: o que a Sarah escreveu no cadastro que sobrevive vence.
  v_briefing := v_origem.briefing || v_destino.briefing;
  v_custom := v_origem.custom || v_destino.custom;

  v_depois := jsonb_populate_record(null::public.leads, v_destino_json || v_preencher);

  -- O motivo viaja para a trilha pelo gatilho que `leads` já tem, nas duas
  -- linhas alteradas. A linha explícita de `audit_log` mais abaixo é o fato — a
  -- mesclagem — e estas duas são o antes e o depois coluna a coluna.
  perform set_config('app.audit_reason', 'rpc:lead_merge', true);

  update public.leads as l
     set name = v_depois.name,
         email = v_depois.email,
         city = v_depois.city,
         state = v_depois.state,
         timezone = v_depois.timezone,
         company = v_depois.company,
         source = v_depois.source,
         source_ref = v_depois.source_ref,
         score = v_depois.score,
         temperature = v_depois.temperature,
         blocked_at = v_depois.blocked_at,
         blocked_reason = v_depois.blocked_reason,
         briefing = v_briefing,
         custom = v_custom,
         -- `greatest` descarta nulo: o lead sem atividade não apaga a data do
         -- outro.
         last_activity_at = greatest(v_destino.last_activity_at, v_origem.last_activity_at)
   where l.id = p_destino;

  -- A lápide -----------------------------------------------------------------
  -- Escrever `merged_into_id` tira a origem do índice único parcial de
  -- telefone, e é isso que devolve o número ao acervo: a partir daqui quem
  -- responde por ele é o destino.
  update public.leads as l
     set merged_into_id = p_destino
   where l.id = p_origem;

  -- Os dois eventos ----------------------------------------------------------
  -- Um em cada lead, cada um com o id do outro. Na origem ele é o que sobra
  -- depois de a linha do tempo dela ter sido reapontada; no destino, a marca de
  -- onde veio o que apareceu ali.
  perform public.registrar_evento_de_lead(
    p_origem,
    'merged',
    'user',
    null,
    null,
    jsonb_build_object('papel', 'origem', 'merged_into_id', p_destino)
  );

  perform public.registrar_evento_de_lead(
    p_destino,
    'merged',
    'user',
    null,
    null,
    jsonb_build_object('papel', 'destino', 'merged_from_id', p_origem)
  );

  insert into public.audit_log
    (account_id, actor, actor_id, source, action, target_type, target_id, reason, payload)
  values (
    v_destino.account_id,
    'user',
    (select auth.uid()),
    'rpc:lead_merge',
    'merge',
    'leads',
    p_destino,
    'mesclagem de leads duplicados',
    jsonb_build_object(
      'origem_id', p_origem,
      'destino_id', p_destino,
      'campos_preenchidos',
      to_jsonb(array(select chave from jsonb_object_keys(v_preencher) as chave order by chave))
    )
  );

  return query select 'mesclado'::text;
end;
$merge$;

comment on function public.lead_merge(uuid, uuid) is
  'Junta dois leads da mesma conta (L-11, RF-114): reaponta a linha do tempo, preenche no destino só o que estava vazio, marca merged_into_id na origem — o que devolve o telefone ao acervo — e grava evento merged nos dois mais a linha de audit_log, tudo na mesma transação. Recusa por código: mesmo_lead, lead_inexistente, lead_de_outra_conta, ja_mesclado, sem_permissao.';

-- O padrão do Postgres concede execução a `public`, que alcança qualquer papel
-- presente ou futuro. Depois do revoke, o grant nomeia quem chama: a interface
-- (`authenticated`, com o papel conferido dentro da função) e a borda
-- (`service_role`). Sem sessão, `has_role` é falso e a borda também recebe
-- `sem_permissao` — mesclar é decisão de gente, e a chave de serviço só chega
-- aqui carregando o `Authorization` de quem pediu.
revoke execute on function public.lead_merge(uuid, uuid) from public;
grant execute on function public.lead_merge(uuid, uuid)
  to authenticated, service_role;
