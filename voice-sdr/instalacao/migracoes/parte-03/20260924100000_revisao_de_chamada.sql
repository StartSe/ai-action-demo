-- A revisão da chamada (US-245): o ciclo que transforma uma ligação ouvida em
-- melhoria do roteiro, sem ninguém reescrever texto à mão.
--
-- O ciclo tem quatro paradas, e cada uma é um estado de `call_reviews`:
--
--   1. `questions`  o modelo leu a conversa e devolveu o que não consegue
--                   decidir sozinho. Quem responde é quem administra a conta.
--   2. `proposed`   com as respostas na mão, o modelo escreveu as mudanças.
--                   Cada uma se aceita, se recusa ou se questiona.
--   3. `applied`    o que foi aceito virou rascunho de versão.
--   4. `discarded`  a revisão morreu sem aplicar nada.
--
-- **A revisão não põe nada no ar.** O que ela escreve é `playbook_versions` em
-- `draft`, pelo mesmo caminho de `playbook-draft`: versão é linha, nenhuma
-- existente é tocada, e o que está no ar continua no ar até alguém publicar
-- pela tela (RF-307). Aprovar a proposta é aprovar o texto, não a publicação.
--
-- **O que o ciclo não pode aplicar, ele ensina onde mexer.** Trocar a voz e
-- alimentar a base de conhecimento não são escrita de roteiro: a primeira é
-- julgamento de ouvido de quem escuta, a segunda é conteúdo que ninguém tem.
-- Essas propostas nascem com `path` preenchido — o endereço exato da tela — e
-- sem `body`. Quem garante isso é o check `call_review_changes_forma_do_tipo`:
-- proposta que não se aplica e não diz onde mexer não entra no banco. É a
-- regra do produto virada restrição, e não convenção que se esquece.
--
-- **A proposta não é histórico; o roteiro é.** Questionar uma proposta a
-- reescreve no lugar, somando `revisions`. Não há linha por rodada de
-- questionamento de propósito: o que precisa de história é o texto que a Sarah
-- fala, e esse mora em `playbook_versions`, imutável e numerado. A proposta é
-- rascunho de rascunho.
--
-- Classe Servidor (seção 3.9): membro lê, ninguém escreve pelo cliente. Quem
-- escreve é a borda `call-review`, com a chave de serviço, depois de conferir
-- o papel — a mesma barreira que `playbook-draft` levanta.

-- call_reviews -----------------------------------------------------------------
create table public.call_reviews (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- Cascata: revisão de chamada apagada não é revisão de nada. A chamada some
  -- quando o lead some (RF-808), e a leitura que o modelo fez da conversa é
  -- tão pessoal quanto a transcrição que a originou.
  call_id uuid not null references public.calls (id) on delete cascade,
  status text not null default 'questions'
    check (status in ('questions', 'proposed', 'applied', 'discarded')),
  -- De qual propósito era a chamada, copiado no início. Não se lê de `calls`
  -- na hora de aplicar: a chamada é de março e o propósito dela é o que era em
  -- março, ainda que a linha mude depois.
  purpose text not null
    check (purpose in ('discovery', 'reminder', 'rescue', 'followup')),
  -- Com qual versão a Sarah falou nesta chamada. `set null` pela razão de
  -- `calls.playbook_version_id`: apagar playbook não pode apagar a revisão.
  playbook_version_id uuid references public.playbook_versions (id) on delete set null,
  -- O que o modelo leu da conversa: onde ela travou, o que o lead perguntou e
  -- ficou sem resposta, o que soou mal. Objeto, para a forma não variar.
  analysis jsonb not null default '{}'::jsonb
    check (jsonb_typeof(analysis) = 'object'),
  -- Quem abriu a revisão. Sem cascata: a revisão sobrevive a quem a pediu.
  created_by uuid references public.profiles (id) on delete set null,
  answered_at timestamptz,
  proposed_at timestamptz,
  applied_at timestamptz,
  discarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Estado que declara um instante precisa do instante. Sem isto, `applied`
  -- sem data é uma revisão aplicada que ninguém sabe quando foi.
  constraint call_reviews_aplicada_tem_data
    check (status <> 'applied' or applied_at is not null),
  constraint call_reviews_descartada_tem_data
    check (status <> 'discarded' or discarded_at is not null),
  -- Proposta sem resposta do dono é proposta escrita no vácuo: o modelo só
  -- escreve mudança depois que o questionário volta.
  constraint call_reviews_proposta_tem_respostas
    check (status not in ('proposed', 'applied') or answered_at is not null),
  -- O par que as filhas apontam de volta, para nenhuma pergunta nem proposta
  -- ficar sob a conta errada. Mesma razão da chave composta de
  -- `playbook_versions`.
  constraint call_reviews_id_conta unique (id, account_id)
);

comment on table public.call_reviews is
  'Uma passagem do ciclo de evolução sobre uma chamada (US-245). Classe Servidor: membro lê, quem escreve é a borda call-review. Não publica nada — o que ela aplica são rascunhos em playbook_versions.';

comment on column public.call_reviews.purpose is
  'O propósito da chamada no instante da análise, copiado de calls. Copiado, e não lido por junção, porque a revisão julga o roteiro daquele propósito e a linha da chamada pode mudar depois.';

comment on column public.call_reviews.analysis is
  'O que o modelo leu da conversa antes de perguntar: onde travou, o que ficou sem resposta, o que soou mal. Entra no pedido da etapa seguinte, para o modelo não reler a transcrição inteira duas vezes.';

-- Uma revisão aberta por chamada. Duas abertas na mesma ligação seriam dois
-- questionários concorrentes propondo mudanças no mesmo roteiro, e a segunda a
-- aplicar sobrescreveria a leitura da primeira sem saber que ela existiu.
-- Encerrada (aplicada ou descartada) não conta: revisar de novo depois de
-- aplicar é justamente o laço que o produto quer.
create unique index call_reviews_uma_aberta
  on public.call_reviews (call_id)
  where status in ('questions', 'proposed');

create index call_reviews_conta_recente_idx
  on public.call_reviews (account_id, created_at desc);

create trigger call_reviews_set_updated_at
  before update on public.call_reviews
  for each row execute function public.set_updated_at();

-- call_review_questions --------------------------------------------------------
-- O questionário. Uma linha por pergunta, com a razão de ela existir ao lado:
-- quem responde precisa saber por que está sendo perguntado, senão responde o
-- que acha que o sistema quer ouvir.
create table public.call_review_questions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  review_id uuid not null,
  -- A ordem em que a tela mostra. Do modelo, e não do relógio: ele pergunta o
  -- que importa primeiro.
  position integer not null check (position > 0),
  question text not null check (length(btrim(question)) > 0),
  -- Por que esta pergunta existe: o trecho da conversa que a motivou.
  why text not null check (length(btrim(why)) > 0),
  -- `text` é campo aberto; `choice` traz as opções que o modelo enxergou, e a
  -- resposta pode ser uma delas ou outra coisa — a tela deixa escrever.
  kind text not null default 'text' check (kind in ('text', 'choice')),
  options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(options) = 'array'),
  answer text,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint call_review_questions_ordem_unica unique (review_id, position),
  -- Pergunta de escolha sem opção nenhuma é pergunta aberta mal declarada.
  constraint call_review_questions_escolha_tem_opcoes
    check (kind <> 'choice' or jsonb_array_length(options) > 0),
  -- Resposta e data andam juntas: uma sem a outra é resposta que ninguém sabe
  -- quando chegou, ou data de uma resposta que não existe.
  constraint call_review_questions_resposta_tem_data
    check ((answer is null) = (answered_at is null)),
  constraint call_review_questions_da_revisao_da_conta
    foreign key (review_id, account_id)
    references public.call_reviews (id, account_id) on delete cascade
);

comment on table public.call_review_questions is
  'O questionário que o modelo devolveu depois de ler a conversa. Uma linha por pergunta, com o porquê ao lado: quem responde precisa saber o que na conversa motivou a pergunta.';

comment on column public.call_review_questions.why is
  'O trecho ou o fato da conversa que motivou a pergunta. Sem ele, quem responde adivinha o que o sistema quer ouvir em vez de contar o que sabe do negócio.';

create trigger call_review_questions_set_updated_at
  before update on public.call_review_questions
  for each row execute function public.set_updated_at();

-- call_review_changes ----------------------------------------------------------
-- As mudanças propostas. Duas famílias, e o check abaixo é quem as separa:
--
--   `script` e `house` **se aplicam sozinhas**: têm `body`, o texto novo
--   inteiro, que vira `playbook_versions` em draft quando a proposta é aceita.
--
--   `voice`, `knowledge` e `other` **não se aplicam**: têm `path`, o endereço
--   exato da tela onde a pessoa mexe, e `body` nulo. É a regra do produto:
--   sugestão que o ciclo não executa carrega o caminho de onde mexer.
create table public.call_review_changes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  review_id uuid not null,
  position integer not null check (position > 0),
  kind text not null check (kind in ('script', 'house', 'voice', 'knowledge', 'other')),
  -- O que muda, em uma frase, para a tela listar sem abrir o texto todo.
  title text not null check (length(btrim(title)) > 0),
  -- Por que muda, amarrado ao que aconteceu na ligação e ao que o dono
  -- respondeu. É o que se lê antes de aceitar.
  rationale text not null check (length(btrim(rationale)) > 0),
  -- O texto novo, inteiro, das camadas que a revisão reescreve. Inteiro, e não
  -- um diferencial: aplicar um trecho exigiria casar contexto num texto que o
  -- dono pode ter editado no meio do caminho, e o resultado seria uma versão
  -- que ninguém escreveu.
  body text,
  -- Onde a pessoa mexe, quando o ciclo não mexe. Caminho da aplicação, como
  -- `/sarah/voz`. Relativo de propósito: endereço absoluto envelhece com o
  -- domínio e é o tipo de coisa que ninguém lembra de trocar.
  path text check (path is null or path ~ '^/'),
  -- O que fazer lá, em uma frase de ação. Sem isto o caminho manda a pessoa
  -- para uma tela sem dizer o que ela foi fazer ali.
  path_action text,
  decision text not null default 'pending'
    check (decision in ('pending', 'accepted', 'rejected')),
  -- O que o dono escreveu ao questionar a proposta. Fica depois de o modelo
  -- reescrever: é o registro de por que a proposta mudou de cara.
  owner_note text,
  revisions integer not null default 0 check (revisions >= 0),
  revised_at timestamptz,
  decided_at timestamptz,
  -- A versão em draft que esta proposta gerou, quando aceita e aplicada.
  applied_version_id uuid references public.playbook_versions (id) on delete set null,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint call_review_changes_ordem_unica unique (review_id, position),
  -- A regra das duas famílias. Ver o comentário da tabela.
  constraint call_review_changes_forma_do_tipo check (
    case kind
      when 'script' then body is not null and length(btrim(body)) > 0 and path is null
      when 'house' then body is not null and path is null
      else body is null and path is not null and path_action is not null
           and length(btrim(path_action)) > 0
    end
  ),
  -- Só o que se aplica sozinho pode ter versão aplicada. Encaminhamento com
  -- versão seria o ciclo dizendo que fez o que só ensinou a fazer.
  constraint call_review_changes_so_aplicavel_aplica
    check (applied_version_id is null or kind in ('script', 'house')),
  constraint call_review_changes_aplicada_tem_data
    check ((applied_version_id is null) = (applied_at is null)),
  constraint call_review_changes_decidida_tem_data
    check ((decision = 'pending') = (decided_at is null)),
  -- Aplicar o que foi recusado é o pior defeito possível deste ciclo, então a
  -- proibição é do banco e não do código que escreve.
  constraint call_review_changes_recusada_nao_aplica
    check (decision <> 'rejected' or applied_at is null),
  constraint call_review_changes_revisao_tem_data
    check ((revisions = 0) = (revised_at is null)),
  constraint call_review_changes_da_revisao_da_conta
    foreign key (review_id, account_id)
    references public.call_reviews (id, account_id) on delete cascade
);

comment on table public.call_review_changes is
  'As mudanças que o modelo propôs. As de kind script e house trazem o texto novo e viram rascunho de versão quando aceitas; as de voice, knowledge e other não se aplicam sozinhas e trazem o caminho exato de onde a pessoa mexe.';

comment on column public.call_review_changes.body is
  'O texto novo inteiro da camada, e não um diferencial: aplicar trecho exigiria casar contexto num texto que o dono pode ter editado, e produziria uma versão que ninguém escreveu.';

comment on column public.call_review_changes.path is
  'O endereço da tela onde a pessoa mexe, para o que o ciclo não aplica. Relativo: endereço absoluto envelhece com o domínio.';

comment on column public.call_review_changes.revisions is
  'Quantas vezes o dono questionou e o modelo reescreveu esta proposta. A reescrita é no lugar: o que precisa de história é o roteiro publicado, e esse é imutável em playbook_versions.';

create index call_review_changes_da_revisao_idx
  on public.call_review_changes (review_id, position);

create trigger call_review_changes_set_updated_at
  before update on public.call_review_changes
  for each row execute function public.set_updated_at();

-- somar_revisao_da_mudanca -----------------------------------------------------
-- O contador de reescritas sobe aqui, e não num update do adaptador, porque
-- ler-somar-escrever do lado de fora perde uma de duas reescritas simultâneas:
-- as duas leem 1 e as duas escrevem 2. Aqui a soma é do banco, na linha travada
-- pelo próprio update.
--
-- `revised_at` é escrito junto, porque o check
-- `call_review_changes_revisao_tem_data` amarra os dois: contador acima de zero
-- sem data seria uma reescrita que ninguém sabe quando foi.
create or replace function public.somar_revisao_da_mudanca(p_change_id uuid)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.call_review_changes
     set revisions = revisions + 1,
         revised_at = now()
   where id = p_change_id
  returning revisions;
$$;

comment on function public.somar_revisao_da_mudanca(uuid) is
  'Soma uma reescrita à proposta e carimba a data, numa escrita só. Chamada por call-review depois de o modelo devolver a proposta reescrita.';

revoke all on function public.somar_revisao_da_mudanca(uuid) from public;
revoke all on function public.somar_revisao_da_mudanca(uuid) from anon;
revoke all on function public.somar_revisao_da_mudanca(uuid) from authenticated;
grant execute on function public.somar_revisao_da_mudanca(uuid) to service_role;

-- Isolamento (classe Servidor da seção 3.9) ------------------------------------
-- Leitura de membro nas três; escrita, nenhuma. Quem escreve é a borda
-- `call-review` com a chave de serviço, depois de conferir `has_role(...,
-- 'admin')` — a mesma barreira de `playbook-draft`. Política de escrita de
-- cliente aqui deixaria alguém forjar uma proposta com `body` próprio e depois
-- aceitá-la, o que é pôr texto na boca da Sarah por um caminho que ninguém
-- revisa.
alter table public.call_reviews enable row level security;

create policy call_reviews_leitura_de_membro
  on public.call_reviews for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy call_reviews_leitura_de_membro on public.call_reviews is
  'Classe Servidor: todo membro lê a revisão, porque ela explica por que o roteiro mudou.';

alter table public.call_review_questions enable row level security;

create policy call_review_questions_leitura_de_membro
  on public.call_review_questions for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy call_review_questions_leitura_de_membro on public.call_review_questions is
  'Classe Servidor: o questionário se lê na tela; responder passa pela borda, que conserta a ordem e chama o modelo.';

alter table public.call_review_changes enable row level security;

create policy call_review_changes_leitura_de_membro
  on public.call_review_changes for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy call_review_changes_leitura_de_membro on public.call_review_changes is
  'Classe Servidor: a proposta se lê na tela; aceitar, recusar e questionar passam pela borda, que é quem grava o rascunho da versão.';
