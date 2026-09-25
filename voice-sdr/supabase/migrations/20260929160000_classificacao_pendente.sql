-- A pendência de classificação na fila (US-139, RNF-06, F4).
--
-- 1. **Modelo fora do ar não inventa classificação, e não some.** Quando
--    call-classify não consegue a resposta do modelo (indisponível ou fora do
--    formato), a chamada fica com classification_source nulo, e a nova
--    tentativa é de cron-call-recovery. O item `classificacao_pendente` é o que
--    põe a chamada à vista enquanto isso: sem ele, uma conversa atendida por
--    gente fica fora do funil sem ninguém saber.
-- 2. **Um item por chamada.** A chave é `classificacao:<call_id>`, e
--    registrar_item_de_fila a deduplica pelo único parcial
--    exception_items_uma_causa_aberta: cada tentativa da recuperação que falhar
--    de novo responde ja_aberto.
-- 3. **Não é um dos sete de RF-909**, e por isso entra com nome próprio em vez
--    de reaproveitar outro gênero: falha_repetida é de discagem, e a tela a
--    abre pelo lead, que não é onde esta pendência se resolve.
--
-- O check é reemitido com a lista inteira, a mesma de
-- 20260929150000_fila_completa.sql mais o gênero novo.

alter table public.exception_items
  drop constraint if exists exception_items_genero_conhecido;

alter table public.exception_items
  add constraint exception_items_genero_conhecido check (kind in (
    'pedido_humano', 'pedido_bloqueio', 'sentimento_negativo', 'falha_repetida',
    'reuniao_sem_especialista', 'avaliacao_reprovada', 'credito_baixo',
    'human_requested', 'dnc_requested', 'repeated_failure',
    'classificacao_pendente'
  ));

comment on column public.exception_items.kind is
  'O gênero do item (RF-909). Os sete de RF-909 entraram na F4 com nome em português; human_requested, dnc_requested e repeated_failure são os da F3, ainda escritos pelas ferramentas e por abrir_item_de_falha_repetida, e a tela os lê como pedido_humano, pedido_bloqueio e falha_repetida. classificacao_pendente é de call-classify quando o modelo não respondeu, com a chave classificacao:<call_id>.';
