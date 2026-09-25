-- Particularidades por canal: uma assistente só, com o que muda entre a voz e
-- o WhatsApp. Referência: supabase/functions/_shared/agente/retrato-da-publicacao.ts.
--
-- Três colunas novas em `agents`, todas opcionais, e o retrato do que foi ao
-- ar em `agent_publications`:
--
-- - `whatsapp_first_message`: a abertura por mensagem, com os marcadores da
--   primeira fala. Nula vale o padrão do servidor (`_shared/speech/whatsapp.ts`).
-- - `voice_channel_style` e `whatsapp_channel_style`: o jeito do canal, somado
--   ao jeito da casa só naquele canal. Na voz entra no prompt publicado; no
--   WhatsApp entra no sistema do motor.
-- - `agent_publications.channel_snapshot`: a identidade e o roteiro que a
--   publicação pôs no ar, por propósito. É dali que o WhatsApp lê quem a
--   assistente é, e não da linha em edição de `agents`: mudar a identidade só
--   vale nos dois canais quando alguém publica.

alter table public.agents
  add column whatsapp_first_message text
    constraint agents_abertura_do_whatsapp_com_texto
      check (whatsapp_first_message is null or length(btrim(whatsapp_first_message)) > 0),
  add column voice_channel_style text
    constraint agents_jeito_da_voz_com_texto
      check (voice_channel_style is null or length(btrim(voice_channel_style)) > 0),
  add column whatsapp_channel_style text
    constraint agents_jeito_do_whatsapp_com_texto
      check (whatsapp_channel_style is null or length(btrim(whatsapp_channel_style)) > 0);

comment on column public.agents.whatsapp_first_message is
  'A primeira mensagem da assistente no WhatsApp, quando ela inicia a conversa e no pré-contato, com os mesmos marcadores da primeira fala. Nula: vale a abertura padrão do servidor. Só vai ao ar pela publicação.';

comment on column public.agents.voice_channel_style is
  'O jeito da assistente só na ligação, somado ao jeito da casa no prompt publicado. Nulo: só o jeito da casa.';

comment on column public.agents.whatsapp_channel_style is
  'O jeito da assistente só no WhatsApp, somado ao jeito da casa no sistema da conversa por mensagem. Nulo: só o jeito da casa. Só vai ao ar pela publicação.';

alter table public.agent_publications
  add column channel_snapshot jsonb
    constraint agent_publications_retrato_e_objeto
      check (channel_snapshot is null or jsonb_typeof(channel_snapshot) = 'object');

comment on column public.agent_publications.channel_snapshot is
  'O retrato do que esta publicação pôs no ar: identidade, roteiro do propósito e o que é só do WhatsApp (abertura e jeito do canal). O canal de WhatsApp lê a assistente daqui, e não de agents, para os dois canais mudarem juntos na publicação. Nulo em publicação anterior ao retrato: o WhatsApp não responde até a próxima publicação.';
