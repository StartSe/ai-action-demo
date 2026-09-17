# PRD: Explore — Chat de Análise de Dados com IA

## 1. Introdução / Visão geral

Habilitar a aba **Explorar** do projeto como uma experiência conversacional de análise de dados: um agente de IA "analista de dados" que responde perguntas em linguagem natural sobre o dataset do projeto, gerando análises estatísticas, tabelas e gráficos.

O agente funciona no padrão **code interpreter**: interpreta o prompt do usuário, planeja a análise, gera código Python (pandas + Plotly), executa esse código em um sandbox seguro ([e2b.dev](https://e2b.dev)) com o dataset do projeto carregado, e apresenta o resultado com três visões — **Tabela**, **Interpretação da IA** e **Código** — no mesmo espírito do Chat Explore da Akkio (referência visual nas capturas anexadas à discussão).

Toda chamada de LLM passa pelo **OpenRouter** atuando como AI Gateway: o modelo é configurável por variável de ambiente e os guardrails (moderação, rate limits, políticas) ficam desacoplados no gateway, fora do código da aplicação.

Contexto do código atual (SignalOS):

- A aba Explore existe apenas como tab desabilitada em `apps/web/src/app/(project)/projects/[projectId]/layout.tsx` (`enabled: false`). Não há diretório `explore/`.
- A exploração estatística (distribuições/correlações) vive na aba **Prepare** e **permanece lá** — esta PRD não a altera.
- Não existe nenhuma integração LLM, nem e2b, nem biblioteca de gráficos no `apps/web` hoje. Datasets são convertidos para Parquet pelo worker (`datasets.parquetPath` / `datasetVersions.parquetPath`) no volume `uploads`.

## 2. Goals

- Usuário faz uma pergunta em português sobre o dataset e recebe resposta com tabela e/ou gráfico corretos em menos de ~30s no caso típico.
- Todo resultado é **reproduzível e auditável**: o código Python executado e a interpretação em linguagem natural ficam visíveis nas abas Code e AI Interpretation.
- Execução de código 100% isolada em sandbox e2b — nenhum código gerado por LLM roda no host ou no worker.
- Modelo LLM trocável por env var, sem deploy de código; guardrails delegados ao OpenRouter.
- Acurácia reforçada por pipeline em etapas (interpretar → planejar → codificar → executar → interpretar resultado) com auto-correção em caso de erro de execução.
- Histórico de chats persistido por projeto, com retomada de conversas.
- Toda a UI e textos gerados pelo agente em pt-BR, seguindo o padrão de idioma já adotado no produto.

## 3. User Stories

### US-001: Schema de persistência de chats
**Description:** Como desenvolvedor, preciso de tabelas para chats e mensagens do Explore para que conversas e resultados persistam por projeto.

**Acceptance Criteria:**
- [ ] Tabela `explore_chats` no Drizzle (`apps/web/src/db/schema.ts`): `id`, `projectId` (FK), `title` (gerado a partir da primeira pergunta), `createdAt`, `updatedAt`.
- [ ] Tabela `explore_messages`: `id`, `chatId` (FK), `role` (`user` | `assistant`), `content` (texto do usuário ou resumo curto do assistente), `result` jsonb nullable (payload estruturado: `{ title, interpretation, code, table: { columns, rows }, chart: <plotly-json> | null, error: string | null }`), `status` (`completed` | `error`), `createdAt`.
- [ ] Migração gerada e aplicada com sucesso (`npm run db:generate` / padrão existente do repo).
- [ ] Typecheck passa em `apps/web`.

### US-002: Clientes OpenRouter e e2b configuráveis por env
**Description:** Como desenvolvedor, quero módulos de infraestrutura para o LLM (via OpenRouter) e para o sandbox (e2b) para que o restante da feature os consuma sem conhecer detalhes de provedor.

**Acceptance Criteria:**
- [ ] `apps/web/src/lib/llm.ts`: cliente de chat-completions apontando para `https://openrouter.ai/api/v1`, com `OPENROUTER_API_KEY` (obrigatória para a feature) e `EXPLORE_MODEL` (default documentado: `anthropic/claude-sonnet-4.5`). Suporta streaming de tokens.
- [ ] `apps/web/src/lib/sandbox.ts`: wrapper do SDK `@e2b/code-interpreter` com `E2B_API_KEY`; funções para criar sandbox, enviar arquivo (parquet), executar código Python e coletar resultados (stdout, tabelas, figuras Plotly) e encerrar sandbox.
- [ ] Novas env vars documentadas em `.env.example` e na tabela de variáveis do `README.md` (todas opcionais para o boot da aplicação: sem elas, a aba Explore mostra estado "não configurado" — ver US-003).
- [ ] Nenhuma chave exposta ao client (uso apenas em server actions / route handlers).
- [ ] Typecheck passa.

### US-003: Habilitar aba Explore com layout do chat
**Description:** Como usuário, quero abrir a aba Explorar e ver a interface de chat pronta para perguntar sobre meus dados.

**Acceptance Criteria:**
- [ ] Tab "Explorar" habilitada no `layout.tsx` do projeto (remove `enabled: false`), apontando para `apps/web/src/app/(project)/projects/[projectId]/explore/page.tsx`.
- [ ] Layout com: sidebar esquerda de histórico de chats (estado vazio: "Nenhuma conversa ainda" + orientação), área central com empty state (ícone, título "Explorar com IA", subtítulo), input fixo inferior "Faça uma pergunta sobre seus dados..." e botão enviar.
- [ ] Botão "Nova conversa" no topo.
- [ ] Se o dataset do projeto ainda não estiver com status pronto/perfilado, mostrar estado orientando a concluir o Prepare primeiro.
- [ ] Se `OPENROUTER_API_KEY` ou `E2B_API_KEY` ausentes, a aba renderiza estado "Recurso não configurado" explicando as env vars (sem quebrar o restante do app).
- [ ] Textos em pt-BR; visual consistente com o restante do produto (Tailwind, mesmos tokens).
- [ ] Typecheck passa.
- [ ] Verify in browser using dev-browser skill.

### US-004: Pipeline do agente com streaming de etapas (rota SSE)
**Description:** Como usuário, ao enviar uma pergunta quero ver o progresso passo a passo ("Carregando dataset...", "Gerando código...", "Executando análise...", "Interpretando resultados...") para entender o que o agente está fazendo, e receber o resultado final na mesma conexão.

**Acceptance Criteria:**
- [ ] Route handler `apps/web/src/app/api/explore/chat/route.ts` (POST) que recebe `{ chatId | null, projectId, message }` e responde via SSE/streaming (`ReadableStream`) eventos tipados: `step` (rótulo da etapa em pt-BR), `token` (streaming opcional da interpretação), `result` (payload final igual ao `result` de US-001), `error`.
- [ ] Pipeline em etapas no servidor: (1) **Interpretar** — LLM recebe pergunta + contexto do dataset (nome, colunas com tipo/stats resumidas de `dataset_columns`, amostra de linhas) + histórico da conversa, e produz um plano curto da análise; (2) **Codificar** — LLM gera função Python `def perform_analysis(df: pd.DataFrame)` que `yield`a figuras Plotly e/ou DataFrames, seguindo contrato fixo (ver FR-8); (3) **Executar** — código roda no sandbox e2b (US-005); (4) **Interpretar resultado** — LLM redige a explicação em pt-BR do que foi feito e do que os números mostram (aba AI Interpretation).
- [ ] Autorização: valida sessão Better Auth e que o projeto pertence à organização do usuário (mesmo padrão das server actions existentes).
- [ ] Mensagens (user + assistant com `result`) persistidas ao final; chat criado automaticamente na primeira mensagem com `title` derivado da pergunta.
- [ ] Timeout total do pipeline (default 120s) com erro amigável em pt-BR.
- [ ] Typecheck passa.

### US-005: Execução segura no sandbox e2b
**Description:** Como desenvolvedor, preciso que o código gerado rode isolado no e2b com o dataset do projeto carregado, capturando tabelas e gráficos de forma estruturada.

**Acceptance Criteria:**
- [ ] Um sandbox por chat, criado sob demanda na primeira execução e reutilizado nas mensagens seguintes enquanto vivo (TTL configurável, default 10 min de inatividade); se expirado, é recriado de forma transparente.
- [ ] Bootstrap do sandbox: upload do parquet da **versão ativa** do dataset (`getActiveParquetPath` em `apps/web/src/lib/datasets.ts`) e carga em `df` via pandas/pyarrow no template code-interpreter do e2b (pandas e plotly já inclusos).
- [ ] Execução do `perform_analysis(df)` capturando: DataFrames yieldados (serializados como `{ columns, rows }`, máx. 1.000 linhas — truncamento sinalizado no payload), figuras Plotly (serializadas como JSON via `fig.to_json()`), stdout e traceback em caso de exceção.
- [ ] Nenhum caminho do host, credencial ou URL interna é exposto dentro do sandbox — apenas o arquivo parquet.
- [ ] Timeout de execução por código (default 60s) com kill do processo.
- [ ] Typecheck passa.

### US-006: Renderização da resposta — abas Table / AI Interpretation / Code
**Description:** Como usuário, quero ver cada resultado do agente como um card na conversa que abre um painel com as abas Tabela, Interpretação da IA e Código, para auditar e entender a análise.

**Acceptance Criteria:**
- [ ] Cada resposta do assistente aparece na conversa como card com título e descrição curta da análise; clicar abre painel lateral direito (como na referência Akkio).
- [ ] Painel com abas: **Tabela** (grid com os dados do resultado, valores numéricos/moeda formatados em pt-BR), **Interpretação da IA** (texto em pt-BR explicando filtros, agrupamentos e leitura do resultado) e **Código** (Python com syntax highlight e botão copiar).
- [ ] Gráfico renderizado a partir do JSON Plotly com `plotly.js-dist-min` carregado por dynamic import **apenas** na aba Explore (não entra no bundle das demais rotas); exibido acima da tabela quando existir.
- [ ] Botão "Copiar" (tabela como TSV) e "Baixar" (CSV do resultado).
- [ ] Mensagens de erro do pipeline aparecem como resposta do assistente em pt-BR com opção "Tentar novamente".
- [ ] Typecheck passa.
- [ ] Verify in browser using dev-browser skill.

### US-007: Auto-correção do código em caso de erro
**Description:** Como usuário, quero que o agente corrija sozinho erros de execução do código gerado para que eu receba um resultado válido em vez de um traceback.

**Acceptance Criteria:**
- [ ] Se a execução no sandbox lançar exceção, o pipeline reenvia ao LLM o código + traceback + contexto do dataset pedindo correção, e reexecuta.
- [ ] Máximo de 2 tentativas de correção (3 execuções no total, configurável); durante as tentativas a UI mostra etapa "Corrigindo análise...".
- [ ] Esgotadas as tentativas, resposta de erro amigável em pt-BR é persistida (`status: 'error'`) com o último traceback disponível na aba Código para depuração.
- [ ] Teste unitário do loop de retry (mocks do LLM e do sandbox).
- [ ] Typecheck passa.

### US-008: Sugestões de perguntas a partir do schema
**Description:** Como usuário, ao abrir um chat vazio quero ver 4 sugestões de perguntas relevantes para o meu dataset para começar rápido.

**Acceptance Criteria:**
- [ ] No empty state, 4 chips clicáveis com perguntas geradas por LLM a partir do schema do dataset (nomes/tipos de colunas + stats resumidas), em pt-BR, cobrindo tipos variados de análise (ex.: barra por categoria, dispersão, agregação, distribuição).
- [ ] Sugestões geradas uma vez por versão ativa do dataset e cacheadas (jsonb na tabela `datasets` ou tabela própria) — não chama o LLM a cada render.
- [ ] Fallback heurístico sem LLM (templates com nomes de colunas) se a chamada falhar.
- [ ] Clicar em um chip envia a pergunta imediatamente.
- [ ] Typecheck passa.
- [ ] Verify in browser using dev-browser skill.

### US-009: Histórico de conversas
**Description:** Como usuário, quero ver minhas conversas anteriores na sidebar e retomá-las para continuar uma análise de onde parei.

**Acceptance Criteria:**
- [ ] Sidebar lista chats do projeto ordenados por `updatedAt` desc, com título e data relativa em pt-BR.
- [ ] Selecionar um chat carrega todas as mensagens e resultados (cards reabrem o painel com tabela/gráfico/código a partir do `result` persistido — sem reexecutar nada).
- [ ] Continuar a conversa em um chat existente envia o histórico como contexto ao pipeline (follow-ups como "agora só de 2024" funcionam).
- [ ] "Nova conversa" cria chat novo; excluir chat disponível via menu contextual (com confirmação).
- [ ] Typecheck passa.
- [ ] Verify in browser using dev-browser skill.

## 4. Functional Requirements

- FR-1: A aba Explorar deve ser habilitada na navegação do projeto e conter exclusivamente a experiência de chat (a exploração estatística existente permanece no Prepare, inalterada).
- FR-2: O sistema deve enviar toda chamada de LLM através do OpenRouter (`https://openrouter.ai/api/v1`), com modelo definido por `EXPLORE_MODEL` (default `anthropic/claude-sonnet-4.5`) e chave `OPENROUTER_API_KEY`; nenhum guardrail de conteúdo é implementado na aplicação — essa responsabilidade fica no gateway.
- FR-3: O sistema deve executar todo código Python gerado pelo LLM exclusivamente em sandbox e2b (`E2B_API_KEY`), nunca no host, no web ou no worker.
- FR-4: O pipeline de cada pergunta deve seguir as etapas: interpretar prompt → planejar análise → gerar código → executar no sandbox → interpretar resultado, emitindo o rótulo de cada etapa via streaming para a UI.
- FR-5: O contexto enviado ao LLM deve incluir: pergunta atual, histórico da conversa, nome do dataset, colunas com tipo e estatísticas resumidas (de `dataset_columns`) e uma amostra pequena de linhas — nunca o dataset inteiro.
- FR-6: O sandbox deve receber o parquet da versão ativa do dataset e carregá-lo como `df` (pandas) antes de qualquer execução.
- FR-7: Cada resposta do assistente deve materializar um payload com: título, interpretação em pt-BR, código Python, tabela (colunas + linhas, máx. 1.000) e/ou gráfico (Plotly JSON), persistido em `explore_messages.result`.
- FR-8: O código gerado deve seguir o contrato `def perform_analysis(df: pd.DataFrame) -> Iterator[Any]`, yieldando figuras Plotly e/ou DataFrames — o executor rejeita código fora do contrato e aciona o fluxo de correção.
- FR-9: Em caso de exceção na execução, o sistema deve tentar auto-correção com o traceback até 2 vezes antes de retornar erro ao usuário.
- FR-10: A UI da resposta deve oferecer as abas Tabela, Interpretação da IA e Código, com ações Copiar e Baixar (CSV).
- FR-11: Chats e mensagens devem ser persistidos por projeto; reabrir um chat deve renderizar os resultados salvos sem reexecutar código.
- FR-12: O empty state deve exibir 4 sugestões de perguntas geradas a partir do schema do dataset, cacheadas por versão ativa.
- FR-13: Timeouts obrigatórios: 60s por execução de código, 120s por pergunta (pipeline completo), com mensagens de erro em pt-BR.
- FR-14: A ausência das env vars da feature não pode impedir o boot do app: a aba deve degradar para um estado "não configurado".
- FR-15: Todos os textos de UI e as saídas do agente (títulos, interpretações, mensagens de erro) devem estar em pt-BR; formatação numérica/moeda/data no padrão pt-BR.

## 5. Non-Goals (Out of Scope)

- **Saved charts e compartilhamento** de chat por link público (fase 2 — o schema de `result` já persiste tudo que seria necessário).
- Custom Instructions por projeto e integração com Slack (presentes na Akkio, fora deste MVP).
- Modificação do dataset a partir do chat (transformações continuam sendo domínio do Prepare).
- Análises multi-dataset / joins entre projetos.
- Treinamento ou invocação de modelos preditivos via chat (domínio do Predict).
- Guardrails de conteúdo na aplicação (delegados ao OpenRouter AI Gateway).
- Feedback thumbs up/down por resposta.
- Uso do worker Python/BullMQ para execução das análises (tudo roda no e2b).

## 6. Design Considerations

- Referência visual: Chat Explore da Akkio — sidebar de histórico à esquerda, conversa ao centro, painel de resultado à direita com abas Table / AI Interpretation / Code; empty state com chips de sugestão e dica "faça uma pergunta por vez".
- Reusar os tokens visuais e componentes existentes (Tailwind, tooltips da navbar, padrão de grids do Prepare) para consistência.
- `plotly.js-dist-min` só pode ser carregado via dynamic import na rota do Explore — o app hoje não tem lib de gráficos e o bundle das outras rotas não deve crescer.
- Etapas de progresso seguem o padrão da referência ("Carregando dataset e definição", etc.) — texto simples com spinner, não barra de progresso.

## 7. Technical Considerations

- **Streaming:** o repo não tem SSE hoje; o route handler de US-004 introduz o padrão (`ReadableStream` em App Router). Polling não atende a UX de etapas.
- **e2b:** usar o template Code Interpreter oficial (pandas/plotly/pyarrow inclusos). Um sandbox por chat com TTL curto controla custo; a recriação transparente reenvia o parquet.
- **Modelo:** `EXPLORE_MODEL` aceita qualquer slug do OpenRouter; documentar no README que trocar o modelo não requer deploy. Interpretação e geração de código usam o mesmo modelo no MVP.
- **Segurança:** chaves só no servidor; validação de sessão/organização idêntica às server actions existentes; o sandbox recebe apenas o parquet (sem rede interna, sem credenciais). Código gerado é auditável na aba Código.
- **Custo/limites:** truncar tabela em 1.000 linhas e contexto do dataset a schema+amostra mantém prompts pequenos; considerar limite de mensagens por minuto por usuário como follow-up.
- **Dependências novas:** `@e2b/code-interpreter`, `plotly.js-dist-min`, e um highlighter leve para a aba Código (ex.: `shiki` já em uso? verificar; senão `prism` mínimo).

## 8. Success Metrics

- ≥ 80% das perguntas de análise comuns (agregação, filtro, ranking, correlação, série temporal) retornam resultado válido sem intervenção manual (incluindo auto-correção).
- Tempo mediano pergunta → resultado ≤ 30s.
- Zero execuções de código gerado fora do sandbox e2b (verificável por revisão de código: nenhum `exec`/subprocess no web/worker para esse fluxo).
- Usuários de aula conseguem gerar um gráfico a partir de linguagem natural sem instrução prévia (teste informal em turma).

## 9. Open Questions

- O painel de resultado deve permitir alternar o tipo de gráfico depois de gerado (como a página Chart Types da Akkio) ou isso fica para a fase de saved charts?
- Vale expor um seletor de modelo na UI (admin) além da env var, para experimentação em aula?
- Precisamos de contabilidade de custo por organização (tokens OpenRouter + minutos e2b) já no MVP ou apenas logging?
- O sandbox deve ter rede externa bloqueada por política do e2b (quando disponível no plano) ou aceitamos o default do template?
