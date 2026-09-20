# Build Agentflows

Crie fluxos visuais de agentes de IA, teste cada etapa e publique versões que seus sistemas e assistentes podem executar. Aplicação independente da suíte **IA para Executivos**, inspirada na orquestração explícita de [AgentFlow V2 do Flowise](https://docs.flowiseai.com/using-flowise/agentflowv2).

## O que resolve

Um quadro visual conecta os blocos: Início, LLM (Assistente), Agente, Condição, Atualizar estado, Requisição HTTP, Aprovação humana, Repetir e Resposta. Ferramentas, WhatsApp e ligações vivem dentro do Agente e em Implantar (fluxos antigos com os blocos Ferramenta, Enviar WhatsApp e Ligação continuam funcionando). Blocos novos nascem com nome incremental (Agente 0, LLM 1…) e podem ser renomeados no próprio cabeçalho, com Enter ou pelo check; o botão Salvar fica inativo até haver uma mudança, e sair com alterações abre um modal para salvar ou descartar. O agente escolhe ferramentas autorizadas e incorpora seus resultados, em até 12 chamadas por etapa. As conexões determinam o caminho; condições e aprovações possuem saídas Sim/Não, e repetições têm saídas Repetir/Concluir.

Um LLM ou Agente com a mensagem em branco recebe automaticamente a conversa (no primeiro passo) ou o resultado da etapa anterior; `{{input}}` não é obrigatório. Ao digitar `{{` em qualquer campo aparece um autocompletar com a conversa, a etapa anterior, as variáveis e os blocos do fluxo.

O editor segue a experiência do Agentflow V2: blocos compactos coloridos, alça de entrada em barra, saídas em seta que aparecem ao passar o mouse, conexões com gradiente entre as cores dos blocos e botão para removê-las, rótulo do ramo (Sim, Não, Repetir, Concluir) junto à origem. Arraste uma saída para outro bloco para conectar; solte no vazio para escolher o próximo bloco já conectado. Cada saída aceita uma conexão e ciclos só existem pela saída Repetir. O botão ✨ abre "O que você quer construir?": o ChatGPT desenha blocos, conexões e instruções a partir de uma descrição, com prévia antes de ir para o quadro. Salvar altera o rascunho; publicar cria uma cópia estável para integrações. Testes usam o rascunho pelo chat no canto superior direito, com histórico da sessão, etapas executadas e aprovação em linha. Cada execução guarda entrada, saída, versão, estado e registro de etapas em SQLite. Aprovações persistem após reinício e aceitam uma única decisão. Execuções que estavam rodando no momento do reinício são marcadas como interrompidas para não repetir ações externas silenciosamente.

Ao selecionar explicitamente a simulação, os fluxos rodam em demonstração: agentes devolvem respostas ilustrativas e nenhuma chamada HTTP ou ferramenta externa é executada. Também é possível selecionar a simulação mesmo com IA conectada. `/?exemplo=1` cria um exemplo de triagem quando ainda não há fluxos.

## Conexões

A tela **Conexões** reúne o que os agentes podem usar:

- **ChatGPT** (principal): assinatura conectada por código de dispositivo pelo Codex App Server oficial, fixado em @openai/codex 0.155.1.
- **OpenRouter**: conexão em um clique (OAuth PKCE) com mais de 500 modelos de 80 provedores, mais a opção "Automático · OpenRouter" (o OpenRouter escolhe o modelo). O modelo é escolhido bloco a bloco; um bloco em "Automático · ChatGPT" nunca cai para o OpenRouter, e vice-versa. O gerador de fluxos usa o OpenRouter só quando o ChatGPT não está conectado.
- **Ferramentas no Agente** (catálogo no espírito do Flowise): busca na web (Tavily, SearchApi, Exa, Serper, SerpApi, Brave, Google Custom Search, SearXNG), conhecimento (arXiv, Wolfram Alpha), web e dados (ler página, requisição HTTP sem endereços internos, extrair JSON), utilidades (data e hora, calculadora), fluxos (executar outro fluxo publicado) e canais (enviar WhatsApp, ligar por voz). As que precisam de chave pedem a credencial ali mesmo, uma vez para todos os fluxos. Servidores MCP nomeados entram por Conexões, autorizados em um clique ou por código.
- **WhatsApp**: Z-API (QR Code), Meta oficial ou ZapperHub, conectados em Conexões. Cada fluxo é vinculado ao número em **Implantar › WhatsApp**: mensagens recebidas em `/webhook/whatsapp?chave=…` executam o fluxo vinculado e a resposta volta pelo mesmo número; o endereço de avisos é cadastrado no provedor ao salvar (na Meta é colado no painel, com a mesma chave como valor de verificação).
- **ElevenLabs**: só a chave em Conexões. No chat de teste: falar em vez de digitar (transcrição) e ouvir as respostas com a voz escolhida por fluxo. Ligações por voz ficam em **Implantar › Ligações**: agente de conversa, número, segredo do aviso, vínculo do fluxo que recebe a transcrição (aviso assinado em `/webhook/elevenlabs`) e "Ligar agora" para prospecção ativa.

## Stack

Next.js 16, React 19, TypeScript, Tailwind 4, React Flow (`@xyflow/react`, editor acessível com conexões/arraste/zoom) e SQLite nativo do Node. Conta, sessão, configurações cifradas e MCP reutilizam a infraestrutura da suíte. A IA principal usa login ChatGPT pelo Codex App Server oficial; o OpenRouter é a alternativa explícita, por conexão em Conexões.

## Rodar localmente

```sh
npm ci
npm run dev
```

Node 22.13+ para o servidor; Node 24 para os testes TypeScript. Abra o endereço informado pelo Next e crie a conta administrativa. Clique em **Conectar ChatGPT**, copie o código e conclua o login no endereço oficial da OpenAI. A conta precisa ter acesso ao Codex e autenticação por dispositivo habilitada. O servidor de ferramentas opcional é configurado no bloco Agente.

```sh
npm test
npm run lint
npm run build
```

## Rodar com Docker

```sh
docker compose up --build
```

Abra `http://localhost:3019`. O volume `dados` preserva o banco e a chave mestra. Faça backup de **todo** o diretório de dados, inclusive `chave-mestra`.

## Publicar imagem e deploy no Render

O push na `main` publica `ghcr.io/startse/build-agentflows:latest` pelo workflow da suíte e gera a prévia do catálogo. O `render.yaml`, gerado a partir do catálogo, usa plano Starter e disco persistente de 1 GB. A imagem precisa estar pública para instalação sem autenticação no registro. Não use `CONTA_DESLIGADA` em produção.

## Integração

Gere um código em **Implantar fluxo**, no cabeçalho do editor. O diálogo tem abas Publicação, cURL, JavaScript, Python e Assistentes (MCP), com exemplos prontos para copiar. Ele autentica tanto MCP quanto HTTP; revogação e rotação valem para os dois. É um acesso administrativo a esta instalação, não uma chave isolada por fluxo.

```sh
curl -X POST 'https://SEU-APP/webhook/flows/ID-DO-FLUXO' \
  -H 'Authorization: Bearer SEU-CODIGO' \
  -H 'Content-Type: application/json' \
  -d '{"input":"Classifique esta solicitação"}'
```

A resposta inclui `id`, `status`, `output`, `error`, `demo` e `version`. `status` pode ser `completed`, `failed` ou `waiting`; uma falha de execução é registrada e retornada no corpo, portanto confira `status`, não apenas o HTTP 200. Rascunhos e publicações desativadas recusam a execução externa. Limite de 60 chamadas/minuto/código compartilhado com MCP.

O servidor `POST /mcp` oferece `listar_fluxos`, `executar_fluxo`, `consultar_execucao` e `responder_aprovacao`. A aprovação também pode ser respondida na tela Execuções. Para um cliente automatizado, a decisão deve vir explicitamente da pessoa autorizada. Não compartilhe o código com consumidores que não possam consultar execuções ou decidir aprovações.

As rotas de edição `/api/flows` e de acompanhamento `/api/runs` exigem sessão administrativa. As execuções são síncronas por segmento até terminar ou pausar; um consumidor deve permitir tempo suficiente para a resposta. O editor consulta o histórico durante a execução, com atualização parcial da resposta do ChatGPT.

### Dados entre blocos

- `{{input}}`: entrada original.
- `{{last}}`: saída da última etapa.
- `{{nodes.identificador}}`: saída mais recente daquele bloco.
- `{{state.nome}}`: variável compartilhada; Inicialização aceita um objeto JSON com valores de texto.

Referências ausentes interrompem a execução com diagnóstico. Após aprovação, `state.approval` contém `yes` ou `no`; para reutilizar o texto anterior, referencie o bloco que o produziu. Argumentos de ferramentas precisam resultar em JSON válido após interpolação.

HTTP usa um endereço fixo definido pelo autor do fluxo, não interpolado a partir da entrada. Redirecionamentos são recusados. Para autenticação Bearer, configure `FLOW_SECRET_NOME` no ambiente e informe apenas esse nome no bloco. Não insira segredos em instruções, endereços, corpos ou arquivos exportados. Os blocos HTTP são uma capacidade administrativa e podem acessar serviços alcançáveis pelo servidor.

## ChatGPT e persistência

A conexão usa [Codex App Server](https://developers.openai.com/codex/app-server), com autenticação gerenciada pelo Codex e código de dispositivo. Não aceita chave OpenAI, OpenRouter ou outro provedor. Sem conexão, a execução real é recusada; a demonstração precisa ser escolhida explicitamente no painel de teste. Limites e modelos dependem da conta conectada. Uma conta ChatGPT é compartilhada pela instalação administrativa.

O diretório `DATA_DIR` guarda banco, chave mestra e a sessão privada em `chatgpt/`. Preserve todo o volume e restrinja acesso aos backups. O subprocesso usa ambiente isolado, sem herdar credenciais locais, terminal ou ferramentas de arquivos. Somente ferramentas explicitamente selecionadas no bloco são oferecidas ao agente.

Variáveis opcionais: `DATA_DIR`, `PORT`, `HOSTNAME`, `CHAVE_MESTRA`, `FERRAMENTAS_URL`, `FERRAMENTAS_CODIGO`, `MCP_CODIGO_ACESSO`, `FLOW_SECRET_*` e `NOVA_SENHA_ADMIN`. `CONTA_DESLIGADA=1` é restrito a capturas/testes temporários. A tela Configurações e seus endpoints antigos foram desativados; não há agendamento de rotinas neste produto.

## Recorte em relação ao Flowise

Implementação própria simplificada, sem copiar código do Flowise. Não é um fork nem importa arquivos nativos do Flowise: importação/exportação usa `build-agentflows/v1`. Não inclui Chatflows, Agentflows v1, marketplace, bases vetoriais, documentos/RAG, JavaScript arbitrário, subfluxos, iteração de listas, execução paralela, memória entre conversas . Cada execução tem estado próprio e percorre um caminho por vez. O limite é 60 blocos, 120 conexões, 150 etapas e 20 passagens por bloco de repetição. Operações externas já iniciadas podem concluir mesmo se a execução for cancelada; o cancelamento impede novos blocos.

## Estrutura

- `components/FlowEditor.tsx`: quadro, paleta, cabeçalho e histórico.
- `components/flow/`: bloco (`AgentNode`), conexão (`AgentEdge`) e linha de conexão no estilo Agentflow V2.
- `components/NodeDialog.tsx`: edição do bloco, com referências e ferramentas por clique.
- `components/ChatPopup.tsx`: chat de teste em popover.
- `components/GeneratorDialog.tsx`: gerador de fluxos por IA.
- `components/IntegrationDialog.tsx`: publicação e opções de implantação.
- `components/RunView.tsx`: resultado, etapas e aprovação (página de execução).
- `lib/flow-types.ts`: blocos, grafo e contratos.
- `lib/flow-graph.ts`: saídas por tipo, validação de conexão e layout automático.
- `lib/flow-generator.ts`: geração de fluxo pelo ChatGPT (ou OpenRouter) e validação da resposta.
- `lib/conexoes.ts`, `components/Connections.tsx`, `app/api/conexoes/`: tela e rotas de Conexões.
- `lib/openrouter.ts`: execução pelo OpenRouter com ferramentas.
- `lib/tools.ts`: ferramentas prontas e catálogo dos servidores MCP.
- `lib/whatsapp.ts`, `app/webhook/whatsapp/`: canal WhatsApp.
- `lib/elevenlabs.ts`, `app/webhook/elevenlabs/`, `app/api/voz/`: voz e ligações.
- `components/ReferenceField.tsx`: autocompletar de referências com `{{`.
- `lib/flow-store.ts`: validação, versões, persistência e checkpoints.
- `lib/flow-runtime.ts`: motor, IA, ferramentas e HTTP.
- `lib/ferramentas.ts`: ferramentas expostas pelo MCP.
- `app/webhook/flows/[id]`: execução publicada via Bearer.
- `lib/flow-runtime.test.ts`: testes de comportamento com serviços simulados.

## Referência visual e validação

A experiência foi estudada diretamente no [Flowise Agentflows v2](https://github.com/FlowiseAI/Flowise/tree/9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb/packages/ui/src/views/agentflowsv2): biblioteca em grade/lista, editor em tela inteira, blocos compactos com as mesmas cores, alças e conexões com gradiente, paleta flutuante com gerador por IA, diálogo de edição, minimapa, chat em popover e diálogo de implantação com abas. O canvas usa `@xyflow/react` (sucessor do `reactflow` do Flowise); o MUI não entra porque a suíte não usa bibliotecas de UI, e o visual é reproduzido em CSS próprio. Os componentes são próprios; não é uma reprodução integral do Flowise. O plano e o diagnóstico estão em `PLANO.md`.

Os testes cobrem 45 comportamentos: motor, protocolo ChatGPT com subprocesso simulado, regras de conexão e layout do grafo, gerador de fluxos, OpenRouter com ferramentas, conexões, catálogo de ferramentas, WhatsApp (três provedores e aviso recebido) e ElevenLabs (fala, transcrição, ligação e aviso assinado), todos com serviços simulados. O binário oficial foi validado até a leitura de conta sem autenticação. Execução real com assinatura exige conectar uma conta e não é coberta por esses testes automatizados.
