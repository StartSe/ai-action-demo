# PRD: Ignorar colunas pós-treino, predições incrementais no WebApp, bases de exemplo e verificação da limpeza

## 1. Introdução/Overview

Este PRD agrupa quatro melhorias de usabilidade e onboarding da plataforma AutoML:

1. **Ignorar colunas após o treinamento** — hoje, quando um modelo já existe, a tela Prever abre no modo report e os botões de ignorar/designorar colunas ficam ocultos. O usuário precisa poder alterar as colunas ignoradas mesmo com modelo treinado, entendendo que isso exige um novo treino.
2. **Predições incrementais no WebApp público** — hoje cada predição sobrescreve a anterior (`setResult`). O link público deve acumular as predições feitas na sessão aberta, sem persistência.
3. **Bases de exemplo pré-cadastradas** — todo usuário (novo e existente) deve receber 3 datasets de exemplo na sua organização: `Credit_Card_Fraud_Example`, `Sales_Example` e `Projects_Example`.
4. **Verificação da ferramenta de limpeza** — validar (com testes automatizados) que a limpeza aplicada à `Sales_Example` produz os resultados esperados, corrigindo divergências de comportamento.

## 2. Goals

- Permitir alterar colunas ignoradas com modelo treinado, com aviso claro de que o retreino é necessário; modelo e deploys atuais continuam funcionando até o novo treino concluir.
- Exibir no WebApp público uma lista acumulada das predições da sessão (entradas + resultado), mais recente no topo, sem persistência em banco.
- Provisionar as 3 bases de exemplo automaticamente no signup e fazer backfill para todas as organizações existentes, sem consumir a quota de armazenamento do usuário.
- Cobrir com testes (pytest) as expectativas de limpeza da `Sales_Example` e corrigir o comportamento onde divergir.

## 3. User Stories

### US-001: Editar colunas ignoradas na tela de report
**Description:** Como usuário com modelo treinado, quero alterar as colunas ignoradas diretamente na tela Prever (modo report) para ajustar as características do modelo sem recomeçar a configuração do zero.

**Acceptance Criteria:**
- [ ] Em `predict-view.tsx`, os botões de ignorar/designorar (olho/olho-cortado) são renderizados também quando `showingReport === true` (remover a condição `!showingReport` nas abas Prever e Ignorar)
- [ ] O alvo (target) do modelo vigente não pode ser ignorado (regra atual mantida)
- [ ] Em modelos de forecasting, ignorar o eixo temporal ou o campo de identificação continua não permitido enquanto no modo report (botão desabilitado com tooltip explicando o motivo)
- [ ] O estado inicial de `ignored` no modo report reflete `models.ignoredColumns` do modelo vigente
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-002: Aviso de modelo desatualizado e retreino
**Description:** Como usuário, ao alterar colunas ignoradas de um modelo já treinado, quero ver claramente que o modelo está desatualizado e retreinar com um clique, para que a mudança tenha efeito.

**Acceptance Criteria:**
- [ ] Quando o conjunto local de ignoradas difere de `models.ignoredColumns`, aparece um aviso persistente na tela de report: o modelo está desatualizado e precisa ser retreinado para aplicar as mudanças
- [ ] O aviso deixa explícito que o modelo atual e os deploys publicados continuam funcionando com a configuração antiga até o novo treino concluir
- [ ] O botão "Retreinar modelo" fica em destaque (variante primária) enquanto houver mudanças pendentes
- [ ] Clicar em "Retreinar modelo" chama `startTraining` com o alvo/modo/opções do modelo vigente e o novo conjunto de ignoradas (fluxo existente de `retrainFromModel`, sem passar pelo formulário de configuração)
- [ ] Desfazer as mudanças (voltar ao conjunto original) remove o aviso e o destaque do botão
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-003: Histórico incremental de predições no WebApp público
**Description:** Como visitante do link público (`/app/[slug]`), quero ver todas as predições que fiz nesta sessão em uma lista, para comparar resultados sem perder os anteriores.

**Acceptance Criteria:**
- [ ] Em `public-web-app.tsx`, o estado `result` (slot único) vira uma lista acumulada; cada nova predição é adicionada ao topo, sem apagar as anteriores
- [ ] Cada item da lista mostra os valores de entrada informados e o resultado (valor previsto + probabilidade quando classificação; valor quando regressão)
- [ ] A predição mais recente aparece visualmente destacada no topo (ex.: primeira posição com estilo de destaque)
- [ ] Nada é persistido: recarregar a página zera a lista (estado apenas em memória da aba)
- [ ] Um botão "Limpar histórico" esvazia a lista
- [ ] A predição em lote (CSV) permanece com o comportamento atual, sem entrar na lista
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-004: Infraestrutura de datasets de exemplo
**Description:** Como desenvolvedor, preciso dos arquivos de exemplo versionados no repositório e de um marcador de "dataset de exemplo" no schema, para que o provisionamento seja reproduzível e não consuma a quota do usuário.

**Acceptance Criteria:**
- [ ] Os 3 arquivos são copiados do Desktop para um diretório versionado no repo (ex.: `apps/web/seed-assets/`): `Credit_Card_Fraud_Example.csv` (de `/Users/rafael/Desktop/Credit_Card_Fraud.csv`), `Sales_Example.xlsx` e `Projects_Example.xlsx`
- [ ] Nova coluna `datasets.is_example` (boolean, default false) com migração Drizzle gerada e aplicada
- [ ] `lib/storage-quota.ts` exclui datasets com `is_example = true` do cálculo da quota
- [ ] Função reutilizável `seedExampleDatasets(orgId)` que: copia os 3 arquivos para o `UPLOAD_DIR` com nome UUID, insere as linhas em `datasets` (nome do exemplo, `status: "parsing"`, `is_example: true`) e enfileira `dataset:parse` para cada uma — mesmo fluxo do upload normal
- [ ] A função é idempotente: se a organização já tem um dataset de exemplo com o mesmo nome, ele é pulado
- [ ] Typecheck/lint passam; teste unitário da idempotência

### US-005: Provisionar exemplos no signup
**Description:** Como novo usuário, quero encontrar as 3 bases de exemplo já cadastradas na minha conta ao entrar pela primeira vez, para experimentar a plataforma sem precisar de dados próprios.

**Acceptance Criteria:**
- [ ] `seedExampleDatasets` é chamada no hook `databaseHooks.user.create.after` de `apps/web/src/lib/auth.ts`, após a criação da organização pessoal
- [ ] Falha no seed não bloqueia o signup (erro é logado, cadastro conclui normalmente)
- [ ] Ao entrar pela primeira vez, a tela de Datasets lista os 3 exemplos (prontos ou em processamento)
- [ ] O usuário pode usar, transformar e excluir os exemplos livremente (nenhum tratamento especial além da quota)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill (signup de teste)

### US-006: Backfill para contas existentes
**Description:** Como operador da plataforma, quero um script que provisione as bases de exemplo para todas as organizações já existentes, para que usuários antigos também as recebam.

**Acceptance Criteria:**
- [ ] Script executável (ex.: `apps/web/scripts/seed-example-datasets.mjs` ou comando npm) que percorre todas as organizações e chama `seedExampleDatasets` para cada uma
- [ ] Idempotente: rodar duas vezes não duplica datasets
- [ ] Loga um resumo ao final (organizações processadas, datasets criados, pulados)
- [ ] Typecheck/lint passam

### US-007: Testes de limpeza com a Sales_Example e correção de divergências
**Description:** Como desenvolvedor, quero testes automatizados que validem o comportamento da limpeza sobre a `Sales_Example`, para garantir que a ferramenta faz o que a demonstração promete.

**Acceptance Criteria:**
- [ ] Fixture em `apps/worker/tests/` derivada da `Sales_Example.xlsx` (colunas: Data, Produto, Quantidade, Valor de Venda, Promocao, Vendedor, Observacao_Limpeza, Origem_Constante, Campo_Quase_Vazio; ~1.012 linhas ou amostra representativa que preserve os casos abaixo)
- [ ] `standardize_dates`: as 3 datas em formatos alternativos da coluna Data são convertidas; a serialização em string sai em ISO 8601
- [ ] `remove_unexpected_nulls`: as linhas com nulo em Quantidade, Valor de Venda e Promocao são removidas (colunas normalmente preenchidas, fração de nulos ≤ 1%)
- [ ] `remove_constant_columns`: a coluna `Origem_Constante` é removida (valor único em todas as linhas)
- [ ] `remove_empty_columns`: a coluna `Campo_Quase_Vazio` é removida (apenas 8 de 1.012 linhas preenchidas → ≥ 99% vazia)
- [ ] `flag_outliers` (quando habilitado): as linhas com Quantidade=5000 e Valor=2999 recebem "sim" nas flags `Quantidade_outlier` / `Valor de Venda_outlier`
- [ ] `group_excess_categories`, `remove_illegible_numeric_columns` e `remove_illegible_date_columns`: comprovadamente **não** alteram esta base (nenhuma coluna atinge os critérios)
- [ ] Divergências encontradas entre o comportamento atual e as expectativas acima são corrigidas em `apps/worker/jobs/transform.py` (e no espelho `clean-preview.ts`, se aplicável)
- [ ] `pytest` do worker passa; Vitest do web passa

## 4. Functional Requirements

**Ignorar colunas pós-treino**
- FR-1: A tela Prever em modo report deve permitir alternar o estado de ignorar de qualquer coluna, exceto o alvo do modelo vigente e, em forecasting, o eixo temporal e o campo de identificação.
- FR-2: Quando o conjunto de ignoradas difere do modelo vigente, o sistema deve exibir aviso de modelo desatualizado e destacar o botão "Retreinar modelo"; o retreino usa a configuração do modelo vigente com o novo conjunto de ignoradas.
- FR-3: O modelo vigente e os deployments publicados devem continuar operando com a configuração antiga até o novo treino concluir (comportamento já garantido por `_replace_project_models`; não regredir).

**WebApp incremental**
- FR-4: O WebApp público deve manter em memória a lista de predições da sessão, adicionando cada novo resultado ao topo com os respectivos valores de entrada.
- FR-5: A lista não deve ser persistida em banco nem sobreviver a recarregamento da página; deve haver botão para limpar o histórico.

**Bases de exemplo**
- FR-6: O sistema deve provisionar `Credit_Card_Fraud_Example`, `Sales_Example` e `Projects_Example` na organização de todo novo usuário no momento do signup, via o mesmo pipeline de parse/profile do upload normal.
- FR-7: Um script idempotente deve fazer o backfill para todas as organizações existentes.
- FR-8: Datasets de exemplo (`is_example = true`) não devem contar na quota de armazenamento (`STORAGE_QUOTA_MB`).

**Limpeza**
- FR-9: A limpeza aplicada à `Sales_Example` deve produzir exatamente os resultados da tabela de expectativas (US-007), validados por testes automatizados; divergências são defeitos a corrigir.

## 5. Non-Goals (Out of Scope)

- Retreino automático ao alterar colunas ignoradas (retreino é sempre ação explícita do usuário).
- Persistir histórico de predições do WebApp em banco ou exibi-lo entre sessões/dispositivos.
- Incluir predições em lote (CSV) no histórico do WebApp.
- Datasets globais compartilhados/somente leitura — os exemplos são cópias independentes por organização.
- Proteger os exemplos contra exclusão ou edição pelo usuário.
- Tornar thresholds de limpeza (32 categorias, 99%, 3σ, P1/P99) configuráveis pelo usuário.
- Novas operações de limpeza (deduplicação, imputação, winsorização etc.).

## 6. Design Considerations

- **Report (US-001/002):** reusar os botões olho/olho-cortado existentes; o aviso de desatualização pode seguir o padrão de banner já usado para `last_transform_error` no Preparar. O botão "Retreinar modelo" já existe em `predict-view.tsx:742` — apenas muda de ênfase quando há pendência.
- **WebApp (US-003):** reusar o `ResultCard` existente como item da lista, acrescentando um resumo das entradas (ex.: pares campo → valor em texto compacto). Destaque visual para o item mais recente.
- **Datasets (US-005):** nenhum UI novo — os exemplos aparecem na listagem padrão de datasets.

## 7. Technical Considerations

- **US-001:** `startTraining` já aceita `ignoredColumns` e valida no servidor; a mudança é essencialmente de UI. O estado `ignored` já é inicializado a partir da config do modelo em `predict/page.tsx`.
- **US-004:** o fraude é CSV e os outros dois são XLSX — o pipeline de parse já suporta ambos. Os 3 arquivos somam < 600 KB. O nome do arquivo de fraude muda de `Credit_Card_Fraud.csv` para `Credit_Card_Fraud_Example.csv` no seed.
- **US-004/006:** `seedExampleDatasets` deve viver em `apps/web/src/lib/` para ser usada tanto pelo hook do Better Auth quanto pelo script de backfill. O script precisa rodar com acesso ao `UPLOAD_DIR` e ao Redis (enfileira `dataset:parse`) — em produção, executar dentro do container web.
- **US-005:** o hook `user.create.after` já faz resgate de convite e aceite de política; o seed entra como passo adicional não bloqueante (try/catch com log).
- **US-007:** a fixture pode ser o próprio arquivo convertido para o formato usado nos testes de `test_transform.py` (DataFrames construídos em código a partir dos dados reais, ou parquet versionado). Atenção: a coluna `Observacao_Limpeza` também pode ser constante na base real — o teste deve refletir o conteúdo verdadeiro do arquivo, não apenas os casos citados.
- Sincronia tripla das operações de limpeza: qualquer correção em `transform.py` deve ser espelhada em `clean-preview.ts` (preview) e coberta em ambos os lados (pytest + Vitest).

## 8. Success Metrics

- Alterar colunas ignoradas de um modelo treinado leva ≤ 2 cliques até o retreino disparar (toggle + Retreinar).
- 100% dos novos signups têm os 3 exemplos visíveis na primeira visita à tela de Datasets.
- Backfill executa sem erros em todas as organizações existentes e é comprovadamente idempotente.
- Todos os casos da tabela de expectativas da `Sales_Example` cobertos por testes verdes.

## 9. Open Questions

- Ao alterar ignoradas no modo report, as métricas/report exibidos são do modelo antigo — basta o aviso de desatualização ou o report deve ganhar um estado visual "stale" (ex.: opacidade reduzida)?
- O histórico do WebApp deve ter um limite prático de itens (ex.: 100) para evitar crescimento sem fim da página em sessões longas de demonstração?
- Organizações existentes que já tenham um dataset com nome idêntico a um exemplo (ex.: usuário subiu a própria `Sales_Example` das aulas): pular (comportamento proposto) ou criar com sufixo?
- Os exemplos devem aparecer com algum selo "Exemplo" na listagem de datasets (a coluna `is_example` permitiria), ou indistinguíveis dos demais?
