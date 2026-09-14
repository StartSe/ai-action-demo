# Radar de Sinais

Radar de sinais de mercado gerado por IA a partir dos temas que você acompanha, agrupados por força e tendência e conectados entre si. Área: Estratégia, Inovação.

## O que resolve
Movimentos do mercado chegam tarde e dispersos. Este app junta o que saiu no período sobre os temas acompanhados, agrupa em sinais (com força, tendência e o que fazer em cada um) e mostra as conexões entre eles.

Decisão de escopo desta versão: o motor de busca real (Exa/Tavily e as fontes sem chave — Hacker News, Reddit, GitHub) e o agente de pesquisa em várias rodadas chegam em histórias seguintes. Até lá, sem IA conectada o radar é um exemplo (`lib/demo.ts`); com IA conectada, o radar é gerado em "melhor esforço" a partir do conhecimento geral do modelo sobre os temas informados — o prompt deixa isso explícito para não prometer uma busca que ainda não existe. O componente visual de grafo (nós e arestas) também é uma história futura; os tipos `No`/`Aresta` já existem em `lib/types.ts` para o `Radar` fazer sentido como estrutura de dados.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo e testa a conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar, o app roda em modo demonstração com um radar de exemplo.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher e executar um exemplo sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3011
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/radar-sinais:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-radar-sinais (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3011:10000 -v radar-sinais-dados:/app/data ghcr.io/startse/radar-sinais:latest` e abra http://localhost:3011.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, para que assistentes como Claude ou ChatGPT chamem a ferramenta `montar_radar` diretamente. Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup` e configure o assistente com o endereço (`https://<seu-app>/mcp`) e o código como `Authorization: Bearer <código>`.

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
Na interface que abre no navegador, escolha o transporte "Streamable HTTP", cole `http://localhost:3000/mcp` (ou o endereço do deploy) em URL e adicione o cabeçalho `Authorization: Bearer <código>` em "Custom Headers". Clique em "Connect": a aba "Tools" deve listar `montar_radar`; ao executá-la com os temas preenchidos, o resultado devolvido é o mesmo objeto (sinais, nós, arestas, conexões) que a rota `/api/radar` produz.

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
app/page.tsx            tela única (formulário + resultado)
app/api/radar/route.ts  geração do radar
app/mcp/route.ts        endpoint MCP (JSON-RPC 2.0) para assistentes de IA
app/api/mcp/token/route.ts  gera, consulta e revoga o código de acesso do endpoint MCP
app/setup/page.tsx      configuração inicial (chaves, OAuth, teste de conexão, acesso MCP)
app/api/setup/          leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts informa ao frontend se a IA está conectada
app/api/health/route.ts health check
components/ui.tsx       componentes visuais compartilhados pela suíte
components/setup.tsx    tela de setup genérica, gerada a partir de lib/integracoes.ts
components/AcessoMCP.tsx cartão do /setup para gerar/revogar o acesso MCP
lib/store.ts            configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts      tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts      integrações que este app precisa
lib/ai.ts               cliente OpenRouter (askText, askJSON, askWithTools)
lib/mcp.ts              protocolo MCP (JSON-RPC 2.0), código de acesso e limite de chamadas
lib/ferramentas.ts      ferramentas expostas via MCP (montar_radar)
lib/radar.ts            lógica de geração do radar, usada pela rota HTTP e pela ferramenta MCP
lib/demo.ts             radar de exemplo do modo demonstração
lib/types.ts            tipos do domínio (Sinal, No, Aresta, Radar)
Dockerfile              build multi-stage com saída standalone
docker-compose.yml      sobe este app isolado
render.yaml             blueprint do Render (runtime image)
```
