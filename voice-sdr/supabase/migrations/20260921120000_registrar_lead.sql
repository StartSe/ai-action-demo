-- `registrar_lead`: o caminho único de gravação de lead.
-- Referência: docs/PRD.md RF-101 a RF-109, docs/PRD-implementacao.md seções 3.2,
-- 4.4 e 4.5, docs/revisao-tecnica.md T-19.
--
-- Três caminhos escrevem lead: a importação de planilha (US-026 e US-027), o
-- endereço público de entrada (US-029) e o cadastro manual (US-034). Se cada um
-- decidisse sozinho o que é duplicata, o que é telefone válido e o que vira
-- evento, a regra existiria em três versões e as três se desencontrariam no
-- primeiro ajuste. Este RPC é o caminho, e os três o chamam.
--
-- Quatro decisões o estruturam:
--
-- 1. **A duplicata é do índice, não de uma consulta.** O `on conflict` aponta
--    para `leads_telefone_unico_por_conta`, o único parcial em
--    (`account_id`, `phone_e164`) onde `merged_into_id is null`. Ler antes de
--    escrever deixaria uma janela entre a leitura e o insert, e duas linhas da
--    mesma planilha chegando juntas passariam pela janela. Por isso `criar` é
--    recusada com `duplicado_por_telefone` em vez de tentar: o índice a impede
--    de qualquer forma, e a recusa nomeada é o que a tela de importação exibe.
-- 2. **O banco confere o telefone, não o normaliza.** `phone_e164` fora de
--    E.164 é `telefone_invalido`. Normalizar é de `_shared/telefone.ts`
--    (US-023), e é de propósito que o banco não adivinhe: duas normalizações
--    diferentes em dois caminhos são duplicata gravada, e o único jeito de
--    garantir uma só é ela acontecer antes de chegar aqui.
-- 3. **`atualizar` preenche vazio e nunca apaga.** O que já está gravado vence
--    o que chegou, coluna por coluna, e `briefing` e `custom` se fundem com as
--    chaves existentes por cima. Quando não há nada a preencher, o resultado é
--    `ignorado` e nenhum evento é escrito: reimportar a mesma planilha não pode
--    virar mil linhas de `lead_updated` que não narram mudança nenhuma.
-- 4. **Gravação e evento na mesma transação.** O evento sai por
--    `registrar_evento_de_lead`, que continua sendo o único caminho de escrita
--    em `lead_events` — e é ele que decide o autor: com sessão, `auth.uid()`;
--    sem sessão, o que o parâmetro disser, que é a borda com a chave de
--    serviço.
--
-- O resultado é código, nunca frase: `criado`, `ignorado` ou `atualizado`. A
-- frase é da borda e da tela, como em todo RPC desta base.

create or replace function public.registrar_lead(
  p_account_id uuid,
  p_lead jsonb,
  p_ao_duplicar text default 'ignorar'
)
returns table (lead_id uuid, resultado text)
language plpgsql
security definer
set search_path = ''
as $registrar$
declare
  -- As colunas que `atualizar` preenche. `stage_id` fica de fora porque mover
  -- de etapa é `stage_change`, evento próprio, da F4; `phone_e164` também,
  -- porque é ele que identificou o lead.
  v_mesclaveis constant text[] := array[
    'name', 'email', 'city', 'state', 'timezone',
    'company', 'source', 'source_ref', 'score', 'temperature'
  ];
  v_chamador uuid := auth.uid();
  v_entrada public.leads%rowtype;
  v_antes public.leads%rowtype;
  v_telefone text := nullif(btrim(coalesce(p_lead ->> 'phone_e164', '')), '');
  v_actor text := coalesce(nullif(btrim(coalesce(p_lead ->> 'actor', '')), ''), 'system');
  v_actor_id uuid := nullif(p_lead ->> 'actor_id', '')::uuid;
  v_etapa uuid := nullif(p_lead ->> 'stage_id', '')::uuid;
  v_coluna text;
  v_preencher jsonb := '{}'::jsonb;
  v_briefing jsonb;
  v_custom jsonb;
  v_mesclado jsonb;
  v_depois public.leads%rowtype;
  v_id uuid;
  v_texto text;
begin
  if jsonb_typeof(coalesce(p_lead, 'null'::jsonb)) <> 'object' then
    raise exception 'lead_invalido'
      using errcode = '22023',
            detail = 'p_lead precisa ser um objeto com as colunas do lead';
  end if;

  if p_ao_duplicar is null or p_ao_duplicar not in ('ignorar', 'atualizar', 'criar') then
    raise exception 'opcao_invalida'
      using errcode = '22023',
            detail = 'p_ao_duplicar é ignorar, atualizar ou criar (RF-103)';
  end if;

  -- Quem pode gravar ---------------------------------------------------------
  -- Sem sessão só chega quem tem a chave de serviço, que é a borda pública de
  -- entrada: o formulário do cliente não tem usuário para conferir papel, e é
  -- a chave do endereço que faz as vezes da credencial (US-028, US-029). Com
  -- sessão, gravar lead é trabalho de quem opera — o viewer acompanha.
  if v_chamador is not null and not public.has_role(p_account_id, 'operator') then
    raise exception 'sem_permissao'
      using errcode = '42501',
            detail = 'gravar lead é de operator para cima, e na conta de que se participa';
  end if;

  if v_telefone is null or v_telefone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'telefone_invalido'
      using errcode = '22023',
            detail = 'phone_e164 chega normalizado por _shared/telefone.ts; o banco confere, não adivinha';
  end if;

  -- Etapa vinda de fora só vale se for da conta. Sem esta conferência, o
  -- cadastro manual gravaria lead apontando para a etapa de outra conta: a
  -- linha continuaria invisível para a vizinha, mas o funil da conta passaria a
  -- ter lead em etapa que não é dele.
  if v_etapa is not null and not exists (
    select 1
      from public.pipeline_stages as s
     where s.id = v_etapa
       and s.account_id = p_account_id
  ) then
    raise exception 'etapa_invalida'
      using errcode = '23503',
            detail = 'a etapa informada não é do funil desta conta';
  end if;

  v_entrada := jsonb_populate_record(null::public.leads, p_lead);

  -- Criar --------------------------------------------------------------------
  -- `do nothing` em vez de erro: o conflito é resposta esperada aqui, e é ele
  -- que decide o que fazer em seguida. A inferência nomeia as colunas e o
  -- `where` do índice parcial, então só a duplicata de telefone entre leads
  -- vivos cai aqui; qualquer outra violação continua subindo crua.
  insert into public.leads (
    account_id, name, phone_e164, email, city, state, timezone,
    company, source, source_ref, stage_id, score, temperature, briefing, custom
  )
  values (
    p_account_id,
    v_entrada.name,
    v_telefone,
    v_entrada.email,
    v_entrada.city,
    v_entrada.state,
    v_entrada.timezone,
    v_entrada.company,
    v_entrada.source,
    v_entrada.source_ref,
    v_etapa,
    v_entrada.score,
    v_entrada.temperature,
    coalesce(v_entrada.briefing, '{}'::jsonb),
    coalesce(v_entrada.custom, '{}'::jsonb)
  )
  on conflict (account_id, phone_e164) where merged_into_id is null do nothing
  returning id into v_id;

  if v_id is not null then
    perform public.registrar_evento_de_lead(
      v_id,
      'lead_created',
      v_actor,
      v_actor_id,
      null,
      jsonb_strip_nulls(jsonb_build_object(
        'source', v_entrada.source,
        'source_ref', v_entrada.source_ref
      ))
    );

    return query select v_id, 'criado'::text;
    return;
  end if;

  -- Duplicata ----------------------------------------------------------------
  select *
    into v_antes
    from public.leads as l
   where l.account_id = p_account_id
     and l.phone_e164 = v_telefone
     and l.merged_into_id is null
   for update;

  if p_ao_duplicar = 'criar' then
    raise exception 'duplicado_por_telefone'
      using errcode = '23505',
            detail = 'já existe lead vivo com este telefone nesta conta; escolha ignorar ou atualizar';
  end if;

  if p_ao_duplicar = 'ignorar' then
    return query select v_antes.id, 'ignorado'::text;
    return;
  end if;

  -- Atualizar: só o que está vazio ------------------------------------------
  v_mesclado := to_jsonb(v_antes);

  foreach v_coluna in array v_mesclaveis loop
    if (v_mesclado ->> v_coluna) is null
      and nullif(btrim(coalesce(p_lead ->> v_coluna, '')), '') is not null
    then
      v_preencher := v_preencher || jsonb_build_object(v_coluna, p_lead -> v_coluna);
    end if;
  end loop;

  -- A chave já gravada por cima da que chegou: fundir na outra ordem apagaria
  -- o que a Sarah escreveu no briefing depois da ligação.
  v_briefing := coalesce(v_entrada.briefing, '{}'::jsonb) || v_antes.briefing;
  v_custom := coalesce(v_entrada.custom, '{}'::jsonb) || v_antes.custom;

  if v_preencher = '{}'::jsonb
    and v_briefing = v_antes.briefing
    and v_custom = v_antes.custom
  then
    return query select v_antes.id, 'ignorado'::text;
    return;
  end if;

  v_depois := jsonb_populate_record(
    null::public.leads,
    v_mesclado || v_preencher
      || jsonb_build_object('briefing', v_briefing, 'custom', v_custom)
  );

  perform set_config('app.audit_reason', 'rpc:registrar_lead', true);

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
         briefing = v_depois.briefing,
         custom = v_depois.custom
   where l.id = v_antes.id;

  perform public.registrar_evento_de_lead(
    v_antes.id,
    'lead_updated',
    v_actor,
    v_actor_id,
    null,
    jsonb_strip_nulls(jsonb_build_object(
      'source', v_entrada.source,
      'source_ref', v_entrada.source_ref
    )) || jsonb_build_object(
      'campos_preenchidos',
      to_jsonb(array(select chave from jsonb_object_keys(v_preencher) as chave order by chave))
    )
  );

  return query select v_antes.id, 'atualizado'::text;
end;
$registrar$;

comment on function public.registrar_lead(uuid, jsonb, text) is
  'Caminho único de gravação de lead: confere papel e telefone, resolve duplicata pelo índice parcial de telefone e escreve lead_events na mesma transação. Devolve criado, ignorado ou atualizado — código, nunca frase.';

-- O padrão do Postgres concede execução a `public`, que alcança qualquer papel
-- presente ou futuro. Depois do revoke, o grant nomeia quem chama: a interface
-- (`authenticated`, com papel conferido dentro da função) e a borda
-- (`service_role`, que chega sem sessão pelo endereço público de entrada).
-- `anon` fica de fora: quem chega pelo formulário do cliente não fala com o
-- banco, fala com a função de servidor, que tem a chave.
revoke execute on function public.registrar_lead(uuid, jsonb, text) from public;
grant execute on function public.registrar_lead(uuid, jsonb, text)
  to authenticated, service_role;
