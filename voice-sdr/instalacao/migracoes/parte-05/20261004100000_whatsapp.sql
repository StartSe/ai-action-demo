-- O canal de WhatsApp: a mesma assistente, por texto, pela instância Z-API da
-- conta. Referência: docs/referencia-de-integracoes.md seção 3,
-- supabase/functions/_shared/whatsapp/ e as bordas whatsapp-inbound,
-- whatsapp-send e whatsapp-connect.
--
-- Cinco decisões:
--
-- 1. **Uma conversa ativa por número.** `whatsapp_conversations` tem único
--    parcial em (conta, telefone) onde o status não é `encerrada`: a mensagem
--    que chega acha a conversa viva pela inferência do índice, e duas mensagens
--    do mesmo número chegando juntas não abrem duas conversas. Encerrar é
--    `update`; a próxima mensagem do mesmo número abre conversa nova.
-- 2. **Idempotência de webhook é chave única.** A Z-API reenvia o que não
--    recebeu 2xx, e o identificador da mensagem dela
--    (`provider_message_id`) é único por conta. O webhook repetido cai no
--    `on conflict do nothing` de `registrar_mensagem_do_whatsapp` e não
--    responde duas vezes.
-- 3. **Classe Servidor nas duas tabelas.** Membro lê, ninguém escreve pelo
--    cliente: quem grava é a borda, pela chave de serviço, e os atos de gente
--    (mandar mensagem, assumir, devolver, encerrar) passam por whatsapp-send,
--    que confere o papel e grava o autor na mensagem e na linha do tempo.
-- 4. **A linha do tempo do lead narra a conversa**, com o `kind` novo
--    `whatsapp` e a ação no `payload`, pelo RPC de evento, como os outros
--    eventos. A mensagem em si não vira evento: seria uma linha por frase.
-- 5. **Canal desligado por padrão.** `whatsapp_enabled` e
--    `whatsapp_pre_contact` nascem falsos, pela mesma razão de
--    `speed_to_lead_enabled`: responder ou escrever sem ninguém ter pedido é o
--    caminho curto da primeira reclamação.

-- A configuração ----------------------------------------------------------------
alter table public.account_settings
  add column whatsapp_enabled boolean not null default false,
  add column whatsapp_pre_contact boolean not null default false,
  add column whatsapp_pre_contact_text text
    constraint account_settings_pre_contato_preenchido
      check (whatsapp_pre_contact_text is null
             or (btrim(whatsapp_pre_contact_text) <> '' and length(whatsapp_pre_contact_text) <= 500));

comment on column public.account_settings.whatsapp_enabled is
  'A assistente responde pelo WhatsApp da conta (Z-API). Falso por padrão: com o canal desligado as mensagens recebidas são gravadas e ninguém responde por ela.';

comment on column public.account_settings.whatsapp_pre_contact is
  'Mensagem de WhatsApp logo depois que a guarda libera a ligação de cron-dial. Falha no envio nunca impede a ligação.';

comment on column public.account_settings.whatsapp_pre_contact_text is
  'O texto do pré-contato escrito pela conta, com os marcadores do lead. Nulo é a fala padrão do servidor (_shared/speech/whatsapp.ts).';

-- A conversa --------------------------------------------------------------------
create table public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  lead_id uuid,
  phone_e164 text not null
    constraint whatsapp_conversations_telefone_e164
      check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null default 'assistente'
    constraint whatsapp_conversations_estado_conhecido
      check (status in ('assistente', 'humano', 'encerrada')),
  purpose text not null default 'discovery'
    constraint whatsapp_conversations_proposito_conhecido
      check (purpose in ('discovery', 'reminder', 'rescue', 'followup')),
  started_by text not null
    constraint whatsapp_conversations_quem_abriu
      check (started_by in ('lead', 'assistente', 'humano')),
  -- Memória da conversa, como call_slot_offers é a da ligação: as ofertas que
  -- a consulta de horários fez, por posição. Quem escreve é a borda.
  slot_offers jsonb not null default '[]'::jsonb
    constraint whatsapp_conversations_ofertas_em_lista
      check (jsonb_typeof(slot_offers) = 'array'),
  -- A reivindicação da resposta: só quem a tomou gera e manda a resposta da
  -- assistente. Nula é conversa livre; mais velha que dois minutos é
  -- reivindicação de execução que morreu, e pode ser tomada de novo.
  replying_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_conversations_id_conta unique (id, account_id),
  -- O lead é da mesma conta, e apagar o lead apaga a conversa (dado pessoal,
  -- RF-808). A chave nomeia a coluna no set null não: é cascata.
  constraint whatsapp_conversations_lead_da_conta
    foreign key (lead_id, account_id) references public.leads (id, account_id) on delete cascade
);

comment on table public.whatsapp_conversations is
  'Conversa da assistente com um lead pelo WhatsApp da conta. Uma ativa por número (whatsapp_conversations_uma_ativa). status assistente: ela responde; humano: alguém da conta assumiu e ela cala; encerrada: ninguém responde, e a próxima mensagem abre outra conversa. Classe Servidor: escrita pela borda.';

comment on column public.whatsapp_conversations.slot_offers is
  'As ofertas de horário da última consulta, em lista de objetos { position, specialist_id, starts_at, ends_at, expires_at }. Substituída a cada consulta e esvaziada quando a reunião é marcada, como call_slot_offers na ligação.';

create unique index whatsapp_conversations_uma_ativa
  on public.whatsapp_conversations (account_id, phone_e164)
  where status <> 'encerrada';

create index whatsapp_conversations_recentes
  on public.whatsapp_conversations (account_id, last_message_at desc);

create index whatsapp_conversations_do_lead
  on public.whatsapp_conversations (lead_id)
  where lead_id is not null;

create trigger whatsapp_conversations_set_updated_at
  before update on public.whatsapp_conversations
  for each row execute function public.set_updated_at();

-- A mensagem --------------------------------------------------------------------
create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  conversation_id uuid not null,
  direction text not null
    constraint whatsapp_messages_sentido_conhecido
      check (direction in ('in', 'out')),
  author text not null
    constraint whatsapp_messages_autor_conhecido
      check (author in ('lead', 'assistente', 'humano', 'sistema')),
  -- Sem chave estrangeira, como audit_log: a mensagem sobrevive a quem a mandou.
  author_id uuid,
  body text not null default ''
    constraint whatsapp_messages_tamanho
      check (length(body) <= 4096),
  media_kind text
    constraint whatsapp_messages_midia_conhecida
      check (media_kind is null or media_kind in
        ('audio', 'imagem', 'video', 'documento', 'figurinha', 'localizacao', 'contato', 'outro')),
  provider_message_id text
    constraint whatsapp_messages_id_do_provedor_preenchido
      check (provider_message_id is null or btrim(provider_message_id) <> ''),
  status text not null
    constraint whatsapp_messages_estado_conhecido
      check (status in ('recebida', 'enviada', 'entregue', 'lida', 'falhou')),
  error text,
  created_at timestamptz not null default now(),
  constraint whatsapp_messages_da_conversa
    foreign key (conversation_id, account_id)
    references public.whatsapp_conversations (id, account_id) on delete cascade,
  constraint whatsapp_messages_texto_ou_midia
    check (media_kind is not null or btrim(body) <> ''),
  -- Quem escreve em cada sentido: só o lead manda o que entra.
  constraint whatsapp_messages_autor_do_sentido
    check ((direction = 'in') = (author = 'lead')),
  constraint whatsapp_messages_recebida_so_na_entrada
    check ((direction = 'in') = (status = 'recebida')),
  constraint whatsapp_messages_gente_tem_autor
    check (author <> 'humano' or author_id is not null)
);

comment on table public.whatsapp_messages is
  'Mensagens de uma conversa de WhatsApp, nos dois sentidos. provider_message_id é o messageId da Z-API, único por conta: é ele que torna idempotente o webhook repetido. Classe Servidor: escrita pela borda.';

comment on column public.whatsapp_messages.media_kind is
  'Nulo para texto. Preenchido quando o lead mandou áudio, imagem ou outro conteúdo que não é texto: a assistente pede texto em vez de responder ao que não leu.';

comment on column public.whatsapp_messages.author_id is
  'Quem mandou, quando author é humano. Sem chave estrangeira: a mensagem sobrevive à saída de quem a mandou.';

create unique index whatsapp_messages_uma_por_id_do_provedor
  on public.whatsapp_messages (account_id, provider_message_id);

create index whatsapp_messages_da_conversa_idx
  on public.whatsapp_messages (conversation_id, created_at desc);

-- Isolamento (classe Servidor) ---------------------------------------------------
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;

create policy whatsapp_conversations_leitura_de_membro
  on public.whatsapp_conversations for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy whatsapp_conversations_leitura_de_membro on public.whatsapp_conversations is
  'Classe Servidor: todo membro lê as conversas da conta. Nenhuma política de escrita: quem grava é a borda (whatsapp-inbound, whatsapp-send), pela chave de serviço, e os atos de gente passam por whatsapp-send, que confere o papel.';

create policy whatsapp_messages_leitura_de_membro
  on public.whatsapp_messages for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy whatsapp_messages_leitura_de_membro on public.whatsapp_messages is
  'Classe Servidor: todo membro lê as mensagens da conta. Nenhuma política de escrita: mensagem de gente sai por whatsapp-send, que grava o autor.';

-- A linha do tempo --------------------------------------------------------------
alter table public.lead_events drop constraint lead_events_kind_check;
alter table public.lead_events add constraint lead_events_kind_check check (kind in (
  'lead_created',
  'lead_imported',
  'lead_updated',
  'stage_change',
  'note',
  'blocked',
  'unblocked',
  'merged',
  'call',
  'whatsapp'
));

comment on constraint lead_events_kind_check on public.lead_events is
  'Vocabulário fechado da linha do tempo. whatsapp narra a conversa (payload.acao: iniciada, assumida, devolvida, encerrada, pedido_humano, pre_contato; payload.conversation_id), nunca cada mensagem.';

-- abrir_conversa_do_whatsapp ------------------------------------------------------
-- Acha ou abre a conversa ativa do número, numa ida só: a inferência repete as
-- colunas e o where do índice parcial. Abriu com lead, narra na linha do tempo.
create function public.abrir_conversa_do_whatsapp(
  p_account_id uuid,
  p_phone_e164 text,
  p_lead_id uuid,
  p_purpose text,
  p_started_by text,
  p_actor text default 'system',
  p_actor_id uuid default null
)
returns table (conversation_id uuid, criada boolean)
language plpgsql
security definer
set search_path = ''
as $abrir$
declare
  v_id uuid;
begin
  insert into public.whatsapp_conversations (account_id, lead_id, phone_e164, purpose, started_by)
  values (p_account_id, p_lead_id, p_phone_e164, coalesce(p_purpose, 'discovery'), p_started_by)
  on conflict (account_id, phone_e164) where status <> 'encerrada' do nothing
  returning id into v_id;

  if v_id is not null then
    if p_lead_id is not null then
      perform public.registrar_evento_de_lead(
        p_lead_id, 'whatsapp', p_actor, p_actor_id, null,
        jsonb_build_object('acao', 'iniciada', 'conversation_id', v_id, 'started_by', p_started_by)
      );
    end if;
    return query select v_id, true;
    return;
  end if;

  select c.id into v_id
    from public.whatsapp_conversations c
   where c.account_id = p_account_id
     and c.phone_e164 = p_phone_e164
     and c.status <> 'encerrada';

  -- A conversa aberta antes de o lead existir ganha o lead agora.
  if p_lead_id is not null then
    update public.whatsapp_conversations
       set lead_id = p_lead_id
     where id = v_id and lead_id is null;
  end if;

  return query select v_id, false;
end;
$abrir$;

comment on function public.abrir_conversa_do_whatsapp(uuid, text, uuid, text, text, text, uuid) is
  'Devolve a conversa ativa do número, criando-a quando não há (criada = true), pelo único parcial whatsapp_conversations_uma_ativa. A criação com lead grava o evento whatsapp iniciada. Execução só para service_role.';

revoke execute on function public.abrir_conversa_do_whatsapp(uuid, text, uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.abrir_conversa_do_whatsapp(uuid, text, uuid, text, text, text, uuid)
  to service_role;

-- registrar_mensagem_do_whatsapp --------------------------------------------------
-- Grava a mensagem e avança last_message_at na mesma transação. Com
-- provider_message_id repetido não grava nada e devolve nova = false.
create function public.registrar_mensagem_do_whatsapp(
  p_account_id uuid,
  p_conversation_id uuid,
  p_direction text,
  p_author text,
  p_author_id uuid,
  p_body text,
  p_media_kind text,
  p_provider_message_id text,
  p_status text,
  p_error text default null
)
returns table (message_id uuid, nova boolean)
language plpgsql
security definer
set search_path = ''
as $registrar$
declare
  v_id uuid;
begin
  insert into public.whatsapp_messages
    (account_id, conversation_id, direction, author, author_id, body, media_kind,
     provider_message_id, status, error)
  values
    (p_account_id, p_conversation_id, p_direction, p_author, p_author_id, coalesce(p_body, ''),
     p_media_kind, nullif(btrim(coalesce(p_provider_message_id, '')), ''), p_status, p_error)
  on conflict (account_id, provider_message_id) do nothing
  returning id into v_id;

  if v_id is null then
    select m.id into v_id
      from public.whatsapp_messages m
     where m.account_id = p_account_id
       and m.provider_message_id = btrim(p_provider_message_id);
    return query select v_id, false;
    return;
  end if;

  update public.whatsapp_conversations
     set last_message_at = now()
   where id = p_conversation_id and account_id = p_account_id;

  return query select v_id, true;
end;
$registrar$;

comment on function public.registrar_mensagem_do_whatsapp(uuid, uuid, text, text, uuid, text, text, text, text, text) is
  'Grava uma mensagem de WhatsApp com on conflict no único (conta, provider_message_id): o webhook repetido devolve a mensagem já gravada com nova = false. Avança last_message_at da conversa. Execução só para service_role.';

revoke execute on function public.registrar_mensagem_do_whatsapp(uuid, uuid, text, text, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.registrar_mensagem_do_whatsapp(uuid, uuid, text, text, uuid, text, text, text, text, text)
  to service_role;

-- mudar_estado_da_conversa_do_whatsapp -------------------------------------------
-- Assumir, devolver e encerrar: `update ... where status = any(de) returning`,
-- e o evento na mesma transação. Código, nunca frase.
create function public.mudar_estado_da_conversa_do_whatsapp(
  p_account_id uuid,
  p_conversation_id uuid,
  p_de text[],
  p_para text,
  p_acao text,
  p_actor text,
  p_actor_id uuid,
  p_motivo text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $mudar$
declare
  v_lead uuid;
  v_atual text;
begin
  if p_acao not in ('assumida', 'devolvida', 'encerrada', 'pedido_humano') then
    raise exception 'acao_desconhecida'
      using errcode = '22023',
            detail = format('A ação é assumida, devolvida, encerrada ou pedido_humano; chegou %s.', coalesce(p_acao, 'nula'));
  end if;

  update public.whatsapp_conversations
     set status = p_para
   where id = p_conversation_id
     and account_id = p_account_id
     and status = any(p_de)
  returning lead_id into v_lead;

  if not found then
    select c.status into v_atual
      from public.whatsapp_conversations c
     where c.id = p_conversation_id and c.account_id = p_account_id;
    if v_atual is null then
      return 'nao_encontrada';
    end if;
    return case when v_atual = p_para then 'mesmo_estado' else 'estado_incompativel' end;
  end if;

  if v_lead is not null then
    perform public.registrar_evento_de_lead(
      v_lead, 'whatsapp', p_actor, p_actor_id, null,
      jsonb_strip_nulls(jsonb_build_object(
        'acao', p_acao, 'conversation_id', p_conversation_id, 'motivo', p_motivo
      ))
    );
  end if;

  return 'mudou';
end;
$mudar$;

comment on function public.mudar_estado_da_conversa_do_whatsapp(uuid, uuid, text[], text, text, text, uuid, text) is
  'Leva a conversa de um dos estados de p_de para p_para e narra a ação no lead. Devolve mudou, mesmo_estado, estado_incompativel ou nao_encontrada. Execução só para service_role: quem chama é whatsapp-send (com o autor conferido) e whatsapp-inbound.';

revoke execute on function public.mudar_estado_da_conversa_do_whatsapp(uuid, uuid, text[], text, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mudar_estado_da_conversa_do_whatsapp(uuid, uuid, text[], text, text, text, uuid, text)
  to service_role;

-- reivindicar_resposta_do_whatsapp ------------------------------------------------
-- O lead manda duas ou três mensagens seguidas, e cada uma é um webhook. Cada
-- webhook espera a janela de agrupamento e tenta a reivindicação: só um toma a
-- conversa, e ele responde a todas as mensagens novas de uma vez. O instante
-- devolvido é o corte: o que chegar depois dele é da rodada seguinte.
-- `update ... returning` numa instrução só, nunca leitura antes.
create function public.reivindicar_resposta_do_whatsapp(
  p_account_id uuid,
  p_conversation_id uuid
)
returns timestamptz
language sql
security definer
set search_path = ''
as $reivindicar$
  -- Em milissegundos: o corte volta à borda como instante de JavaScript, e o
  -- microssegundo perdido na volta faria soltar_resposta nunca casar.
  update public.whatsapp_conversations
     set replying_at = date_trunc('milliseconds', now())
   where id = p_conversation_id
     and account_id = p_account_id
     and status = 'assistente'
     and (replying_at is null or replying_at < now() - interval '2 minutes')
  returning replying_at;
$reivindicar$;

comment on function public.reivindicar_resposta_do_whatsapp(uuid, uuid) is
  'Toma a conversa para responder, se ela está com a assistente e ninguém a tomou nos últimos dois minutos. Devolve o instante da reivindicação (o corte) ou nulo. Execução só para service_role.';

revoke execute on function public.reivindicar_resposta_do_whatsapp(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reivindicar_resposta_do_whatsapp(uuid, uuid) to service_role;

-- soltar_resposta_do_whatsapp -----------------------------------------------------
-- Solta a reivindicação e diz se chegou mensagem do lead depois do corte: aí a
-- mesma execução responde de novo, porque o webhook dessa mensagem pode ter
-- desistido enquanto a conversa estava tomada.
create function public.soltar_resposta_do_whatsapp(
  p_account_id uuid,
  p_conversation_id uuid,
  p_corte timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $soltar$
begin
  update public.whatsapp_conversations
     set replying_at = null
   where id = p_conversation_id
     and account_id = p_account_id
     and replying_at = p_corte;

  return exists (
    select 1 from public.whatsapp_messages m
     where m.conversation_id = p_conversation_id
       and m.account_id = p_account_id
       and m.direction = 'in'
       -- Inclusivo: a mensagem gravada no mesmo milissegundo do corte pode
       -- ter ficado fora da leitura, e uma rodada a mais só acha a última
       -- mensagem já respondida.
       and m.created_at >= p_corte
  );
end;
$soltar$;

comment on function public.soltar_resposta_do_whatsapp(uuid, uuid, timestamptz) is
  'Solta a reivindicação tomada no corte dado (a de outra execução fica) e devolve se chegou mensagem do lead depois do corte. Execução só para service_role.';

revoke execute on function public.soltar_resposta_do_whatsapp(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.soltar_resposta_do_whatsapp(uuid, uuid, timestamptz) to service_role;
