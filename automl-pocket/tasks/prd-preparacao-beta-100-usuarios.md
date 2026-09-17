# PRD: Preparação Beta — Prática com 100 usuários em VM única

## Introdução

A plataforma AutoML (Akkio) será usada numa prática com ~100 pessoas simultâneas, hospedada numa única VM via Coolify (Azure D8as_v7: 8 vCPUs, 32GB RAM, 128GB Premium SSD). A arquitetura atual processa treinos serialmente (1 por vez), grava artefatos de modelo sem compressão e não impõe limites por usuário — o que criaria fila de horas no treino e risco de esgotar o disco.

Este PRD cobre: (a) ajustes de concorrência e de consumo de disco no worker, (b) limites por usuário (armazenamento, inferências mensais, rate limit), (c) sinalização de Beta e canal de report de problemas, e (d) ajustes de UI no menu do projeto.

O objetivo NÃO é escalar horizontalmente — é eliminar gargalos e limitar o pior caso numa única máquina.

## Goals

- 100 usuários treinando modelos pequenos (1k–10k linhas × 12 colunas) com espera máxima de ~25 minutos no pior caso (pico absoluto) e percepção de fluidez no uso normal.
- Uso de disco do volume `uploads` matematicamente limitado (quota por usuário) e sem vazamentos (órfãos removidos).
- Custo de inferência limitado a 5.000 predições/mês por usuário.
- Todos os endpoints de escrita protegidos por rate limit por usuário.
- Usuários cientes de que o produto está em Beta, com canal fácil de report de problemas (screenshot + logs automáticos).
- Menu do projeto com rótulo "Predição" e ícones em todos os itens.

## User Stories

### US-001: Concorrência na fila de treino
**Description:** Como aluno da prática, quero que meu treino comece logo mesmo com outros treinos em andamento, para não esperar uma fila serial.

**Acceptance Criteria:**
- [ ] `Worker("training", ...)` em `apps/worker/main.py` criado com `{"concurrency": 4}` (valor via env `TRAINING_CONCURRENCY`, default 4)
- [ ] 4 jobs `model:train` enfileirados juntos rodam simultaneamente (verificável nos logs do worker: 4 "model:train recebido" antes do primeiro "treinado com sucesso")
- [ ] Filas `datasets` e `predictions` seguem funcionando (testes existentes passam)
- [ ] Testes do worker passam (`pytest` em `apps/worker`)

### US-002: Limitar paralelismo interno de cada treino
**Description:** Como operador, quero que cada treino use no máximo 2 núcleos, para que 4 treinos simultâneos não disputem os 8 vCPUs entre si e com o Postgres/web.

**Acceptance Criteria:**
- [ ] `RandomForestClassifier`/`RandomForestRegressor` em `apps/worker/jobs/automl.py` usam `n_jobs=2` (via constante `MODEL_N_JOBS`, sobrescrevível por env) em vez de `n_jobs=-1`
- [ ] `XGBClassifier`/`XGBRegressor` recebem `n_jobs=2` pela mesma constante
- [ ] `OMP_NUM_THREADS=2` definido no environment do serviço worker nos dois docker-compose (dev e prod), cobrindo as threads BLAS do MLP
- [ ] Testes do worker passam

### US-003: Compressão do artefato do modelo
**Description:** Como operador, quero artefatos `.joblib` comprimidos, porque Random Forests sem compressão podem ocupar centenas de MB cada e são o maior consumidor de disco da plataforma.

**Acceptance Criteria:**
- [ ] `joblib.dump(..., compress=3)` em `apps/worker/jobs/model_train.py`
- [ ] `joblib.load` existente (predição individual e em lote) segue funcionando sem mudanças
- [ ] Teste comprova que um artefato de Random Forest comprimido é menor que o equivalente sem compressão
- [ ] Testes do worker passam

### US-004: Remover artefato órfão ao retreinar o projeto
**Description:** Como operador, quero que ao concluir um novo treino de um projeto o artefato do treino anterior seja removido do disco, pois só o modelo mais recente é usado pela UI.

**Acceptance Criteria:**
- [ ] Ao inserir a nova linha em `models`, o worker identifica o(s) modelo(s) anterior(es) do mesmo `project_id`, remove a(s) linha(s) e apaga o(s) arquivo(s) `models/*.joblib` correspondente(s) do volume
- [ ] Remoção de arquivo é best-effort (arquivo ausente não falha o treino)
- [ ] Retry do mesmo `training_job_id` continua substituindo o próprio modelo sem duplicar (comportamento atual preservado)
- [ ] Testes do worker passam

### US-005: Remover parquets de versão ao deletar dataset
**Description:** Como operador, quero que deletar um dataset remova também os parquets de todas as suas versões (`dataset_versions`), pois hoje esses arquivos ficam órfãos no volume para sempre.

**Acceptance Criteria:**
- [ ] O delete de dataset (`apps/web/src/app/(app)/datasets/actions.ts` e o fluxo equivalente em `projects/actions.ts`) busca os `parquet_path` de `dataset_versions` do dataset antes da transação e chama `removeFileQuiet` para cada um, além do `filePath` e `parquetPath` já removidos
- [ ] Comportamento verificado por teste (arquivos de versão somem do diretório após o delete)
- [ ] Typecheck/lint passam

### US-006: Reduzir limite de upload para 10MB
**Description:** Como operador, quero o limite de upload em 10MB durante a prática, suficiente para planilhas de 10k linhas × 12 colunas (~1–2MB) com folga.

**Acceptance Criteria:**
- [ ] Default de `MAX_UPLOAD_MB` alterado de 50 para 10 nos dois docker-compose (o código já lê a env; nenhuma lógica nova)
- [ ] Mensagem de erro do upload continua refletindo o limite vigente (já dinâmica em `upload-validation.ts` — apenas confirmar)
- [ ] README/instruções de deploy mencionam a env

### US-007: Quota de armazenamento por usuário
**Description:** Como operador, quero um teto de armazenamento por usuário (uploads + parquets + artefatos), para que o pior caso de disco com 100 usuários seja limitado.

**Acceptance Criteria:**
- [ ] Nova coluna `size_bytes` em `datasets` (migration), preenchida no upload com `file.size`; após o parse, o worker soma o tamanho do parquet gerado; transformações somam o tamanho de cada parquet de versão
- [ ] Tamanho do artefato `.joblib` registrado em `models` (coluna `size_bytes`) após o dump
- [ ] Função `getUserStorageUsage(userId)` soma datasets (`created_by`) + artefatos de modelos de projetos criados pelo usuário
- [ ] Upload rejeitado com HTTP 413 e mensagem em português quando `uso atual + file.size > quota`; quota via env `STORAGE_QUOTA_MB` (default 200)
- [ ] Página de datasets exibe o uso atual do usuário (ex.: "134 MB de 200 MB usados")
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-008: Limite de 5.000 inferências por mês por usuário
**Description:** Como operador, quero limitar cada usuário a 5.000 predições por mês, para conter o custo de inferência do web app publicado e da tela de Predição.

**Acceptance Criteria:**
- [ ] Contador mensal por usuário (tabela `inference_usage` com `user_id`, `year_month`, `count`, incremento atômico) — dono do modelo/projeto é o usuário contabilizado nas rotas públicas do web app publicado
- [ ] Predição individual incrementa pelo nº de linhas enviadas; predição em lote incrementa pelo nº de linhas do arquivo
- [ ] Requisição que excederia o limite é rejeitada ANTES de enfileirar o job, com HTTP 429 e mensagem em português informando o limite e quando reseta
- [ ] Limite via env `MONTHLY_INFERENCE_LIMIT` (default 5000)
- [ ] Uso mensal visível na tela de Predição (ex.: "1.240 de 5.000 predições este mês")
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-009: Rate limit por usuário nos endpoints de escrita
**Description:** Como operador, quero rate limit por usuário nas ações custosas, para que um usuário (ou script) não monopolize a fila e os recursos da VM.

**Acceptance Criteria:**
- [ ] Reutilizando `enforceRateLimit` (já aplicado no upload com 15/min), aplicar: iniciar treino (5/min), predição individual (30/min), predição em lote (5/min), transformações do Prepare (20/min), perguntas do Explore (10/min)
- [ ] Limites definidos em constantes num único módulo, com comentário explicando cada valor
- [ ] Resposta 429 com mensagem em português consistente com a atual
- [ ] Typecheck/lint passam

### US-010: Badge "Beta" no produto
**Description:** Como usuário, quero ver que o produto está em Beta, para calibrar minhas expectativas e entender o convite a reportar problemas.

**Acceptance Criteria:**
- [ ] Badge "Beta" ao lado do logo/nome do app no navbar principal e no `ProjectNavbar`
- [ ] Estilo discreto (badge pequeno, tom neutro/acento), sem quebrar o layout em telas estreitas
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-011: Reportar problema — captura e envio
**Description:** Como usuário Beta, quero um botão "Reportar problema" que abre um modal com captura de tela e logs coletados automaticamente, mais um campo de comentário, para reportar bugs sem esforço.

**Acceptance Criteria:**
- [ ] Botão "Reportar problema" visível no navbar (junto ao badge Beta)
- [ ] Coletor global no client que mantém buffer em memória dos últimos 50 eventos: erros de `console.error`, `window.onerror`/`unhandledrejection` e respostas HTTP ≥ 400, com timestamp e URL
- [ ] Ao abrir o modal: captura de tela automática da página (biblioteca client-side, ex. `html2canvas` ou equivalente; sem depender de permissão de share screen), com preview no modal
- [ ] Modal exibe: preview da captura (com opção de remover), resumo dos logs anexados e campo de comentário opcional
- [ ] Envio grava em nova tabela `problem_reports` (`user_id`, `org_id`, `url`, `user_agent`, `comment`, `logs` jsonb, `screenshot_path`, `created_at`); screenshot salvo no volume em `reports/`
- [ ] Screenshots contam na quota de armazenamento? NÃO — ficam fora da quota, mas limitados a 2MB (reencode/resize client-side)
- [ ] Confirmação de sucesso ao usuário ("Obrigado! Recebemos seu report.")
- [ ] Rate limit: 5 reports/hora por usuário
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-012: Renomear menu "Prever" para "Predição"
**Description:** Como usuário, quero ver o item de menu "Predição", nomenclatura mais clara para a etapa.

**Acceptance Criteria:**
- [ ] Label da aba `predict` em `apps/web/src/app/(project)/projects/[projectId]/layout.tsx` alterado para "Predição"
- [ ] Demais textos user-facing que se referem à aba pelo nome antigo atualizados (buscar "Prever" nos `.tsx`; não alterar chaves técnicas como `key: "predict"` nem rotas)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-013: Ícones nos itens do menu superior do projeto
**Description:** Como usuário, quero um ícone em cada item do menu do projeto (Preparar, Explorar, Predição, Publicar, Relatórios), para escanear a navegação mais rápido.

**Acceptance Criteria:**
- [ ] Cada `ProjectTab` ganha um ícone de `lucide-react` (já é dependência): Preparar = `Wrench` ou `SlidersHorizontal`, Explorar = `Search` ou `Compass`, Predição = `Sparkles` ou `TrendingUp`, Publicar = `Rocket`, Relatórios = `BarChart3`
- [ ] Ícone renderizado à esquerda do label, tamanho 16px, herdando a cor do estado (ativo/inativo/desabilitado)
- [ ] Layout não quebra em telas estreitas (ícones podem ficar sozinhos com tooltip OU manter label — decidir na implementação mantendo consistência)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: A fila `training` deve processar até 4 jobs simultâneos (env `TRAINING_CONCURRENCY`, default 4).
- FR-2: Cada treino deve usar no máximo 2 núcleos (`n_jobs=2` em RF/XGBoost; `OMP_NUM_THREADS=2` no worker).
- FR-3: Artefatos `.joblib` devem ser gravados com `compress=3`.
- FR-4: Ao concluir um treino, artefatos de modelos anteriores do mesmo projeto devem ser removidos (banco + disco).
- FR-5: Deletar um dataset deve remover do disco todos os parquets de `dataset_versions`, além do arquivo original e do parquet atual.
- FR-6: O limite de upload default deve ser 10MB (env `MAX_UPLOAD_MB`).
- FR-7: O sistema deve rastrear bytes armazenados por usuário (datasets, parquets de versão, artefatos) e rejeitar uploads que excedam a quota (env `STORAGE_QUOTA_MB`, default 200), exibindo o uso na UI.
- FR-8: O sistema deve contabilizar inferências por usuário/mês (individual = nº de linhas; lote = nº de linhas do arquivo) e rejeitar com 429 quando exceder `MONTHLY_INFERENCE_LIMIT` (default 5000), antes de enfileirar o job.
- FR-9: Endpoints de escrita (treinar, prever, prever em lote, transformar, explorar, reportar problema) devem ter rate limit por usuário via `enforceRateLimit`, com limites centralizados num módulo.
- FR-10: A UI deve exibir um badge "Beta" nos navbars.
- FR-11: O botão "Reportar problema" deve abrir modal com screenshot automático (client-side), logs recentes coletados automaticamente e comentário opcional, persistindo em `problem_reports` + screenshot no volume.
- FR-12: A aba `predict` deve exibir o label "Predição".
- FR-13: Cada item do menu do projeto deve exibir um ícone `lucide-react` à esquerda do label.

## Non-Goals (Out of Scope)

- Escala horizontal (réplicas de worker, fila distribuída, storage externo tipo S3) — o alvo é uma única VM.
- Cobrança/planos pagos ou upgrade de quota self-service.
- Painel de administração completo para visualizar `problem_reports` (consulta via SQL/psql basta nesta fase; ver Open Questions).
- Integração do report de problemas com ferramentas externas (Slack, e-mail, Sentry).
- Quota de armazenamento por organização (o corte é por usuário).
- Alterar rotas/URLs ao renomear "Prever" (só o label muda).
- Limpeza retroativa de órfãos já existentes no volume (pode ser feita manualmente antes da prática).

## Design Considerations

- Badge Beta: usar o componente de badge existente (shadcn/ui) com variante discreta; posicionado após o nome do app.
- Modal de report: usar o Dialog existente; preview da screenshot com altura máxima e scroll; indicar claramente o que será enviado (transparência sobre logs coletados).
- Indicadores de uso (armazenamento e inferências): texto pequeno + barra de progresso simples; tom de alerta a partir de 80% do limite.
- Ícones do menu: 16px, `stroke-width` padrão do lucide, alinhados verticalmente com o label.

## Technical Considerations

- BullMQ Python: a opção `concurrency` é suportada nas opts do `Worker`; os jobs já rodam via `asyncio.to_thread`, então 4 threads simultâneas de treino são seguras (sklearn libera o GIL nas partes pesadas).
- `n_jobs` e `OMP_NUM_THREADS` interagem: RF/XGBoost respeitam `n_jobs`; MLP (BLAS) respeita `OMP_NUM_THREADS`. Definir ambos.
- Contador de inferências: usar `INSERT ... ON CONFLICT ... DO UPDATE SET count = count + N` para atomicidade; chave `(user_id, year_month)`.
- Nas rotas públicas do web app publicado (`/app/[slug]`), não há sessão do consumidor final — contabilizar inferências e quota no DONO do deployment.
- `html2canvas` (ou similar) tem limitações com CSS moderno; validar visualmente a captura nas telas principais. Alternativa aceitável: capturar apenas viewport com resize para ≤2MB.
- A quota de armazenamento conta o que já está registrado no banco; órfãos pré-existentes no volume não contam (limpeza manual antes da prática).
- Migrations: `size_bytes` em `datasets` e `models` como `bigint` nullable (linhas antigas ficam null e contam como 0).

## Success Metrics

- Pior caso de fila de treino com 100 jobs simultâneos ≤ ~25 minutos (4 simultâneos × ~1 min/job).
- Uso do volume `uploads` durante a prática ≤ 25GB (quota 200MB × 100 usuários + artefatos comprimidos).
- Artefato médio de modelo ≤ 10MB após compressão.
- Zero incidentes de disco cheio ou OOM durante a prática.
- ≥ 90% dos problemas relatados pelos alunos chegam via modal de report (e não por canais paralelos).

## Open Questions

1. Quota de armazenamento: 200MB por usuário está adequado para a prática, ou preferimos 100MB (mais conservador) já que os arquivos-alvo têm ~2MB?
2. Onde visualizar os `problem_reports`? SQL direto basta nesta fase, ou vale uma página `/admin/reports` mínima (lista + screenshot)?
3. O limite de 5.000 inferências/mês zera no dia 1º do mês-calendário ou 30 dias após o primeiro uso? (Assumido: mês-calendário.)
4. Os limites de rate limit propostos na US-009 (treino 5/min, predição 30/min, lote 5/min, transform 20/min, explore 10/min) precisam de ajuste fino?
5. O menu superior citado inclui também o navbar global (Projetos/Datasets), ou apenas as abas do projeto? (Assumido: abas do projeto; estender ao global é trivial se desejado.)
