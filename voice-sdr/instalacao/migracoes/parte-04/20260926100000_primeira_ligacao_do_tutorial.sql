-- A primeira ligação de teste entra no progresso declarado (US-255).
--
-- O tutorial ganhou um passo depois dos oito do catálogo: ligar para o número
-- de teste e ver a ficha. **O catálogo não muda**, e de propósito: o passo não
-- mede dado nenhum que `onboarding_health` saiba medir, e um nono passo em
-- `passos_de_configuracao` entraria na pendência do checklist de toda conta.
-- Por isso ele não cabe em `completed_steps`, cujo check só aceita passo do
-- catálogo.
--
-- O que a tela declara é a chamada que fez: o id guarda o fato e o endereço da
-- ficha de uma vez. A chave estrangeira apaga a declaração junto com a
-- chamada, em vez de deixar um link para uma ficha que não existe mais. A
-- escrita segue a política de update de admin que a tabela já tem, e o gatilho
-- de auditoria já registra a mudança.

alter table public.onboarding_state
  add column test_call_id uuid references public.calls (id) on delete set null;

comment on column public.onboarding_state.test_call_id is
  'Chamada com que o tutorial fechou a primeira ligação de teste. Nula enquanto o passo não foi feito.';
