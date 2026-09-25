-- O registro de cada ferramenta que a Sarah acionou, e a chamada em curso sem a
-- transcrição junto (seção 3.5, T-02, R-08).
-- Referência: docs/PRD-implementacao.md seções 3.5, 3.9, 4.6 e 5,
-- docs/revisao-tecnica.md T-02, T-03 e R-08, docs/PRD.md seção 9 e RF-419.
--
-- Duas tabelas na mesma migração porque as duas são o que a chamada emite
-- enquanto acontece: uma guarda o que foi acionado, a outra guarda onde a
-- ligação está. Quatro decisões que elas carregam:
--
-- 1. **`tool` é lista fechada de dez, e o prefixo `system:` é o que separa
--    quem executou** (T-02). As sete são as nossas, as três com prefixo são as
--    ferramentas do provedor — `end_call`, `transfer_to_number` e
--    `voicemail_detection` —, que nós não chamamos: `call-finalize` as lê da
--    transcrição depois que a ligação terminou. Sem o prefixo, `transfer` do
--    provedor e `tool-transfer` nossa ficariam indistinguíveis no mesmo
--    relatório, e a pergunta "a transferência chegou a acontecer?" perderia a
--    resposta — a nossa só decide para onde transferir, quem transfere é a do
--    provedor.
-- 2. **Único em (call_id, tool, at)**, que é a idempotência de
--    `call-finalize`. A finalização pode rodar duas vezes — a via dupla da
--    seção 4.2 é o aviso do provedor mais a varredura periódica, e RNF-06
--    exige que as duas passagens deem o mesmo resultado. Ler a mesma
--    transcrição de novo encontra as mesmas invocações de sistema; sem o
--    único, cada leitura acrescentaria uma cópia e a ficha mostraria a Sarah
--    transferindo a ligação três vezes.
-- 3. **`call_live` é TABELA FINA MANTIDA POR GATILHO, e não visão** (R-08). A
--    assinatura em tempo real do Supabase observa tabela — ela lê a replicação
--    lógica, e visão não é replicada —, então uma visão fina resolveria o
--    tamanho da linha e não teria quem a emitisse. O gatilho em `calls` é o
--    que faz a linha existir para a replicação enxergar.
-- 4. **A transcrição nunca entra em `call_live`**, e a garantia é de duas
--    camadas: nenhuma coluna guarda texto de conversa, e o gatilho é
--    `update of` com a lista das colunas espelhadas — update que só mexe em
--    `calls.transcript` não o dispara, e portanto não emite nada. Sem a lista,
--    cada pedaço de transcrição que chegasse reescreveria a linha com valores
--    idênticos e mandaria um evento por turno de conversa para cada navegador
--    aberto na tela de acompanhamento.

-- A invocação de ferramenta ----------------------------------------------------
create table public.call_tool_invocations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- De qual chamada. `not null` porque invocação sem chamada não se lê: o
  -- contexto inteiro da ferramenta (quem era o lead, qual o propósito, o que
  -- foi dito antes) mora na chamada. Cascata pelo motivo de `call_costs`:
  -- `calls` já cascateia do lead, e uma restrição aqui travaria RF-808.
  call_id uuid not null references public.calls (id) on delete cascade,
  -- As sete nossas (docs/PRD.md seção 9) e as três do provedor, prefixadas
  -- (T-02, T-03). Lista fechada: ferramenta fora dela não é ferramenta nova, é
  -- defeito — nenhuma tela sabe rotulá-la, e a contagem por ferramenta do
  -- relatório passaria a ter uma fatia sem nome. Ferramenta nova é fatia nova,
  -- com migração, e não string inventada pela borda.
  tool text not null check (tool in (
    'tool-availability', 'tool-book-meeting', 'tool-confirm-meeting',
    'tool-reschedule', 'tool-qualify', 'tool-transfer', 'tool-dnc',
    'system:end_call', 'system:transfer_to_number', 'system:voicemail_detection'
  )),
  -- O que entrou e o que saiu. Objeto nos dois, pelo motivo de
  -- `calls.transcript`: forma que varia entre quem escreve em momentos
  -- diferentes vira consulta com `case` em toda leitura.
  request jsonb not null default '{}'::jsonb
    check (jsonb_typeof(request) = 'object'),
  response jsonb not null default '{}'::jsonb
    check (jsonb_typeof(response) = 'object'),
  -- Quanto demorou. Nulo nas três do provedor, que nós não cronometramos: a
  -- invocação delas é lida da transcrição depois do fim da ligação, e inventar
  -- zero ali faria o p95 de RNF-03 melhorar sozinho a cada caixa postal.
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  -- O que deu errado, quando deu. Nulo é o caso normal; texto em branco, não:
  -- string vazia aqui seria erro que existe e não diz qual, e a consulta de
  -- `error is not null` passaria a contá-lo como falha sem causa.
  error text check (error is null or length(btrim(error)) > 0),
  -- Quando a ferramenta foi acionada. Entra no único, e por isso tem padrão:
  -- `at` ausente deixaria duas invocações da mesma ferramenta indistinguíveis.
  at timestamptz not null default now(),
  -- A idempotência de `call-finalize`. Ver a decisão 2 no cabeçalho.
  constraint call_tool_invocations_unica unique (call_id, tool, at),
  -- A chamada e a conta juntas, pelo motivo da chave composta de `call_costs`:
  -- com duas simples, uma invocação da conta B se penduraria numa chamada da
  -- conta A e apareceria na ficha de quem não a acionou.
  constraint call_tool_invocations_da_chamada_da_conta
    foreign key (call_id, account_id)
    references public.calls (id, account_id) on delete cascade
);

comment on table public.call_tool_invocations is
  'Cada ferramenta que a Sarah acionou durante a chamada, as nossas sete e as três do provedor prefixadas com system: (T-02, T-03). Classe Servidor da seção 3.9: membro lê, ninguém escreve pelo cliente — quem grava são as próprias ferramentas e call-finalize, que lê as de sistema da transcrição. O único por (call_id, tool, at) é o que faz reler a mesma transcrição não duplicar invocação.';

comment on column public.call_tool_invocations.tool is
  'A ferramenta acionada, em lista fechada de dez. O prefixo system: separa o que o provedor executou (end_call, transfer_to_number, voicemail_detection) do que executamos: tool-transfer decide para onde transferir, e quem transfere é system:transfer_to_number. Sem o prefixo, as duas ficariam indistinguíveis no relatório e a pergunta "a transferência chegou a acontecer?" perderia a resposta.';

comment on column public.call_tool_invocations.latency_ms is
  'Quanto a ferramenta demorou, para o p95 de RNF-03. Nulo nas três do provedor, que não cronometramos: a invocação delas é lida da transcrição depois do fim da ligação, e inventar zero faria o percentil melhorar sozinho a cada caixa postal.';

comment on column public.call_tool_invocations.error is
  'O que deu errado, quando deu. Nulo é o caso normal; em branco é recusado, porque erro que existe e não diz qual vira falha sem causa na contagem de error is not null.';

comment on column public.call_tool_invocations.at is
  'Quando a ferramenta foi acionada. Entra no único, e por isso não é nula: sem ela, duas invocações da mesma ferramenta na mesma chamada seriam indistinguíveis.';

comment on constraint call_tool_invocations_unica on public.call_tool_invocations is
  'A idempotência de call-finalize (RNF-06): a finalização roda por duas vias — o aviso do provedor e a varredura periódica — e reler a mesma transcrição encontra as mesmas invocações de sistema. Sem o único, a ficha mostraria a Sarah transferindo a ligação três vezes.';

comment on constraint call_tool_invocations_da_chamada_da_conta on public.call_tool_invocations is
  'A invocação pertence à chamada e à conta dela. Chave composta em vez de duas simples pelo motivo de call_costs: duas simples deixariam uma linha da conta B pendurada numa chamada da conta A, visível na ficha de quem não a acionou.';

-- Sem índice além do único: a leitura desta tabela é "as invocações desta
-- chamada, em ordem", e `call_tool_invocations_unica` já começa por `call_id`.
-- Índice a mais aqui custaria escrita em toda ferramenta acionada, durante a
-- ligação, para uma consulta que ninguém faz.

-- A chamada em curso, fina (R-08) ----------------------------------------------
create table public.call_live (
  -- A chave é a própria chamada: uma ligação está em um lugar só. Cascata
  -- porque a linha é espelho, e espelho de chamada apagada não aponta para
  -- nada.
  call_id uuid primary key references public.calls (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- As seis colunas de R-08, e nenhuma a mais. Acrescentar coluna aqui é
  -- decisão sobre o que trafega em toda atualização de toda chamada em curso,
  -- para todo navegador aberto na tela de acompanhamento — e por isso o teste
  -- cobra o conjunto exato, e não só a ausência de `transcript`.
  status text not null,
  purpose text not null,
  lead_id uuid,
  started_at timestamptz not null,
  duration_sec integer,
  -- A chamada e a conta juntas, pelo motivo de `call_tool_invocations`: a
  -- assinatura filtra por `account_id`, e uma linha sob a conta errada seria
  -- chamada de outra empresa aparecendo na tela de acompanhamento.
  constraint call_live_da_chamada_da_conta
    foreign key (call_id, account_id)
    references public.calls (id, account_id) on delete cascade
);

comment on table public.call_live is
  'A chamada em curso, fina, para a assinatura em tempo real (R-08). TABELA mantida por gatilho em calls, e NÃO visão: a assinatura do Supabase lê a replicação lógica, e visão não é replicada — uma visão fina resolveria o tamanho da linha e não teria quem a emitisse. A transcrição nunca entra aqui, e é essa a razão da tabela existir: calls.transcript cresce a dezenas de KB e cada atualização carregaria a linha inteira. A ficha carrega a transcrição por consulta. Classe Servidor da seção 3.9: membro lê, ninguém escreve pelo cliente — quem escreve é o gatilho.';

comment on column public.call_live.status is
  'Onde a chamada está: queued, ringing ou in_progress. Só os três estados vivos aparecem nesta tabela — o gatilho apaga a linha em ended e failed, porque a assinatura é da tela de acompanhamento e não do histórico.';

comment on column public.call_live.duration_sec is
  'Espelho de calls.duration_sec. Nulo enquanto a ligação não tem duração medida, que é o caso comum de quem ainda está falando.';

comment on constraint call_live_da_chamada_da_conta on public.call_live is
  'A linha viva pertence à chamada e à conta dela. A assinatura filtra por account_id, e uma linha sob a conta errada seria chamada de outra empresa na tela de acompanhamento de quem não a fez.';

-- O índice da assinatura: a tela pede as chamadas vivas da conta, e a política
-- de leitura recorta pela mesma coluna. A tabela é pequena por construção — só
-- ligação em curso cabe nela — mas a consulta é repetida por navegador aberto.
create index call_live_da_conta on public.call_live (account_id);

comment on index public.call_live_da_conta is
  'As chamadas vivas de uma conta, que é a consulta da tela de acompanhamento e o recorte da política de leitura.';

-- O gatilho que mantém o espelho -----------------------------------------------
-- `update of` com a lista das colunas espelhadas, e não `update` seco: é essa
-- lista que faz um update de `calls.transcript` não disparar nada (R-08). Sem
-- ela, cada pedaço de transcrição que chegasse reescreveria a linha com valores
-- idênticos e emitiria um evento por turno de conversa.
--
-- `after`, e não `before`: o espelho só se escreve depois que a chamada mudou
-- de fato, senão um erro posterior no mesmo comando deixaria a tela mostrando
-- um estado que o banco desfez.
create or replace function public.espelhar_chamada_viva()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('queued', 'ringing', 'in_progress') then
    insert into public.call_live
      (call_id, account_id, status, purpose, lead_id, started_at, duration_sec)
    values
      (new.id, new.account_id, new.status, new.purpose, new.lead_id,
       new.started_at, new.duration_sec)
    on conflict (call_id) do update
      set account_id = excluded.account_id,
          status = excluded.status,
          purpose = excluded.purpose,
          lead_id = excluded.lead_id,
          started_at = excluded.started_at,
          duration_sec = excluded.duration_sec;
  else
    -- Saiu dos estados vivos: a linha some. A tela de acompanhamento não é o
    -- histórico, e chamada encerrada que ficasse aqui faria a lista crescer
    -- para sempre, carregando o passado inteiro em cada assinatura nova.
    delete from public.call_live where public.call_live.call_id = new.id;
  end if;

  return null;
end;
$$;

comment on function public.espelhar_chamada_viva() is
  'Mantém call_live a partir de calls (R-08): escreve a linha enquanto a chamada está em queued, ringing ou in_progress, e a apaga em ended e failed. Registrado com update of sobre as colunas espelhadas, para que um update de transcript não dispare nada.';

create trigger calls_espelha_chamada_viva
  after insert or update of
    account_id, status, purpose, lead_id, started_at, duration_sec
  on public.calls
  for each row execute function public.espelhar_chamada_viva();

-- A assinatura em tempo real ---------------------------------------------------
-- No Supabase gerenciado, a tabela precisa estar na publicação
-- `supabase_realtime` para que a replicação lógica a emita. No PGlite dos testes
-- a publicação não existe, e criar uma aqui só para o teste seria esquema que o
-- produto não tem — por isso o `do` condicional: onde a publicação existe, a
-- tabela entra; onde não existe, a migração segue.
do $publicacao$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.call_live';
  end if;
end;
$publicacao$;

-- Isolamento (classe Servidor da seção 3.9) ------------------------------------
alter table public.call_tool_invocations enable row level security;

create policy call_tool_invocations_leitura_de_membro
  on public.call_tool_invocations for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy call_tool_invocations_leitura_de_membro on public.call_tool_invocations is
  'Classe Servidor: membro lê as invocações das chamadas da própria conta, inclusive o viewer — é por elas que a ficha mostra o que a Sarah acionou. Não há política de insert, update nem delete, nem para o owner: escrever aqui pelo cliente seria inventar que uma ferramenta rodou, e apagar seria esconder que rodou.';

alter table public.call_live enable row level security;

create policy call_live_leitura_de_membro
  on public.call_live for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy call_live_leitura_de_membro on public.call_live is
  'Classe Servidor: membro lê as chamadas vivas da própria conta, que é o que a assinatura em tempo real entrega para a tela de acompanhamento. Não há política de escrita: quem mantém a linha é o gatilho em calls, e um insert de cliente faria aparecer na tela uma ligação que não existe.';

-- Sem gatilho de auditoria e sem `updated_at` nas duas, pela razão declarada em
-- `calls`: são tabelas de servidor, escritas dezenas de vezes por ligação e sem
-- autor humano. `call_live` em particular não tem sequer história — ela existe
-- enquanto a chamada está no ar e some quando termina.
