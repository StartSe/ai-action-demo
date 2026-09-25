-- Áudio e imagem no WhatsApp: a assistente passa a ouvir o áudio e a ver a
-- imagem que o lead manda, pelo modelo que a conta escolheu para cada uma.
-- Referência: supabase/functions/_shared/whatsapp/midia.ts e
-- supabase/functions/_shared/modelo/leitura-de-midia.ts.
--
-- Três decisões:
--
-- 1. **Duas tarefas novas de modelo**, `imagem` e `audio`, ao lado de draft,
--    classify e review, com a mesma regra: nulo é o padrão do código
--    (`_shared/modelo/resolucao.ts`), e a escolha passa por
--    `escolher_modelo_da_conta`. Só serve modelo que aceita a entrada
--    (`architecture.input_modalities` do catálogo), e quem filtra é a tela.
-- 2. **A mídia nunca é guardada.** A borda baixa o arquivo pela URL da Z-API,
--    manda ao modelo e descarta. O que fica é o texto derivado, em
--    `whatsapp_messages.media_text`: a transcrição do áudio ou a descrição da
--    imagem. `body` continua sendo só o que o lead escreveu (a legenda).
-- 3. **A leitura tem estado** (`media_status`), porque ela corre depois do
--    200 do webhook: `pendente` enquanto o modelo lê, e a resposta da
--    assistente espera; `lida` com o texto gravado; `falhou` quando o download
--    ou o modelo falharam, e a assistente pede para repetir ou escrever, sem
--    inventar o que não ouviu.

-- As tarefas novas --------------------------------------------------------------
alter table public.model_settings
  add column model_for_image text check (model_for_image is null or length(btrim(model_for_image)) > 0),
  add column model_for_audio text check (model_for_audio is null or length(btrim(model_for_audio)) > 0);

comment on column public.model_settings.model_for_image is
  'O modelo que descreve a imagem recebida pelo WhatsApp (tarefa imagem). Precisa aceitar imagem na entrada. Nulo é o padrão do código.';

comment on column public.model_settings.model_for_audio is
  'O modelo que transcreve o áudio recebido pelo WhatsApp (tarefa audio). Precisa aceitar áudio na entrada, em ogg/opus, que é o formato do WhatsApp. Nulo é o padrão do código.';

create or replace function public.resolver_modelo_da_conta(
  p_account_id uuid,
  p_tarefa text
)
returns table (provider text, model text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(s.provider, 'platform') as provider,
    case p_tarefa
      when 'draft' then s.model_for_draft
      when 'classify' then s.model_for_classify
      when 'review' then s.model_for_review
      when 'imagem' then s.model_for_image
      when 'audio' then s.model_for_audio
    end as model
  from (select 1) as sempre
  left join public.model_settings s on s.account_id = p_account_id;
$$;

comment on function public.resolver_modelo_da_conta(uuid, text) is
  'A porta e o modelo da conta para uma tarefa (draft, classify, review, imagem, audio). Conta sem linha devolve platform e modelo nulo, que é o estado de toda conta antes de conectar. Modelo nulo quer dizer o padrão do código.';

create or replace function public.escolher_modelo_da_conta(
  p_account_id uuid,
  p_tarefa text,
  p_modelo text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_modelo text := nullif(btrim(coalesce(p_modelo, '')), '');
begin
  if not public.has_role(p_account_id, 'admin') then
    raise exception 'escolher o modelo exige administrador da conta'
      using errcode = '42501';
  end if;

  if p_tarefa not in ('draft', 'classify', 'review', 'imagem', 'audio') then
    raise exception 'tarefa desconhecida: %', p_tarefa using errcode = '22023';
  end if;

  insert into public.model_settings (account_id)
  values (p_account_id)
  on conflict (account_id) do nothing;

  update public.model_settings
     set model_for_draft = case when p_tarefa = 'draft' then v_modelo else model_for_draft end,
         model_for_classify = case when p_tarefa = 'classify' then v_modelo else model_for_classify end,
         model_for_review = case when p_tarefa = 'review' then v_modelo else model_for_review end,
         model_for_image = case when p_tarefa = 'imagem' then v_modelo else model_for_image end,
         model_for_audio = case when p_tarefa = 'audio' then v_modelo else model_for_audio end
   where account_id = p_account_id;
end;
$$;

comment on function public.escolher_modelo_da_conta(uuid, text, text) is
  'Escolhe o modelo de uma tarefa (draft, classify, review, imagem, audio). Exige administrador. Modelo nulo apaga a escolha e devolve a conta ao padrão do código. Não alcança nenhuma coluna da conexão.';

create or replace function public.desconectar_modelo_da_conta(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.model_settings
     set provider = 'platform',
         connection = '{}'::jsonb,
         connected_at = null,
         connected_by = null,
         model_for_draft = null,
         model_for_classify = null,
         model_for_review = null,
         model_for_image = null,
         model_for_audio = null
   where account_id = p_account_id;
end;
$$;

comment on function public.desconectar_modelo_da_conta(uuid) is
  'Volta a conta para a porta da plataforma e zera os modelos escolhidos das cinco tarefas, que são identificadores do OpenRouter e não valem na outra porta.';

-- A leitura da mídia ------------------------------------------------------------
alter table public.whatsapp_messages
  add column media_text text
    constraint whatsapp_messages_leitura_da_midia_tamanho
      check (media_text is null or (btrim(media_text) <> '' and length(media_text) <= 4096)),
  add column media_status text
    constraint whatsapp_messages_estado_da_leitura_conhecido
      check (media_status is null or media_status in ('pendente', 'lida', 'falhou')),
  add constraint whatsapp_messages_leitura_so_de_midia
    check (media_status is null or media_kind is not null),
  add constraint whatsapp_messages_lida_tem_texto
    check ((media_status = 'lida') = (media_text is not null));

comment on column public.whatsapp_messages.media_text is
  'O texto derivado da mídia: a transcrição do áudio ou a descrição objetiva da imagem (com o texto que aparece nela), escrito pelo modelo da tarefa audio ou imagem. A mídia em si nunca é guardada. body continua sendo só o que o lead escreveu, como a legenda.';

comment on column public.whatsapp_messages.media_status is
  'A leitura da mídia pelo modelo. Nulo: texto, ou mídia que o modelo não lê (vídeo, documento, figurinha). pendente: a leitura corre depois do webhook, e a resposta espera. lida: media_text gravado. falhou: download ou modelo falharam, e a assistente pede para repetir ou escrever.';

comment on column public.whatsapp_messages.media_kind is
  'Nulo para texto. Preenchido quando o lead mandou áudio, imagem ou outro conteúdo que não é texto. Áudio e imagem são lidos pelo modelo da conta (media_text, media_status); o resto recebe o pedido de texto.';
