# Bússola de IA

Avaliação da maturidade em IA da empresa em 6 dimensões, com o estágio atual e o que fazer para evoluir. Área: Estratégia e Gestão.

## O que resolve
A empresa não sabe em que estágio de maturidade em IA está nem o que fazer a seguir. Este app aplica um questionário modelo (24 perguntas de escala + 2 de texto, em 6 dimensões) e devolve um diagnóstico com o nível geral, o nome do estágio (Inicial, Exploração, Estruturação, Escala ou Transformação) e a média por dimensão.

Nesta primeira versão só existe o questionário modelo (leitura) e a avaliação de exemplo — o editor de perguntas, o link público de coleta de respostas e a análise real por IA chegam nas próximas histórias.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo e testa a conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar, o app roda em modo demonstração com uma avaliação de exemplo.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher e mostrar a avaliação de exemplo sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3012
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/bussola-ia:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-bussola-ia (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3012:10000 -v bussola-ia-dados:/app/data ghcr.io/startse/bussola-ia:latest` e abra http://localhost:3012.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, para que assistentes como Claude ou ChatGPT chamem a ferramenta `avaliar_respostas` diretamente (nesta versão, sempre devolve a avaliação de exemplo). Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup` e configure o assistente com o endereço (`https://<seu-app>/mcp`) e o código como `Authorization: Bearer <código>`.

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
Na interface que abre no navegador, escolha o transporte "Streamable HTTP", cole `http://localhost:3000/mcp` (ou o endereço do deploy) em URL e adicione o cabeçalho `Authorization: Bearer <código>` em "Custom Headers". Clique em "Connect": a aba "Tools" deve listar `avaliar_respostas`; ao executá-la, o resultado devolvido é o mesmo objeto (avaliação com análise) que a rota `/api/bussola` produz.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx                tela única (formulário + resultado)
app/api/bussola/route.ts    geração da avaliação (demo nesta versão)
app/mcp/route.ts            endpoint MCP (JSON-RPC 2.0) para assistentes de IA
app/api/mcp/token/route.ts  gera, consulta e revoga o código de acesso do endpoint MCP
app/setup/page.tsx          configuração inicial (chaves, OAuth, teste de conexão, acesso MCP)
app/api/setup/              leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts     informa ao frontend se a IA está conectada
app/api/health/route.ts     health check
components/ui.tsx           componentes visuais compartilhados pela suíte
components/setup.tsx        tela de setup genérica, gerada a partir de lib/integracoes.ts
components/AcessoMCP.tsx    cartão do /setup para gerar/revogar o acesso MCP
lib/store.ts                configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts          tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts          integrações que este app precisa
lib/ai.ts                   cliente OpenRouter (askText, askJSON, askWithTools)
lib/mcp.ts                  protocolo MCP (JSON-RPC 2.0), código de acesso e limite de chamadas
lib/ferramentas.ts          ferramentas expostas via MCP (avaliar_respostas)
lib/modelo.ts               questionário modelo (6 dimensões, 24 perguntas de escala + 2 de texto)
lib/bussola.ts              lógica de geração da avaliação, usada pela rota HTTP e pela ferramenta MCP
lib/demo.ts                 avaliação de exemplo do modo demonstração
lib/types.ts                tipos do domínio
Dockerfile                  build multi-stage com saída standalone
docker-compose.yml          sobe este app isolado
render.yaml                 blueprint do Render (runtime image)
```
