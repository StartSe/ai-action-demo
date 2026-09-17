# PRD: Deployments — Web App, API e MCP

## Introdução

Depois de treinar um modelo, a plataforma hoje só permite ver o Insights Report — não há como **usar** o modelo para prever novos dados. Este PRD adiciona a etapa de implantação (Deploy), inspirada na tela "Deployments" da plataforma de referência (screenshots de referência anexados à conversa de 2026-08-21): o usuário escolhe um endpoint para publicar o modelo em três formatos:

1. **Web App**: formulário interativo público (link secreto, sem login) com um campo por feature selecionada, botão de prever e resultado na tela; aceita também upload de CSV/XLSX para predição em lote.
2. **API**: endpoint HTTP autenticado por chave, com sample request (curl) e sample response exibidos na tela de configuração.
3. **MCP**: servidor MCP que expõe a predição como tool, para uso em clientes como Claude (demonstração de IA agentic nas aulas).

Diferente da plataforma de referência, a tela principal mostra **apenas** os três endpoints suportados — sem cards desabilitados de Zapier/Salesforce/Snowflake (coerente com a decisão de não exibir opções que não funcionam).

Estado atual relevante: modelos treinados ficam em `models` (`problem_type`, `winning_algorithm`, `metrics`, `insights`, `artifact_path` → joblib com `{pipeline, problem_type, target, feature_columns, classes, winning_algorithm}`); o `predict()` do artefato aceita linhas cruas e devolve índices mapeáveis por `classes`. Navbar do projeto em `project-navbar.tsx` com abas Prepare/Predict/Reports. Rate limiting via `enforceRateLimit` (`src/lib/rate-limit.ts`), autorização via finders de `src/lib/org-scope.ts`, auditoria em `audit_logs`.

## Objetivos

- Publicar um modelo treinado como Web App público em menos de 1 minuto (título, campos, Publicar).
- Permitir predição individual (formulário) e em lote (arquivo) sem conta na plataforma.
- Expor predição por API com chave revogável, com exemplo de uso copiável.
- Expor predição via MCP tool para clientes MCP.
- Predição síncrona com latência aceitável para uso interativo (worker responde via fila).

## User Stories

> Numeração continua a partir de US-040 do `prd.json` atual (`ralph/prepare-transformacoes`).

### US-041: Schema de deployments e aba Deploy
**Description:** Como usuária, quero uma aba Deploy no projeto com os endpoints disponíveis para publicar meu modelo.

**Acceptance Criteria:**
- [ ] Nova tabela `deployments`: `id`, `org_id`, `project_id` (FK), `model_id` (FK), `type` (`web_app | api | mcp`), `status` (`draft | published`), `title`, `description` (nullable), `fields` JSONB (colunas selecionadas), `public_slug` (unique, nullable), `api_key_hash` (nullable), `api_key_prefix` (nullable), `created_at`, `updated_at`; migration gerada e aplicada
- [ ] Nova rota `/projects/[projectId]/deploy` com aba "Deploy" no `ProjectNavbar` (entre Predict e Reports), habilitada apenas quando o projeto tem modelo treinado; sem modelo, tooltip "Treine um modelo para publicar"
- [ ] Tela mostra 3 cards (API, Web App, MCP) no estilo da plataforma de referência, cada um com status "Não publicado"/"Publicado"; clicar abre a configuração do endpoint (telas das stories seguintes)
- [ ] Modelos de forecasting não são publicáveis nesta versão: cards desabilitados com aviso "Implantação disponível para classificação e regressão"
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-042: Worker — predição síncrona (`model:predict`)
**Description:** Como desenvolvedor, preciso de um caminho de inferência que receba linhas e devolva predições em segundos.

**Acceptance Criteria:**
- [ ] Novo job `model:predict` em fila BullMQ "predictions", payload `{ modelId, rows: [{col: valor}] }`; worker carrega o joblib de `artifact_path` (cache em memória por `modelId`) e devolve como retorno do job: classificação → `[{prediction, probability, probabilities: {classe: p}}]`; regressão → `[{prediction}]`
- [ ] Helper `runPrediction(modelId, rows)` no web (`src/lib/predictions.ts`): enfileira e espera o resultado via `QueueEvents.waitUntilFinished` com timeout de 30s; timeout/erro retorna mensagem em português
- [ ] Linhas com colunas faltantes são aceitas (valores viram nulos para o pipeline); colunas desconhecidas são ignoradas
- [ ] Testes do worker: classificação e regressão com artefato real pequeno, linha com valor faltante, e modelId inexistente → erro limpo
- [ ] Typecheck passes
- [ ] Tests pass

### US-043: Configuração e publicação do Web App
**Description:** Como usuária, quero configurar título, descrição e campos do formulário e publicá-lo com um link.

**Acceptance Criteria:**
- [ ] Tela de configuração do Web App (a partir do card): sidebar com Título (default: nome do projeto), Descrição (opcional) e "Selecionar campos" (checkbox por feature do modelo — o alvo nunca aparece; "Selecionar todos" disponível; mínimo 1 campo)
- [ ] Painel direito mostra preview ao vivo do formulário (mesma renderização da página pública) refletindo título/descrição/campos em tempo real
- [ ] Botão "Publicar" gera `public_slug` aleatório não adivinhável (≥16 chars url-safe), salva o deployment como `published` e exibe a URL pública com botão copiar; "Despublicar" invalida o link (status `draft`, slug removido); republicar gera slug novo
- [ ] Alterações de configuração com o deployment publicado são salvas e refletem imediatamente na página pública
- [ ] Ações auditadas em `audit_logs` (`deployment.publish`, `deployment.unpublish`, `deployment.update`)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-044: Página pública do Web App — formulário interativo
**Description:** Como pessoa com o link, quero preencher o formulário e ver a predição sem precisar de conta.

**Acceptance Criteria:**
- [ ] Rota pública `/app/[slug]` (fora do gate de auth no `proxy.ts`), renderiza título, descrição e um campo por feature selecionada: number → input numérico; category → select com as categorias das stats da coluna (+ opção de digitar outro valor); text → input texto; date → date picker
- [ ] Botão "Prever" chama `runPrediction` com a linha preenchida; resultado exibido em card destacado: classificação → classe prevista + probabilidade em % (e demais classes em lista secundária); regressão → valor previsto formatado pt-BR
- [ ] Estados: pending no botão durante a predição; erro em português com "Tentar novamente" se o worker falhar/estourar timeout
- [ ] Slug inválido ou deployment despublicado → página 404 amigável em português
- [ ] Rate limiting por IP na predição pública via `enforceRateLimit`; nenhuma informação da org/projeto além de título/descrição é exposta
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-045: Web App — predição em lote por arquivo
**Description:** Como pessoa com o link, quero enviar um CSV/XLSX e receber o arquivo com a coluna de predição preenchida.

**Acceptance Criteria:**
- [ ] Abaixo do formulário, área "Enviar CSV, XLSX ou XLS" (mesmos limites e validação de assinatura de `upload-validation.ts`)
- [ ] O arquivo é processado pelo worker (variante em lote do `model:predict` lendo o arquivo; sem persistir dataset): devolve arquivo CSV com as colunas originais + coluna `predicao` (e `probabilidade` na classificação), baixado automaticamente
- [ ] Limite de linhas por arquivo (ex.: 10.000) com mensagem clara quando excedido; progresso/estado de processamento visível durante o lote
- [ ] Linhas com colunas ausentes do modelo seguem a mesma regra da US-042 (nulos); arquivo sem nenhuma coluna do modelo → erro em português
- [ ] Arquivos temporários do lote são removidos após o download/expiração
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-046: Deployment API — chave e endpoint de predição
**Description:** Como usuária, quero publicar o modelo como API e ver exemplos de uso para integrar de fora.

**Acceptance Criteria:**
- [ ] Tela de configuração da API (a partir do card): seleção de campos (como no Web App) e botão "Publicar" que gera `api_key` aleatória (≥32 chars), exibida **uma única vez** com botão copiar; no banco fica apenas `api_key_hash` (SHA-256) + `api_key_prefix` (8 primeiros chars para identificação); "Regenerar chave" e "Despublicar" disponíveis
- [ ] Endpoint público `POST /api/v1/predict`: body JSON `{ api_key, rows: [{col: valor}] }`; valida a chave pelo hash, responde `{ predictions: [...] }` no formato da US-042; erros 401 (chave inválida), 422 (payload inválido, mensagem em português), 429 (rate limit por chave via `enforceRateLimit`), 504 (timeout do worker)
- [ ] Tela mostra "Sample request" (curl copiável com a URL real do deployment e placeholders da chave) e "Sample response" com dados de exemplo das colunas selecionadas, como na plataforma de referência
- [ ] Chamadas auditadas (`api.predict`, sem gravar os dados enviados) e publicação/regeneração de chave auditadas
- [ ] Teste de integração da rota: chave válida → 200 com predição; chave inválida → 401; payload malformado → 422
- [ ] Typecheck passes
- [ ] Tests pass
- [ ] Verify in browser using dev-browser skill

### US-047: Deployment MCP — tool de predição
**Description:** Como usuária, quero conectar o modelo a um cliente MCP (ex.: Claude) como uma tool de predição.

**Acceptance Criteria:**
- [ ] Endpoint MCP Streamable HTTP em `/api/mcp` autenticado pela mesma `api_key` do deployment MCP (header `Authorization: Bearer <key>`), usando SDK oficial `@modelcontextprotocol/sdk`
- [ ] Servidor expõe uma tool `predict` cujo input schema é derivado dos campos selecionados do deployment (nome, tipo JSON correspondente e descrição com exemplos de categorias); output: predição no formato da US-042 + frase em português resumindo o resultado
- [ ] Tela de configuração do MCP (a partir do card): seleção de campos, Publicar/Despublicar/Regenerar chave (mesma mecânica da US-046) e bloco de instruções de conexão copiável (JSON de configuração do cliente MCP com a URL e a chave)
- [ ] Requisições MCP passam por rate limiting por chave e são auditadas (`mcp.predict`)
- [ ] Teste de integração: handshake MCP (initialize + tools/list mostra `predict` com o schema certo) e tools/call devolve predição
- [ ] Typecheck passes
- [ ] Tests pass
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: A aba Deploy deve listar exatamente três endpoints — API, Web App e MCP — com status de publicação; nada de integrações não suportadas.
- FR-2: Cada endpoint é configurável independentemente (campos próprios) e publicável/despublicável a qualquer momento.
- FR-3: O Web App publicado é acessível por URL pública com slug secreto, sem autenticação.
- FR-4: A predição individual deve responder de forma síncrona (timeout 30s) via fila do worker.
- FR-5: O Web App aceita arquivo CSV/XLSX e devolve CSV com coluna de predição.
- FR-6: A API autentica por chave (hash no banco, exibida uma vez) com erros HTTP semânticos e rate limiting por chave.
- FR-7: O MCP expõe a tool `predict` com schema derivado dos campos do deployment, autenticada pela chave.
- FR-8: Toda superfície pública (Web App, API, MCP) tem rate limiting e auditoria, sem vazar dados da organização.
- FR-9: Apenas modelos de classificação e regressão são publicáveis; forecasting exibe aviso.

## Non-Goals (Out of Scope)

- Integrações Zapier, Salesforce, Snowflake, PostgreSQL, Google Sheets (nem como cards desabilitados).
- Múltiplos deployments do mesmo tipo por projeto (um Web App, uma API e um MCP por projeto).
- Customização visual do Web App público (tema/logo) além de título e descrição.
- Monitoramento de uso/analytics de predições (contadores, dashboards de chamadas).
- Versionamento de deployment atrelado a versões do modelo: o deployment sempre usa o modelo mais recente do projeto.
- Cobrança, quotas por usuário ou SLA.

## Design Considerations

- Referência visual: screenshots da plataforma de referência na conversa de 2026-08-21 (grid "Pick an endpoint to deploy", configuração do Web App com preview ao vivo, configuração da API com sample request/response).
- Cards da tela Deploy no estilo dos cards da plataforma de referência (ícone grande + status), reutilizando `Badge`/`Card` shadcn; layout de configuração em duas colunas (sidebar de config à esquerda, preview/exemplos à direita).
- Página pública do Web App usa os tokens visuais da plataforma (fundo `#F8F9FB`, primário `#3B5EEB`, Inter), mas sem navbar/sidebar interna — só título, descrição, formulário e resultado.
- Textos todos em português, incluindo a página pública e mensagens de erro da API.

## Technical Considerations

- Inferência síncrona via BullMQ + `QueueEvents.waitUntilFinished` evita criar um serviço HTTP novo no worker; cache do joblib em memória no worker torna chamadas subsequentes rápidas. Se a latência do handshake da fila for alta demais para o formulário, otimizar depois — não criar FastAPI agora.
- Rota pública `/app/[slug]` e `/api/v1/predict` e `/api/mcp` precisam ser liberadas no `proxy.ts` (hoje só `/login` e `/signup` são públicas).
- `fields` do deployment referencia colunas do modelo (`feature_columns` do artefato) — se o modelo for retreinado com outras colunas, a tela de configuração deve reconciliar (desmarcar campos inexistentes com aviso).
- Categorias para os selects do formulário vêm de `dataset_columns.stats.distribution.items` da versão ativa do dataset.
- MCP: usar transporte Streamable HTTP stateless por request (sem sessão persistente) para simplificar no Next.js App Router.
- Predição em lote reusa a infra de upload existente mas **não** cria registro em `datasets`; arquivo de saída em diretório temporário com limpeza.

## Success Metrics

- Publicar um Web App leva no máximo 3 cliques a partir da aba Deploy.
- Predição individual no formulário responde em menos de 3s (dataset de aula, worker quente).
- Um executivo sem conta consegue abrir o link, prever e entender o resultado sem instrução.
- `curl` do sample request funciona colando a chave, sem edições.
- Cliente MCP (ex.: Claude) lista e executa a tool `predict` com sucesso.

## Open Questions

- O resultado da classificação no Web App deve mostrar também os fatores principais da predição (explicabilidade por linha), ou isso fica para uma versão futura?
- Deve haver uma página "Deployments" global (no sidebar, como Datasets) listando todos os deployments da org?
- O limite de 10.000 linhas do lote é adequado para as aulas ou deve ser configurável por env?
