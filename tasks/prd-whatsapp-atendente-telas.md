# PRD: Atendente no WhatsApp — telas de produto (Início, Conversas, Assistente, conexão por QR Code, Relatórios) e primeiro app independente da suíte

Data: 17/09/2026. Escopo: só `whatsapp-atendente/` (mais a mudança de infraestrutura na raiz que permite a um app se tornar independente: `catalogo.json`, `scripts/verificar-padrao.sh`, `PADRAO.md`). Referência visual: cinco mockups enviados por Rafael em 17/09/2026 (Início, Conversas, Assistente/setup do agente, Relatórios e a ideia de uma conexão por QR Code). Continua `tasks/prd-revisao-onboarding-erros-conta.md` (15/09/2026), cujas histórias US-040 deixaram este app funcional, mas ainda no formato "uma tela, um formulário, um palco".

## Introduction

Hoje o Atendente no WhatsApp é uma tela única: à esquerda o formulário do negócio, à direita um celular simulado e, embaixo, uma tabela "Conversas recebidas" que guarda só a última pergunta e a última resposta de cada número. Para quem só quer ver a demonstração, funciona. Para quem vai **operar** o atendente todo dia (a dona da clínica, a pessoa da recepção, o gerente da loja), faltam três coisas que os mockups deixam claras:

1. **Ver o que está acontecendo** sem abrir o WhatsApp no celular: quais conversas a IA resolveu, quais ela passou para uma pessoa e ainda ninguém respondeu, quanto tempo ela leva para responder.
2. **Intervir**: assumir uma conversa, responder pelo número da empresa de dentro do app e devolver para a IA depois.
3. **Conectar o número sem equipe técnica**: hoje a conexão é pela WhatsApp Cloud API da Meta (conta Meta Business, código de acesso permanente, identificador do número, webhook colado no painel da Meta), avaliada em `tasks/oauth-integracoes.md` como "o pior fluxo de setup da suíte", com uma verificação de negócio da Meta que pode levar semanas. A z-api.io conecta um número comum escaneando um QR Code, como o WhatsApp Web.

O app deixa de ser uma tela e passa a ter cinco: **Início** (painel do dia), **Conversas** (lista, conversa aberta e contato), **Assistente** (criar e testar o atendente em três passos, com a conexão como terceiro passo), **Relatórios** (desempenho no período) e **Configurações** (o `/setup` que já existe, onde mora o cartão de conexão do WhatsApp). O público continua não técnico: cada tela diz o que está acontecendo e o que fazer, em português, sem termos como webhook, token, instância ou API fora de "Opções avançadas"/"Para a equipe técnica".

### Decisões tomadas em 17/09/2026 (Rafael)

- **D1. Navegação:** o cabeçalho compartilhado da suíte (`Topbar`) continua, com os destinos deste app: Início, Conversas, Assistente, Relatórios, Configurações. Não há barra lateral. "Integrações" e "Automações" dos mockups ficam dentro de Configurações (cartões de integração e "Rotinas", que já existem). "Precisa de ajuda?" fica de fora.
- **D2. Conexão do WhatsApp:** a empresa cria a própria conta na z-api.io; em Configurações a pessoa cola três valores uma vez (passo a passo com prints), e a partir daí só escaneia o QR Code dentro do app. A conexão pela Meta Cloud API continua existindo em "Opções avançadas" para quem já usa. Não há OAuth na z-api; a experiência "só escanear" para quem ainda não tem conta (conta z-api da StartSe, instância criada sob demanda) fica registrada em Open Questions.
- **D3. Conversas:** histórico completo em SQLite, status por conversa, abas, busca e período, "Assumir atendimento", "Devolver para a IA", "Marcar como resolvida" e resposta manual pelo número real. Fora: observações, etiquetas, "ações rápidas" e um botão separado de "Transferir para humano" (assumir cobre os dois casos).
- **D4. Relatórios:** quatro indicadores (Conversas, Resolvidas pela IA, Passadas para uma pessoa, Tempo médio de resposta), conversas ao longo do tempo, principais assuntos (classificados pela IA) e conversas que precisam de atenção. Fora: "Canais de origem" e "Leads identificados".
- **D5. Apps independentes:** este app é o **piloto** de um modelo em que um app da suíte deixa de ser comparado byte a byte com o `pdi-time` na camada de produto (telas, componentes visuais, navegação), mantendo em comum só a camada de infraestrutura (conta, sessão, banco, IA, setup, MCP, formulários, rotinas). A Fase 0 define esse modelo antes de qualquer tela mudar, para que as telas novas nasçam já no formato independente.

### Premissas

- P1. `PADRAO.md` continua valendo no que não for camada de produto: Next.js 16, Tailwind 4, React 19, `node:sqlite`, IA via OpenRouter, português sem jargão na tela (`scripts/verificar-jargao.mjs`), acento do segmento Atendimento (`#0e7c6a`, `scripts/verificar-paleta.mjs`), nenhuma dependência nova salvo a que esta PRD nomeia em Open Questions (leitura de DOCX).
- P2. Tudo funciona em **modo demonstração**: sem IA conectada e sem número conectado, as cinco telas mostram um conjunto de conversas de exemplo (os nomes e as mensagens dos mockups: Mariana Costa, Carlos Menezes, Ana Paula, Ricardo Lima, Fernanda Alves, João Pedro, Luciana Ferraz, Eduardo Santos, Camila Souza), com o chip "Exemplo" onde aparecem e um aviso de uma frase com o link para conectar o número. As conversas de exemplo somem sozinhas quando a primeira conversa real chega.
- P3. Gráficos são SVG desenhado à mão no próprio componente (linha, barras horizontais), sem biblioteca. Sem "sparklines" nos indicadores do Início (o mockup tem; a variação percentual já diz o mesmo com menos ruído).
- P4. Uma conta de administrador por instância (modelo da suíte). Por isso o filtro "Todos os atendentes" do mockup não existe: só há a IA e "você".
- P5. A conexão z-api usa os endpoints públicos documentados em https://developer.z-api.io (`status`, `qr-code/image`, `send-text`, `disconnect`, `restore-session`, `update-webhook-*`, cabeçalho `Client-Token`). Os nomes exatos e os formatos de resposta são **confirmados na documentação na hora de implementar** (US-006), nunca assumidos a partir desta PRD.
- P6. Textos das telas seguem os limites de "Menos texto na tela" do `PADRAO.md`: título de painel até 8 palavras, apoio até 20, uma linha de ajuda por campo.
- P7. Toda captura de verificação é feita em desktop (1400x1000) e celular (390 de largura), como nas rodadas anteriores.

## Goals

- Uma pessoa não técnica conecta o número da empresa em menos de 10 minutos, sem abrir nada além do app e do painel da z-api, e vê dentro do app se está conectado.
- Quem opera o atendimento enxerga, ao abrir o app, quantas conversas precisam de alguém hoje e chega a cada uma em um clique.
- É possível assumir uma conversa, responder pelo número real e devolver para a IA sem sair da tela de Conversas.
- Criar e testar o atendente segue três passos numerados (Configurar, Testar, Conectar), com o telefone de prévia atualizando enquanto a pessoa digita.
- Relatórios respondem "a IA está resolvendo?" com quatro números e um gráfico, em qualquer período, e exportam para planilha.
- O app passa a ser um app independente: só a infraestrutura continua comparada com o `pdi-time`, e o modelo fica documentado para o próximo app que quiser seguir o mesmo caminho.

## User Stories

As histórias estão em ordem de implementação. Cada uma cabe em uma sessão de trabalho e termina com lint, build e (quando tem tela) verificação no navegador. Onde uma história cita "verificar no navegador", a verificação é em desktop 1400x1000 e celular 390, abrindo as capturas e corrigindo o que estiver quebrado.

### Fase 0: o app vira independente

### US-001: Registrar o modelo de app independente na suíte
**Description:** As a mantenedor da suíte, I want que um app possa evoluir a própria camada de produto sem ser reprovado por `scripts/verificar-padrao.sh` so that o Atendente no WhatsApp ganhe as telas novas sem replicar nada nos outros 16 apps nem virar uma pilha de exceções.

**Acceptance Criteria:**
- [ ] `catalogo.json`: a entrada de `whatsapp-atendente` ganha `"independente": true`; `scripts/gerar-deploy.mjs` aceita o campo (opcional, booleano) sem alterar o `render.yaml` gerado
- [ ] `scripts/verificar-padrao.sh` divide a lista `ARQUIVOS` em duas: `INFRA` (`lib/ai.ts`, `lib/store.ts`, `lib/conta.ts`, `lib/conta-comum.ts`, `lib/setup-comum.ts`, `lib/historico.ts`, `lib/mcp.ts`, `lib/mcp-cliente.ts`, `lib/mcp-oauth.ts`, `lib/formularios.ts`, `lib/notificacoes.ts`, `lib/email-envio.ts`, `lib/rotinas.ts`, `lib/modelos.ts`, `app/mcp`, `app/f`, `app/api/rotinas`, `app/api/setup`, `app/api/status`, `app/api/conta`, `app/api/historico`, `proxy.ts`, `eslint.config.mjs`) e `PRODUTO` (`components/ui.tsx`, `components/setup.tsx`, `components/conta.tsx`, `lib/navegacao.ts`, `lib/ilustracao.ts`, `app/globals.css`, `public/ilustracoes/icones`). Para um app com `independente: true`, só `INFRA` e a `ESTRUTURA` (`app/conta`, `app/entrar`, `app/r/[id]`, `app/imprimir/[id]`; `app/historico/page.tsx` sai da estrutura obrigatória de um app independente) são conferidas; os demais continuam como hoje
- [ ] A saída do script diz, por app independente, "camada de produto própria (independente: true)" em vez de listar divergências dessa camada
- [ ] `PADRAO.md` ganha a seção "Apps independentes": o que um app independente pode mudar (telas, componentes, navegação, estilos depois dos tokens, `setup.tsx`), o que não pode (tudo em `INFRA`, `GET /api/health`, `GET /api/status` no formato da suíte, `/mcp`, `/f/<token>`, rotinas, conta e sessão, verificação de jargão e de paleta), e a regra de que um arquivo de produto copiado do `pdi-time` passa a ser do app a partir da data registrada no `CLAUDE.md` dele, sem obrigação de acompanhar melhorias futuras do `pdi-time` (e vice-versa)
- [ ] `whatsapp-atendente/CLAUDE.md` registra a data (17/09/2026) e o commit a partir do qual `components/ui.tsx`, `components/setup.tsx`, `components/conta.tsx`, `lib/navegacao.ts`, `lib/ilustracao.ts` e `app/globals.css` são próprios do app
- [ ] `scripts/verificar-padrao.sh` sai 0 para os 17 apps antes e depois da mudança (nenhum outro app muda de comportamento)

### US-002: Navegação e esqueleto das páginas novas
**Description:** As a usuário, I want ver no cabeçalho os cinco lugares do app (Início, Conversas, Assistente, Relatórios, Configurações) so that eu saiba onde estou e para onde ir, mesmo antes de as telas ficarem prontas.

**Acceptance Criteria:**
- [ ] `lib/navegacao.ts` (agora próprio do app) exporta `NAVEGACAO` com Início `/`, Conversas `/conversas`, Assistente `/assistente`, Relatórios `/relatorios`, Configurações `/setup`; "Histórico" sai do cabeçalho e passa a ser linkado só de Relatórios ("Relatórios anteriores", US-019)
- [ ] Páginas `app/conversas/page.tsx`, `app/assistente/page.tsx`, `app/relatorios/page.tsx` existem, são client components, usam o mesmo `Topbar` e, até as histórias delas chegarem, mostram um `Empty` com título e a ação que leva ao que já existe (ex.: Assistente → "/") — nenhuma rota devolve 404
- [ ] `proxy.ts` não muda: as três páginas nascem privadas (exigem sessão), como toda rota nova
- [ ] O item ativo do cabeçalho reflete a rota atual nas cinco páginas (a lógica `ativo()` do `Topbar` já cobre prefixos)
- [ ] Lint e build passam; verificar no navegador (cabeçalho nas cinco rotas, desktop e celular com o menu recolhido)

### Fase 1: conversas de verdade (dados)

### US-003: Conversas e mensagens em SQLite, com status
**Description:** As a operador do atendimento, I want que toda conversa e toda mensagem fiquem guardadas so that eu possa abrir a conversa inteira, ver o status dela e nada se perca quando o app reiniciar.

**Acceptance Criteria:**
- [ ] Novo `lib/conversas.ts` cria em `lib/store.ts` (mesmo `app.sqlite`) as tabelas `conversas` (`numero` chave, `nome`, `origem` `simulador|whatsapp|mcp|exemplo`, `status` `ia|atencao|humano|resolvida`, `assunto` (nulo até a US-020), `exemplo` 0/1, `nao_lidas`, `criado_em`, `atualizado_em`) e `mensagens` (`id`, `numero`, `papel` `cliente|atendente|humano`, `texto`, `criado_em`, `ferramenta_usada`, `tempo_resposta_ms`)
- [ ] `lib/atendente.ts` deixa de usar o `Map` em memória: `responder()` lê o histórico (últimas 20 mensagens) e grava a pergunta e a resposta em `lib/conversas.ts`; `tempo_resposta_ms` é a diferença entre a mensagem do cliente e a resposta gravada
- [ ] Regras de status: conversa nova ou respondida pela IA → `ia`; IA terminou com o marcador de transferência → `atencao`; assumida por uma pessoa → `humano` (a IA **não responde** mensagens de um número em `humano`, só grava e soma `nao_lidas`); "Devolver para a IA" → `ia`; "Marcar como resolvida" → `resolvida`; uma conversa `ia` sem mensagem do cliente há mais de 24 h é lida como `resolvida` (calculado na leitura, não por tarefa agendada); `atencao` nunca resolve sozinha; mensagem nova do cliente numa `resolvida` reabre como `ia`
- [ ] `listarConversas({ periodo?, status?, busca? })`, `obterConversa(numero)` (com mensagens), `assumir(numero)`, `devolver(numero)`, `resolver(numero)`, `registrarMensagemHumana(numero, texto)`, `apagarConversa(numero)`; `perguntasPendentes()` (relatório diário) passa a ler o banco e a contar frequência de verdade (a aproximação "quantos números têm essa última pergunta" documentada na US-060 deixa de ser necessária)
- [ ] `CanalOrigem` ganha `"exemplo"` e `rotuloOrigem()` passa a devolver "Exemplo" para ele; nenhum ternário novo por origem
- [ ] `POST /api/simular` deixa de gravar um snapshot da lista de conversas no histórico a cada mensagem (as conversas agora são persistidas por si); `app/r/[id]` continua abrindo registros antigos do tipo `atendimento` e os relatórios diários
- [ ] Testes com `curl` num servidor standalone e `DATA_DIR` em `/tmp`: simular três mensagens de dois números, reiniciar o servidor, conferir que `GET /api/conversas` devolve as duas conversas com as mensagens; transferência vira `atencao`; assumir e mandar nova mensagem do cliente não gera resposta da IA e soma `nao_lidas`
- [ ] Lint e build passam

### US-004: Conversas de exemplo no modo demonstração
**Description:** As a executivo avaliando o app, I want ver as telas cheias de conversas plausíveis mesmo sem conectar nada so that eu entenda o que o app faz antes de decidir conectar o número.

**Acceptance Criteria:**
- [ ] `lib/demo.ts` ganha `conversasExemplo()`: nove conversas com os nomes e mensagens dos mockups, cada uma com 2 a 6 mensagens (cliente e atendente), horários espalhados nos últimos 7 dias (relativos a "agora", para os gráficos terem forma), status variados (seis `ia`, duas `atencao`, uma `humano`, e "Obrigado pelo atendimento!" como `resolvida`), `assunto` já preenchido (Agendamentos, Preços, Tratamentos, Horário de atendimento, Outros) e `exemplo = 1`
- [ ] Na primeira leitura de `GET /api/conversas` com a tabela vazia e sem número conectado, as conversas de exemplo são gravadas no banco (uma vez); com um número conectado e a tabela vazia, nada é gravado
- [ ] Quando a primeira mensagem real de WhatsApp chega (`origem: "whatsapp"`), todas as conversas com `exemplo = 1` são apagadas, e o fato é registrado no log
- [ ] Toda tela que lista conversas mostra o chip "Exemplo" nas de exemplo e, quando só existem conversas de exemplo, um `Aviso` de uma frase: "Você está vendo conversas de exemplo. Conecte o número da empresa para ver as reais." com a ação para `/setup#whatsapp`
- [ ] Ações nas conversas de exemplo funcionam localmente (assumir, responder, resolver), sem tentar enviar nada para fora; uma resposta humana numa conversa de exemplo aparece na conversa como qualquer outra
- [ ] Configurações ganha, no cartão do WhatsApp, o link "Apagar as conversas de exemplo" (com confirmação), que também recria o estado inicial vazio
- [ ] Lint e build passam

### Fase 2: conectar o número pela z-api (QR Code)

### US-005: Cliente da z-api (`lib/zapi.ts`)
**Description:** As a app, I want falar com a instância da z-api da empresa so that eu consiga mostrar o QR Code, saber se o número está conectado e mandar mensagens pelo número real.

**Acceptance Criteria:**
- [ ] `lib/integracoes.ts`: a integração `whatsapp` passa a ter como campos principais `ZAPI_INSTANCE_ID` (rótulo "Identificação da instância"), `ZAPI_TOKEN` ("Chave da instância", `secret`) e `ZAPI_CLIENT_TOKEN` ("Chave de segurança da conta", `secret`), cada um com uma linha de ajuda dizendo onde copiar no painel da z-api; `link` aponta para https://app.z-api.io com o rótulo "Abrir o painel da z-api"; `notaConexao` explica em duas frases que a empresa precisa de uma conta e uma instância na z-api (plano por instância, cobrado por eles) e que depois disso a conexão é escanear um QR Code aqui
- [ ] Os campos da Meta (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) continuam na mesma integração com `avancado: true`, sob o texto "Já usa a WhatsApp Cloud API da Meta? Preencha aqui e deixe os campos da z-api em branco."
- [ ] Novo `lib/zapi.ts` com `credenciais()` (lê os três valores por `getConfig`), `statusInstancia()` → `{ conectado, celularConectado, erro? }`, `qrCode()` → data URL da imagem (ou `null` quando já conectado), `enviarTexto(para, texto)`, `desconectar()`, `reiniciarSessao()`, `configurarWebhooks(urlBase)` (registra na instância os avisos de mensagem recebida, conectado e desconectado apontando para a rota da US-006) e `interpretarFalhaZapi(status, corpo)` no mesmo formato de `interpretarFalhaMeta` (frases de negócio: credenciais erradas → "A z-api não reconheceu a identificação ou as chaves da instância. Confira os três valores em Configurações."; instância sem sessão → "O número ainda não está conectado. Escaneie o QR Code em Configurações."; limite → "A z-api está limitando o envio agora. Espere um minuto."; indisponível → "A z-api não está respondendo agora.")
- [ ] Os endpoints, verbos, cabeçalho `Client-Token` e formatos de resposta são conferidos em https://developer.z-api.io antes de escrever o código, e o `CLAUDE.md` registra a data da conferência e a versão da documentação lida
- [ ] `lib/whatsapp.ts` vira o despachante do provedor: `provedorAtivo()` devolve `"zapi"` quando os três campos da z-api existem, `"meta"` quando só os da Meta existem, `null` quando nenhum; `enviarMensagem()` chama o provedor ativo; `ErroWhatsApp` e os códigos continuam os mesmos, com os códigos novos da z-api somados ao tipo; `conferirNumero()` ("Testar conexão" do cartão) chama `statusInstancia()` para a z-api e mantém o teste da Meta para o outro provedor
- [ ] `PUT /api/setup` com os três campos da z-api preenchidos dispara `configurarWebhooks(baseUrl(req))` logo depois de salvar; se falhar, o erro vira um `Aviso` no cartão dizendo que a equipe técnica pode cadastrar o endereço à mão (mostrado em "Para a equipe técnica", US-007) — a pessoa nunca precisa saber que webhooks existem no caminho feliz
- [ ] `GET /api/status` passa a informar `integrations.whatsapp` como "número conectado de verdade" (`statusInstancia().conectado` quando o provedor é z-api, credenciais presentes quando é Meta), com cache de 30 s para não bater na z-api a cada carregamento de tela
- [ ] Testado com um servidor HTTP descartável que imita a z-api (mesma técnica do teste da US-074: `http.createServer` local e `fetch` real), cobrindo status conectado/desconectado, QR Code, envio com sucesso, 401 de credencial e 5xx
- [ ] Lint e build passam

### US-006: Receber mensagens da z-api
**Description:** As a cliente da empresa, I want que a mensagem que eu mando pelo WhatsApp chegue ao atendente e seja respondida so that a conexão por QR Code sirva para atender de verdade.

**Acceptance Criteria:**
- [ ] Nova rota `app/webhook/zapi/route.ts` (`POST`), pública em `proxy.ts` pela regra `/webhook/**` já existente, com comentário no topo justificando a autenticação própria
- [ ] Autenticação: a URL registrada na z-api leva `?chave=<WHATSAPP_WEBHOOK_CHAVE>` (32 bytes aleatórios gerados e persistidos pelo mesmo padrão de `verifyTokenWhatsApp()`); a rota compara com `crypto.timingSafeEqual` depois de conferir o tamanho e recusa 401 sem chave ou com chave errada; além disso exige que o `instanceId` do corpo seja igual ao salvo, senão 403 — os dois registros no log, nunca na resposta
- [ ] Trata três tipos de aviso: mensagem recebida (só texto, ignorando `fromMe` e grupos; chama `registrarRecebida`, `responder({ origem: "whatsapp", nome: senderName })` e `enviarMensagem`, exatamente como o webhook da Meta faz hoje, inclusive `registrarFalhaEnvio` no `catch`), conectado e desconectado (gravam `WHATSAPP_CONEXAO` `{ conectado, em, numero?, nome? }` via `setConfig`, para a tela de conexão e o Início não dependerem só de consultar a z-api)
- [ ] `responder()` aceita `nome?: string` e grava em `conversas.nome` na primeira vez que ele chega (nunca sobrescreve um nome já salvo por um vazio); a foto do remetente **não** é guardada (avatar por iniciais, ver Non-Goals)
- [ ] Responde 200 imediatamente e processa depois, como a rota da Meta
- [ ] Novo `lib/telefone.ts` com `formatarTelefone("5511987654321")` → `+55 11 98765-4321` (e o número cru de volta quando não reconhece o formato), usado em toda tela que mostra um número
- [ ] Testado com `curl` no servidor standalone: aviso válido gera resposta (com a z-api falsa da US-005 recebendo o `send-text`), chave errada dá 401, `instanceId` diferente dá 403, `fromMe: true` é ignorado
- [ ] Lint e build passam

### US-007: Cartão "Conectar o WhatsApp" com QR Code e status ao vivo
**Description:** As a dona do negócio, I want conectar o número da empresa escaneando um QR Code so that eu não precise de ninguém técnico para o atendente começar a responder meus clientes.

**Acceptance Criteria:**
- [ ] Novo `components/ConexaoWhatsApp.tsx` (client component, próprio do app), registrado em `app/setup/page.tsx` no lugar de `WebhookWhatsApp` e também usado no passo 3 do Assistente (US-012). Ele lê `GET /api/whatsapp/conexao` (nova rota: `{ provedor, estado, numero?, nome?, desde?, qr?, mensagem? }`) e mostra um de quatro estados:
  - **sem credenciais**: passo a passo de três passos com capturas do painel da z-api em `public/ajuda/zapi-*.png` (1. Crie a conta e uma instância em app.z-api.io; 2. Copie os três valores da instância; 3. Cole aqui e clique em "Salvar e conectar") e os três campos da integração; "Salvar e conectar" salva pelo `PUT /api/setup` e passa ao estado seguinte
  - **aguardando QR Code**: imagem do QR (recarregada a cada 20 s, com a frase "O código muda a cada 20 segundos") e a instrução em três linhas: "No celular da empresa, abra o WhatsApp › Dispositivos conectados › Conectar dispositivo e aponte a câmera para este código."; a tela consulta o estado a cada 5 s e muda sozinha para "conectado"
  - **conectado**: chip verde "Conectado", número formatado e nome do perfil, "desde <data e hora>", a última mensagem recebida (reaproveitando `ultimaRecebida()`), botão "Desconectar" (com confirmação: "O atendente vai parar de responder clientes até você conectar de novo.") e o link "Apagar as conversas de exemplo" (US-004) quando ainda houver alguma
  - **problema**: `Aviso` vermelho com a frase de `interpretarFalhaZapi` e a ação "Revisar os valores" que abre os campos
- [ ] O que era `WebhookWhatsApp.tsx` (endereço e valor de verificação da Meta, diagnóstico "As mensagens estão chegando?") passa para dentro de `MaisDetalhes titulo="Para a equipe técnica"` no fim do cartão, acrescido do endereço de avisos da z-api com a chave (para cadastro manual quando `configurarWebhooks` falhou) — o título "Para a equipe técnica" é permitido aqui porque `components/setup.tsx` agora é próprio do app e o `MaisDetalhes` genérico de mesmo nome do rodapé é removido do `/setup` deste app
- [ ] Nada fora de "Para a equipe técnica" usa as palavras webhook, token, API, instância (a integração chama a instância de "identificação da instância" só nos rótulos dos campos, e `scripts/verificar-jargao.mjs` passa sem exceção nova)
- [ ] Verificado com a z-api falsa da US-005: os quatro estados aparecem, o QR troca de imagem, a transição para "conectado" acontece sem recarregar a página, "Desconectar" volta para "aguardando QR Code"
- [ ] Lint e build passam; verificar no navegador (desktop e celular, os quatro estados)

### Fase 3: Assistente em três passos

### US-008: Modelo de configuração do atendente (objetivo, tom, migração)
**Description:** As a dona do negócio, I want dizer o que o atendente deve fazer e como deve falar em escolhas simples so that eu não precise escrever instruções.

**Acceptance Criteria:**
- [ ] `Config` (`lib/types.ts`) ganha `objetivo: "atendimento" | "vendas" | "agendamentos" | "outro"`, `objetivoTexto?: string` (só quando `outro`) e `tomTexto?: string` (só quando `tom === "personalizado"`); `Tom` passa a ser `"profissional" | "amigavel" | "personalizado"`
- [ ] Migração ao ler (`lib/estado.ts:getConfig`): `direto` → `profissional`, `cordial` → `amigavel`, `descontraido` → `personalizado` com `tomTexto: "descontraído e simpático, próximo, mas sempre profissional"`; configuração sem `objetivo` → `atendimento`; nenhum registro antigo quebra
- [ ] `montarSystemPrompt()` (`lib/atendente.ts`) incorpora o objetivo em uma frase cada: atendimento ("tirar dúvidas e informar"), vendas ("entender a necessidade, apresentar a opção certa e convidar a fechar"), agendamentos ("coletar dia e horário preferidos e confirmar que uma pessoa vai marcar"), outro (o texto da pessoa); `descricaoTom()` cobre os três tons, com `tomTexto` para o personalizado
- [ ] `configExemplo` (`lib/demo.ts`) vira a Sorriso Pleno Odontologia dos mockups (atendente Bia, objetivo atendimento, tom profissional, texto "O que ele precisa saber?" do mockup mais os preços e horários que o simulador já usa nas sugestões)
- [ ] `PUT /api/config` valida os valores novos (400 com mensagem para objetivo ou tom desconhecido; `objetivoTexto` obrigatório quando `outro`)
- [ ] Lint e build passam

### US-009: Passo 1 do Assistente, "Configurar", com prévia do celular
**Description:** As a dona do negócio, I want preencher quem é o meu atendente numa tela só, vendo ao lado como ele vai aparecer para o cliente so that criar o atendente pareça montar um perfil, não configurar um sistema.

**Acceptance Criteria:**
- [ ] `app/assistente/page.tsx` mostra no topo o indicador `Passos` com "1 Configurar · Defina quem é o seu agente", "2 Testar · Veja como ele responde", "3 Conectar · Conecte seu WhatsApp"; o passo atual vem de `?passo=1|2|3` (padrão 1) e os passos concluídos são clicáveis
- [ ] Título "Vamos criar seu atendente de IA?" e apoio "Em poucos minutos você terá um atendente pronto para atender seus clientes no WhatsApp." (dentro dos limites de texto)
- [ ] Formulário do passo 1, nesta ordem: Nome do atendente e Nome da empresa (lado a lado no desktop); "O que ele deve fazer?" como quatro cartões selecionáveis (Atendimento · Tira dúvidas e informa; Vendas · Converte clientes; Agendamentos · Marca horários; Outro · Personalizado, que abre um campo de uma linha); "O que ele precisa saber?" (`textarea` com contador `n/12000`, placeholder com o texto da clínica do mockup) e logo abaixo o `Dropzone` "Adicionar arquivo (opcional) · PDF, TXT (até 10 MB)", que continua chamando `POST /api/base/arquivo` e **acrescenta** o texto extraído ao campo; "Tom de resposta" como três cartões (Profissional · Clara e objetiva; Amigável · Próxima e acolhedora; Personalizado · Definir estilo próprio, que abre um campo de uma linha)
- [ ] Os campos de hoje que o mockup não mostra ficam em `MaisDetalhes titulo="Quando ele não souber responder"`: a regra `naoSei` (três opções) e o horário de atendimento humano
- [ ] Coluna direita (desktop; abaixo do formulário no celular): cartão "Seu atendente, do seu jeito" com o `Celular` em modo prévia, estático, mostrando a saudação "Olá! Eu sou a {atendente} da {empresa}. Como posso ajudar?" e uma pergunta de cliente da lista `SUGESTOES`, com o nome no topo do celular atualizando enquanto a pessoa digita; abaixo, a `Dica`: "Você pode testar diferentes mensagens no próximo passo para ajustar as respostas do seu atendente."
- [ ] Rodapé do formulário: link "Salvar e sair" (salva e vai para `/`) e botão primário "Continuar para teste" (salva via `PUT /api/config` e vai para `?passo=2`); ambos desabilitados enquanto salva; erro de validação aparece como `ErrorBox` acima dos botões
- [ ] A barra fixa "Alterações não salvas" e o truque do `configRef` (US-039) deixam de existir: o simulador do passo 2 testa a configuração salva, porque "Continuar" salva antes
- [ ] `?exemplo=1` em `/assistente` preenche com `configExemplo` e segue para o passo 2 enviando a primeira sugestão (mesmo mecanismo de `autoEnviado`, sem `clearTimeout`, ver `PADRAO.md`)
- [ ] Lint e build passam; verificar no navegador (desktop e celular; cartões selecionados com borda no acento; contador; prévia atualizando)

### US-010: Passo 2 do Assistente, "Testar"
**Description:** As a dona do negócio, I want conversar com o meu atendente como se eu fosse um cliente so that eu ajuste o que ele sabe antes de colocá-lo no número da empresa.

**Acceptance Criteria:**
- [ ] `?passo=2` mostra o `Celular` interativo (o simulador de hoje, com bolhas, "digitando...", `AcoesResposta` Aprovar/Corrigir por resposta, "Consultado em {ferramenta}") centralizado, e ao lado (desktop) um cartão "O que testar" com as três sugestões clicáveis e uma frase: "Não gostou de uma resposta? Clique em Corrigir e a resposta certa entra na base do atendente."
- [ ] Botões do passo: "Voltar e ajustar" (`?passo=1`) e primário "Continuar para conectar" (`?passo=3`); um link "Limpar a conversa de teste" apaga a conversa `simulador` (`DELETE /api/conversas/simulador`, já existe)
- [ ] O simulador grava na conversa `simulador` do banco (US-003), então ela aparece em Conversas com o rótulo "Simulador", como hoje
- [ ] `MaisDetalhes titulo="Respostas aprovadas pela equipe"` (a base da US-041, com a lista e o link do formulário de sugestões da US-061) fica abaixo do celular neste passo — é onde faz sentido revisar o que a equipe aprovou depois de testar
- [ ] Lint e build passam; verificar no navegador (desktop e celular; fluxo `?exemplo=1` chega aqui com a primeira resposta na tela)

### US-011: Passo 3 do Assistente, "Conectar"
**Description:** As a dona do negócio, I want que o último passo de criar o atendente seja conectar o número so that eu termine o fluxo com o atendente funcionando, não com um link para outra tela.

**Acceptance Criteria:**
- [ ] `?passo=3` renderiza `ConexaoWhatsApp` (US-007) com o mesmo comportamento de Configurações, com título "Conecte seu WhatsApp" e apoio "Escaneie o código com o celular da empresa e o atendente começa a responder."
- [ ] Quando o estado é "conectado", aparece o cartão "Tudo pronto" com o botão "Ir para o Início" e a frase "A {atendente} já está respondendo no número {número}."
- [ ] Um link discreto "Fazer isso depois" leva ao Início sem conectar (o Início mostra o que falta, US-016)
- [ ] O antigo `app/page.tsx` (formulário + celular + conversas recebidas) é removido; o que restava dele e ainda vale (`ConteudoConversas` para `/r/[id]` de registros antigos, `ConteudoRelatorio` do relatório diário e o cartão "Conversa selecionada" de `?atender=`) passa para `components/Resultado.tsx`, e `?atender=<numero>` passa a abrir `/conversas?numero=<numero>` (US-014) — os links dos relatórios já gerados continuam funcionando por um redirect em `/` que preserva a querystring
- [ ] Lint e build passam; verificar no navegador (desktop e celular; caminho completo passo 1 → 2 → 3 em modo demonstração, com a z-api falsa da US-005 levando até "Tudo pronto")

### Fase 4: Conversas

### US-012: Lista de conversas com abas, período e busca
**Description:** As a operador do atendimento, I want ver todas as conversas em uma lista com o status de cada uma so that eu encontre em segundos as que precisam de mim.

**Acceptance Criteria:**
- [ ] `/conversas`: título "Conversas", apoio "Acompanhe os atendimentos, veja como seu atendente está se saindo e intervenha quando necessário."; à direita do título, um seletor de período (Hoje · Últimos 7 dias · Últimos 30 dias · Tudo, padrão "Últimos 7 dias") e um campo de busca (nome, número ou trecho da mensagem), refletidos em `?periodo=&q=`
- [ ] Abas com contadores: Todas · Em atendimento (status `humano`) · Precisa de atenção (status `atencao`); a aba vem de `?aba=`
- [ ] Cada linha: avatar por iniciais em um círculo no acento suave (sem foto), nome (ou número formatado quando não há nome), hora (hoje) ou dia e mês, primeira linha da última mensagem com reticências, chip de status (Atendida pela IA · verde; Precisa de atenção · âmbar; Em atendimento humano · azul; Resolvida · cinza) e o ícone da origem (WhatsApp, Simulador, Exemplo) — sem rótulo textual da origem para caber na coluna
- [ ] Contador de não lidas aparece como número no acento quando `nao_lidas > 0`; o item do cabeçalho "Conversas" ganha o mesmo contador com o total de conversas em `atencao` (o `Topbar` já aceita `navegacao` com itens; acrescentar `contador?: number` a `ItemNavegacao` — arquivo agora próprio do app)
- [ ] Estado vazio: `Empty` com a `IlustracaoConversa` e a ação "Testar com uma pergunta" que leva a `/assistente?passo=2`
- [ ] `GET /api/conversas` aceita `periodo`, `status`, `q` e devolve `{ itens, contadores: { todas, humano, atencao } }`; a linha selecionada vem de `?numero=`
- [ ] No celular, a lista ocupa a tela; escolher uma conversa abre a conversa (US-013) com botão "Voltar"
- [ ] Lint e build passam; verificar no navegador (desktop e celular; abas, busca e período alterando a lista sem recarregar)

### US-013: Conversa aberta, assumir, responder e devolver
**Description:** As a operador do atendimento, I want ler a conversa inteira e, quando precisar, responder eu mesmo pelo número da empresa so that nenhum cliente fique sem resposta quando a IA não soube.

**Acceptance Criteria:**
- [ ] Coluna central de `/conversas` (a conversa escolhida): cabeçalho com avatar, nome, número formatado e ícone da origem; bolhas do cliente à esquerda e do atendente à direita, com hora; bolhas da IA levam o rótulo "{atendente} · Assistente de IA" e as `AcoesResposta` (Aprovar/Corrigir) da US-041; bolhas de uma pessoa levam "Você"
- [ ] Faixa "Intervir na conversa · O atendente passou esta conversa para uma pessoa." em âmbar, com o botão "Assumir atendimento", quando o status é `atencao`; nos demais status, o botão "Assumir atendimento" fica no cabeçalho
- [ ] Composer: enquanto a conversa não está em `humano`, o campo fica desabilitado com a frase "Assuma o atendimento para responder"; em `humano`, `textarea` de uma linha que cresce, botão primário "Enviar" (Enter envia, Shift+Enter quebra linha) e os links "Devolver para a IA" e "Marcar como resolvida"
- [ ] `POST /api/conversas/[numero]/assumir`, `/devolver`, `/resolver` e `POST /api/conversas/[numero]/mensagens` `{ texto }`: a mensagem humana é gravada com `papel: "humano"` e, quando a origem é `whatsapp`, enviada por `enviarMensagem()`; falha de envio vira `ErrorBox` com a frase de `ErroWhatsApp` e a ação para `/setup#whatsapp`, e a mensagem fica marcada com `erro` na bolha (mesmo estado visual do simulador); em `simulador`/`exemplo`/`mcp` nada é enviado para fora
- [ ] Abrir a conversa zera `nao_lidas`; a lista à esquerda reflete status e última mensagem sem recarregar (a resposta de cada ação devolve a conversa atualizada)
- [ ] A conversa recarrega sozinha a cada 10 s enquanto a aba está visível (`document.visibilityState`), para mensagens novas do cliente aparecerem
- [ ] Quem chega por `/conversas?numero=X` (links do relatório diário e do Início) vê essa conversa aberta e rolada até o fim; `&corrigir=1` abre a última resposta da IA já em modo "corrigindo" (substitui o cartão "Conversa selecionada" da US-060)
- [ ] Lint e build passam; verificar no navegador (desktop e celular; assumir → enviar → devolver, com a z-api falsa recebendo o envio numa conversa `whatsapp` de teste)

### US-014: Painel do contato
**Description:** As a operador do atendimento, I want ver quem é o cliente e o resumo da relação dele com a empresa ao lado da conversa so that eu não precise procurar isso em outro lugar.

**Acceptance Criteria:**
- [ ] Coluna direita de `/conversas` (desktop) com o cartão "Informações do contato": avatar por iniciais, nome, número formatado, chips de status e origem; lista rotulada com Nome, Telefone, Origem (WhatsApp/Simulador/Exemplo), Primeiro contato (data e hora), Última mensagem, Total de mensagens, "Respostas aprovadas nesta conversa" (contagem de pares da base que vieram dela, se a US-041 registrar a origem; senão, omitir a linha)
- [ ] Ações do cartão: "Marcar como resolvida" (quando não resolvida) e "Apagar conversa" (com confirmação, `DELETE /api/conversas/[numero]`, já existente); para a conversa `simulador`, o rótulo é "Apagar conversa de teste"
- [ ] No celular, o painel vira um `MaisDetalhes titulo="Sobre o contato"` acima das bolhas
- [ ] Sem "Editar", "Observações", "Etiquetas", "Ações rápidas" e "Histórico da conversa" do mockup (Non-Goals)
- [ ] Lint e build passam; verificar no navegador (desktop e celular)

### Fase 5: Início

### US-015: Métricas do período (`lib/metricas.ts` e `GET /api/metricas`)
**Description:** As a app, I want calcular os números do atendimento para qualquer período so that Início e Relatórios usem a mesma fonte e nunca discordem.

**Acceptance Criteria:**
- [ ] Novo `lib/metricas.ts` com `calcular(periodo: "hoje" | "7d" | "30d")` → `{ conversas, resolvidasIA, passadasPessoa, tempoMedioMs, variacao: { conversas, resolvidasIA, passadasPessoa, tempoMedioMs } (percentuais em relação ao período imediatamente anterior de mesmo tamanho, `null` quando o anterior é zero), porDia: [{ dia, conversas, resolvidasIA }], assuntos: [{ assunto, total }], atencao: Conversa[] }`
- [ ] Definições, documentadas no topo do arquivo: "conversa no período" = teve pelo menos uma mensagem do cliente no período; "resolvida pela IA" = status `ia` ou `resolvida` sem nenhuma mensagem `humano`; "passada para uma pessoa" = teve status `atencao` ou `humano` em algum momento (guardado como `passou_por_pessoa` 0/1 na tabela ao mudar de status); "tempo médio de resposta" = média de `tempo_resposta_ms` das mensagens do atendente (IA e humano) no período
- [ ] `GET /api/metricas?periodo=` devolve isso; `porDia` cobre todos os dias do período (zeros incluídos), para o gráfico não ter buracos
- [ ] Testado por `curl` com as conversas de exemplo (US-004): números coerentes com o que foi semeado
- [ ] Lint e build passam

### US-016: Tela de Início
**Description:** As a dona do negócio, I want abrir o app e saber em cinco segundos se está tudo bem e o que precisa de mim so that eu não precise abrir cada conversa para descobrir.

**Acceptance Criteria:**
- [ ] `/` mostra a data por extenso ("Quarta-feira, 17 de setembro"), "Bom dia/Boa tarde/Boa noite, {primeiro nome}!" (nome vem de `status.usuario`) e uma frase de situação escolhida por regra: número conectado → "A {atendente} está atendendo seus clientes no WhatsApp."; sem número → "A {atendente} está pronta. Falta conectar o número da empresa."; sem IA e sem número → "Você está vendo uma demonstração com dados de exemplo."
- [ ] Cartão de situação à direita do título (no lugar do robô e do balão do mockup), com a `IlustracaoSegmento` do app e uma de três frases: "Tudo certo por aqui" (nada em `atencao`, número conectado), "{n} conversas precisam de você" (link para `/conversas?aba=atencao`), "Falta conectar o WhatsApp" (link para `/assistente?passo=3`)
- [ ] Quatro indicadores de hoje, via `GET /api/metricas?periodo=hoje`: Conversas hoje, Resolvidas pela IA, Passadas para uma pessoa, Tempo médio de resposta (em segundos ou "min" quando ≥ 60 s), cada um com a variação em relação a ontem ("↑ 12%" verde, "↓ 8%" vermelho; para tempo de resposta, cair é verde) — usando `Destaque` de `ui.tsx` estendido com `variacao`
- [ ] Quatro cartões de ação: "Ver conversas · Acompanhe e intervenha quando necessário" (destacado no acento, `/conversas`), "Editar atendente · Ajuste informações, comportamento e respostas" (`/assistente`), "Adicionar conhecimento · Envie arquivos ou textos" (`/assistente#conhecimento`, âncora no campo), e o quarto muda com o estado: "Conectar o WhatsApp · Escaneie o QR Code" (`/assistente?passo=3`) quando não há número, senão "Configurações · Integrações e relatório diário" (`/setup`)
- [ ] "Conversas recentes": as cinco últimas em uma `DataTable` (Cliente com avatar de iniciais, Última mensagem, Status como chip, Horário relativo "Há 3 min"/"Há 1 hora"/"Ontem"), cada linha levando a `/conversas?numero=`, e o link "Ver todas"
- [ ] Coluna direita: cartão "Seu atendente" (avatar com a inicial, nome, chip "Online" quando o número está conectado ou "Só no simulador" quando não, "Atendimento da {empresa}", botão "Editar") e o cartão "Mais resultados para seu negócio · Veja como a IA está atendendo" com "Ver relatórios" (`/relatorios`)
- [ ] O `Aviso` de conversas de exemplo (US-004) aparece acima da tabela quando só há exemplos
- [ ] `?exemplo=1&captura=1` (usado pelo workflow de publicação para a prévia do catálogo) mostra o Início cheio com as conversas de exemplo, sem rolagem automática
- [ ] Lint e build passam; verificar no navegador (desktop e celular; três estados da frase de situação)

### Fase 6: Relatórios

### US-017: Tela de Relatórios com indicadores e gráfico
**Description:** As a dona do negócio, I want ver em um lugar se a IA está resolvendo e quanto so that eu decida com números se vale manter e expandir o atendente.

**Acceptance Criteria:**
- [ ] `/relatorios`: sobretítulo "Relatórios", título "Desempenho do seu atendente", apoio "Acompanhe como seu atendente está atendendo e resolvendo dúvidas."; à direita, o seletor de período (Hoje · Últimos 7 dias · Últimos 30 dias, padrão 7 dias, em `?periodo=`) e o botão "Exportar" (US-018)
- [ ] Quatro indicadores do período com "vs. período anterior" (mesmo componente da US-016)
- [ ] Cartão "Conversas ao longo do tempo": gráfico de linhas em SVG inline (`components/GraficoLinhas.tsx`, próprio do app) com duas séries (Total de conversas no acento; Resolvidas pela IA no acento a 50% de opacidade), área preenchida suave sob a linha principal, pontos, eixo de dias abreviados ("10 set") e legenda; acessível com `<title>` e uma tabela oculta (`sr-only`) com os mesmos números; sem animação além do `reveal`
- [ ] Cartão "Principais assuntos": barras horizontais em SVG/CSS com rótulo e total, ordenadas, no máximo cinco (as demais somadas em "Outros"); enquanto a US-020 não existir, mostra só "Sem classificação ainda" para conversas reais e os assuntos semeados nos exemplos
- [ ] Cartão "Conversas que precisam de atenção": até cinco conversas em `atencao`, com avatar, nome, trecho, hora e chip "Aguardando", cada uma levando a `/conversas?numero=`; link "Ver todas" para `/conversas?aba=atencao`; estado vazio "Nenhuma conversa aguardando. A IA está dando conta."
- [ ] Sem "Canais de origem" e sem "Quer insights mais avançados?" (D4)
- [ ] Lint e build passam; verificar no navegador (desktop e celular; os três períodos; o gráfico com o conjunto de exemplo e com um único dia de dados)

### US-018: Exportar e relatório diário a partir da tela
**Description:** As a dona do negócio, I want levar os números para uma planilha e receber o relatório por e-mail so that eu compartilhe o desempenho com a equipe sem entrar no app todo dia.

**Acceptance Criteria:**
- [ ] "Exportar" abre um menu com "Baixar planilha (CSV)" e "Copiar resumo": o CSV (`GET /api/metricas/exportar?periodo=`) tem uma linha por conversa do período (nome, número, origem, status, assunto, primeira mensagem, última mensagem, total de mensagens, resolvida pela IA sim/não, tempo médio de resposta) em UTF-8 com BOM para o Excel abrir com acentos; "Copiar resumo" usa `Entregar` com os quatro números e os assuntos em texto
- [ ] Cartão "Receber o relatório diário por e-mail" no rodapé de Relatórios, reaproveitando o fluxo da US-060 (botão que cria a rotina `relatorio-atendimento` às 8h com o destino de `NOTIFICACOES_DESTINO`; quando as notificações não estão configuradas, o cartão leva a `/setup#notificacoes`)
- [ ] Link "Relatórios anteriores" para `/historico` (que continua existindo e listando os relatórios diários salvos; é o único lugar de onde se chega a ele, D1)
- [ ] `ConteudoRelatorio` (relatório diário em `/r/[id]`) ganha, no topo, o link "Ver o painel completo" para `/relatorios?periodo=7d`, e os links "Aprovar"/"Corrigir" passam a apontar para `/conversas?numero=X` e `/conversas?numero=X&corrigir=1` (US-013)
- [ ] Testado: o CSV abre no Numbers/Excel com acentos corretos; `curl` do CSV com período sem conversas devolve só o cabeçalho
- [ ] Lint e build passam; verificar no navegador

### US-019: Classificação de assunto por conversa
**Description:** As a dona do negócio, I want saber sobre o que os clientes mais perguntam so that eu melhore a base do atendente e o próprio negócio onde mais importa.

**Acceptance Criteria:**
- [ ] Lista de assuntos derivada do objetivo (US-008), em `lib/assuntos.ts`: atendimento → Preços, Horário de atendimento, Produtos e serviços, Localização e contato, Reclamações, Outros; vendas → acrescenta Formas de pagamento e Promoções; agendamentos → acrescenta Agendamentos e Remarcações; outro → a lista de atendimento
- [ ] Classificação com `askJSON` na **primeira resposta** da IA a cada conversa nova (uma chamada extra pequena, `maxTokens` baixo) e regravada quando a conversa muda de status para `resolvida`; sem IA conectada, heurística por palavras-chave em `lib/demo.ts` (`classificarLocal`), nunca "Outros" para tudo
- [ ] `assunto` gravado em `conversas.assunto`; `lib/metricas.ts:assuntos` passa a vir dali; a linha do contato (US-014) mostra "Assunto"
- [ ] Falha na classificação nunca atrasa nem derruba a resposta ao cliente: roda depois de `enviarMensagem`, com `catch` que só registra no log
- [ ] Testado sem chave real com o mesmo truque de `global.fetch` para `openrouter.ai` da US-074
- [ ] Lint e build passam

### Fase 7: encerramento

### US-020: Documentação, catálogo, jargão e capturas finais
**Description:** As a mantenedor, I want que tudo o que descreve o app (README, catálogo, CLAUDE.md, capturas) reflita as telas novas so that quem publicar ou evoluir o app não leia instruções da tela antiga.

**Acceptance Criteria:**
- [ ] `README.md` do app: seção "Configuração inicial" reescrita para a z-api (criar conta, colar três valores, escanear), com a Meta em uma subseção "Já usa a Cloud API da Meta?"; tabela de variáveis com `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`, `WHATSAPP_WEBHOOK_CHAVE`; "Estrutura" com as páginas e rotas novas
- [ ] `catalogo.json`: `integracoes` vira "WhatsApp por QR Code (z-api) ou WhatsApp Cloud API (Meta).", `problema`/`ia` revisados para o que o app faz agora; `node scripts/gerar-deploy.mjs` sem alteração no `render.yaml` além do esperado
- [ ] `CLAUDE.md` do app: as notas das US-039/040/041/060/061 que descreviam a tela única são reescritas ou removidas onde deixaram de valer (barra "Alterações não salvas", `configRef`, snapshot de conversas por mensagem, "Conversa selecionada"), e as notas novas registram as decisões desta PRD que não se leem do código (regras de status, política de conversas de exemplo, por que `/historico` saiu do cabeçalho, data da conferência da documentação da z-api)
- [ ] `node scripts/verificar-jargao.mjs whatsapp-atendente` passa sem exceção nova; `scripts/verificar-paleta.mjs` passa; `scripts/verificar-padrao.sh` sai 0 para os 17
- [ ] Verificação completa do `PADRAO.md` (servidor standalone, `curl` em `/api/health`, `/api/status`, `/api/setup`, rotas novas com entradas inválidas devolvendo 400); capturas finais de `/`, `/conversas`, `/assistente` (três passos), `/relatorios` e `/setup` em desktop e celular, revisadas e corrigidas até ficarem limpas
- [ ] A prévia do catálogo (`/?exemplo=1&captura=1`) mostra o Início com as conversas de exemplo

## Functional Requirements

- FR-1: O cabeçalho do app deve listar Início, Conversas, Assistente, Relatórios e Configurações, marcando o item da rota atual, e mostrar no item Conversas o total de conversas com status "precisa de atenção".
- FR-2: Toda conversa e toda mensagem devem ser persistidas em SQLite e sobreviver a reinícios; a IA nunca deve responder a uma conversa cujo status é "em atendimento humano".
- FR-3: O status de uma conversa deve ser um de: Atendida pela IA, Precisa de atenção, Em atendimento humano, Resolvida, com as transições da US-003.
- FR-4: Sem número conectado e sem conversas reais, o app deve semear e exibir conversas de exemplo marcadas como tal, removidas automaticamente na primeira conversa real.
- FR-5: A conexão do número deve funcionar pela z-api (três credenciais coladas uma vez, depois QR Code dentro do app) ou pela Meta Cloud API (campos em "Opções avançadas"); o app escolhe o provedor pelas credenciais presentes.
- FR-6: A tela de conexão deve mostrar o QR Code atualizado, detectar sozinha quando o celular conectou e oferecer "Desconectar".
- FR-7: O recebimento de mensagens da z-api deve exigir a chave secreta na URL e a identificação da instância no corpo, ignorar mensagens enviadas pelo próprio número e mensagens de grupos, e responder 200 antes de processar.
- FR-8: Criar o atendente deve seguir três passos numerados (Configurar, Testar, Conectar), com o telefone de prévia refletindo nome do atendente e da empresa enquanto a pessoa digita.
- FR-9: "O que ele deve fazer?" (Atendimento, Vendas, Agendamentos, Outro) e "Tom de resposta" (Profissional, Amigável, Personalizado) devem alterar as instruções da IA; configurações antigas devem ser migradas sem quebrar.
- FR-10: Em Conversas, a pessoa deve poder filtrar por aba, período e busca; abrir uma conversa; assumir; responder pelo número real; devolver para a IA; marcar como resolvida; apagar.
- FR-11: Uma resposta humana numa conversa de WhatsApp deve ser enviada pelo provedor ativo; a falha deve aparecer na bolha e no `ErrorBox` com a frase de negócio e o link para Configurações.
- FR-12: Início deve mostrar saudação, frase de situação, quatro indicadores de hoje com variação em relação a ontem, quatro atalhos, cinco conversas recentes e o cartão do atendente.
- FR-13: Relatórios deve mostrar quatro indicadores do período com variação, gráfico de linhas por dia, principais assuntos, conversas que precisam de atenção, exportação em CSV e o cartão do relatório diário.
- FR-14: Todos os números de Início e Relatórios devem vir de `lib/metricas.ts`, com as definições documentadas na US-015.
- FR-15: Cada conversa deve receber um assunto (pela IA, ou por heurística local sem IA) sem atrasar a resposta ao cliente.
- FR-16: Nenhuma tela fora de "Opções avançadas"/"Para a equipe técnica" deve usar os termos webhook, token, API ou instância (exceto o rótulo "Identificação da instância" dos campos de credencial); `scripts/verificar-jargao.mjs` continua passando sem exceção nova.
- FR-17: `catalogo.json` deve suportar `independente: true` e `scripts/verificar-padrao.sh` deve comparar só a camada de infraestrutura para apps independentes.

## Non-Goals (Out of Scope)

- Barra lateral de navegação (D1). "Integrações" e "Automações" como páginas próprias.
- Bloco "Precisa de ajuda?"/"Central de ajuda" e "Quer insights mais avançados?".
- Observações, etiquetas, "Ações rápidas" (Agendar atendimento, Enviar material, Compartilhar link, Criar tarefa), "Histórico da conversa" e "Editar contato" do painel do contato.
- Múltiplos atendentes humanos, permissões, filtro "Todos os atendentes" (uma conta por instância).
- "Leads identificados" e "Canais de origem" nos relatórios (D4).
- Anexos, emojis, áudio, imagens e "respostas salvas" no composer; mensagens que não sejam texto (a rota ignora e registra).
- Modelos de mensagem, envio ativo para clientes que não escreveram primeiro, campanhas.
- Guardar a foto de perfil do cliente (`senderPhoto` da z-api) — avatar sempre por iniciais.
- Conta z-api da StartSe com instância criada sob demanda (fica em Open Questions).
- Meta Embedded Signup (OAuth da Meta); a Meta segue só como opção avançada com credenciais manuais.
- Replicar qualquer tela desta PRD para os outros 16 apps; a Fase 0 existe exatamente para isso não ser necessário.
- Alterar `lib/ferramentas.ts` (MCP exposto) além do estritamente necessário para compilar; uma ferramenta "listar conversas pendentes" pode vir depois.

## Design Considerations

- Mockups de 17/09/2026 são a referência de layout. Simplificações já decididas: sem sparklines nos indicadores, sem robô mascote (fica a `IlustracaoSegmento` do app), sem abas "Responder como IA / Responder manualmente" (um só composer, ativo quando a conversa é sua), sem os quatro filtros do topo de Conversas (ficam período e busca; status vira as abas).
- Cores: acento `#0e7c6a` e derivados do `globals.css`; chips de status usam as variantes já existentes (`positivo` para IA, `warn`/âmbar para atenção, azul novo `chip-humano` definido depois de `/* Específico deste app */`, `neutro` para resolvida). Ícone do WhatsApp em verde da marca só como ícone de origem (16 px), nunca como acento.
- Componentes reaproveitados: `Topbar`, `Passos`, `Destaque` (estendido), `DataTable`, `Empty`, `Loading`, `ErrorBox`, `Aviso`, `MaisDetalhes`, `Dropzone`, `Entregar`, `CopyButton`, `useConfirmacao`, `Celular`/`AcoesResposta`. Como `components/ui.tsx` passa a ser próprio do app (US-001), estendê-lo é permitido; mudar o que já existe só quando uma história pedir.
- Layout de Conversas no desktop: três colunas (lista 360 px · conversa flexível · contato 300 px); abaixo de 1100 px o painel do contato vira `MaisDetalhes`; no celular, lista e conversa alternam.
- Formulação dos textos: sentence case, sem setas em botões (o "→" dos mockups não entra), botões dizem o que fazem ("Assumir atendimento", "Devolver para a IA", "Salvar e conectar").
- Capturas do painel da z-api para o passo a passo (`public/ajuda/zapi-*.png`) são tiradas na hora de implementar a US-007, recortadas ao essencial e sem dados reais de conta.

## Technical Considerations

- **Independência (Fase 0):** a divisão `INFRA`/`PRODUTO` do verificador é a única mudança de raiz. Os arquivos de produto continuam sendo cópias do `pdi-time` no momento da bifurcação; a partir daí pertencem ao app. Uma melhoria futura de `ui.tsx` no `pdi-time` não chega aqui sozinha (e vice-versa) — decisão consciente, registrada em `PADRAO.md`.
- **z-api:** sem OAuth. Autenticação de saída por `Client-Token` no cabeçalho e instância/token na URL; de entrada, a chave secreta na URL do aviso mais a conferência do `instanceId`. Os webhooks são registrados pelo próprio app ao salvar as credenciais, para a pessoa nunca ver essa etapa. Endpoints conferidos na documentação oficial na hora de implementar (P5).
- **Despacho de provedor:** `lib/whatsapp.ts` decide entre z-api e Meta pelas credenciais presentes; a rota da Meta (`app/webhook/route.ts`) e a da z-api (`app/webhook/zapi/route.ts`) convivem, ambas públicas pela regra `/webhook/**` de `proxy.ts` (arquivo de infraestrutura, não muda).
- **Banco:** duas tabelas novas em `lib/store.ts` via `lib/conversas.ts` (padrão de `lib/conta.ts`: `CREATE TABLE IF NOT EXISTS` na abertura). O `Map` em memória de `lib/atendente.ts` desaparece. Sem migração de dados antigos (as conversas em memória sempre se perdiam ao reiniciar).
- **Métricas:** calculadas por consulta SQL em `lib/metricas.ts` a cada chamada (volume de um número de WhatsApp de PME cabe folgado); cache de 30 s só para `GET /api/status` consultar a z-api.
- **Polling:** a tela de conexão consulta o estado a cada 5 s e o QR a cada 20 s enquanto visível; a conversa aberta a cada 10 s. Sem WebSocket/SSE (não há infraestrutura para isso no Render free e o custo em complexidade não compensa).
- **Gráficos:** SVG inline calculado no componente (escala linear, `viewBox` fixo, `preserveAspectRatio="none"` só no fundo), com tabela `sr-only`. Nenhuma biblioteca.
- **Rotas públicas:** só `/webhook/zapi` é nova e pública, já coberta por `proxy.ts`. Tudo o mais nasce privado.
- **Impacto no relatório diário (US-060):** `perguntasPendentes()` passa a ler o banco; a rotina e o `ConteudoRelatorio` continuam, com links para `/conversas`.
- **Compatibilidade:** links `/?atender=<numero>` de relatórios já gerados redirecionam para `/conversas?numero=<numero>`; registros antigos do tipo `atendimento` continuam abrindo em `/r/[id]`.

## Success Metrics

- Conectar o número (da tela de credenciais até "Conectado") em menos de 10 minutos por uma pessoa não técnica, medido em teste com alguém fora do time.
- Em modo demonstração, as cinco telas ficam cheias e coerentes sem nenhuma chave, e a prévia do catálogo mostra o Início novo.
- Da abertura do app até responder manualmente uma conversa que "precisa de atenção": no máximo 3 cliques (Início → conversa → Assumir).
- `scripts/verificar-padrao.sh` continua saindo 0 para os 17 apps, com o Atendente como independente.
- Zero termos técnicos fora de "Opções avançadas"/"Para a equipe técnica" (`verificar-jargao.mjs` sem exceção nova).
- Lint e build sem erros em todas as histórias; capturas desktop e celular revisadas em cada tela.

## Open Questions

1. **Conta z-api da StartSe (experiência "só escanear", opção C da pergunta 2):** vale investigar se a z-api oferece API de parceiro para criar instâncias sob demanda, o custo mensal por instância e quem paga. Se viável, viraria uma história futura que esconde até os três campos; a arquitetura desta PRD (`lib/zapi.ts` lendo credenciais por `getConfig`) já suporta uma credencial `_APP` no lugar.
2. **DOCX no "Adicionar arquivo":** o mockup lista PDF, DOCX e TXT. Ler DOCX exige uma dependência nova (ex.: `mammoth`). Aprovar a dependência ou deixar só PDF/TXT/MD (como está na US-009)?
3. **Independência até onde:** a Fase 0 trata só do verificador da suíte. Um app independente deveria, no futuro, ter repositório e pipeline próprios? Não bloqueia nada aqui, mas muda o que documentar em `PADRAO.md`.
4. **Resolução automática em 24 h** de conversas atendidas pela IA sem nova mensagem: confirmar o prazo (24 h é o que o próprio WhatsApp usa como janela de conversa) ou deixar configurável em "Mais detalhes" do Assistente.
5. **Nome do contato quando a z-api não envia `senderName`:** exibir só o número formatado (decisão desta PRD) ou permitir digitar um nome no painel do contato (seria o único campo editável do painel; hoje está em Non-Goals).
6. **Retenção:** conversas e mensagens crescem sem limite. Definir agora uma limpeza (ex.: mensagens com mais de 180 dias) ou deixar para quando houver volume real?
