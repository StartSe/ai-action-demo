# Vídeos de Campanha

Descreva a campanha, envie a imagem do produto e escolha entre três conceitos de vídeo curto antes de gastar créditos. Área: Marketing.

## O que resolve
Produzir um vídeo curto para cada campanha leva semanas entre agência, aprovação e ajustes, e gerar vídeo por IA sem saber o que vai sair custa créditos. Este app recebe um briefing (produto ou oferta, para quem, objetivo, tom, formato e duração) e a imagem do produto (PNG ou JPG, até 5 MB) e devolve três conceitos diferentes, cada um com roteiro por cena (o que aparece, quantos segundos, texto na tela), efeito visual sugerido, chamada e legendas prontas para Instagram, LinkedIn e TikTok. A prévia ilustrativa de cada conceito é um storyboard na proporção escolhida, com a imagem do produto ao fundo e as cenas alternando. Sem chave de IA, o app devolve três conceitos fictícios rotulados como demonstração.

A geração do vídeo de verdade (Higgsfield, via MCP, com o custo em créditos exibido antes de confirmar) chega na próxima etapa. Até lá, o botão "Gerar este vídeo" fica desabilitado com a frase "Conecte o Higgsfield para gerar o vídeo de verdade".

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter (`askJSON`, em `lib/ai.ts`). Storyboard e animação em HTML e CSS puros (sem biblioteca de vídeo, animação ou UI).

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo e testa a conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar, o app roda em modo demonstração.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher o briefing de exemplo (garrafa térmica Vela), carregar a imagem do produto (`public/exemplo-produto.jpg`) e criar os conceitos sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3017
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/videos-campanha:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-videos-campanha (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3017:10000 -v videos-campanha-dados:/app/data ghcr.io/startse/videos-campanha:latest` e abra http://localhost:3017.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Como os conceitos são criados
1. O navegador lê a imagem do produto como data URL e envia em `POST /api/conceitos` junto com `produto`, `publico`, `objetivo` (`lancamento`, `promocao`, `marca`, `evento`), `tom`, `formato` (`9:16`, `16:9`, `1:1`) e `duracaoSeg` (`5`, `10`, `15`).
2. `lib/conceitos.ts` valida o briefing (`normalizarBriefing`; erro de entrada responde 400) e a imagem (PNG/JPG, até 5 MB), monta o prompt e chama a IA (`criarConceitos`, via `askJSON`). A resposta passa por `normalizarConceitos`: exatamente 3 conceitos com exatamente 3 cenas cada, segundos inteiros que somam a duração pedida (`distribuirSegundos` corrige quando a IA erra a conta), efeito casado por nome com a lista interna (`EFEITOS` em `lib/types.ts`: Zoom dramático, Giro do produto, Explosão de partículas, Câmera lenta, Antes e depois) e legendas por rede com texto de fallback.
3. A campanha é salva no histórico (tipo `campanha`) com o briefing (inclusive a imagem, necessária para redesenhar o storyboard e, na próxima etapa, gerar o vídeo) e os conceitos. O resultado abre em `/r/<id>`; "Entregar" copia o roteiro em texto e abre a folha de impressão (`/imprimir/<id>`, storyboard parado e roteiro por cena).

O storyboard (`components/Storyboard.tsx`) é um quadro na proporção escolhida com a imagem do produto ao fundo, sobreposição escura a 40% e o texto de cada cena entrando num crossfade de 3 s por cena (CSS puro, desligado por `prefers-reduced-motion`; os botões "Cena 1/2/3" fixam uma cena). O rótulo "Prévia ilustrativa" é fixo: o vídeo real só existe depois de gerar.

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, com a ferramenta `criar_conceitos(produto, publico?, objetivo?, tom?, formato?, duracaoSeg?, imagem_url?)`: o servidor baixa a imagem do produto no endereço público informado (só http/https, sem endereços internos da rede, PNG ou JPG reconhecidos pelos primeiros bytes, até 5 MB) e devolve id, título, link `/r/<id>` e os três conceitos. Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup` e configure o assistente com o endereço (`https://<seu-app>/mcp`) e o código como `Authorization: Bearer <código>`.

Decisão de implementação: protocolo implementado à mão em `lib/mcp.ts` (JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`), em vez do pacote `@modelcontextprotocol/sdk` — mesma decisão herdada de `pdi-time`. Rate limit de 60 chamadas por minuto por código, em memória.

```bash
curl -X POST https://<seu-app>/mcp \
  -H "Authorization: Bearer <código>" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"criar_conceitos","arguments":{"produto":"Garrafa térmica Vela 750 ml","publico":"quem treina cedo","formato":"9:16","duracaoSeg":10}}}'
```

### Testar com o MCP Inspector
```bash
npx @modelcontextprotocol/inspector
```
Na interface que abre no navegador, escolha o transporte "Streamable HTTP", cole `http://localhost:3000/mcp` (ou o endereço do deploy) em URL e adicione o cabeçalho `Authorization: Bearer <código>` em "Custom Headers". Clique em "Connect": a aba "Tools" deve listar `criar_conceitos`.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão em `lib/ai.ts`. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx              tela única (briefing + imagem → três conceitos)
app/api/conceitos/route.ts cria os conceitos (POST), lista as últimas campanhas (GET) e apaga o histórico (DELETE)
app/r/[id]/page.tsx       uma campanha salva, por link
app/imprimir/[id]/page.tsx folha de impressão: storyboard parado e roteiro por cena
app/mcp/route.ts          endpoint MCP (JSON-RPC 2.0) para assistentes de IA
app/api/mcp/token/route.ts gera, consulta e revoga o código de acesso do endpoint MCP
app/setup/page.tsx        configuração inicial (IA, acesso MCP)
app/api/setup/            leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts   informa ao frontend se a IA está conectada
app/api/health/route.ts   health check
components/ui.tsx         componentes visuais compartilhados pela suíte
components/setup.tsx      tela de setup genérica, gerada a partir de lib/integracoes.ts
components/AcessoMCP.tsx  cartão do /setup para gerar/revogar o acesso MCP
components/Storyboard.tsx prévia ilustrativa: quadro na proporção, imagem ao fundo, cenas em crossfade
lib/conceitos.ts          validação do briefing, prompt, normalização dos conceitos e gravação no histórico
lib/ferramentas.ts        ferramenta MCP criar_conceitos (baixa a imagem no servidor)
lib/demo.ts               briefing e três conceitos fictícios; distribuirSegundos
lib/roteiro.ts            roteiro em texto (copiar/baixar)
lib/types.ts              Briefing, Conceito, Video, Campanha, listas de formato/duração/objetivo/efeito
lib/ai.ts                 cliente OpenRouter (askText, askVision, askJSON, askWithTools)
lib/store.ts              configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts        tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts        integrações que este app precisa (só OpenRouter por enquanto)
lib/mcp.ts                protocolo MCP (JSON-RPC 2.0), código de acesso e limite de chamadas
public/exemplo-produto.jpg imagem do produto de exemplo usada por "Preencher com um exemplo" e /?exemplo=1
Dockerfile                build multi-stage com saída standalone
docker-compose.yml        sobe este app isolado
render.yaml               blueprint do Render (runtime image)
```
