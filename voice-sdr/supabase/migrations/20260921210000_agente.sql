-- O agente: a identidade da Sarah (`agents`) e as quatro publicações no
-- provedor de voz (`agent_publications`).
-- Referência: docs/PRD-implementacao.md seções 3.4 e 3.9, docs/PRD.md RF-301,
-- RF-302, RF-308 e RF-309, docs/decisao-do-agente.md (T-01) e
-- docs/revisao-tecnica.md T-01 e O-05.
--
-- Esta migração é a primeira da F2 porque a decisão de T-01 já está tomada e
-- escrita: a Sarah é publicada **quatro vezes, uma por propósito**, e cada
-- publicação leva só o conjunto de ferramentas daquele propósito. O efeito
-- dessa decisão no esquema é a separação das duas tabelas — a identidade de um
-- lado, o vínculo com o provedor do outro — e é ela que faz a restrição de
-- ferramentas por propósito (RF-309) ser estrutural em vez de pedido educado
-- ao modelo dentro do roteiro.
--
-- `agents` não tem `provider_agent_id`, e a ausência é deliberada: com a coluna
-- aqui, uma Sarah teria um identificador só no provedor e as quatro
-- publicações não teriam onde morar. `testes/estatica/decisao-do-agente.test.ts`
-- varre as migrações cobrando essa ausência, para que ninguém a desfaça em
-- silêncio três histórias adiante.

-- agents ---------------------------------------------------------------------------
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- Como a Sarah se apresenta. Em branco, a primeira fala sairia sem nome, e é
  -- a primeira coisa que o lead ouve: o check é o mesmo de `accounts.name`.
  name text not null check (length(btrim(name)) > 0),
  company_name text not null check (length(btrim(company_name)) > 0),
  -- Nula é estado normal de rascunho: quem está montando a Sarah ainda não
  -- escreveu a oferta. Vazia não é, que seria oferta em branco na compilação.
  offer_line text check (offer_line is null or length(btrim(offer_line)) > 0),
  -- O que a Sarah nunca afirma (RF-308): garantia de resultado, preço que não
  -- existe, promessa que a empresa não cumpre. Vazio é o padrão e é honesto —
  -- a lista nasce da conversa de quem configura, não de um palpite nosso.
  never_claim text[] not null default '{}',
  -- Para onde a ligação vai quando o lead pede uma pessoa. Nulo enquanto a
  -- conta não decidiu; a transferência para humano é da F3.
  transfer_target text check (transfer_target is null or length(btrim(transfer_target)) > 0),
  -- Identificador da voz no provedor. Nulo em rascunho, obrigatório para
  -- publicar — e quem cobra isso é o compilador, não a coluna: a tela salva
  -- rascunho incompleto o tempo todo.
  voice_id text check (voice_id is null or length(btrim(voice_id)) > 0),
  -- Estabilidade, similaridade e velocidade, na forma que o provedor aceita.
  -- Objeto e não colunas: o conjunto muda com a versão da API do provedor, e
  -- cada mudança dessas seria uma migração a mais sem ganho de consulta.
  voice_settings jsonb not null default '{}',
  first_message text check (first_message is null or length(btrim(first_message)) > 0),
  -- Dois estados e não três: ou a Sarah está sendo montada, ou está no ar.
  -- "pausado" seria um terceiro que ninguém sabe ler — quem pausa a operação é
  -- o freio de emergência da conta, que é outra coisa e mora em `accounts`.
  status text not null default 'rascunho' check (status in ('rascunho', 'ativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Uma Sarah por conta na F2. Não é limitação técnica: é o recorte da fatia,
  -- e vale a pena ser estrutural porque uma segunda linha aqui deixaria
  -- `call-place` sem critério para escolher qual identidade liga.
  constraint agents_uma_por_conta unique (account_id)
);

comment on table public.agents is
  'A identidade da Sarah: nome, empresa, oferta, o que ela nunca afirma, voz e primeira fala. Uma por conta (único em account_id), porque na F2 a conta tem uma só Sarah e uma segunda deixaria call-place sem critério de escolha — uma segunda precisa ser decisão consciente, com migração, e não acidente de importação. Sem provider_agent_id: o vínculo com o provedor mora em agent_publications, uma linha por propósito (T-01, docs/decisao-do-agente.md).';

comment on column public.agents.never_claim is
  'O que a Sarah nunca afirma (RF-308). Entra na compilação do roteiro como restrição explícita. Vazio é o padrão: a lista nasce de quem configura.';

comment on column public.agents.voice_settings is
  'Ajustes da voz na forma que o provedor aceita. Objeto e não colunas porque o conjunto muda com a versão da API, e cada mudança seria uma migração sem ganho de consulta.';

comment on column public.agents.status is
  'rascunho enquanto a Sarah está sendo montada, ativo quando está no ar. Pausar a operação é o freio de emergência da conta, não um terceiro estado aqui.';

create trigger agents_set_updated_at
  before update on public.agents
  for each row execute function public.set_updated_at();

-- agent_publications ---------------------------------------------------------------
-- O que está no ar, por propósito. Quatro linhas por agente, uma para cada
-- conjunto de ferramentas — é aqui que a decisão de T-01 vira dado.
create table public.agent_publications (
  id uuid primary key default gen_random_uuid(),
  -- A conta também viria pelo agente, mas a política lê esta coluna, o
  -- check:sql a cobra e a varredura de travessia a usa. Escondê-la atrás de um
  -- join esconderia junto o isolamento.
  account_id uuid not null references public.accounts (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  -- As chaves ficam em inglês, como os `stage_key` da F1; o rótulo em português
  -- vem da interface. Propósito novo é trabalho de migração de propósito: cada
  -- um traz um conjunto de ferramentas, e acrescentar um sem decidir o conjunto
  -- publicaria uma Sarah que não sabe o que pode fazer.
  purpose text not null check (purpose in ('discovery', 'reminder', 'rescue', 'followup')),
  -- Nulo enquanto a publicação não voltou do provedor. É o identificador que
  -- `call-place` passa para a API de saída no momento da discagem.
  provider_agent_id text check (provider_agent_id is null or length(btrim(provider_agent_id)) > 0),
  -- sha-256 em hexadecimal minúsculo do que foi compilado e enviado. É o que
  -- responde "o que está no ar é o que está no banco?" para cada propósito
  -- separadamente. Qualquer outra coisa é recusada: um hash truncado ou em
  -- maiúscula nunca bateria com o recalculado, e a tela diria "desatualizado"
  -- para sempre sem ninguém entender por quê.
  published_hash text check (published_hash ~ '^[0-9a-f]{64}$'),
  published_at timestamptz,
  -- Três estados porque publicar quatro é quatro resultados. Sem o `falha`, um
  -- propósito que o provedor recusou ficaria indistinguível de um que nunca foi
  -- tentado, e a tela mandaria publicar tudo de novo em vez de só o que caiu.
  status text not null default 'pendente' check (status in ('pendente', 'publicado', 'falha')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Quatro publicações por agente, uma por propósito (T-01, RF-309). A quinta
  -- de um propósito seria uma segunda resposta para "qual agente atende a
  -- descoberta?", e `call-place` escolheria por sorte.
  constraint agent_publications_uma_por_proposito unique (agent_id, purpose),
  -- Publicado é o estado que `call-place` confia: sem identificador, sem hash
  -- ou sem data ele discaria para um agente que não existe, ou não saberia
  -- dizer se o que está no ar envelheceu.
  constraint agent_publications_publicado_completo check (
    status <> 'publicado'
    or (provider_agent_id is not null and published_hash is not null and published_at is not null)
  )
);

comment on table public.agent_publications is
  'O que está no ar no provedor de voz, uma linha por propósito (T-01, RF-309). Guarda provider_agent_id e published_hash porque a decisão de docs/decisao-do-agente.md publica quatro agentes, cada um com o conjunto de ferramentas do seu propósito.';

comment on column public.agent_publications.purpose is
  'discovery, reminder, rescue ou followup. Chave em inglês como os stage_key da F1; o rótulo em português vem da interface. Propósito novo exige decidir o conjunto de ferramentas dele, então é migração.';

comment on column public.agent_publications.provider_agent_id is
  'Identificador do agente no provedor, devolvido pela publicação. É o que call-place passa para a API de saída ao discar. Nulo enquanto a publicação não voltou.';

comment on column public.agent_publications.published_hash is
  'sha-256 em hexadecimal minúsculo do que foi compilado e enviado. Responde, por propósito, se o que está no ar é o que está no banco.';

comment on column public.agent_publications.status is
  'pendente, publicado ou falha. O falha existe para que um propósito recusado pelo provedor não se confunda com um que nunca foi tentado.';

-- A consulta de `call-place`: a publicação daquele propósito, naquela conta,
-- que está no ar. Parcial porque discagem nunca olha para pendente nem falha.
create index agent_publications_publicadas_por_proposito
  on public.agent_publications (account_id, purpose)
  where status = 'publicado';

create trigger agent_publications_set_updated_at
  before update on public.agent_publications
  for each row execute function public.set_updated_at();

-- Isolamento (classe Configuração da seção 3.9) ------------------------------------
alter table public.agents enable row level security;

create policy agents_leitura_de_membro
  on public.agents for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy agents_leitura_de_membro on public.agents is
  'Classe Configuração: todo membro lê a identidade da Sarah, porque a ficha da chamada e o discador mostram quem ligou.';

create policy agents_insercao_de_admin
  on public.agents for insert to authenticated
  with check ((select public.has_role(account_id, 'admin')));

comment on policy agents_insercao_de_admin on public.agents is
  'Classe Configuração: criar a Sarah é definir quem a empresa é ao telefone, então é de administrador.';

create policy agents_alteracao_de_admin
  on public.agents for update to authenticated
  using ((select public.has_role(account_id, 'admin')))
  with check ((select public.has_role(account_id, 'admin')));

comment on policy agents_alteracao_de_admin on public.agents is
  'Classe Configuração: nome, oferta, voz e o que a Sarah nunca afirma saem na boca dela em toda ligação. Operador não muda isso.';

create policy agents_exclusao_de_admin
  on public.agents for delete to authenticated
  using ((select public.has_role(account_id, 'admin')));

comment on policy agents_exclusao_de_admin on public.agents is
  'Classe Configuração: apagar a Sarah derruba as quatro publicações por cascata, e isso é de administrador.';

alter table public.agent_publications enable row level security;

create policy agent_publications_leitura_de_membro
  on public.agent_publications for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy agent_publications_leitura_de_membro on public.agent_publications is
  'Classe Configuração: todo membro lê o estado da publicação, porque é ele que diz se a Sarah pode ligar.';

create policy agent_publications_insercao_de_admin
  on public.agent_publications for insert to authenticated
  with check ((select public.has_role(account_id, 'admin')));

comment on policy agent_publications_insercao_de_admin on public.agent_publications is
  'Classe Configuração: publicar é pôr a Sarah no ar, então é de administrador.';

create policy agent_publications_alteracao_de_admin
  on public.agent_publications for update to authenticated
  using ((select public.has_role(account_id, 'admin')))
  with check ((select public.has_role(account_id, 'admin')));

comment on policy agent_publications_alteracao_de_admin on public.agent_publications is
  'Classe Configuração: mudar a publicação muda qual agente atende cada propósito. Operador não republica.';

create policy agent_publications_exclusao_de_admin
  on public.agent_publications for delete to authenticated
  using ((select public.has_role(account_id, 'admin')));

comment on policy agent_publications_exclusao_de_admin on public.agent_publications is
  'Classe Configuração: apagar a publicação tira o propósito do ar, e tirar do ar é de administrador.';

-- Auditoria ------------------------------------------------------------------------
-- Identidade da Sarah e publicação são configuração sensível (RF-008): quem
-- mudou a oferta, quem trocou a voz e quem republicou são exatamente as
-- perguntas que alguém faz depois de uma ligação sair errada.
create trigger agents_auditoria
  after update or delete on public.agents
  for each row execute function public.registrar_auditoria('account_id');

create trigger agent_publications_auditoria
  after update or delete on public.agent_publications
  for each row execute function public.registrar_auditoria('account_id');
