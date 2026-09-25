-- A fila completa e a criação idempotente de item (US-131, RF-909, RF-910,
-- RNF-06, F4).
--
-- 1. **O check do gênero é ampliado, não recriado como outra regra.** Entram os
--    sete de RF-909 com o nome em português (pedido_humano, pedido_bloqueio,
--    sentimento_negativo, falha_repetida, reuniao_sem_especialista,
--    avaliacao_reprovada, credito_baixo), e os três que a F3 já grava
--    (human_requested, dnc_requested, repeated_failure) continuam valendo: as
--    ferramentas da F3 e `abrir_item_de_falha_repetida` escrevem esses nomes, e
--    a tela os lê como sinônimos de pedido_humano, pedido_bloqueio e
--    falha_repetida.
-- 2. **A mesma causa não vira dois itens.** `deduplicacao_key` com único
--    parcial em (account_id, deduplicacao_key) onde status = 'aberto'. Item
--    resolvido libera a chave. O item que nasce por caminho que não informa
--    chave (a inclusão manual, os RPCs da F3) recebe `<kind>:<id>` de um
--    gatilho `before insert`, que é única por construção e não deduplica nada.
-- 3. **O limiar vigente viaja no item** (`threshold_snapshot`): mudar o limiar
--    depois não reescreve a fila de ontem.
-- 4. **Contexto é ponteiro, não conteúdo** (R-08): trecho da conversa e call_id
--    para o áudio, nunca o áudio nem a transcrição inteira.

alter table public.exception_items
  drop constraint if exists exception_items_genero_conhecido;

alter table public.exception_items
  add constraint exception_items_genero_conhecido check (kind in (
    'pedido_humano', 'pedido_bloqueio', 'sentimento_negativo', 'falha_repetida',
    'reuniao_sem_especialista', 'avaliacao_reprovada', 'credito_baixo',
    'human_requested', 'dnc_requested', 'repeated_failure'
  ));

comment on column public.exception_items.kind is
  'O gênero do item (RF-909). Os sete de RF-909 entraram na F4 com nome em português; human_requested, dnc_requested e repeated_failure são os da F3, ainda escritos pelas ferramentas e por abrir_item_de_falha_repetida, e a tela os lê como pedido_humano, pedido_bloqueio e falha_repetida.';

alter table public.exception_items
  add column if not exists deduplicacao_key text,
  add column if not exists threshold_snapshot jsonb
    constraint exception_items_limiar_objeto
      check (threshold_snapshot is null or jsonb_typeof(threshold_snapshot) = 'object');

update public.exception_items
   set deduplicacao_key = kind || ':' || id::text
 where deduplicacao_key is null;

create or replace function public.chave_de_deduplicacao_padrao()
returns trigger
language plpgsql
set search_path = ''
as $chave$
begin
  if new.deduplicacao_key is null or btrim(new.deduplicacao_key) = '' then
    new.deduplicacao_key := new.kind || ':' || new.id::text;
  end if;
  return new;
end;
$chave$;

comment on function public.chave_de_deduplicacao_padrao() is
  'Dá ao item sem chave informada a chave kind:id, única por construção. Quem deduplica por causa é registrar_item_de_fila, que recebe a chave pronta.';

drop trigger if exists exception_items_chave_padrao on public.exception_items;
create trigger exception_items_chave_padrao
  before insert on public.exception_items
  for each row execute function public.chave_de_deduplicacao_padrao();

alter table public.exception_items
  alter column deduplicacao_key set not null;

create unique index if not exists exception_items_uma_causa_aberta
  on public.exception_items (account_id, deduplicacao_key)
  where status = 'aberto';

comment on index public.exception_items_uma_causa_aberta is
  'A mesma causa não vira dois itens abertos (RNF-06): a rotina que roda duas vezes produz a mesma chave, e o segundo insert não entra. Resolvido libera a chave.';

comment on column public.exception_items.deduplicacao_key is
  'A causa do item, determinística e nunca por instante: sentimento:<call_id>, avaliacao:<call_id>, falha:<telefone>:<dia>, credito:<provedor>:<dia>. Sem chave informada, o gatilho escreve kind:id.';

comment on column public.exception_items.threshold_snapshot is
  'O limiar vigente quando o item nasceu, copiado de account_settings. Mudar o limiar depois não reescreve a fila já formada: o limiar novo vale para as chamadas seguintes.';

comment on column public.exception_items.context is
  'O recorte da conversa que explica o item e o call_id por onde a tela pede o áudio por URL assinada. Nunca o áudio nem a transcrição inteira (R-08): a gravação vive no Storage e a transcrição inteira está na chamada.';

-- Criação idempotente ------------------------------------------------------------
create or replace function public.registrar_item_de_fila(
  p_account_id uuid,
  p_kind text,
  p_severity text,
  p_deduplicacao_key text,
  p_context jsonb,
  p_threshold_snapshot jsonb,
  p_lead_id uuid,
  p_call_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $registrar$
declare
  v_id uuid;
begin
  if auth.uid() is not null and not (select public.has_role(p_account_id, 'operator')) then
    return 'sem_permissao';
  end if;

  if p_deduplicacao_key is null or btrim(p_deduplicacao_key) = '' then
    raise exception 'deduplicacao_key_ausente'
      using errcode = '22023',
            detail = 'item de rotina precisa da chave da causa, senão a segunda passagem cria outro item';
  end if;

  insert into public.exception_items
    (account_id, kind, severity, deduplicacao_key, context, threshold_snapshot, lead_id, call_id)
  values
    (p_account_id, p_kind, coalesce(p_severity, 'media'), p_deduplicacao_key,
     coalesce(p_context, '{}'::jsonb), p_threshold_snapshot, p_lead_id, p_call_id)
  on conflict (account_id, deduplicacao_key) where status = 'aberto' do nothing
  returning id into v_id;

  return case when v_id is null then 'ja_aberto' else 'criado' end;
end;
$registrar$;

comment on function public.registrar_item_de_fila(uuid, text, text, text, jsonb, jsonb, uuid, uuid) is
  'Cria item da fila pela chave da causa, com on conflict no único parcial exception_items_uma_causa_aberta: devolve criado ou ja_aberto, sem segunda linha (RNF-06). Com sessão, exige operator na conta; sem sessão é a rotina, pela chave de serviço.';

revoke execute on function public.registrar_item_de_fila(uuid, text, text, text, jsonb, jsonb, uuid, uuid) from public, anon;
grant execute on function public.registrar_item_de_fila(uuid, text, text, text, jsonb, jsonb, uuid, uuid)
  to authenticated, service_role;

-- Resolução com código -----------------------------------------------------------
create or replace function public.resolver_item_de_fila(
  p_item_id uuid,
  p_resolucao text
)
returns text
language plpgsql
security definer
set search_path = ''
as $resolver$
declare
  v_conta uuid;
  v_status text;
  v_resolucao text := nullif(btrim(coalesce(p_resolucao, '')), '');
begin
  select e.account_id, e.status into v_conta, v_status
    from public.exception_items as e where e.id = p_item_id
     for update;

  -- security definer desliga a RLS: estas conferências são a barreira.
  if v_conta is null or not (select public.is_member(v_conta)) then
    return 'item_de_outra_conta';
  end if;

  if not (select public.has_role(v_conta, 'operator')) then
    return 'sem_permissao';
  end if;

  if v_status = 'resolvido' then
    return 'ja_resolvido';
  end if;

  if v_resolucao is null then
    return 'resolucao_vazia';
  end if;

  perform set_config('app.audit_reason', v_resolucao, true);

  -- exception_items_auditoria grava a trilha nesta transação, com auth.uid().
  update public.exception_items
     set status = 'resolvido',
         resolved_by = auth.uid(),
         resolved_at = now(),
         resolution = v_resolucao
   where id = p_item_id;

  return 'resolvido';
end;
$resolver$;

comment on function public.resolver_item_de_fila(uuid, text) is
  'Resolve item da fila (RF-910): resolved_by = auth.uid(), resolved_at = now(), resolution e a trilha na mesma transação. Devolve resolvido, ja_resolvido, item_de_outra_conta (inexistente ou alheio, sem distinguir), sem_permissao ou resolucao_vazia. Só authenticated executa.';

revoke execute on function public.resolver_item_de_fila(uuid, text) from public, anon, service_role;
grant execute on function public.resolver_item_de_fila(uuid, text) to authenticated;
