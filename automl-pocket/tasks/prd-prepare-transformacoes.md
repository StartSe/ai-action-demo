# PRD: Prepare — Tipos de Coluna, Clean Dataset e Versionamento de Transformações

## Introdução

A tela Prepare hoje exibe a grade com distribuições no cabeçalho e sidebar de detalhes da coluna, mas o tipo inferido de cada coluna é fixo, o botão "Limpar" é um placeholder desabilitado e nenhuma transformação é possível. Este PRD adiciona três capacidades inspiradas no Prepare da plataforma de referência (screenshots de referência anexados à conversa de 2026-08-21):

1. **Seletor de tipo por coluna** no cabeçalho da grade: badge colorido com dropdown (Número, Texto, Categoria, Datetime — e ID, que continua sendo inferido). Mudar o tipo reprocessa a coluna no worker (conversão de valores, stats, distribuição e correlações) e vale para o treinamento; valores inconversíveis viram nulos com aviso.
2. **Função Clean dataset**: modal com as operações da plataforma de referência (padronizar datas, remover nulos inesperados, agrupar categorias excedentes em "Outros", remover colunas constantes/ilegíveis/vazias, flag de outliers), com botão Preview antes de aplicar.
3. **Versionamento de transformações**: toda transformação aplicada (clean ou mudança de tipo) gera um chip no cabeçalho da grade (ex.: "Data Cleaning ×"), com **desfazer linear** — só o último chip pode ser removido, voltando à versão anterior.

Estado atual relevante: grade em `apps/web/src/app/(project)/projects/[projectId]/prepare/prepare-view.tsx` (TanStack Table v8), tipos em `dataset_columns.type` (`number|category|text|date|id`), stats/correlações em JSONB, Parquet ativo em `datasets.parquet_path`, worker Python com jobs `dataset:parse`/`dataset:profile` na fila BullMQ "datasets".

## Objetivos

- Permitir corrigir a inferência de tipo de qualquer coluna em 2 cliques, com reprocessamento completo.
- Oferecer limpeza de dados guiada (as 8 operações da plataforma de referência) com preview antes de aplicar.
- Toda transformação é reversível: histórico linear de versões visível no cabeçalho, desfazer com 1 clique.
- O treinamento sempre usa a versão ativa do dataset.

## User Stories

> Numeração continua a partir de US-034 do `prd.json` atual (`ralph/correcoes-ux`).

### US-035: Schema de versões de dataset
**Description:** Como desenvolvedor, preciso armazenar versões imutáveis do dataset para suportar transformações reversíveis.

**Acceptance Criteria:**
- [ ] Nova tabela `dataset_versions`: `id`, `org_id`, `dataset_id` (FK), `parent_version_id` (FK nullable), `kind` (`original | clean | type_change`), `label` (texto do chip, ex.: "Data Cleaning"), `params` JSONB (operações/coluna+tipo aplicados), `parquet_path`, `row_count`, `column_count`, `columns_snapshot` JSONB (nome, tipo, stats, correlations por coluna), `created_at`, `updated_at`
- [ ] `datasets` ganha `current_version_id` (FK nullable para `dataset_versions`)
- [ ] Migration gerada com `npx drizzle-kit generate` e aplicada com sucesso
- [ ] Helper `getActiveParquetPath(dataset)` em `src/lib/` (ou equivalente) retorna o parquet da versão ativa, com fallback para `datasets.parquet_path` quando `current_version_id` é nulo — adotado nos pontos que leem o parquet no web (prepare, treinamento via config do job)
- [ ] Backfill não é necessário: datasets existentes seguem funcionando com `current_version_id` nulo (versão "original" implícita)
- [ ] Typecheck passes

### US-036: Worker — job `dataset:transform`
**Description:** Como desenvolvedor, preciso de um job no worker que aplique uma transformação sobre o parquet ativo, gere novo parquet e registre a versão.

**Acceptance Criteria:**
- [ ] Novo job `dataset:transform` na fila "datasets", payload `{ datasetId, kind: "clean" | "type_change", params }`
- [ ] `kind: "type_change"`, `params: { column, newType }`: converte a coluna para o novo tipo (number/text/category/date); valores inconversíveis viram nulos e o job registra `convertedNulls` (contagem) em `params` da versão
- [ ] `kind: "clean"`, `params: { operations: [...] }`: aplica as operações selecionadas (definidas na US-038) na ordem: padronizar datas → remover colunas (constantes, ilegíveis, vazias) → agrupar categorias em "Outros" → remover nulos inesperados → flag outliers
- [ ] Gera novo parquet em `UPLOAD_DIR/<uuid>.parquet` (nunca sobrescreve o anterior), re-perfila (reusa a lógica de `dataset:profile`) e grava `dataset_versions` com `columns_snapshot`, `row_count`, `column_count`; atualiza `datasets.current_version_id`, `row_count`, `column_count` e `dataset_columns` (fonte da grade)
- [ ] Durante o processamento, `datasets.status = 'profiling'`; ao final volta a `ready` (ou `error` com `error_message` em português, sem criar versão)
- [ ] Testes do worker cobrem: conversão com inconversíveis → nulos, cada operação de clean, e que o parquet anterior permanece intacto
- [ ] Typecheck passes
- [ ] Tests pass

### US-037: Seletor de tipo no cabeçalho da grade
**Description:** Como usuária, quero ver e alterar o tipo de cada coluna direto no cabeçalho da grade, como na plataforma de referência.

**Acceptance Criteria:**
- [ ] Cada coluna exibe badge de tipo colorido logo abaixo do nome, como dropdown (chevron): Número=verde, Texto=azul, Categoria=laranja/âmbar, Datetime=roxo, ID=cinza
- [ ] Dropdown lista os 5 tipos com o atual selecionado; escolher outro dispara server action que valida via finder de `org-scope` e enfileira `dataset:transform` com `kind: "type_change"`
- [ ] Enquanto processa, a coluna mostra estado de processamento (badge com spinner/pulse) e a grade atualiza via polling já existente quando `status` volta a `ready`
- [ ] Se a conversão gerou nulos (`convertedNulls > 0`), toast/aviso em português informando a quantidade
- [ ] Sidebar de detalhes da coluna reflete o novo tipo, stats e distribuição após o reprocessamento
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-038: Modal Clean dataset
**Description:** Como usuária, quero limpar o dataset com operações guiadas e ver um resumo do impacto antes de aplicar.

**Acceptance Criteria:**
- [ ] Botão "Limpar" da toolbar do Prepare deixa de ser placeholder e abre o modal "Limpar dataset"
- [ ] Modal com as 8 operações (checkbox, marcadas por padrão exceto a última), textos em português: 1) Padronizar colunas de data (ISO 8601); 2) Remover nulos inesperados (linhas com nulo em colunas ≥99% preenchidas); 3) Substituir categorias excedentes por "Outros" (fora do top 32); 4) Remover colunas constantes; 5) Remover colunas numéricas majoritariamente ilegíveis (≥99%); 6) Remover colunas de data majoritariamente ilegíveis (≥99%); 7) Remover colunas majoritariamente vazias (≥99%); 8) Marcar outliers (nova coluna flag por coluna numérica: >3 desvios da média, acima do P99 ou abaixo do P1) — desmarcada por padrão
- [ ] Botão "Pré-visualizar" mostra resumo do impacto estimado calculado a partir de `dataset_columns.stats` (sem rodar o worker): colunas que serão removidas (nomes), colunas de data a padronizar, categorias a agrupar, estimativa de linhas afetadas por nulos
- [ ] Botão "Aplicar" enfileira `dataset:transform` com `kind: "clean"` e as operações marcadas; modal fecha e a grade mostra estado de processamento até `ready`
- [ ] Operações sem efeito no dataset atual aparecem com nota "sem efeito neste dataset" no preview
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-039: Chips de versionamento e desfazer linear
**Description:** Como usuária, quero ver no cabeçalho as transformações aplicadas e poder voltar à versão anterior.

**Acceptance Criteria:**
- [ ] Cabeçalho do Prepare mostra, ao lado do nome do arquivo e de "N linhas, M colunas", um chip por transformação aplicada, em ordem (ex.: "Data Cleaning", "Tipo: Valor → Número")
- [ ] Apenas o último chip tem "×" (desfazer linear); os anteriores aparecem sem ação, com tooltip descrevendo a transformação (a partir de `params`)
- [ ] Clicar no "×" pede confirmação e reverte: `datasets.current_version_id` aponta para `parent_version_id`, `dataset_columns`/`row_count`/`column_count` são restaurados do `columns_snapshot` da versão anterior (da versão original: re-derivar do parquet original via re-profile) — sem retreinar nem rodar clean de novo
- [ ] Reversão é server action com finder de `org-scope`, registrada em `audit_logs`; a versão desfeita é removida (e seu parquet apagado do disco)
- [ ] "N linhas, M colunas" do cabeçalho reflete a versão ativa
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-040: Integração fim a fim com treinamento e download
**Description:** Como usuária, quero que o modelo treine e o download reflita os dados transformados que estou vendo.

**Acceptance Criteria:**
- [ ] O pipeline de treinamento (web enfileira, worker lê parquet) usa o parquet da versão ativa; treinar após um clean usa os dados limpos
- [ ] A tela Predict lista as colunas da versão ativa (colunas removidas pelo clean não aparecem como alvo/features)
- [ ] `GET /api/datasets/[datasetId]/download` passa a oferecer o dado da versão ativa em CSV (ou mantém o arquivo original com parâmetro explícito `?original=true`)
- [ ] E2E verificado no browser: upload → mudar tipo de uma coluna → clean → treinar → relatório abre; desfazer o clean e conferir que a grade volta
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: Cada coluna da grade do Prepare deve exibir seu tipo como badge colorido com dropdown para alterar entre Número, Texto, Categoria, Datetime e ID.
- FR-2: Alterar o tipo deve reprocessar a coluna no worker (conversão, stats, distribuição, correlações); valores inconversíveis viram nulos e o usuário é avisado da quantidade.
- FR-3: O botão "Limpar" deve abrir modal com as 8 operações de limpeza, com preview de impacto antes de aplicar.
- FR-4: Toda transformação aplicada (clean ou mudança de tipo) deve criar uma versão imutável com novo parquet, nunca sobrescrevendo o anterior.
- FR-5: O cabeçalho do Prepare deve exibir um chip por transformação, em ordem de aplicação.
- FR-6: Apenas a última transformação pode ser desfeita (desfazer linear); desfazer restaura a versão anterior sem reprocessamento pesado (via snapshot).
- FR-7: Treinamento, listagem de colunas no Predict e download devem usar a versão ativa do dataset.
- FR-8: Transformações e reversões devem ser autorizadas por org (finders de `org-scope`) e auditadas em `audit_logs`.

## Non-Goals (Out of Scope)

- Edição célula a célula ou fórmulas na grade.
- Função "Combinar" (merge de datasets) — o botão permanece como está.
- Remover/reordenar chips do meio do histórico (desfazer é estritamente linear).
- Branching de versões ou comparação lado a lado entre versões.
- Transformações customizadas além das 8 operações listadas.
- Re-treinamento automático após transformação (o usuário treina de novo quando quiser).

## Design Considerations

- Referência visual: screenshots da plataforma de referência na conversa de 2026-08-21 (grade com badges de tipo, modal Clean dataset, chip "Data Cleaning ×" no cabeçalho).
- Cores dos badges: verde=Número, azul=Texto, laranja/âmbar=Categoria, roxo=Datetime, cinza=ID — usar variantes do `Badge` shadcn já existente.
- Modal com `Dialog` shadcn; chips com `Badge` + botão "×"; confirmação de desfazer com `AlertDialog`.
- Textos todos em português (o produto é para aulas em pt-BR); "Clean dataset" → "Limpar dataset".
- A grade e o polling de status já existem (`prepare-view.tsx` + `router.refresh()`); reutilizar, não recriar.

## Technical Considerations

- `dataset_columns` continua sendo a fonte da grade (sempre reflete a versão ativa); `columns_snapshot` em `dataset_versions` serve só para restaurar no desfazer.
- O job `dataset:transform` deve reusar a lógica de profiling existente do worker (`jobs/` — mesmo shape de stats/correlations dos JSONB documentados no progress.txt).
- Concorrência: bloquear nova transformação enquanto `datasets.status != 'ready'` (server action valida e retorna erro em português).
- Parquet de versões antigas fica em disco até a versão ser desfeita (apagar no desfazer) — sem GC adicional neste PRD.
- Flag outliers cria colunas novas (`<coluna>_outlier`), que entram no re-profile como categoria/number normalmente.
- pandas do worker é novo (pandas 3): cuidado com datetime64[us] e atribuição de string em coluna float (padrões já documentados no progress.txt).

## Success Metrics

- Corrigir o tipo de uma coluna leva no máximo 2 cliques e termina em segundos para datasets de aula (<200k linhas).
- Aplicar clean com preview leva no máximo 3 cliques.
- Desfazer restaura a grade em menos de 2s (snapshot, sem reprocessar).
- Modelo treinado após clean usa exatamente os dados exibidos na grade.

## Open Questions

- Ao mudar o tipo de uma coluna para ID (coluna ignorada no treino), deve haver aviso de que ela sai das features?
- O limite de "top 32" categorias do agrupamento em "Outros" deve ser configurável no modal ou fixo como na plataforma de referência?
- Datasets vinculados a modelos já treinados: transformar depois de treinar não invalida o modelo/relatório existente (o relatório é da época do treino) — precisa de aviso visual de "dados mudaram desde o treino"?
