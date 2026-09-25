-- Etapas configuráveis, com a chave ainda imutável (US-127, RF-207, F4).
--
-- O administrador cria, renomeia, reordena e colore etapas. Nada disso alcança
-- `key`, que é o que a automação cita: o gatilho `pipeline_stages_chave_imutavel`
-- da F1 continua de pé, e `testes/banco/funil.test.ts` reprova se ele sair.
--
-- 1. **A chave deixa de ser a lista fechada das seis.** Aceita as seis canônicas
--    mais chave própria da conta no formato slug. DEPENDE DA PERGUNTA 1 EM
--    ABERTO (seção 13 de docs/PRD.md): quais etapas existem além das seis, e o
--    rótulo de cada uma, saem da definição de lead qualificado. Esta migração
--    entrega o mecanismo e as seis canônicas; o conjunto concreto é
--    configuração da conta.
-- 2. **Desfecho continua sendo da etapa canônica.** Os checks da F1
--    `is_won = (key = 'won')` e `is_lost = (key = 'lost')` ficam: são eles que
--    impedem a marca de sair de won e lost e impedem etapa própria de se
--    declarar desfecho. O índice único parcial por funil entra por cima, como
--    rede explícita de "no máximo uma is_won e uma is_lost".
-- 3. **As seis canônicas não se apagam**, e etapa própria só se apaga vazia.
--    Os dois casos são gatilho `before delete`, que pula quando a conta ou o
--    funil já não existem: apagar a conta cascateia para as etapas, e a trava
--    derrubaria a exclusão inteira.
-- 4. **Reordenar é a lista inteira numa transação**, pelo RPC
--    `configurar_etapas`: ele confere que as posições finais não colidem antes
--    de escrever e regrava em duas passagens, porque `unique (pipeline_id,
--    position)` é conferido linha a linha e trocar duas posições de uma vez
--    colidiria no meio.

alter table public.pipeline_stages
  drop constraint if exists pipeline_stages_key_check;

alter table public.pipeline_stages
  add constraint pipeline_stages_chave_valida check (
    key in ('new', 'contacted', 'qualified', 'meeting_booked', 'won', 'lost')
    or key ~ '^[a-z][a-z0-9_]{2,31}$'
  );

comment on constraint pipeline_stages_chave_valida on public.pipeline_stages is
  'As seis chaves canônicas ou chave própria da conta em slug (letra minúscula, depois letras, dígitos e sublinhado, de 3 a 32). O conjunto além das seis depende da pergunta 1 da seção 13 de docs/PRD.md e é configuração da conta.';

create unique index if not exists pipeline_stages_um_ganho_por_funil
  on public.pipeline_stages (pipeline_id) where is_won;

create unique index if not exists pipeline_stages_uma_perda_por_funil
  on public.pipeline_stages (pipeline_id) where is_lost;

-- A trava da exclusão ------------------------------------------------------------
create or replace function public.recusar_exclusao_de_etapa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $trava$
declare
  v_leads integer;
begin
  -- Cascata da conta ou do funil: a etapa sai junto, sem trava.
  if not exists (select 1 from public.accounts as a where a.id = old.account_id)
     or not exists (select 1 from public.pipelines as p where p.id = old.pipeline_id) then
    return old;
  end if;

  if old.key in ('new', 'contacted', 'qualified', 'meeting_booked', 'won', 'lost') then
    raise exception 'etapa_canonica'
      using errcode = '42501',
            detail = 'As seis etapas canônicas não se apagam: a automação as cita pela chave. Renomeie o rótulo.';
  end if;

  select count(*)::integer into v_leads
    from public.leads as l
   where l.stage_id = old.id;

  if v_leads > 0 then
    raise exception 'etapa_com_leads'
      using errcode = '23503',
            detail = format('A etapa tem %s lead(s). Mova-os antes de apagá-la.', v_leads),
            hint = v_leads::text;
  end if;

  return old;
end;
$trava$;

comment on function public.recusar_exclusao_de_etapa() is
  'Recusa apagar etapa canônica (etapa_canonica) e etapa própria com lead (etapa_com_leads, com a contagem no detail e no hint). Pula na cascata da conta ou do funil, senão a exclusão da conta falharia.';

drop trigger if exists pipeline_stages_trava_de_exclusao on public.pipeline_stages;
create trigger pipeline_stages_trava_de_exclusao
  before delete on public.pipeline_stages
  for each row execute function public.recusar_exclusao_de_etapa();

-- O RPC da configuração ---------------------------------------------------------
create or replace function public.configurar_etapas(
  p_pipeline_id uuid,
  p_etapas jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $configurar$
declare
  v_conta uuid;
  v_item jsonb;
  v_id uuid;
  v_chave text;
  v_rotulo text;
  v_existente record;
begin
  select p.account_id into v_conta from public.pipelines as p where p.id = p_pipeline_id;
  if v_conta is null then
    return 'etapa_de_outra_conta';
  end if;

  if not (select public.has_role(v_conta, 'admin')) then
    return 'sem_permissao';
  end if;

  if p_etapas is null or jsonb_typeof(p_etapas) <> 'array' then
    return 'chave_invalida';
  end if;

  -- Conferência inteira antes de qualquer escrita.
  for v_item in select * from jsonb_array_elements(p_etapas) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'position') <> 'number'
       or (v_item ->> 'position')::numeric < 0
       or (v_item ->> 'position')::numeric <> trunc((v_item ->> 'position')::numeric)
       or length(btrim(coalesce(v_item ->> 'label', ''))) = 0 then
      return 'chave_invalida';
    end if;

    if v_item ? 'id' then
      v_id := (v_item ->> 'id')::uuid;
      select s.account_id, s.pipeline_id, s.key into v_existente
        from public.pipeline_stages as s where s.id = v_id;
      if not found or v_existente.pipeline_id <> p_pipeline_id then
        return 'etapa_de_outra_conta';
      end if;
      if v_item ? 'key' and v_item ->> 'key' <> v_existente.key then
        return 'chave_invalida';
      end if;
    else
      v_chave := v_item ->> 'key';
      if v_chave is null or not (v_chave ~ '^[a-z][a-z0-9_]{2,31}$') then
        return 'chave_invalida';
      end if;
      if exists (
        select 1 from public.pipeline_stages as s
         where s.pipeline_id = p_pipeline_id and s.key = v_chave
      ) then
        if v_chave in ('new', 'contacted', 'qualified', 'meeting_booked', 'won', 'lost') then
          return 'etapa_canonica';
        end if;
        return 'chave_invalida';
      end if;
    end if;
  end loop;

  -- Posições finais: as da lista, e as atuais para quem ficou de fora.
  if exists (
    with finais as (
      select (e ->> 'position')::integer as posicao
        from jsonb_array_elements(p_etapas) as e
      union all
      select s.position::integer
        from public.pipeline_stages as s
       where s.pipeline_id = p_pipeline_id
         and s.id not in (
           select (e ->> 'id')::uuid from jsonb_array_elements(p_etapas) as e where e ? 'id'
         )
    )
    select 1 from finais group by posicao having count(*) > 1
  ) then
    return 'posicao_duplicada';
  end if;

  -- Primeira passagem: tira as etapas listadas do caminho.
  update public.pipeline_stages as s
     set position = s.position + 10000
   where s.pipeline_id = p_pipeline_id
     and s.id in (
       select (e ->> 'id')::uuid from jsonb_array_elements(p_etapas) as e where e ? 'id'
     );

  -- Segunda passagem: grava rótulo, cor e posição final; cria as novas.
  for v_item in select * from jsonb_array_elements(p_etapas) loop
    v_rotulo := btrim(v_item ->> 'label');
    if v_item ? 'id' then
      update public.pipeline_stages as s
         set label = v_rotulo,
             position = (v_item ->> 'position')::smallint,
             color = case when v_item ? 'color' then v_item ->> 'color' else s.color end
       where s.id = (v_item ->> 'id')::uuid;
    else
      insert into public.pipeline_stages (account_id, pipeline_id, key, label, position, color)
      values (v_conta, p_pipeline_id, v_item ->> 'key', v_rotulo,
              (v_item ->> 'position')::smallint, v_item ->> 'color');
    end if;
  end loop;

  return 'ok';
end;
$configurar$;

comment on function public.configurar_etapas(uuid, jsonb) is
  'Cria, renomeia, reordena e colore as etapas de um funil numa transação (RF-207). Recebe a lista de etapas com id (existente) ou key (nova), label, position e color. Nunca altera key. Exige admin da conta e devolve código: ok, sem_permissao, etapa_de_outra_conta, chave_invalida, posicao_duplicada, etapa_canonica.';

revoke execute on function public.configurar_etapas(uuid, jsonb) from public, anon, service_role;
grant execute on function public.configurar_etapas(uuid, jsonb) to authenticated;
