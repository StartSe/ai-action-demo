# Clone de Site

Transforme a captura de uma página de referência em uma página sua, em HTML, com o nome e as cores da sua marca. Área: Marketing e Produto.

## O que resolve
Montar uma página nova do zero leva semanas entre briefing, agência e ajustes. Este app recebe a captura (PNG ou JPG, até 5 MB) de uma página que o executivo gosta e devolve, em minutos, a versão dele: um único arquivo HTML em português, com a estrutura da referência, os textos reescritos para a marca informada e as imagens de terceiros trocadas por blocos na cor da marca (com texto alternativo). A prévia aparece em tamanho de computador e de celular (390 px), com o código pronto para copiar. Sem chave de IA, o app devolve uma landing fictícia completa (Nimbus Finanças) rotulada como demonstração.

Aviso mostrado abaixo de toda prévia: use a referência pela estrutura. Textos, marcas e imagens de terceiros são protegidos; troque pelo conteúdo da sua empresa.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com um modelo de visão (a captura é enviada junto com o prompt por `askVision`, em `lib/ai.ts`). O prompt de sistema (`lib/gerador.ts`) foi portado e traduzido do projeto aberto screenshot-to-code, adaptado para um arquivo HTML único, textos em português e imagens substituídas por blocos.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo com visão e testa a conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar um modelo com visão, o app roda em modo demonstração.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para carregar a captura de exemplo (`public/exemplo-referencia.png`), preencher a marca e gerar a página sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3015
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/clone-site:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-clone-site (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3015:10000 -v clone-site-dados:/app/data ghcr.io/startse/clone-site:latest` e abra http://localhost:3015.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Como a página é gerada
1. O navegador lê a captura como data URL e envia em `POST /api/pagina` com `stack` (`html-tailwind` ou `html-css`), `instrucoes` e `marca` (`nome`, `corPrimaria`, `corSecundaria`, cores em `#RRGGBB`).
2. `lib/gerador.ts` valida a imagem (PNG/JPG, até 5 MB), monta o prompt e chama o modelo de visão. Da resposta, recorta o trecho `<html>...</html>` (exige `<body>` aberto e fechado) e sanitiza: remove todo `<script>` que não seja o Tailwind pela CDN (no formato CSS, remove todos), `iframe`/`object`/`embed`/`base`, atributos `on*` e links `javascript:`.
3. A página é salva no histórico (tipo `pagina`) sem a captura: só formato, instruções, marca e o tamanho da imagem. O resultado abre em `/r/<id>`.

A prévia é um `<iframe sandbox="allow-scripts" srcDoc=...>`: o HTML gerado roda numa origem opaca, sem acesso a cookies, armazenamento nem ao próprio app. `allow-scripts` é necessário porque o Tailwind pela CDN é um script; sem ele, o formato Tailwind apareceria sem estilo.

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, com a ferramenta `gerar_pagina(imagem_url, instrucoes?, marca?, formato?)`: o servidor baixa a captura no endereço público informado (só http/https, sem endereços internos da rede, PNG ou JPG reconhecidos pelos primeiros bytes, até 5 MB) e devolve id, título, link `/r/<id>` e o HTML. Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup` e configure o assistente com o endereço (`https://<seu-app>/mcp`) e o código como `Authorization: Bearer <código>`.

Decisão de implementação: protocolo implementado à mão em `lib/mcp.ts` (JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`), em vez do pacote `@modelcontextprotocol/sdk` — mesma decisão herdada de `pdi-time`. Rate limit de 60 chamadas por minuto por código, em memória.

```bash
curl -X POST https://<seu-app>/mcp \
  -H "Authorization: Bearer <código>" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"gerar_pagina","arguments":{"imagem_url":"https://exemplo.com/captura.png","marca":{"nome":"Minha Empresa","corPrimaria":"#0f766e"}}}}'
```

### Testar com o MCP Inspector
```bash
npx @modelcontextprotocol/inspector
```
Na interface que abre no navegador, escolha o transporte "Streamable HTTP", cole `http://localhost:3000/mcp` (ou o endereço do deploy) em URL e adicione o cabeçalho `Authorization: Bearer <código>` em "Custom Headers". Clique em "Connect": a aba "Tools" deve listar `gerar_pagina`.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Precisa ser um modelo com visão para sair do modo demonstração. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx              tela única (captura + formato + marca → prévia)
app/api/pagina/route.ts   gera a página (POST), lista as últimas (GET) e apaga o histórico (DELETE)
app/r/[id]/page.tsx       prévia de uma página salva, por link
app/mcp/route.ts          endpoint MCP (JSON-RPC 2.0) para assistentes de IA
app/api/mcp/token/route.ts gera, consulta e revoga o código de acesso do endpoint MCP
app/setup/page.tsx        configuração inicial (IA, acesso MCP)
app/api/setup/            leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts   informa ao frontend se a IA (com visão) está conectada
app/api/health/route.ts   health check
components/ui.tsx         componentes visuais compartilhados pela suíte
components/setup.tsx      tela de setup genérica, gerada a partir de lib/integracoes.ts
components/AcessoMCP.tsx  cartão do /setup para gerar/revogar o acesso MCP
components/PreviaPagina.tsx prévia em iframe (Computador/Celular), "Ver o código" e aviso de terceiros
lib/gerador.ts            prompt de sistema, extração e sanitização do HTML, gravação no histórico
lib/ferramentas.ts        ferramenta MCP gerar_pagina (baixa a imagem no servidor)
lib/demo.ts               landing fictícia completa devolvida sem modelo de visão
lib/types.ts              Pedido, Versao, Pagina, Marca
lib/ai.ts                 cliente OpenRouter (askText, askVision, askJSON, askWithTools)
lib/store.ts              configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts        tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts        integrações que este app precisa (só OpenRouter)
lib/mcp.ts                protocolo MCP (JSON-RPC 2.0), código de acesso e limite de chamadas
public/exemplo-referencia.png captura de exemplo usada por "Preencher com um exemplo" e /?exemplo=1
Dockerfile                build multi-stage com saída standalone
docker-compose.yml        sobe este app isolado
render.yaml               blueprint do Render (runtime image)
```
