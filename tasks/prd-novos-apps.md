# PRD: Suíte IA para Executivos, sete apps novos

Data: 14/09/2026. Escopo: sete apps novos em `ai-action-demo/` (Radar de Sinais, Bússola de IA, Simulador de Vendas, Custos de IA, Clone de Site, Prospecção no LinkedIn e Vídeos de Campanha), três mudanças transversais nos arquivos compartilhados (nascem no `pdi-time` e são replicadas) e a atualização do catálogo, do compose e do `PADRAO.md` para dezessete apps. Continua o trabalho de `tasks/prd-ui-ux-executivos.md` (81 histórias concluídas em 13/09/2026). Versão navegável: https://claude.ai/code/artifact/0e3146d9-0c5e-4668-a3bc-99fa48efd47b

## Introduction

A suíte hoje tem dez apps que compartilham a mesma fundação: uma tela, uma promessa, modo demonstração sem chave, `/setup` com cartões de integração, histórico com `/r/<id>` e `/imprimir/<id>`, servidor MCP em `/mcp`, formulários públicos em `/f/<token>` e rotinas com entrega por e-mail ou Slack. Tudo isso é copiado sem alterar do `pdi-time` e verificado por `scripts/verificar-padrao.sh`.

Esta PRD acrescenta sete apps que cobrem áreas ainda pouco atendidas (estratégia, maturidade de IA, treinamento de vendas, custo de IA, criação de páginas, prospecção no LinkedIn e vídeo de campanha) sem mudar a stack nem o padrão. Cada app nasce copiando o `pdi-time/`, herda as quatro capacidades (Artefato, MCP, Formulário, Rotina) e implementa só o que é próprio: domínio, integrações, demo e tela.

Três coisas que os apps novos precisam e a fundação ainda não tem viram mudanças transversais pequenas, feitas primeiro no `pdi-time` e replicadas nos dez apps existentes:

1. **Campos `escala` e `escolha` nos formulários públicos** (`lib/formularios.ts`), para a Bússola de IA montar questionários.
2. **Modelo com visão** (`askVision` em `lib/ai.ts`), para o Clone de Site ler uma captura de tela.
3. **Cliente MCP com autorização OAuth** (`lib/mcp-oauth.ts`), para conectar servidores MCP remotos que não aceitam código fixo (Prospect Halo e Higgsfield exigem login na conta do usuário).

### Premissas

- P1. O `PADRAO.md` continua valendo por inteiro: Next.js 16, Tailwind 4, React 19, sem biblioteca de UI, SQLite via `node:sqlite`, IA via OpenRouter, tudo em português, sem jargão na tela principal. Dependência nova só quando indispensável e pequena (hoje só `unpdf`).
- P2. Todo app funciona sem nenhuma chave, com dados de exemplo plausíveis e em português. As integrações reais são opcionais e conectadas em `/setup`.
- P3. Cada app nasce copiando `pdi-time/` inteiro e mantendo idênticos os 19 caminhos compartilhados listados em `scripts/verificar-padrao.sh`. O que é próprio fica em `lib/<dominio>.ts`, `lib/types.ts`, `lib/demo.ts`, `lib/integracoes.ts`, `lib/ferramentas.ts`, `lib/rotinas-do-app.ts`, `app/page.tsx`, `components/<Nome>.tsx` e `app/api/<nome>/route.ts`.
- P4. Toda mudança em arquivo compartilhado nasce no `pdi-time`, é verificada e replicada nos outros apps na mesma história. Depois desta PRD, `scripts/verificar-padrao.sh` compara dezessete apps.
- P5. Ferramentas externas escritas em Python (`last30days-skill`, `screenshot-to-code`, `graphify`) não entram como dependência nem como processo ao lado: a lógica útil é portada para Node dentro de `lib/`. O que se aproveita delas é o método (fontes, ordem de busca, prompt, formato do grafo), não o código.
- P6. Servidores MCP remotos com OAuth (Prospect Halo, Higgsfield) são autorizados pela pessoa no navegador, uma vez, em `/setup`. O app guarda o token e o renova sozinho. Quando o provedor também oferece chave de API server-to-server (Higgsfield), ela entra como "Opções avançadas".
- P7. Dados sensíveis: o Custos de IA nunca grava o corpo dos e-mails, só os campos extraídos da nota (fornecedor, valor, data, ferramenta). O Simulador de Vendas grava transcrições por 90 dias. Os demais apps seguem o padrão (`SENSIVEL = false`).
- P8. Verificação visual segue o `PADRAO.md`: capturas em desktop 1400x900 (vazio), desktop 1400x1500 (`?exemplo=1&captura=1`) e celular 390 px, abertas com a ferramenta Read e corrigidas até ficarem limpas. Nas histórias abaixo, "verificar no navegador" significa exatamente isso.
- P9. Ações que gastam dinheiro ou saem da empresa (enviar mensagem no LinkedIn, gerar vídeo que consome créditos, criar campanha) exigem confirmação explícita na tela e `confirmar: true` na ferramenta MCP, como já faz `operar_quadro`.

### Os sete apps

| Id | Nome | Áreas | Problema | O que a IA faz | Integrações | Porta | Acento |
|---|---|---|---|---|---|---|---|
| `radar-sinais` | Radar de Sinais | Estratégia, Inovação | Movimentos do mercado chegam tarde e dispersos | Busca o que saiu no período sobre os temas acompanhados, agrupa em sinais e mostra as conexões em um grafo | Exa ou Tavily (busca); fontes sem chave (Hacker News, Reddit, GitHub) | 3011 | `#0e7490` |
| `bussola-ia` | Bússola de IA | Estratégia, Gestão | Ninguém sabe dizer, com dados, em que estágio de IA a empresa está | A pessoa monta o questionário (ou usa o modelo), manda um link e recebe o mapa de maturidade com a leitura da IA | Só a IA | 3012 | `#b8621b` |
| `simulador-vendas` | Simulador de Vendas | Vendas | O gestor só descobre como o vendedor conduz a conversa quando o negócio já foi perdido | Vendedores treinam com um cliente simulado por voz e o gestor acompanha a evolução de cada um | ElevenLabs (agente de voz e webhook de pós-conversa) | 3013 | `#3f6212` |
| `custos-ia` | Custos de IA | Financeiro, TI | As assinaturas de IA se multiplicam e ninguém sabe quanto a empresa gasta | Lê as notas e recibos que chegam no e-mail, identifica as ferramentas de IA e compara o gasto com o planejado | Gmail ou Outlook (leitura, OAuth) | 3014 | `#7e22ce` |
| `clone-site` | Clone de Site | Marketing, Produto | Recriar uma página de referência com a cara da empresa leva dias | A partir de uma captura de tela gera a página em HTML e Tailwind, aplica a marca e publica um link | Modelo com visão (OpenRouter); serviço de captura opcional | 3015 | `#374151` |
| `prospeccao-linkedin` | Prospecção no LinkedIn | Vendas | Prospectar no LinkedIn toma horas por dia do time | Define o perfil ideal, busca leads pelo Prospect Halo, escreve a sequência de mensagens e envia só depois da aprovação | Prospect Halo (MCP com OAuth) | 3016 | `#0a66c2` |
| `videos-campanha` | Vídeos de Campanha | Marketing | Um vídeo curto por campanha custa produção e semanas | Escreve o roteiro, escolhe o efeito e gera o vídeo curto pelo Higgsfield a partir da imagem do produto | Higgsfield (MCP com OAuth; chave de API como opção avançada) | 3017 | `#be185d` |

### Princípios (os mesmos da PRD anterior, aplicados aos apps novos)

1. O número primeiro, a prosa depois: `Destaque` abre todo resultado (sinais fortes, nível de maturidade, nota da conversa, gasto do mês, custo estimado do vídeo).
2. Uma frase de `Origem` em todo resultado; `Entregar` igual em todos.
3. Cada capacidade nova é um botão, não um menu. Nada de abas de navegação.
4. Demonstração sem vergonha: o exemplo é o melhor caso do app, em português correto e completo.
5. Gráficos sem biblioteca, com uma série destacada e as demais em cinza, rótulos em px fixos, legíveis no celular.
6. O que gasta dinheiro ou fala em nome da empresa pede confirmação e mostra o custo antes.

## Goals

- G1. Sete apps novos publicados no catálogo, cada um testável em dois minutos sem chave e com prévia gerada pelo workflow.
- G2. Os sete passam em `npm run lint`, `npm run build`, `scripts/verificar-jargao.mjs` e `scripts/verificar-padrao.sh` (agora com dezessete apps).
- G3. Cada app expõe de uma a três ferramentas MCP e entrega pelo menos uma capacidade além de Artefato e MCP (Formulário ou Rotina).
- G4. Três mudanças transversais (campos de formulário, visão, OAuth em MCP) replicadas nos dez apps existentes sem regressão.
- G5. Nenhum app depende de Python, de biblioteca de grafo ou de gráfico, nem de processo auxiliar.
- G6. Toda ação paga ou externa (LinkedIn, Higgsfield) exige confirmação e mostra o custo ou o alcance antes.

## User Stories

Ordem de implementação. A fase 0 (US-001 a US-003) muda arquivos compartilhados no `pdi-time` e replica nos outros nove na mesma história. As fases 1 a 7 criam um app cada; a primeira história de cada app é o esqueleto (cópia do `pdi-time`, entrada no catálogo, tela e demo). A fase 8 fecha a suíte (documentação, verificação e capturas). Os apps que não dependem da fase 0 (Radar, Simulador, Custos) podem ser feitos antes dela se for conveniente.

### Fase 0, mudanças transversais (no `pdi-time`, replicadas nos outros nove)

### US-001: Campos `escala` e `escolha` nos formulários públicos
**Description:** As a pessoa que monta um questionário, I want perguntas de escala e de múltipla escolha so that o formulário público sirva para avaliações e não só para texto livre.

**Acceptance Criteria:**
- [ ] `lib/formularios.ts` aceita dois tipos novos de campo além de `texto | textarea | arquivo | nota | decisao`: `escala` (`{ min, max, rotuloMin, rotuloMax }`, padrão 1 a 5) e `escolha` (`{ opcoes: { valor, rotulo }[], multipla?: boolean }`)
- [ ] `components/FormularioPublico.tsx` renderiza `escala` como botões em linha (um por valor, rótulos nas pontas) e `escolha` como lista de opções (rádio ou caixas quando `multipla`); no celular, os botões da escala ocupam a largura
- [ ] `app/api/f/[token]/route.ts` valida que o valor da escala está no intervalo e que a escolha está entre as opções; devolve 400 com mensagem clara quando não está
- [ ] Os campos novos aceitam `secao?: string` para agrupar perguntas sob um subtítulo na tela pública (usado pela Bússola para separar dimensões)
- [ ] Arquivos compartilhados copiados para os outros nove apps; `scripts/verificar-padrao.sh` passa
- [ ] Lint e build passam nos dez; verificar no navegador uma tela pública do `pdi-time` com um campo de cada tipo (temporário, removido antes de encerrar)

### US-002: `askVision` e modelo com visão configurável
**Description:** As a pessoa que mantém a suíte, I want mandar uma imagem para a IA pela mesma biblioteca so that apps que leem capturas de tela não inventem outro cliente.

**Acceptance Criteria:**
- [ ] `lib/ai.ts` exporta `askVision({ system, prompt, imagem, maxTokens, temperature })`, onde `imagem` é uma data URL (`image/png` ou `image/jpeg`); monta `messages` com `content: [{ type: "text" }, { type: "image_url", image_url: { url } }]` no formato compatível com OpenAI e usa o modelo de visão
- [ ] `lib/ai.ts` exporta `visionEnabled()` (chave configurada e modelo de visão definido) e `visionModelName()`; o modelo vem de `getConfig("OPENROUTER_MODEL_VISAO")` com padrão em `MODELOS_VISAO[0]` de `lib/setup-comum.ts` (lista curta de modelos com visão disponíveis no OpenRouter, o primeiro gratuito quando houver)
- [ ] A integração `OPENROUTER` em `lib/setup-comum.ts` ganha o campo avançado `OPENROUTER_MODEL_VISAO` (`select` com `MODELOS_VISAO`, opcional, ajuda em linguagem de negócio: "Modelo usado quando o app precisa ler uma imagem")
- [ ] `GET /api/status` inclui `vision: boolean`
- [ ] Arquivos compartilhados copiados para os outros nove apps; `scripts/verificar-padrao.sh` passa
- [ ] Lint e build passam nos dez; testar via curl que `/api/status` devolve `vision` e que `/setup` mostra o campo em "Opções avançadas"

### US-003: Cliente MCP com autorização OAuth
**Description:** As a executivo, I want conectar um serviço externo que pede login (Prospect Halo, Higgsfield) clicando em "Autorizar" so that eu não precise de chave nem de configuração técnica.

**Acceptance Criteria:**
- [ ] Novo `lib/mcp-oauth.ts` (compartilhado, copiado sem alterar): descobre os endpoints do servidor MCP (`/.well-known/oauth-protected-resource` e `/.well-known/oauth-authorization-server`, com fallback para `<origem>/authorize` e `<origem>/token`), faz registro dinâmico de cliente quando o servidor expõe `registration_endpoint` (guarda `client_id` em `lib/store.ts`), inicia o fluxo authorization code com PKCE (S256, verifier em cookie `HttpOnly` de 10 min, como o OpenRouter), troca o `code` no servidor, grava `access_token`, `refresh_token` e `expires_at` com `setConfig("<PREFIXO>_CODIGO", ...)` e `setConfig("<PREFIXO>_REFRESH", ...)`, e renova o token automaticamente antes de expirar em `conexaoAutorizada(prefixo)`
- [ ] Rotas compartilhadas `app/api/setup/oauth/mcp/[prefixo]/route.ts` (início) e `app/api/setup/oauth/mcp/[prefixo]/callback/route.ts` (retorno), montando `redirect_uri` com `baseUrl(req)`; o prefixo é validado contra as integrações declaradas em `lib/integracoes.ts`
- [ ] `lib/setup-comum.ts` exporta `integracaoMCP({ id, titulo, descricao, urlPadrao, oauth: true })` que devolve uma `Integracao` no padrão `MCP_*` (`<PREFIXO>_URL`, `<PREFIXO>_CODIGO`) com `oauth: { tipo: "mcp", rotulo: "Autorizar", url: "/api/setup/oauth/mcp/<PREFIXO>" }`, `testar` listando as ferramentas remotas e o código manual em "Opções avançadas"
- [ ] `lib/mcp-cliente.ts` continua igual; `conectar(url, token)` recebe o token renovado por `conexaoAutorizada`
- [ ] Erros do provedor (recusa, token expirado, registro negado) voltam ao `/setup` como mensagem em português no cartão, sem pilha nem código
- [ ] Arquivos compartilhados copiados para os outros nove apps; `scripts/verificar-padrao.sh` passa
- [ ] Lint e build passam nos dez; testar com um servidor MCP de teste local que implemente o fluxo (script descartável fora do repositório) e conferir início, retorno, renovação e revogação

### Fase 1, Radar de Sinais (`radar-sinais`)

### US-004: Esqueleto, tela e grafo de exemplo
**Description:** As a executivo de estratégia, I want abrir o app e ver um radar de exemplo com o grafo so that eu entenda em dez segundos o que ele entrega.

**Acceptance Criteria:**
- [ ] Pasta `radar-sinais/` criada a partir de `pdi-time/`; entrada em `catalogo.json` conforme a tabela acima (`capacidades: ["artefato","mcp","rotina"]`, `demo: null`); `node scripts/gerar-icones.mjs` e `node scripts/gerar-deploy.mjs` rodados; serviço em `docker-compose.yml` (`3011:10000`); `metadata.title` "Radar de Sinais · IA para Executivos"; acento em `globals.css`
- [ ] `lib/types.ts`: `Tema`, `Fonte { titulo, url, veiculo, publicadoEm }`, `Sinal { id, titulo, resumo, forca: "alta"|"media"|"baixa", tendencia: "subindo"|"estavel"|"caindo", temas: string[], fontes: Fonte[], oQueFazer: string }`, `No { id, rotulo, tipo: "tema"|"sinal"|"ator"|"tecnologia", peso }`, `Aresta { origem, destino, relacao, peso }`, `Radar { periodoDias, sinais, nos, arestas, conexoes: { titulo, explicacao, nos: string[] }[] }`
- [ ] `Panel`: h1 "Saiba o que está mudando antes da concorrência", campo "Temas que você acompanha" (textarea, um por linha), `select` "Período" (7, 30 e 90 dias, padrão 30), `MaisDetalhes` com "Setor da empresa" e "Fontes" (caixas: notícias e sites, comunidades, código aberto); botão "Montar o radar"; "Preencher com um exemplo"
- [ ] Novo `components/Grafo.tsx`: SVG responsivo com layout de força próprio (repulsão, molas e atração ao centro, 300 iterações no cliente, sem dependência), até 120 nós; nós de tipo `tema` maiores, `sinal` na cor de acento, `ator` e `tecnologia` em cinza com contorno; clicar em um nó destaca vizinhos, esmaece o resto e mostra o cartão do nó ao lado (título, resumo, fontes com link); teclado e `prefers-reduced-motion` respeitados; no celular o grafo ocupa a largura e a lista fica abaixo
- [ ] `Stage`: `ResultHead` com `Entregar` → `Origem` → `Destaque` (quantidade de sinais fortes e a interpretação) → `.summary` → `Grafo` → `DataTable` "Sinais" (papéis: `titulo` sinal, `resumo` o que fazer, `chip` força, `detalhe` fontes) → seção "Conexões que merecem atenção"
- [ ] `lib/demo.ts` com um radar completo e fictício para o exemplo (três temas, dez a doze sinais, vinte a trinta nós, fontes com veículos e datas plausíveis do período)
- [ ] `POST /api/radar` devolve o demo quando `!aiEnabled()` ou quando nenhuma fonte está configurada; `GET /api/health`, `GET /api/status` no padrão; resultado salvo no histórico (`tipo: "radar"`) e `/r/[id]` e `/imprimir/[id]` adaptados
- [ ] Lint, build e `verificar-jargao.mjs` passam; verificar no navegador

### US-005: Motor de busca com fontes sem chave e com Exa ou Tavily
**Description:** As a executivo, I want que o radar consulte fontes reais do período so that os sinais não sejam opinião do modelo.

**Acceptance Criteria:**
- [ ] Novo `lib/busca.ts`: `buscar({ consulta, dias, fontes }): Promise<Achado[]>` com `Achado { titulo, url, trecho, veiculo, publicadoEm, pontuacao, fonte }`; provedores independentes, cada um com `disponivel()` e `buscar()`: `hackernews` (API Algolia, sem chave, filtra por `created_at_i`), `reddit` (`/search.json` público, 1 requisição por segundo, `restrict_sr` desligado), `github` (busca de repositórios criados ou atualizados no período, sem chave), `exa` (`POST https://api.exa.ai/search` com `startPublishedDate`, `numResults`, `contents.highlights`), `tavily` (`POST https://api.tavily.com/search` com `topic: "news"`, `time_range`, `max_results`)
- [ ] Deduplicação por URL normalizada e por título quase igual; pontuação combina engajamento da fonte (votos, estrelas, `score`) e recência; resultado ordenado e limitado a 60 achados por rodada
- [ ] `lib/integracoes.ts`: `EXA` (`EXA_API_KEY`, `testar` faz uma busca de um resultado) e `TAVILY` (`TAVILY_API_KEY`, idem), ambas opcionais, descrição em linguagem de negócio ("Busca em notícias e sites com data de publicação confiável"); `INTEGRACOES = [OPENROUTER, EXA, TAVILY, NOTIFICACOES]`
- [ ] `GET /api/status` lista `integrations: { exa, tavily }`; a tela mostra em `Origem` quais fontes entraram ("a partir de 41 achados em Hacker News, Reddit e Exa")
- [ ] Falha de um provedor não derruba a rodada: registra `console.error` e segue com os demais; se nenhum responder, a rota devolve 502 com mensagem clara
- [ ] Lint e build passam; testar via curl `POST /api/radar` sem chave (só fontes públicas) e com chave falsa da Exa (`testar` devolve `ok:false` com mensagem)

### US-006: Agente de pesquisa e síntese em grafo
**Description:** As a executivo, I want que a IA pesquise em várias rodadas e monte o grafo com fontes por sinal so that eu confie em cada ponto do radar.

**Acceptance Criteria:**
- [ ] Novo `lib/radar.ts` com `montarRadar(entrada): Promise<Radar>`: primeira etapa usa `askWithTools` com as ferramentas `buscar(consulta, fonte?)` e `ler(url)` (baixa a página e devolve o texto principal cortado em 6.000 caracteres), no máximo oito iterações, instruído a cobrir cada tema com ao menos duas consultas diferentes e a ler as três páginas mais relevantes; segunda etapa usa `askJSON<Radar>` sobre os achados coletados para produzir sinais, nós, arestas e conexões, citando só URLs que existem nos achados
- [ ] Pós-processamento no servidor descarta fontes cuja URL não estava nos achados, remove nós sem arestas e limita a 120 nós e 12 sinais; `forca` deriva de quantidade e diversidade de fontes, não da opinião do modelo
- [ ] `Loading` com etapas reais ("Buscando notícias", "Lendo as páginas mais citadas", "Agrupando sinais", "Montando o grafo")
- [ ] Rota `POST /api/radar` usa `montarRadar` quando `aiEnabled()`; `lib/ferramentas.ts` declara `montar_radar(temas, dias, setor?)` chamando a mesma função; `NOME_SERVIDOR = "radar-sinais"`
- [ ] `Entregar` com extras "Baixar grafo (JSON)" (arquivo `{ nodes, edges, communities }` no formato do Graphify, para abrir em outras ferramentas) e "Copiar sinais como lista"
- [ ] Lint e build passam; testar com chave real do OpenRouter uma rodada de dois temas e conferir no navegador que cada sinal tem fontes clicáveis

### US-007: Radar semanal com o que mudou
**Description:** As a executivo, I want receber toda semana só o que é novo so that eu acompanhe os temas sem abrir o app.

**Acceptance Criteria:**
- [ ] Botão "Receber este radar toda semana" no resultado cria a rotina `radar-semanal` (segunda-feira às 8h por padrão, canal do cartão "Notificações") com os temas e o setor em `parametros`
- [ ] `lib/rotinas-do-app.ts` registra o executor: monta o radar dos últimos 7 dias, compara com o resultado anterior da mesma rotina (sinais com título parecido) e entrega "Novos", "Ganharam força" e "Perderam força", com o link `/r/<id>`
- [ ] Em demo, a rotina entrega o radar de exemplo rotulado como exemplo
- [ ] `TIPOS_ROTINA` lista "Radar semanal dos meus temas" para o seletor do `/setup`
- [ ] Lint e build passam; testar via `POST /api/rotinas/<id>/executar-agora` e conferir a mensagem entregue

### Fase 2, Bússola de IA (`bussola-ia`)

### US-008: Esqueleto, questionário modelo e editor de perguntas
**Description:** As a executivo, I want partir de um questionário pronto e adaptar as perguntas à minha empresa so that a avaliação fale a nossa língua.

**Acceptance Criteria:**
- [ ] Pasta `bussola-ia/` criada a partir de `pdi-time/`; entrada em `catalogo.json` (`capacidades: ["artefato","mcp","formulario","rotina"]`); ícones, deploy, compose (`3012:10000`), `metadata.title` e acento no padrão
- [ ] `lib/types.ts`: `Dimensao { id, nome, descricao }`, `Pergunta { id, texto, dimensao, tipo: "escala"|"escolha"|"texto", opcoes?, peso }`, `Questionario { id, titulo, empresa, dimensoes, perguntas, criadoEm }`, `Resposta { id, respondente?: { nome?, area?, cargo? }, valores: Record<perguntaId, number|string>, criadoEm }`, `Avaliacao { questionario, respostas, analise? }`
- [ ] `lib/modelo.ts` traz o questionário modelo com seis dimensões (Estratégia e liderança; Dados e infraestrutura; Pessoas e cultura; Processos e casos de uso; Governança e riscos; Resultados) e 24 perguntas de escala 1 a 5 com rótulos ("Não existe" a "Consolidado"), mais duas perguntas de texto
- [ ] `Panel`: h1 "Descubra em que estágio de IA sua empresa está", campos "Nome da empresa" e "Título da avaliação", botão "Usar o questionário modelo" e botão "Gerar um questionário para o meu setor" (`askJSON`, recebe setor e porte em `MaisDetalhes`); novo `components/EditorPerguntas.tsx` lista as perguntas por dimensão com editar texto, trocar dimensão, mudar tipo, remover, adicionar e reordenar (botões "Subir" e "Descer", sem arrastar); contador "24 perguntas em 6 dimensões"
- [ ] O questionário é salvo em SQLite (`lib/questionarios.ts`: `salvar`, `obter`, `listar`, `apagar`) e aparece em `MaisDetalhes` como "Meus questionários"
- [ ] `lib/demo.ts` com uma avaliação completa fictícia (empresa, 8 respondentes de áreas diferentes, análise pronta) para o exemplo
- [ ] Lint, build e `verificar-jargao.mjs` passam; verificar no navegador (editor no desktop e no celular)

### US-009: Link único de avaliação e coleta de respostas
**Description:** As a executivo, I want mandar um link para a liderança e as equipes responderem so that as respostas cheguem sem planilha.

**Acceptance Criteria:**
- [ ] Botão "Criar link de avaliação" gera um formulário público com `criar({ tipo: "bussola", campos, parametros: { questionarioId, titulo, empresa }, expiraEmDias: 30, limite })` (limite escolhido: 10, 50, 200 ou sem limite; expiração 7, 30 ou 90 dias); os campos derivam das perguntas (`escala`, `escolha`, `texto` com `secao` = dimensão) e três campos opcionais de identificação (nome, área, cargo), com aviso "Você pode responder sem se identificar"
- [ ] Tela pública mostra a marca do app, o título da avaliação, o nome da empresa, as dimensões como seções com barra de progresso ("Dimensão 2 de 6") e o botão "Enviar respostas"; agradecimento com a frase "Sua resposta entrou na avaliação de {empresa}"
- [ ] `app/api/f/[token]/route.ts` importa `@/lib/bussola` para registrar o callback `bussola`, que grava a resposta ligada ao questionário e recalcula os totais (sem chamar a IA a cada resposta)
- [ ] `MaisDetalhes` lista "Avaliações em andamento" com link para copiar, respostas recebidas, "Encerrar" e "Ver resultado"
- [ ] Lint e build passam; verificar no navegador a tela pública em celular e desktop; testar via curl um envio válido, um fora da escala (400) e um após o limite (410)

### US-010: Mapa de maturidade e leitura da IA
**Description:** As a executivo, I want ver o nível de maturidade por dimensão e o que fazer a seguir so that eu leve um diagnóstico para a diretoria.

**Acceptance Criteria:**
- [ ] Novo `lib/bussola.ts` com `analisarAvaliacao(avaliacao): Promise<Analise>`: cálculo determinístico da média por dimensão (0 a 5), do nível geral (1 Inicial, 2 Exploração, 3 Estruturação, 4 Escala, 5 Transformação) e da dispersão entre respondentes por dimensão; depois `askJSON<Analise>` recebe só os agregados e as respostas de texto e devolve `{ resumo, leituraPorDimensao[], forcas[], lacunas[], proximosPassos[3], ondeDiscordam[] }`
- [ ] Novo `components/GraficoMaturidade.tsx`: gráfico radar em SVG puro com seis eixos, escala 0 a 5 com três anéis rotulados, polígono da empresa na cor de acento com preenchimento translúcido, polígono cinza da dispersão (mínimo e máximo por dimensão) quando houver mais de três respondentes; rótulos em px fixos, legível em 390 px; alternativa textual (tabela) abaixo para leitura sem cor
- [ ] `Stage`: `ResultHead` → `Origem` → `Destaque` (nível geral com o nome do estágio) → `.summary` → `GraficoMaturidade` → `DataTable` por dimensão (média, nível, o que a IA leu) → seções "Forças", "Lacunas", "Próximos passos" e "Onde a liderança e a operação discordam"
- [ ] Botão "Analisar respostas" no painel roda a análise sobre as respostas recebidas e salva no histórico (`tipo: "avaliacao"`); `/r/[id]` e `/imprimir/[id]` renderizam o mapa; `Entregar` com extras "Baixar respostas (CSV)" e "Copiar próximos passos"
- [ ] Em demo, a análise vem de `lib/demo.ts`; com IA, os agregados são calculados de verdade sobre as respostas reais
- [ ] Lint e build passam; verificar no navegador (gráfico em desktop e celular)

### US-011: Ferramentas MCP e aviso de novas respostas
**Description:** As a executivo, I want criar avaliações a partir do meu assistente e saber quando chegam respostas so that o processo ande sem eu abrir o app.

**Acceptance Criteria:**
- [ ] `lib/ferramentas.ts` declara `criar_avaliacao(empresa, titulo, setor?)` (devolve o link público), `resultado_avaliacao(id)` (agregados e análise) e `avaliar_respostas(respostas)` (recebe respostas em JSON e devolve a análise, para quem já coletou em outro lugar); `NOME_SERVIDOR = "bussola-ia"`
- [ ] Rotina `novas-respostas` (diária, criada pelo botão "Avisar quando chegarem respostas" na lista de avaliações): entrega a contagem do dia por avaliação e o link do resultado; `enviar: false` quando não houve resposta nova
- [ ] `TIPOS_ROTINA` lista "Aviso diário de novas respostas"
- [ ] Lint e build passam; testar `tools/list` e `tools/call` via curl com e sem código

### Fase 3, Simulador de Vendas (`simulador-vendas`)

### US-012: Esqueleto, vendedores, cenários e análise de uma conversa
**Description:** As a gestor de vendas, I want cadastrar meu time e ver a análise de uma conversa so that eu entenda o que o app mede antes de conectar a voz.

**Acceptance Criteria:**
- [ ] Pasta `simulador-vendas/` criada a partir de `pdi-time/`; entrada em `catalogo.json` (`capacidades: ["artefato","mcp","formulario","rotina"]`); ícones, deploy, compose (`3013:10000`), `metadata.title` e acento no padrão
- [ ] `lib/types.ts`: `Vendedor { id, nome, email?, equipe?, criadoEm }`, `Cenario { id, titulo, cliente: { nome, cargo, empresa, contexto }, objetivo, objecoes: string[], tom }`, `Conversa { id, vendedorId, cenarioId, origem: "voz"|"texto"|"colada", transcricao: { papel: "vendedor"|"cliente", texto, segundo? }[], duracaoSeg?, criadoEm }`, `Analise { nota, criterios: { nome, nota, evidencia, comoMelhorar }[], pontosFortes, oQueMelhorar, momentos: { segundo?, trecho, comentario }[], resumo }`
- [ ] `lib/vendedores.ts` e `lib/cenarios.ts` em SQLite (`criar`, `listar`, `obter`, `apagar`); três cenários prontos (primeira ligação a lead frio, negociação de desconto, renovação de contrato) carregados na primeira execução
- [ ] `Panel`: h1 "Treine seu time de vendas com um cliente que responde", `select` "Vendedor" (com "Cadastrar vendedor" em linha: nome, e-mail, equipe), `select` "Cenário", aba de entrada "Colar uma conversa" (textarea com o formato "Vendedor: ... / Cliente: ...") e botão "Analisar a conversa"; `MaisDetalhes` com "Critérios avaliados" editáveis (padrão: abertura, descoberta de necessidades, escuta ativa, tratamento de objeções, proposta de valor, fechamento e próximos passos)
- [ ] Novo `lib/analise.ts` com `analisarConversa(conversa, criterios): Promise<Analise>` via `askJSON`; a nota geral é a média ponderada dos critérios calculada no servidor, com uma casa decimal e vírgula
- [ ] `Stage`: `ResultHead` → `Origem` → `Destaque` (nota geral e interpretação) → `.summary` → `DataTable` de critérios (papéis: `titulo`, `resumo` como melhorar, `chip` nota) → "Momentos-chave" com trechos citados → `<details>` "Ver a conversa completa"
- [ ] Resultado salvo no histórico (`tipo: "conversa"`, `expiraEmDias: 90`); `lib/demo.ts` com uma conversa e uma análise fictícias completas
- [ ] Lint, build e `verificar-jargao.mjs` passam; verificar no navegador

### US-013: Sala de simulação por voz e webhook de pós-conversa
**Description:** As a vendedor, I want abrir um link, conversar por voz com o cliente simulado e ver minha análise so that eu treine sozinho quando quiser.

**Acceptance Criteria:**
- [ ] `lib/integracoes.ts`: `ELEVENLABS_AGENTE` (`ELEVENLABS_API_KEY`; `ELEVENLABS_AGENT_ID` com `opcoesDinamicas` via `GET /v1/convai/agents`; `ELEVENLABS_WEBHOOK_SECRET` do tipo `secret` com ajuda de três passos: "Abra Configurações, Webhooks, crie um webhook com o endereço abaixo e cole aqui o segredo"), `testar` chama `GET /v1/convai/agents/<id>`; botão "Criar agente de simulação" em "Opções avançadas" chama `POST /v1/convai/agents/create` com o prompt do cliente simulado (persona genérica, cenário e vendedor entram por variáveis dinâmicas) e grava o `agent_id`
- [ ] Novo cartão em `/setup` (`components/Webhook.tsx`, próprio do app) mostra a URL `${baseUrl}/webhook/elevenlabs` com "Copiar" e o estado "Última conversa recebida há N minutos"
- [ ] Nova página pública `app/simular/[token]/page.tsx`: token gerado por "Criar link de treino" para um vendedor e um cenário (tabela `salas` em `lib/salas.ts`, expira em 30 dias); mostra o cenário em linguagem do vendedor ("Você vai ligar para {cliente}, {cargo} da {empresa}. Objetivo: ..."), o widget `<elevenlabs-convai agent-id=... dynamic-variables={vendedor_id, sala_token, cenario...}>` carregado por script externo quando a integração está configurada; sem integração, uma conversa por texto com a IA no papel do cliente (`askText` multi-turno, com `speechSynthesis` opcional como na Entrevistadora), encerrada por "Encerrar e ver minha análise"
- [ ] `app/webhook/elevenlabs/route.ts` (POST): lê o corpo cru com `req.text()`, valida `ElevenLabs-Signature` (`t=` e `v0=`, HMAC-SHA256 de `"<t>.<corpo>"`, janela de 30 minutos, `crypto.timingSafeEqual`), responde 200 imediatamente e processa em segundo plano: aceita só `type: "post_call_transcription"`, lê `data.transcript[]` (`role`, `message`, `time_in_call_secs`), `data.metadata.call_duration_secs` e as variáveis dinâmicas para achar o vendedor e a sala; grava a `Conversa` (`origem: "voz"`), roda `analisarConversa` e salva no histórico; assinatura inválida devolve 401 e registra `console.error`
- [ ] A página da sala consulta `GET /api/salas/<token>/ultima` a cada 5 s após o fim da conversa e mostra "Analisando sua conversa" até o resultado chegar; então exibe o mesmo `Resultado` do app
- [ ] Lint e build passam; testar via curl um POST no webhook com assinatura válida (script descartável que calcula o HMAC) e um inválido; verificar no navegador a sala em celular com e sem integração

### US-014: Painel do gestor com evolução por vendedor
**Description:** As a gestor de vendas, I want ver como cada vendedor evolui e onde a equipe tropeça so that eu direcione o treino.

**Acceptance Criteria:**
- [ ] Botão "Ver o painel da equipe" no painel abre o resultado `tipo: "painel"` (salvo no histórico e recalculado a cada clique): `Destaque` com a nota média da equipe nos últimos 30 dias e a variação em relação aos 30 anteriores; `DataTable` "Vendedores" (nome, conversas, nota média, tendência, critério mais fraco, última conversa, "Ver conversas"); novo `components/GraficoEvolucao.tsx` (linhas em SVG, uma por vendedor selecionado, no máximo cinco, a selecionada em acento e as outras em cinza, eixo com três marcas, rótulos em px fixos); "Critérios mais fracos da equipe" em barras horizontais no padrão do Analista Financeiro
- [ ] Clicar em um vendedor lista as conversas dele com nota, cenário e "Abrir"; "Criar link de treino" direto da linha
- [ ] Bloco "Em breve" no fim do painel com dois cartões desabilitados e chip "Em breve": "Analisar ligações reais do time" e "Levar as notas para o CRM"; sem formulário, sem link para setup
- [ ] `Entregar` com extra "Baixar notas da equipe (CSV)"
- [ ] Lint e build passam; verificar no navegador (gráfico em desktop e celular)

### US-015: Resumo semanal, treino por link e ferramentas MCP
**Description:** As a gestor, I want receber o resumo da semana e mandar treinos por link so that o programa de treino rode sem eu operar o app.

**Acceptance Criteria:**
- [ ] Rotina `resumo-equipe` (semanal, sexta às 17h por padrão, botão "Receber o resumo toda semana" no painel): conversas da semana, nota média, quem mais evoluiu, quem não treinou, critério mais fraco e o link do painel
- [ ] Formulário público "Pedir para o time treinar": gera um link (tipo `treino`) em que o vendedor informa o nome (ou escolhe da lista) e recebe na tela de agradecimento o link da própria sala de simulação do cenário escolhido pelo gestor
- [ ] `lib/ferramentas.ts` declara `analisar_conversa(transcricao, vendedor?, cenario?)`, `painel_equipe(dias?)` e `criar_treino(vendedor, cenario)`; `NOME_SERVIDOR = "simulador-vendas"`
- [ ] `TIPOS_ROTINA` lista "Resumo semanal da equipe"
- [ ] Lint e build passam; testar rotina via `executar-agora` e MCP via curl

### Fase 4, Custos de IA (`custos-ia`)

### US-016: Esqueleto, modelo de dados e gráfico de gasto contra planejado
**Description:** As a CFO, I want ver o gasto com IA do ano contra o planejado so that eu saiba se estamos dentro do orçamento antes de fechar o mês.

**Acceptance Criteria:**
- [ ] Pasta `custos-ia/` criada a partir de `pdi-time/`; entrada em `catalogo.json` (`capacidades: ["artefato","mcp","formulario","rotina"]`); ícones, deploy, compose (`3014:10000`), `metadata.title` e acento no padrão
- [ ] `lib/types.ts`: `Fatura { id, fornecedor, ferramenta, categoria: "modelos e assistentes"|"código"|"imagem e vídeo"|"voz"|"automação"|"infraestrutura"|"outra", valor, moeda: "BRL"|"USD"|"EUR", valorBRL, data, periodicidade: "mensal"|"anual"|"avulsa", origem: "email"|"upload"|"formulario"|"manual", referencia (id da mensagem ou nome do arquivo), criadoEm }`, `Orcamento { ferramentaOuCategoria, valorMensalBRL }`, `Leitura { mesAtual, totalBRL, planejadoBRL, variacaoMesAnterior, porFerramenta[], porMes[], alertas[] }`
- [ ] `lib/faturas.ts` em SQLite: `salvar` (deduplica por fornecedor, valor e data), `listar(periodo)`, `apagar`, `resumo(periodo)`; `lib/orcamento.ts`: `definir`, `listar`, `apagar`; conversão para reais com a taxa do cartão "Câmbio" (`CAMBIO_USD_BRL` e `CAMBIO_EUR_BRL` em `/setup`, padrão preenchido pelo app a partir da cotação PTAX pública do Banco Central quando acessível, editável)
- [ ] `Panel`: h1 "Saiba quanto sua empresa gasta com IA", `select` "Período" (mês atual, últimos 3 meses, ano), botão "Ler as notas do e-mail" (desabilitado até conectar o e-mail, com a frase "Conecte seu e-mail para ler as notas sozinho") e botão "Enviar notas em PDF" (`Dropzone`, vários arquivos); `MaisDetalhes` com "Orçamento planejado" (linhas ferramenta ou categoria e valor mensal) e "Lançar manualmente"
- [ ] `Stage`: `ResultHead` → `Origem` → `Destaque` (gasto do mês em reais e a diferença contra o planejado, em `ok`, `warn` ou `danger`) → `.summary` → novo `components/GraficoGastoPlanejado.tsx` (barras pareadas por mês, gasto em acento e planejado em cinza, no padrão CSS do Analista Financeiro, rótulos em px fixos) → barras horizontais por ferramenta com chip "Acima do planejado" e "Assinatura nova" → `DataTable` de faturas (papéis: `titulo` fornecedor, `resumo` ferramenta e periodicidade, `chip` valor, `detalhe` data e origem)
- [ ] `lib/demo.ts` com doze meses de faturas fictícias de ferramentas reais do mercado (nomes públicos, valores plausíveis), um orçamento e dois estouros
- [ ] Lint, build e `verificar-jargao.mjs` passam; verificar no navegador (gráficos em desktop e celular)

### US-017: Leitor de notas em PDF e texto
**Description:** As a CFO, I want que o app entenda uma nota ou recibo de qualquer ferramenta so that eu não digite nada.

**Acceptance Criteria:**
- [ ] Novo `lib/leitor.ts` com `lerDocumento({ texto, nomeArquivo?, assunto?, remetente? }): Promise<Fatura | null>`: `askJSON` com instrução para devolver `null` quando não for cobrança de ferramenta de IA; extrai fornecedor, ferramenta, valor, moeda, data, periodicidade e categoria; validação no servidor (valor numérico maior que zero, data válida, moeda conhecida)
- [ ] `POST /api/faturas/upload` recebe `formData` com PDFs (texto via `unpdf`) ou imagens (via `askVision`, quando `visionEnabled()`), até 10 arquivos de 5 MB; devolve as faturas reconhecidas, as ignoradas e o motivo
- [ ] Prévia antes de gravar: a tela lista o que foi reconhecido com "Confirmar tudo" e "Editar" por linha; só grava após confirmar
- [ ] Em demo (sem IA), o upload devolve uma fatura de exemplo por arquivo, rotulada
- [ ] Lint e build passam; testar via curl com um PDF de exemplo e com um arquivo que não é nota (deve ser ignorado com motivo)

### US-018: Conectar Gmail ou Outlook e importar as notas do período
**Description:** As a CFO, I want conectar meu e-mail com um clique e importar as notas dos últimos meses so that o histórico se monte sozinho.

**Acceptance Criteria:**
- [ ] `lib/integracoes.ts`: `GMAIL` (OAuth authorization code com PKCE no padrão do OpenRouter: `app/api/setup/oauth/google/route.ts` e `callback`; escopo `gmail.readonly`; `access_type=offline`; `client_id` e `client_secret` do app em variáveis de ambiente `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`, como o Trello usa `TRELLO_API_KEY_APP`; grava `GMAIL_REFRESH_TOKEN` e a conta conectada) e `OUTLOOK` (mesmo desenho contra `login.microsoftonline.com/common/oauth2/v2.0`, escopos `Mail.Read offline_access User.Read`, variáveis `MICROSOFT_CLIENT_ID` e `MICROSOFT_CLIENT_SECRET`); os cartões mostram "Conectado como {e-mail}" e "Desconectar"; sem as variáveis do app, o cartão explica em "Para a equipe técnica" como criar as credenciais e some da tela principal
- [ ] Novo `lib/email.ts` com `listarMensagens({ provedor, dias, consulta })` e `obterMensagem(id)` devolvendo `{ id, assunto, remetente, data, texto, anexos: { nome, tipo, bytes }[] }`: Gmail via `users.messages.list` (`q: "newer_than:{dias}d (fatura OR invoice OR recibo OR receipt OR \"nota fiscal\" OR has:attachment)"`), `messages.get` e `attachments.get`; Outlook via `/me/messages` com `$filter` de data e `$search`, e `/attachments`; renovação de token automática; respeito a 429 com espera
- [ ] `POST /api/faturas/importar` (`dias`: 30, 90 ou 365) percorre as mensagens, passa assunto, remetente, corpo e anexos PDF por `lerDocumento`, deduplica e grava; devolve contagem lida, reconhecida e ignorada; mostra progresso na tela por etapas; o corpo do e-mail nunca é gravado (só `referencia` com o id da mensagem)
- [ ] `GET /api/status` lista `integrations: { gmail, outlook }`; o botão "Ler as notas do e-mail" habilita quando um deles está conectado
- [ ] Lint e build passam; testar o fluxo OAuth com credenciais reais de teste em `localhost` para um dos provedores e documentar no README do app os passos de criação das credenciais e as restrições (Google: app em teste limita a 100 usuários e o acesso expira em 7 dias; escopo restrito exige verificação para uso público; Workspace interno dispensa)

### US-019: Orçamento, alertas, fechamento mensal e recibos por link
**Description:** As a CFO, I want ser avisado quando uma ferramenta estourar o planejado e receber o fechamento todo mês so that o controle rode sem mim.

**Acceptance Criteria:**
- [ ] Alertas calculados em `lib/faturas.ts` (sem IA): "Acima do planejado" (gasto do mês maior que o orçamento da ferramenta ou categoria), "Assinatura nova" (fornecedor sem fatura nos 3 meses anteriores), "Cobrança em duplicidade" (mesmo fornecedor e valor no mesmo mês com datas diferentes), "Anual vencendo" (fatura anual há 11 meses); aparecem como seção "Alertas" no resultado e como chips na tabela
- [ ] Rotina `fechamento-mensal` (mensal, dia 1 às 8h, botão "Receber o fechamento todo mês"): roda a importação do e-mail quando conectado, gera a leitura do mês anterior e entrega cinco linhas (total, contra o planejado, maior variação, novas assinaturas, alertas) com o link do resultado
- [ ] Formulário público "Enviar um recibo" (tipo `recibo`, campo `arquivo` e "Quem pagou"): cada envio passa por `lerDocumento` e entra como `origem: "formulario"` na prévia de confirmação do gestor
- [ ] `lib/ferramentas.ts` declara `gastos_ia(periodo)`, `importar_notas(dias)` e `definir_orcamento(item, valorMensal)`; `NOME_SERVIDOR = "custos-ia"`; `Entregar` com extra "Baixar faturas (CSV)"
- [ ] `TIPOS_ROTINA` lista "Fechamento mensal de custos de IA"
- [ ] Lint e build passam; testar rotina, formulário e MCP via curl; verificar no navegador a seção de alertas

### Fase 5, Clone de Site (`clone-site`)

### US-020: Esqueleto, captura para HTML e prévia
**Description:** As a executivo de marketing, I want subir a captura de uma página de referência e receber a minha versão em HTML so that eu tenha um ponto de partida em minutos.

**Acceptance Criteria:**
- [ ] Pasta `clone-site/` criada a partir de `pdi-time/`; entrada em `catalogo.json` (`capacidades: ["artefato","mcp","formulario"]`); ícones, deploy, compose (`3015:10000`), `metadata.title` e acento no padrão; `lib/integracoes.ts` com `[OPENROUTER, CAPTURA]` onde `CAPTURA` é um serviço de captura de página por URL opcional (`CAPTURA_API_KEY`, ScreenshotOne ou equivalente, `testar` captura `example.com`)
- [ ] `lib/types.ts`: `Pedido { imagem (data URL), url?, stack: "html-tailwind"|"html-css", instrucoes?, marca?: { nome, corPrimaria, corSecundaria?, fonte?, logoDataUrl? } }`, `Versao { n, html, instrucao, criadoEm }`, `Pagina { id, titulo, versoes: Versao[], marca? }`
- [ ] Novo `lib/gerador.ts` com `gerarPagina(pedido): Promise<string>`: prompt de sistema portado e traduzido do `screenshot-to-code` (um único arquivo HTML, Tailwind pela CDN, Google Fonts, imagens substituídas por blocos com a cor da marca e o texto alternativo, sem scripts externos além do Tailwind, textos em português), enviado com a imagem via `askVision`; extrai o bloco `<html>...</html>` da resposta e valida que abre e fecha
- [ ] `Panel`: h1 "Transforme uma referência em uma página sua", `Dropzone` para PNG ou JPG (até 5 MB) ou campo "Endereço da página" (habilitado só com `CAPTURA` configurado; sem ele, a frase "Sem serviço de captura, envie uma imagem da página"), `select` "Formato" (HTML com Tailwind, HTML com CSS), `MaisDetalhes` com "Instruções" e "Marca" (nome, cor principal, cor secundária, logotipo); botão "Gerar a página"
- [ ] `Stage`: `ResultHead` → `Origem` → prévia em `<iframe sandbox="allow-same-origin" srcDoc>` com alternância "Computador" e "Celular" (largura 390 px) → `<details>` "Ver o código" com `CopyButton`; aviso fixo em uma linha abaixo da prévia: "Use a referência pela estrutura. Textos, marcas e imagens de terceiros são protegidos; troque pelo conteúdo da sua empresa"
- [ ] Demo: `lib/demo.ts` traz uma página fictícia completa (landing de um produto inventado, em português) devolvida quando `!visionEnabled()`; o `Loading` explica etapas ("Lendo a captura", "Escrevendo a estrutura", "Aplicando a marca")
- [ ] Resultado salvo no histórico (`tipo: "pagina"`), `/r/[id]` mostra a prévia
- [ ] Lint, build e `verificar-jargao.mjs` passam; verificar no navegador

### US-021: Edições por instrução, marca e versões
**Description:** As a executivo de marketing, I want pedir mudanças em português e voltar a uma versão anterior so that a página fique do meu jeito sem mexer em código.

**Acceptance Criteria:**
- [ ] Campo "O que mudar" abaixo da prévia com botão "Aplicar": `POST /api/pagina/<id>/editar` envia a instrução e o HTML atual; `gerarPagina` em modo edição (prompt de atualização do `screenshot-to-code`: devolver o arquivo inteiro, mudar só o pedido) e grava uma `Versao` nova; a prévia atualiza e a lista "Versões" (n, instrução, hora) permite "Voltar para esta"
- [ ] Botão "Aplicar a minha marca": substitui cores, fonte e nome usando a `marca` do pedido (primeira tentativa determinística por substituição de classes e variáveis; se a página não usar Tailwind, cai para uma edição por instrução)
- [ ] Botão "Trocar os textos pelos da minha empresa": abre um campo com o que a empresa faz e pede à IA para reescrever títulos, subtítulos e chamadas mantendo a estrutura
- [ ] Em demo, as edições aplicam mudanças fixas visíveis (cor e título) para mostrar o fluxo
- [ ] Lint e build passam; verificar no navegador (três edições seguidas e uma volta de versão)

### US-022: Publicar, baixar, pedir por link e ferramentas MCP
**Description:** As a executivo de marketing, I want publicar a página em um link e deixar a equipe pedir páginas so that o resultado saia do app.

**Acceptance Criteria:**
- [ ] Nova rota pública `app/s/[id]/route.ts` serve o HTML da versão atual da página como `text/html` com `Content-Security-Policy` que permite só Tailwind e Google Fonts e `X-Robots-Tag: noindex`; `Entregar` ganha o primário "Publicar link" (mostra `${baseUrl}/s/<id>` com "Copiar") e extras "Baixar HTML" e "Copiar código"
- [ ] Formulário público "Pedir uma página" (tipo `pedido-pagina`: captura como `arquivo`, "Para que serve a página", "Instruções"): cada resposta gera a página e aparece em `MaisDetalhes` como "Pedidos recebidos" com "Abrir"
- [ ] `lib/ferramentas.ts` declara `gerar_pagina(imagem_url, instrucoes?, marca?)` (baixa a imagem no servidor, até 5 MB) e `editar_pagina(id, instrucao)`; `NOME_SERVIDOR = "clone-site"`
- [ ] Lint e build passam; testar via curl `GET /s/<id>` (200, cabeçalhos) e `GET /s/inexistente` (404 amigável); verificar no navegador a página publicada em celular

### Fase 6, Prospecção no LinkedIn (`prospeccao-linkedin`)

### US-023: Esqueleto, perfil ideal e sequência de mensagens
**Description:** As a executivo de vendas, I want descrever meu cliente ideal e receber a lista com a sequência de mensagens pronta so that eu veja o valor antes de conectar minha conta.

**Acceptance Criteria:**
- [ ] Pasta `prospeccao-linkedin/` criada a partir de `pdi-time/`; entrada em `catalogo.json` (`capacidades: ["artefato","mcp","rotina"]`); ícones, deploy, compose (`3016:10000`), `metadata.title` e acento no padrão
- [ ] `lib/types.ts`: `Perfil { cargos, setores, portes, regioes, sinais: string[], proposta }`, `Lead { id, nome, cargo, empresa, setor, linkedinUrl, sinal, pontuacao: 0-100, origem: "prospecthalo"|"demo" }`, `Sequencia { leadId, conexao, acompanhamento1, acompanhamento2, email? }`, `Campanha { id, nome, leads, sequencias, estado: "rascunho"|"aguardando"|"enviando"|"concluida", externoId? }`
- [ ] `Panel`: h1 "Prospecte no LinkedIn sem passar o dia nele", campos "Cargos", "Setores", "Sinais de intenção" (`select` múltiplo: mudou de cargo, empresa contratando, publicou sobre o tema, levantou investimento), "Sua proposta em uma frase"; `MaisDetalhes` com "Seu nome", "Sua empresa", "Tom"; botão "Buscar leads"
- [ ] `Stage`: `ResultHead` → `Origem` → `Destaque` (leads encontrados e quantos com sinal forte) → `DataTable` de leads (papéis: `titulo` nome e cargo, `resumo` empresa e sinal, `chip` pontuação, `detalhe` LinkedIn como link) com seleção múltipla e botão "Escrever para os selecionados"; a sequência aparece por lead em cartões (conexão até 300 caracteres, dois acompanhamentos, e-mail opcional) com `CopyButton` em cada mensagem
- [ ] Novo `lib/sequencias.ts` com `escreverSequencia(lead, perfil): Promise<Sequencia>` via `askJSON`, gancho diferente por mensagem, sem placeholders entre colchetes, nome e empresa do remetente vindos do painel
- [ ] `lib/demo.ts` com dez leads fictícios (nomes e empresas inventados, rotulados) e sequências prontas; a `Origem` diz "Os leads exibidos são fictícios" em demo
- [ ] Resultado salvo no histórico (`tipo: "prospeccao"`)
- [ ] Lint, build e `verificar-jargao.mjs` passam; verificar no navegador

### US-024: Prospect Halo conectado: buscar, aprovar e enviar
**Description:** As a executivo de vendas, I want que a lista venha do meu Prospect Halo e que o envio aconteça só depois da minha aprovação so that eu ganhe tempo sem perder o controle.

**Acceptance Criteria:**
- [ ] `lib/integracoes.ts`: `PROSPECTHALO = integracaoMCP({ id: "PROSPECTHALO", titulo: "Prospect Halo", descricao: "Busca leads no seu LinkedIn e envia as mensagens aprovadas", urlPadrao: "https://app.prospecthalo.ai/api/agent/v1/mcp", oauth: true })` (US-003); `INTEGRACOES = [OPENROUTER, PROSPECTHALO, NOTIFICACOES, MCP_CRM]`
- [ ] Novo `lib/prospecthalo.ts` no método de `prospeccao-ia/lib/crm-mcp.ts`: lista as ferramentas remotas e escolhe por palavras-chave no nome e descrição (`buscar`: "lead", "prospect", "search", "find"; `campanha`: "campaign", "agent", "outreach", "create"; `estado`: "status", "performance"; `contas`: "account", "sender", "readiness"); `montarArgumentos(schema, candidatos)` casa as propriedades do schema remoto com o perfil; guarda em `PROSPECTHALO_FERRAMENTAS` (campo avançado) o mapeamento escolhido para a pessoa corrigir se precisar
- [ ] `POST /api/leads` usa o Prospect Halo quando configurado e normaliza a resposta em `Lead[]` (tenta chaves comuns: `leads`, `prospects`, `results`, `data`); em falha, mostra a mensagem do servidor remoto em português simples e oferece "Ver com dados de exemplo"
- [ ] Fluxo de envio: "Aprovar e enviar pelo Prospect Halo" abre a confirmação com a quantidade de leads, as três mensagens e o aviso "As mensagens serão enviadas da sua conta do LinkedIn, respeitando os limites diários do Prospect Halo"; só após "Confirmar" o app cria a campanha na ferramenta remota e grava `externoId`; "Ver andamento" consulta o estado
- [ ] Cartão "Contas conectadas" no resultado (LinkedIn e e-mail prontos ou não, vindo da ferramenta `contas`) quando o Prospect Halo estiver configurado
- [ ] `Entregar` com extra "Enviar leads para o CRM" via `MCP_CRM` (mesma lógica de `prospeccao-ia/lib/crm-mcp.ts`, copiada para `lib/crm-mcp.ts`)
- [ ] Lint e build passam; testar ponta a ponta com um servidor MCP de teste local que exponha `search_leads`, `create_campaign`, `campaign_status` e `account_readiness` com OAuth (script descartável); documentar no README que os nomes reais das ferramentas do Prospect Halo são descobertos em tempo de execução

### US-025: Leads novos toda semana e ferramentas MCP
**Description:** As a executivo de vendas, I want receber leads novos toda semana com as mensagens prontas so that a prospecção não pare quando eu estiver ocupado.

**Acceptance Criteria:**
- [ ] Rotina `leads-semanais` (botão "Receber leads novos toda semana" no resultado): busca pelo perfil salvo, exclui leads já entregues (tabela `leads_vistos` por perfil), escreve as sequências e entrega a lista com o link do resultado; nunca envia mensagens sozinha
- [ ] Rotina `andamento-campanha` (diária, criada ao confirmar um envio): entrega o estado da campanha (enviadas, respostas, reuniões) enquanto ela estiver ativa; `enviar: false` sem mudança
- [ ] `lib/ferramentas.ts` declara `buscar_leads_linkedin(perfil)`, `escrever_sequencia(lead, proposta)` e `enviar_campanha(campanhaId, confirmar)` (devolve o plano quando `confirmar` for falso); `NOME_SERVIDOR = "prospeccao-linkedin"`
- [ ] `TIPOS_ROTINA` lista "Leads novos toda semana" e "Andamento da campanha"
- [ ] Lint e build passam; testar rotinas via `executar-agora` e MCP via curl

### Fase 7, Vídeos de Campanha (`videos-campanha`)

### US-026: Esqueleto, briefing, conceitos e storyboard de exemplo
**Description:** As a executivo de marketing, I want descrever a campanha, subir a imagem do produto e escolher entre três conceitos so that eu decida o vídeo antes de gastar créditos.

**Acceptance Criteria:**
- [ ] Pasta `videos-campanha/` criada a partir de `pdi-time/`; entrada em `catalogo.json` (`capacidades: ["artefato","mcp","formulario"]`); ícones, deploy, compose (`3017:10000`), `metadata.title` e acento no padrão
- [ ] `lib/types.ts`: `Briefing { produto, publico, objetivo, tom, formato: "9:16"|"16:9"|"1:1", duracaoSeg: 5|10|15, imagemDataUrl? }`, `Conceito { id, titulo, roteiro: { cena, segundos, textoNaTela, narracao? }[], efeitoSugerido, chamada, legenda: { instagram, linkedin, tiktok } }`, `Video { id, conceitoId, estado: "aguardando"|"gerando"|"pronto"|"falhou", url?, custoCreditos?, externoId?, criadoEm }`
- [ ] `Panel`: h1 "Um vídeo curto para cada campanha, em minutos", campos "Produto ou oferta", "Para quem", "Objetivo" (`select`: lançamento, promoção, marca, evento), "Tom", `select` "Formato" e "Duração", `Dropzone` para a imagem do produto (PNG ou JPG até 5 MB); botão "Criar conceitos"
- [ ] Novo `lib/conceitos.ts` com `criarConceitos(briefing): Promise<Conceito[3]>` via `askJSON`; cada conceito tem roteiro por cena somando a duração escolhida, texto na tela curto, efeito sugerido escolhido de uma lista interna de estilos em português ("Zoom dramático", "Giro do produto", "Explosão de partículas", "Câmera lenta", "Antes e depois") e legendas por rede
- [ ] `Stage`: `ResultHead` → `Origem` → três cartões de conceito lado a lado (um abaixo do outro no celular) com o storyboard: novo `components/Storyboard.tsx` mostra as cenas como quadros na proporção escolhida com a imagem do produto ao fundo, texto na tela e uma animação CSS discreta de 3 cenas rotulada "Prévia ilustrativa"; botão "Gerar este vídeo" por conceito (desabilitado sem Higgsfield, com a frase "Conecte o Higgsfield para gerar o vídeo de verdade")
- [ ] `lib/demo.ts` com um briefing e três conceitos fictícios completos; resultado salvo no histórico (`tipo: "campanha"`)
- [ ] Lint, build e `verificar-jargao.mjs` passam; verificar no navegador (storyboard nos três formatos)

### US-027: Higgsfield conectado: efeitos, geração e acompanhamento
**Description:** As a executivo de marketing, I want gerar o vídeo escolhido pelo Higgsfield vendo o custo antes so that eu use os créditos com consciência.

**Acceptance Criteria:**
- [ ] `lib/integracoes.ts`: `HIGGSFIELD = integracaoMCP({ id: "HIGGSFIELD", titulo: "Higgsfield", descricao: "Gera o vídeo a partir da imagem do produto com os efeitos da plataforma", urlPadrao: "https://mcp.higgsfield.ai", oauth: true })` com campos avançados `HIGGSFIELD_API_KEY_ID` e `HIGGSFIELD_API_KEY_SECRET` (chave server-to-server da `api.higgsfield.ai`, usada quando presente em vez do MCP); `INTEGRACOES = [OPENROUTER, HIGGSFIELD, NOTIFICACOES]`
- [ ] Novo `lib/higgsfield.ts` com uma interface única `{ listarEfeitos(), enviarImagem(dataUrl), gerarVideo({ imagemId, efeitoId, formato, prompt }), estado(jobId), saldo() }` e duas implementações: MCP (ferramentas `presets_show`, `media_upload` ou `media_import_url`, `generate_video` com o modelo de presets, `job_status` ou `jobs_wait`, `show_generation_by_ids`, `balance`, escolhidas por nome com fallback por palavra-chave) e REST (`Authorization: Key id:secret`, `POST /{modelo}` e polling do `request_id`); a lista de efeitos remota substitui a lista interna de estilos e é mapeada por nome para o `efeitoSugerido` de cada conceito
- [ ] Antes de gerar: diálogo de confirmação com o efeito, o formato, o custo estimado em créditos (da ferramenta de custos ou da tabela de preços quando disponível) e o saldo atual; só após "Confirmar e gerar" o job é criado
- [ ] Acompanhamento: a tela consulta `GET /api/videos/<id>` a cada 5 s com etapas ("Enviando a imagem", "Gerando o vídeo", "Finalizando"); pronto, mostra `<video controls>` com a URL, "Baixar vídeo" e "Gerar outro efeito"; falha mostra o motivo em português e não cobra (o app explica que falhas não consomem créditos quando o provedor informar)
- [ ] `GET /api/status` lista `integrations: { higgsfield }` e a tela mostra o saldo de créditos em `MaisDetalhes` quando conectado
- [ ] Lint e build passam; testar ponta a ponta com um servidor MCP de teste local que simule as ferramentas (script descartável) e, se houver conta, uma geração real de 5 segundos documentada no README com o custo observado

### US-028: Entregar, pedidos por link e ferramentas MCP
**Description:** As a executivo de marketing, I want levar o vídeo e as legendas para as redes e deixar a equipe pedir vídeos so that a campanha saia do app.

**Acceptance Criteria:**
- [ ] `Entregar` com extras "Baixar vídeo", "Copiar legenda do Instagram", "Copiar legenda do LinkedIn", "Copiar legenda do TikTok" e "Baixar roteiro (texto)"; a folha de impressão mostra o storyboard e o roteiro
- [ ] Formulário público "Pedir um vídeo" (tipo `pedido-video`: produto, objetivo, público, imagem como `arquivo`): cada pedido gera os três conceitos e aparece em `MaisDetalhes` como "Pedidos recebidos" com "Abrir"; a geração do vídeo continua exigindo confirmação de quem opera o app
- [ ] `lib/ferramentas.ts` declara `criar_conceitos(briefing)`, `gerar_video(conceitoId, efeito?, confirmar)` (devolve o custo estimado e o plano quando `confirmar` for falso) e `estado_video(id)`; `NOME_SERVIDOR = "videos-campanha"`
- [ ] Lint e build passam; testar formulário e MCP via curl; verificar no navegador

### Fase 8, fechamento da suíte

### US-029: Catálogo, documentação e scripts para dezessete apps
**Description:** As a pessoa que mantém a suíte, I want que catálogo, scripts e documentação reconheçam os sete apps novos so that publicar e verificar continue sendo um comando.

**Acceptance Criteria:**
- [ ] `catalogo.json` com as dezessete entradas validadas por `node scripts/gerar-deploy.mjs`; `render.yaml` da raiz e dos apps regenerados; `docker-compose.yml` com os sete serviços novos (portas 3011 a 3017) e volumes nomeados
- [ ] `scripts/verificar-padrao.sh` compara os dezesseis apps contra o `pdi-time` (lê a lista de `catalogo.json` em vez de uma lista fixa, se ainda não for assim) e inclui `lib/mcp-oauth.ts` e `app/api/setup/oauth/mcp/**` nos caminhos comparados; sai com código 0
- [ ] `scripts/verificar-jargao.mjs` roda limpo nos dezessete; exceções, se houver, registradas em `scripts/jargao-excecoes.json` com justificativa
- [ ] `PADRAO.md`: "Dez apps" passa a "Dezessete apps"; seções novas curtas para `askVision` e modelo de visão, campos `escala` e `escolha`, cliente MCP com OAuth (`integracaoMCP` e as rotas), webhooks assinados (exemplo do Simulador) e páginas públicas geradas (`/s/[id]` do Clone de Site, com a regra de CSP e `noindex`)
- [ ] `README.md` da raiz: tabela de apps e portas com os sete novos; cada app novo tem seu `README.md` no formato do de referência, com a tabela de variáveis e os links de onde obter cada chave
- [ ] `site/index.html` não precisa de mudança estrutural (lê o catálogo), mas as áreas novas ("Estratégia", "Inovação", "TI", "Produto") aparecem no filtro; conferir e ajustar o mapa de áreas se for fixo
- [ ] Lint e build passam nos dezessete

### US-030: Verificação final e capturas dos sete apps
**Description:** As a pessoa que mantém a suíte, I want os sete apps verificados ponta a ponta antes do push so that o workflow publique imagens que funcionam.

**Acceptance Criteria:**
- [ ] Para cada app novo, o checklist "Verificação obrigatória" do `PADRAO.md` executado por inteiro: build standalone, `curl` em `/api/health`, `/api/status`, `/api/setup` (GET, PUT com chave falsa, PUT com `null`), `POST /api/setup/testar` por integração (`ok:false` com mensagem clara), rotas principais em demo e entradas inválidas com 400
- [ ] `POST /mcp` responde `initialize`, `tools/list` e `tools/call` nos sete, com e sem código
- [ ] Capturas de cada app (vazio 1400x900, `?exemplo=1&captura=1` em 1400x1500 e celular 390 px) e de `/setup` abertas com a ferramenta Read e corrigidas até ficarem limpas; em 1400x900 o botão primário está visível sem rolagem nos sete
- [ ] `progress.txt` registra os aprendizados por app e os `CLAUDE.md` de cada app novo trazem as notas específicas (padrão dos existentes)
- [ ] Push na `main` e conferência do resumo do workflow: imagens publicadas, capturas geradas (ou aviso registrado) e catálogo público com os dezessete cartões

## Primeira rodada (escopo do `prd.json`)

Decidido em 14/09/2026: a primeira rodada implementa os sete apps com escopo reduzido. O `prd.json` (branch `ralph/novos-apps`, 34 histórias) segue esta lista, não a versão completa das histórias acima. O que ficou de fora volta em uma rodada seguinte, com o app já publicado e testado.

| App | Entra agora | Fica para depois |
|---|---|---|
| Radar de Sinais | Grafo em SVG próprio; fontes sem chave (Hacker News, Reddit, GitHub) e Exa; síntese em uma etapa (duas consultas fixas por tema e `askJSON`) com fontes verificadas no servidor; rotina semanal com "Novos" e "Continuam fortes"; exportar grafo em JSON | Tavily; agente de pesquisa com `askWithTools` e leitura de páginas; "Perderam força" na rotina |
| Bússola de IA | Campos `escala` e `escolha` compartilhados; questionário modelo; editor de perguntas; gerar questionário por setor; link único com limite e expiração; respostas anônimas com área e cargo opcionais; radar em SVG só com o polígono da empresa; análise da IA; MCP | Rotina de aviso de novas respostas; polígono de dispersão no gráfico |
| Simulador de Vendas | Vendedores e cenários; análise de conversa colada; integração ElevenLabs com agente existente e webhook assinado; sala pública por texto (IA como cliente) e por voz (widget); painel da equipe com tabela, tendência e critérios fracos; resumo semanal; MCP | Criar agente pela API; gráfico de linhas de evolução; formulário "pedir para o time treinar" |
| Custos de IA | Faturas e orçamento em SQLite; câmbio manual; leitor de PDF e texto com prévia; Gmail por OAuth; importação por período; alertas "Acima do planejado" e "Assinatura nova"; fechamento mensal; MCP; CSV. Outlook é a última história do `prd.json` e pode ser cortada | Cotação PTAX automática; alertas de duplicidade e anual vencendo; formulário público de recibo |
| Clone de Site | `askVision` compartilhado; geração a partir de imagem; prévia em iframe com modo celular; edições por instrução e versões; trocar textos pelos da empresa; publicar em `/s/<id>`; baixar; MCP | URL com serviço de captura; "Aplicar a minha marca" determinístico; formulário de pedido de página |
| Prospecção no LinkedIn | Cliente MCP com OAuth compartilhado; perfil ideal; leads e sequências; Prospect Halo com busca, aprovação e envio confirmado; rotina de leads semanais; MCP | Rotina de andamento da campanha; cartão "Contas conectadas"; envio de leads ao CRM |
| Vídeos de Campanha | Briefing; três conceitos; storyboard em CSS; Higgsfield só via MCP com OAuth, custo e saldo antes de gerar; acompanhamento do job; entregar vídeo, legendas e roteiro; MCP | Chave REST do Higgsfield em "Opções avançadas"; formulário de pedido de vídeo |

Capacidades declaradas no catálogo nesta rodada: Radar `artefato, mcp, rotina`; Bússola `artefato, mcp, formulario`; Simulador `artefato, mcp, rotina`; Custos `artefato, mcp, rotina`; Clone `artefato, mcp`; LinkedIn `artefato, mcp, rotina`; Vídeos `artefato, mcp`.

Respostas assumidas para as perguntas abertas nesta rodada: dois apps de prospecção (1); credenciais do Google e da Microsoft vêm de variáveis de ambiente de quem faz o deploy (3); Higgsfield só por OAuth (4); só Exa como busca paga opcional (5); um agente ElevenLabs existente com variáveis dinâmicas (7); respondentes anônimos com área opcional (8); nome "Clone de Site" mantido (9); só o chip "Em breve" (10); guardar a URL do vídeo e avisar a validade (11).

## Functional Requirements

Transversais
- FR-1: `lib/formularios.ts` aceita campos `escala` e `escolha`, com validação de intervalo e de opções no servidor, e `secao` para agrupar perguntas.
- FR-2: `lib/ai.ts` expõe `askVision`, `visionEnabled` e `visionModelName`; o modelo de visão é configurável em `/setup` e `GET /api/status` informa `vision`.
- FR-3: `lib/mcp-oauth.ts` autoriza servidores MCP remotos por OAuth (descoberta, registro dinâmico, PKCE, renovação) e `integracaoMCP()` gera o cartão com "Autorizar" e o código manual em "Opções avançadas".
- FR-4: Toda mudança em arquivo compartilhado é replicada nos demais apps na mesma história e `scripts/verificar-padrao.sh` passa ao fim dela.

Radar de Sinais
- FR-5: O radar consulta ao menos as fontes sem chave (Hacker News, Reddit, GitHub) e, quando configurado, Exa ou Tavily, restringindo ao período escolhido.
- FR-6: Toda fonte citada em um sinal existe entre os achados da rodada; o servidor descarta o que o modelo inventar.
- FR-7: O grafo é SVG sem dependência, com até 120 nós, interativo por clique e teclado, e exportável em JSON no formato `{ nodes, edges, communities }`.

Bússola de IA
- FR-8: O questionário modelo tem seis dimensões e pode ser editado, ampliado ou gerado por setor antes de virar link.
- FR-9: O link público aceita respostas anônimas, mostra progresso por dimensão e respeita limite e expiração.
- FR-10: Médias, nível e dispersão são calculados no servidor; a IA recebe só agregados e respostas de texto.

Simulador de Vendas
- FR-11: O webhook de pós-conversa só aceita requisições com assinatura HMAC válida dentro de 30 minutos e responde 200 antes de processar.
- FR-12: A sala de simulação funciona sem ElevenLabs (texto) e com ElevenLabs (voz), e o resultado aparece na própria sala.
- FR-13: Transcrições e análises expiram em 90 dias.
- FR-14: "Ligações reais" e "CRM" aparecem como "Em breve", sem formulário nem promessa de data.

Custos de IA
- FR-15: O app nunca grava o corpo dos e-mails; grava só os campos extraídos e a referência da mensagem.
- FR-16: Faturas reconhecidas passam por prévia e confirmação antes de entrar no histórico.
- FR-17: Alertas (acima do planejado, assinatura nova, duplicidade, anual vencendo) são calculados sem IA.
- FR-18: Gmail e Outlook são conectados por OAuth com escopo só de leitura; as credenciais do app vêm de variáveis de ambiente e, sem elas, o cartão explica o que a equipe técnica precisa criar.

Clone de Site
- FR-19: A geração parte de uma imagem (ou de uma URL quando há serviço de captura) e devolve um único arquivo HTML validado.
- FR-20: A prévia roda em `iframe` com `sandbox`; a página publicada em `/s/<id>` sai com CSP restrita e `noindex`.
- FR-21: A tela exibe o aviso sobre conteúdo de terceiros e oferece a troca de textos pelos da empresa.

Prospecção no LinkedIn
- FR-22: Leads reais vêm só do Prospect Halo autorizado pela pessoa; sem ele, os leads são fictícios e rotulados.
- FR-23: Nenhuma mensagem é enviada sem confirmação explícita na tela ou `confirmar: true` na ferramenta MCP; rotinas nunca enviam.
- FR-24: Ferramentas remotas são descobertas em tempo de execução e o mapeamento pode ser corrigido em "Opções avançadas".

Vídeos de Campanha
- FR-25: Gerar um vídeo exige confirmação com custo estimado e saldo visíveis.
- FR-26: A demonstração mostra um storyboard rotulado como prévia ilustrativa; o vídeo real só existe com Higgsfield conectado.
- FR-27: MCP e REST do Higgsfield ficam atrás da mesma interface em `lib/higgsfield.ts`.

Suíte
- FR-28: Cada app novo declara em `catalogo.json` só as capacidades de fato implementadas e ganha porta sequencial de 3011 a 3017.
- FR-29: Cada app novo expõe de uma a três ferramentas MCP em `lib/ferramentas.ts` e as usa a partir da mesma função das rotas HTTP.

## Non-Goals

- Login, múltiplos usuários, permissões, times ou painel que agregue os dezessete apps.
- Rodar Python, o `last30days-skill`, o `screenshot-to-code` ou o `graphify` como processo ou dependência; só o método deles é portado.
- Biblioteca de grafo, de gráfico ou de UI. Se o layout de força próprio não bastar, `d3-force` (5,7 kB) é a única exceção admitida, registrada no README.
- Ligações reais e integração com CRM no Simulador de Vendas nesta rodada (ficam como "Em breve").
- Raspar o LinkedIn diretamente ou enviar mensagens sem passar pelo Prospect Halo e pela aprovação da pessoa.
- Servidor de e-mail próprio, envio de e-mail pelo app ou gravação do corpo dos e-mails lidos.
- Copiar textos, logotipos e imagens de terceiros como produto final no Clone de Site; o app substitui imagens por blocos e convida a trocar os textos.
- Publicar vídeos diretamente nas redes (o app entrega o arquivo e as legendas).
- Editor visual de página (arrastar elementos) no Clone de Site; edições são por instrução.
- Cobrança, planos, telemetria ou modo escuro nos apps.

## Design Considerations

- Tudo o que a PRD anterior fixou continua: Manrope, h1 do painel em 26 px, `Destaque` em 40 px, `.summary` em 17 px, acento só em ação primária, `Destaque`, links e "seu lado"; semântica fixa `ok`, `warn`, `danger`; ícones SVG de traço 1,5 px; só o `reveal` como animação (mais a animação discreta do storyboard, desligada por `prefers-reduced-motion`).
- Grafo (Radar): fundo `bg`, arestas em cinza com espessura por peso, nós de sinal no acento, temas maiores com rótulo sempre visível, atores e tecnologias com rótulo só ao focar; o nó selecionado ganha anel; o resto esmaece a 30%. Rótulos em px fixos. Sem física contínua depois do layout inicial. No celular, altura de 360 px e a lista abaixo.
- Gráfico radar (Bússola): seis eixos, três anéis rotulados 1, 3 e 5, polígono em acento com preenchimento a 15%, dispersão em cinza tracejado; a tabela abaixo garante leitura sem cor.
- Gráficos de linha e barras (Simulador e Custos): seguem `dataviz` e o padrão do Analista Financeiro; uma série destacada e as demais em cinza; eixo com três marcas.
- Storyboard (Vídeos): quadros na proporção escolhida, imagem do produto ao fundo com sobreposição escura a 40%, texto na tela em Manrope 700, rótulo "Prévia ilustrativa" fixo no canto.
- Prévia de página (Clone): `iframe` com borda de 1 px e alternância computador e celular como dois botões `btn-ghost`; o código em `<details>` com fonte mono de 13 px.
- Telas públicas (Bússola, sala de simulação, pedidos): cartão centrado de 560 px, marca do app no topo, tema claro; a sala de simulação é a exceção de largura (720 px) para caber o widget e a análise.
- Confirmações (LinkedIn, Higgsfield): diálogo com título, o que vai acontecer em uma frase, o custo ou alcance em `Destaque` pequeno e dois botões ("Confirmar e ...", "Cancelar"); fecha com Esc.
- Bloco "Em breve" (Simulador): dois cartões com opacidade 60%, chip neutro "Em breve", sem botão.

## Technical Considerations

- Portas: 3011 `radar-sinais`, 3012 `bussola-ia`, 3013 `simulador-vendas`, 3014 `custos-ia`, 3015 `clone-site`, 3016 `prospeccao-linkedin`, 3017 `videos-campanha`.
- Novo app: copiar `pdi-time/`, manter os 19 caminhos de `scripts/verificar-padrao.sh` intocados, escrever só os arquivos próprios listados em P3, rodar `gerar-icones.mjs` e `gerar-deploy.mjs`, acrescentar ao compose. O workflow só reconstrói imagens de pastas cujo nome é um `id` do catálogo: a entrada no catálogo precisa existir no mesmo push da pasta.
- `askWithTools` já existe em `lib/ai.ts` (loop manual de `tool_calls`); o Radar o usa com `buscar` e `ler`. O modelo gratuito padrão pode não sustentar tool use estável; o README do Radar recomenda um modelo com suporte a ferramentas e o app cai para a síntese em uma etapa (busca fixa por tema e `askJSON`) quando o loop falhar duas vezes.
- Modelo com visão: a lista `MODELOS_VISAO` deve ser curta e revisada; modelos gratuitos com visão no OpenRouter mudam com frequência. `askVision` falha com mensagem clara ("O modelo configurado não lê imagens") quando o provedor devolver erro de modalidade.
- OAuth em MCP: seguir a especificação de autorização do MCP (metadata em `/.well-known/oauth-protected-resource`, servidor de autorização em `/.well-known/oauth-authorization-server`, registro dinâmico RFC 7591, PKCE obrigatório). Guardar `client_id` por prefixo em `lib/store.ts`. Renovar com `refresh_token` quando faltar menos de 60 s para expirar. Um único par de rotas compartilhadas serve todos os prefixos.
- Prospect Halo: os nomes das ferramentas do MCP não são públicos; o app descobre por `tools/list` e escolhe por palavra-chave, como `crm-mcp.ts`. O teste automatizado usa um servidor MCP falso; o teste real depende de uma conta (plano Pro, US$ 59/mês, com 7 dias de teste).
- Higgsfield: "Effects 2.0" corresponde, no MCP, aos presets de imagem para vídeo (`presets_show` e o modelo de presets em `generate_video`); a REST em `api.higgsfield.ai` usa `Authorization: Key id:secret`, jobs assíncronos e cobra só em `completed`. A interface única em `lib/higgsfield.ts` isola essa diferença. Concorrência limitada pelo provedor: o app gera um vídeo por vez.
- ElevenLabs: o widget exige agente público com autenticação desligada e allowlist de domínios na aba de segurança do agente; o README do Simulador explica. O webhook é configurado no workspace (Configurações, Webhooks) e ligado ao agente; o app mostra a URL com `baseUrl(req)`. Variáveis dinâmicas (`vendedor_id`, `sala_token`) viajam pelo widget e voltam em `conversation_initiation_client_data.dynamic_variables`.
- Gmail e Outlook: OAuth authorization code com PKCE no padrão do OpenRouter (`app/api/setup/oauth/<provedor>/{route,callback}`), com `client_secret` do app em variável de ambiente. Gmail: escopo `gmail.readonly` é restrito; app "em teste" limita a 100 usuários e o refresh token expira em 7 dias; uso público exige verificação (CASA); um app interno do Workspace da empresa dispensa. Outlook: `Mail.Read` não exige consentimento de administrador; app multi-tenant sem verificação de editor mostra aviso ao usuário. Ambos usam `fetch` nativo, sem SDK.
- Busca do Radar: Exa (`x-api-key`, `startPublishedDate`, US$ 10 por mês grátis) tem data de publicação confiável em qualquer categoria; Tavily (`Bearer`, `topic: "news"`, 1.000 créditos por mês grátis) é mais barato em volume. As fontes sem chave (Algolia do Hacker News, `reddit.com/search.json` a 1 requisição por segundo, API de busca do GitHub sem token a 10 requisições por minuto) precisam de `User-Agent` próprio e tolerância a 429.
- Cotação: a API pública PTAX do Banco Central (`olinda.bcb.gov.br`) dispensa chave; se estiver fora, o campo manual do setup vale.
- Segurança de páginas publicadas (`/s/<id>`): `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src https://cdn.tailwindcss.com 'unsafe-inline'; img-src data: https:`, `X-Robots-Tag: noindex`, `Cache-Control: no-store`. O HTML gerado é servido como está; o prompt proíbe scripts além do Tailwind e o servidor remove `<script>` de outras origens.
- Retenção: `expiraEmDias: 90` em conversas do Simulador; faturas do Custos sem expiração (são registros contábeis) com "Apagar tudo" em `MaisDetalhes`; páginas do Clone sem expiração enquanto publicadas.
- Testes locais de integrações remotas: um servidor MCP de teste (script descartável fora do repositório, com OAuth mínimo) cobre Prospect Halo e Higgsfield; um script que calcula o HMAC cobre o webhook da ElevenLabs. Nada disso entra no repositório além da descrição no `progress.txt`.

Matriz de capacidades por app (utilidade x complexidade):

| App | Capacidade | História | Utilidade | Complexidade |
|---|---|---|---|---|
| Todos os sete | Artefato (PDF, link, e-mail, histórico) | esqueleto de cada app | Alta | Baixa |
| Todos os sete | MCP (expor) | última história de cada app | Alta | Baixa |
| Radar de Sinais | Busca em fontes reais e agente de pesquisa | US-005, US-006 | Alta | Alta |
| Radar de Sinais | Rotina radar semanal com o que mudou | US-007 | Alta | Média |
| Bússola de IA | Formulário questionário com link único | US-009 | Alta | Média |
| Bússola de IA | Rotina aviso de respostas | US-011 | Média | Baixa |
| Simulador de Vendas | Webhook assinado e sala pública por voz | US-013 | Alta | Alta |
| Simulador de Vendas | Rotina resumo semanal e formulário de treino | US-015 | Alta | Baixa |
| Custos de IA | OAuth Gmail e Outlook e leitura de notas | US-018 | Alta | Alta |
| Custos de IA | Rotina fechamento mensal e formulário de recibo | US-019 | Alta | Média |
| Clone de Site | Visão e página publicada em `/s/<id>` | US-020, US-022 | Alta | Média |
| Clone de Site | Formulário pedido de página | US-022 | Média | Baixa |
| Prospecção no LinkedIn | MCP (consumir) Prospect Halo com OAuth e confirmação | US-024 | Alta | Alta |
| Prospecção no LinkedIn | Rotina leads semanais e andamento | US-025 | Alta | Média |
| Vídeos de Campanha | MCP (consumir) Higgsfield com custo antes | US-027 | Alta | Alta |
| Vídeos de Campanha | Formulário pedido de vídeo | US-028 | Média | Baixa |

## Success Metrics

| Métrica | Meta |
|---|---|
| Apps publicados no catálogo com prévia | 17 de 17 |
| Apps novos que funcionam em demo sem chave, testados por curl e capturas | 7 de 7 |
| `verificar-padrao.sh` e `verificar-jargao.mjs` limpos | 17 de 17 |
| Apps novos com `POST /mcp` respondendo `tools/list` e `tools/call` | 7 de 7 |
| Apps novos com pelo menos uma capacidade além de Artefato e MCP | 7 de 7 |
| Botão primário visível sem rolagem em 1400x900 | 7 de 7 |
| Ações pagas ou externas sem confirmação | 0 |
| Dependências novas além de `unpdf` | 0 (no máximo `d3-force`, se justificado) |
| Teste com 5 executivos por app | 5 de 5 entendem o app em 10 s; 4 de 5 conectam uma integração sozinhos |

## Open Questions

1. Prospecção no LinkedIn e Prospecção com IA (Apollo) ficam como dois apps, como pedido, ou o Prospect Halo entra como integração do app existente? A PRD assume dois apps, com posicionamentos distintos (LinkedIn com envio aprovado x lista e abordagem por e-mail).
2. Custos de IA: o app do Google Cloud para o Gmail será interno do Workspace da empresa (dispensa verificação, só contas do domínio) ou público (exige verificação de escopo restrito e avaliação de segurança anual)? A PRD entrega o fluxo e documenta as duas rotas; a decisão define quem pode usar.
3. Onde ficam `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID` e `MICROSOFT_CLIENT_SECRET`: embutidas na imagem publicada (como o Trello) ou exigidas de quem faz o deploy? A PRD assume variáveis de ambiente de quem faz o deploy.
4. Higgsfield: o padrão do cartão é "Autorizar" (MCP com OAuth, cobra do plano pessoal da pessoa) ou a chave de API (créditos pré-pagos da empresa)? A PRD assume OAuth como padrão e a chave em "Opções avançadas".
5. Radar: Exa e Tavily entram os dois como opcionais, ou escolhemos um? A PRD mantém os dois; se for um só, Exa pela data de publicação confiável.
6. Modelo de visão padrão: qual modelo gratuito com visão do OpenRouter está estável hoje? Definir no início da US-002.
7. Simulador: um agente ElevenLabs único com variáveis dinâmicas (assume-se) ou um agente por cenário criado pela API? O primeiro é mais simples; o segundo permite vozes e personalidades por cenário.
8. Bússola: respondentes anônimos por padrão (assume-se) ou identificação obrigatória para o cruzamento liderança x operação? Sem identificação, o bloco "Onde discordam" só existe quando a área for informada.
9. Clone de Site: o nome "Clone de Site" comunica o que o app faz, mas pode soar como cópia indevida; alternativa "Página em Minutos". Decidir antes de gerar os ícones.
10. Simulador: "Em breve" para ligações reais e CRM deve ter formulário de interesse ("Me avise quando sair") ou fica só o chip? A PRD assume só o chip.
11. Vídeos: o app deve guardar o arquivo do vídeo (baixar para `DATA_DIR`) ou só a URL do provedor (que expira em cerca de 7 dias na REST)? A PRD assume guardar a URL e avisar a validade; baixar exige disco.
