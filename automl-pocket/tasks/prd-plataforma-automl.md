# PRD: SignalOS — Plataforma AutoML Educacional

## 1. Introdução / Visão Geral

Plataforma web de AutoML no-code inspirada na experiência da plataforma de referência, usada em aulas para executivos. O aluno faz upload de uma planilha (CSV, Excel ou JSON), explora os dados com distribuições e correlações estatísticas, escolhe um atributo alvo e treina um modelo preditivo automaticamente, recebendo ao final um **Insights Report** legível para não-técnicos (acurácia vs. baseline, campos mais importantes, fatores, segmentos).

O valor central é **didático**: a jornada precisa ser fluida, visual e idêntica em espírito à da plataforma de referência (referência nos screenshots em `/Users/rafael/Desktop/Screenshot 2026-08-20 at 18.*.png`), pois a experiência dos alunos com essa UI é comprovadamente boa.

**Stack decidida:**
- Frontend/backend: **Next.js** (App Router, TypeScript)
- Banco: **PostgreSQL**
- Cache e filas: **Redis** (BullMQ — producer em Node, worker consumidor em Python via pacote `bullmq` Python)
- Motor de ML: **worker Python dedicado** (pandas, scikit-learn, XGBoost, statsmodels/Prophet)
- Deploy: **Coolify** com `docker-compose` e volumes persistentes
- UI: **Português (BR)**
- Contas: **individuais** (cada aluno vê só seus projetos), schema já preparado para multi-tenant futuro (`org_id`)
- Escopo do MVP: jornada termina no **Insights Report** (sem predição em novos dados, sem deploy de API)

## 2. Goals

- Replicar a jornada da plataforma de referência: Login → Projetos → Novo Projeto → Fonte de dados → Upload → Prepare (explorar) → Predict (treinar) → Insights Report.
- Aluno completa a jornada completa (upload → report) em menos de 5 minutos com um dataset típico de aula (≤ 1.000 linhas).
- Treinamento em "modo rápido" conclui em menos de 2 minutos para datasets de até 10.000 linhas.
- Suportar os 3 tipos de problema: **classificação**, **regressão** e **forecasting de série temporal**, com detecção automática do tipo a partir do atributo alvo.
- Insights Report compreensível por executivos sem background técnico (linguagem natural + visualizações).
- Estrutura de base alinhada a uma trilha futura de **SOC 2 Type 2** (audit log, controle de acesso, criptografia, backups), sem burocratizar o MVP.

## 3. User Stories

> Convenção: US organizadas por fase. Cada US é implementável em uma sessão focada.

---

### Fase 0 — Fundação e Infraestrutura

### US-001: Scaffold do monorepo e docker-compose
**Description:** Como desenvolvedor, quero a estrutura base do projeto com todos os serviços orquestrados para desenvolver e deployar no Coolify.

**Acceptance Criteria:**
- [ ] Estrutura: `apps/web` (Next.js + TypeScript + Tailwind), `apps/worker` (Python 3.12 + Poetry ou uv), `docker-compose.yml` na raiz
- [ ] Serviços no compose: `web`, `worker`, `postgres:17`, `redis:7` — com volumes nomeados para `postgres_data`, `redis_data` e `uploads` (arquivos enviados)
- [ ] Healthchecks configurados em todos os serviços (Coolify usa para orquestrar deploy)
- [ ] `.env.example` com todas as variáveis documentadas (DATABASE_URL, REDIS_URL, GOOGLE_CLIENT_ID/SECRET, AUTH_SECRET, UPLOAD_DIR, MAX_UPLOAD_MB)
- [ ] `docker compose up` sobe tudo e `web` responde em `localhost:3000`
- [ ] Typecheck/lint passa

### US-002: Schema do banco e migrations
**Description:** Como desenvolvedor, preciso do schema relacional inicial versionado por migrations.

**Acceptance Criteria:**
- [ ] ORM: Prisma (ou Drizzle, decidir na implementação) com migrations versionadas
- [ ] Tabelas: `users`, `organizations` (criada mas com 1 org pessoal por usuário no MVP), `projects`, `datasets`, `dataset_columns`, `training_jobs`, `models`, `audit_logs`
- [ ] Todas as tabelas de domínio têm `org_id` (preparação multi-tenant) e `created_at`/`updated_at`
- [ ] `datasets` guarda: nome do arquivo, formato origem (csv/xlsx/json), nº linhas, nº colunas, status (`uploading|parsing|profiling|ready|error`), caminho do arquivo original no volume
- [ ] `dataset_columns` guarda: nome, tipo inferido (`number|category|text|date|id`), stats JSONB (distribuição, nulos, únicos), correlações JSONB
- [ ] `training_jobs` guarda: status (`queued|running|succeeded|failed`), progresso (0-100), config (alvo, campos ignorados, modo), erro
- [ ] `models` guarda: tipo de problema, algoritmo vencedor, métricas JSONB, insights JSONB, caminho do artefato no volume
- [ ] Migration roda no startup do container (entrypoint) — Coolify-friendly
- [ ] Typecheck passa

### US-003: Autenticação — email/senha e Google
**Description:** Como aluno, quero entrar com Google ou criar conta com email e senha para acessar meus projetos.

**Acceptance Criteria:**
- [ ] Better Auth (ou Auth.js v5) com providers: Google OAuth + credentials (email/senha com hash argon2/bcrypt)
- [ ] Fluxos: login, cadastro ("Criar conta"), esqueci a senha (pode ser stub que loga token no console no MVP, com TODO)
- [ ] Sessão via cookie httpOnly, secure, sameSite=lax
- [ ] Ao criar usuário, criar automaticamente sua `organization` pessoal
- [ ] Rotas da aplicação protegidas por middleware — não autenticado redireciona para `/login`
- [ ] Eventos de auth (login, logout, cadastro, falha de login) gravados em `audit_logs`
- [ ] Typecheck passa

### US-004: Tela de login (réplica visual)
**Description:** Como aluno, quero uma tela de login idêntica em estrutura à referência (screenshot 18.18.50) para uma primeira impressão profissional.

**Acceptance Criteria:**
- [ ] Layout split: painel esquerdo escuro com branding/ilustração e texto de proposta de valor; painel direito claro com o formulário
- [ ] Formulário: logo, título "Entrar", botão "Entrar com Google" (com ícone G), divisor "ou", campos Email e Senha, link "Esqueceu a senha?", botão primário azul "Entrar", link "Não tem conta? Criar uma"
- [ ] Rodapé com copyright, Termos e Privacidade
- [ ] Estados de erro visíveis (credenciais inválidas) em português
- [ ] Responsivo: painel esquerdo some em telas < 1024px
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

---

### Fase 1 — Projetos e Ingestão de Dados

### US-005: Tela de Projetos (grid com preview)
**Description:** Como aluno, quero ver meus projetos em cards com preview dos dados (screenshot 18.19.31) para localizar rapidamente meu trabalho.

**Acceptance Criteria:**
- [ ] Sidebar esquerda: seletor de conta no topo, itens "Projetos" e "Datasets" (demais itens da plataforma de referência — Dashboards, Integrations — ficam fora), "Configurações" e usuário logado no rodapé; colapsável
- [ ] Header: título "Projetos" + contagem, busca por nome, botão primário "+ Novo projeto"
- [ ] Tabs: "Desenvolvimento" e "Arquivados" (tab "Produção" do original fica fora do MVP)
- [ ] Card de projeto: mini-tabela com preview real das primeiras ~5 linhas/4 colunas do dataset, badge de status do modelo ("Modelo treinado" verde / "Sem modelo" cinza), nome, "Editado em <data relativa>", menu "..." com Renomear / Arquivar / Excluir
- [ ] Excluir pede confirmação e remove dataset + modelo + arquivos do volume
- [ ] Empty state com CTA para criar o primeiro projeto
- [ ] Grid responsivo (3 col desktop, 1 col mobile)
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

### US-006: Novo projeto — seleção de fonte de dados
**Description:** Como aluno, ao criar um projeto quero escolher a fonte de dados (screenshot 18.20.19), com upload de arquivo habilitado e demais integrações visíveis mas desabilitadas.

**Acceptance Criteria:**
- [ ] Criar projeto abre a tela "Escolha uma fonte de dados" com navbar preta superior do projeto: nome do projeto (editável inline), abas Prepare / Explore / Predict / Reports (as ainda não disponíveis aparecem desabilitadas)
- [ ] Card "Enviar arquivo" ativo com badges CSV / EXCEL / JSON
- [ ] Cards decorativos "Em breve" (Google Sheets, BigQuery, etc.) desabilitados com tooltip "Disponível em breve" — para manter a estética da referência
- [ ] Clicar em "Enviar arquivo" navega para a tela de seleção de dataset
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

### US-007: Seleção/Upload de dataset
**Description:** Como aluno, quero enviar uma planilha nova ou reaproveitar um dataset já enviado (screenshot 18.21.07).

**Acceptance Criteria:**
- [ ] Tela "Selecione um dataset": busca, botão "+ Enviar dataset", lista com nome do arquivo, "N linhas, M colunas" e data de atualização
- [ ] Upload aceita `.csv`, `.xlsx`, `.xls`, `.json` — via drag-and-drop ou file picker; limite configurável (default 50 MB / 100.000 linhas)
- [ ] Arquivo salvo no volume `uploads/` com nome UUID; metadados em `datasets`
- [ ] Upload dispara job de parsing na fila (US-008); UI mostra progresso e estado `parsing`
- [ ] Erros claros em português: formato não suportado, arquivo grande demais, planilha vazia
- [ ] Selecionar dataset vincula ao projeto e navega para Prepare
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

### US-008: Parsing e inferência de tipos (worker)
**Description:** Como sistema, preciso parsear o arquivo e inferir o tipo de cada coluna para alimentar a exploração e o treinamento.

**Acceptance Criteria:**
- [ ] Job `dataset:parse` consumido pelo worker Python: lê CSV (encoding + separador autodetectados), Excel (primeira aba) e JSON (array de objetos)
- [ ] Dados normalizados persistidos em formato Parquet no volume (fonte de verdade para o ML) + amostra das primeiras 500 linhas em JSONB no Postgres (para renderização rápida da grade)
- [ ] Inferência de tipos por coluna: `number` (int/float), `category` (baixa cardinalidade), `text` (alta cardinalidade), `date`, `id` (única por linha)
- [ ] Colunas e tipos gravados em `dataset_columns`; dataset transita `parsing → profiling`
- [ ] Falha de parsing marca `error` com mensagem legível exibida na UI
- [ ] Job de profiling (US-009) enfileirado automaticamente ao concluir
- [ ] Testes do worker cobrindo os 3 formatos e a inferência de tipos

### US-009: Profiling estatístico — distribuições e correlações (worker)
**Description:** Como sistema, preciso calcular distribuição de cada coluna e correlações par-a-par para a tela Prepare.

**Acceptance Criteria:**
- [ ] Job `dataset:profile` calcula por coluna: contagem, nulos/vazios, valores únicos, e distribuição — top categorias com % para categóricas (formato do screenshot 18.22.05: "texto 85%, multimodal 15%"), histograma de ~10 bins para numéricas, agregando cauda em "Outros"
- [ ] Correlações par-a-par: Pearson (num×num), correlation ratio η (num×cat), Cramér's V (cat×cat) — normalizadas para exibição em %
- [ ] Resultados em JSONB em `dataset_columns` (`stats`, `correlations`); dataset transita `profiling → ready`
- [ ] Performance: dataset de 100k linhas × 50 colunas perfila em < 30s
- [ ] Testes com datasets sintéticos validando os três tipos de correlação

---

### Fase 2 — Exploração (Prepare)

### US-010: Grade de dados com distribuições no cabeçalho
**Description:** Como aluno, quero ver meus dados em uma grade com a distribuição de cada coluna no cabeçalho (screenshot 18.22.05) para entender o dataset de relance.

**Acceptance Criteria:**
- [ ] Aba Prepare ativa na navbar preta; subheader com nome do dataset, "N linhas, M colunas" e botão "Baixar" (exporta CSV)
- [ ] Cabeçalho de cada coluna: nome, badge de tipo colorida (Categoria/laranja, Número/verde, Texto/azul, Data/roxo) e mini-visualização da distribuição — barras horizontais com % para categóricas, mini-histograma para numéricas
- [ ] Corpo da grade renderiza a amostra (500 linhas) com virtualização de linhas e scroll horizontal fluido
- [ ] Botões "Limpar", "Combinar", "Gerar dashboard" e o chat "O que você quer fazer com seus dados?" aparecem desabilitados com tooltip "Em breve" (estética da referência; funcionalidade é non-goal)
- [ ] Skeleton/loading enquanto status ≠ `ready`, com atualização automática (polling ou SSE)
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

### US-011: Sidebar de detalhes da coluna com correlações
**Description:** Como aluno, quero clicar em uma coluna e ver estatísticas e correlações (screenshot 18.23.02) para descobrir o que influencia o quê.

**Acceptance Criteria:**
- [ ] Clique no cabeçalho abre sidebar direita com o nome da coluna e botão fechar
- [ ] Linha de KPIs: Linhas, Linhas vazias, Valores únicos (numéricas incluem também mín/máx/média/mediana)
- [ ] Seção "Distribuição": barras com % (categóricas) ou histograma (numéricas)
- [ ] Seção "Correlações": demais colunas ranqueadas por força, com pill verde "+41.6%" e barrinha proporcional, ordem decrescente
- [ ] Clicar em uma coluna da lista de correlações navega a sidebar para ela
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

---

### Fase 3 — Treinamento (Predict)

### US-012: Tela Predict — configuração do treinamento
**Description:** Como aluno, quero escolher o atributo alvo e configurar o treinamento (screenshot 18.23.52) para criar meu modelo.

**Acceptance Criteria:**
- [ ] Aba Predict: painel esquerdo "Campos de predição" com busca, tabs "Prever" / "Ignorar (n)", lista de colunas com checkbox — exatamente 1 alvo selecionável; colunas marcadas como ignorar saem do treinamento
- [ ] Colunas tipo `id` e `text` de alta cardinalidade são sugeridas automaticamente como ignoradas (removíveis pelo aluno)
- [ ] Seção "Modo de treinamento": Rápido (~10s de busca) / Padrão (~60s) / Completo (~5min) — descrições em linguagem simples
- [ ] Área central com botão primário "Criar Modelo Preditivo →" habilitado só com alvo válido selecionado
- [ ] Detecção e exibição do tipo de problema inferido antes de treinar: alvo categórico/binário → "Classificação"; numérico → "Regressão"; se existir coluna de data e o aluno a marcar como eixo temporal → oferta de "Previsão de série temporal"
- [ ] Submissão cria `training_job` na fila e navega para a visão de progresso
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

### US-013: Pipeline de AutoML no worker
**Description:** Como sistema, preciso treinar múltiplos modelos, escolher o melhor e persistir métricas e artefatos.

**Acceptance Criteria:**
- [ ] Job `model:train` no worker Python com pipeline: limpeza básica (drop de linhas sem alvo), encoding (one-hot/ordinal), imputação, split 80/20 estratificado (ou split temporal para forecasting)
- [ ] **Classificação:** baseline (classe majoritária — DummyClassifier) + Regressão Logística, Árvore de Decisão, Random Forest, XGBoost e MLP; seleção por F1 (binária) / F1-macro (multiclasse) na validação
- [ ] **Regressão:** baseline (média — DummyRegressor) + Regressão Linear, Random Forest, XGBoost, MLP; seleção por RMSE
- [ ] **Forecasting:** baseline naïve (último valor) + Suavização Exponencial (Holt-Winters) e Prophet (ou auto-ARIMA); seleção por MAPE em backtest
- [ ] Modo de treinamento controla o orçamento de busca de hiperparâmetros (nº de configurações testadas)
- [ ] Progresso reportado (0-100 + etapa em texto, ex: "Testando Random Forest (3/5)") via update no `training_job`, lido pela UI por polling/SSE
- [ ] Persistidos em `models`: algoritmo vencedor, métricas de todos os candidatos, artefato serializado (joblib) no volume, e o JSON de insights (US-014)
- [ ] Falha marca job `failed` com mensagem legível ao aluno (ex: "Alvo com uma única classe")
- [ ] Testes de ponta a ponta do pipeline com datasets sintéticos dos 3 tipos de problema

### US-014: Geração dos dados de insights (worker)
**Description:** Como sistema, preciso computar os artefatos analíticos que alimentam o Insights Report.

**Acceptance Criteria:**
- [ ] JSON de insights inclui, por tipo de problema:
- [ ] **Classificação:** acurácia geral + comparação com baseline ("X vezes melhor que o baseline"); matriz de confusão (TP/FP/TN/FN com %); tabela por classe (accuracy, precision, recall, F1, count); **Top Fields** (importância por permutação, % normalizado); **Top Factors** (para os 2 campos mais importantes: faixas/valores com maior taxa do desfecho, com impacto direcional ±%); **Segments** (3 clusters de risco alto/médio/baixo com tamanho, taxa do desfecho e atributos distintivos); dados do **gráfico de limiar de decisão** (densidades das classes vs. probabilidade prevista); **Sample Rows** (linhas de validação ordenadas por probabilidade)
- [ ] **Regressão:** "Acurácia geralmente dentro de ±X%" (erro percentual mediano), RMSE, MAE, dados do scatter previsto×real, distribuição do alvo (média/mediana), Top Fields
- [ ] **Forecasting:** MAPE do backtest, série histórica + previsão com intervalo de confiança, sazonalidade detectada
- [ ] Todos os textos-template do JSON em português e voltados a leigos
- [ ] Testes validando o shape do JSON para os 3 tipos

### US-015: Visão de progresso do treinamento
**Description:** Como aluno, quero acompanhar o treinamento em tempo real para entender o que a plataforma está fazendo (momento didático da aula).

**Acceptance Criteria:**
- [ ] Barra de progresso + etapa atual ("Preparando dados", "Testando Regressão Logística…", "Selecionando melhor modelo")
- [ ] Lista dos algoritmos candidatos com estado (aguardando/rodando/concluído + métrica parcial)
- [ ] Atualização sem refresh (polling 2s ou SSE)
- [ ] Ao concluir, redireciona automaticamente para o Insights Report
- [ ] Erro de treino exibe mensagem legível + botão "Tentar novamente"
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

---

### Fase 4 — Insights Report

### US-016: Insights Report — Classificação (resumo e performance)
**Description:** Como aluno, quero um relatório visual do meu modelo de classificação (referência: docs da plataforma de referência, Image #2) para entender se ele funciona.

**Acceptance Criteria:**
- [ ] Header "Relatório de Insights — Classificação" com card **Resumo**: acurácia geral em destaque (ex: "95,0%"), subtexto "acertou N de M linhas reservadas para validação", pill de comparação com baseline ("9,8× melhor que o baseline")
- [ ] Texto explicativo fixo: "Para identificar padrões, treinamos um modelo com 80% dos seus dados e validamos nos 20% restantes."
- [ ] Seção **Performance Preditiva**: 4 linhas (Verdadeiros/Falsos Positivos, Verdadeiros/Falsos Negativos) com barra, % e frase explicativa de cada
- [ ] Tabela **Detalhes de Performance** por classe: Accuracy, Precision, Recall, F1, Count — com tooltips explicando cada métrica em linguagem simples
- [ ] Seção expansível **Detalhes Avançados do Modelo**: algoritmo vencedor + comparação de qualidade dos candidatos
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

### US-017: Insights Report — Top Fields, Top Factors e Segments
**Description:** Como aluno, quero saber quais campos e valores mais influenciam o resultado para extrair conclusões de negócio.

**Acceptance Criteria:**
- [ ] **Campos Principais (Top Fields):** barras horizontais com % de contribuição por campo, expansível "+ ver mais"
- [ ] Painel de detalhe ao clicar num campo: faixas de valor e impacto direcional no desfecho (verde positivo / vermelho negativo)
- [ ] **Fatores Principais (Top Factors):** para os campos líderes, os valores/faixas específicos que mais levam ao desfecho, com frequência e impacto ±%
- [ ] **Segmentos:** 3 cards (risco alto/médio/baixo) com donut do tamanho do segmento, taxa do desfecho vs. média geral e tabela de atributos-chave que definem o segmento
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

### US-018: Insights Report — Gráfico de limiar e Sample Rows
**Description:** Como aluno, quero explorar o limiar de decisão e ver linhas de exemplo para ganhar intuição sobre probabilidade.

**Acceptance Criteria:**
- [ ] **Gráfico de Limiar de Decisão:** densidades das classes sobre o eixo de probabilidade, com slider de limiar que reagrupa em "Improvável / Incerto / Provável" mostrando contagem e % de cada grupo em tempo real (client-side, sem novo request)
- [ ] **Linhas de Exemplo:** tabela das linhas de validação com coluna de probabilidade prevista, ordenável, com slider de filtro por faixa de probabilidade
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

### US-019: Insights Report — Regressão
**Description:** Como aluno, quero o relatório equivalente para modelos de regressão (referência: docs da plataforma de referência, Image #3).

**Acceptance Criteria:**
- [ ] Card resumo: "A previsão costuma ficar dentro de ±X%" + "Os valores previstos erraram em média R$ Y em relação aos reais" (MAE), expansível com RMSE e MAE
- [ ] Card de distribuição do alvo: histograma + média e mediana
- [ ] Scatter Previsto × Real com linha diagonal ideal e pontos coloridos por erro (verde→laranja)
- [ ] Top Fields (mesmo componente da US-017)
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

### US-020: Insights Report — Forecasting
**Description:** Como aluno, quero visualizar a previsão futura da minha série temporal.

**Acceptance Criteria:**
- [ ] Gráfico de linha: histórico + previsão (linha tracejada) + banda de intervalo de confiança
- [ ] Card resumo com MAPE do backtest em linguagem simples ("erro médio de X% nas janelas de teste")
- [ ] Seletor de horizonte de previsão (ex: 7/30/90 períodos), re-renderizando a partir do JSON já computado
- [ ] Typecheck passa
- [ ] Verify in browser using dev-browser skill

---

### Fase 5 — Base SOC 2 e Deploy

### US-021: Fundamentos de segurança (trilha SOC 2 Type 2)
**Description:** Como operador da plataforma, quero controles básicos de segurança implementados desde o início para viabilizar uma futura auditoria SOC 2.

**Acceptance Criteria:**
- [ ] `audit_logs` populado em: auth (US-003), criação/exclusão de projeto e dataset, início de treinamento, download de dados — com user_id, org_id, ação, IP, user-agent, timestamp
- [ ] Rate limiting via Redis nas rotas de auth e upload
- [ ] Security headers (CSP, HSTS, X-Frame-Options, nosniff) e cookies seguros
- [ ] Validação de input com Zod em todas as rotas de API; uploads validados por magic bytes, não só extensão
- [ ] Autorização verificada em toda query (recurso pertence ao `org_id` da sessão) — testes cobrindo acesso cruzado negado
- [ ] `SECURITY.md` documentando: modelo de acesso, gestão de secrets (env do Coolify), política de backup do Postgres (pg_dump diário + retenção), TLS terminado no proxy do Coolify, e roadmap dos controles SOC 2 pendentes (SSO, retenção de logs, DR, pentest, vendor review)
- [ ] Dependabot/Renovate ou `npm audit`/`pip-audit` no CI
- [ ] Typecheck passa

### US-022: Deploy no Coolify
**Description:** Como operador, quero deployar a stack completa no Coolify com um push.

**Acceptance Criteria:**
- [ ] Dockerfiles de produção multi-stage: `web` (Next standalone) e `worker` (imagem slim com deps de ML)
- [ ] `docker-compose.yml` compatível com Coolify: labels/healthchecks, volumes persistentes, restart policies, dependências ordenadas (postgres/redis → web/worker)
- [ ] Migrations executadas automaticamente no deploy sem corrida entre réplicas (lock ou serviço one-shot)
- [ ] `README.md` com passo a passo do deploy: variáveis, OAuth do Google (redirect URIs), domínio/TLS
- [ ] Smoke test pós-deploy documentado: login → upload CSV exemplo → treino rápido → report renderiza

## 4. Functional Requirements

**Autenticação e contas**
- FR-1: O sistema deve permitir cadastro e login com email/senha (hash forte) e com Google OAuth.
- FR-2: Cada usuário deve pertencer a uma organização pessoal criada automaticamente; todo dado de domínio referencia `org_id`.
- FR-3: Usuários só podem acessar recursos da própria organização; violações retornam 404/403 e são auditadas.

**Projetos e datasets**
- FR-4: O sistema deve listar projetos em grid com preview real dos dados, busca por nome e tabs Desenvolvimento/Arquivados.
- FR-5: O sistema deve aceitar upload de CSV, Excel (.xlsx/.xls) e JSON (array de objetos) até o limite configurado (default 50 MB / 100k linhas).
- FR-6: O sistema deve parsear o arquivo de forma assíncrona (fila Redis + worker Python), inferindo tipo de cada coluna (número, categoria, texto, data, id).
- FR-7: O sistema deve armazenar o arquivo original e a versão normalizada (Parquet) em volume persistente, e uma amostra de 500 linhas no Postgres.
- FR-8: O sistema deve calcular para cada coluna: contagem, vazios, únicos, distribuição (top categorias % ou histograma) e correlação com todas as demais colunas (Pearson, correlation ratio, Cramér's V).
- FR-9: Datasets podem ser reutilizados em múltiplos projetos.

**Exploração**
- FR-10: A tela Prepare deve exibir a grade de dados com mini-distribuição no cabeçalho de cada coluna e badge de tipo.
- FR-11: Clicar em uma coluna deve abrir sidebar com KPIs (linhas, vazios, únicos), distribuição completa e correlações ranqueadas em %.

**Treinamento**
- FR-12: A tela Predict deve permitir selecionar exatamente 1 atributo alvo e marcar colunas a ignorar, com sugestão automática de ignorar colunas `id`/texto livre.
- FR-13: O sistema deve detectar o tipo de problema pelo alvo: categórico → classificação; numérico → regressão; com eixo temporal designado → forecasting.
- FR-14: O treinamento deve rodar em fila com modos Rápido/Padrão/Completo controlando o orçamento de busca.
- FR-15: O worker deve treinar baseline + múltiplos candidatos (LogReg/LinReg, Decision Tree, Random Forest, XGBoost, MLP; Holt-Winters e Prophet para séries) com split 80/20 e selecionar o melhor por métrica adequada (F1, RMSE, MAPE).
- FR-16: O progresso do treinamento deve ser visível em tempo real (etapa + %) e falhas devem apresentar mensagem legível a leigos.

**Insights Report**
- FR-17: Classificação: resumo de acurácia vs. baseline, matriz TP/FP/TN/FN explicada, tabela por classe (accuracy/precision/recall/F1/count), detalhes avançados do modelo, Top Fields, Top Factors, Segments, gráfico de limiar de decisão interativo e Sample Rows filtráveis por probabilidade.
- FR-18: Regressão: ±% típico de erro, RMSE, MAE, scatter previsto×real, distribuição do alvo e Top Fields.
- FR-19: Forecasting: gráfico histórico+previsão com intervalo de confiança, MAPE de backtest e horizonte selecionável.
- FR-20: Todo texto do report deve estar em português e ser compreensível por não-técnicos (tooltips explicando cada métrica).

**Plataforma e segurança**
- FR-21: Toda a UI deve estar em português (BR); código e identificadores em inglês.
- FR-22: Ações sensíveis (auth, CRUD de projeto/dataset, treino, download) devem gerar registro em `audit_logs`.
- FR-23: A stack deve subir integralmente via `docker compose up` e ser deployável no Coolify com volumes persistentes e healthchecks.
- FR-24: Rotas de API devem validar input (Zod) e aplicar rate limiting nas rotas de auth e upload.

## 5. Non-Goals (Fora de Escopo do MVP)

- **Predição em novos dados** (upload de dados sem alvo para prever) — fase 2.
- **Deployments**: exposição do modelo como API pública com chave — fase 2.
- Integrações externas de dados (Google Sheets, BigQuery, Snowflake, Google Ads…) — cards aparecem desabilitados apenas como estética.
- Transformações de dados: Clean, Merge, Generate Dashboard e o chat "converse com seus dados" — botões visíveis porém desabilitados.
- Times/workspaces com múltiplos membros, convites e papéis (schema preparado, sem UI).
- Dashboards, tab Explore com chat, e relatórios exportáveis em PDF.
- Billing/planos, verificação de email transacional real (stub aceitável no MVP).
- Certificação SOC 2 em si — o MVP entrega apenas os fundamentos técnicos (US-021).
- Datasets acima de 100k linhas / 50 MB e treinamento distribuído/GPU.

## 6. Design Considerations

- **Fidelidade visual à referência (screenshots de 18.18.50 a 18.23.52):** navbar preta do projeto com abas centrais; azul primário (~`#3B5EEB`) para CTAs; badges de tipo coloridas (laranja=categoria, verde=número, azul=texto); barras de distribuição laranja; pills verdes de correlação/impacto positivo e vermelhas para negativo; cards brancos com bordas suaves sobre fundo `#F8F9FB`.
- Tipografia sans limpa (Inter ou similar); densidade de informação alta nas grades, generosa nos reports.
- Componentes: shadcn/ui + Tailwind como base; gráficos com Recharts (ou visx) — histogramas, barras, donut, scatter, linha com banda de confiança e o gráfico de densidade do limiar.
- Grade de dados com virtualização (ex: TanStack Table + TanStack Virtual).
- Elementos da plataforma de referência fora do MVP permanecem visíveis e desabilitados (tooltip "Em breve") para preservar a estética e a narrativa de produto nas aulas.
- Estados de loading com skeletons; transições de status (parsing → profiling → ready) refletidas na UI sem refresh.

## 7. Technical Considerations

- **Arquitetura:** Next.js (App Router) serve UI + API routes; enfileira jobs no Redis via BullMQ; worker Python consome com `bullmq` (pacote oficial Python) — mesma semântica de filas nas duas linguagens. Alternativa aceitável: fila própria via Redis Streams.
- **Contrato Node↔Python:** payloads JSON versionados (`dataset:parse`, `dataset:profile`, `model:train`); worker escreve resultados direto no Postgres (conexão própria) para evitar round-trip.
- **Armazenamento de dados tabulares:** arquivo original + Parquet no volume; Postgres guarda metadados, amostra (JSONB), stats e insights. Evitar guardar dataset inteiro no Postgres.
- **Artefatos de modelo:** joblib no volume `uploads/models/`; nunca no banco.
- **Tempo real:** polling curto (2s) é suficiente no MVP; SSE é upgrade opcional.
- **Limites de recursos:** worker com limite de memória no compose; jobs com timeout (ex: 15 min) e retry=1.
- **Estrutura preparada para multi-tenant:** todas as queries passam por helper que injeta `org_id` da sessão — vira RLS do Postgres numa fase futura.
- **SOC 2 (roadmap pós-MVP):** logs centralizados com retenção, RLS, SSO/SAML, criptografia de coluna para PII, DR testado, gestão formal de acessos e change management. O MVP entrega audit log, RBAC básico, TLS, backups e validação de input.
- **Imagem do worker:** base `python:3.12-slim` + wheels (pandas, scikit-learn, xgboost, prophet); atenção ao tamanho (~1.5 GB) e ao build cache no Coolify.

## 8. Success Metrics

- Jornada completa (login → upload → explore → treino rápido → report) concluída por um aluno leigo em **< 5 minutos** com dataset de aula (≤ 1k linhas).
- Treino "Rápido" termina em **< 2 min** (dataset ≤ 10k linhas); profiling em **< 30 s** (≤ 100k linhas × 50 colunas).
- Zero acesso cruzado entre contas nos testes de autorização.
- 30 alunos simultâneos em aula sem degradação perceptível (uploads e treinos enfileirados com feedback de posição).
- Report de classificação apresenta os 9 blocos da referência (resumo, performance, detalhes, avançado, top fields, top factors, segments, limiar, sample rows).

## 9. Open Questions

- Prisma ou Drizzle? (indiferente para o produto; decidir por familiaridade na implementação)
- Better Auth ou Auth.js v5? (Better Auth simplifica email/senha; validar maturidade do adapter Postgres escolhido)
- Recuperação de senha real precisa de provedor de email (Resend/SES) — necessário já no primeiro uso em aula ou stub basta?
- Forecasting: Prophet ou auto-ARIMA (statsmodels/pmdarima)? Prophet é mais fiel à plataforma de referência, mas pesa na imagem Docker.
- Vale gravar os datasets de exemplo das aulas (ex: Projects.xlsx) como seeds para demo instantânea no onboarding?
- Retenção de dados dos alunos entre turmas: expira automaticamente (ex: 90 dias) ou mantém indefinidamente?
