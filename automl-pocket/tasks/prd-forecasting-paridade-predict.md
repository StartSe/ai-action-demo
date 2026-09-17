# PRD: Forecasting — Paridade de Opções de Treino e Relatório de Insights

## Introdução

O forecasting de série temporal já existe de ponta a ponta no AutoML desde a US-016 da plataforma: o Prever oferece "Eixo temporal (opcional)", o worker treina três candidatos (`naive`, `holt_winters`, `arima`) com seleção por MAPE em backtest, e o relatório mostra resumo + gráfico de histórico e previsão com intervalo de confiança.

O que **não** existe é a profundidade que a plataforma de referência (Akkio) oferece nas duas pontas dessa jornada:

**Na configuração do treino**, hoje quase tudo é decidido automaticamente e nada é ajustável:

- Não existe **escolha do tipo de modelo**. O `problemType` é inferido de um efeito colateral: escolher um alvo numérico e, depois, um "Eixo temporal (opcional)" enterrado no meio do formulário. A referência abre o Predict com uma tela "Train Model" de dois cards — **Predict** ("preveja categorias e valores numéricos") e **Forecast** ("crie um modelo dependente do tempo") — e só então mostra o formulário correspondente. Sem essa bifurcação, cada campo novo de forecasting (horizonte, agregação, tipo de modelo, ID Field) vira mais um campo condicional numa tela que já mistura dois fluxos diferentes.
- O **horizonte** de previsão é a constante `FORECAST_HORIZON = 90` (`apps/worker/jobs/forecasting.py:38`) — a pessoa não escolhe até onde quer projetar. A referência oferece um campo "Target Predicted Data Points" com default de 30% do comprimento da série.
- A **agregação temporal** é 100% inferida pelo espaçamento mediano entre pontos (`_infer_frequency`, linha 341) e não pode ser sobrescrita. A referência oferece "Aggregate Data Points" (diário/semanal/mensal) para suavizar dados irregulares.
- O **tipo de modelo** é sempre "melhor no backtest". A referência oferece um seletor em Advanced Settings, com "Best Backtest" como default e a opção de fixar um algoritmo específico.
- Não existe **ID Field**: datasets com várias séries no mesmo arquivo (vendas por loja, consumo por sensor, receita por produto) são achatados numa única série pela média (`series.groupby(level=0).mean()`, linha 325). O resultado é uma previsão do agregado, não uma previsão por loja/sensor/produto — que é o caso de uso real de quem sobe esse tipo de dado.

**No relatório de insights**, faltam quatro peças que a referência mostra:

- Um card de **Margem de confiança** explicitando quanto a incerteza cresce ao longo do horizonte (de ±A no primeiro período a ±B no último). O dado já está em `insights.forecast.predictions[].lower/upper` — falta a leitura.
- Um gráfico de **Desempenho preditivo** sobrepondo valor real e previsto na janela de backtest, com RMSE e MAE em destaque. Hoje RMSE/MAE só aparecem escondidos na tabela de candidatos dentro de "Detalhes Avançados", e a série do backtest não é persistida.
- Uma seção de **Sazonalidade** navegável por bucket (trimestre / mês / dia da semana / hora), mostrando o impacto percentual de cada período. Hoje a sazonalidade é uma frase de texto ("Sazonalidade detectada: o padrão se repete a cada 12 períodos").
- Controles de leitura no gráfico principal: alternar o intervalo de confiança, ver os números em **tabela** e **baixar a previsão em CSV**.

Esta PRD fecha esses dois gaps num único ciclo.

### Estado atual relevante (já investigado no código)

**Worker — `apps/worker/jobs/forecasting.py` (450 linhas):**

- `train_forecasting(df, *, target, ignored_columns, mode, column_types, time_column, on_progress, on_candidates) -> TrainingResult` é função pura; a persistência vive em `jobs/model_train.py` (dict `TRAINERS`, linha 32).
- `_build_series` (linha 302) converte alvo/tempo, descarta linhas inválidas, agrega timestamps duplicados **pela média**, infere a frequência e faz `resample(freq).mean().interpolate(method="time").ffill().bfill()`.
- Constantes: `MIN_POINTS = 20`, `MIN_TRAIN_POINTS = 12`, `BACKTEST_FRACTION = 0.2`, `FORECAST_HORIZON = 90`, `HORIZONS = [7, 30, 90]`, `HISTORY_LIMIT = 365`, `Z_95 = 1.96`, `SEASONALITY_MIN_AUTOCORR = 0.2`.
- `_FREQUENCIES` (linha 47) é a tupla `(máx. dias entre pontos, alias pandas, período sazonal, rótulo pt, rótulo do ciclo)` com `h/D/W/MS/QS/YS`.
- Split temporal: `test_size = max(4, min(round(len(series) * 0.2), 90))`, ajustado para preservar `MIN_TRAIN_POINTS`; `train, test = series.iloc[:-test_size], series.iloc[-test_size:]`.
- O loop de candidatos (linha 174) roda `configs[:config_count]` por algoritmo (`mode_config_count(mode)`), pontua com `_score_forecast` (mape/rmse/mae) e guarda só as métricas — **as previsões do backtest são descartadas** (linha 189, variável `predicted` local).
- Depois de eleger o vencedor, faz refit na série completa (`final_model = ForecastModel(...)`, linha 232) e chama `.forecast(FORECAST_HORIZON)`.
- `ForecastModel` (linha 64) é o wrapper picklável que vai no artefato joblib como "pipeline"; `.forecast(h)` devolve DataFrame `value/lower/upper`.
- Shape atual de `models.insights.forecast`: `{frequency, frequencyLabel, seasonalPeriod, horizons, mape, summary{mape,text}, seasonality{detected,period,strength,label,text}, history[{date,value}] (cap 365), predictions[{date,value,lower,upper}] (90)}`.
- Testes: `apps/worker/tests/test_automl_forecasting.py` e `test_insights_forecasting.py`.

**Web — configuração do treino:**

- `predict/predict-view.tsx` — sidebar de colunas, select "Eixo temporal (opcional)" (linhas 505-538, só aparece se `dateColumns.length > 0`, desabilitado com alvo categórico), seção "Modo de treinamento" (linhas 540-591), botão de submit.
- `predict/actions.ts` — `StartTrainingInput = {target, ignoredColumns, mode, timeColumn}` (linha 31); `startTraining` valida tipos das colunas, deriva `problemType` (linha 109) e grava `training_jobs.config`.
- O `problemType` é **inferido**: categórico → `classification`; numérico sem eixo temporal → `regression`; numérico com eixo temporal → `forecasting`.

**Web — relatório:**

- `predict/forecasting-report.tsx` (243 linhas) — header, `SectionCard` "Resumo" (MAPE grande + texto + frase de sazonalidade), `SectionCard` "Histórico e Previsão", `<details>` "Detalhes Avançados do Modelo" com a tabela de candidatos (MAPE/RMSE/MAE/configs/tempo). Os tipos `ForecastInsights`, `ForecastSeasonality`, `ForecastingMetrics` estão declarados aqui.
- `predict/forecast-sections.tsx` (265 linhas) — `ForecastChartSection`: SVG puro 720×280, seletor de horizonte (fatia `predictions` client-side, sem novo treino), banda de IC **sempre visível**, divisor tracejado no fim do histórico, pontos com `<title>` nativo em horizontes ≤30, legenda.
- `SectionCard` é reexportado de `classification-report.tsx` e é o wrapper padrão de seção nos três tipos de problema.
- Não há biblioteca de gráficos: **todos os gráficos do produto são SVG escritos à mão**. Manter esse padrão.

### Decisões já tomadas com o produto

- **Uma PRD só** cobrindo as duas pontas (opções de treino + relatório), porque o horizonte configurável e o gráfico de backtest se reforçam.
- **O tipo de modelo passa a ser uma escolha explícita**, não uma inferência. O Prever ganha a tela "Treinar modelo" com dois cards ("Prever" e "Previsão temporal"), como na referência. Isso é pré-requisito das opções novas: sem a bifurcação, horizonte/agregação/tipo de modelo/ID Field seriam quatro campos condicionais empilhados na mesma tela do fluxo de classificação e regressão.
- **No fluxo de Previsão temporal o eixo temporal é obrigatório** — deixa de ser o select "opcional" que hoje decide o tipo de problema por efeito colateral.
- **ID Field entra em escopo completo**: treino por subsequência, relatório com seletor de série e visão agregada.
- **Tipo de modelo expõe apenas o que o worker já sabe fazer**: "Melhor backtest (padrão)", "Baseline (último valor)", "Holt-Winters" e "ARIMA". **Sem Prophet** — adicionar a lib ao worker significa imagem maior e build com cmdstan; a decisão original do projeto (`tasks/prd-plataforma-automl.md:399`) foi statsmodels e ela se mantém. Também ficam de fora os "Autoregressive Ensemble" da referência.
- **Um único algoritmo vencedor por modelo**, mesmo com ID Field: a seleção roda sobre uma amostra de séries e o algoritmo eleito é refitado em todas. Isso preserva o shape de `training_jobs.candidates` (consumido pela tela de progresso) e mantém o custo de treino próximo do atual.
- Publicar forecasting no **Deploy continua fora de escopo** (`deploy/context.ts:23`, FR-9 de `prd-deployments.md`). Esta PRD não desbloqueia a publicação.

## Objetivos

- A pessoa **escolhe** o tipo de modelo ("Prever" ou "Previsão temporal") antes de configurar, e cada fluxo mostra só os campos que lhe dizem respeito.
- A pessoa controla **até onde** a previsão vai (horizonte), **em que granularidade** (agregação) e **com qual algoritmo** — sem precisar aceitar o automático.
- Datasets com várias séries no mesmo arquivo produzem **uma previsão por série**, não uma média achatada.
- O relatório responde "quão confiável é isso?" com evidência visual: real × previsto no backtest, e a incerteza crescendo ao longo do horizonte.
- A sazonalidade deixa de ser uma frase e vira um gráfico navegável por bucket temporal.
- Os números da previsão saem da tela: tabela expansível e download em CSV.
- Nada disso quebra modelos já treinados — o relatório degrada graciosamente quando os campos novos não existem.

## User Stories

### Bloco A — Worker: novos dados nos insights

### US-001: Persistir a série de backtest do modelo vencedor
**Description:** Como usuária, quero ver o que o modelo previu contra o que de fato aconteceu na janela de teste, para julgar se confio nele — e não só um número de erro.

**Acceptance Criteria:**
- [ ] Após eleger o vencedor (`apps/worker/jobs/forecasting.py`, depois da linha 226), refitar `ForecastModel(winner.key, winner_params, train)` e prever `len(test)` períodos para recuperar as previsões do backtest
- [ ] Adicionar a chave `backtest` em `insights.forecast` com o shape: `{points: [{date, actual, predicted}], rmse, mae, mape, trainPoints, testPoints}` — datas ISO, valores arredondados em 4 casas
- [ ] `backtest.rmse/mae/mape` são **exatamente** os do candidato vencedor em `models.metrics.candidates[best]` (mesmo refit, mesmos params) — cobrir isso com asserção no teste
- [ ] `points` limitado aos últimos 180 registros da janela de teste (na prática `test_size` ≤ 90, então nunca trunca hoje; o cap é proteção)
- [ ] O refit extra não altera `models.metrics`, o artefato joblib nem a previsão futura (que continua vindo do refit na série completa)
- [ ] Teste em `apps/worker/tests/test_insights_forecasting.py` valida o shape, o alinhamento de datas com o índice de `test` e a igualdade das métricas com o candidato vencedor
- [ ] `uv run pytest -q` passa no container

### US-002: Calcular sazonalidade por bucket temporal
**Description:** Como usuária, quero ver quanto cada mês (ou trimestre, dia da semana, hora) puxa o resultado para cima ou para baixo, para entender o padrão do meu negócio — não só saber que "existe sazonalidade".

**Acceptance Criteria:**
- [ ] Nova função pura `_seasonal_buckets(series, freq) -> list[dict]` em `forecasting.py`, com teste dedicado
- [ ] Índice sazonal clássico: razão entre o valor observado e a média móvel centrada de um ciclo completo; o impacto de cada bucket é a média das razões do bucket, expressa como desvio percentual da média geral (ex.: `0.596` → +59,6%)
- [ ] Buckets calculados conforme a frequência da série, omitindo os que não se aplicam:
  - `h` → Hora do dia (24), Dia da semana (7), Mês (12)
  - `D` → Dia da semana (7), Mês (12), Trimestre (4)
  - `W` → Mês (12), Trimestre (4)
  - `MS` → Mês (12), Trimestre (4)
  - `QS` → Trimestre (4)
  - `YS` → nenhum bucket (a chave sai vazia)
- [ ] Um bucket só entra se a série cobrir **pelo menos 2 ciclos completos** dele; caso contrário é omitido da lista
- [ ] Shape gravado em `insights.forecast.seasonality.buckets`: `[{key: "quarter"|"month"|"weekday"|"hour", label: "Trimestral"|"Mensal"|"Dia da semana"|"Hora do dia", items: [{label, impact, count}]}]` — `label` dos itens em pt-BR ("Jan", "Seg", "T1", "08h"), `impact` como fração assinada (`0.145` = +14,5%), `count` = nº de observações no bucket
- [ ] `seasonality.detected/period/strength/label/text` continuam existindo e inalterados (o texto atual não regride)
- [ ] Séries com valores médios próximos de zero não geram divisão instável: buckets cujo denominador seja `< 1e-9` são omitidos
- [ ] `uv run pytest -q` passa no container

### Bloco B — Relatório: novas seções de leitura

### US-003: Card de Margem de confiança no Resumo
**Description:** Como usuária, quero saber quanto a incerteza da previsão cresce ao longo do tempo, para decidir até que ponto do horizonte a projeção é utilizável.

**Acceptance Criteria:**
- [ ] O "Resumo" vira dois cards lado a lado (empilhados no mobile): à esquerda o erro médio existente, à direita o novo card "Margem de confiança"
- [ ] Card da esquerda reenquadrado como "A previsão costuma errar" + `±X%` grande (o MAPE já existente) + o texto de `summary.text`; o link "Ver detalhes de acurácia" existente é preservado se já houver equivalente
- [ ] Card da direita, calculado 100% no client a partir de `insights.forecast.predictions` (sem mudança no worker): metade da largura do IC no **primeiro** período (`(upper - lower) / 2`) e no **último**, o crescimento absoluto entre os dois, e o span do horizonte em linguagem natural derivado de `frequencyLabel` + nº de períodos (ex.: "16 meses", "90 dias")
- [ ] Texto do card: "±{crescimento} de aumento ao longo de {span}" + "A margem cresce de ±{A} a ±{B}. Margens maiores significam menos certeza do modelo."
- [ ] Sparkline SVG minúsculo (≈120×44) ao lado, desenhando a banda `lower`/`upper` ao longo do horizonte
- [ ] Números formatados com `toLocaleString("pt-BR")`, no mesmo padrão de `formatNumber` já usado no arquivo
- [ ] Modelos antigos sem `predictions` (ou com lista vazia) não renderizam o card — sem erro de runtime
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Seção "Desempenho preditivo" (real × previsto)
**Description:** Como usuária, quero ver a curva do que aconteceu sobreposta à do que o modelo previu na janela de teste, para confiar (ou não) na previsão do futuro.

**Acceptance Criteria:**
- [ ] Nova `SectionCard` "Desempenho preditivo", posicionada entre o Resumo e "Histórico e Previsão"
- [ ] Texto de contexto: "Para encontrar os padrões dos seus dados, treinamos o modelo com o início do histórico e validamos nos últimos {testPoints} períodos. Veja como ele se saiu."
- [ ] Gráfico SVG de duas linhas sobrepostas a partir de `insights.forecast.backtest.points`: **Valor real** (cinza, contínua) e **Previsão** (cor primária, contínua), com legenda de bolinhas no topo — mesmo padrão visual de `forecast-sections.tsx`
- [ ] Eixo X com o primeiro, o do meio e o último rótulo de data (reusar `formatDate(iso, frequency)`); eixo Y com pelo menos mín/máx rotulados
- [ ] À direita do gráfico (empilhado no mobile), a coluna de métricas: `±X%` (MAPE) com o rótulo "A previsão costuma errar", **RMSE** e **MAE** com os valores de `backtest`
- [ ] Nota explicativa em caixa destacada: "RMSE (raiz do erro quadrático médio) mede o quanto as previsões erram em média, penalizando mais os erros grandes. Quanto menor, melhor."
- [ ] `backtest` é opcional no tipo `ForecastInsights` (`backtest?:`) — modelos treinados antes desta PRD simplesmente não renderizam a seção
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Seção "Sazonalidade" com abas por bucket
**Description:** Como usuária, quero navegar entre trimestre, mês, dia da semana e hora para ver quais períodos puxam meu resultado para cima ou para baixo.

**Acceptance Criteria:**
- [ ] Nova `SectionCard` "Sazonalidade" com subtítulo "Variações que se repetem em intervalos regulares", posicionada depois de "Histórico e Previsão"
- [ ] Layout de duas colunas: lista vertical de abas à esquerda (uma por bucket disponível em `seasonality.buckets`) e o gráfico da aba ativa à direita; no mobile as abas viram uma linha horizontal rolável
- [ ] Gráfico de barras SVG com linha de base em 0%: barras **verdes acima** de 0 e **vermelhas abaixo**, rótulo percentual no topo de cada barra (`+14,5%` / `-32,1%`), eixo Y em pontos percentuais
- [ ] Título do gráfico: "Impacto {label do bucket} em {nome do alvo}"
- [ ] A primeira aba vem selecionada por padrão; a seleção é estado local do client component
- [ ] A frase de sazonalidade atual (`seasonality.text`) continua aparecendo no Resumo, como hoje — esta seção a complementa, não a substitui
- [ ] Quando `seasonality.buckets` estiver ausente ou vazio (modelos antigos, séries anuais), a seção inteira não é renderizada
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Toggle do intervalo de confiança e tabela da previsão
**Description:** Como usuária, quero alternar o intervalo de confiança e ver os números da previsão em tabela, para ler o resultado com precisão em vez de estimar pelo gráfico.

**Acceptance Criteria:**
- [ ] Toggle "Mostrar intervalo de confiança" no cabeçalho do gráfico, ao lado do seletor de horizonte; **ligado por padrão** (preserva o comportamento atual). Desligado, some a banda e o item de legenda correspondente
- [ ] Link "Mostrar tabela" abaixo do gráfico expande uma tabela com as colunas **Data**, **Previsão**, **Mínimo (IC 95%)**, **Máximo (IC 95%)** — uma linha por período do horizonte selecionado, datas via `formatDate`, números via `formatNumber`
- [ ] A tabela respeita o horizonte selecionado e rola verticalmente com `max-height` (não estica a página em horizontes de 90 períodos)
- [ ] Com o toggle desligado, as colunas de mínimo e máximo somem da tabela também
- [ ] Ambos os estados são locais ao client component, sem novo request
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Download da previsão em CSV
**Description:** Como usuária, quero baixar a previsão em CSV, para levar o resultado para uma planilha ou apresentação.

**Acceptance Criteria:**
- [ ] Botão "Baixar previsão (CSV)" no rodapé da seção "Histórico e Previsão", gerando o arquivo no client (`Blob` + `URL.createObjectURL`, com revoke após o clique)
- [ ] Arquivo em `utf-8-sig` (com BOM) e separador `;` — mesmo padrão do CSV de predição em lote, para abrir corretamente no Excel pt-BR
- [ ] Cabeçalho do CSV: `data;previsao;minimo;maximo`; números com vírgula decimal (pt-BR)
- [ ] O arquivo contém **todos** os períodos previstos, não só o horizonte visível no gráfico
- [ ] Nome do arquivo `previsao-{target}.csv`, com o alvo normalizado (minúsculo, sem acentos, espaços → `-`)
- [ ] Com ID Field ativo (US-018), o CSV exporta a série selecionada e o nome do arquivo inclui o identificador normalizado
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### Bloco C — Escolha do tipo de modelo e opções de treino

### US-008: Tela de escolha do tipo de modelo
**Description:** Como usuária, quero escolher explicitamente entre "prever um resultado" e "projetar uma métrica no tempo" antes de configurar, para que a tela me mostre só o que importa para o meu caso.

**Acceptance Criteria:**
- [ ] Quando o Prever entra em modo configuração **sem um tipo escolhido**, exibe a tela "Treinar modelo" com dois cards lado a lado (empilhados no mobile), no lugar do formulário
- [ ] Card **"Prever"** — ícone + descrição "Preveja categorias ou valores numéricos a partir dos seus atributos." Leva ao formulário atual, **sem** o select de eixo temporal
- [ ] Card **"Previsão temporal"** — ícone + descrição "Projete uma métrica ao longo do tempo, com base no histórico." Leva ao formulário de forecasting
- [ ] O card "Previsão temporal" fica **desabilitado** quando o dataset não tem nenhuma coluna do tipo `date`, com a nota: "Este dataset não tem colunas de data. Você pode converter uma coluna em data na aba Preparar."
- [ ] A escolha é refletida na URL como search param (`?tipo=prever` | `?tipo=previsao`), para que voltar pelo navegador funcione e o estado sobreviva a refresh
- [ ] O formulário escolhido exibe no topo o tipo ativo e um botão "Trocar tipo de modelo" que volta à tela de escolha, preservando alvo e colunas ignoradas quando fizer sentido
- [ ] Com **modelo vigente**, o Prever continua abrindo direto no relatório (comportamento atual); "Retreinar modelo" abre o formulário **do tipo do modelo vigente**, pulando a tela de escolha, mas com o botão "Trocar tipo de modelo" disponível
- [ ] No tipo **Previsão temporal**, o eixo temporal deixa de ser opcional: o select passa a ser "Eixo temporal" (obrigatório), o botão de treinar fica desabilitado enquanto nenhum for escolhido, e só alvos numéricos aparecem como selecionáveis na sidebar
- [ ] No tipo **Prever**, o select de eixo temporal some da tela e `timeColumn` é sempre enviado como `null`
- [ ] `StartTrainingInput` ganha `modelKind: "predict" | "forecast"`; `startTraining` passa a derivar `problemType` a partir dele — `forecast` → sempre `forecasting` (exige alvo numérico e `timeColumn` preenchido, com erros próprios em pt); `predict` → `classification` ou `regression` conforme o tipo do alvo, ignorando `timeColumn`
- [ ] A inferência antiga (numérico + eixo temporal → forecasting) é **removida** de `predict-view.tsx` e de `actions.ts` — o tipo passa a ser sempre explícito
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-009: Horizonte de previsão configurável
**Description:** Como usuária, quero dizer quantos períodos à frente quero prever, porque 90 períodos não faz sentido para toda série.

**Acceptance Criteria:**
- [ ] `StartTrainingInput` ganha `forecastHorizon: number | null` (`null` = automático), persistido em `training_jobs.config.forecastHorizon`
- [ ] Validação em `startTraining` (`predict/actions.ts`): se preenchido, precisa ser inteiro entre **1 e 365**; fora disso retorna erro em pt ("O horizonte de previsão precisa ser um número inteiro entre 1 e 365."). O campo é ignorado quando `problemType !== "forecasting"`
- [ ] No worker, `train_forecasting` ganha o kwarg `forecast_horizon: int | None = None`, repassado por `model_train.py` a partir do config
- [ ] Default automático = **30% do comprimento da série** após a agregação, arredondado, com piso de 1 e teto de 365 — substitui a constante `FORECAST_HORIZON` no cálculo da previsão futura
- [ ] `test_size` do backtest continua limitado por `min(round(len * 0.2), 90)` — o horizonte escolhido **não** aumenta a janela de teste (evita que um horizonte grande coma a série de treino)
- [ ] `insights.forecast.horizons` passa a ser derivado: os valores de `[7, 30, 90]` estritamente menores que o horizonte efetivo, mais o próprio horizonte ao final, sempre com pelo menos uma opção (ex.: horizonte 12 → `[7, 12]`; horizonte 5 → `[5]`)
- [ ] `insights.forecast.horizon` (novo campo) guarda o horizonte efetivo e `horizonSource: "auto" | "manual"` indica de onde veio
- [ ] Modelos antigos continuam válidos: o seletor do gráfico já lê `horizons` do insights
- [ ] `uv run pytest -q` passa no container

### US-010: Agregação temporal manual
**Description:** Como usuária, quero agrupar meus dados em buckets diários, semanais ou mensais, porque meus registros são irregulares e a série fica mais estável assim.

**Acceptance Criteria:**
- [ ] `StartTrainingInput` ganha `aggregation: "auto" | "hourly" | "daily" | "weekly" | "monthly" | "quarterly"` (default `"auto"`), persistido em `training_jobs.config.aggregation`
- [ ] Validação em `startTraining` rejeita valores fora dessa lista com erro em pt; ignorado quando `problemType !== "forecasting"`
- [ ] No worker, `_build_series` aceita `aggregation` e, quando diferente de `"auto"`, usa o alias pandas correspondente (`hourly→h`, `daily→D`, `weekly→W`, `monthly→MS`, `quarterly→QS`) em vez de `_infer_frequency`, mantendo o período sazonal e os rótulos pt-BR da entrada correspondente de `_FREQUENCIES`
- [ ] Agregar para um bucket **mais grosso** que o espaçamento natural é o caso esperado (ex.: dados horários → semanal); a função de agregação continua sendo a média (`.mean()`), como hoje
- [ ] Se a agregação escolhida produzir menos que `MIN_POINTS` períodos, o treino falha com `TrainingError` em pt explicando o motivo: "A agregação {rótulo} deixa apenas {n} períodos na série (mínimo de 20). Escolha uma granularidade mais fina."
- [ ] Se a agregação escolhida for **mais fina** que o espaçamento dos dados (ex.: dados mensais agregados por dia), o treino falha com `TrainingError` em pt em vez de gerar uma série majoritariamente interpolada
- [ ] `insights.forecast.frequency`/`frequencyLabel` refletem a agregação efetiva e o relatório continua exibindo o rótulo correto sem mudança
- [ ] `uv run pytest -q` passa no container

### US-011: Escolha manual do tipo de modelo
**Description:** Como usuária avançada, quero fixar o algoritmo de previsão, para comparar abordagens ou reproduzir um resultado específico.

**Acceptance Criteria:**
- [ ] `StartTrainingInput` ganha `forecastModel: "auto" | "naive" | "holt_winters" | "arima"` (default `"auto"`), persistido em `training_jobs.config.forecastModel`
- [ ] Validação em `startTraining` rejeita valores fora dessa lista com erro em pt; ignorado quando `problemType !== "forecasting"`
- [ ] No worker, quando diferente de `"auto"`, `_forecast_candidates` é filtrado para o algoritmo escolhido — a busca de configurações por modo (`mode_config_count`) continua valendo, e o vencedor é a melhor **configuração** daquele algoritmo no backtest
- [ ] Se o algoritmo escolhido não convergir em nenhuma configuração, o treino falha com `TrainingError` em pt: "O modelo {rótulo} não conseguiu se ajustar a esta série. Tente 'Melhor backtest' para escolha automática."
- [ ] `models.metrics.candidates` contém apenas o algoritmo escolhido (a tabela de "Detalhes Avançados" já renderiza qualquer quantidade de linhas, sem mudança)
- [ ] A lista estática de fallback de candidatos em `predict/jobs/[jobId]/training-progress.tsx` continua coerente: com escolha manual, o `on_candidates` emite só um item e a tela de progresso não mostra algoritmos que não vão rodar
- [ ] `uv run pytest -q` passa no container

### US-012: Configurações avançadas de forecasting no Prever
**Description:** Como usuária, quero ajustar horizonte, agregação e tipo de modelo na tela de configuração, sem precisar de API.

**Acceptance Criteria:**
- [ ] Novo bloco `<details>` "Configurações avançadas" **no formulário de Previsão temporal** (US-008), colapsado por padrão, posicionado logo abaixo do select de eixo temporal. Não existe no formulário de "Prever"
- [ ] Campo **"Períodos a prever"**: input numérico com placeholder "Automático", descrição "Até onde o modelo deve projetar o futuro, em número de períodos. Por padrão, 30% do tamanho da série."
- [ ] Campo **"Agrupar dados por"**: select com "Automático (sem agrupamento extra)", "Hora", "Dia", "Semana", "Mês", "Trimestre"; descrição "Agrupe os pontos em períodos fixos para suavizar dados irregulares e melhorar a precisão."
- [ ] Campo **"Tipo de modelo"**: select com "Melhor backtest (padrão)", "Baseline (último valor)", "Holt-Winters", "ARIMA"; descrição "Escolha o algoritmo de previsão. O padrão testa vários e fica com o que tiver melhor desempenho no backtest."
- [ ] Validação client-side espelhando o servidor: horizonte fora de 1–365 desabilita o botão de treinar e mostra a mensagem inline
- [ ] "Trocar tipo de modelo" (US-008) reseta os três campos para os defaults
- [ ] "Retreinar modelo" (`retrainFromModel`) pré-carrega os três campos com os valores do modelo vigente, como já faz com alvo/ignoradas/modo/eixo temporal — isso exige expor os campos novos no objeto `model` montado pela página
- [ ] Rótulos e descrições em pt-BR; o bloco segue o mesmo padrão visual do `<details>` de overfitting já existente
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### Bloco D — ID Field (previsão por subsequência)

### US-013: Separar o dataset em subsequências (função pura)
**Description:** Como desenvolvedor, preciso de uma função que quebre o DataFrame em uma série por identificador, aplicando os filtros e limites, para que o treino multi-série tenha uma base testável.

**Acceptance Criteria:**
- [ ] Nova função pura `_build_series_by_id(df, target, time_column, id_column, aggregation) -> tuple[list[SeriesEntry], int, int]` em `forecasting.py`, devolvendo as séries construídas, a contagem de descartadas e o total encontrado
- [ ] `SeriesEntry` (dataclass) carrega `id`, `label`, `series` (pd.Series já agregada) e `points`
- [ ] A frequência é inferida **uma única vez** sobre o conjunto de todos os pontos e reaplicada a cada série, para que os períodos sejam comparáveis entre séries e o agregado seja possível
- [ ] Cada série passa pela mesma normalização de `_build_series` (coerção de tipos, agregação de timestamps duplicados pela média, `resample().mean().interpolate(method="time").ffill().bfill()`)
- [ ] Séries com menos de **10 períodos** após a agregação são descartadas e contadas
- [ ] Limite de **25 séries** (constante `MAX_SERIES`): quando há mais identificadores, retorna as 25 com mais períodos, mantendo o total encontrado no retorno
- [ ] Se nenhuma série sobreviver, lança `TrainingError` em pt: "Nenhuma subsequência tem pontos suficientes para treinar (mínimo de 10 períodos por série)."
- [ ] Identificadores nulos/vazios formam seu próprio grupo com label "(sem identificador)" em vez de derrubar o treino
- [ ] `train_forecasting` **não** é alterada nesta story — a função nasce isolada e coberta por testes
- [ ] Testes cobrindo: split correto, descarte de série curta, truncamento acima de `MAX_SERIES`, erro quando nada sobra, frequência única entre séries
- [ ] `uv run pytest -q` passa no container

### US-014: Artefato multi-série picklável
**Description:** Como desenvolvedor, preciso de um wrapper que guarde um modelo por série no artefato joblib, para que o modelo multi-série seja persistível como qualquer outro.

**Acceptance Criteria:**
- [ ] Nova classe `MultiSeriesForecastModel` em `forecasting.py`, guardando `{series_id: ForecastModel}` e a lista ordenada de ids
- [ ] Método `forecast(horizon, series_id)` devolve o mesmo DataFrame `value/lower/upper` de `ForecastModel.forecast`
- [ ] `series_id` desconhecido levanta `KeyError` com mensagem clara em pt
- [ ] A classe é picklável: teste faz round-trip por `joblib.dump`/`joblib.load` (com `compress=3`, como o artefato real) e confirma que `.forecast()` funciona após o load
- [ ] `train_forecasting` **não** é alterada nesta story
- [ ] `uv run pytest -q` passa no container

### US-015: Treinar por subsequência no `train_forecasting`
**Description:** Como usuária com vendas de várias lojas no mesmo arquivo, quero uma previsão por loja, porque a média de todas as lojas não me serve para nada.

**Acceptance Criteria:**
- [ ] `train_forecasting` ganha o kwarg `id_column: str | None = None`; com ele preenchido, usa `_build_series_by_id` (US-013) em vez de `_build_series`
- [ ] **Seleção de algoritmo global**: os candidatos são pontuados sobre uma amostra de até 10 séries (as de mais períodos), somando o MAPE ponderado pelo nº de pontos de teste de cada série; o algoritmo e os parâmetros vencedores são então refitados em **todas** as séries
- [ ] `models.metrics.candidates` mantém exatamente o shape atual, com as métricas agregadas dessa amostra, e `rows` reporta os totais somados
- [ ] O `pipeline` do `TrainingResult` passa a ser um `MultiSeriesForecastModel` (US-014) quando há ID Field; sem ID Field continua sendo um `ForecastModel`
- [ ] `on_progress` reporta as duas fases: seleção de algoritmo (5→60%) e refit por série (60→92%, com o nome da série na mensagem de etapa)
- [ ] `on_candidates` mantém o shape atual (um item por algoritmo) — a tela de progresso não muda
- [ ] Sem `id_column`, o caminho de execução e o resultado são **idênticos** aos de hoje: teste de regressão comparando `TrainingResult` antes/depois em uma série única
- [ ] `uv run pytest -q` passa no container

### US-016: Insights multi-série e persistência
**Description:** Como desenvolvedor, preciso que o resultado multi-série seja gravado num shape que o relatório consiga ler, sem estourar o tamanho do JSONB.

**Acceptance Criteria:**
- [ ] Com ID Field, as chaves atuais de `insights.forecast` passam a descrever a **série agregada** (soma das séries por período) e uma nova chave `series: [{id, label, points, mape, history[], predictions[], backtest, seasonality}]` traz o detalhe por subsequência
- [ ] Sem ID Field o shape permanece **exatamente** o de hoje (mais os campos das US-001/002/008) — `series` ausente. Nenhum modelo existente quebra
- [ ] Com ID Field, o cap de histórico por série cai para **120** pontos (contra 365 na série única), para manter o JSONB na casa de centenas de KB
- [ ] `insights.forecast.idColumn`, `excludedSeries` e `truncatedSeries: {shown, total}` ficam no nível de topo
- [ ] `model_train.py` repassa `config.idColumn` para `train_forecasting` e inclui a coluna de ID em `models.feature_columns`, junto com a de tempo
- [ ] `models.size_bytes` continua sendo gravado com o tamanho real do `.joblib` comprimido — verificar que a quota de armazenamento continua somando corretamente com o artefato maior
- [ ] `model_predict.py` / `model_predict_batch.py` **não** são tocados: forecasting segue não publicável e o artefato multi-série nunca é carregado por esse caminho
- [ ] Medir e registrar no `progress.txt` o tamanho real do JSONB de um treino com 25 séries; se passar de 1 MB, reduzir o cap de histórico antes de fechar a story
- [ ] `uv run pytest -q` passa no container

### US-017: Campo de ID no Prever
**Description:** Como usuária, quero apontar a coluna que identifica cada série (loja, produto, sensor) para receber previsões independentes.

**Acceptance Criteria:**
- [ ] Novo select **"Campo de identificação (opcional)"** logo abaixo do eixo temporal, **apenas no formulário de Previsão temporal** (US-008)
- [ ] Opções: "Nenhum — série única" (default) + todas as colunas do tipo `category` que não sejam o alvo, o eixo temporal, nem estejam ignoradas
- [ ] Descrição em pt-BR: "Para arquivos com mais de uma série (por loja, produto, sensor), escolha a coluna que identifica cada uma — o modelo gera uma previsão independente para cada valor. Séries com menos de 10 períodos ficam de fora."
- [ ] Quando não houver coluna categórica elegível, o select não aparece e no lugar fica a nota: "Nenhuma coluna de identificação disponível. Você pode transformar uma coluna em categoria na aba Preparar."
- [ ] `StartTrainingInput` ganha `idColumn: string | null`; `startTraining` valida que a coluna existe, é do tipo `category`, não é o alvo, não é o eixo temporal e não está entre as ignoradas — cada caso com mensagem de erro própria em pt
- [ ] Ignorar a coluna na sidebar limpa a seleção (mesmo comportamento de `toggleIgnore` com o eixo temporal, `predict-view.tsx:251`)
- [ ] `retrainFromModel` pré-carrega o campo com o valor do modelo vigente
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-018: Seletor de série no relatório
**Description:** Como usuária, quero navegar entre as previsões de cada loja e também ver o total consolidado, para trabalhar no nível certo de decisão.

**Acceptance Criteria:**
- [ ] Quando `insights.forecast.series` existe, o header do relatório ganha um select **"Série"** com a opção "Todas (agregado)" primeiro, seguida de uma opção por série ordenada por nº de períodos (desc)
- [ ] "Todas (agregado)" renderiza as seções sobre a série agregada, exatamente como o relatório de série única
- [ ] Selecionar uma série troca o conteúdo de Resumo, Desempenho preditivo, Histórico e Previsão e Sazonalidade para os dados daquela série; a troca é client-side, sem novo request
- [ ] O subtítulo do header indica a série ativa (ex.: "Prevendo Vendas — série Loja 42")
- [ ] `series` é opcional no tipo `ForecastInsights`; relatórios de série única renderizam **sem nenhuma mudança visual** em relação ao estado pós-Bloco B
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-019: Tabela de séries e avisos de cobertura
**Description:** Como usuária, quero ver todas as séries lado a lado com sua qualidade e tendência, para descobrir onde olhar primeiro.

**Acceptance Criteria:**
- [ ] Nova `SectionCard` **"Séries"** (só quando `insights.forecast.series` existe), posicionada depois de "Sazonalidade"
- [ ] Tabela com as colunas: identificador, nº de períodos, MAPE, e a variação percentual entre a média do último ciclo observado e a média do horizonte previsto (com seta e cor verde/vermelha)
- [ ] Ordenável por identificador, por MAPE e por variação; clicar numa linha seleciona aquela série no seletor da US-018
- [ ] Aviso visível quando `truncatedSeries` está presente: "Mostrando as {shown} séries com mais histórico, de {total} encontradas."
- [ ] Aviso quando `excludedSeries > 0`: "{n} séries ficaram de fora por terem menos de 10 períodos."
- [ ] A seção "Detalhes Avançados do Modelo" ganha uma nota explicando que o algoritmo foi escolhido uma vez, sobre uma amostra, e aplicado a todas as séries
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Requisitos Funcionais

**Escolha do tipo de modelo**

- FR-1: O Prever em modo configuração exibe a tela "Treinar modelo" com dois cards — "Prever" e "Previsão temporal" — sempre que não houver um tipo escolhido; o tipo fica na URL como `?tipo=prever|previsao`.
- FR-2: O card "Previsão temporal" fica desabilitado, com nota explicativa, quando o dataset não tem coluna do tipo `date`.
- FR-3: `StartTrainingInput` ganha `modelKind: "predict" | "forecast"` e o `problemType` passa a ser derivado dele: `forecast` → sempre `forecasting`; `predict` → `classification` ou `regression` conforme o tipo do alvo. A inferência por efeito colateral do eixo temporal é removida.
- FR-4: No fluxo "Previsão temporal", o eixo temporal é obrigatório e só alvos numéricos são selecionáveis; no fluxo "Prever", o eixo temporal não aparece e `timeColumn` é sempre `null`.
- FR-5: Com modelo vigente, "Retreinar modelo" abre o formulário do tipo do modelo vigente sem passar pela tela de escolha, e oferece "Trocar tipo de modelo".

**Opções de treino**

- FR-6: `training_jobs.config` de forecasting passa a aceitar quatro chaves novas: `forecastHorizon: number | null`, `aggregation: "auto"|"hourly"|"daily"|"weekly"|"monthly"|"quarterly"`, `forecastModel: "auto"|"naive"|"holt_winters"|"arima"` e `idColumn: string | null`. Todas opcionais; ausência = comportamento atual.
- FR-7: `startTraining` valida as quatro chaves no servidor e ignora todas quando `modelKind !== "forecast"`.
- FR-8: O horizonte default é 30% do comprimento da série agregada (piso 1, teto 365); o manual é um inteiro entre 1 e 365.
- FR-9: A janela de backtest **não** depende do horizonte escolhido — continua sendo `max(4, min(20% da série, 90))` limitada por `MIN_TRAIN_POINTS`.
- FR-10: A agregação manual substitui `_infer_frequency`; agregação que resulte em menos de 20 períodos, ou que seja mais fina que o espaçamento real dos dados, falha com `TrainingError` em pt.
- FR-11: Com tipo de modelo manual, só aquele algoritmo é testado (ainda com busca de configurações pelo modo de treino).
- FR-12: A coluna de ID precisa ser do tipo `category` e não pode coincidir com o alvo, o eixo temporal ou uma coluna ignorada.
- FR-13: Com ID Field, cada subsequência com ≥10 períodos vira uma série independente; no máximo 25 séries são treinadas (as de mais períodos), e o excedente é reportado sem falhar o treino.
- FR-14: Com ID Field, o algoritmo vencedor é escolhido uma única vez sobre uma amostra de até 10 séries e refitado em todas.

**Insights**

- FR-15: `insights.forecast.backtest` traz `{points: [{date, actual, predicted}], rmse, mae, mape, trainPoints, testPoints}`, com métricas idênticas às do candidato vencedor.
- FR-16: `insights.forecast.seasonality.buckets` traz o impacto percentual por bucket temporal aplicável à frequência da série, com no mínimo 2 ciclos completos por bucket.
- FR-17: `insights.forecast.horizon` e `horizonSource` registram o horizonte efetivo e sua origem; `horizons` passa a ser derivado do horizonte efetivo.
- FR-18: Com ID Field, `insights.forecast.series[]` traz o detalhe por subsequência e as chaves de topo descrevem a série agregada; `HISTORY_LIMIT` por série cai para 120 pontos.
- FR-19: Todos os campos novos são opcionais nos tipos TypeScript; o relatório não pode quebrar com modelos treinados antes desta PRD.

**Relatório**

- FR-20: O Resumo exibe dois cards: erro médio (existente) e Margem de confiança (novo, derivado no client de `predictions`).
- FR-21: A seção "Desempenho preditivo" sobrepõe valor real e previsto na janela de backtest e destaca MAPE, RMSE e MAE.
- FR-22: A seção "Sazonalidade" exibe abas por bucket com gráfico de barras verde/vermelho e rótulo percentual por barra.
- FR-23: O gráfico de previsão ganha toggle de intervalo de confiança (ligado por padrão), tabela expansível e download em CSV (`utf-8-sig`, separador `;`).
- FR-24: Com ID Field, o relatório oferece seletor de série ("Todas (agregado)" + uma por série) e uma tabela "Séries" clicável.
- FR-25: Todos os textos, rótulos e mensagens de erro em pt-BR, com acentuação correta.

## Não-Objetivos (fora de escopo)

- **Não** adiciona Prophet nem os "Autoregressive Ensemble" da referência — o conjunto de algoritmos continua sendo `naive`, `holt_winters` e `arima` via statsmodels.
- **Não** desbloqueia a publicação de forecasting no Deploy: `deploy/context.ts` e `deploy/page.tsx` continuam recusando `problemType === "forecasting"` (FR-9 de `prd-deployments.md`). Servir previsões por API/web-app/MCP é outra PRD.
- **Não** implementa "Add to Report" por seção (o botão que a referência mostra em cada card) — o produto não tem hoje um sistema de relatórios compostos.
- **Não** implementa zoom/pan nos gráficos.
- **Não** adiciona regressores externos (variáveis explicativas além do tempo) nem previsão multivariada.
- **Não** troca a função de agregação: continua sendo a média, não a soma.
- **Não** introduz biblioteca de gráficos — todos os gráficos novos são SVG escritos à mão, como os existentes.
- **Não** cria tabela dedicada para séries no banco: os dados multi-série ficam em `models.insights` (JSONB), com o limite de 25 séries como contenção.
- **Não** muda a semântica de um único modelo vigente por projeto.

## Considerações de Design

- **Tela de escolha**: a referência usa dois cards largos lado a lado, cada um com ícone à esquerda do título e uma linha de descrição abaixo, sob o título centralizado "Train Model". Reproduzir essa estrutura com os componentes de card já existentes no produto; o card desabilitado usa `opacity` + `cursor-not-allowed`, como os demais estados desabilitados da UI.
- **Referência visual**: a imagem de referência mostra Forecast Summary (dois cards), Predictive Performance, Forecast e Seasonality nessa ordem. A ordem final aqui é: Resumo (2 cards) → Desempenho preditivo → Histórico e Previsão → Sazonalidade → [Séries] → Detalhes Avançados.
- **Componentes a reusar**: `SectionCard` (de `classification-report.tsx`), `formatNumber`/`formatMape`/`formatDate` (de `forecasting-report.tsx` e `forecast-sections.tsx`), o padrão `<details>` de seção expansível, e o padrão de SVG `viewBox` + `useMemo` para construção de path de `ForecastChartSection`.
- **Cores**: verde/vermelho da sazonalidade devem usar os tokens de tema já existentes no produto (mesma paleta do "impacto" nos relatórios de classificação), não valores hex soltos — o produto tem tema claro e escuro.
- **Client vs. server**: o card de Margem de confiança e o CSV são derivados no client a partir de dados já presentes; a série de backtest e os buckets de sazonalidade exigem cálculo no worker. Não introduzir novos endpoints.
- **Densidade**: o relatório já é longo. Sazonalidade e Séries devem caber em uma dobra cada; a tabela de previsão vem colapsada.

## Considerações Técnicas

- **Custo de treino**: US-001 adiciona um refit em `train` (barato, o modelo já convergiu com esses params). US-015 muda a ordem de grandeza — 25 séries × refit. Mitigação: a busca de configurações roda só na amostra de seleção (até 10 séries); o refit por série usa params já fixados. Ainda assim, medir o tempo com `TRAINING_CONCURRENCY=4` antes de fechar o valor de `MAX_SERIES`.
- **Tamanho do JSONB**: com 25 séries × (120 pontos de histórico + horizonte + backtest), `models.insights` fica na casa de centenas de KB. É carregado inteiro pela página do relatório — vale medir o payload real e, se passar de ~1 MB, reduzir `MAX_SERIES` ou o cap de histórico antes de fechar a US-016.
- **Frequência consistente entre séries**: inferir a frequência por série produziria eixos incomparáveis e quebraria o agregado. Inferir uma vez sobre o conjunto e reaplicar é o que torna "Todas (agregado)" possível.
- **Interpolação**: `_build_series` faz `interpolate(method="time").ffill().bfill()`. Com séries curtas (10 períodos), isso pode inventar boa parte dos dados. Considerar reportar a fração interpolada por série nos insights se os testes mostrarem que é comum.
- **Compatibilidade de artefato**: `MultiSeriesForecastModel` precisa ser importável de `jobs.forecasting` no load (mesma restrição que já vale para `jobs.automl` por causa do `FunctionTransformer`).
- **Aliases legados**: `mode_config_count` aceita `fast/standard/full`; nada nesta PRD altera isso.
- **Ordem de implementação**: Bloco A → Bloco B → Bloco C → Bloco D. O Bloco B depende dos campos do Bloco A; o Bloco D depende do shape estabilizado do Bloco C (o horizonte por série usa a mesma regra da US-009).
- **Testes do worker** rodam em container (sem uv no host):
  `docker run --rm -v "$PWD/apps/worker":/src -w /src -e UV_PROJECT_ENVIRONMENT=/tmp/venv -e UV_LINK_MODE=copy ghcr.io/astral-sh/uv:python3.12-bookworm-slim sh -c "apt-get update -qq >/dev/null && apt-get install -y -qq --no-install-recommends libgomp1 >/dev/null && uv sync -q && uv run pytest -q"`

## Métricas de Sucesso

- Um dataset com coluna de loja produz 25 previsões independentes navegáveis no relatório, em vez de uma curva média.
- A pessoa consegue mudar horizonte, agregação e algoritmo sem sair da tela do Prever, e o relatório reflete a escolha.
- O relatório responde "quão confiável é isso?" sem abrir "Detalhes Avançados": real × previsto, RMSE, MAE e crescimento da margem ficam na primeira dobra e meia.
- Nenhum modelo treinado antes desta PRD quebra o relatório (verificar com um modelo antigo em banco antes de fechar).
- O tempo de treino de forecasting sem ID Field não regride (o refit extra da US-001 é ruído).

## Questões em Aberto

1. **`MAX_SERIES = 25` é suficiente?** Para varejo real (centenas de SKUs) claramente não. A alternativa é uma tabela `model_series` dedicada com paginação, o que é uma PRD própria. Confirmar se 25 atende o uso de aula/beta.
2. **Agregação por média ou por soma?** Hoje é média, e esta PRD mantém. Para o caso canônico de vendas ("somar as vendas do mês"), soma é o correto e média subestima o nível da série. Vale expor um seletor "Como agrupar: média / soma / total de linhas"?
3. **Mínimo de 10 períodos por série** diverge da referência (que usa 5 datas). Com 10 sobram ~8 de treino e 2 de teste — já é apertado. Confirmar o número ou aceitar séries de 5 sem backtest próprio (usando só o MAPE global).
4. **Seleção de algoritmo global vs. por série**: a decisão foi global, por custo e por preservar a tabela de candidatos. Se na prática as séries forem muito heterogêneas (uma loja sazonal, outra plana), o MAPE médio vai sofrer. Vale medir depois da US-015 e considerar "melhor por série" como evolução.
5. **Nomenclatura na UI**: a referência chama "ID Field". Aqui está "Campo de identificação". Confirmar o termo com o time de conteúdo.
5b. **Nome dos dois cards**: a proposta é "Prever" e "Previsão temporal". Alternativas: "Prever" / "Série temporal", ou "Predição" / "Previsão". O risco do par proposto é que "Prever" (a aba) e "Prever" (o card) viram o mesmo nome em níveis diferentes de navegação. Confirmar com o time de conteúdo.
5c. **Modelos treinados antes da US-008** não têm `modelKind` no config. A derivação de qual formulário abrir no "Retreinar" precisa cair de volta em `problemType` (`forecasting` → Previsão temporal; caso contrário → Prever). Confirmar que isso basta ou se vale um backfill do config.
6. **Zoom no gráfico**: fora de escopo agora, mas a referência oferece. Com horizonte de 365 períodos, o gráfico atual fica ilegível — pode virar necessidade real depois da US-009.
