# Simulador de Vendas

Cadastre seu time, escolha um cenário de cliente simulado e cole uma conversa de vendas para ver a análise: nota geral, nota e evidência de cada critério de venda consultiva, pontos fortes, o que melhorar e os momentos-chave. Área: Vendas.

## O que resolve
Antes de conectar a voz (a próxima etapa da suíte), o gestor de vendas já consegue ver o que o app mede: cola uma conversa (colada de uma ligação transcrita, de um chat ou digitada à mão) e recebe uma análise objetiva contra 7 critérios de venda consultiva, com evidências específicas da conversa, não conselhos genéricos.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo e testa a conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar, o app roda em modo demonstração com uma conversa e uma análise de exemplo.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher e executar um exemplo sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3013
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/simulador-vendas:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-simulador-vendas (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3013:10000 -v simulador-vendas-dados:/app/data ghcr.io/startse/simulador-vendas:latest` e abra http://localhost:3013.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Sala de simulação pública ("Criar link de treino")
No painel, "Criar link de treino" gera um link (`/simular/<código>`, válido por 30 dias, sem limite de usos) que o vendedor abre sozinho para treinar com o cliente simulado do cenário escolhido.

- **Sem a integração "Cliente simulado por voz" conectada:** a sala mostra uma conversa por texto (a IA responde como o cliente); ao clicar em "Encerrar e ver minha análise", o vendedor vê a mesma análise do painel.
- **Com a integração conectada:** a sala carrega o widget oficial de voz da ElevenLabs (`<elevenlabs-convai>`) no lugar do texto. Para isso funcionar de verdade:
  1. No agente conversacional (ElevenLabs › Conversational AI › Agents › seu agente › aba Security), desligue a exigência de autenticação (o link é público, sem login) e adicione o domínio onde este app está publicado à lista de domínios permitidos, para nenhum outro site poder embutir o mesmo agente.
  2. Configure o aviso automático de pós-conversa (evento `post_call_transcription`) apontando para o endereço mostrado no cartão "Dados para a equipe técnica" em `/setup#elevenlabs-agente`, como já descrito acima em "Segredo de verificação" — é assim que a análise da ligação chega de volta.
  3. O widget manda `sala_token` como variável dinâmica; é assim que o aviso automático liga a conversa recebida à sala certa (mesmo agente pode ser usado por várias salas ao mesmo tempo), sem precisar de nenhuma outra configuração.

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, para que assistentes como Claude ou ChatGPT chamem a ferramenta `analisar_conversa` diretamente. Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup` e configure o assistente com o endereço (`https://<seu-app>/mcp`) e o código como `Authorization: Bearer <código>`.

Decisão de implementação: protocolo implementado à mão em `lib/mcp.ts` (JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`), em vez do pacote `@modelcontextprotocol/sdk`. O app só precisa desses três métodos, sem `resources`, `prompts` nem streaming de progresso — a mesma filosofia de `lib/store.ts` (SQLite sem dependências externas) evita adicionar uma dependência pesada para um uso pequeno. Rate limit de 60 chamadas por minuto por código, em memória (`lib/mcp.ts`); reinicia ao reiniciar o servidor ou ao gerar um novo código.

```bash
curl -X POST https://<seu-app>/mcp \
  -H "Authorization: Bearer <código>" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

O cartão também mostra um passo a passo de três passos para o Claude Desktop e para o ChatGPT, e um botão "Copiar configuração" que copia um JSON pronto (endereço + código) logo após gerar um acesso.

### Testar com o MCP Inspector
```bash
npx @modelcontextprotocol/inspector
```
Na interface que abre no navegador, escolha o transporte "Streamable HTTP", cole `http://localhost:3000/mcp` (ou o endereço do deploy) em URL e adicione o cabeçalho `Authorization: Bearer <código>` em "Custom Headers". Clique em "Connect": a aba "Tools" deve listar `analisar_conversa`; ao executá-la com uma transcrição, o resultado devolvido é o mesmo objeto (nota, critérios, pontos fortes) que a rota `/api/analisar` produz.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `ELEVENLABS_API_KEY` | Opcional. Chave da ElevenLabs para a sala de treino por voz. Obtenha em https://elevenlabs.io/app/settings/api-keys. |
| `ELEVENLABS_AGENT_ID` | Opcional. Agente conversacional que faz o papel do cliente. Crie em https://elevenlabs.io/app/conversational-ai; em `/setup` a lista é carregada da própria conta. |
| `ELEVENLABS_WEBHOOK_SECRET` | Opcional. Segredo de verificação do aviso de pós-conversa (Configurações › Webhooks na ElevenLabs), usado para validar a assinatura em `app/webhook/elevenlabs/route.ts`. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx              tela única (painel + análise)
app/api/analisar/route.ts análise de uma conversa (POST) e histórico (GET/DELETE)
app/api/vendedores/route.ts cadastro e lista do time de vendas
app/api/cenarios/route.ts lista dos cenários de cliente simulado (semeados na primeira leitura)
app/api/salas/route.ts    cria o link de treino ("Criar link de treino")
app/api/salas/[token]/conversar/route.ts próxima fala do cliente simulado (sala por texto)
app/api/salas/[token]/analisar/route.ts  encerra a conversa por texto e gera a análise
app/api/salas/[token]/ultima/route.ts    sondado pela sala por voz até a análise chegar
app/simular/[token]/page.tsx sala de simulação pública (texto ou widget de voz)
components/SalaSimulacao.tsx tela da sala pública (conversa por texto e widget de voz)
app/webhook/elevenlabs/route.ts aviso automático de pós-conversa (ligação por voz)
app/mcp/route.ts          endpoint MCP (JSON-RPC 2.0) para assistentes de IA
app/api/mcp/token/route.ts  gera, consulta e revoga o código de acesso do endpoint MCP
app/setup/page.tsx        configuração inicial (chaves, OAuth, teste de conexão, acesso MCP, rotinas)
app/api/setup/            leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts   informa ao frontend se a IA está conectada
app/api/health/route.ts   health check
components/ui.tsx         componentes visuais compartilhados pela suíte
components/setup.tsx      tela de setup genérica, gerada a partir de lib/integracoes.ts
components/AcessoMCP.tsx  cartão do /setup para gerar/revogar o acesso MCP
components/Rotinas.tsx    cartão do /setup para agendar o resumo periódico
lib/store.ts               configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts         tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts         integrações que este app precisa
lib/ai.ts                  cliente OpenRouter (askText, askJSON, askWithTools)
lib/mcp.ts                 protocolo MCP (JSON-RPC 2.0), código de acesso e limite de chamadas
lib/ferramentas.ts         ferramentas expostas via MCP (analisar_conversa)
lib/analise.ts              lógica de análise, usada pela rota HTTP e pela ferramenta MCP
lib/vendedores.ts           CRUD do time de vendas (SQLite)
lib/cenarios.ts             CRUD dos cenários de cliente simulado, com seed idempotente de 3 modelos
lib/criterios.ts            lista padrão dos 7 critérios de venda consultiva
lib/conversa.ts             conversão do texto colado em transcrição estruturada
lib/salas.ts                salas de simulação pública (SQLite): link de treino de 30 dias
lib/simulacao.ts             próxima fala do cliente simulado (sala por texto), com roteiro fixo em demo
lib/elevenlabs-convai.d.ts   tipo do elemento <elevenlabs-convai> do widget oficial de voz
lib/demo.ts                 conversa e análise de exemplo do modo demonstração
lib/rotinas-do-app.ts       rotina "Resumo das conversas analisadas"
lib/types.ts                 tipos do domínio
Dockerfile                 build multi-stage com saída standalone
docker-compose.yml         sobe este app isolado
render.yaml                 blueprint do Render (runtime image)
```
