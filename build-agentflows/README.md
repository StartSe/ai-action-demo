# Build Agentflows

Crie fluxos visuais de agentes de IA, teste cada etapa e publique versões que seus sistemas e assistentes podem executar. Aplicação independente da suíte **IA para Executivos**, inspirada na orquestração explícita de [AgentFlow V2 do Flowise](https://docs.flowiseai.com/using-flowise/agentflowv2).

## O que resolve

Um quadro visual conecta dez tipos de bloco: Início, Gerar com IA, Agente, Condição, Atualizar estado, Requisição HTTP, Ferramenta MCP, Aprovação humana, Repetir e Resposta. O agente escolhe ferramentas autorizadas e incorpora seus resultados, em até seis rodadas. As conexões determinam o caminho; condições e aprovações possuem saídas Sim/Não, e repetições têm saídas Repetir/Concluir.

O editor permite arrastar, conectar, remover, configurar, importar e exportar fluxos. Salvar altera o rascunho; publicar cria uma cópia estável para integrações. Testes usam o rascunho. Cada execução guarda entrada, saída, versão, estado e registro de etapas em SQLite. Aprovações persistem após reinício e aceitam uma única decisão. Execuções que estavam rodando no momento do reinício são marcadas como interrompidas para não repetir ações externas silenciosamente.

Sem chave de IA, os fluxos rodam em demonstração: agentes devolvem respostas ilustrativas e nenhuma chamada HTTP ou ferramenta externa é executada. Também é possível selecionar a simulação mesmo com IA conectada. `/?exemplo=1` cria um exemplo de triagem quando ainda não há fluxos.

## Stack

Next.js 16, React 19, TypeScript, Tailwind 4, React Flow (`@xyflow/react`, editor acessível com conexões/arraste/zoom) e SQLite nativo do Node. Conta, sessão, configurações cifradas, IA via OpenRouter, MCP e rotinas seguem a infraestrutura da suíte.

## Rodar localmente

```sh
npm ci
npm run dev
```

Node 22.13+ para o servidor; Node 24 para os testes TypeScript. Abra o endereço informado pelo Next e crie a conta administrativa. Conecte a IA e, opcionalmente, um servidor de ferramentas em **Configurações**.

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

Gere um código em Configurações → Usar dentro do seu assistente. Ele autentica tanto MCP quanto HTTP; revogação e rotação valem para os dois. É um acesso administrativo a esta instalação, não uma chave isolada por fluxo.

```sh
curl -X POST 'https://SEU-APP/webhook/flows/ID-DO-FLUXO' \
  -H 'Authorization: Bearer SEU-CODIGO' \
  -H 'Content-Type: application/json' \
  -d '{"input":"Classifique esta solicitação"}'
```

A resposta inclui `id`, `status`, `output`, `error`, `demo` e `version`. `status` pode ser `completed`, `failed` ou `waiting`; uma falha de execução é registrada e retornada no corpo, portanto confira `status`, não apenas o HTTP 200. Rascunhos e publicações desativadas recusam a execução externa. Limite de 60 chamadas/minuto/código compartilhado com MCP.

O servidor `POST /mcp` oferece `listar_fluxos`, `executar_fluxo`, `consultar_execucao` e `responder_aprovacao`. A aprovação também pode ser respondida na tela Execuções. Para um cliente automatizado, a decisão deve vir explicitamente da pessoa autorizada. Não compartilhe o código com consumidores que não possam consultar execuções ou decidir aprovações.

As rotas de edição `/api/flows` e de acompanhamento `/api/runs` exigem sessão administrativa. As execuções são síncronas por segmento até terminar ou pausar; um consumidor deve permitir tempo suficiente para a resposta. O editor consulta o histórico durante a execução, sem streaming de tokens.

### Dados entre blocos

- `{{input}}`: entrada original.
- `{{last}}`: saída da última etapa.
- `{{nodes.identificador}}`: saída mais recente daquele bloco.
- `{{state.nome}}`: variável compartilhada; Inicialização aceita um objeto JSON com valores de texto.

Referências ausentes interrompem a execução com diagnóstico. Após aprovação, `state.approval` contém `yes` ou `no`; para reutilizar o texto anterior, referencie o bloco que o produziu. Argumentos de ferramentas precisam resultar em JSON válido após interpolação.

HTTP usa um endereço fixo definido pelo autor do fluxo, não interpolado a partir da entrada. Redirecionamentos são recusados. Para autenticação Bearer, configure `FLOW_SECRET_NOME` no ambiente e informe apenas esse nome no bloco. Não insira segredos em instruções, endereços, corpos ou arquivos exportados. Os blocos HTTP são uma capacidade administrativa e podem acessar serviços alcançáveis pelo servidor.

## Variáveis

Nenhuma é obrigatória. O ambiente tem prioridade sobre valores salvos em Configurações.

| Variável | Uso / origem |
| --- | --- |
| `DATA_DIR` | Diretório persistente; padrão `./data`, Docker `/app/data` |
| `APP_URL` | Endereço público usado nos links das notificações |
| `PORT`, `HOSTNAME` | Endereço do servidor; Docker `10000`, `0.0.0.0` |
| `CHAVE_MESTRA` | Chave AES de 32 bytes em base64; alternativa ao arquivo local gerado |
| `OPENROUTER_API_KEY` | [Chave da IA](https://openrouter.ai/settings/keys) |
| `OPENROUTER_MODEL` | Modelo padrão; também pode ser escolhido por bloco |
| `OPENROUTER_MODEL_VISAO`, `OPENROUTER_MODEL_AVALIACAO` | Opções herdadas da infraestrutura; não utilizadas pelo motor de fluxos |
| `FERRAMENTAS_URL`, `FERRAMENTAS_CODIGO` | Endereço e código fornecidos pelo servidor MCP conectado |
| `FERRAMENTAS_EXPIRA`, `FERRAMENTAS_REFRESH` | Gerenciados pelo OAuth do conector, quando disponível |
| `MCP_CODIGO_ACESSO` | Alternativa ao código gerado no cartão de acesso |
| `FLOW_SECRET_*` | Credenciais Bearer dos serviços HTTP, definidas pela equipe técnica |
| `NOTIFICACOES_CANAL`, `NOTIFICACOES_DESTINO` | Canal e destino dos resumos agendados |
| `NOTIFICACOES_RESEND_API_KEY` | [Resend](https://resend.com/api-keys), chave para envio pelo remetente padrão de teste |
| `NOTIFICACOES_SMTP_HOST`, `NOTIFICACOES_SMTP_PORTA`, `NOTIFICACOES_SMTP_USUARIO`, `NOTIFICACOES_SMTP_SENHA` | SMTP fornecido pelo provedor de e-mail |
| `NOTIFICACOES_SLACK_WEBHOOK` | [Incoming webhook do Slack](https://api.slack.com/messaging/webhooks) |
| `GOOGLE_CLIENT_ID_APP`, `GOOGLE_CLIENT_SECRET_APP` | Registro OAuth da suíte no [Google Cloud](https://console.cloud.google.com/apis/credentials) |
| `MICROSOFT_CLIENT_ID_APP`, `MICROSOFT_CLIENT_SECRET_APP` | Registro OAuth da suíte no [Microsoft Entra](https://entra.microsoft.com/) |
| `NOVA_SENHA_ADMIN` | Redefine a senha administrativa na subida; remova após o uso |
| `CONTA_DESLIGADA` | Somente captura/teste efêmero; `1` desliga autenticação administrativa |

## Recorte em relação ao Flowise

Implementação própria simplificada, sem copiar código do Flowise. Não é um fork nem importa arquivos nativos do Flowise: importação/exportação usa `build-agentflows/v1`. Não inclui Chatflows, Agentflows v1, marketplace, bases vetoriais, documentos/RAG, JavaScript arbitrário, subfluxos, iteração de listas, execução paralela, memória entre conversas ou streaming de tokens. Cada execução tem estado próprio e percorre um caminho por vez. O limite é 60 blocos, 120 conexões, 150 etapas e 20 passagens por bloco de repetição. Operações externas já iniciadas podem concluir mesmo se a execução for cancelada; o cancelamento impede novos blocos.

## Estrutura

- `components/FlowEditor.tsx`: quadro, biblioteca e painel de configuração.
- `components/RunView.tsx`: resultado, etapas e aprovação.
- `lib/flow-types.ts`: blocos, grafo e contratos.
- `lib/flow-store.ts`: validação, versões, persistência e checkpoints.
- `lib/flow-runtime.ts`: motor, IA, ferramentas e HTTP.
- `lib/ferramentas.ts`: ferramentas expostas pelo MCP.
- `app/webhook/flows/[id]`: execução publicada via Bearer.
- `lib/flow-runtime.test.ts`: testes de comportamento com serviços simulados.
