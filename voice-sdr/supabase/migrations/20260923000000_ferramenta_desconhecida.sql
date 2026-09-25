-- A ferramenta que ainda não sabemos ler entra no registro (R-02, T-02).
-- Referência: docs/PRD-implementacao.md seção 3.5, docs/revisao-tecnica.md
-- T-02 e R-02, supabase/functions/call-finalize/finalizacao.ts.
--
-- `call_tool_invocations.tool` nasceu lista fechada de dez (migração
-- 20260922070000_registro_de_ferramentas.sql): ferramenta fora dela era
-- defeito, e nenhuma tela saberia rotulá-la. Isso continua valendo para as
-- nossas sete — quem as grava somos nós, e nome fora do catálogo é engano de
-- quem escreveu.
--
-- Para o que o provedor executou, não. `call-finalize` lê as invocações da
-- transcrição depois da ligação, e o provedor tem ferramentas de sistema além
-- das três que publicamos. Recusar a linha de uma delas derrubaria a
-- finalização inteira, e descartá-la perderia o registro de algo que aconteceu
-- na ligação. Perder o registro é pior do que guardar um nome que ainda não
-- sabemos ler: a ficha mostra o nome cru, e a fatia que o entender acrescenta
-- a tradução.
--
-- A regra nova tem três partes:
-- 1. As sete nossas, em lista fechada, como antes.
-- 2. As três do provedor que publicamos, em lista, como antes — é a lista que
--    o teste do registro compara contra o catálogo.
-- 3. Qualquer outra do provedor, **sempre com o prefixo `system:`** e o nome
--    em letras, dígitos, `_` e `.`. O prefixo continua sendo o que separa quem
--    executou; sem ele (`end_call` cru) a linha é recusada como antes, e o
--    hífen fora do conjunto impede `system:tool-qualify`, que faria uma
--    ferramenta nossa passar por do provedor. `call-finalize` troca o
--    caractere que não cabe por `_` e guarda o nome original em `response`.

alter table public.call_tool_invocations
  drop constraint call_tool_invocations_tool_check;

alter table public.call_tool_invocations
  add constraint call_tool_invocations_tool_check check (
    tool in (
      'tool-availability', 'tool-book-meeting', 'tool-confirm-meeting',
      'tool-reschedule', 'tool-qualify', 'tool-transfer', 'tool-dnc',
      'system:end_call', 'system:transfer_to_number', 'system:voicemail_detection'
    )
    or tool ~ '^system:[A-Za-z0-9_.]{1,100}$'
  );

comment on constraint call_tool_invocations_tool_check on public.call_tool_invocations is
  'As sete nossas em lista fechada, as três do provedor que publicamos, e qualquer outra executada pelo provedor sempre com o prefixo system: e nome em letras, dígitos, sublinhado e ponto. call-finalize grava o que leu da transcrição mesmo sem saber ler: perder o registro de algo que o provedor executou é pior do que guardar um nome sem tradução.';

comment on column public.call_tool_invocations.tool is
  'A ferramenta acionada. O prefixo system: separa o que o provedor executou do que executamos: tool-transfer decide para onde transferir, e quem transfere é system:transfer_to_number. As nossas sete são lista fechada; do provedor, as três publicadas e qualquer outra que a transcrição traga, com o nome que veio depois do prefixo.';
