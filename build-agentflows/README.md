# Build Agentflows

Crie fluxos visuais de agentes de IA, teste cada etapa e publique versões que seus sistemas e assistentes podem executar. Aplicação independente da suíte **IA para Executivos**, inspirada na orquestração explícita de [AgentFlow V2 do Flowise](https://docs.flowiseai.com/using-flowise/agentflowv2).

## O que resolve

Um quadro visual conecta dez tipos de bloco: Início, Gerar com IA, Agente, Condição, Atualizar estado, Requisição HTTP, Ferramenta MCP, Aprovação humana, Repetir e Resposta. O agente escolhe ferramentas autorizadas e incorpora seus resultados, em até 12 chamadas por etapa. As conexões determinam o caminho; condições e aprovações possuem saídas Sim/Não, e repetições têm saídas Repetir/Concluir.

O editor permite arrastar, conectar, remover, configurar, importar e exportar fluxos. Salvar altera o rascunho; publicar cria uma cópia estável para integrações. Testes usam o rascunho. Cada execução guarda entrada, saída, versão, estado e registro de etapas em SQLite. Aprovações persistem após reinício e aceitam uma única decisão. Execuções que estavam rodando no momento do reinício são marcadas como interrompidas para não repetir ações externas silenciosamente.

Ao selecionar explicitamente a simulação, os fluxos rodam em demonstração: agentes devolvem respostas ilustrativas e nenhuma chamada HTTP ou ferramenta externa é executada. Também é possível selecionar a simulação mesmo com IA conectada. `/?exemplo=1` cria um exemplo de triagem quando ainda não há fluxos.

## Stack

Next.js 16, React 19, TypeScript, Tailwind 4, React Flow (`@xyflow/react`, editor acessível com conexões/arraste/zoom) e SQLite nativo do Node. Conta, sessão, configurações cifradas e MCP reutilizam a infraestrutura da suíte. A IA usa exclusivamente login ChatGPT pelo Codex App Server oficial, fixado em @openai/codex 0.155.1.

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

Gere um código em **Integrar fluxo**, no cabeçalho do editor. Ele autentica tanto MCP quanto HTTP; revogação e rotação valem para os dois. É um acesso administrativo a esta instalação, não uma chave isolada por fluxo.

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

- `components/FlowEditor.tsx`: quadro, biblioteca e painel de configuração.
- `components/RunView.tsx`: resultado, etapas e aprovação.
- `lib/flow-types.ts`: blocos, grafo e contratos.
- `lib/flow-store.ts`: validação, versões, persistência e checkpoints.
- `lib/flow-runtime.ts`: motor, IA, ferramentas e HTTP.
- `lib/ferramentas.ts`: ferramentas expostas pelo MCP.
- `app/webhook/flows/[id]`: execução publicada via Bearer.
- `lib/flow-runtime.test.ts`: testes de comportamento com serviços simulados.

## Referência visual e validação

A experiência foi estudada diretamente no [Flowise Agentflows v2](https://github.com/FlowiseAI/Flowise/tree/9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb/packages/ui/src/views/agentflowsv2): biblioteca em grade/lista, editor em tela inteira, blocos compactos coloridos, biblioteca flutuante, diálogos de edição, minimapa e painel de conversa. Os componentes são próprios; não é uma reprodução integral do Flowise.

Os testes cobrem 19 comportamentos do motor e protocolo ChatGPT com subprocesso simulado. O binário oficial foi validado até a leitura de conta sem autenticação. Execução real com assinatura exige conectar uma conta e não é coberta por esses testes automatizados.
