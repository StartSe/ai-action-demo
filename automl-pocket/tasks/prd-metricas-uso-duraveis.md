# PRD: Métricas de uso duráveis (sobrevivem à exclusão de projetos/datasets/usuários)

## Introdução

O produto hoje só conhece seu estado atual: `models` guarda apenas o modelo
vigente de cada projeto (retreino substitui), e a exclusão de projeto/dataset
apaga em cascata `models`, `training_jobs`, `deployments` e chats do Explore.
Resultado: métricas históricas como "total de modelos treinados", "algoritmo
mais usado" e "volume de predições por projeto" encolhem ou desaparecem com o
uso normal do produto.

Esta feature **não cria nenhuma UI**. O objetivo é garantir que os eventos de
uso relevantes fiquem registrados de forma durável, para que no futuro um
painel admin (ou uma consulta SQL para a aula executiva) consiga responder às
perguntas de negócio sem perda de histórico.

A fonte durável escolhida é a tabela existente `audit_logs`: ela não tem
cascade de projeto/dataset, já registra os eventos do web app com metadata
JSONB e já cobre boa parte do necessário. O trabalho é fechar as lacunas
(principalmente no worker) e documentar as consultas.

## Métricas-alvo (perguntas da aula executiva)

| Pergunta | Evento/fonte durável | Situação |
|---|---|---|
| Quantos modelos já foram treinados — incluindo retreinos (total, por período, por usuário)? | `training.succeeded` (novo, worker); atribuição por usuário via join com `training.start` pelo `resource_id` | **lacuna** |
| Quantos insights de IA foram gerados por usuário? | `model.insight.generate` (já existe, com `userId`, `regenerate`, `llmModel`) | ok (falta só `projectName`) |
| Quais algoritmos mais vencem? | `training.succeeded.metadata.winningAlgorithm` (novo) | **lacuna** |
| Melhores acurácias por desafio de negócio? | `training.succeeded.metadata.primaryMetric` (novo) agrupado por `problemType` + `target`/`projectName` | **lacuna** |
| Que tipos de problema de negócio estão sendo resolvidos? | `training.start.metadata.problemType` + `target` + `projectName` | parcial (falta projectName) |
| Volume de predições — total, por projeto, por canal (web app, lote, API, MCP)? | `webapp.predict`, `webapp.predict_batch`, `api.predict`, `mcp.predict` (metadata.rows) | parcial (mcp/webapp sem `rows`) |
| Tipo de deploy mais utilizado? | `deployment.publish.metadata.type` + volume por canal acima | ok |
| Taxa de sucesso e duração dos treinos? | `training.succeeded`/`training.failed` (novos) | **lacuna** |
| Uso do Explore (perguntas à IA)? | `explore.message` (novo) | **lacuna** |
| Funil: cadastro → dataset → treino → predição → deploy | `auth.signup`, `dataset.upload`, `training.start`, `*.predict`, `deployment.publish` | ok |
| Consumo mensal de inferências por usuário | `inference_usage` | frágil (cascade de usuário) |

## Objetivos

- Nenhuma métrica da tabela acima é alterada por exclusão de projeto ou dataset
- O worker passa a registrar o desfecho de cada treino (hoje só o início é
  registrado, pelo web)
- Todos os eventos de predição carregam `rows` e `projectName`, permitindo
  agregação por projeto legível mesmo após a exclusão do projeto
- Um documento de consultas SQL prontas responde cada pergunta da aula
  executiva a partir de `audit_logs`

## User Stories

### US-001: Worker registra desfecho do treino em audit_logs
**Description:** Como admin do produto, quero que cada treino concluído (ou
falho) fique registrado permanentemente, para contar modelos treinados e
algoritmos vencedores mesmo depois que o projeto for excluído.

**Acceptance Criteria:**
- [ ] Ao concluir com sucesso, o worker insere em `audit_logs`:
      `action = 'training.succeeded'`, `org_id`, `resource_type = 'training_job'`,
      `resource_id = <training_job_id>`, e metadata com `projectId`,
      `projectName`, `datasetId`, `problemType`, `winningAlgorithm`,
      `durationSeconds` (updated_at − created_at do job) e o objeto de métricas
      resumido (mesmo shape gravado em `models.metrics`)
- [ ] A metadata inclui `primaryMetric: { name, value }` achatado no topo —
      `name` = `selectionMetric` do resultado (ex.: accuracy, mape, r2) e
      `value` = a métrica do candidato vencedor — para que "melhor acurácia por
      desafio" seja uma consulta SQL simples, sem varrer o array `candidates`
- [ ] Em falha terminal (status `failed`), insere `training.failed` com
      `problemType`, `projectId`, `projectName` e `errorMessage` truncada
- [ ] O INSERT do evento participa da mesma transação que atualiza o status do
      job (não pode haver treino concluído sem evento, nem evento de treino que
      foi revertido)
- [ ] Retry do mesmo job gera um novo evento (o histórico conta tentativas
      concluídas; a deduplicação por `resource_id` fica a cargo da consulta)
- [ ] `user_id` fica NULL (o worker não conhece o usuário; o disparo já está em
      `training.start` com o mesmo `resource_id` para join)
- [ ] Teste no worker cobrindo sucesso e falha (mesmo padrão de
      `tests/test_model_train.py`)

### US-002: Eventos de predição completos e consistentes
**Description:** Como admin, quero que todo evento de predição informe o volume
de linhas e o nome do projeto, para agregar volume por projeto/canal sem
depender de tabelas que sofrem cascade.

**Acceptance Criteria:**
- [ ] `webapp.predict` e `mcp.predict` passam a incluir `rows: 1` na metadata
      (hoje só os canais de lote/API têm `rows`)
- [ ] `webapp.predict`, `webapp.predict_batch`, `api.predict` e `mcp.predict`
      passam a incluir `projectName` na metadata
- [ ] `training.start`, `deployment.publish` e `model.insight.generate` também
      passam a incluir `projectName`
- [ ] Nenhum evento passa a incluir dados enviados pelo usuário (linhas do CSV,
      valores dos campos) — só contagens e identificadores
- [ ] Typecheck/lint passam

### US-003: Registro de uso do Explore
**Description:** Como admin, quero saber quanto os usuários conversam com a IA
do Explore, pois esse engajamento some quando o projeto (e seus chats) é
excluído.

**Acceptance Criteria:**
- [ ] A cada mensagem de usuário processada no Explore, gravar
      `explore.message` em `audit_logs` com `projectId`, `projectName` e
      `chatId` na metadata (sem o conteúdo da mensagem)
- [ ] Typecheck/lint passam

### US-004: Documento de consultas para a aula executiva
**Description:** Como admin, quero um documento com as consultas SQL prontas
para cada métrica, para extrair a visão executiva direto do banco enquanto não
existe UI.

**Acceptance Criteria:**
- [ ] Criar `docs/metricas-uso.md` com uma consulta por pergunta da tabela
      "Métricas-alvo" (modelos treinados por período, ranking de algoritmos,
      distribuição de problemType, volume de predições por canal/projeto/mês,
      deploy mais usado, taxa de sucesso e duração média de treino, funil de
      ativação)
- [ ] Incluir a consulta "melhores resultados por desafio de negócio": melhor
      `primaryMetric.value` por `problemType` + `target` (com `projectName`),
      **segmentada por nome de métrica** — acurácia/R² ordenam decrescente,
      MAPE/RMSE crescente, e valores de métricas diferentes nunca aparecem no
      mesmo ranking
- [ ] Incluir a consulta "modelos treinados por usuário (incluindo retreinos)":
      como `training.succeeded` tem `user_id` NULL (worker), a atribuição vem
      do join com `training.start` pelo `resource_id` (training_job_id)
- [ ] Incluir a consulta "insights de IA gerados por usuário" a partir de
      `model.insight.generate` (total e com/sem `regenerate`)
- [ ] Cada consulta roda no Postgres do produto sem parâmetros obrigatórios
      (filtros de período comentados)
- [ ] O documento explica as limitações do histórico: eventos só existem a
      partir da data em que cada `action` foi instrumentada (registrar as datas
      de corte conhecidas)
- [ ] Validar cada consulta contra o banco local de desenvolvimento

### US-005: Proteger o histórico contra exclusão de usuário
**Description:** Como admin, quero que a exclusão de um usuário não apague as
métricas agregadas de uso.

**Acceptance Criteria:**
- [ ] Migration alterando `audit_logs.user_id` para `ON DELETE SET NULL`
      (hoje a FK sem ação bloquearia/quebraria a exclusão do usuário; o evento
      deve sobreviver anonimizado)
- [ ] Documentar em `docs/metricas-uso.md` que `inference_usage` mantém o
      cascade de propósito (LGPD): o consumo mensal por usuário morre com o
      usuário, e o volume histórico agregado fica garantido pelos eventos de
      predição da US-002
- [ ] Typecheck/lint e migration aplicada com sucesso no banco local

## Functional Requirements

- FR-1: O worker deve inserir `training.succeeded`/`training.failed` em
  `audit_logs` na mesma transação da atualização de status do job, com a
  metadata descrita na US-001
- FR-2: Todos os eventos de predição devem carregar `rows` (inteiro ≥ 1) e
  `projectName` na metadata
- FR-3: `training.start` e `deployment.publish` devem carregar `projectName`
- FR-4: Nenhum evento de métrica pode conter dados de negócio do usuário
  (conteúdo de linhas, valores de predição, texto de mensagens) — apenas
  identificadores, contagens, tipos e nomes de projeto
- FR-5: `audit_logs.user_id` deve tolerar a exclusão do usuário (SET NULL)
  sem perder a linha do evento
- FR-6: As consultas de `docs/metricas-uso.md` devem produzir os mesmos
  resultados antes e depois de excluir um projeto ou dataset

## Non-Goals (fora de escopo)

- Nenhuma rota, página ou UI de admin (nem gate de permissão) nesta fase
- Nenhuma tabela nova de métricas ou agregação diária/materialized view —
  `audit_logs` cru é suficiente no volume atual do beta
- Nenhum backfill de histórico anterior à instrumentação (o que já se perdeu,
  se perdeu; registrar as datas de corte)
- Nenhuma exportação automática, agendamento ou integração com BI externo
- Não instrumentar eventos de leitura/navegação (page views)

## Technical Considerations

- `audit_logs` já existe com `metadata` JSONB e índice implícito por PK; se as
  consultas por `action` + `created_at` ficarem lentas, um índice
  `(action, created_at)` pode ser adicionado depois — não faz parte do MVP
- O worker (Python/psycopg) já escreve SQL direto no mesmo banco; o INSERT do
  evento segue o padrão dos comandos existentes em `jobs/model_train.py`
- O web usa `logAudit` (`src/lib/audit.ts`) — as US-002/US-003 são extensões de
  chamadas existentes, sem helper novo
- `models.trainingSnapshot` continua sendo o mecanismo de sobrevivência do
  **modelo vigente** à exclusão do dataset; este PRD cobre o **histórico**, são
  complementares

## Success Metrics

- Excluir um projeto com modelos e predições não altera nenhum número do
  relatório executivo (verificável rodando as consultas antes/depois)
- "Total de modelos treinados", "algoritmo mais vencedor" e "volume de
  predições por canal" respondíveis com uma única consulta cada
- Zero dados de conteúdo do usuário nos eventos (auditável por amostragem)

## Open Questions

- O evento `explore.message` deve contar tokens/custo de LLM (OpenRouter) para
  uma futura visão de custo por usuário, ou só a contagem de mensagens basta?
- Vale registrar `dataset.upload` com nº de linhas/colunas na metadata para a
  visão executiva de "tamanho das bases dos alunos"? (hoje não verificado)
- Quando houver exclusão de conta self-service, a anonimização por SET NULL é
  suficiente para LGPD ou será preciso também limpar IP/user agent dos eventos
  antigos do usuário?
