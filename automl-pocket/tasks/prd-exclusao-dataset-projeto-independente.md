# PRD: Exclusão de Dataset — Projeto e Modelo Independentes

## Introdução

Hoje, excluir uma planilha em Datasets **preserva de propósito** o projeto
(`projects.datasetId` → `null`) e a linha do modelo treinado
(`models.trainingJobId` → `null`), mas duas dependências vazam e fazem o
projeto parecer "esvaziado":

1. **O relatório do modelo fica inacessível.** As abas Preparar/Explorar/Predição
   são desabilitadas quando `project.datasetId` é nulo
   (`(project)/projects/[projectId]/layout.tsx:38-56`) e `predict/page.tsx:111`
   redireciona para a raiz do projeto. O modelo existe no banco — com
   `insights`, `metrics`, `target` — mas não há tela para vê-lo.
2. **A configuração de treino e os campos de deploy se perdem.** O
   `deleteDataset` (`(app)/datasets/actions.ts:42-62`) apaga os
   `training_jobs` (FK not null para o dataset) e as `dataset_columns`
   (cascade). Sem `trainingJobId`, `getModelDeployFields`
   (`deploy/fields.ts:21`) retorna `[]` — o comentário diz "não acontece no
   fluxo real", mas acontece exatamente neste cenário: criar/reconfigurar um
   deployment perde nomes, tipos e categorias das features. Os **endpoints já
   publicados continuam funcionando** (a inferência passa só `modelId` ao
   worker, que lê `feature_columns` do artefato `.joblib`, que não é apagado).
3. **Projeto sem nenhum dado vinculado** (excluiu o dataset, sem modelo): a raiz
   do projeto já mostra a tela "Escolha uma fonte de dados"
   (`(project)/projects/[projectId]/page.tsx`), então o fluxo de revincular
   existe — mas o texto ("Todo projeto começa com dados… treinar seu primeiro
   modelo") ignora que o projeto já teve dados e, quando há modelo, não avisa
   que ele e os endpoints publicados continuam vivos.
4. **Arquivos podem vazar em silêncio.** `removeFileQuiet`
   (`lib/uploads.ts:5-17`) engole qualquer erro do `unlink`. Para arquivo
   inexistente (ENOENT) isso é correto; para volume indisponível o arquivo
   fica órfão no disco para sempre, sem nenhum registro de que existiu.

Estado atual relevante (já investigado no código):

- `models` já guarda `target`, `ignoredColumns`, `problemType`,
  `winningAlgorithm`, `metrics`, `insights`, `aiInsight` (`db/schema.ts:297`).
  Os componentes de relatório (`classification-report.tsx`,
  `regression-report.tsx`, `forecasting-report.tsx`, `insights-sections.tsx`)
  leem essencialmente do modelo. O que só existe em `training_jobs.config` é a
  configuração de retreino (`mode`, `modelKind`, `timeColumn`,
  `forecastHorizon`, `aggregation`, `forecastModel`, `idColumn`) e o que só
  existe em `dataset_columns` são os campos de deploy (nome/tipo/categorias).
- `predict/page.tsx` monta o Prever unificado: exige dataset `ready`, carrega
  colunas, acha o modelo vigente (`findLatestModelScoped`) e pré-carrega a
  config de retreino do `training_jobs.config` (linhas 111-220).
- O diálogo de exclusão de dataset (`(app)/datasets/datasets-view.tsx:431+`) já
  avisa quais projetos usam o dataset.
- `deleteDataset` já coleta os parquets das versões antes da transação e audita
  com `linkedProjectIds`.

Decisões já tomadas com o produto (menor impacto):

- **Snapshot na exclusão**, não no treino: nada muda no pipeline de treino nem
  no worker. No momento do `deleteDataset`, antes de apagar os jobs, a config
  de treino e os campos de deploy são copiados para uma coluna JSONB no modelo.
- **Modo relatório na Predição**: a aba habilita quando há modelo mesmo sem
  dataset, somente leitura; retreinar exige vincular novo dataset.
- Projeto vazio: **só ajuste de textos/estado** — sem oferta de excluir o
  projeto junto.
- `removeFileQuiet`: **só logar** falhas ≠ ENOENT — sem sweep periódico.

## Objetivos

- Excluir o dataset nunca torna o modelo treinado invisível: o relatório segue
  acessível na aba Predição.
- Criar/reconfigurar deployments continua funcionando após a exclusão do
  dataset (campos vêm do snapshot).
- O estado vazio do projeto comunica o que aconteceu e o que ainda funciona.
- Nenhum arquivo passa a ser apagado "em silêncio absoluto": falha real de
  unlink deixa rastro com o path.

## User Stories

### US-001: Snapshot de treino no modelo ao excluir o dataset
**Description:** Como plataforma, quero copiar a configuração de treino e os
campos de deploy para o modelo antes de apagar os `training_jobs`, para que o
modelo se torne autossuficiente após a exclusão do dataset.

**Acceptance Criteria:**
- [ ] Migration adiciona coluna `training_snapshot` (JSONB, nullable) em
      `models`; linhas antigas ficam `null` sem backfill
- [ ] Shape do snapshot: `{ config: <training_jobs.config na íntegra>,
      deployFields: DeploymentFormField[] }` — `deployFields` calculado com a
      **mesma regra** de `getModelDeployFields` (colunas menos alvo e
      ignoradas, com categorias do profiling)
- [ ] `deleteDataset` grava o snapshot, dentro da transação, em todo modelo
      cujo `trainingJobId` aponta para um job do dataset excluído — **antes**
      de anular `trainingJobId` e apagar os jobs
- [ ] Modelo que já possui `training_snapshot` não é sobrescrito (proteção
      contra dupla exclusão/re-execução)
- [ ] Typecheck/lint passam

### US-002: Campos de deploy via snapshot
**Description:** Como usuário, quero criar e reconfigurar deployments de um
modelo cujo dataset foi excluído, para que os formulários públicos continuem
com os campos corretos.

**Acceptance Criteria:**
- [ ] `getModelDeployFields` usa `models.training_snapshot.deployFields` como
      fallback quando `trainingJobId` é nulo (e o comentário "não acontece no
      fluxo real" é corrigido)
- [ ] Com dataset excluído, as telas de configuração dos 3 endpoints
      (web-app/api/mcp) mostram os mesmos campos de antes da exclusão,
      incluindo categorias nos selects
- [ ] Modelo sem job **e** sem snapshot (legado) continua retornando `[]` sem
      erro
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-003: Aba Predição em modo relatório sem dataset
**Description:** Como usuário, quero abrir o relatório do meu modelo treinado
mesmo depois de excluir o dataset, para não perder o resultado do treino.

**Acceptance Criteria:**
- [ ] No layout do projeto, a aba Predição habilita com
      `Boolean(project.datasetId) || Boolean(model)`; Preparar e Explorar
      continuam exigindo dataset
- [ ] `predict/page.tsx` sem `datasetId` mas **com** modelo renderiza o
      relatório do modelo vigente (mesmos componentes de relatório já
      existentes — não recriar), em vez de redirecionar
- [ ] Banner no topo do relatório informa que o dataset de treino foi excluído
      e que é preciso vincular um novo dataset para retreinar (link para a
      raiz do projeto)
- [ ] Ações que dependem do dataset ficam ocultas ou desabilitadas nesse modo:
      retreinar, trocar tipo de modelo, predição individual/lote que leia
      colunas atuais
- [ ] Sem `datasetId` **e** sem modelo, o comportamento atual (redirect para a
      raiz do projeto) é mantido
- [ ] `modelTarget` deixa de exigir que o alvo exista nas colunas atuais
      quando não há dataset (usa `model.target` direto)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-004: Estado vazio do projeto pós-exclusão
**Description:** Como usuário, quero que o projeto sem dados me diga o que
aconteceu e o que fazer, em vez de parecer um projeto recém-criado.

**Acceptance Criteria:**
- [ ] A tela "Escolha uma fonte de dados" diferencia projeto que **nunca teve**
      dados (texto atual) de projeto que **perdeu** o vínculo (ex.: "O dataset
      deste projeto foi excluído. Vincule um novo para continuar.") — a
      distinção pode usar a existência de modelo/`training_jobs` ou um marcador
      simples definido na implementação
- [ ] Quando há modelo treinado, a tela mostra aviso de que o modelo e os
      endpoints publicados continuam ativos, com link para a Predição
      (relatório) e para o Publicar
- [ ] Textos em pt-BR, consistentes com o tom das telas existentes
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-005: Log de falha real no removeFileQuiet
**Description:** Como operador, quero rastro quando um arquivo não pôde ser
apagado, para conseguir limpar órfãos manualmente.

**Acceptance Criteria:**
- [ ] `removeFileQuiet` continua silencioso para `ENOENT`
- [ ] Qualquer outro erro de `unlink` gera `console.error` com o path absoluto
      e o código do erro (sem lançar — a exclusão do registro não pode falhar
      por causa do arquivo)
- [ ] Todos os call sites existentes continuam funcionando sem mudança de
      assinatura
- [ ] Typecheck/lint passam

## Requisitos Funcionais

- FR-1: `models.training_snapshot` (JSONB nullable) armazena
  `{ config, deployFields }` no momento da exclusão do dataset vinculado.
- FR-2: `deleteDataset` deve gravar o snapshot na mesma transação que anula
  `trainingJobId` e apaga os `training_jobs`, sem sobrescrever snapshot
  existente.
- FR-3: `getModelDeployFields` deve resolver os campos por esta ordem: job
  vivo → `training_snapshot.deployFields` → `[]`.
- FR-4: A aba Predição deve estar habilitada sempre que existir modelo vigente,
  mesmo sem dataset; nesse estado a página renderiza o relatório em modo
  somente leitura com banner explicativo.
- FR-5: A raiz do projeto sem dataset deve distinguir "nunca teve dados" de
  "dataset excluído" e, havendo modelo, apontar para relatório e Publicar.
- FR-6: `removeFileQuiet` deve logar path e código de erro para falhas de
  unlink diferentes de ENOENT, sem propagar exceção.

## Non-Goals (Fora de Escopo)

- Snapshot no momento do **treino** (worker/actions de treino intocados) e
  backfill de modelos cujo dataset já foi excluído antes desta mudança — esses
  continuam sem campos de deploy e sem config de retreino.
- Oferecer exclusão do projeto no diálogo de exclusão do dataset.
- Sweep periódico de arquivos órfãos no volume de uploads.
- Retreinar a partir do snapshot com um dataset novo (o retreino continua
  exigindo dataset vinculado e config lida do fluxo atual).
- Histórico de modelos ou desvincular dataset sem excluí-lo.

## Considerações Técnicas

- O snapshot na exclusão cobre **config completa** de propósito: se um dataset
  novo for vinculado depois, uma melhoria futura pode pré-carregar o retreino a
  partir dele — mas isso está fora deste escopo.
- `DeploymentFormField` (`components/deployment-form`) é o shape natural para
  `deployFields`; reutilizar a função existente em vez de duplicar a regra
  "colunas menos alvo e ignoradas" (extrair a parte pura de
  `deploy/fields.ts` se necessário).
- No modo relatório (US-003), atenção ao forecasting: `frequency`/`horizons`
  vêm de `insights`, então o `ForecastingReport` funciona sem dataset; o que
  não pode aparecer são os selects de eixo temporal/campo de identificação da
  sidebar (dependem de `dataset_columns`).
- A auditoria existente de `dataset.delete` já registra `linkedProjectIds`;
  nenhuma mudança de auditoria é necessária.

## Métricas de Sucesso

- Excluir um dataset com modelo treinado e conseguir, sem nenhum outro passo:
  (a) abrir o relatório do modelo, (b) reconfigurar um deployment com os campos
  corretos, (c) receber predições nos endpoints publicados.
- Zero registros de erro novos nos fluxos de exclusão em operação normal; em
  falha de volume, o path do arquivo órfão aparece no log.

## Questões em Aberto

- O marcador "projeto já teve dados" da US-004: basta inferir pela existência
  de modelo, ou vale um campo explícito (ex.: `projects.hadDataset`)? A
  inferência falha para projeto que teve dataset mas nunca treinou — aceitável?
- Predição individual (formulário) em modo relatório: o snapshot de
  `deployFields` permitiria habilitá-la sem dataset numa iteração futura —
  desejável?
