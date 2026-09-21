# Proposta: Predictive Harness

Análise de dados por conversa em que um modelo de linguagem pensa e escreve, e o
**Jev** (System One model da TypeSafe, disponível no OpenRouter) toma as decisões
rápidas e tipadas do caminho: o que a pessoa quer, se precisa rodar código, se o
código é seguro, se a resposta bate com os números, qual gráfico cabe, quando
chamar um humano. Referência conceitual:
[Building a harness with Jev (LangChain)](https://www.langchain.com/blog/building-a-harness-with-jev).

Status: proposta, versão 0.1.0 (21/09/2026). Nada foi criado além deste arquivo; a entrada em
`catalogo.json`, o `docker-compose.yml` e a pasta do app só entram quando a
proposta for aprovada.

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
