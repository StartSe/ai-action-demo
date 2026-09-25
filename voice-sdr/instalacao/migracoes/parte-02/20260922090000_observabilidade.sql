-- Observabilidade: a última execução de cada rotina (L-13, RF-613) e a cadeia
-- de toda chamada externa por identificador de chamada telefônica (RNF-16).
-- Referência: docs/PRD-implementacao.md seções 3.8, 3.9 e 4.6,
-- docs/revisao-tecnica.md L-13, docs/PRD.md RF-613 e RNF-16.
--
-- São duas tabelas e não uma, e a separação é o conteúdo de L-13: `job_runs`
-- responde "esta rotina ainda roda?" e `integration_events` responde "o que o
-- provedor devolveu nesta ligação?". Misturadas, a consulta do painel de saúde
-- passaria a varrer milhares de linhas de chamada externa para achar as
-- dezenas de execução — e rotina silenciosamente morta é o defeito mais
-- difícil de perceber nesta categoria justamente porque ninguém repara na
-- ausência de uma linha no meio de muitas.
--
-- As duas são da classe Servidor da seção 3.9: membro lê a própria conta, e
-- não há política de escrita de cliente. Quem escreve são as rotinas e as
-- funções de borda, com o segredo de serviço.

-- job_runs ---------------------------------------------------------------------
create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  -- NULÁVEL, e a razão é estrutural: a execução de uma rotina atravessa
  -- contas. `cron-dial` acorda uma vez por minuto para a instalação inteira e
  -- processa as contas que têm item na fila. São duas linhas de natureza
  -- diferente, e a tabela guarda as duas: a da instalação, com conta nula,
  -- diz que a rotina acordou; a da conta, uma por conta processada, diz o que
  -- a passagem fez lá dentro.
  --
  -- A consequência de isolamento está escrita e conferida por teste: a
  -- política é `is_member(account_id)`, e `is_member(null)` é falso, então a
  -- linha da instalação não é visível para cliente nenhum — nem para o dono da
  -- conta, nem para a conta vizinha. Quem a lê é o operador da instalação, com
  -- o segredo de serviço. Pôr `not null` aqui obrigaria a rotina a inventar
  -- uma conta para a passagem que não é de ninguém.
  account_id uuid references public.accounts (id) on delete cascade,
  -- O nome da rotina, como ele aparece na tabela de 4.6: `cron-dial`,
  -- `cron-retention`, `cron-cost-sync`. Texto livre e não lista fechada, ao
  -- contrário de `dial_queue.source`: aqui a coluna é rastro, e rotina nova
  -- que aparecesse a mais no painel não estraga registro nenhum, enquanto uma
  -- lista fechada faria a rotina nova falhar ao gravar o próprio início — a
  -- pior hora para descobrir um check.
  routine text not null check (length(btrim(routine)) > 0),
  -- A rotina grava o início antes de trabalhar, senão a execução que morre no
  -- meio não deixa linha nenhuma e a morte fica invisível, que é exatamente o
  -- defeito que RF-613 quer expor.
  started_at timestamptz not null default now(),
  -- Nulo enquanto a passagem corre. Nulo antigo é execução que morreu no meio,
  -- e é isso que o alarme de "rotina sem execução na janela esperada" lê.
  finished_at timestamptz,
  items integer not null default 0 check (items >= 0),
  -- Nulo é sucesso. O texto é a mensagem do erro que derrubou a passagem, e a
  -- tela de saúde mostra o último de cada rotina ao lado da última execução.
  error text,
  check (finished_at is null or finished_at >= started_at)
);

comment on table public.job_runs is
  'Uma linha por execução de rotina de fundo (L-13, RF-613). A linha da instalação tem conta nula; a rotina grava também uma linha por conta processada. Classe Servidor: membro lê a própria conta, ninguém escreve pelo cliente.';

comment on column public.job_runs.account_id is
  'Nulo de propósito: a execução de uma rotina atravessa contas, e a passagem da instalação não é de conta nenhuma. is_member(null) é falso, então a linha de conta nula não é visível para cliente nenhum — quem a lê é o operador da instalação, com o segredo de serviço.';

comment on column public.job_runs.routine is
  'O nome da rotina como ele aparece na seção 4.6. Texto livre e não lista fechada: rotina nova não pode falhar ao gravar o próprio início.';

comment on column public.job_runs.finished_at is
  'Nulo enquanto a passagem corre. Nulo antigo é execução que morreu no meio, e é por ele que o alarme de rotina parada enxerga a morte.';

comment on column public.job_runs.error is
  'Nulo é sucesso. É o último erro que a tela de saúde mostra ao lado da última execução (RF-613).';

-- A consulta de "última execução de cada rotina" é a razão deste índice: o
-- painel de saúde pergunta pela rotina e quer a linha mais recente, sem filtro
-- de conta — a linha da instalação e as das contas entram juntas. Sem ele, a
-- consulta varre a tabela inteira, que é a que mais cresce por tempo.
create index job_runs_ultima_execucao_idx
  on public.job_runs (routine, started_at desc);

comment on index public.job_runs_ultima_execucao_idx is
  'A consulta do painel de saúde (RF-613): a última execução de cada rotina. Sem filtro de conta, porque a passagem da instalação tem conta nula.';

-- integration_events -----------------------------------------------------------
create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- `outbound` é chamada que a instalação fez; `inbound` é webhook que chegou.
  -- Sem a direção, a cadeia de uma ligação vira uma lista de linhas sem quem
  -- falou primeiro.
  direction text not null check (direction in ('outbound', 'inbound')),
  -- Quem está do outro lado, pelo nome curto: o provedor de telefonia, o de
  -- calendário, o de e-mail. Texto livre pelo motivo de `routine`.
  provider text not null check (length(btrim(provider)) > 0),
  -- O caminho chamado, sem o endereço do provedor: o que interessa na cadeia é
  -- qual operação foi pedida, e o endereço é o mesmo em todas as linhas do
  -- mesmo provedor.
  endpoint text not null check (length(btrim(endpoint)) > 0),
  request jsonb not null default '{}'::jsonb
    check (jsonb_typeof(request) = 'object'),
  response jsonb not null default '{}'::jsonb
    check (jsonb_typeof(response) = 'object'),
  -- Nulo quando a chamada nem chegou a ter resposta: tempo esgotado, conexão
  -- recusada. É diferente de 500, e a diferença importa para o disjuntor.
  status_code integer check (status_code between 100 and 599),
  latency_ms integer check (latency_ms >= 0),
  -- O identificador da chamada telefônica a que esta ida ao provedor pertence.
  -- É por ele que "consulta por identificador de chamada devolve a cadeia
  -- completa" (RNF-16) é verdade, e é a metade do índice abaixo. Nulo quando a
  -- chamada externa não nasce de ligação nenhuma — a sincronização de agenda e
  -- a busca de preço são desse tipo.
  correlation_id text,
  at timestamptz not null default now()
);

comment on table public.integration_events is
  'Uma linha por chamada externa (RNF-16), e SÓ chamada externa: execução de rotina mora em job_runs, e misturar as duas confunde a consulta do painel de saúde, que é o motivo de L-13. Classe Servidor: membro lê a própria conta, ninguém escreve pelo cliente.';

comment on column public.integration_events.direction is
  'outbound é chamada que a instalação fez; inbound é webhook que chegou. Sem ela, a cadeia da ligação não diz quem falou primeiro.';

comment on column public.integration_events.endpoint is
  'O caminho chamado, sem o endereço do provedor: o que a cadeia precisa saber é qual operação foi pedida.';

comment on column public.integration_events.status_code is
  'Nulo quando a chamada não chegou a ter resposta — tempo esgotado ou conexão recusada. É diferente de 500, e a diferença importa para o disjuntor.';

comment on column public.integration_events.correlation_id is
  'O identificador da chamada telefônica a que esta ida ao provedor pertence. Nulo quando a chamada externa não nasce de ligação nenhuma, como a sincronização de agenda e a busca de preço.';

-- O índice que faz RNF-16 valer: dado o identificador da chamada, a cadeia
-- completa sai numa varredura de índice. `account_id` vem primeiro porque toda
-- consulta é de dentro de uma conta e a política já filtra por ela.
create index integration_events_correlacao_idx
  on public.integration_events (account_id, correlation_id);

comment on index public.integration_events_correlacao_idx is
  'O que faz "consulta por identificador de chamada devolve a cadeia completa" (RNF-16) ser verdade sem varrer o histórico da conta.';

-- Redação antes de gravar --------------------------------------------------------
-- `request` e `response` guardam o que foi mandado e o que voltou, e é aí que
-- mora o cabeçalho de autorização, a chave de api do provedor e o identificador
-- de conta do lado de fora. Gravar um desses em claro transforma o registro de
-- observabilidade num segundo cofre, sem nenhuma das travas do primeiro.
--
-- A regra é sobre o NOME DA CHAVE, como a de `redigir_auditoria`, e pelo mesmo
-- motivo: provedor novo nasce coberto, sem ninguém precisar lembrar de
-- acrescentar o campo dele a uma lista. O erro possível aqui é redigir demais —
-- uma chave inocente cujo nome contenha um dos termos —, e esse é o lado certo
-- do erro num registro que existe para depurar, não para guardar segredo.
--
-- A função desce por objetos e listas: o cabeçalho de autorização mora dentro
-- de `headers`, e uma versão que só olhasse o primeiro nível deixaria em claro
-- exatamente o caso mais comum.
create or replace function public.redigir_evento_externo(dado jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $redacao$
declare
  v_chave text;
  v_saida jsonb;
begin
  if dado is null then
    return null;
  end if;

  if jsonb_typeof(dado) = 'object' then
    v_saida := '{}'::jsonb;
    for v_chave in select chave from jsonb_object_keys(dado) as chave loop
      v_saida := v_saida || jsonb_build_object(
        v_chave,
        case
          when v_chave ~* '(token|secret|senha|password|authorization|api[_-]?key|sid)'
            then to_jsonb('[redigido]'::text)
          else public.redigir_evento_externo(dado -> v_chave)
        end
      );
    end loop;
    return v_saida;
  end if;

  if jsonb_typeof(dado) = 'array' then
    return coalesce(
      (
        select jsonb_agg(public.redigir_evento_externo(item) order by ordem)
          from jsonb_array_elements(dado) with ordinality as lista(item, ordem)
      ),
      '[]'::jsonb
    );
  end if;

  return dado;
end;
$redacao$;

comment on function public.redigir_evento_externo(jsonb) is
  'Troca por [redigido] o valor de toda chave cujo nome indique segredo, em qualquer profundidade do objeto. A regra é sobre o nome da chave para que provedor novo nasça coberto.';

create or replace function public.redigir_evento_de_integracao()
returns trigger
language plpgsql
set search_path = ''
as $gatilho$
begin
  new.request := public.redigir_evento_externo(new.request);
  new.response := public.redigir_evento_externo(new.response);
  return new;
end;
$gatilho$;

comment on function public.redigir_evento_de_integracao() is
  'Gatilho before insert or update: aplica a redação antes de a linha entrar. No update também, porque a rotina que completa o evento com a resposta escreve depois do insert.';

-- `before`, e não `after` com update: em `after` a linha já estaria gravada em
-- claro, e um registro que existiu em claro por um instante já vazou para a
-- replicação e para o log de escrita.
create trigger integration_events_redacao
  before insert or update of request, response on public.integration_events
  for each row execute function public.redigir_evento_de_integracao();

-- Isolamento (classe Servidor da seção 3.9) --------------------------------------
alter table public.job_runs enable row level security;
alter table public.integration_events enable row level security;

create policy job_runs_leitura_de_membro
  on public.job_runs for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy job_runs_leitura_de_membro on public.job_runs is
  'Classe Servidor: membro lê as execuções que tocaram a própria conta. A linha da instalação tem conta nula e is_member(null) é falso, então ela fica fora — de propósito. Não há política de escrita: quem grava são as rotinas, com o segredo de serviço.';

create policy integration_events_leitura_de_membro
  on public.integration_events for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy integration_events_leitura_de_membro on public.integration_events is
  'Classe Servidor: membro lê a cadeia de chamadas externas da própria conta (RNF-16). Não há política de escrita: quem grava são as funções de borda, com o segredo de serviço.';

-- Sem `updated_at` e sem gatilho de auditoria, pelo motivo declarado para
-- `dial_queue`: as duas são escritas por rotina e nunca por gente, e a trilha
-- teria uma linha sem autor humano para cada passagem de cada minuto.
