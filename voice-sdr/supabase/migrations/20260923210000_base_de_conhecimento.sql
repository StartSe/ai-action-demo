-- A base de conhecimento que a Sarah consulta durante a conversa (seção 3.4,
-- L-09, RF-310, US-064).
--
-- Cada entrada é uma pergunta e a resposta que a conta quer ouvir da Sarah. O
-- provedor de voz não lê esta tabela: `knowledge-sync` manda cada entrada para
-- lá como documento e anexa os documentos às **quatro** publicações. As
-- colunas de sincronização (`provider_doc_id`, `indexed_at`, `indexed_hash`,
-- `sync_error`) são o que o servidor sabe do lado de fora, e só ele as grava.
--
-- Três decisões, e as três têm teste em `testes/banco/conhecimento.test.ts`:
--
-- 1. **O servidor é o único que escreve a sincronização.** A política de
--    update é de admin, e sem trava a mesma escrita que corrige a resposta
--    poderia apontar `provider_doc_id` para o documento de outra conta — com a
--    credencial da plataforma, as contas dividem o mesmo espaço no provedor, e
--    a remoção seguinte apagaria o documento alheio. O gatilho descarta a
--    escrita dessas colunas; os RPCs de `knowledge-sync` levantam o portão.
-- 2. **Entrada indexada não se apaga direto.** Remover é marcar `removed_at`;
--    quem apaga a linha é a sincronização, depois do 2xx do provedor. Se a
--    remoção remota falha, a linha fica marcada e a próxima passagem tenta de
--    novo — apagada direto, ela levaria junto o único ponteiro para o
--    documento que continuaria lá, e a Sarah seguiria respondendo com ele.
-- 3. **`indexed_at` só com documento.** O check amarra as três colunas: não
--    existe entrada "indexada" sem o identificador de lá, que é o erro de R-05
--    (a marca antes do envio) com outra cara.

create table public.knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- Pergunta e resposta em branco não ensinam nada à Sarah e viram documento
  -- vazio no provedor.
  question text not null check (length(btrim(question)) > 0),
  answer text not null check (length(btrim(answer)) > 0),
  tags text[] not null default '{}',
  -- De onde a entrada veio. Livre, mas não em branco: a tela mostra a origem.
  source text not null default 'manual' check (length(btrim(source)) > 0),
  provider_doc_id text
    check (provider_doc_id is null or length(btrim(provider_doc_id)) > 0),
  indexed_at timestamptz,
  -- sha-256 do documento que foi mandado (nome e texto). É o que diz se a
  -- entrada mudou depois de indexada: comparar datas confundiria a edição com
  -- a própria marca da sincronização.
  indexed_hash text check (indexed_hash is null or indexed_hash ~ '^[0-9a-f]{64}$'),
  -- O código da última falha de sincronização, em inglês de máquina. A frase
  -- em português é da borda e da tela.
  sync_error text check (sync_error is null or sync_error ~ '^[a-z_]+$'),
  -- Marcada para sair. A linha some quando o provedor confirmar a remoção.
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_entries_indexada_com_documento check (
    (provider_doc_id is null) = (indexed_at is null)
    and (provider_doc_id is null) = (indexed_hash is null)
  )
);

comment on table public.knowledge_entries is
  'A base de conhecimento da conta (L-09, RF-310): pergunta e resposta que a Sarah consulta durante a conversa. knowledge-sync manda cada entrada ao provedor de voz como documento e anexa os documentos às quatro publicações. As colunas de sincronização são do servidor, por gatilho.';

comment on column public.knowledge_entries.provider_doc_id is
  'O identificador do documento no provedor de voz. Nulo enquanto a entrada não foi enviada. Escrito só por knowledge-sync, depois do 2xx.';

comment on column public.knowledge_entries.indexed_at is
  'Quando o provedor confirmou o documento desta entrada. Nulo junto com provider_doc_id, por check: a marca antes do envio é o erro de R-05.';

comment on column public.knowledge_entries.indexed_hash is
  'sha-256 do documento mandado. Diferente do documento de agora quer dizer que a entrada mudou e precisa ser reenviada.';

comment on column public.knowledge_entries.sync_error is
  'Código da última falha de sincronização desta entrada, ou nulo. A frase em português é de knowledge-sync e da tela.';

comment on column public.knowledge_entries.removed_at is
  'Marcada para remoção. Entrada indexada não se apaga direto: knowledge-sync remove o documento no provedor e só então apaga a linha. Remoção remota que falha deixa a linha aqui para a próxima passagem.';

-- Um documento no provedor por entrada. Parcial porque a entrada ainda não
-- enviada não tem documento, e várias convivem assim.
create unique index knowledge_entries_um_documento
  on public.knowledge_entries (account_id, provider_doc_id)
  where provider_doc_id is not null;

comment on index public.knowledge_entries_um_documento is
  'Um documento no provedor por entrada: duas linhas com o mesmo documento fariam a remoção de uma tirar a outra da Sarah.';

create trigger knowledge_entries_set_updated_at
  before update on public.knowledge_entries
  for each row execute function public.set_updated_at();

-- A sincronização é do servidor ---------------------------------------------------
-- Mesmo mecanismo de `phone_lines.health`: grant de coluna não segura, porque o
-- Supabase o reconcede por `alter default privileges`. Pelo PostgREST não há
-- como chamar set_config; o portão só abre dentro dos RPCs abaixo.
create or replace function public.proteger_sincronizacao_do_conhecimento()
returns trigger
language plpgsql
set search_path = ''
as $sincronizacao$
begin
  if coalesce(current_setting('app.conhecimento_sincronizacao', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A entrada nasce pendente: enviar é o que a sincronização ainda não fez.
    new.provider_doc_id := null;
    new.indexed_at := null;
    new.indexed_hash := null;
    new.sync_error := null;
  else
    new.provider_doc_id := old.provider_doc_id;
    new.indexed_at := old.indexed_at;
    new.indexed_hash := old.indexed_hash;
    new.sync_error := old.sync_error;
  end if;
  return new;
end;
$sincronizacao$;

comment on function public.proteger_sincronizacao_do_conhecimento() is
  'Gatilho before insert or update: descarta escrita de provider_doc_id, indexed_at, indexed_hash e sync_error que não venha dos RPCs de knowledge-sync, reconhecidos pelo parâmetro de sessão app.conhecimento_sincronizacao.';

revoke execute on function public.proteger_sincronizacao_do_conhecimento() from public;

create trigger knowledge_entries_protege_sincronizacao
  before insert or update on public.knowledge_entries
  for each row execute function public.proteger_sincronizacao_do_conhecimento();

-- Os RPCs da sincronização ----------------------------------------------------------
-- Só `service_role`: é knowledge-sync quem os chama, depois de conferir o papel
-- de quem pediu. Cada um levanta o portão, escreve e o derruba antes de
-- devolver, para a trava não ficar aberta para a escrita seguinte da transação.
-- Devolvem se a linha existia: a entrada apagada no meio da passagem é o caso
-- em que o documento recém-criado precisa ser removido de volta.

create or replace function public.marcar_conhecimento_indexado(
  p_entrada uuid,
  p_documento text,
  p_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $indexado$
declare
  v_achou boolean;
begin
  perform set_config('app.conhecimento_sincronizacao', 'on', true);
  -- Sem filtro por `removed_at`: a entrada marcada para sair no meio da
  -- passagem precisa guardar o documento que acabou de nascer, senão a remoção
  -- seguinte não sabe o que apagar lá fora.
  update public.knowledge_entries
     set provider_doc_id = p_documento,
         indexed_hash = p_hash,
         indexed_at = now(),
         sync_error = null
   where id = p_entrada;
  v_achou := found;
  perform set_config('app.conhecimento_sincronizacao', '', true);
  return v_achou;
end;
$indexado$;

comment on function public.marcar_conhecimento_indexado(uuid, text, text) is
  'knowledge-sync, depois do 2xx do provedor: grava o documento, o hash do que foi mandado e indexed_at. Devolve falso quando a entrada já não existe.';

create or replace function public.marcar_conhecimento_desindexado(p_entrada uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $desindexado$
declare
  v_achou boolean;
begin
  perform set_config('app.conhecimento_sincronizacao', 'on', true);
  update public.knowledge_entries
     set provider_doc_id = null,
         indexed_hash = null,
         indexed_at = null,
         sync_error = null
   where id = p_entrada;
  v_achou := found;
  perform set_config('app.conhecimento_sincronizacao', '', true);
  return v_achou;
end;
$desindexado$;

comment on function public.marcar_conhecimento_desindexado(uuid) is
  'knowledge-sync, depois de o provedor confirmar a remoção do documento antigo de uma entrada alterada: a entrada volta a pendente até o documento novo ser confirmado.';

create or replace function public.marcar_erro_do_conhecimento(p_entrada uuid, p_motivo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $erro$
declare
  v_achou boolean;
begin
  perform set_config('app.conhecimento_sincronizacao', 'on', true);
  -- Só o motivo: o documento que já está lá continua sendo o que a Sarah lê.
  update public.knowledge_entries
     set sync_error = p_motivo
   where id = p_entrada;
  v_achou := found;
  perform set_config('app.conhecimento_sincronizacao', '', true);
  return v_achou;
end;
$erro$;

comment on function public.marcar_erro_do_conhecimento(uuid, text) is
  'knowledge-sync: grava o código da falha de uma entrada sem tocar no documento que já está no provedor.';

revoke execute on function public.marcar_conhecimento_indexado(uuid, text, text) from public;
revoke execute on function public.marcar_conhecimento_desindexado(uuid) from public;
revoke execute on function public.marcar_erro_do_conhecimento(uuid, text) from public;
grant execute on function public.marcar_conhecimento_indexado(uuid, text, text) to service_role;
grant execute on function public.marcar_conhecimento_desindexado(uuid) to service_role;
grant execute on function public.marcar_erro_do_conhecimento(uuid, text) to service_role;

-- Isolamento (classe Configuração da seção 3.9) ----------------------------------
alter table public.knowledge_entries enable row level security;

create policy knowledge_entries_leitura_de_membro
  on public.knowledge_entries for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy knowledge_entries_leitura_de_membro on public.knowledge_entries is
  'Classe Configuração: todo membro lê a base, porque é ela que explica ao operador por que a Sarah respondeu o que respondeu.';

create policy knowledge_entries_insercao_de_admin
  on public.knowledge_entries for insert to authenticated
  with check ((select public.has_role(account_id, 'admin')));

comment on policy knowledge_entries_insercao_de_admin on public.knowledge_entries is
  'Classe Configuração: acrescentar uma entrada é pôr uma resposta na boca da Sarah. Operador não acrescenta.';

create policy knowledge_entries_alteracao_de_admin
  on public.knowledge_entries for update to authenticated
  using ((select public.has_role(account_id, 'admin')))
  with check ((select public.has_role(account_id, 'admin')));

comment on policy knowledge_entries_alteracao_de_admin on public.knowledge_entries is
  'Classe Configuração: corrigir a resposta e marcar a entrada para remoção são de quem administra. As colunas de sincronização ficam fora, por gatilho.';

create policy knowledge_entries_exclusao_de_admin
  on public.knowledge_entries for delete to authenticated
  using ((select public.has_role(account_id, 'admin')) and provider_doc_id is null);

comment on policy knowledge_entries_exclusao_de_admin on public.knowledge_entries is
  'Classe Configuração: só a entrada que nunca chegou ao provedor se apaga direto. A indexada se marca em removed_at, e quem a apaga é knowledge-sync depois de remover o documento lá fora.';

-- Auditoria ---------------------------------------------------------------------
-- Alterar e apagar entram na trilha (RF-008). Do segundo argumento em diante, o
-- que o servidor grava ao sincronizar: sem isso cada passagem afogaria na
-- trilha a edição de verdade. `removed_at` fica dentro, porque marcar para
-- remover é ato de quem administra.
create trigger knowledge_entries_auditoria
  after update or delete on public.knowledge_entries
  for each row execute function public.registrar_auditoria(
    'account_id', 'provider_doc_id', 'indexed_at', 'indexed_hash', 'sync_error'
  );
