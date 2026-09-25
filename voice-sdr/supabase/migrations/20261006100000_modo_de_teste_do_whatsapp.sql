-- O modo de teste do WhatsApp: quem a assistente atende pela instância da conta.
-- Referência: supabase/functions/_shared/whatsapp/modo.ts.
--
-- A instância Z-API costuma ser um número em uso (o celular do dono, o
-- comercial da empresa). Com o canal ligado e sem filtro, a assistente
-- responderia a qualquer um que escrevesse para ele. O modo `teste` limita a
-- conversa à lista de números de teste da conta (`account_test_numbers`, a
-- mesma que libera a discagem antes do portão da fatia): não há segunda lista.
--
-- Nasce `teste`, inclusive nas contas que já tinham o canal ligado: passar a
-- responder todo mundo é decisão explícita de quem administra, pela tela.

alter table public.account_settings
  add column whatsapp_mode text not null default 'teste'
    constraint account_settings_modo_do_whatsapp_conhecido
      check (whatsapp_mode in ('teste', 'todos'));

comment on column public.account_settings.whatsapp_mode is
  'Quem a assistente atende pelo WhatsApp. teste (padrão): só os números de account_test_numbers da conta; mensagem de outro número é ignorada por inteiro (nada gravado, nenhum lead, nenhuma resposta), e pré-contato e abertura pela assistente só saem para número da lista. todos: responde a qualquer número que escrever para a instância. Mensagem escrita por gente do time não passa pelo modo.';
