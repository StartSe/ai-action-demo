# Proposta: Predictive Harness

Análise de dados por conversa em que um modelo de linguagem pensa e escreve, e o
**Jev** (System One model da TypeSafe, disponível no OpenRouter) toma as decisões
rápidas e tipadas do caminho: o que a pessoa quer, se precisa rodar código, se o
código é seguro, se a resposta bate com os números, qual gráfico cabe, quando
chamar um humano. Referência conceitual:
[Building a harness with Jev (LangChain)](https://www.langchain.com/blog/building-a-harness-with-jev).

Status: a rodada 1 (v0.1.0) e a rodada 2 (v0.2.0) estão publicadas em 21/09/2026.
A §11 define o pivô do produto para **agente de FP&A**, com o plano de UI e UX; a
§11.8 registra a execução da rodada 2, concluída. A próxima é a rodada 3
(§11.6): cenários salvos e comparação, plano contra realizado, exportar, MCP e
formulário público.

## 1. Por que "harness" e não "mais um chat com dados"

A suíte já tem dois apps de dados: o **Analista Financeiro** (`financas-ia`, lê um
CSV e responde perguntas com uma única chamada de LLM) e o **AutoML**
(`automl-pocket`, treina modelos sem IA generativa). O que falta é o meio: uma
conversa contínua sobre dados onde a IA **executa** análises (código), busca
contexto externo e prevê, e onde cada decisão do sistema é explicável e barata.

O laço de um agente de dados tem dezenas de micro-decisões por turno: "isso é
pergunta sobre os dados ou papo?", "precisa de código?", "esse código só lê o
arquivo ou grava/acessa rede?", "a resposta cita números que existem na saída?",
"vale um gráfico? de que tipo?", "estou confiante ou pergunto?". Hoje cada uma
custa uma chamada de LLM (segundos, centavos, JSON para validar). O Jev responde
todas de uma vez, em 70 a 500 ms, com probabilidade e confiança, por
US$ 0,042 por milhão de tokens de entrada e saída gratuita. É o que o artigo da
LangChain chama de harness: o LLM raciocina e gera; o Jev decide.

O que o Jev **é**: recebe um `state` (texto ou JSON) e um mapa de perguntas
tipadas e devolve valores tipados com probabilidades. Três primitivas:

| Tipo | Pergunta | Resposta |
|---|---|---|
| `choice` | escolher uma opção entre `criteria: { chave: descrição }` | `choice`, `probabilities`, `confidence` |
| `score` | posicionar em níveis ordenados `criteria: [nível 0, nível 1, ...]` | `score` (contínuo), `probabilities`, `confidence` |
| `noul` | "esta afirmação é verdadeira?" | `noul` (probabilidade de sim) |

O que o Jev **não é**: não gera texto, não faz contas, não escreve código.
Por isso a proposta exige os dois provedores: **ChatGPT** (conversa, código,
busca, imagem) **e OpenRouter** (Jev; e modelos de chat alternativos).

Endpoint no OpenRouter: `POST https://openrouter.ai/api/v1/systemone` com
`Authorization: Bearer <OPENROUTER_API_KEY>`, corpo
`{ model: "typesafe/jev-1.13", state, questions }`
([documentação](https://openrouter.ai/docs/guides/community/typesafe-sdk),
[modelo](https://openrouter.ai/typesafe/jev-1.13)). Está em **beta** no
OpenRouter; janela de 32 mil tokens para estado mais a maior pergunta. Uma fonte
de terceiros cita um caminho alternativo `/api/alpha/decisions`: confirmar o
caminho vigente na primeira rodada, com o teste "Testar decisão" em Configurações.

## 2. O que a pessoa vê

App **independente** da suíte (`independente: true`, `padrao: "proprio"`, como
`build-agentflows`, `daily-second-brain` e `mapify`): telas próprias, infra
compartilhada (conta, sessão, `lib/store.ts` cifrado, `/api/health`,
`/api/status`, `/mcp`, `proxy.ts`). Interface em português, sentence case, sem
jargão na tela.

Uma tela de trabalho com três colunas, mais Configurações:

1. **Dados** (esquerda). Planilhas enviadas (CSV, XLSX, JSON; até 20 MB) e o
   perfil de cada uma: linhas, período, colunas com tipo semântico (data,
   moeda, categoria, identificador, percentual, texto livre), colunas que
   servem como alvo de previsão, qualidade (nulos, duplicados, datas fora de
   ordem) e aviso de dado pessoal. O perfil é calculado localmente (estatística)
   e **classificado pelo Jev** em uma única chamada com uma pergunta por coluna
   (fan-out especulativo), sem gastar LLM.
2. **Conversa** (centro). Balões com cartões tipados: texto, tabela, gráfico
   (SVG desenhado a partir do dado, nunca imagem gerada), código recolhido
   ("Ver como foi calculado"), fontes da web quando houve busca, e o cartão de
   **aprovação em linha** quando o harness barra algo. Cada resposta traz até
   três "Próximas perguntas" ranqueadas pelo Jev. Anexos de imagem (foto de um
   gráfico de outro sistema, print de uma planilha) entram como contexto.
3. **Harness** (direita, recolhível). A linha do tempo das decisões do turno:
   intenção detectada, modelo escolhido, risco do código, verificação da
   resposta, gráfico escolhido, cada uma com probabilidade e confiança, o
   tempo gasto e o custo. É o diferencial de produto: o executivo vê **por que**
   o sistema fez o que fez, e pode dizer "não era isso" para corrigir a
   intenção sem reescrever a pergunta.

Modo demonstração (sem nenhuma chave): planilha de exemplo (vendas por
região e canal, 24 meses), três conversas roteirizadas com decisões do Jev
gravadas e marcadas como "exemplo", e o botão "Preencher com um exemplo".
`/?exemplo=1` abre a conversa de exemplo.

## 3. Conexões (mesmo padrão do `build-agentflows`)

Tela **Configurações** com os mesmos cartões e a mesma mecânica de
`components/Connections.tsx`, `lib/conexoes.ts` e `app/api/conexoes/*`:
chaves só de uma lista conhecida (`CHAVES_LIVRES`), gravadas cifradas em
SQLite, mascaradas ao voltar para o navegador, variável de ambiente com
prioridade sobre o banco.

| Conexão | Como conecta | Para quê | Obrigatória |
|---|---|---|---|
| **ChatGPT** | Código de dispositivo pelo Codex App Server oficial (`lib/chatgpt.ts` copiado do `build-agentflows`, `@openai/codex` fixado). Cartão mostra conta, plano e limites de uso (`account/rateLimits/read`, `components/ChatGPTUsage.tsx`). | Conversa, geração de código, busca na web, leitura de imagens, geração de imagem. | Sim |
| **OpenRouter** | Um clique (OAuth PKCE, `app/api/conexoes/openrouter/*`) ou chave colada. Dentro do cartão, a seção **"Decisões rápidas (Jev)"** com o botão **Testar decisão**, que faz uma chamada real com um estado de exemplo e mostra a resposta tipada e a latência. | Jev em todas as decisões do harness; modelos de chat alternativos, escolhidos com o prefixo `openrouter:` como no `build-agentflows`. | Sim |
| **E2B** (opcional) | Chave em Configurações, reaproveitando o cartão de credencial de `lib/tool-services.ts`. | Executar o código gerado em sandbox remoto isolado quando o dono da instalação preferir não executar no próprio contêiner. | Não |

Regras herdadas do `build-agentflows`: nunca há fallback silencioso entre
provedores; o modelo de conversa é escolhido em Configurações (padrão
"Automático · ChatGPT"); simulação só por escolha explícita. Regra nova: **sem
OpenRouter conectado, o harness não roda**. O app não degrada para "decidir com
o LLM": ele mostra o estado "Conecte o OpenRouter para ligar o harness" e libera
só a conversa simples, para deixar claro o que o Jev acrescenta.

Arquivos: `lib/chatgpt.ts` (copiado), `lib/openrouter.ts` (copiado; laço
manual de `tool_calls`), `lib/jev.ts` (novo: `decidir(state, questions)`,
tipos das três primitivas, `confianca` mínima por decisão, registro de cada
chamada em `harness_decisoes`), `lib/conexoes.ts`, `components/Connections.tsx`,
`components/ChatGPTConnection.tsx`, `components/ModelPicker.tsx`,
`app/api/conexoes/*`, `app/api/chatgpt/*`.

## 4. O laço do harness, turno a turno

Uma mensagem da pessoa percorre seis estações. Nas quatro marcadas com Jev, o
estado enviado é um JSON compacto: resumo do perfil dos dados (nunca as linhas),
últimas mensagens, e o artefato da estação (código, saída, rascunho).

```
mensagem
  │
  ▼
[1] Triagem ............ Jev, uma chamada, perguntas em paralelo
  │   intencao        choice  pergunta_dados | previsao | grafico | limpeza | conceito | conversa | fora_do_escopo
  │   respondivel     noul    as colunas disponíveis cobrem a pergunta?
  │   precisa_codigo  noul    exige cálculo, agrupamento, série temporal?
  │   precisa_web     noul    pede contexto externo (inflação, câmbio, benchmark)?
  │   ambiguidade     score   clara | falta um detalhe | precisa perguntar
  │   complexidade    score   consulta simples | análise composta | previsão/modelagem
  │   dado_sensivel   noul    a pergunta pede dado pessoal identificável?
  ▼
[2] Roteamento ......... código
  │   complexidade baixa  → modelo rápido; alta → modelo forte (padrão ModelRouter do artigo)
  │   ambiguidade alta    → o LLM pergunta uma coisa só e para
  │   fora_do_escopo      → resposta curta sem tocar nos dados
  │   precisa_web         → habilita busca só neste turno
  ▼
[3] Geração ............ LLM (ChatGPT ou openrouter:<modelo>)
  │   plano em uma frase + código Python (pandas/statsmodels) ou consulta ao perfil
  ▼
[4] Portão de risco .... Jev sobre o código (padrão AutoMode do artigo)
  │   risco           score   só lê o arquivo | grava no espaço de trabalho | acessa rede | destrutivo
  │   usa_so_dataset  noul    referencia apenas os arquivos anexados?
  │   → baixo: executa; médio: cartão "Aprovar execução" na conversa; alto: bloqueia e explica
  ▼
[5] Execução ........... sandbox (ver §5) com tempo e memória limitados; saída, tabelas e figura
  ▼
[6] Verificação ........ Jev sobre {pergunta, saída do código, rascunho da resposta}
      responde         noul    o rascunho responde o que foi perguntado?
      numeros_batem    noul    todo número do rascunho aparece na saída do código?
      grafico          choice  nenhum | barras | linhas | dispersao | tabela
      incerteza        score   (só para previsão) baixa | média | alta → rótulo obrigatório na resposta
      escalar          noul    a decisão de negócio pede validação humana?
      → numeros_batem baixo: o LLM reescreve citando só a saída; segunda falha: mostra a saída bruta
```

Depois da resposta, o LLM propõe cinco perguntas seguintes e o Jev **ranqueia**
(score de relevância para o contexto), e só as três melhores aparecem: padrão
de pontuação composta, uma chamada.

**Confiança como segundo eixo.** Toda decisão tem um mínimo (`confidence`
para choice/score, distância de 0,5 para noul). Abaixo dele, o harness não
adivinha: cai para a opção conservadora (pedir aprovação, perguntar, não
desenhar gráfico) e registra "decisão com baixa confiança" na coluna Harness.
Nenhuma decisão do Jev gera conteúdo; o Jev só escolhe entre opções que o
código já sabe tratar.

**Custo e latência estimados por turno.** Quatro chamadas ao Jev com estado
de 2 a 4 mil tokens: cerca de 12 mil tokens, US$ 0,0005, e 1 a 2 s somados,
contra 4 chamadas extras de LLM que hoje custariam 20 a 40 s e ordens de
grandeza mais. O painel Harness mostra os dois números.

## 5. Código, busca e imagem pelo ChatGPT

O `build-agentflows` desliga shell, busca e arquivos no Codex de propósito.
Aqui eles são o produto, então a configuração do `thread/start` muda:

- **Interpretador de código.** `sandboxPolicy: workspaceWrite` limitado a
  `DATA_DIR/espacos/<conversa>/`, com cópia do dataset, sem rede
  (`networkAccess: false`), `features.shell_tool` ligado, tempo máximo de 60 s
  por execução. O comando só é aceito depois do portão de risco (§4, estação 4),
  que o Jev avalia **antes** de o Codex executar: o harness intercepta o pedido
  de execução (`command/exec` / aprovação do item) e responde permitir ou negar.
  A imagem do app precisa de Python com pandas, numpy, statsmodels e matplotlib
  (o `automl-pocket` já abriu o precedente de Python na suíte). Risco a validar
  na rodada 1: o sandbox Linux do Codex (Landlock e seccomp) dentro de um
  contêiner no Render; se não funcionar, a política vira `externalSandbox` e o
  app executa com o seu próprio runner (subprocesso com limites de tempo,
  memória e sem variáveis de ambiente) ou com o E2B quando conectado.
- **Busca na web.** `web_search: "live"` habilitado só nos turnos em que a
  triagem marcou `precisa_web`. Fontes viram cartão "De onde veio" na resposta.
  Uso típico: trazer inflação, câmbio, feriados ou benchmark de mercado para
  contextualizar a série da planilha.
- **Leitura de imagem.** Anexo `{ type: "image" }` no `turn/start`, como já
  faz o `build-agentflows` (com validação de capacidade do modelo).
- **Geração de imagem.** Usada para uma coisa só: transformar um resultado em
  peça de apresentação ("Gerar uma versão para o slide"). Gráficos analíticos
  continuam sendo SVG determinístico a partir do dado, porque imagem gerada não
  pode inventar barras. A disponibilidade da geração de imagem via App Server
  (ferramenta `app/list` / skill de imagem do Codex) precisa ser confirmada na
  rodada 3; alternativa: modelo de imagem do OpenRouter
  (`modalities: ["image"]`), o que mantém os dois provedores obrigatórios.

Com um modelo `openrouter:<...>` no lugar do ChatGPT, o mesmo laço roda pelo
`runOpenRouter` com `tool_calls`: a ferramenta `executar_python` chama o runner
local ou o E2B, `buscar_na_web` exige um provedor de busca do catálogo de
ferramentas do `build-agentflows` (Tavily, Exa, Brave...). O harness (Jev) é o
mesmo nos dois caminhos.

## 6. Previsão

"Predictive" em dois sentidos:

- **Previsão sobre os dados.** Intenção `previsao` gera código com
  `statsmodels` (ETS/ARIMA sazonal) ou regressão simples, sempre com intervalo
  e horizonte explícitos; a estação 6 obriga o rótulo de incerteza. Se a série
  for curta ou irregular (`respondivel` baixo), o harness diz isso em vez de
  prever. Para modelos treinados de verdade, a resposta aponta para o AutoML
  da suíte (link, e no futuro cliente MCP dele).
- **Previsão sobre a conversa.** O harness antecipa: perguntas seguintes
  ranqueadas, aviso antes de rodar ("esse cálculo vai demorar; a planilha tem
  400 mil linhas") e detecção de perguntas que a planilha não responde antes de
  gastar LLM.

## 7. Persistência, MCP e formulários

- SQLite em `DATA_DIR/app.sqlite` (`lib/store.ts` da suíte): `datasets`,
  `conversas`, `mensagens` (cartões em JSON), `execucoes` (código, saída,
  decisão de risco), `harness_decisoes` (tipo, pergunta, resposta, confiança,
  latência, custo). Arquivos em `DATA_DIR/datasets` e espaços de trabalho em
  `DATA_DIR/espacos`. Disco persistente de 1 GB no Render, plano `starter`.
- `POST /mcp` (`lib/ferramentas.ts`): `listar_planilhas`, `perguntar`
  (executa um turno completo do harness e devolve a resposta com as decisões),
  `prever`, `perfil_da_planilha`. Mesmo código de acesso do cartão "Usar dentro
  do seu assistente".
- Formulário público `/f/<token>` para a equipe enviar planilhas sem entrar no
  app (campo `arquivo`), como no AutoML.

## 8. Rodadas

Cada rodada termina com `npm test`, `npm run lint`, `npm run build`,
`scripts/verificar-padrao.sh predictive-harness`,
`scripts/verificar-jargao.mjs predictive-harness` e um commit próprio.

1. **Base e conexões.** Copiar a infraestrutura do `build-agentflows`
   (conta, store, Configurações com ChatGPT e OpenRouter, ModelPicker).
   `lib/jev.ts` com as três primitivas, testes de contrato sem crédito e o
   botão "Testar decisão". Upload de planilha, perfil local e classificação de
   colunas pelo Jev. Modo demonstração. Confirmar caminho do endpoint e
   comportamento do Jev com instruções e critérios em português (medir
   calibração em 30 casos rotulados).
2. **Laço do harness.** Estações 1 a 6 com o interpretador de código pelo
   Codex, portão de risco com aprovação em linha, verificação da resposta,
   gráficos SVG e a coluna Harness. Validar o sandbox no contêiner.
3. **Web, imagem, previsão e integrações.** Busca por turno, geração de
   imagem para slide, previsões com incerteza, perguntas seguintes ranqueadas,
   MCP, formulário público, exportar (CSV, PNG, Markdown).
4. **Avaliação e acabamento.** Conjunto de avaliação das decisões do harness
   (casos rotulados por estação; precisão e calibração por pergunta), painel de
   custo e latência agregado por conversa, README no formato da suíte,
   capturas, `catalogo.json` (porta 3022, `capacidades: ["artefato", "mcp",
   "formulario"]`, `versao`), `docker-compose.yml`, `gerar-deploy.mjs`.

## 9. Recorte

Fica de fora nesta versão: várias contas, RAG sobre documentos, painéis de BI
salvos, agendamento de análises (as rotinas da suíte continuam disponíveis
para uma rodada futura), treino de modelos (é o AutoML), escrita de volta em
bancos de dados ou planilhas de origem, e qualquer decisão do Jev que não seja
uma escolha entre opções fechadas.

## 10. Riscos e perguntas abertas

- **Jev em beta no OpenRouter**: caminho do endpoint e formato podem mudar;
  isolar tudo em `lib/jev.ts` e cobrir com testes de contrato.
- **Português**: a documentação do Jev é em inglês; validar na rodada 1 se
  instruções e critérios em português mantêm calibração. Se não, os critérios
  ficam em inglês no código e a tela continua em português.
- **Sandbox do Codex em contêiner**: pode exigir `externalSandbox` e um runner
  próprio; decidir na rodada 2 com o teste real no Render.
- **Geração de imagem pelo App Server**: confirmar; senão, OpenRouter.
- **Tamanho da imagem Docker** com Python científico em Alpine: medir; se
  passar de 1 GB, trocar a base por `node:22-bookworm-slim`.
- **Dado pessoal**: a triagem marca `dado_sensivel`, mas o valor do dado nunca
  vai ao LLM de qualquer forma: só perfil, agregados e a saída do código. Falta
  decidir se colunas classificadas como identificador são mascaradas também na
  saída do código antes de virar resposta.

## 11. Pivô: agente de FP&A (proposta de 21/09/2026)

### 11.1 Avaliação: sim, e é o encaixe certo

"Conversar com uma planilha" é uma capacidade; **FP&A** (planejamento e análise
financeira) é um trabalho com dono, ritual e pergunta recorrente: "se eu fizer X,
o que acontece com a margem?". A arquitetura da rodada 1 já é a de um agente de
FP&A, só faltava dizer isso na tela:

- O harness existe porque número em FP&A precisa ser **auditável**. Um CFO não
  aceita "o modelo estimou": aceita "ticket médio histórico de R$ 4.900 × 28
  alunos − custo fixo da turma de R$ 38 mil". A verificação do Jev (números batem
  com a base) e a linha "Base: ..." viram o coração do produto, não um extra.
- "Predictive" ganha sentido concreto: **cenário e projeção**, não "IA que
  adivinha". A pergunta do exemplo, "se abrir uma nova turma do produto A, qual
  a contribuição para a margem final?", é um cenário sobre drivers, e drivers
  são exatamente o que o Jev classifica bem (escolhas fechadas, rápidas).
- Ele complementa os dois apps de dados da suíte sem se sobrepor: o
  `financas-ia` olha para trás (despesas do mês), o `automl-pocket` treina
  modelos; o agente de FP&A olha para frente com premissas explícitas.
- Para a StartSe o domínio é natural: produtos são cursos e imersões, a unidade
  econômica é a **turma** (cohort), e as perguntas do dia a dia são ocupação,
  ticket, CAC por aluno, custo fixo por turma e margem de contribuição.

A condição para funcionar: **cenário não sai de uma planilha de vendas sozinha**.
Precisa de um modelo de drivers (premissas). Então a mudança de UX não é
cosmética: sai o par "planilha + pergunta" e entra o trio **base histórica +
premissas + cenário**. A IA nunca faz a conta; um motor determinístico faz, com
as premissas visíveis e editáveis, e a IA traduz a pergunta em cenário e explica
o resultado. É isso que torna o agente "estratégico" sem virar "chutador".

### 11.2 O que muda no laço do harness

O laço da §4 continua; três estações ganham conteúdo de FP&A.

```
mensagem
  ▼
[1] Triagem ............ Jev, uma chamada
      tipo_pergunta   choice  descritiva | diagnostica | cenario | previsao | meta_reversa | risco | conceito | fora
      drivers_*       noul    fan-out: envolve ticket? alunos por turma? custo fixo? custo variável? marketing/CAC?
                              desconto? cancelamento? (uma pergunta por driver, todas de uma vez)
      horizonte       choice  mes | trimestre | semestre | ano
      premissas_ok    noul    a base + premissas salvas bastam para calcular?
      impacto         score   decisão de baixo | médio | alto impacto (alto → pede validação humana)
  ▼
[2] Roteamento ......... código
      descritiva/diagnostica → agregados da base (como hoje)
      cenario/meta_reversa   → LLM traduz a pergunta em uma ESPECIFICAÇÃO DE CENÁRIO (JSON fechado:
                               produto, turmas novas, alunos por turma, ticket, desconto, custo fixo,
                               custo variável, CAC, horizonte); campos vazios viram "premissas faltantes"
      premissas_ok baixo     → cartão "Faltam N premissas" em vez de resposta
  ▼
[3] Motor de FP&A ...... código determinístico (lib/fpa.ts), nunca o LLM
      margem de contribuição por turma, ponto de equilíbrio em alunos, contribuição do cenário,
      impacto na margem final do período, sensibilidade ±10% nos 3 drivers mais sensíveis,
      meta reversa (quanto de CAC cabe para manter X% de margem)
  ▼
[4] Narrativa .......... LLM escreve a leitura executiva a partir do resultado do motor (só esses números)
  ▼
[5] Verificação ........ Jev: números batem com o motor? premissa implícita não declarada? recomendação
                         pede validação? qual visual (cascata | comparação | sensibilidade | tabela)?
```

O LLM passa a ter duas tarefas fechadas (traduzir pergunta → especificação; e
narrar resultado → texto) e nenhuma conta. Se a especificação não valida, o
agente pergunta, em vez de assumir em silêncio.

### 11.3 Modelo de dados de FP&A

Entidades mínimas, mapeadas a partir das planilhas que a empresa já tem:

| Entidade | De onde vem | Exemplo StartSe |
|---|---|---|
| Produto | coluna categórica | Imersão A, Programa B |
| Turma (cohort) | coluna de turma/edição ou data de início | Turma 12, mar/2026 |
| Matrícula | linha de venda: data, produto, turma, ticket, desconto, canal | uma venda |
| Custo fixo por turma | planilha de custos ou premissa | sala, professor, produção |
| Custo variável por aluno | planilha de custos ou premissa | material, plataforma, comissão |
| Marketing | gasto por período/produto/canal, ou premissa de CAC | mídia, eventos |
| Meta / plano | planilha de orçamento (rodada 3) | meta de receita do trimestre |

O **mapeamento de papéis** reaproveita a classificação de colunas pelo Jev
(§2): além do tipo semântico, cada coluna recebe um papel de FP&A (`receita`,
`desconto`, `custo_fixo`, `custo_variavel`, `marketing`, `produto`, `turma`,
`alunos`, `data`, `canal`, `nenhum`), uma pergunta `choice` por coluna, na mesma
chamada. A pessoa confirma o mapeamento em um passo, e o motor passa a saber
onde estão receita e custo.

**Premissas** têm sempre três origens possíveis, mostradas na tela: *da base*
(calculada do histórico, ex.: média de 28 alunos por turma), *informada* (a
pessoa digitou) e *sugerida* (o LLM propôs a partir do contexto, com o Jev
pontuando plausibilidade; nunca entra num cálculo sem confirmação). Premissas são
salvas por produto e viram o "livro de premissas" da empresa.

### 11.4 UI: o que muda na tela

A estrutura de três colunas fica; o conteúdo muda de "dados / conversa / harness"
para **base e premissas / conversa / como cheguei aqui**.

```
┌ Predictive Harness · Agente de FP&A ──────────── [Base] [Como cheguei aqui] [Configurações] ┐
│ BASE E PREMISSAS      │ CONVERSA                              │ COMO CHEGUEI AQUI          │
│                       │                                       │                            │
│ Planilhas             │ Pergunta ▸ "Se abrirmos uma nova       │ Premissas usadas           │
│  ▸ vendas_2025 (base) │   turma do produto A em março, qual a  │  alunos/turma  28  da base │
│  ▸ custos_turmas      │   contribuição para a margem do tri?"  │  ticket      4.900 da base │
│  + mapear papéis      │                                       │  custo fixo 38.000 informada│
│                       │ ┌ Cenário: nova turma do produto A ┐  │  CAC/aluno    620  sugerida│
│ Produtos e turmas     │ │ Receita         R$ 137.200         │  ─────────────────────────  │
│  Produto A  12 turmas │ │ Custo variável  R$  21.000         │ Fórmula                    │
│  Produto B   7 turmas │ │ Marketing       R$  17.360         │  contribuição = receita −   │
│                       │ │ Custo fixo      R$  38.000         │  var − mkt − fixo           │
│ Premissas do Produto A│ │ Contribuição    R$  60.840  44,3%  │  ─────────────────────────  │
│  alunos/turma   28 ✎  │ │ Margem do tri  31,2% → 33,0%       │ Decisões do harness        │
│  ticket      4.900 ✎  │ └ Base: matrículas 2024-25, custos ─┘ │  tipo: cenário      96%    │
│  desconto      8% ✎   │ ┌ Sensibilidade ──────────────────┐   │  drivers: alunos, ticket,  │
│  custo fixo 38.000 ✎  │ │ alunos −20% ....... R$ 33.400   │   │    CAC, fixo                │
│  custo var.    750 ✎  │ │ ticket −10% ....... R$ 47.100   │   │  premissas: faltou CAC     │
│  CAC/aluno     620 ✎  │ │ CAC +30% .......... R$ 55.600   │   │  impacto: médio → ok       │
│                       │ └──────────────────────────────────┘   │  números batem: sim 97%    │
│ Cenários salvos       │ Leitura: abrir a turma adiciona 1,8 p.p.│  visual: cascata           │
│  ▸ Turma extra mar/26 │ à margem do trimestre; o risco está na │                            │
│  ▸ Mkt +30%           │ ocupação: abaixo de 19 alunos a turma  │ [Ajustar premissa e        │
│                       │ não se paga.                            │  recalcular]               │
│                       │ [Salvar cenário] [Comparar] [Exportar]  │                            │
│                       │ Próximas: "E se forem duas turmas?"     │                            │
│                       │ "Quanto de mkt cabe mantendo 33%?"      │                            │
│                       │ ┌ Pergunte ao seu analista de FP&A... ┐ │                            │
└───────────────────────┴───────────────────────────────────────┴────────────────────────────┘
```

Mudanças concretas, por área:

**Coluna esquerda: Base e premissas**
- "Dados" vira "Base e premissas". Planilhas continuam no topo, agora com o
  papel de cada uma (matrículas, custos, marketing) e o botão "Mapear papéis".
- Bloco **Produtos e turmas** detectado a partir do mapeamento (contagem de
  turmas, alunos médios, ticket médio, margem histórica por produto).
- Bloco **Premissas do produto selecionado**: lista editável em linha (lápis),
  cada uma com a origem (da base / informada / sugerida) e a data. Um botão
  "Recalcular com a base" restaura o histórico.
- Bloco **Cenários salvos**: nome, data, um número-resumo (contribuição), e
  "Comparar" para pôr dois lado a lado no centro.

**Coluna central: Conversa**
- Cartões tipados por resposta, além do texto: **Cenário** (base vs cenário,
  linha a linha até a contribuição e o efeito na margem do período),
  **Sensibilidade** (três barras: o que mais move o resultado), **Ponto de
  equilíbrio** (alunos mínimos), **Comparação de cenários** (duas colunas),
  **Premissas faltantes** (formulário curto pré-preenchido com o histórico e o
  botão "Usar histórico"), **Recomendação** com o selo "pede validação" quando
  o Jev marcar impacto alto. Gráficos são SVG determinístico do motor
  (cascata para cenário, barras para sensibilidade), nunca imagem gerada.
- Perguntas sugeridas passam a ser **estratégicas e por categoria**, com base no
  mapeamento: *Diagnóstico* ("Qual produto tem a melhor margem de contribuição
  por turma?"), *Cenário* ("Se abrirmos uma nova turma do produto A em março,
  qual a contribuição para a margem do trimestre?"), *Meta reversa* ("Quanto
  posso gastar em marketing por aluno e manter 30% de margem?"), *Risco*
  ("Com quantos alunos a turma deixa de se pagar?").
- Estado vazio: "Comece com uma pergunta estratégica" + as quatro categorias;
  sem planilha de custos, o agente avisa que cenários usarão premissas
  informadas e oferece o modelo de planilha de custos para download.
- Toda resposta de cenário traz "Salvar cenário", "Comparar" e "Exportar"
  (Markdown e CSV na rodada 2; PDF e XLSX depois).

**Coluna direita: Como cheguei aqui** (o Harness, renomeado para o executivo)
- Três blocos em ordem: **Premissas usadas** (com origem; qualquer uma é
  editável ali mesmo e recalcula o cartão), **Fórmula** (a conta em uma linha,
  em português, com os números substituídos) e **Decisões do harness** (as
  decisões do Jev como hoje, com probabilidade e confiança).
- Botão **Ajustar premissa e recalcular**: muda só a premissa, roda só o motor,
  atualiza o cartão sem nova chamada de LLM (rápido e sem custo). Uma nova
  narrativa só é pedida se a pessoa clicar em "Reescrever leitura".

**Topo e copy**
- Título da tela: "Predictive Harness · Agente de FP&A". Chip de estado
  continua ("Harness ligado" / "Demonstração").
- Linguagem executiva e sem jargão: "margem de contribuição", "ponto de
  equilíbrio", "premissa", "cenário". Nada de "driver", "spec", "what-if" na
  tela. O glossário fica num "?" ao lado de cada termo, uma frase cada.
- A linha "Base: ..." de toda resposta passa a listar também as premissas com a
  origem, ex.: "Base: matrículas 2024-25 (ticket, alunos/turma); custo fixo
  informado por você em 21/09".

**Configurações**: sem mudança de estrutura. Entra um cartão "Empresa" com
moeda, início do ano fiscal e a margem-alvo padrão (usada nas metas reversas).

### 11.5 Modo demonstração de FP&A

A planilha de exemplo passa a ser de uma escola de negócios fictícia: matrículas
por produto, turma, data, ticket e desconto (24 meses), mais uma planilha de
custos por turma e uma de marketing por mês. As perguntas roteirizadas viram as
quatro categorias acima, com o cenário de "nova turma do produto A" já salvo e
uma comparação pronta. Como hoje, os números da demonstração são calculados da
própria base, nunca inventados.

### 11.6 Rodadas revisadas

2. **Agente de FP&A, primeiro corte.** Mapeamento de papéis pelo Jev (uma
   pergunta a mais por coluna), entidades Produto e Turma, livro de premissas
   por produto (três origens), motor `lib/fpa.ts` (margem de contribuição,
   ponto de equilíbrio, cenário de novas turmas, impacto na margem do período,
   sensibilidade, meta reversa de CAC e de ticket), tradução pergunta →
   especificação de cenário com validação e cartão "Faltam premissas",
   cartões Cenário, Sensibilidade e Ponto de equilíbrio em SVG, coluna "Como
   cheguei aqui" com premissas, fórmula e recálculo local, sugestões por
   categoria, demonstração de FP&A, nova copy. Testes do motor com casos
   fechados (a conta certa é a conta certa, sem IA).
3. **Planejamento.** Cenários salvos e comparação lado a lado, plano vs real
   (upload do orçamento e análise de variação por produto e mês), exportar
   Markdown, CSV e PDF, cartão Empresa em Configurações, MCP (`simular_cenario`,
   `margem_por_produto`) e formulário público para a equipe enviar planilhas.
4. **Fora do motor.** O que a §5 previa: código em sandbox para perguntas que
   o motor não cobre (o Jev decide "cabe no motor?" antes), busca na web para
   benchmarks (CAC e ticket de mercado, com fonte), previsão de ocupação com
   intervalo, XLSX e geração de imagem para o slide do comitê.

### 11.7 Riscos específicos do pivô

- **Premissa errada com cara de certeza.** Mitigação: origem sempre visível,
  sensibilidade em todo cenário, e o Jev marcando "premissa implícita não
  declarada" na verificação.
- **Custos não estão em planilha.** Muitas empresas só têm vendas. Por isso
  cenário funciona com premissas informadas desde o primeiro dia, e a planilha
  de custos é um upgrade, não um pré-requisito.
- **Tradução pergunta → especificação.** É a única etapa em que o LLM produz
  estrutura; a especificação é validada campo a campo (tipos, faixas, produto
  existente) e, se falhar, o agente pergunta. Nunca se assume em silêncio.
- **Escopo de FP&A é grande.** O corte da rodada 2 é a unidade econômica da
  turma. Fluxo de caixa, DRE completa e consolidação ficam fora até haver
  demanda.

### 11.8 Execução da rodada 2 (v0.2.0, iniciada em 21/09/2026)

Ordem de construção, cada passo com teste ou verificação própria:

1. **Motor** `lib/fpa.ts`: premissas tipadas e validadas, contribuição por
   turma, ponto de equilíbrio, cenário de novas turmas com impacto na margem do
   período, sensibilidade (variação adversa de 10% em cada premissa, ranqueada),
   meta reversa (marketing por aluno, ticket, alunos, custo fixo, desconto) e a
   fórmula em português com os números substituídos. `lib/fpa.test.ts` com casos
   fechados: a conta certa é a conta certa, sem IA.
2. **Base** `lib/base.ts`: papel de FP&A por coluna (heurística local e uma
   pergunta `choice` por coluna na mesma chamada do Jev), papel da planilha
   (matrículas, custos, marketing), produtos e turmas detectados, premissas "da
   base" com o detalhe de onde vieram, livro de premissas em SQLite (informadas
   sobrepõem a base) e o trimestre de referência para o impacto na margem.
   `lib/base.test.ts`.
3. **Demonstração** `lib/demo.ts`: escola de negócios fictícia com três
   planilhas (matrículas de 24 meses, custos por turma, marketing por mês) e
   quatro perguntas roteirizadas (diagnóstico, cenário, meta reversa, risco)
   respondidas pelo motor com os números da própria base.
4. **Laço** `lib/conversa.ts`: conversa da base (não mais de uma planilha),
   triagem de FP&A pelo Jev (tipo da pergunta, drivers em fan-out, horizonte,
   premissas bastam, impacto, dado pessoal), tradução pergunta → especificação
   fechada pelo LLM com validação campo a campo, cartão "Faltam premissas" com
   sugestões pontuadas pelo Jev, motor, narrativa só com os números do motor,
   verificação (números batem, premissa implícita, pede validação, visual) e
   recálculo local sem LLM. Rotas em `app/api/base/*`.
5. **Tela**: coluna "Base e premissas" (planilhas com papel, mapeamento de
   papéis, produtos e turmas, premissas editáveis com origem), cartões tipados
   em SVG (cascata, sensibilidade, ponto de equilíbrio, meta reversa, premissas
   faltantes) e coluna "Como cheguei aqui" (premissas usadas, fórmula,
   decisões, ajustar e recalcular). Copy executiva, sem jargão.
6. **Fechamento**: `npm test`, `npm run lint`, `npm run build`, servidor
   standalone com `curl` nas rotas, capturas de tela (desktop e celular),
   README, CHANGELOG, CLAUDE.md, `catalogo.json` e commit `feat(predictive-harness)`.

Resultado da rodada 2 (v0.2.0): os seis passos da §11.8 foram entregues. O motor
`lib/fpa.ts` e o `lib/base.ts` nasceram com teste próprio (`fpa.test.ts`,
`base.test.ts`, `conversa.test.ts`; 30 provas no total, sem gastar crédito), a
tela de três colunas virou Base e premissas / Conversa / Como cheguei aqui, e a
demonstração passou a ser a escola de negócios com quatro perguntas por
categoria. Duas decisões que fugiram do texto original: o cartão de premissas
faltantes traz a sugestão do LLM com a plausibilidade pontuada pelo Jev (em vez
de só um formulário vazio), e os gráficos rolam na horizontal no celular em vez
de encolher o texto do SVG. Continua por confirmar, como na rodada 1, o
comportamento do Jev com chave real: endpoint vigente, calibração em português e
a qualidade da tradução pergunta → especificação.
