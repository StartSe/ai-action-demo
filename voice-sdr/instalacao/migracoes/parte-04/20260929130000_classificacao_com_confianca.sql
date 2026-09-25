-- A classificação com confiança, e a trava da correção humana (US-129, F4).
--
-- 1. **Três fontes, cada uma com quem a escreve.** `tool` é tool-qualify, ao
--    vivo; `backfill` é call-classify, depois da conversa; `human` é a correção
--    por corrigir_classificacao. O check da F2 aceitava as duas primeiras e é
--    ampliado aqui.
-- 2. **Confiança de modelo só existe onde houve modelo.** Check de linha
--    inteira: obrigatória em backfill, proibida em tool e human. É a metade
--    "confiança menor registrada" do segundo critério de aceite da F4.
-- 3. **A correção humana não se desfaz.** Gatilho `before update`: com a linha
--    já em `human`, qualquer update devolve os valores antigos de
--    classification, classification_source, classification_confidence,
--    evaluation, evaluation_score e sentiment. A trava é de dado, não de tela,
--    e vale para todo caminho, inclusive a chave de serviço e a retaguarda. O
--    único escritor que passa é corrigir_classificacao, que levanta o
--    parâmetro de sessão `app.corrigindo_classificacao` e o derruba antes de
--    devolver.
-- 4. **calls continua classe Servidor** (seção 3.9): nenhuma política de
--    escrita de cliente nasce aqui. As colunas novas entram por `add column if
--    not exists`, porque a F2 pode tê-las criado em outra frente.

alter table public.calls
  add column if not exists classification_confidence numeric
    constraint calls_confianca_na_faixa
      check (classification_confidence is null
             or (classification_confidence >= 0 and classification_confidence <= 1)),
  add column if not exists classification_corrected_by uuid
    references public.profiles (id) on delete set null,
  add column if not exists classification_corrected_at timestamptz;

alter table public.calls
  drop constraint if exists calls_classification_source_check;

alter table public.calls
  add constraint calls_classification_source_check
    check (classification_source is null
           or classification_source in ('tool', 'backfill', 'human'));

-- `not valid`: a chamada que a F2 classificou por retaguarda não tem confiança
-- registrada, e inventar um número para ela seria pior do que deixá-la como
-- estava. A regra vale para toda escrita daqui em diante.
alter table public.calls
  add constraint calls_confianca_so_do_modelo check (
    (classification_source is distinct from 'backfill' or classification_confidence is not null)
    and (classification_source is null or classification_source = 'backfill'
         or classification_confidence is null)
  ) not valid;

comment on column public.calls.classification_source is
  'De onde veio a classificação. tool: tool-qualify, chamada pela Sarah durante a conversa, e quem qualificou foi o lead confirmando. backfill: call-classify, o modelo lendo a transcrição depois, com classification_confidence obrigatória. human: correção por corrigir_classificacao, com autor e instante; depois dela nada sobrescreve a classificação. Nulo: ainda não classificada.';

comment on column public.calls.classification_confidence is
  'Confiança do modelo na classificação de retaguarda, de 0 a 1. Existe só com classification_source = backfill: a ferramenta ouviu a conversa e a correção é de gente, e nenhuma das duas tem confiança de modelo.';

comment on column public.calls.classification_corrected_by is
  'Quem corrigiu a classificação, gravado por corrigir_classificacao a partir de auth.uid().';

comment on column public.calls.classification_corrected_at is
  'Quando a última correção humana foi gravada.';

-- A trava ------------------------------------------------------------------------
create or replace function public.proteger_classificacao_corrigida()
returns trigger
language plpgsql
set search_path = ''
as $trava$
begin
  if old.classification_source = 'human'
     and coalesce(current_setting('app.corrigindo_classificacao', true), '') <> 'on' then
    new.classification := old.classification;
    new.classification_source := old.classification_source;
    new.classification_confidence := old.classification_confidence;
    new.classification_corrected_by := old.classification_corrected_by;
    new.classification_corrected_at := old.classification_corrected_at;
    new.evaluation := old.evaluation;
    new.evaluation_score := old.evaluation_score;
    new.sentiment := old.sentiment;
  end if;
  return new;
end;
$trava$;

comment on function public.proteger_classificacao_corrigida() is
  'Sexto critério de aceite da F4: depois da correção humana, nenhum processamento posterior sobrescreve a classificação, a avaliação nem o sentimento. Devolve os valores antigos em vez de recusar, porque o update da finalização ou da retaguarda carrega outras colunas que precisam entrar. Só corrigir_classificacao passa, pelo parâmetro de sessão app.corrigindo_classificacao.';

drop trigger if exists calls_protege_classificacao_corrigida on public.calls;
create trigger calls_protege_classificacao_corrigida
  before update on public.calls
  for each row execute function public.proteger_classificacao_corrigida();
