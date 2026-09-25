-- Conformidade: a lista de bloqueio (`dnc_entries`) e o registro de
-- consentimento (`consent_records`).
-- Referência: docs/PRD-implementacao.md seções 3.6, 3.9 e 6 (passo 3 da
-- guarda), docs/revisao-tecnica.md T-02 e R-02, docs/PRD.md RF-804, RF-805,
-- RF-422 e RF-810.
--
-- As duas tabelas chegam antes da primeira discagem de propósito: o bloqueio é
-- o único caso desta fatia com exposição jurídica real. Ligar para quem pediu
-- para não ser chamado de novo não é defeito de produto, é reclamação — e a
-- guarda não tem onde perguntar enquanto a lista não existe.
--
-- Quatro decisões que o esquema carrega:
--
-- 1. **Remover é `update`, não `delete`.** RF-804 pede remoção registrada, e um
--    `delete` não deixa rastro: a linha some e ninguém responde "quem tirou
--    este número do bloqueio, quando e por quê?". Os três campos da remoção
--    andam juntos por check, pelo mesmo motivo do freio em `accounts`.
-- 2. **O único é parcial.** Um bloqueio ativo por número, e reincluir depois de
--    remover é linha nova. Sem o `where`, a segunda inclusão colidiria com a
--    remoção antiga e o operador veria "número já bloqueado" olhando para uma
--    lista onde ele não está.
-- 3. **`source='wrong_number'` fecha RF-422 sem tabela nova (T-02).** Falar com
--    a pessoa errada e marcar o número como incorreto é o mesmo ato de recusar
--    rediscagem que a lista de bloqueio já faz. Uma tabela separada teria as
--    mesmas colunas e um segundo lugar para a guarda consultar — e o passo que
--    esquecesse o segundo lugar ligaria de novo.
-- 4. **`consent_records` é da classe Servidor.** Quem escreve é `call-finalize`,
--    lendo da transcrição o instante em que o aviso foi dado (L-23, RF-810).
--    Não há política de escrita de cliente, e a ausência é o ponto: um registro
--    de consentimento que a própria conta pode inserir não prova nada — a prova
--    de que o aviso foi dado é justamente não ter vindo de quem se beneficia
--    dela.

-- A lista de bloqueio ----------------------------------------------------------
create table public.dnc_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- E.164, com o mesmo check de `leads.phone_e164`, de
  -- `account_test_numbers.phone_e164` e de `phone_lines.e164`. Aqui a régua
  -- igual importa mais do que em qualquer outro lugar: o passo 3 da guarda
  -- compara este número com o do lead, e uma forma diferente faria o bloqueio
  -- existir na tela e não existir na comparação.
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  -- Por que este número está bloqueado (RF-804). Obrigatório e não em branco:
  -- é o que a tela mostra quando alguém pergunta por que a conta não liga para
  -- um cliente, e "bloqueado" sem motivo não responde nada.
  reason text not null check (length(btrim(reason)) > 0),
  -- De onde veio o bloqueio (RF-804). Quatro origens, e cada uma tem um
  -- caminho de código que a escreve: `manual` é a tela /config/bloqueios,
  -- `import` é a carga de lista, `call` é `tool-dnc` durante a chamada (RF-805)
  -- e `wrong_number` é a pessoa errada de RF-422 (T-02). Origem nova exige
  -- migração de propósito: um valor que nenhum caminho escreve é filtro de
  -- tela que nunca traz linha.
  source text not null default 'manual'
    check (source in ('manual', 'import', 'call', 'wrong_number')),
  -- Observação livre de quem bloqueou. Vazio não vale por nulo, senão "sem
  -- observação" teria duas formas.
  notes text check (notes is null or length(btrim(notes)) > 0),
  -- A remoção (RF-804) ---------------------------------------------------------
  removed_at timestamptz,
  -- Quem removeu. Sem chave estrangeira para `profiles`, pelo mesmo motivo de
  -- `accounts.dialing_paused_by`: quem tirou um número do bloqueio pode sair da
  -- conta, e o registro precisa sobreviver à saída. Um `on delete set null`
  -- teria o segundo efeito, pior: deixaria a linha com `removed_at` preenchido
  -- e `removed_by` nulo, que é o estado que o check abaixo existe para
  -- impedir — apagar um perfil passaria a falhar por violação de restrição.
  removed_by uuid,
  removal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Os três campos da remoção andam juntos. "Removido por ninguém, sem motivo"
  -- é o pior estado possível: o número volta a receber ligação e não há a quem
  -- perguntar por quê.
  constraint dnc_entries_remocao_completa check (
    (removed_at is null
      and removed_by is null
      and removal_reason is null)
    or (removed_at is not null
      and removed_by is not null
      and btrim(coalesce(removal_reason, '')) <> '')
  )
);

comment on table public.dnc_entries is
  'Lista de bloqueio por conta (seção 3.6, RF-804). Consultada no passo 3 da guarda de discagem. Remover é update com removed_at, removed_by e removal_reason, nunca delete: RF-804 pede remoção registrada, e um delete não deixa rastro.';

comment on column public.dnc_entries.phone_e164 is
  'Número bloqueado em E.164, com o mesmo check de leads.phone_e164, account_test_numbers.phone_e164 e phone_lines.e164. Régua diferente faria o bloqueio existir na tela e não existir na comparação do passo 3 da guarda.';

comment on column public.dnc_entries.reason is
  'Por que o número está bloqueado (RF-804). Obrigatório: "bloqueado" sem motivo não responde a quem pergunta por que a conta não liga para um cliente.';

comment on column public.dnc_entries.source is
  'De onde veio o bloqueio: manual na tela, import na carga de lista, call quando tool-dnc atende o pedido do interlocutor (RF-805) e wrong_number quando a Sarah identifica a pessoa errada (RF-422, T-02). Origem nova exige migração, porque valor que nenhum caminho escreve é filtro que nunca traz linha.';

comment on column public.dnc_entries.notes is
  'Observação livre de quem bloqueou. Nulo é ausência; vazio é recusado, para "sem observação" ter uma forma só.';

comment on column public.dnc_entries.removed_at is
  'Instante em que o bloqueio deixou de valer. Nulo é bloqueio ativo, e é essa coluna que o único parcial usa. Anda junto com removed_by e removal_reason por check.';

comment on column public.dnc_entries.removed_by is
  'Quem removeu o bloqueio. Sem chave estrangeira de propósito: o registro sobrevive à saída da pessoa, e um on delete set null quebraria o check dos três campos da remoção.';

comment on column public.dnc_entries.removal_reason is
  'Por que o bloqueio foi removido. Obrigatório quando há remoção: devolver um número à discagem é a decisão que mais precisa de justificativa escrita.';

create trigger dnc_entries_set_updated_at
  before update on public.dnc_entries
  for each row execute function public.set_updated_at();

-- Um bloqueio ativo por número --------------------------------------------------
-- Parcial em `removed_at is null`: reincluir um número depois de removê-lo é
-- linha nova, e não conflito com a remoção antiga. Sem o `where`, o operador
-- receberia "número já bloqueado" olhando para uma lista onde ele não está.
--
-- O mesmo índice serve a consulta do passo 3 da guarda, que é (conta, número)
-- entre os bloqueios ativos e roda em toda discagem.
create unique index dnc_entries_ativo_unico_por_conta
  on public.dnc_entries (account_id, phone_e164)
  where removed_at is null;

comment on index public.dnc_entries_ativo_unico_por_conta is
  'Um bloqueio ativo por número por conta, e o índice do passo 3 da guarda. Parcial porque remover é update: a linha removida sai do único e o número pode ser bloqueado de novo.';

-- Isolamento (classe Operação da seção 3.9) ------------------------------------
alter table public.dnc_entries enable row level security;

create policy dnc_entries_leitura_de_membro
  on public.dnc_entries for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy dnc_entries_leitura_de_membro on public.dnc_entries is
  'Classe Operação: todo membro lê a lista, inclusive o viewer. A recusa da guarda por bloqueio só se explica com a lista à vista.';

create policy dnc_entries_insercao_de_operador
  on public.dnc_entries for insert to authenticated
  with check ((select public.has_role(account_id, 'operator')));

comment on policy dnc_entries_insercao_de_operador on public.dnc_entries is
  'Classe Operação: bloquear um número é trabalho de quem opera. O viewer só acompanha.';

create policy dnc_entries_alteracao_de_operador
  on public.dnc_entries for update to authenticated
  using ((select public.has_role(account_id, 'operator')))
  with check ((select public.has_role(account_id, 'operator')));

comment on policy dnc_entries_alteracao_de_operador on public.dnc_entries is
  'Classe Operação: remover o bloqueio é update, e é de operator. O with check repete o using para a linha não sair do alcance.';

create policy dnc_entries_exclusao_de_operador
  on public.dnc_entries for delete to authenticated
  using ((select public.has_role(account_id, 'operator')));

comment on policy dnc_entries_exclusao_de_operador on public.dnc_entries is
  'Classe Operação: a política existe para o caminho de correção — linha criada por engano, com o número errado. O caminho normal de tirar um bloqueio é o update da remoção, e é ele que a tela usa.';

-- Auditoria --------------------------------------------------------------------
-- Bloquear e desbloquear é ação sensível (RF-008): a remoção decide que a conta
-- volta a ligar para alguém que pediu para não ser chamado, e essa decisão
-- precisa de autor e hora fora da própria linha. O insert não passa por aqui —
-- `registrar_auditoria` lê `old` —, e é por isso que a origem do bloqueio mora
-- em `source`.
create trigger dnc_entries_auditoria
  after update or delete on public.dnc_entries
  for each row execute function public.registrar_auditoria('account_id');

-- O registro de consentimento ---------------------------------------------------
create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- De quem é o consentimento. Nulo na ligação recebida de um número que ainda
  -- não virou lead: o aviso foi dado do mesmo jeito, e perder o registro por
  -- falta de cadastro seria perder justamente a prova. `on delete cascade`
  -- porque RF-808 apaga todos os dados do lead sob solicitação, e um registro
  -- de consentimento órfão seria dado pessoal sobrevivendo ao pedido de
  -- exclusão.
  lead_id uuid references public.leads (id) on delete cascade,
  -- Em qual chamada. Sem chave estrangeira **por ordem de migração**: `calls` é
  -- a US-050, e a restrição entra lá, na mesma migração que cria a tabela. Até
  -- lá a coluna guarda o identificador sem o banco conferir a existência.
  call_id uuid,
  -- Que consentimento é este. `recording` é o aviso de gravação de RF-806,
  -- carimbado por call-finalize junto com calls.consent_notice_at (L-23);
  -- `ai_disclosure` é a Sarah dizendo que é um agente; `contact` é o opt-in de
  -- contato que veio com o lead. Espécie nova exige migração: um valor que
  -- nenhum caminho escreve é registro que ninguém lê.
  kind text not null check (kind in ('recording', 'ai_disclosure', 'contact')),
  -- Se o consentimento foi dado. Falso é registro de recusa, e ele vale tanto
  -- quanto o positivo: quem recusou a gravação precisa aparecer em algum lugar.
  granted boolean not null,
  -- A prova: trecho da transcrição, texto do aviso lido, origem da importação.
  -- Objeto, para a forma não variar entre quem escreve em momentos diferentes.
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence) = 'object'),
  -- O momento em que o aviso foi dado (RF-810). É o dado da tabela, e não um
  -- carimbo de linha: `call-finalize` grava depois do fim da chamada, e a hora
  -- do insert seria a hora da finalização, não a do aviso.
  at timestamptz not null default now()
);

comment on table public.consent_records is
  'Registro de consentimento por conta (seção 3.6, RF-810). Classe Servidor: quem escreve é call-finalize, lendo da transcrição o instante do aviso. Não há política de escrita de cliente, e a ausência é o ponto — consentimento que a própria conta insere não prova nada.';

comment on column public.consent_records.lead_id is
  'De quem é o consentimento. Nulo na ligação recebida de número que ainda não virou lead. Cascata na exclusão do lead, porque RF-808 apaga todos os dados dele e um registro órfão seria dado pessoal sobrevivendo ao pedido.';

comment on column public.consent_records.call_id is
  'Em qual chamada o aviso foi dado. Sem chave estrangeira aqui por ordem de migração: calls nasce na migração seguinte, e a restrição entra junto com a tabela.';

comment on column public.consent_records.kind is
  'Espécie do consentimento: recording é o aviso de gravação (RF-806), ai_disclosure é a Sarah declarando que é um agente, contact é o opt-in que veio com o lead. Espécie nova exige migração, porque valor que nenhum caminho escreve é registro que ninguém lê.';

comment on column public.consent_records.granted is
  'Se o consentimento foi dado. Falso é recusa registrada, e vale tanto quanto o positivo: quem recusou a gravação precisa aparecer em algum lugar.';

comment on column public.consent_records.evidence is
  'A prova do consentimento: trecho da transcrição, texto do aviso lido, origem da importação. Objeto, para a forma não variar entre quem escreve em momentos diferentes.';

comment on column public.consent_records.at is
  'O momento em que o aviso foi dado (RF-810). É o dado da tabela e não um carimbo de linha: call-finalize grava depois do fim da chamada, e a hora do insert seria a da finalização.';

-- As duas consultas que esta tabela serve: "o que este lead consentiu" na ficha
-- do lead e na exportação de RF-809, e "o que foi avisado nesta chamada" na
-- ficha da chamada. Ambas parciais, porque a coluna é nula nos casos descritos
-- acima e linha nula nunca é resposta.
create index consent_records_por_lead
  on public.consent_records (account_id, lead_id)
  where lead_id is not null;

create index consent_records_por_chamada
  on public.consent_records (call_id)
  where call_id is not null;

-- Isolamento (classe Servidor da seção 3.9) -------------------------------------
alter table public.consent_records enable row level security;

create policy consent_records_leitura_de_membro
  on public.consent_records for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy consent_records_leitura_de_membro on public.consent_records is
  'Classe Servidor: membro lê os consentimentos da própria conta, porque a ficha da chamada e a exportação de RF-809 os mostram. Não há política de insert, update nem delete, nem para o owner, e é esse o ponto da tabela: quem escreve é call-finalize.';

-- Sem gatilho de auditoria, e a ausência tem razão: `consent_records` é
-- registro do servidor, não configuração que alguém edita. Não há escrita de
-- cliente para auditar, e uma trilha por consentimento gravado seria uma linha
-- por chamada dizendo o que a própria tabela já diz, com a hora do aviso
-- dentro. `dnc_entries` fica com o gatilho porque lá há gente decidindo.
