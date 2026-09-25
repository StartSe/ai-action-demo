-- Os critérios da avaliação automática, por conta, e a gravação da avaliação
-- na chamada (US-142, RF-313, RF-314, RF-909, L-23).
-- Referência: docs/PRD.md RF-313 e RF-314, docs/PRD-implementacao.md seções 3.5
-- e 3.9.
--
-- **TABELA PRÓPRIA, E NÃO COLUNA EM `account_settings`.** Critério é lista que
-- se edita item a item: renomear um, desligar a obrigatoriedade de outro,
-- acrescentar um terceiro. Numa coluna `jsonb` de `account_settings`, cada
-- edição reescreveria a lista inteira, a trilha registraria "a lista mudou" sem
-- dizer qual item, e duas edições simultâneas de itens diferentes se
-- apagariam. Com uma linha por critério, `registrar_auditoria()` narra cada
-- item, e a chave imutável tem onde morar — é ela que a automação cita, como a
-- chave da etapa do funil (RF-203).
--
-- **`key` é imutável e `label` é editável.** A fila (`avaliacao:<call_id>`), a
-- ficha e o provedor leem o critério pela chave; renomear o rótulo não pode
-- virar critério novo no histórico das chamadas. Quem recusa é o gatilho, com a
-- mesma frase do funil.
--
-- **`como` diz quem decide.** `trecho` se decide em processo, pela presença de
-- um dos `trechos` numa fala da Sarah, sem modelo; `modelo` vai ao juízo do
-- modelo (`call-classify`) e ao provedor (RF-313). Critério por registro de
-- ferramenta (`qualificacao_registrada`) não mora aqui: ele é da camada 1 e vem
-- do código, porque só existe quando a ferramenta está publicada.
--
-- **A SEMENTE É PROVISÓRIA.** DEPENDE DA PERGUNTA 1 EM ABERTO (seção 13 de
-- docs/PRD.md): a lista concreta de critérios objetivos depende da oferta e do
-- que caracteriza um lead qualificado. A conta nasce com o conjunto mínimo de
-- `_shared/qualificacao/avaliacao.ts` (`CRITERIOS_MINIMOS`), os três que não
-- dependem da oferta: aviso de gravação dado, identificação honesta na
-- abertura, e nada afirmado fora da base de conhecimento. Quando a pergunta 1
-- fechar, a semente muda aqui e lá, e o teste da migração compara as duas.
--
-- Classe Configuração da seção 3.9: leitura de membro, escrita de admin.

create table public.evaluation_criteria (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  key text not null
    constraint evaluation_criteria_chave_valida check (key ~ '^[a-z][a-z0-9_]{0,63}$'),
  label text not null
    constraint evaluation_criteria_rotulo_preenchido check (length(btrim(label)) > 0),
  obrigatorio boolean not null default false,
  como text not null
    constraint evaluation_criteria_como_conhecido check (como in ('trecho', 'modelo')),
  trechos text[] not null default '{}',
  position smallint not null
    constraint evaluation_criteria_posicao_valida check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evaluation_criteria_chave_unica unique (account_id, key),
  -- Adiada: reordenar dois critérios troca as posições num update só.
  constraint evaluation_criteria_posicao_unica unique (account_id, position)
    deferrable initially deferred,
  -- Critério por trecho sem trecho reprovaria toda chamada.
  constraint evaluation_criteria_trecho_com_trechos
    check (como <> 'trecho' or cardinality(trechos) > 0)
);

comment on table public.evaluation_criteria is
  'Critérios objetivos da avaliação automática, por conta (RF-314). A mesma lista, somada aos critérios da camada 1, é aplicada por call-finalize e enviada ao provedor por agent-publish (RF-313). Tabela própria e não coluna em account_settings: critério se edita item a item e cada item precisa de trilha. A semente é provisória (pergunta 1 da seção 13 de docs/PRD.md).';

comment on column public.evaluation_criteria.key is
  'Identificador estável do critério. A fila, a ficha e o provedor citam a chave; um gatilho recusa alteração, e renomear é mexer em label.';

comment on column public.evaluation_criteria.como is
  'trecho: decidido em processo pela presença de um dos trechos numa fala da Sarah. modelo: decidido pelo juízo do modelo em call-classify, e enviado ao provedor.';

comment on column public.evaluation_criteria.trechos is
  'Para como = trecho: basta um destes aparecer numa fala da Sarah, comparado sem acento, caixa e pontuação.';

comment on column public.evaluation_criteria.obrigatorio is
  'Obrigatório reprovado derruba a nota da chamada para zero e abre item na fila pelo limiar failed_criteria_cap.';

create trigger evaluation_criteria_set_updated_at
  before update on public.evaluation_criteria
  for each row execute function public.set_updated_at();

-- A chave não muda ---------------------------------------------------------------
create or replace function public.recusar_troca_de_chave_de_criterio()
returns trigger
language plpgsql
set search_path = ''
as $recusa$
begin
  if new.key is distinct from old.key then
    raise exception 'a chave do critério não muda: renomeie o rótulo'
      using errcode = '42501';
  end if;

  return new;
end;
$recusa$;

comment on function public.recusar_troca_de_chave_de_criterio() is
  'Recusa update que altere evaluation_criteria.key. A fila e o histórico das chamadas citam a chave, então mudá-la quebraria o que já está escrito.';

create trigger evaluation_criteria_chave_imutavel
  before update on public.evaluation_criteria
  for each row execute function public.recusar_troca_de_chave_de_criterio();

-- A semente nasce com a conta -----------------------------------------------------
-- PROVISÓRIA: o conjunto mínimo de `CRITERIOS_MINIMOS`
-- (`supabase/functions/_shared/qualificacao/avaliacao.ts`), comparado linha a
-- linha por testes/banco/avaliacao-da-chamada.test.ts.
create or replace function public.semear_criterios_de_avaliacao_para(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $semente$
begin
  insert into public.evaluation_criteria (account_id, key, label, obrigatorio, como, trechos, position)
  values
    (p_account_id, 'aviso_gravacao', 'Avisou que a ligação é gravada', true, 'trecho',
     array['ligacao e gravada', 'ligacao esta sendo gravada', 'estou gravando', 'vou gravar'], 0),
    (p_account_id, 'identificacao_honesta', 'Disse quem é e de onde fala na abertura', true, 'trecho',
     array['aqui e a', 'sou a', 'meu nome e'], 1),
    (p_account_id, 'nada_fora_da_base', 'Não afirmou nada fora da base de conhecimento', false, 'modelo',
     array[]::text[], 2)
  on conflict (account_id, key) do nothing;
end;
$semente$;

comment on function public.semear_criterios_de_avaliacao_para(uuid) is
  'Cria os três critérios mínimos e provisórios da avaliação automática para uma conta. Chamada pelo gatilho em accounts e pelo remendo desta migração.';

revoke execute on function public.semear_criterios_de_avaliacao_para(uuid) from public;

create or replace function public.semear_criterios_de_avaliacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $gatilho$
begin
  perform public.semear_criterios_de_avaliacao_para(new.id);
  return new;
end;
$gatilho$;

comment on function public.semear_criterios_de_avaliacao() is
  'Semeia os critérios mínimos quando a conta nasce. Conta sem critério teria chamada sem avaliação.';

create trigger accounts_semear_criterios_de_avaliacao
  after insert on public.accounts
  for each row execute function public.semear_criterios_de_avaliacao();

do $$
declare
  v_conta record;
begin
  for v_conta in select id from public.accounts loop
    perform public.semear_criterios_de_avaliacao_para(v_conta.id);
  end loop;
end;
$$;

-- Isolamento (classe Configuração da seção 3.9) ----------------------------------
alter table public.evaluation_criteria enable row level security;

create policy evaluation_criteria_leitura_de_membro
  on public.evaluation_criteria for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy evaluation_criteria_leitura_de_membro on public.evaluation_criteria is
  'Classe Configuração: todo membro lê os critérios, porque a ficha da chamada mostra a avaliação por eles.';

create policy evaluation_criteria_insercao_de_admin
  on public.evaluation_criteria for insert to authenticated
  with check ((select public.has_role(account_id, 'admin')));

comment on policy evaluation_criteria_insercao_de_admin on public.evaluation_criteria is
  'Classe Configuração: critério novo muda a nota de toda chamada seguinte e vai ao provedor, então é de administrador.';

create policy evaluation_criteria_alteracao_de_admin
  on public.evaluation_criteria for update to authenticated
  using ((select public.has_role(account_id, 'admin')))
  with check ((select public.has_role(account_id, 'admin')));

comment on policy evaluation_criteria_alteracao_de_admin on public.evaluation_criteria is
  'Classe Configuração: renomear, reordenar ou mudar a obrigatoriedade é de administrador; a chave não muda nem para ele, e quem recusa é o gatilho.';

create policy evaluation_criteria_exclusao_de_admin
  on public.evaluation_criteria for delete to authenticated
  using ((select public.has_role(account_id, 'admin')));

comment on policy evaluation_criteria_exclusao_de_admin on public.evaluation_criteria is
  'Classe Configuração: apagar critério é de administrador. A avaliação já gravada nas chamadas continua com o item, citado pela chave.';

-- Auditoria ----------------------------------------------------------------------
create trigger evaluation_criteria_auditoria
  after update or delete on public.evaluation_criteria
  for each row execute function public.registrar_auditoria();

-- A avaliação automática gravada na chamada --------------------------------------
-- `calls.evaluation` tem mais de um escritor: `call-classify` grava o juízo do
-- modelo (`criterios`, `modelo`) e `registrar_medicao_da_avaliacao` as
-- medições (`medicoes`). A avaliação automática entra sob `itens`, mesclada no
-- banco pelo mesmo motivo da medição: ler, mesclar e gravar pela borda apagaria
-- o que outro escritor gravou entre a leitura e a escrita.
--
-- A nota nula não apaga a gravada: a finalização passa nula quando o juízo do
-- modelo ainda não existe (a via da ferramenta), e quem a completa é
-- `call-classify`, pela varredura de recuperação.
--
-- Avaliação não é classificação: esta função não toca em `leads`, etapa nem
-- pontuação. A correção humana continua travada pelo gatilho de `calls`.
create or replace function public.registrar_avaliacao_automatica(
  p_account_id uuid,
  p_call_id uuid,
  p_itens jsonb,
  p_nota numeric
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $avaliar$
declare
  v_linhas integer;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'itens_invalidos'
      using errcode = '22023',
            detail = 'Os itens da avaliação são uma lista jsonb de { criterio, aprovado, evidencia }.';
  end if;

  update public.calls c
     set evaluation = (case when jsonb_typeof(c.evaluation) = 'object' then c.evaluation else '{}'::jsonb end)
                      || jsonb_build_object('itens', p_itens),
         evaluation_score = coalesce(p_nota, c.evaluation_score)
   where c.account_id = p_account_id
     and c.id = p_call_id;

  get diagnostics v_linhas = row_count;
  return v_linhas > 0;
end;
$avaliar$;

comment on function public.registrar_avaliacao_automatica(uuid, uuid, jsonb, numeric) is
  'Grava em calls.evaluation.itens a avaliação automática da chamada (RF-314) e, quando a nota vem, calls.evaluation_score, mesclando com o juízo do modelo e as medições. Não toca em lead, etapa nem pontuação. Execução só para service_role.';

revoke execute on function public.registrar_avaliacao_automatica(uuid, uuid, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.registrar_avaliacao_automatica(uuid, uuid, jsonb, numeric) to service_role;
