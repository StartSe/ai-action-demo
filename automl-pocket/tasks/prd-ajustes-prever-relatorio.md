# PRD: Ajustes Finos — Nome do Projeto, Prever Unificado e Modos de Treinamento

## Introdução

Após o fluxo completo da plataforma (projetos → upload → prepare → predict → relatório) estar funcional, o uso em aula revelou quatro ajustes finos de UX:

1. **Projeto nasce sem nome**: `createProject()` cria direto com o default "Projeto sem título" e redireciona, sem pedir nome. O aluno acumula projetos indistinguíveis na lista.
2. **Prever e Relatórios são duas abas separadas**: o relatório vive em `/projects/{id}/reports` (aba "Relatórios" do `ProjectNavbar`). A jornada natural é uma só — escolher o alvo e ver o resultado — então a aba separada é redundante: quando já existe modelo treinado, selecionar o alvo dele na sidebar do Prever deve mostrar o relatório diretamente à direita.
3. **Modos de treinamento pouco fiéis à referência**: hoje existem 3 modos (`fast`/`standard`/`full`). A plataforma de referência oferece 4 — Fastest, High quality, Higher quality, Production — ordenados pelo tempo de treinamento, com a explicação didática de que mais tempo **não** significa necessariamente mais acurácia por causa de **overfitting** (o modelo aprende bem os dados de treino mas não generaliza para dados novos). Esse texto tem valor de aula e deve aparecer na UI.
4. **Retreinar exige voltar atrás sem orientação**: quem está no relatório e percebe que deveria ter ignorado um atributo não tem um botão claro de "retreinar" ali mesmo.
5. **Bug: Explore quebra ao carregar o dataset no sandbox**: qualquer pergunta na aba Explorar (ex.: "Qual o valor médio por segmento?") falha com `Falha ao carregar o dataset no sandbox: Unable to find a usable engine; tried using: 'pyarrow', 'fastparquet'`. Causa raiz: o `BOOTSTRAP_SCRIPT` (`apps/web/src/lib/explore/executor-core.ts:33`) roda `pd.read_parquet("/home/user/dataset.parquet")` dentro do sandbox e2b, mas o template code-interpreter em uso não tem `pyarrow` nem `fastparquet` instalados — o bootstrap falha na criação do sandbox e toda análise retorna erro.
6. **Explore gera código para perguntas que não precisam de análise**: perguntas conversacionais/meta como "que tipo de perguntas posso realizar?" ou "quem é você?" entram no mesmo pipeline planejar → codificar → executar (`apps/web/src/lib/explore/pipeline.ts`), gastando sandbox e LLM para produzir uma "análise" sem sentido. O pipeline não tem rota de resposta direta em texto.
7. **Prepare sem paginação**: a grade (`prepare/prepare-view.tsx`) mostra apenas a amostra de 500 linhas gravada em `datasets.sample` (JSONB), com virtualização e ordenação client-side sobre a amostra. Para tabelas grandes (o produto aceita até 100k linhas), o restante do dataset — que vive no Parquet do volume — é inacessível na UI.
8. **Rebranding para AutoML**: o produto muda de nome — de **SignalOS** para **AutoML** — com novo logo (wordmark ".AutoML") e novo ícone (hexágono azul com seta). Os assets já estão no repo: `apps/web/public/automl-logo.png` (2155×730) e `apps/web/public/automl-icon.png` (1439×1093).

Estado atual relevante (já investigado no código):

- Criação de projeto: `apps/web/src/app/(app)/projects/actions.ts` → `createProject()` (sem input de nome); botões "+ Novo projeto" em `apps/web/src/app/(app)/projects/projects-view.tsx` (header e empty state). Nome é editável inline na navbar (`components/project/project-navbar.tsx`).
- Prever: `apps/web/src/app/(project)/projects/[projectId]/predict/predict-view.tsx` — sidebar "Campos de predição" (alvo único + tab "Ignorar"), eixo temporal opcional, seção "Modo de treinamento" (radios `fast|standard|full`, default `standard`) e botão "Criar Modelo Preditivo →". Modos validados em `predict/actions.ts` (`TRAINING_MODES`) e gravados em `training_jobs.config.mode`.
- Worker: `apps/worker/jobs/automl.py` → `MODE_CONFIG_COUNTS = {"fast": 1, "standard": 2, "full": 4}` — o modo é o orçamento de busca (nº de configurações de hiperparâmetros testadas por algoritmo); também usado em `forecasting.py`. Modo desconhecido cai silenciosamente em `standard`.
- Relatórios: aba "Relatórios" definida em `(project)/projects/[projectId]/layout.tsx`; renderização em `reports/page.tsx` com componentes `classification-report.tsx`, `regression-report.tsx`, `forecasting-report.tsx`, `insights-sections.tsx`, `probability-sections.tsx`, `forecast-sections.tsx`. Pós-treino, `predict/jobs/[jobId]/training-progress.tsx` redireciona para `/reports`. O card do projeto também linka `/reports`.
- Semântica de modelo: **um único modelo vigente por projeto** — toda leitura usa `findLatestModelScoped` (`lib/org-scope.ts`), que pega o mais recente. O alvo do modelo **não** está em `models`; só existe em `training_jobs.config.target`.

Decisões já tomadas com o produto:

- Modos com **rótulos em PT-BR** ("Mais rápido", "Alta qualidade", "Qualidade superior", "Produção") e valores internos em inglês (`fastest`, `high_quality`, `higher_quality`, `production`).
- Mantém-se a semântica de **um único modelo vigente por projeto** (o mais recente). Trocar o alvo e treinar substitui o modelo vigente; o anterior deixa de ser acessível. Sem histórico por alvo.
- A aba "Relatórios" **sai da navbar** e a rota `/reports` vira **redirect para `/predict`**; todos os links existentes passam a apontar para o Prever, que abre já mostrando o relatório do modelo vigente.

> **Importante — não recriar o relatório**: os componentes de Insights Report (classificação, regressão, forecasting) já existem e funcionam. O trabalho aqui é **movê-los para dentro do Prever**, não reconstruí-los.

## Objetivos

- Todo projeto nasce com um nome dado pela pessoa no momento da criação.
- O Prever vira a casa única do ciclo treinar → avaliar: alvo na sidebar, configuração ou relatório à direita, sem aba "Relatórios".
- Selecionar o alvo do modelo vigente mostra o relatório imediatamente; selecionar outro alvo mostra a configuração de treinamento.
- 4 modos de treinamento fiéis à referência, com explicação didática (incluindo overfitting) legível por não-técnicos.
- Retreinar a partir do relatório em 1 clique, com os campos ignorados editáveis antes do novo treino.

## User Stories

### US-001: Nome do projeto na criação
**Description:** Como usuária, quero dar um nome ao projeto no momento em que o crio, para encontrá-lo depois na lista sem depender de renomear "Projeto sem título".

**Acceptance Criteria:**
- [ ] Clicar em "+ Novo projeto" (header e empty state de `projects-view.tsx`) abre um `Dialog` pedindo o nome do projeto, em vez de criar direto
- [ ] Campo de nome obrigatório: botão "Criar projeto" desabilitado enquanto vazio/só espaços; nome é trimado antes de salvar; limite de 100 caracteres
- [ ] Enter no campo submete; Escape/cancelar fecha sem criar nada (nenhum projeto "fantasma" no banco)
- [ ] `createProject()` passa a receber o nome, valida no servidor (obrigatório, trimado, ≤ 100 chars) e mantém audit log `project.create` e o redirect para `/projects/{id}`
- [ ] Botão com estado pending durante a criação
- [ ] Renomear inline na navbar e pelo menu do card continuam funcionando como hoje
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-002: Quatro modos de treinamento com explicação didática
**Description:** Como usuária, quero escolher entre os modos "Mais rápido", "Alta qualidade", "Qualidade superior" e "Produção", entendendo o que cada um faz e por que mais tempo de treino não garante mais acurácia.

**Acceptance Criteria:**
- [ ] Seção "Modo de treinamento" do Prever passa a oferecer 4 opções (radios), nesta ordem: **Mais rápido** (`fastest`), **Alta qualidade** (`high_quality`), **Qualidade superior** (`higher_quality`), **Produção** (`production`)
- [ ] Cada opção tem descrição curta em português indicando o tempo relativo e o orçamento de busca (ex.: "Mais rápido — treina em segundos testando poucas combinações; ideal para demonstrações" … "Produção — a busca mais completa; leva mais tempo")
- [ ] A seção exibe o texto didático (visível ou em tooltip/expansível, mas acessível sem sair da tela): os modos estão **ordenados pelo tempo de treinamento**, e mais tempo **não leva necessariamente a mais acurácia** por causa do **overfitting** — quando o modelo aprende bem demais os dados de treino mas não generaliza para dados novos
- [ ] Default: **Alta qualidade** (`high_quality`)
- [ ] `TRAINING_MODES` em `predict/actions.ts` atualizado para os 4 novos valores; valor inválido continua rejeitado com mensagem em português
- [ ] Worker: `MODE_CONFIG_COUNTS` em `automl.py` (e uso em `forecasting.py`) mapeia os 4 modos com orçamentos crescentes (ex.: `fastest: 1`, `high_quality: 2`, `higher_quality: 4`, `production: 8`); modos legados `fast`/`standard`/`full` seguem aceitos como aliases (fast→fastest, standard→high_quality, full→higher_quality) para jobs antigos e retries
- [ ] `candidates.configsTested` reflete o orçamento do modo escolhido
- [ ] Testes do worker cobrindo o orçamento dos 4 modos e os aliases legados
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: Alvo do modelo acessível ao frontend
**Description:** Como sistema, preciso saber qual atributo alvo (e quais colunas ignoradas) geraram o modelo vigente para decidir se mostro o relatório ou o botão de treinar.

**Acceptance Criteria:**
- [ ] Migration Drizzle adiciona a `models` as colunas `target` (text) e `ignored_columns` (jsonb) — preenchidas pelo worker no insert do modelo a partir do config do job
- [ ] Backfill dos modelos existentes a partir de `training_jobs.config` (via `trainingJobId`); modelos órfãos sem job ficam com `target` null e são tratados como "sem alvo conhecido" na UI (mostram configuração, não relatório)
- [ ] `findLatestModelScoped` (ou helper equivalente) passa a expor `target` e `ignoredColumns` do modelo vigente
- [ ] Typecheck passes

### US-004: Prever unificado — relatório à direita
**Description:** Como usuária, ao abrir o Prever com um modelo já treinado quero ver o relatório dele imediatamente; ao trocar o atributo alvo, quero ver a configuração de treinamento para criar um novo modelo.

**Acceptance Criteria:**
- [ ] Ao abrir `/predict` com modelo vigente cujo `target` é conhecido: o alvo do modelo vem pré-selecionado na sidebar e a área à direita renderiza o **Insights Report** completo (reutilizando `classification-report.tsx` / `regression-report.tsx` / `forecasting-report.tsx` e seções compartilhadas, sem alterações de conteúdo)
- [ ] Selecionar na sidebar um alvo **diferente** do alvo do modelo vigente troca a área direita para a configuração de treinamento (tipo de problema inferido, eixo temporal, modos, botão "Criar Modelo Preditivo →")
- [ ] Voltar a selecionar o alvo do modelo vigente volta a mostrar o relatório (sem novo treino)
- [ ] Sem modelo vigente (ou modelo sem `target` conhecido): comportamento atual — configuração de treinamento direto; o banner verde "já tem modelo → Ver relatório" deixa de existir (o relatório já está na tela)
- [ ] As colunas ignoradas exibidas junto ao relatório refletem `ignoredColumns` do modelo vigente; ao trocar para modo configuração, a sidebar volta a ser editável (tabs Prever/Ignorar como hoje)
- [ ] Pós-treino: `training-progress.tsx` redireciona para `/projects/{id}/predict` (que abre mostrando o relatório do modelo recém-treinado) em vez de `/reports`
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Remoção da aba Relatórios e redirecionamentos
**Description:** Como usuária, não quero uma aba "Relatórios" duplicando o que o Prever já mostra; links antigos devem continuar chegando ao lugar certo.

**Acceptance Criteria:**
- [ ] Aba "Relatórios" removida do `ProjectNavbar` (`layout.tsx` do projeto); abas restantes: Preparar, Explorar, Prever, Publicar
- [ ] Rota `/projects/{id}/reports` vira `redirect` permanente para `/projects/{id}/predict` (nenhum link antigo quebra)
- [ ] Todos os pontos que linkavam `/reports` passam a linkar `/predict`: CTA "Ver relatório" do card de projeto (`projects-view.tsx`), botão "Ver relatório" da tela do job, e qualquer link na tela Publicar
- [ ] Componentes de relatório movidos/importados para o contexto do Prever; `grep` limpo: nenhuma referência de navegação restante a `/reports` em `apps/web/src` (exceto o próprio redirect)
- [ ] Fallback de modelo antigo sem `insights`/`metrics` ("Este modelo não tem dados de relatório") preservado dentro do Prever, com CTA levando ao modo configuração
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Botão de retreinar na visão do relatório
**Description:** Como usuária, ao analisar o relatório quero um botão para retreinar o modelo, pois posso ter deixado de ignorar um atributo (ex.: um id ou um campo que vaza o resultado) e quero testar um novo modelo.

**Acceptance Criteria:**
- [ ] A visão de relatório dentro do Prever exibe botão visível "Retreinar modelo" (posição estável, ex.: topo do relatório)
- [ ] Clicar troca a área direita para o modo configuração com o estado do modelo vigente pré-carregado: mesmo alvo selecionado, mesmas colunas ignoradas marcadas e mesmo modo de treinamento — tudo editável antes de confirmar
- [ ] A pessoa pode alterar ignorados/modo/eixo temporal e disparar "Criar Modelo Preditivo →"; o novo modelo, ao concluir, substitui o vigente e o Prever volta a mostrar o novo relatório
- [ ] Um "Cancelar"/voltar no modo configuração retorna ao relatório sem treinar
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Corrigir carga do parquet no sandbox do Explore
**Description:** Como usuária, quero que minhas perguntas na aba Explorar executem de fato, em vez de falhar com "Unable to find a usable engine" ao carregar o dataset no sandbox.

**Acceptance Criteria:**
- [ ] O bootstrap do sandbox (`BOOTSTRAP_SCRIPT` em `executor-core.ts`) garante o engine de parquet antes do `pd.read_parquet`: tenta `import pyarrow` e, se ausente, instala no próprio sandbox (`pip install -q pyarrow`) antes de carregar o `df`
- [ ] Se mesmo assim a instalação/carga falhar, o erro retornado ao chat continua legível em português (comportamento atual de `error`, sem stacktrace cru na UI)
- [ ] Variável de ambiente opcional `E2B_TEMPLATE` permite apontar para um template e2b customizado com `pyarrow` pré-instalado (evita a latência do pip a cada sandbox novo); sem ela, usa o template default com o fallback de instalação — documentada no `.env.example`
- [ ] O timeout do bootstrap acomoda a instalação do pacote (não usar o mesmo orçamento apertado da execução de análise se insuficiente)
- [ ] Testes unitários do executor cobrindo o novo bootstrap (script contém o fallback de instalação; falha de bootstrap vira `error` legível)
- [ ] Verificado de ponta a ponta: em um projeto com dataset processado, perguntar "Qual o valor médio por segmento?" na aba Explorar executa e retorna tabela/gráfico sem erro
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: Explore responde perguntas conversacionais sem gerar código
**Description:** Como usuária, ao perguntar coisas como "quem é você?" ou "que tipo de perguntas posso realizar?", quero uma resposta direta em texto, sem esperar geração e execução de código que não faz sentido para a pergunta.

**Acceptance Criteria:**
- [ ] Nova etapa de triagem no início do pipeline (`runExplorePipeline`): o LLM classifica a pergunta como **análise de dados** (precisa de pandas/Plotly sobre o dataset) ou **conversacional/meta** (saudações, "quem é você?", "o que você pode fazer?", dúvidas sobre como usar o chat)
- [ ] Perguntas conversacionais são respondidas em uma única chamada de LLM, em pt-BR, com a persona do analista e o contexto do dataset (`buildDatasetContext`) — sem sandbox, sem etapas "Gerando código"/"Executando análise" no SSE
- [ ] "Que tipo de perguntas posso realizar?" responde com exemplos concretos baseados nas colunas reais do dataset (ex.: cita 2–3 perguntas possíveis usando os nomes das colunas)
- [ ] O resultado persiste e renderiza como mensagem só de texto: sem aba "Código", sem tabela/gráfico (shape `ExploreResult` acomoda `code` vazio/nulo nesse caso)
- [ ] Perguntas de análise seguem o pipeline completo exatamente como hoje (triagem não degrada o caminho principal); em caso de dúvida na classificação, o pipeline trata como análise
- [ ] Histórico do chat continua alimentando as duas rotas (uma pergunta de análise pode vir depois de uma conversacional e vice-versa)
- [ ] Testes unitários do pipeline cobrindo: pergunta conversacional não chama `executeAnalysis`; pergunta de análise não muda de comportamento; classificação ambígua cai em análise
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-009: Paginação da grade do Prepare
**Description:** Como usuária, quero navegar por todas as linhas do meu dataset no Prepare — não só as 500 primeiras — para conferir os dados de tabelas grandes.

**Acceptance Criteria:**
- [ ] Endpoint de leitura paginada do dataset completo a partir do Parquet da versão ativa (ex.: `GET /api/datasets/{id}/rows?page=N&pageSize=100`), escopado por `orgId` como as demais rotas
- [ ] Rodapé da grade com controles de paginação: anterior/próxima, indicador "Linhas X–Y de N" e tamanho de página padrão de 100 linhas
- [ ] Primeira página renderiza instantaneamente (pode servir da amostra já em memória); páginas seguintes buscam do endpoint com loading state na grade, sem layout shift no cabeçalho
- [ ] Distribuições do cabeçalho e sidebar de correlações não mudam (continuam vindas do profiling sobre o dataset completo)
- [ ] Ordenação por coluna passa a ser aplicada no servidor sobre o dataset completo (a página exibida reflete a ordenação global), ou — se inviável no momento — o controle de ordenação é desabilitado com tooltip explicando que ordena apenas com paginação; decisão registrada no código
- [ ] Datasets com ≤ 500 linhas: paginação oculta ou inerte (comportamento atual preservado)
- [ ] Performance: trocar de página em dataset de 100k linhas responde em < 2s
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-010: Rebranding — SignalOS vira AutoML (nome, logo e ícone)
**Description:** Como usuária, quero ver a nova marca AutoML em toda a plataforma — nome, logo e ícone — sem nenhum resquício de SignalOS.

**Acceptance Criteria:**
- [ ] Componente `Logo` (`components/auth/logo.tsx`) atualizado: ícone passa a ser `public/automl-icon.png`; a variante completa exibe o wordmark — usando `public/automl-logo.png` ou o ícone + texto "AutoML" no padrão tipográfico atual (decidir pelo que ficar legível; ver critério do painel escuro)
- [ ] Legibilidade no painel escuro do auth (`auth-shell.tsx`, prop `dark`): se o PNG do logo não tiver fundo transparente ou não contrastar, usar ícone + texto "AutoML" em branco nessa variante
- [ ] Favicons regenerados a partir do novo ícone: `src/app/icon.png` e `src/app/apple-icon.png` em versões **quadradas** (o asset é 1439×1093 — centralizar com padding transparente, sem distorcer)
- [ ] Todas as strings "SignalOS" substituídas por "AutoML": metadata em `app/layout.tsx` (title default, template, applicationName, description), copyright em `auth-shell.tsx`, "Criado com SignalOS" em `app/app/[slug]/page.tsx`, `appName` em `lib/auth.ts`, persona do Explore em `lib/explore/pipeline.ts` e `lib/explore/suggestions.ts`
- [ ] Assets antigos removidos: `public/signalos-icon.png` e `public/signalos-logo.png` deletados; `grep -ri "signalos" apps/web/src apps/web/public` limpo
- [ ] Sidebar (colapsada e expandida), telas de login/cadastro e navbar do projeto exibem a nova marca sem distorção nem layout shift
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

**Criação de projeto**
- FR-1: O sistema deve exigir um nome (não vazio, trimado, ≤ 100 caracteres) no momento da criação do projeto, via diálogo, antes de qualquer insert no banco.
- FR-2: Cancelar o diálogo não deve criar projeto nem registro de auditoria.

**Modos de treinamento**
- FR-3: O sistema deve oferecer exatamente 4 modos: `fastest` ("Mais rápido"), `high_quality` ("Alta qualidade"), `higher_quality` ("Qualidade superior"), `production` ("Produção"), ordenados por tempo de treinamento, com default `high_quality`.
- FR-4: A UI deve explicar que os modos são ordenados pelo tempo de treino e que mais tempo não implica mais acurácia, citando overfitting em linguagem simples.
- FR-5: O worker deve mapear cada modo a um orçamento de busca crescente e aceitar os valores legados `fast`/`standard`/`full` como aliases.

**Prever unificado**
- FR-6: A tabela `models` deve armazenar `target` e `ignored_columns` do treinamento que gerou o modelo, com backfill dos modelos existentes.
- FR-7: Com modelo vigente e alvo selecionado igual ao do modelo, a área direita do Prever deve renderizar o Insights Report; com alvo diferente (ou sem modelo), deve renderizar a configuração de treinamento.
- FR-8: A alternância relatório ↔ configuração deve ocorrer client-side ao mudar a seleção do alvo, sem novo treinamento e sem full reload.
- FR-9: A aba "Relatórios" deve ser removida da navbar; `/projects/{id}/reports` deve redirecionar para `/projects/{id}/predict`; todos os links internos devem apontar para o Prever.
- FR-10: Ao concluir um treinamento, o usuário deve chegar ao Prever exibindo o relatório do novo modelo.

**Retreinar**
- FR-11: A visão de relatório deve expor "Retreinar modelo", que abre a configuração pré-carregada com alvo, colunas ignoradas e modo do modelo vigente, tudo editável.
- FR-12: Um novo treinamento concluído substitui o modelo vigente do projeto (semântica atual de "modelo mais recente" preservada).

**Explore (bug)**
- FR-13: O bootstrap do sandbox do Explore deve garantir um engine de parquet (`pyarrow`) antes de carregar o dataset — instalando-o no sandbox quando ausente — e falhas remanescentes devem chegar ao chat como mensagem legível em português.
- FR-14: O template do sandbox e2b deve ser configurável via env (`E2B_TEMPLATE`), com fallback para o template default.

**Explore (triagem de perguntas)**
- FR-15: O pipeline do Explore deve classificar cada pergunta como análise ou conversacional antes de gerar código; perguntas conversacionais devem ser respondidas em texto, sem uso do sandbox.
- FR-16: Em classificação ambígua, o pipeline deve tratar a pergunta como análise (nunca negar uma análise possível).
- FR-17: Respostas conversacionais devem usar o contexto real do dataset (nomes de colunas) ao explicar o que o chat pode fazer.

**Prepare (paginação)**
- FR-18: O Prepare deve permitir navegar por todas as linhas do dataset via paginação servida do Parquet da versão ativa (página padrão de 100 linhas), com indicador de posição e total.
- FR-19: O acesso paginado deve ser escopado por organização e não deve alterar distribuições do cabeçalho nem correlações (que seguem vindas do profiling).

**Rebranding**
- FR-20: Toda a plataforma deve exibir a marca AutoML (nome, logo, ícone e favicons); nenhuma ocorrência de "SignalOS" deve restar em UI, metadata, prompts do Explore ou assets.
- FR-21: Os favicons devem derivar do novo ícone em versão quadrada, sem distorção.

## Non-Goals (Out of Scope)

- Histórico de modelos ou múltiplos modelos simultâneos por projeto/alvo — segue valendo "um modelo vigente" (o mais recente).
- Comparação lado a lado entre modelo antigo e retreinado.
- Alterar o conteúdo/estrutura dos Insights Reports existentes (só mudam de lugar).
- Mudar o conjunto de algoritmos candidatos por modo no worker (o modo segue controlando apenas o orçamento de busca).
- Renomear projeto em outros pontos além dos já existentes (navbar inline e menu do card).
- Migrar dados de `training_jobs.config` além do backfill de `models.target`/`ignored_columns`.

## Design Considerations

- Diálogo de criação de projeto com `Dialog` shadcn/ui já usado no `RenameDialog` — reaproveitar padrão visual (título, input, ações à direita, CTA azul primário).
- Os 4 modos podem manter o padrão visual atual de radios com título + descrição; a nota de overfitting funciona bem como texto auxiliar da seção ou `Tooltip`/`Popover` "Como escolher?" — desde que acessível sem sair da tela.
- No Prever unificado, a área direita alterna entre dois estados claros; usar transição suave (sem layout shift na sidebar). O botão "Retreinar modelo" deve ficar em posição estável no topo do relatório, não escondido no fim do scroll.
- Sidebar em modo relatório: alvo do modelo destacado como selecionado; colunas ignoradas visíveis mas somente leitura até entrar no modo configuração/retreino.

## Technical Considerations

- `models.target`/`models.ignored_columns`: preencher no worker (`model_train.py`) no mesmo insert do modelo; backfill em migration SQL via join com `training_jobs` (usar `config->>'target'`).
- Aliases de modo: normalizar no ponto único de leitura do worker (`config.get("mode")`) e, no web, aceitar apenas os 4 novos valores em novos submits — jobs antigos com valores legados só existem no histórico.
- O relatório é hoje montado server-side em `reports/page.tsx` (switch por `problemType` + shape dos insights). Extrair essa montagem para um componente/página compartilhável renderizado dentro do `/predict` (ex.: RSC que o `predict/page.tsx` compõe), evitando duplicar a lógica de mapeamento de insights.
- `predict/page.tsx` já redireciona para a tela do job quando há treino `queued|running` — manter; o estado "relatório vs configuração" só se aplica quando não há job ativo.
- `/reports` como redirect: manter a rota (`page.tsx` mínimo com `redirect()`), não deletar, para não quebrar links salvos/histórico do browser.
- Deployments continuam apontando para o modelo mais recente (comentário existente no schema) — nada muda ali, mas o retreino troca o modelo servido; já é o comportamento atual.
- Explore/e2b: o fallback de instalação vive no `BOOTSTRAP_SCRIPT` (`executor-core.ts`), que roda uma única vez por sandbox — o custo do `pip install` não se repete a cada pergunta (sandbox é reutilizado por chat com TTL de 10 min). `E2B_TEMPLATE` é lida em `lib/sandbox.ts` (`Sandbox.create({ template })`); o teste existente `explore-executor.test.ts` já mocka o sandbox e cobre o parse de erros de bootstrap.
- Triagem do Explore: implementar como chamada curta de LLM no início de `runExplorePipeline` (`lib/explore/pipeline.ts`) com saída restrita (ex.: `{"route": "analysis" | "chat"}`), ou fundida à etapa de planejamento (o plano pode retornar "resposta direta" + o texto). Manter o núcleo injetável/testável como hoje; a rota conversacional emite uma etapa SSE própria (ex.: "Respondendo") e devolve `ExploreResult` com `table`/`chart`/`code` nulos — conferir os pontos de renderização que assumem `code` presente (aba Código).
- Rebranding: os PNGs fornecidos já estão em `apps/web/public/` (`automl-logo.png`, `automl-icon.png`). Ambos aparentam fundo branco/claro — verificar transparência real do RGBA antes de usar sobre o painel escuro do auth; se necessário, recortar o fundo ou preferir ícone + texto na variante `dark`. Para `icon.png`/`apple-icon.png`, gerar quadrados (ex.: 512×512 e 180×180) com o hexágono centralizado (`sips`/`sharp`). O nome também aparece em títulos de e-mail/textos fixos — conferir com `grep -ri signalos` fora de `src` (ex.: `.env.example`, READMEs de `apps/web`).
- Paginação do Prepare: o dataset completo está em Parquet no volume; o Next (Node) precisa de um leitor — opções: `hyparquet`/`parquet-wasm` no route handler (leitura por row group + slice) ou um endpoint fino no worker Python que devolve a página em JSON. Escolher na implementação considerando o requisito de < 2s por página em 100k linhas; cachear handle/metadados do arquivo entre requests da mesma sessão se necessário. A ordenação global server-side pode exigir ler o arquivo inteiro — se ficar caro, aplicar a alternativa registrada na US-009 (ordenação desabilitada com paginação + tooltip).

## Success Metrics

- Zero projetos novos criados com nome "Projeto sem título".
- Com modelo treinado, o relatório aparece em 1 clique a partir da lista de projetos (card → Prever com relatório) — sem aba intermediária.
- Trocar o alvo na sidebar alterna relatório ↔ configuração instantaneamente (sem request de treino, sem reload).
- Retreinar com um atributo a menos leva no máximo 3 interações a partir do relatório (Retreinar → ajustar ignorados → Criar Modelo).
- Nenhum link antigo para `/reports` resulta em 404.
- Perguntas na aba Explorar sobre um dataset processado executam sem erro de engine de parquet (bug atual zerado).
- Perguntas conversacionais no Explorar respondem em < 10s (sem criação de sandbox nem geração de código).
- Qualquer linha de um dataset de 100k linhas é alcançável pela paginação do Prepare, com troca de página em < 2s.
- Zero ocorrências de "SignalOS" no app (UI, metadata, prompts e assets) após o rebranding.

## Open Questions

- Orçamentos exatos por modo (`1/2/4/8` configurações) estão bons ou "Produção" deveria também ampliar folds de validação/algoritmos? (Assumido: só orçamento de busca, como hoje.)
- O texto didático de overfitting deve aparecer sempre visível (valor de aula) ou recolhido num "Saiba mais"? (Assumido: acessível sem sair da tela; formato a critério do design.)
- Ao retreinar com **outro** alvo a partir do modo configuração, o relatório antigo se torna inacessível (semântica de modelo único). Vale exibir um aviso "isso substituirá o modelo atual" antes de treinar?
- Paginação do Prepare: 100 linhas/página está bom ou o tamanho deve ser selecionável (100/500/1000)? (Assumido: fixo em 100 no MVP.)
- Ordenação global server-side na grade paginada vale o custo já nesta iteração, ou desabilitar ordenação quando paginado é aceitável? (A US-009 admite as duas saídas; decidir na implementação.)
