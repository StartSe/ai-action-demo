-- A fila única de discagem: uma tabela, cinco rotinas produtoras, um consumidor
-- (seção 3.7, L-14, R-09).
-- Referência: docs/PRD-implementacao.md seções 3.7, 3.9 e 4.6,
-- docs/revisao-tecnica.md L-14, T-04, T-05, T-07 e R-09, docs/PRD.md RF-417,
-- RF-601, RF-604, RF-606, RF-610 e RF-707.
--
-- Cinco rotinas produzem discagem: fala-rápido (RF-610), lembrete de reunião
-- (RF-601), resgate de falta (RF-604), cadência (RF-606) e campanha (RF-707).
-- Sem uma fila só, cada uma inventa o próprio formato de idempotência, a
-- própria leitura de `max_concurrent` e o próprio jeito de não discar duas
-- vezes — e é assim que o laço de automação de R-09 vira custo. Quatro
-- decisões que a tabela carrega:
--
-- 1. **O único em (account_id, source, source_ref, attempt) é o freio de
--    R-09**, e não um detalhe de higiene. São três acidentes reais que ele
--    barra de uma vez: o intake que recebe o mesmo lead duas vezes, a cadência
--    que reinscreve quem já está inscrito, e o lead com dois telefones que
--    duas rotinas leem como dois alvos. Com o único, a segunda inscrição é um
--    `on conflict do nothing` e a conta não descobre pela fatura.
-- 2. **`source` é lista fechada de seis, e as fatias futuras já entram**
--    (T-07). `manual` e `stl` são as duas da F2; `rem`, `rescue`, `cad` e
--    `camp` chegam na F5, F6 e F7. Entram agora porque a unicidade só vale se
--    o formato for o mesmo desde o começo: fonte que aparecesse depois com
--    outro formato de `source_ref` teria uma janela em que a mesma discagem
--    cabe duas vezes na fila, uma por formato, e o freio não pegaria nenhuma
--    das duas. Os seis prefixos são exatamente os que T-07 nomeia para
--    `calls.idempotency_key`, e a coincidência é de propósito: a chave da
--    chamada se lê da linha da fila sem tradutor no meio do caminho.
-- 3. **`attempt` faz parte do único** porque retentativa é discagem nova, e
--    não a mesma de novo. A política de RF-417 reprograma o mesmo alvo depois
--    de não atender; sem `attempt` na chave, a segunda tentativa colidiria com
--    a primeira e a reprogramação seria silenciosamente descartada. Começa em
--    1, e não em 0, para a linha se ler como "primeira tentativa".
-- 4. **Classe Servidor da seção 3.9: membro lê, ninguém escreve pelo
--    cliente.** Quem enfileira são as rotinas produtoras, com o segredo de
--    serviço, e quem consome é só `cron-dial`, com `for update skip locked`
--    (L-14). Uma política de insert de cliente daria à conta o poder de
--    enfileirar discagem sem passar por rotina nenhuma — e, como a fila é o
--    que alimenta a guarda, enfileirar por fora é discar por fora. Ler é de
--    todo membro, porque é a fila que responde "por que a Sarah ainda não
--    ligou para este lead".

create table public.dial_queue (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- Para quem se vai ligar. Nulo quando o destino é número de teste, que não é
  -- lead de ninguém — é o caso do discador manual enquanto o portão da fatia
  -- está fechado (L-03). Cascata pelo motivo de `call_attempts.lead_id`:
  -- RF-808 apaga todos os dados do lead, e uma discagem pendente para ele é
  -- dado dele tanto quanto a transcrição é.
  lead_id uuid references public.leads (id) on delete cascade,
  -- Com qual roteiro. Os mesmos quatro de `calls.purpose`, porque é este valor
  -- que `cron-dial` passa adiante para `call-place` escolher a publicação do
  -- provedor (US-041). Propósito novo entra nas duas tabelas juntas, senão a
  -- fila aceita um pedido que a chamada não sabe registrar.
  purpose text not null
    check (purpose in ('discovery', 'reminder', 'rescue', 'followup')),
  -- Quando a discagem pode sair. `now()` é o padrão do fala-rápido, que quer a
  -- ligação já; o lembrete e a cadência escrevem um instante à frente. É a
  -- coluna que `cron-dial` compara a cada minuto, e por isso ela fecha o
  -- índice da fila.
  run_at timestamptz not null default now(),
  -- Qual rotina pediu, em lista fechada de seis (T-07). `manual` é o discador
  -- de gente; `stl` é o fala-rápido; `rem` é o lembrete de reunião; `rescue` é
  -- o resgate de falta atestada; `cad` é a cadência; `camp` é a campanha. As
  -- quatro últimas são de fatias futuras e entram agora de propósito: a
  -- unicidade por fonte só vale se o formato for o mesmo desde o começo.
  --
  -- É lista fechada, ao contrário de `call_attempts.source`, e a diferença tem
  -- razão: lá a coluna é rastro, e nomear a rotina nova a mais não estraga
  -- registro nenhum; aqui a coluna é metade de uma chave de idempotência, e
  -- fonte inventada pela borda é uma discagem que o freio de R-09 não enxerga.
  source text not null
    check (source in ('manual', 'stl', 'rem', 'rescue', 'cad', 'camp')),
  -- O identificador do lado de fora, no formato que cada fonte declara em
  -- T-07: o uuid gerado no cliente para `manual`, o lead para `stl`, a reunião
  -- para `rem`, reunião e ordinal para `rescue`, inscrição e passo para `cad`,
  -- alvo e tentativa para `camp`. Texto, e não uuid, porque três dos seis
  -- formatos são compostos. Vazio seria uma chave que não identifica nada, e
  -- todas as discagens da mesma fonte colidiriam entre si.
  source_ref text not null check (length(btrim(source_ref)) > 0),
  -- Qual tentativa desta mesma discagem, a partir de 1. Retentativa de RF-417
  -- é linha nova com `attempt` maior, e não update da linha velha: a fila
  -- guarda o que foi tentado, e sobrescrever apagaria a primeira recusa.
  attempt integer not null default 1 check (attempt >= 1),
  -- Onde o item está. `queued` espera a vez; `claimed` foi tomado por uma
  -- passagem de `cron-dial` e ainda não terminou; `done` virou chamada;
  -- `failed` esbarrou em erro que a rotina não resolve; `canceled` foi retirado
  -- antes de discar — pela parada de emergência, pelo bloqueio que chegou
  -- depois ou pelo lead que saiu do funil.
  status text not null default 'queued'
    check (status in ('queued', 'claimed', 'done', 'failed', 'canceled')),
  -- Quando a passagem tomou o item. Nulo enquanto ele espera. É o que permite
  -- a `cron-call-recovery` reconhecer o item tomado por uma execução que
  -- morreu no meio, sem o qual ele ficaria `claimed` para sempre.
  claimed_at timestamptz,
  -- Qual chamada nasceu deste item. Nulo até `call-place` gravar a chamada.
  -- `on delete set null` e nunca cascata: apagar a chamada não pode apagar a
  -- memória de que esta discagem já foi pedida — sem a linha, a rotina
  -- produtora enfileira o mesmo alvo na passagem seguinte, e o freio de R-09
  -- deixa de ter o que comparar.
  call_id uuid references public.calls (id) on delete set null,
  -- Por que o item falhou, em texto livre: a mensagem do provedor ou o motivo
  -- de recusa da guarda. Quem transforma isso em contagem é `call_attempts`,
  -- que grava o motivo em lista fechada; aqui é o texto que alguém lê quando
  -- vai investigar um item parado.
  last_error text,
  created_at timestamptz not null default now()
);

comment on table public.dial_queue is
  'Fila única de discagem (L-14, seção 3.7): as cinco rotinas produtoras escrevem, só cron-dial consome, com for update skip locked. Classe Servidor da seção 3.9 — membro lê, ninguém escreve pelo cliente. O único por fonte é o freio do laço de automação de R-09.';

comment on column public.dial_queue.lead_id is
  'Para quem se vai ligar. Nulo quando o destino é número de teste, que não é lead de ninguém. Cascata porque RF-808 apaga todos os dados do lead, e discagem pendente para ele é dado dele.';

comment on column public.dial_queue.purpose is
  'Com qual roteiro, nos mesmos quatro valores de calls.purpose: é este valor que call-place usa para escolher a publicação do provedor (US-041). Propósito novo entra nas duas tabelas juntas.';

comment on column public.dial_queue.run_at is
  'Quando a discagem pode sair. É a coluna que cron-dial compara a cada minuto, e por isso ela fecha o índice da fila.';

comment on column public.dial_queue.source is
  'Qual rotina pediu, em lista fechada de seis (T-07): manual, stl, rem, rescue, cad e camp. As de fatias futuras entram desde já porque a unicidade por fonte só vale se o formato for o mesmo desde o começo.';

comment on column public.dial_queue.source_ref is
  'O identificador do lado de fora, no formato que cada fonte declara em T-07. Texto porque três dos seis formatos são compostos; vazio seria chave que não identifica nada.';

comment on column public.dial_queue.attempt is
  'Qual tentativa desta mesma discagem, a partir de 1. Retentativa de RF-417 é linha nova com attempt maior, não update da linha velha.';

comment on column public.dial_queue.status is
  'Onde o item está: queued espera, claimed foi tomado por uma passagem de cron-dial, done virou chamada, failed esbarrou em erro e canceled foi retirado antes de discar.';

comment on column public.dial_queue.claimed_at is
  'Quando a passagem tomou o item, nulo enquanto ele espera. É por ele que cron-call-recovery reconhece item tomado por execução que morreu no meio.';

comment on column public.dial_queue.call_id is
  'A chamada que nasceu deste item. on delete set null e nunca cascata: apagar a chamada não pode apagar a memória de que a discagem já foi pedida, senão a rotina produtora reenfileira o mesmo alvo.';

comment on column public.dial_queue.last_error is
  'Por que o item falhou, em texto livre. Quem transforma motivo em contagem é call_attempts, com lista fechada; aqui é o texto de quem vai investigar.';

-- O freio de R-09 -------------------------------------------------------------------
-- Intake duplicado, cadência que reinscreve e lead com dois telefones deixam de
-- virar duas ligações. A produtora escreve com `on conflict do nothing` e não
-- precisa ler antes: a mesma correção que T-07 pede para `calls.idempotency_key`.
alter table public.dial_queue
  add constraint dial_queue_unica_por_fonte
    unique (account_id, source, source_ref, attempt);

comment on constraint dial_queue_unica_por_fonte on public.dial_queue is
  'O freio do laço de automação (R-09, L-14): a mesma discagem, pedida pela mesma fonte, entra uma vez só. attempt está na chave porque retentativa de RF-417 é discagem nova, e sem ele a reprogramação seria descartada em silêncio.';

-- A consulta de cron-dial ----------------------------------------------------------
-- Índice parcial porque a fila é curta e o histórico é longo: `done` e
-- `canceled` ficam na tabela para a idempotência continuar valendo, e o índice
-- que os incluísse cresceria para sempre por causa de linhas que a consulta do
-- minuto nunca olha. `status` entra na chave mesmo com o predicado que o fixa
-- para a consulta poder ser servida só pelo índice.
create index dial_queue_pronta_para_discar
  on public.dial_queue (account_id, status, run_at)
  where status = 'queued';

comment on index public.dial_queue_pronta_para_discar is
  'A consulta que cron-dial faz a cada minuto: itens queued da conta com run_at vencido, tomados com for update skip locked (L-14). Parcial porque done e canceled ficam na tabela pela idempotência e a consulta do minuto nunca os olha.';

-- Isolamento (classe Servidor da seção 3.9) ----------------------------------------
alter table public.dial_queue enable row level security;

create policy dial_queue_leitura_de_membro
  on public.dial_queue for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy dial_queue_leitura_de_membro on public.dial_queue is
  'Classe Servidor: membro lê a fila da própria conta, inclusive o viewer — é ela que responde por que a Sarah ainda não ligou para um lead. Não há política de insert, update nem delete, nem para o owner: quem enfileira são as rotinas produtoras e quem consome é só cron-dial, e enfileirar por fora da rotina é discar por fora da guarda.';

-- Sem `updated_at` e sem gatilho de auditoria, pelo motivo declarado para
-- `calls`: o item da fila muda de estado várias vezes por ligação, sempre por
-- rotina e nunca por gente, e a trilha teria dezenas de linhas por discagem
-- sem autor humano nenhuma. A decisão que precisa de autor é a de discar, e
-- essa `call_attempts` registra.
