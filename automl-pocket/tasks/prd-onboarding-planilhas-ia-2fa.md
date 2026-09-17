# PRD: Onboarding por planilha, proteção da IA, guia do problema, leads, ETA da fila e 2FA opcional

## Introdução

Esta PRD reúne seis frentes que saíram da prática beta com executivos. O fio
condutor é o mesmo: o executivo precisa **dar os primeiros passos para validar
um problema de negócio** sem esbarrar em detalhes técnicos, e a plataforma
precisa suportar isso sem expor custo (LLM) nem conta (segurança) a abuso.

| # | Frente | Dor observada | Situação atual no código |
|---|---|---|---|
| A | Planilhas fora do formato "horizontal" e com várias abas | Usuário sobe Excel com título nas primeiras linhas, características em linhas (transposto) ou uma aba por mês/unidade esperando que a plataforma "junte tudo". Hoje o dataset vira colunas `Unnamed: 0`, `Unnamed: 1`… ou só a primeira aba é lida, e o executivo não entende o que deu errado. | `apps/worker/jobs/parsing.py` lê `sheet_name=0` e assume header na linha 0; nenhum diagnóstico de layout. |
| B | Abuso da API de IA | Preocupação de que alguém descubra `/api/explore/chat` pelo inspecionar do navegador e use o modelo como chatbot gratuito ou queime crédito do OpenRouter. | Rota exige sessão (`getApiUser`) e tem rate limit 10/min por usuário; insight 5/h por usuário. Não há teto diário/mensal, nem medição de tokens, nem verificação de origem. |
| C | Começar sem planilha pronta | Muitos executivos chegam com o problema na cabeça, mas sem dados organizados. Não sabem quais colunas coletar nem em que formato. | O projeto só tem `name`; não existe descrição do problema nem planilha modelo. |
| D | Captura de leads enterprise | Empresas e profissionais pedem consultoria ou ambiente exclusivo e não há um canal dentro do produto. | Nada. Existe `problem_reports` (bugs) e envio de email via Resend. |
| E | Fila de treinamento | "Posição 3 de 7" não diz ao executivo se ele espera 1 ou 20 minutos. | `getTrainingQueuePosition` + `training-progress.tsx` mostram posição; o worker já grava `durationSeconds` em `training.succeeded` (audit_logs). |
| F | Autenticação em dois fatores (MFA) opcional por app autenticador | Pedido de segurança adicional para contas corporativas, sem obrigar todo mundo, sempre orientando o usuário (ex.: Google Authenticator). | Better Auth 1.7.1 (email/senha + Google). Plugin `twoFactor` (TOTP, códigos de recuperação, dispositivo confiável) já no pacote, não instalado. Tela de Configurações é somente leitura. |
| G | CORS nas rotas internas e endurecimento da API/MCP publicados | Rotas internas que consomem modelos e IA não têm política de CORS explícita; a API e o MCP publicados são integrações server-to-server que não podem ser afetadas por CORS, mas precisam de boas práticas de chave. | Nenhum header CORS em lugar nenhum (o navegador já bloqueia leitura cross-origin por padrão). API/MCP: uma chave por deployment (SHA-256 no banco, prefixo de 8 chars), rate limit 30/min por chave, regeneração imediata sem período de graça. `/api/v1/predict` recebe a chave **no body**; MCP aceita `Bearer` ou `?token=`. |
| H | Sidebar do Prever antes de escolher o tipo de modelo | Na tela de escolha entre "modelo preditivo" e "previsão temporal", a sidebar "Campos de predição" já aparece com a lista de colunas, o que confunde: o usuário marca alvo antes de saber o tipo, ou não entende por que a lista está ali. | `predict-view.tsx` renderiza o `<aside>` sempre; só os campos de forecasting dependem de `kind`. A escolha do tipo vive em `?tipo=` na URL (`kind == null` = tela de escolha). |

Cada frente tem suas próprias user stories; elas são independentes entre si e
podem ser priorizadas separadamente. A ordem sugerida está em
"Ordem de implementação".

## Objetivos

- Toda planilha Excel/CSV "razoável" (título acima do cabeçalho, várias abas
  com as mesmas colunas, características em linhas) vira um dataset utilizável
  em no máximo uma tela de revisão, com linguagem de negócio, sem o usuário
  precisar reabrir o Excel.
- Nenhum usuário consegue gastar mais do que um teto configurável de chamadas
  de LLM por dia/mês, e a plataforma como um todo tem um disjuntor de custo.
- Um executivo sem dados consegue, a partir de uma descrição em texto, obter a
  lista de características recomendadas e baixar uma planilha modelo para
  começar a coletar.
- Existe um canal in-app para pedir consultoria ou ambiente exclusivo, com o
  pedido gravado no banco e notificado por email.
- A tela de fila mostra tempo estimado em minutos (com faixa), não só posição.
- Usuários com senha podem ativar a autenticação em dois fatores (MFA): após
  email e senha, um código rotativo do app autenticador (TOTP via QR code),
  com códigos de recuperação, orientação passo a passo na tela e desativação
  a qualquer momento.
- As rotas internas têm política de CORS explícita e testada (negar tudo que
  não é same-origin), e a API/MCP publicados seguem boas práticas de chave
  (só em header, rotação com graça, revogação, último uso, bloqueio de
  força bruta) sem nenhuma restrição de CORS que quebre integrações.
- Tudo entra de forma incremental e sem breaking changes: migrations
  aditivas, compatibilidade mantida, proteções em modo observação antes de
  bloquear, flags por env, e uma onda inicial de quick wins sem migration
  (ver "Estratégia incremental e compatibilidade").

## Decisões de produto (respostas às perguntas do briefing)

### Como mitigar o uso abusivo da rota de IA descoberta pelo navegador?

Ponto de partida honesto: **não existe como esconder a rota**. Qualquer coisa
que o navegador chama, o usuário consegue chamar com `curl` usando o próprio
cookie de sessão. Assinar requisições no client não ajuda (a chave estaria no
próprio JavaScript). A defesa correta é tornar o abuso **inútil e barato de
conter**, em camadas:

1. **Já existe**: sessão obrigatória (só usuários aprovados no beta), rate limit
   por usuário (10/min Explore, 5/h insight), tamanho máximo da mensagem
   (4000 chars), system prompt montado no servidor (o client não controla o
   papel do modelo). Isso já elimina uso anônimo e uso por terceiros.
2. **Falta: teto de volume por usuário**. 10/min sem teto diário permite, em
   tese, 14.400 chamadas/dia. A frente B cria um **orçamento diário e mensal
   de chamadas e tokens de LLM por usuário** (mesmo padrão de
   `inference_usage`), com bloqueio amigável e CTA para ambiente exclusivo.
3. **Falta: disjuntor global**. Um teto de custo diário da plataforma
   (`DAILY_LLM_BUDGET_USD`) que desliga as funções de IA para todos quando
   estourado, com log de alerta. Protege a fatura do OpenRouter contra
   qualquer cenário não previsto.
4. **Falta: guardrail de escopo contando como sinal de abuso**. A PRD
   `prd-explore-chat-memoria-guardrails.md` já prevê recusa educada para
   assuntos fora do dataset (classe `off_topic`). Aqui adicionamos: recusa
   acontece **antes** de gastar sandbox, e N recusas em uma janela geram
   bloqueio temporário do Explore e evento de auditoria
   `explore.abuse_suspected`. Isso torna o "chatbot gratuito" inútil: o modelo
   só responde sobre os dados do projeto.
5. **Falta: verificação de origem**. Rejeitar requisições a `/api/explore/chat`
   cujo `Origin`/`Sec-Fetch-Site` não seja same-origin. Não impede `curl`, mas
   impede que um site de terceiros use a sessão do usuário (CSRF) e derruba a
   classe de ataque "página maliciosa aberta em outra aba".
6. **Falta: medição**. Gravar tokens de entrada/saída e custo estimado por
   chamada, para o admin enxergar quem consome o quê (`docs/metricas-uso.md`).

Sem essas camadas, o pior caso hoje é um usuário aprovado gastando crédito com
perguntas irrelevantes. Com elas, o pior caso vira "um usuário atinge o teto
diário e recebe um aviso".

### Como será a verificação em duas etapas (MFA)

Decisão: **MFA clássico, opcional, por app autenticador**. O login continua
sendo email e senha; quem ativar a segunda camada passa a digitar, logo
depois da senha, o código de 6 dígitos que o app gera e troca a cada 30
segundos (TOTP, RFC 6238). É exatamente o que o Google Authenticator faz, e o
mesmo QR code funciona com Microsoft Authenticator, Authy, 1Password,
Bitwarden e Senhas da Apple. Na UI, o Google Authenticator é o exemplo citado
e o passo a passo é escrito para ele ("Abra o Google Authenticator, toque em
+, escolha Ler QR code"), com a observação de que qualquer app autenticador
serve.

O fluxo completo:

1. **Ativar** (Configurações → Segurança): confirmar senha → instalar o app →
   ler o QR code → digitar o primeiro código para provar que o app está
   sincronizado → guardar 10 códigos de recuperação de uso único.
2. **Entrar**: email e senha → tela `/2fa` pede o código atual do app →
   opcionalmente "confiar neste dispositivo por 30 dias" para não pedir de
   novo no mesmo navegador.
3. **Recuperar**: perdeu o celular → usa um código de recuperação → em
   Configurações desativa e ativa de novo com o celular novo.
4. **Desativar**: senha + código atual.

Descartados nesta versão:

- **SMS**: custo por envio, dependência de gateway, vulnerável a troca de
  chip (SIM swap).
- **Código por email**: fraco quando o email é o próprio fator de
  recuperação da senha; fica como fallback futuro.
- **Passkey/WebAuthn**: é login sem senha, não uma segunda camada sobre email
  e senha, e o plugin `twoFactor` do Better Auth não aceita WebAuthn como
  segundo fator. Fica para uma PRD futura, se fizer sentido oferecer login
  sem senha.

No Better Auth 1.7.1 instalado, o TOTP vem do plugin `twoFactor` (já no
pacote, sem dependência nova), com códigos de recuperação e "confiar neste
dispositivo" prontos. Restrição conhecida: ativar ou desativar exige
confirmar a senha; decisão: **contas criadas só pelo Google não recebem MFA
nesta versão** e veem a nota de que a conta já é protegida pela verificação
em duas etapas do Google; a opção fica disponível apenas para contas com
senha.

### CORS nas rotas internas e boas práticas para a API/MCP publicados

**Rotas internas (Explore, insight, predição da UI, web app público por
slug).** O navegador já aplica a same-origin policy: sem headers
`Access-Control-Allow-*`, um site de terceiros não consegue **ler** a resposta
dessas rotas, e um `POST` com JSON dispara preflight que falha. Além disso, o
cookie de sessão é `sameSite=lax`, então um `POST` cross-site não carrega a
sessão. Ou seja, hoje a proteção existe por omissão, não por política. A
Frente G torna isso explícito e testado:

- Nenhuma rota interna responde `Access-Control-Allow-Origin`; um handler
  `OPTIONS` devolve 204 sem headers de permissão (nega o preflight de forma
  clara e barata).
- Defesa em profundidade com `Sec-Fetch-Site`/`Origin` (já prevista na
  US-007 para o Explore), estendida a todas as rotas internas que consomem
  modelo ou IA, inclusive o lote do web app público (`/app/[slug]/batch`).
- Teste automatizado que garante que nenhuma rota fora de `/api/v1` e
  `/api/mcp` emite header CORS (evita regressão por copiar e colar).

**API e MCP publicados.** São canais para servidores (n8n, Zapier, Python,
Claude Desktop, Cursor), não para o navegador. Decisão: **não habilitar CORS**
neles de propósito. Se um front-end chamasse `/api/v1/predict` direto do
navegador, a chave da API ficaria exposta no JavaScript, que é exatamente o
que se quer evitar; quem precisa de predição no navegador usa o Web App
publicado (slug) ou um backend próprio. Como não há CORS, a política também
não afeta nenhuma integração server-to-server. O que endurecer, em ordem de
valor:

1. **Chave só em header** (`Authorization: Bearer`). Hoje `/api/v1/predict`
   recebe `api_key` no body e o MCP aceita `?token=`. Chave em URL vaza em
   logs de proxy, histórico e `Referer`. Manter compatibilidade por um período
   com aviso na resposta (`Deprecation` header) e nunca gravar a chave em log.
2. **Ciclo de vida da chave**: rotação com período de graça (a chave antiga
   segue válida por 24 h para a integração trocar sem downtime), revogação
   imediata, `last_used_at` e `last_used_ip` visíveis na UI do deploy, prefixo
   identificável (`dos_live_`) que facilita achar vazamento em repositórios.
3. **Força bruta e enumeração**: rate limit por IP nas respostas 401 (10/min)
   e evento `api.auth_failed` com prefixo tentado e IP; 401 idêntico para
   "chave inexistente" e "deployment despublicado".
4. **Limites de payload**: teto de linhas por chamada e tamanho do body
   explícitos e documentados; erro 413 em português.
5. **Higiene de resposta**: `Cache-Control: no-store`, sem eco das linhas
   enviadas em mensagens de erro, sem stack trace; para o MCP, validar
   `Origin` quando presente (a especificação MCP recomenda para prevenir DNS
   rebinding) e expor somente a tool de predição.
6. **Orientação na UI de deploy**: bloco "Boas práticas" (guardar a chave em
   variável de ambiente, nunca no front-end, rotacionar se exposta) e exemplos
   de código já usando o header.
7. **Opcional (enterprise)**: lista de IPs permitidos por deployment. Fica
   como Open Question; útil para o "ambiente exclusivo" da Frente D.

## User Stories

### Frente A: importação de planilhas fora do formato

### US-001: Worker gera diagnóstico de layout antes de parsear
**Description:** Como usuário, quero que a plataforma entenda a estrutura da
minha planilha (abas, linha do cabeçalho, orientação) antes de transformá-la
em dataset, para não ver colunas `Unnamed` nem perder abas.

**Acceptance Criteria:**
- [ ] Novo módulo `apps/worker/jobs/layout.py` com `diagnose_layout(path, file_format) -> LayoutDiagnosis`, determinístico (sem LLM)
- [ ] Para `xlsx`, inspeciona **todas** as abas (até 30; acima disso, diagnostica as 30 primeiras e marca `truncated: true`), ignorando abas ocultas e vazias
- [ ] Para cada aba/arquivo produz: `name`, `rowCount`, `colCount`, `headerRow` (índice sugerido), `orientation` (`horizontal` | `transposed`), `schemaFingerprint` (lista normalizada de nomes de colunas: minúsculas, sem acento, sem espaços) e `preview` (até 8 linhas × 12 colunas brutas, como strings)
- [ ] Heurística de `headerRow`: primeira linha em que ≥ 60% das células não vazias são texto **e** a linha seguinte tem tipos majoritariamente diferentes (número/data) ou cardinalidade compatível com dados; linhas acima do header com ≤ 2 células preenchidas são consideradas título/legenda
- [ ] Heurística de `transposed`: `colCount > rowCount × 3`, primeira coluna é texto único em todas as linhas (rótulos) e as demais colunas são majoritariamente numéricas/datas; caso contrário `horizontal`
- [ ] Heurística de `sameSchema`: abas cujo `schemaFingerprint` é igual (ordem indiferente) são agrupadas em `groups: [{ sheets: [...], fingerprint }]`
- [ ] `needsReview` é `true` se qualquer um vale: mais de uma aba com dados, `headerRow > 0`, `orientation = transposed`, ou ≥ 30% das colunas sem nome (`Unnamed`)
- [ ] Testes em `tests/test_layout.py` com fixtures: aba única limpa (não precisa revisão), título em 2 linhas acima do header, planilha transposta, 3 abas com mesmas colunas, 2 abas com colunas diferentes, aba oculta ignorada, CSV com título acima do header

### US-002: Parse aceita opções de layout e novo status `needs_review`
**Description:** Como usuário, quero que um arquivo que precisa de revisão
pare numa etapa de confirmação em vez de virar um dataset errado, e que
minhas escolhas sejam aplicadas no parse.

**Acceptance Criteria:**
- [ ] Novo valor `needs_review` em `dataset_status` (migration Drizzle) e nova coluna `datasets.layout_diagnosis` (jsonb) e `datasets.parse_options` (jsonb, nulo = padrão)
- [ ] `dataset:parse` roda `diagnose_layout` primeiro; se `LAYOUT_REVIEW_ENABLED=true`, `needsReview` e `parse_options` for nulo, grava `layout_diagnosis`, define `status = 'needs_review'` e **encerra sem parsear**; com a flag desligada (default) grava só o diagnóstico e segue o fluxo atual (com os quick wins da US-025)
- [ ] Todo `switch`/`Record` sobre `dataset_status` no web trata `needs_review` explicitamente; um teste de tipos (`satisfies Record<DatasetStatus, ...>`) impede esquecer o valor novo
- [ ] `parse_options` suporta: `sheets: string[]` (uma ou várias), `combine: boolean` (concatena as abas escolhidas, exigindo mesmo fingerprint; adiciona coluna `aba_origem` com o nome da aba), `headerRow: number`, `transpose: boolean`
- [ ] `read_dataset_file` aplica as opções: seleciona abas, pula linhas até `headerRow`, transpõe quando pedido (primeira coluna vira cabeçalho, nomes duplicados recebem sufixo `_2`, `_3`), concatena quando `combine`
- [ ] Combinação rejeita abas com fingerprint diferente com mensagem em português ("As abas X e Y têm colunas diferentes e não podem ser combinadas.")
- [ ] Limites: resultado combinado respeita o mesmo teto de linhas/tamanho já aplicado ao parse (não há novo limite)
- [ ] Nova ação/rota `POST /api/datasets/[datasetId]/layout` (Zod, escopo de org) grava `parse_options`, volta status para `parsing` e reenfileira `dataset:parse`
- [ ] Datasets em `needs_review` não podem ser vinculados a projeto nem aparecem em seletores de treino; contam na quota de armazenamento como hoje
- [ ] Testes do worker para cada opção e para o caminho "sem revisão" (comportamento idêntico ao atual)

### US-003: Tela "Revisar planilha" em linguagem de negócio
**Description:** Como executivo, quero uma tela simples que me mostre o que a
plataforma entendeu da minha planilha e me deixe confirmar ou ajustar, para
chegar a um dataset correto sem voltar ao Excel.

**Acceptance Criteria:**
- [ ] Na lista de datasets, status `needs_review` aparece como "Precisa de revisão" com botão "Revisar planilha"
- [ ] Após o upload, se o dataset cair em `needs_review`, o usuário é levado direto para a tela de revisão (`/datasets/[datasetId]/review`)
- [ ] Bloco "Abas": quando há mais de uma aba com dados, lista cada aba com nome, linhas × colunas e um chip "mesmas colunas" para abas do mesmo grupo. Opções: **"Usar só esta aba"** (radio) ou **"Combinar abas com as mesmas colunas"** (aparece só quando há grupo com ≥ 2 abas; explica que será criada a coluna `aba_origem`). Abas de grupos diferentes não podem ser combinadas entre si; a UI explica em uma frase
- [ ] Bloco "Cabeçalho": preview das primeiras 8 linhas brutas; a linha sugerida como cabeçalho vem destacada; o usuário pode clicar em outra linha para escolhê-la. Texto de apoio: "A primeira linha com os nomes das características. As linhas acima serão ignoradas."
- [ ] Bloco "Orientação": só aparece quando `orientation = transposed`. Mostra preview lado a lado "como está" / "como ficará" e a explicação: "Cada linha deve ser um exemplo (um cliente, uma venda, um mês) e cada coluna uma característica"
- [ ] Botão "Confirmar e continuar" envia `parse_options`, mostra estado "Processando" e redireciona para o dataset quando `status` sair de `parsing`
- [ ] Link "Baixar planilha modelo" e link para a Frente C ("Não sabe quais colunas usar? Descreva seu problema") no rodapé da tela
- [ ] Mensagem de erro do parse com opções (ex.: abas incompatíveis) reabre a tela de revisão com o erro no topo, mantendo as escolhas anteriores
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-004: Explicação amigável quando o dataset fica ruim mesmo assim
**Description:** Como usuário, quero um aviso claro quando o dataset parseado
tem sinais de estrutura errada, para corrigir antes de tentar treinar.

**Acceptance Criteria:**
- [ ] Após o profiling, se ≥ 30% das colunas se chamam `Unnamed*` ou têm ≥ 95% de valores vazios, o dataset recebe `warning` em `layout_diagnosis.warnings[]` (não muda status)
- [ ] A página do dataset mostra banner: "Parece que a planilha não está no formato esperado" com botão "Revisar planilha" (reabre a US-003 com o diagnóstico) e link para a planilha modelo
- [ ] Evento `dataset.layout_reviewed` em `audit_logs` com metadata `{ needsReview, sheets, combined, headerRow, transposed }` (sem conteúdo do arquivo)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### Frente B: proteção das funções de IA

### US-005: Medição de uso de LLM por chamada
**Description:** Como admin, quero saber quantas chamadas e tokens cada
usuário consome nas funções de IA, para detectar abuso e dimensionar custo.

**Acceptance Criteria:**
- [ ] Nova tabela `llm_usage` (`id`, `user_id` set null on delete, `org_id`, `feature` enum `explore | insight | problem_brief | explore_suggestions`, `model`, `input_tokens`, `output_tokens`, `estimated_cost_usd` numeric, `created_at`); índice por `(user_id, created_at)`
- [ ] `chatComplete` e `chatCompleteStream` em `src/lib/llm.ts` passam a retornar `usage` (o OpenRouter devolve `usage` na resposta e no último chunk do stream com `stream_options.include_usage`); um helper `recordLlmUsage(...)` grava a linha e nunca lança
- [ ] Todas as chamadas atuais (pipeline do Explore em suas etapas, insight, sugestões do Explore) registram uso; uma pergunta do Explore pode gerar várias linhas (uma por etapa) com o mesmo `request_id`
- [ ] `estimated_cost_usd` calculado por tabela de preços por modelo em `src/lib/llm-pricing.ts` (valores em env/const, com fallback 0 e aviso no log quando o modelo não está na tabela)
- [ ] `docs/metricas-uso.md` ganha consultas: custo por usuário/mês, top 10 consumidores nos últimos 7 dias, custo por feature
- [ ] Typecheck/lint passam; testes Vitest com LLM fake cobrindo gravação de uso

### US-006: Orçamento de IA por usuário (diário e mensal)
**Description:** Como operador, quero um teto de chamadas de IA por usuário
para que um script rodando dentro do rate limit não queime crédito sem
limite.

**Acceptance Criteria:**
- [ ] Novas envs `DAILY_LLM_CALLS_LIMIT` (default 150) e `MONTHLY_LLM_CALLS_LIMIT` (default 1500), documentadas no README; "chamada" = uma pergunta do Explore, uma geração de insight, uma geração de brief (não as etapas internas)
- [ ] Env `LLM_BUDGET_MODE=off|report|enforce` (default `off`): em `report`, estourar só grava `llm.budget_exceeded` e a chamada segue; em `enforce`, bloqueia. A troca de modo não exige deploy de código
- [ ] Helper `checkLlmBudget(userId)` em `src/lib/llm-quota.ts` conta em `llm_usage` (por `request_id` distinto) e é chamado **depois** do rate limit e **antes** de qualquer chamada paga, em todas as features
- [ ] Ao estourar: resposta 429 com mensagem "Você atingiu o limite diário de perguntas à IA. Ele renova às 00:00." (ou mensal, com data), sem `Retry-After` em segundos; a UI do Explore e do insight mostram a mensagem e o CTA da Frente D
- [ ] A tela Configurações ganha a linha "Perguntas à IA neste mês: X de Y" no card de uso, mesmo padrão de inferências
- [ ] Evento `llm.budget_exceeded` em `audit_logs` (uma vez por usuário por dia, não a cada tentativa)
- [ ] Typecheck/lint passam; testes Vitest do helper com store fake

### US-007: Disjuntor global de custo e verificação de origem
**Description:** Como operador, quero que a plataforma desligue as funções de
IA se o gasto do dia passar do combinado, e que a rota do Explore só aceite
chamadas vindas do próprio site.

**Acceptance Criteria:**
- [ ] Env `DAILY_LLM_BUDGET_USD` (default 0 = desligado); `checkLlmBudget` soma `estimated_cost_usd` do dia e, se estourar, todas as features de IA respondem "As funções de IA estão temporariamente indisponíveis. Tente novamente amanhã." com `console.error` único por dia e evento `llm.circuit_open`
- [ ] Middleware/helper `requireSameOrigin(request)` aplicado em `/api/explore/chat` (e em qualquer rota de IA futura): aceita quando `Sec-Fetch-Site` é `same-origin`/`none` ou quando `Origin` bate com `BETTER_AUTH_URL`; caso contrário, em `INTERNAL_ORIGIN_MODE=report` (default) só grava `authz.cross_origin` e segue; em `enforce` responde 403
- [ ] Rotas de API pública (`/api/v1/predict`, `/api/mcp`) **não** recebem essa verificação (são chamadas de fora por design)
- [ ] `max_tokens` explícito em todas as chamadas de LLM (Explore e insight já têm valor implícito; tornar explícito e documentar em `llm.ts`)
- [ ] Typecheck/lint passam; teste Vitest do `requireSameOrigin` com cabeçalhos válidos/inválidos

### US-008: Recusas fora de escopo contam como sinal de abuso
**Description:** Como operador, quero que quem insiste em usar o Explore como
chatbot genérico seja bloqueado temporariamente, para que o modelo só sirva
para analisar os dados do projeto.

**Acceptance Criteria:**
- [ ] Depende da classe `off_topic` da triagem (`prd-explore-chat-memoria-guardrails.md`, US-006). Se ainda não estiver implementada, esta story a inclui no escopo mínimo: classificar antes de planejar/rodar sandbox
- [ ] Contador Redis `explore:offtopic:<userId>` com janela de 1 hora; ao atingir 8 recusas, o Explore responde "Você fez várias perguntas fora do contexto dos seus dados. O Explore volta a responder em N minutos." e bloqueia por 30 min (chave com TTL)
- [ ] Evento `explore.abuse_suspected` em `audit_logs` com `{ count, windowMinutes }` ao entrar em bloqueio
- [ ] Recusas não contam no orçamento de chamadas (US-006) porque não custam sandbox, mas contam tokens da triagem em `llm_usage`
- [ ] Typecheck/lint passam; testes com LLM fake simulando 8 `off_topic`

### Frente C: descrever o problema e obter características / planilha modelo

### US-009: Descrição do problema no projeto
**Description:** Como executivo, quero registrar em texto o problema de
negócio que quero validar, para a plataforma me orientar sobre os dados
necessários.

**Acceptance Criteria:**
- [ ] Novas colunas `projects.problem_description` (text, até 1000 chars) e `projects.problem_brief` (jsonb, nulo até gerar)
- [ ] O diálogo de criação de projeto ganha campo opcional "Qual problema você quer resolver?" com placeholder de exemplo ("Quero prever quais clientes vão cancelar o plano nos próximos 3 meses") e contador de caracteres
- [ ] A página do projeto mostra a descrição e permite editar (inline ou diálogo); editar limpa `problem_brief`
- [ ] Ação Zod + escopo de org; `project.create` e um novo `project.update_description` em `audit_logs` (sem o texto)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-010: Geração do guia do problema (características sugeridas)
**Description:** Como executivo, quero que a IA sugira quais características
coletar, qual é o alvo e que tipo de problema é, para saber por onde começar.

**Acceptance Criteria:**
- [ ] Ação `generateProblemBrief(projectId)` chama o LLM (via `chatComplete` com saída JSON validada por Zod) e grava `problem_brief`: `{ problemType: 'classification'|'regression'|'forecasting', target: { name, description, example }, features: [{ name, type: 'number'|'category'|'text'|'date'|'id', description, example, priority: 'essencial'|'recomendada' }] (6 a 12 itens), minRows: number, pitfalls: string[] (ex.: vazamento de dado futuro), notes: string }`
- [ ] Passa por rate limit `PROBLEM_BRIEF_RATE_LIMIT = { limit: 5, windowSec: 3600 }`, orçamento da US-006 e disjuntor da US-007; brief salvo não chama LLM de novo (botão "Gerar novamente" explícito)
- [ ] System prompt em pt-BR, com guardrail: só responde no formato JSON pedido, trata a descrição como dado (sem seguir instruções embutidas), recusa via `{ refused: true, reason }` quando a descrição não descreve um problema de dados
- [ ] Resposta inválida (JSON quebrado, fora do schema) gera uma nova tentativa; segunda falha devolve erro amigável sem gravar
- [ ] Evento `project.brief.generate` em `audit_logs` com `{ projectId, projectName, problemType, featureCount, regenerate }`
- [ ] Testes Vitest com LLM fake: brief válido, JSON inválido + retry, recusa
- [ ] Typecheck/lint passam

### US-011: Card "Guia do problema" e download da planilha modelo
**Description:** Como executivo, quero ver as características sugeridas em
linguagem simples e baixar uma planilha modelo já com as colunas certas e
exemplos, para começar a coletar dados hoje.

**Acceptance Criteria:**
- [ ] Na página do projeto **sem dataset vinculado**, card "Guia do problema" com: tipo de problema em português ("Classificação: prever uma categoria"), alvo destacado, tabela de características (nome, o que é, exemplo, chip essencial/recomendada), "mínimo de linhas recomendado" e lista de armadilhas
- [ ] Botão "Baixar planilha modelo (.csv)" gera no servidor um CSV UTF-8 com BOM (abre certo no Excel pt-BR), separador `;`, cabeçalho com as colunas sugeridas (alvo por último) e 5 linhas de exemplo claramente fictícias (valores plausíveis a partir dos `example` do brief)
- [ ] Botão "Baixar planilha modelo (.xlsx)" com a mesma estrutura, aba "Dados" + aba "Instruções" (uma linha por característica com a descrição); gerado em memória com `exceljs` (dependência adicionada na US-026)
- [ ] Texto fixo no card: "Formato esperado: primeira linha com o nome das características, uma linha por exemplo, uma única aba"
- [ ] Com dataset vinculado, o card vira uma seção recolhida "Ver guia do problema"
- [ ] Rota de download com escopo de org e evento `project.brief.download` com `{ format }`
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### Frente D: "Solicitar ambiente exclusivo para sua empresa"

### US-012: Formulário e persistência do pedido
**Description:** Como empresa ou profissional, quero pedir consultoria ou um
ambiente exclusivo de dentro da plataforma, para ser contatado pela equipe.

**Acceptance Criteria:**
- [ ] Tabela `enterprise_leads` (`id`, `user_id` set null on delete, `org_id`, `email` snapshot, `name` snapshot, `company`, `role`, `team_size` enum `1-10 | 11-50 | 51-200 | 200+`, `interest` enum `consultoria | ambiente_exclusivo | ambos`, `message` até 1000 chars, `source` text, `created_at`)
- [ ] Diálogo `RequestEnterpriseDialog` com campos: empresa (obrigatório), cargo, tamanho do time, interesse, mensagem; nome e email pré-preenchidos e não editáveis
- [ ] Server action com Zod, rate limit `ENTERPRISE_LEAD_RATE_LIMIT = { limit: 3, windowSec: 86400 }` por usuário, evento `lead.enterprise_request` em `audit_logs` com `{ interest, teamSize, source }`
- [ ] Sucesso mostra "Recebemos seu pedido. A equipe da AutoML vai entrar em contato pelo seu email." (sem prazo) e o botão vira "Pedido enviado" pelo resto da sessão
- [ ] Typecheck/lint passam; teste Vitest da action

### US-013: Pontos de entrada e notificação
**Description:** Como equipe AutoML, quero consultar os pedidos no banco e
que o CTA apareça nos momentos em que o usuário sente a limitação do beta.

**Acceptance Criteria:**
- [ ] Nesta versão o pedido é **apenas gravado** em `enterprise_leads`; não há envio de email (o Resend já está integrado e a notificação fica para uma story futura, ver Non-Goals)
- [ ] CTA "Solicitar ambiente exclusivo para sua empresa" aparece em: card próprio na tela Configurações; rodapé da sidebar (link discreto); mensagens de limite atingido (quota de armazenamento, de inferências e de IA da US-006); tela de sucesso do treinamento (linha discreta abaixo do relatório)
- [ ] Cada ponto envia `source` diferente (`settings`, `sidebar`, `quota_storage`, `quota_inference`, `quota_llm`, `training_success`)
- [ ] Consulta em `docs/metricas-uso.md`: leads por semana e por `source`
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### Frente E: tempo estimado na fila de treinamento

### US-014: Estimativa de duração por tipo de problema e tamanho
**Description:** Como operador, quero que a plataforma estime a duração de um
treino a partir do histórico real, para mostrar tempo em vez de posição.

**Acceptance Criteria:**
- [ ] Helper `estimateTrainingDuration({ problemType, rowCount })` em `src/lib/training-eta.ts`: mediana de `durationSeconds` dos eventos `training.succeeded` dos últimos 30 dias, agrupada por `problemType` e faixa de linhas (`<1k`, `1k-10k`, `10k-100k`, `≥100k`), lida de `audit_logs` (metadata jsonb)
- [ ] Menos de 5 amostras na célula → cai para a mediana do `problemType`; menos de 5 no tipo → tabela fixa de fallback (`classification: 120s`, `regression: 120s`, `forecasting: 240s`), que é a mesma const criada na US-027
- [ ] Resultado cacheado em memória por 5 min (por processo) para não consultar `audit_logs` a cada polling de 2s
- [ ] `estimateQueueWait(trainingJobId)` combina: jobs ativos (`getActive()` com `processedOn`) e sua duração estimada restante, jobs em espera à frente e `training_concurrency` do worker (nova env `TRAINING_CONCURRENCY` lida pelo web com o mesmo default do worker) → `waitSeconds`, `totalSeconds = waitSeconds + própria estimativa`
- [ ] Devolve faixa `{ minSeconds: total × 0.7, maxSeconds: total × 1.5 }` e mantém `position`/`total` para uso secundário
- [ ] Testes Vitest com dados sintéticos: célula com amostras, fallback por tipo, fallback fixo, cálculo de espera com concorrência 4 e 6 jobs à frente

### US-015: UI mostra tempo estimado
**Description:** Como executivo, quero ver "cerca de 4 minutos" enquanto
espero, para decidir se fico na tela ou volto depois.

**Acceptance Criteria:**
- [ ] Em `queued`: linha principal "Tempo estimado: entre X e Y min" (formatação humana: segundos < 60 → "menos de 1 min"; horas quando ≥ 60 min); linha secundária menor "Posição na fila: N" (sem o "de Y")
- [ ] Em `running`: "Restam cerca de X min" a partir da estimativa própria menos o tempo decorrido; nunca mostra valor negativo (mínimo "menos de 1 min")
- [ ] Sem estimativa (Redis indisponível): mantém comportamento atual (omitir a linha)
- [ ] Texto de apoio: "A estimativa considera os treinos em andamento e o histórico da plataforma"
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### Frente F: verificação em duas etapas opcional

### US-016: Plugin twoFactor do Better Auth e migração
**Description:** Como desenvolvedor, preciso instalar o plugin de 2FA no
servidor e no client, para que os fluxos de ativação e verificação existam.

**Acceptance Criteria:**
- [ ] `twoFactor({ issuer: "AutoML", totpOptions: { digits: 6, period: 30 }, backupCodeOptions: { amount: 10, length: 10 } })` em `src/lib/auth.ts` e `twoFactorClient()` no client (`auth-client.ts`), com `onTwoFactorRedirect` para `/2fa`
- [ ] Migration Drizzle: tabela `two_factors` (`id`, `user_id` cascade, `secret`, `backup_codes`) e coluna `users.two_factor_enabled boolean not null default false`; schema Drizzle atualizado
- [ ] `skipVerificationOnEnable: false` (o usuário precisa validar um código antes de ativar)
- [ ] Rate limit `TWO_FACTOR_VERIFY_RATE_LIMIT = { limit: 5, windowSec: 60 }` por usuário nas rotas de verificação (via hook do Better Auth ou wrapper), com evento `auth.2fa_failed` a cada código inválido
- [ ] `proxy.ts` libera `/2fa` como rota pública (só precisa da sessão parcial do 2FA)
- [ ] Typecheck/lint passam

### US-017: Ativar e desativar em Configurações
**Description:** Como usuário com senha, quero ativar a verificação em duas
etapas com meu app autenticador e guardar códigos de recuperação, e desativar
quando quiser.

**Acceptance Criteria:**
- [ ] Card "Segurança" em Configurações (acima de "Sessão") com a seção "Autenticação em dois fatores". Introdução do card em uma frase: "Adicione uma camada extra de proteção: além da senha, você vai digitar um código que muda a cada 30 segundos no app autenticador do seu celular."
- [ ] Seção do app autenticador, para contas com senha: status "Desativado" + botão "Ativar com QR code". Para contas só Google: o card inteiro mostra apenas o texto "Sua conta entra pelo Google, que já oferece verificação em duas etapas. Gerencie essa proteção na sua conta Google." e nenhum botão
- [ ] Fluxo de ativação em diálogo de 4 passos com barra de progresso e texto de orientação em cada um: (1) "Confirme sua senha"; (2) "Instale um app autenticador": explica o que é em duas frases, mostra Google Authenticator como exemplo com links para App Store e Google Play, e nota "Também funciona com Microsoft Authenticator, Authy, 1Password ou Senhas da Apple"; (3) "Leia o QR code": QR (`totpURI` renderizado com `qrcode`) + instruções numeradas "Abra o app, toque em + e escolha Ler QR code; se não conseguir ler, digite a chave abaixo" + chave manual copiável + campo de 6 dígitos "Digite o código de 6 dígitos que apareceu no app"; (4) "Guarde seus códigos de recuperação": 10 códigos com "Copiar" e "Baixar .txt", explicação "Use um deles se perder o celular; cada código funciona uma vez", checkbox obrigatório "Guardei meus códigos em um lugar seguro" para concluir
- [ ] Link "Precisa de ajuda?" no passo 3 abre um painel com perguntas frequentes: código sempre inválido (horário do celular), trocou de celular (desativar e ativar de novo), perdeu o celular (usar código de recuperação)
- [ ] Status "Ativada desde DD/MM/AAAA" com botões "Gerar novos códigos de recuperação" (pede senha) e "Desativar" (pede senha + código atual)
- [ ] Eventos `auth.2fa_enabled`, `auth.2fa_disabled`, `auth.2fa_backup_regenerated` em `audit_logs`
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-018: Verificação no login e dispositivo confiável
**Description:** Como usuário com 2FA ativa, quero digitar o código depois da
senha e poder confiar no meu computador por 30 dias.

**Acceptance Criteria:**
- [ ] Após senha correta, o client redireciona para `/2fa`: campo de 6 dígitos com auto-submit, link "Usar código de recuperação" que troca o campo, checkbox "Confiar neste dispositivo por 30 dias" (`trustDevice`)
- [ ] Código inválido: mensagem "Código inválido. Verifique o horário do seu celular e tente novamente."; 5 falhas/min → mensagem de espera (US-016)
- [ ] Código de recuperação usado é consumido (uso único); ao restar ≤ 2 códigos, banner em Configurações "Você tem poucos códigos de recuperação"
- [ ] Sucesso grava `auth.2fa_verified` com `{ method: 'totp'|'backup', trustedDevice }`
- [ ] Login pelo Google **não** passa por `/2fa` (o provedor já autenticou com o próprio segundo fator)
- [ ] Na tela `/2fa`, texto de orientação: "Abra o Google Authenticator (ou o app que você cadastrou) e digite o código de 6 dígitos de AutoML"
- [ ] `SECURITY.md` documenta o 2FA, o fluxo de recuperação e o procedimento manual de suporte (admin desativa via SQL: `UPDATE users SET two_factor_enabled = false` + `DELETE FROM two_factors WHERE user_id = ...`) até existir painel admin
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### Frente G: CORS nas rotas internas e endurecimento da API/MCP

### US-019: Política de CORS explícita nas rotas internas
**Description:** Como operador, quero que nenhuma rota interna que consome
modelo ou IA possa ser lida ou disparada por outro site, e que isso seja
garantido por teste, não por omissão.

**Acceptance Criteria:**
- [ ] Helper `internalApiPolicy(request)` em `src/lib/internal-api.ts` que (a) detecta `Sec-Fetch-Site: cross-site` ou `Origin` presente e diferente de `BETTER_AUTH_URL` e, conforme `INTERNAL_ORIGIN_MODE` (`off|report|enforce`, default `report`), ignora, só audita, ou responde 403; (b) exporta um handler `OPTIONS` que responde 204 sem headers `Access-Control-*`
- [ ] Antes de ligar `enforce`, a consulta "authz.cross_origin por path e origin nos últimos 7 dias" em `docs/metricas-uso.md` precisa estar vazia ou só com origens conhecidas como maliciosas
- [ ] Aplicado em: `/api/explore/chat`, `/api/datasets/*`, `/api/problem-reports`, `/app/[slug]/batch` e em toda rota nova de IA (brief da Frente C); a US-007 passa a usar este helper
- [ ] Rotas `/api/v1/*`, `/api/mcp` e `/api/auth/*` ficam fora (as duas primeiras são server-to-server; a última é gerida pelo Better Auth)
- [ ] Rejeições gravam `authz.cross_origin` em `audit_logs` com `{ path, origin }` (sem body)
- [ ] Teste Vitest que percorre os route handlers em `src/app/api` e `src/app/app` e falha se algum responder `Access-Control-Allow-Origin` fora da allowlist (`/api/v1`, `/api/mcp`), e teste do helper com `Sec-Fetch-Site: same-origin`, `none`, `cross-site` e `Origin` divergente
- [ ] `SECURITY.md` ganha a seção "CORS e origem": rotas internas negam cross-origin; API/MCP não têm CORS por design (uso server-to-server)
- [ ] Typecheck/lint passam

### US-020: Chave só em header, rotação com graça e revogação
**Description:** Como integrador, quero enviar a chave no header, trocar a
chave sem derrubar minha integração e revogar na hora se ela vazar.

**Acceptance Criteria:**
- [ ] `/api/v1/predict` aceita `Authorization: Bearer <chave>`; `api_key` no body continua funcionando por compatibilidade, mas a resposta traz `Deprecation: true` e `Link: <docs>; rel="deprecation"`, e o evento `api.predict` marca `keyLocation: 'body'|'header'` para medir a migração
- [ ] MCP: `?token=` continua funcionando (compat Zapier), com o mesmo marcador `keyLocation: 'query'`; a URL com token nunca aparece em logs (scrub no logger e no `requestMeta`)
- [ ] Chaves novas usam prefixo `dos_live_` + 32 bytes aleatórios em base64url; chaves antigas seguem válidas (o hash não muda)
- [ ] Novas colunas em `deployments`: `previous_api_key_hash`, `previous_key_expires_at`, `last_used_at`, `last_used_ip`; "Regenerar chave" vira "Rotacionar chave": a antiga continua válida por 24 h e a UI mostra "Chave anterior expira em HH:MM"
- [ ] Novo botão "Revogar agora" que apaga a chave atual e a anterior, despublica não (o deployment fica publicado sem chave, com aviso "Gere uma nova chave para reativar"); evento `deployment.revoke_key`
- [ ] `last_used_at`/`last_used_ip` atualizados no máximo 1 vez por minuto por chave (evita UPDATE a cada predição) e exibidos na UI do deploy: "Último uso: há 3 min, de 200.1.2.3"
- [ ] Testes Vitest: Bearer aceito, body aceito com `Deprecation`, chave anterior válida dentro da graça e inválida depois, revogação bloqueia ambas
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-021: Proteção contra força bruta, limites de payload e higiene de resposta
**Description:** Como operador, quero que tentativas de adivinhar chaves sejam
bloqueadas e auditadas, e que a API não devolva mais do que precisa.

**Acceptance Criteria:**
- [ ] Rate limit `API_AUTH_FAIL_RATE_LIMIT = { limit: 10, windowSec: 60 }` por IP, contado apenas em respostas 401 de `/api/v1/*` e `/api/mcp`; ao estourar, 429 com `Retry-After`. Nasce em modo `report` (só audita) e passa a bloquear por env `API_AUTH_FAIL_MODE=enforce`
- [ ] O default de `API_PREDICT_MAX_ROWS` é definido a partir do maior `rows` observado em `api.predict` nos últimos 30 dias (consulta em `docs/metricas-uso.md`), arredondado para cima, para não quebrar integração existente
- [ ] Evento `api.auth_failed` com `{ channel: 'api'|'mcp', keyPrefix (8 chars ou null), ip }`; consulta "IPs com mais falhas de autenticação nas últimas 24 h" em `docs/metricas-uso.md`
- [ ] 401 idêntico (mesma mensagem e tempo de resposta equivalente) para chave inexistente, chave revogada e deployment despublicado
- [ ] Teto explícito de linhas por chamada em `/api/v1/predict` (`API_PREDICT_MAX_ROWS`, default 500) e de body (`1 MB`); acima disso 413 "Envie até N linhas por chamada ou use o lote pelo web app"
- [ ] Headers `Cache-Control: no-store` e `X-Content-Type-Options: nosniff` em todas as respostas de `/api/v1/*` e `/api/mcp`; mensagens de erro nunca incluem valores das linhas enviadas
- [ ] MCP: quando o header `Origin` estiver presente e não for `BETTER_AUTH_URL`, responder 403 (clientes MCP de desktop não enviam `Origin`; navegador não deve chamar); `tools/list` expõe apenas a tool de predição do deployment
- [ ] UI dos deploys API e MCP ganha bloco "Boas práticas de segurança" com 4 itens (variável de ambiente, nunca no front-end, rotacionar se exposta, revogar em caso de vazamento) e os exemplos de código passam a usar o header `Authorization`
- [ ] Testes Vitest: 10 falhas de 401 bloqueiam a 11ª; 413 acima do teto; `Origin` estranho no MCP dá 403
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### Frente H: sidebar do Prever só depois de escolher o tipo

### US-022: Ocultar "Campos de predição" na tela de escolha do tipo de modelo
**Description:** Como executivo, quero que a tela de escolha entre modelo
preditivo e previsão temporal mostre só a escolha, e que a lista de campos
apareça depois, para seguir um passo de cada vez.

**Acceptance Criteria:**
- [ ] Em `predict-view.tsx`, quando `view === "config"` e `kind == null` (tela de escolha, sem `?tipo=` na URL), o `<aside>` "Campos de predição" **não é renderizado**; o conteúdo principal ocupa a largura toda com os cards de tipo centralizados (`max-w-3xl mx-auto`)
- [ ] Ao escolher um tipo (`chooseKind`), a sidebar aparece com a lista de colunas; o cabeçalho da sidebar muda conforme o tipo: "Campos de predição · Marque a coluna que o modelo deve prever" (preditivo) ou "Campos da previsão · Marque a métrica a projetar e o eixo temporal" (temporal)
- [ ] "Trocar tipo de modelo" volta à tela de escolha e oculta a sidebar de novo; a seleção de alvo/ignoradas feita antes é preservada em memória (comportamento atual de estado) e reaparece ao escolher o tipo
- [ ] Em modo relatório (`view === "report"`) nada muda: a sidebar continua visível refletindo o modelo vigente
- [ ] Transição sem salto de layout perceptível: a largura da sidebar (`w-80`) entra com a lista já carregada (sem skeleton), e o foco vai para o campo "Buscar coluna" ao aparecer
- [ ] Voltar do navegador (remove `?tipo=`) também oculta a sidebar (o estado já vem da URL)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill: tela de escolha sem sidebar, escolher cada tipo, trocar tipo, abrir com modelo vigente em modo relatório

### Onda 0: quick wins (sem migration, sem mudança de comportamento padrão)

### US-025: Parser ignora abas vazias e escolhe a aba com dados
**Description:** Como usuário, quero que uma planilha cuja primeira aba é
capa ou está vazia seja lida pela aba que realmente tem dados, sem nenhuma
tela nova.

**Acceptance Criteria:**
- [ ] `_read_excel` lê os nomes das abas; ignora abas ocultas e abas com zero linhas não vazias; se restar exatamente **uma** aba com dados, usa ela (mesmo que não seja a primeira); se restarem várias, mantém o comportamento atual (primeira com dados) até a Frente A
- [ ] Após ler, remove colunas cujo nome começa com `Unnamed` **e** que estão 100% vazias (colunas de espaçamento do Excel)
- [ ] Se após isso a primeira linha tiver ≥ 50% de células vazias e a segunda tiver ≥ 80% preenchidas (título acima do cabeçalho, caso simples), usa a segunda linha como cabeçalho; caso contrário, comportamento atual
- [ ] Testes no worker: capa + dados, coluna vazia removida, título em uma linha, planilha simples inalterada (snapshot igual ao atual)
- [ ] Nenhuma mudança no web

### US-026: Planilha modelo estática e texto de formato no upload
**Description:** Como executivo, quero baixar um exemplo de planilha e saber
o formato esperado antes de subir a minha, mesmo sem descrever o problema.

**Acceptance Criteria:**
- [ ] Adicionar `exceljs` ao web; rota `GET /api/templates/planilha-modelo?format=csv|xlsx` (exige sessão) gera em memória, a partir de uma definição única em `src/lib/spreadsheet-template.ts`, o CSV (UTF-8 com BOM, `;`) ou o XLSX com 8 colunas genéricas de um caso de churn (id, data, categoria, números, alvo) e 10 linhas fictícias; o xlsx tem segunda aba "Instruções". A mesma lib e o mesmo gerador são reutilizados na US-011 com as colunas do brief
- [ ] No diálogo de upload de dataset, bloco fixo: "Formato esperado: primeira linha com o nome das características, uma linha por exemplo (cliente, venda, mês), uma única aba." + link "Baixar planilha modelo (.xlsx | .csv)"
- [ ] Mensagens de erro de parse (`status = error`) na lista de datasets ganham o mesmo link
- [ ] Evento `dataset.template_download` em `audit_logs` com `{ format, source: 'upload'|'error' }`
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-027: Tempo decorrido e estimativa fixa na tela de treino
**Description:** Como executivo, quero ver há quanto tempo o treino está
rodando e uma ordem de grandeza de duração, antes da estimativa real da
Frente E.

**Acceptance Criteria:**
- [ ] Em `running`: "Treinando há Xmin Ys" atualizado a cada polling (a partir de `updated_at` da transição para running ou `created_at` do job)
- [ ] Em `queued` e `running`: linha "Treinos deste tipo costumam levar entre A e B min" a partir de uma tabela fixa por `problemType` em `src/lib/training-eta.ts` (mesma const que a US-014 substitui pela mediana real)
- [ ] Mantém "posição X de Y" como está até a US-015
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-028: Headers de resposta e `max_tokens` explícitos
**Description:** Como operador, quero as proteções que cabem em uma linha
aplicadas hoje.

**Acceptance Criteria:**
- [ ] `Cache-Control: no-store` em `/api/v1/*`, `/api/mcp`, `/api/explore/chat` e `/api/datasets/*`
- [ ] `max_tokens` explícito em todas as chamadas de `chatComplete`/`chatCompleteStream`, com valores documentados em `llm.ts` iguais aos efetivos hoje (sem mudar resultado)
- [ ] `stream_options: { include_usage: true }` no stream do OpenRouter e `usage` exposto no retorno (sem gravar ainda; a US-005 grava)
- [ ] Typecheck/lint passam; testes existentes do LLM fake continuam verdes

### US-029: Uso de IA visível em Configurações a partir de audit_logs
**Description:** Como usuário, quero ver quantas perguntas fiz à IA este mês
antes de existir a tabela de uso.

**Acceptance Criteria:**
- [ ] Linha "Perguntas à IA neste mês: X" no card de uso das Configurações, contando `explore.message` + `model.insight.generate` + (futuro) `project.brief.generate` do usuário no mês corrente em `audit_logs`
- [ ] Sem limite exibido enquanto `LLM_BUDGET_MODE=off`; quando `report`/`enforce`, mostra "X de Y" (US-006 só troca a fonte para `llm_usage`)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-030: `Authorization: Bearer` em `/api/v1/predict` com compat
**Description:** Como integrador, quero enviar a chave no header hoje, sem
que nada existente quebre.

**Acceptance Criteria:**
- [ ] `/api/v1/predict` aceita `Authorization: Bearer <chave>`; se ausente, lê `api_key` do body como hoje; header tem precedência
- [ ] Evento `api.predict` ganha `keyLocation: 'header'|'body'`; MCP ganha `keyLocation: 'header'|'query'`
- [ ] Exemplos de código na UI do deploy passam a usar o header; a documentação mantém o body como "compatível, será descontinuado"
- [ ] Sem `Deprecation` header ainda (entra na US-020, junto da página de docs)
- [ ] Testes Vitest: header aceito, body aceito, header inválido com body válido retorna 401 (não cai para o body)
- [ ] Typecheck/lint passam

## Functional Requirements

**Frente A: planilhas**
- FR-1: O worker deve diagnosticar layout (abas, linha do cabeçalho, orientação, grupos de abas com o mesmo esquema) de forma determinística antes de parsear, para `xlsx` e `csv`.
- FR-2: Datasets que precisam de revisão devem ficar em `needs_review` sem parse até o usuário confirmar opções; datasets simples seguem o fluxo atual sem etapa extra.
- FR-3: As opções de parse devem permitir escolher aba(s), combinar abas com o mesmo esquema (com coluna `aba_origem`), definir a linha do cabeçalho e transpor.
- FR-4: A tela de revisão deve usar linguagem de negócio ("cada linha é um exemplo, cada coluna uma característica") e preview real do arquivo.

**Frente B: IA**
- FR-5: Toda chamada de LLM deve gravar tokens e custo estimado em `llm_usage`.
- FR-6: Cada usuário deve ter um teto diário e mensal de chamadas de IA, verificado antes de qualquer chamada paga, com mensagem clara e CTA ao estourar.
- FR-7: Deve existir um disjuntor global por custo diário que desliga todas as features de IA.
- FR-8: `/api/explore/chat` deve rejeitar requisições cross-origin.
- FR-9: Perguntas fora do escopo devem ser recusadas antes de gastar sandbox e, em excesso, bloquear o Explore temporariamente com auditoria.

**Frente C: guia do problema**
- FR-10: O projeto deve armazenar uma descrição do problema (até 1000 chars) e um brief JSON gerado por LLM com tipo de problema, alvo, 6 a 12 características, mínimo de linhas e armadilhas.
- FR-11: O usuário deve poder baixar planilha modelo em CSV e XLSX gerada a partir do brief, com cabeçalho correto e exemplos fictícios.

**Frente D: leads**
- FR-12: O pedido de ambiente exclusivo deve ser gravado em `enterprise_leads`, auditado com `source` e limitado a 3 por dia por usuário; sem envio de email nesta versão.

**Frente E: ETA**
- FR-13: A estimativa deve vir da mediana histórica de `training.succeeded` por tipo e faixa de linhas, com fallbacks, considerando concorrência do worker e jobs ativos.
- FR-14: A UI deve mostrar faixa de tempo em minutos como informação principal e posição como secundária.

**Frente F: 2FA**
- FR-15: A verificação em duas etapas por app autenticador deve ser TOTP via QR code com códigos de recuperação, opcional, ativável e desativável em Configurações por contas com senha, com dispositivo confiável por 30 dias e orientação passo a passo (Google Authenticator como exemplo).
- FR-16: Todos os eventos de MFA (ativar, desativar, verificar, falhar, regenerar códigos) devem ir para `audit_logs`.
- FR-23: Contas criadas só pelo Google não recebem MFA nesta versão; a opção aparece apenas para contas com senha.

**Frente G: CORS e API/MCP**
- FR-17: Rotas internas que consomem modelo ou IA devem negar requisições cross-origin (sem headers CORS, `OPTIONS` 204 sem permissão, verificação de `Sec-Fetch-Site`/`Origin`), com teste que impede regressão.
- FR-18: `/api/v1/*` e `/api/mcp` não devem emitir headers CORS nem verificar origem de forma que quebre integrações server-to-server; o MCP só rejeita `Origin` de navegador divergente.
- FR-19: A chave da API/MCP deve ser aceita em `Authorization: Bearer`, com body/query mantidos por compatibilidade e marcados como deprecados; nunca gravada em log.
- FR-20: A chave deve ter rotação com 24 h de graça, revogação imediata, prefixo identificável e registro de último uso.
- FR-21: Falhas de autenticação na API/MCP devem ser limitadas por IP e auditadas; payload deve ter teto de linhas e bytes.

**Frente H: sidebar do Prever**
- FR-22: A sidebar "Campos de predição" só deve ser renderizada depois que o usuário escolher o tipo de modelo (ou quando há modelo vigente em modo relatório); na tela de escolha o conteúdo principal ocupa a largura toda.

**Entrega incremental**
- FR-24: Nenhuma story desta PRD pode remover coluna, tabela, rota, parâmetro ou formato de chave existente; mudanças de schema são aditivas e com default.
- FR-25: Toda proteção que bloqueia (orçamento de IA, disjuntor, origem, off-topic, força bruta) deve ter modo `report` que apenas audita, ser o default na primeira entrega e virar `enforce` por env sem deploy de código.
- FR-26: Os quick wins da Onda 0 (US-025 a US-030) não podem exigir migration nem alterar o resultado de nenhum arquivo, chamada ou tela que funciona hoje, exceto onde a story descreve a correção explicitamente.

## Non-Goals (fora de escopo)

- Junção (join) de abas com esquemas diferentes por chave; só união de abas com as mesmas colunas.
- Detecção de layout por LLM; heurísticas determinísticas nesta versão.
- Planilhas com múltiplas tabelas na mesma aba, células mescladas como dados, ou cabeçalho em duas linhas (o usuário escolhe uma linha).
- Moderação de conteúdo (toxicidade) nas funções de IA; o guardrail é de escopo e de custo.
- Painel admin de consumo de IA ou de leads; consultas SQL em `docs/metricas-uso.md` bastam.
- Integração de leads com CRM (monday.com, Zapier); só banco + email.
- Gerar dataset sintético para treinar a partir do brief; a planilha modelo tem 5 linhas ilustrativas e serve para coleta.
- MFA obrigatória, por SMS ou por email; MFA para contas só Google (confiam na 2FA do Google).
- Notificação por email dos pedidos de ambiente exclusivo (o Resend já está integrado; a story de envio fica para depois, quando existir quem os atenda).
- Passkey/WebAuthn (login sem senha); fica para uma PRD futura.
- Estimativa de tempo para a fila de predições em lote.
- Habilitar CORS na API/MCP para uso direto do navegador (a chave ficaria exposta; o canal para navegador é o Web App por slug).
- Múltiplas chaves com rótulo por deployment, escopos por chave e lista de IPs permitidos (candidatos ao ambiente exclusivo da Frente D).
- OAuth ou assinatura HMAC de requisições na API pública; Bearer com chave aleatória de 32 bytes sobre TLS é suficiente para o beta.

## Design Considerations

- Reutilizar `Card`, `Dialog`, barra de uso (`UsageRow` em Configurações) e o padrão de banner amarelo dos limites.
- Tela de revisão (US-003) deve caber em uma coluna de `max-w-3xl`; preview em tabela com `overflow-x: auto`.
- Todo texto em pt-BR e voltado a executivo: nunca "header row", "transpose", "sheet index"; usar "linha com os nomes", "virar a planilha", "aba".
- CTA da Frente D é discreto (link/outline), nunca modal automático.
- Tela `/2fa` segue o layout das telas de auth existentes (`components/auth`).

## Technical Considerations

- **Worker**: `pandas.read_excel(sheet_name=None)` carrega todas as abas de uma vez; para diagnosticar sem custo alto, ler apenas `nrows=50` por aba na fase de diagnóstico via `openpyxl` em modo `read_only`. O parse final usa as opções.
- **Status novo** `needs_review` precisa ser tratado em todos os `switch` de status no web (lista de datasets, seletor no projeto, Prepare, quota). Grep por `datasetStatusEnum` e `"ready"` antes de implementar.
- **Tokens no stream**: o OpenRouter devolve `usage` no último chunk quando `stream_options: { include_usage: true }`; confirmar que o pipeline do Explore consome o chunk final.
- **Custo**: preços por modelo mudam; manter tabela em código com data de referência e aceitar override por env JSON `LLM_PRICING_JSON`.
- **ETA**: `audit_logs.metadata->>'durationSeconds'` é texto; converter com `::numeric`. Índice existente por `action`/`created_at` deve bastar; medir a consulta com 30 dias de dados.
- **Better Auth twoFactor**: exige `password` no `enable`/`disable`; o `trustDevice` usa cookie separado assinado. Versão pinada `^1.7.1`; confirmar que a migração gerada bate com o schema esperado pelo plugin (`twoFactors` com `usePlural: true`).
- **Origem**: Next server actions já verificam `Origin` contra `Host`; a verificação da US-007 é para route handlers.
- **Dependências entre PRDs**: US-008 depende da triagem em 4 classes da PRD de guardrails do Explore; US-014 depende dos eventos `training.succeeded` já gravados (desde 2026-09-01).

## Estratégia incremental e compatibilidade

### Princípios (valem para todas as stories)

1. **Migrations só aditivas**: colunas novas são nulas ou têm default; valores
   novos de enum são adicionados, nunca renomeados; nenhuma tabela ou coluna
   existente é removida nesta PRD.
2. **Caminho padrão inalterado**: o que funciona hoje continua funcionando
   igual sem nenhuma opção ligada. Ex.: planilha simples não passa pela tela de
   revisão; `api_key` no body e `?token=` continuam válidos.
3. **Observar antes de bloquear**: toda proteção nova (orçamento de IA,
   verificação de origem, disjuntor, força bruta) nasce em **modo observação**
   (só registra em `audit_logs`/log) por um ciclo de prática e vira bloqueio
   por env, com defaults generosos.
4. **Feature flag por env** para tudo que muda comportamento visível:
   `LAYOUT_REVIEW_ENABLED`, `LLM_BUDGET_MODE=off|report|enforce`,
   `INTERNAL_ORIGIN_MODE=off|report|enforce`. Default do
   deploy = comportamento atual; ligar é decisão do operador, sem redeploy de
   código.
5. **Depreciar, não remover**: a chave no body/query ganha `Deprecation`
   header e métrica de migração; a remoção fica para uma PRD futura quando
   `keyLocation != 'header'` chegar a zero por 30 dias.
6. **Cada story é deployável sozinha** e reversível desligando a flag; nenhuma
   story exige que outra frente esteja pronta, salvo as dependências
   marcadas.
7. **Sem SMS** em nenhuma fase (custo, gateway, SIM swap). Os fatores desta
   PRD é o TOTP por app autenticador.

### Risco de quebra por story e mitigação

| Story | Muda comportamento existente? | Mitigação |
|---|---|---|
| US-001 diagnóstico de layout | Não (só calcula) | Roda antes do parse atual; se falhar, cai no parse atual e loga |
| US-002 `needs_review` + opções | Sim, para arquivos com `needsReview` | Flag `LAYOUT_REVIEW_ENABLED` (default off); enum aditivo; todo `switch` de status trata o valor novo como "processando" por padrão |
| US-003/US-004 tela de revisão | Não | Só aparece para status novo |
| US-005 `llm_usage` | Não | Tabela nova; gravação nunca lança |
| US-006 orçamento | Sim quando `enforce` | `LLM_BUDGET_MODE=report` primeiro; defaults 150/dia e 1500/mês |
| US-007 disjuntor + origem | Sim quando `enforce` | `DAILY_LLM_BUDGET_USD=0` desliga; `INTERNAL_ORIGIN_MODE=report` primeiro |
| US-008 bloqueio por off-topic | Sim | Depende da triagem; nasce em `report` |
| US-009 a US-011 brief | Não | Campos novos nulos; card só aparece sem dataset |
| US-012/US-013 leads | Não | Tabela nova; CTA discreto |
| US-014/US-015 ETA | Não | Substitui texto; sem estimativa mostra o de hoje |
| US-016 a US-018 TOTP | Não para quem não ativa | Plugin só muda o fluxo de quem ativou; `/2fa` rota nova |
| US-019 CORS interno | Sim quando `enforce` | `INTERNAL_ORIGIN_MODE=report` primeiro; API/MCP fora |
| US-020 chave em header | Não | Body/query mantidos; `Deprecation` só informa |
| US-021 força bruta/payload | Sim para chamadas acima do teto | Teto de linhas em env com default acima do maior uso observado em `api.predict.rows` |
| US-022 sidebar | Não (só na tela de escolha) | Estado já vem da URL |
| US-025 a US-030 quick wins | Não | Ver cada story |

### Ondas de entrega

Escopo desta rodada: **as cinco ondas, em sequência**, cada onda deployável
antes da seguinte.

**Onda 0: quick wins (1 a 2 dias, zero migration).** US-022 sidebar,
US-025 abas vazias e coluna vazia no parser, US-026 planilha modelo gerada e
texto de formato no upload, US-027 tempo decorrido no treino, US-028 headers e
`max_tokens`, US-029 uso de IA a partir de `audit_logs`, US-030 chave Bearer
com compat.

**Onda 1: observar e proteger (1 semana).** US-005 medição, US-006 e US-007
em `report`, US-019 em `report`, US-021 auditoria de 401 em `report`.
Ao fim da onda, ler `docs/metricas-uso.md` e decidir os defaults de
`enforce`.

**Onda 2: experiência do executivo (2 a 3 semanas).** US-014/US-015 ETA
real, US-001 a US-004 planilhas (flag ligada primeiro para um grupo de
teste), US-009 a US-011 brief, US-012/US-013 leads.

**Onda 3: segurança de conta e API (2 semanas, paralelizável).** US-016 a
US-018 MFA por app autenticador, US-020 rotação com graça, US-021 `enforce`.

**Onda 4: ligar os bloqueios.** `LLM_BUDGET_MODE=enforce`,
`INTERNAL_ORIGIN_MODE=enforce`, US-008 em `enforce`, com os defaults
calibrados na Onda 1.

## Success Metrics

- Taxa de datasets que terminam em `error` ou com colunas `Unnamed` cai a menos de 5% dos uploads Excel (hoje sem medição; medir via `dataset.upload` + `dataset.layout_reviewed`).
- ≥ 80% dos datasets que entram em `needs_review` chegam a `ready` na mesma sessão.
- Gasto diário no OpenRouter nunca ultrapassa `DAILY_LLM_BUDGET_USD`; nenhum usuário acima do teto mensal.
- ≥ 30% dos projetos criados sem dataset geram brief; ≥ 50% desses baixam a planilha modelo.
- Pelo menos 1 lead por turma de prática registrado em `enterprise_leads`.
- Estimativa da fila dentro da faixa exibida em ≥ 70% dos treinos (comparar `totalSeconds` estimado no enfileiramento com `durationSeconds` real; gravar a estimativa em `training.start.metadata.etaSeconds`).
- ≥ 10% das contas com senha ativam a MFA nos primeiros 60 dias; ≥ 70% de quem inicia o fluxo do QR code conclui; zero chamados de bloqueio sem código de recuperação.

## Open Questions

1. **Combinação de abas com colunas parecidas** (ex.: "Receita" numa aba e "Receita (R$)" em outra): tratar como esquemas diferentes (mais seguro) ou oferecer "combinar mesmo assim" mapeando por posição? Assumido: diferentes, sem opção de forçar.
2. **Recuperação de conta sem códigos**: procedimento manual via SQL pelo admin é aceitável no beta, ou precisa de fluxo por email verificado?
3. **ETA em `running`**: usar `progress` (0 a 100) reportado pelo worker para refinar "restam X min", ou só a mediana menos o decorrido? Assumido: mediana menos decorrido, mais previsível.
4. **Duração das ondas de observação**: um ciclo de prática (1 semana) basta para calibrar `enforce` do orçamento de IA e da origem, ou queremos 2 turmas?

Decididas em 2026-09-02: escopo = as cinco ondas; XLSX com `exceljs` no
web; tetos de IA 150/dia e 1.500/mês; contas só Google sem MFA;
leads apenas gravados no banco, sem email.
