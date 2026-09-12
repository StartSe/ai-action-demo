# Posts em Minutos

Posts para redes sociais gerados por IA a partir de um briefing curto: um texto por rede (LinkedIn, Instagram e X), com hashtags, melhor horário e imagem. Área: Marketing.

## O que resolve
A empresa tem o que dizer, mas não tem tempo de escrever para cada rede. Este app recebe a novidade em poucas linhas e devolve a ideia central e um post adaptado ao formato de cada plataforma: LinkedIn com parágrafos curtos até 1300 caracteres, Instagram com legenda e hashtags, X em até 280 caracteres. Cada post tem prévia no layout da rede, botão para gerar a imagem, copiar o texto, baixar a imagem e reescrever mais curto.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão. Imagens via OpenAI (`gpt-image-1`), com um cartaz gerado localmente como alternativa sem chave.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo e testa a conexão. A geração de imagens (OpenAI) é opcional e também se conecta ali. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar a IA, o app roda em modo demonstração com posts de exemplo; até conectar a OpenAI, a imagem de cada post é um cartaz gerado localmente.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher e executar um exemplo sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3004
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/posts-sociais:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-posts-sociais (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3004:10000 -v posts-sociais-dados:/app/data ghcr.io/startse/posts-sociais:latest` e abra http://localhost:3004.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo lá.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Ativa a geração real dos textos. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `OPENAI_API_KEY` | Alternativa ao setup. Ativa a geração real de imagens. Obtenha em https://platform.openai.com/api-keys. |
| `OPENAI_IMAGE_MODEL` | Alternativa ao setup. Padrão `gpt-image-1` (também aceita `gpt-image-1-mini`). |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

A geração de imagens fica isolada na rota `app/api/imagem/route.ts`. Para trocar de provedor (por exemplo, Higgsfield), edite só essa rota mantendo a resposta `{ url }` com uma data URL ou um link para a imagem.

## Estrutura
```
app/page.tsx                 tela única (formulário + resultado)
app/api/posts/route.ts       gera a ideia central e um post por rede
app/api/imagem/route.ts      gera a imagem de um post (OpenAI ou cartaz local)
app/api/reescrever/route.ts  reescreve um post mais curto
app/setup/page.tsx           configuração inicial (chaves, OAuth, teste de conexão)
app/api/setup/               leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts      informa ao frontend se a IA e as imagens estão conectadas
app/api/health/route.ts      health check
components/ui.tsx            componentes visuais compartilhados pela suíte
components/setup.tsx         tela de setup genérica, gerada a partir de lib/integracoes.ts
components/PreviaPost.tsx    prévia de um post por rede, com ações
lib/store.ts                 configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts           tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts           integrações que este app precisa (OpenRouter e OpenAI)
lib/ai.ts                    cliente OpenRouter (askText, askJSON)
lib/demo.ts                  posts de exemplo e encurtador simples do modo demonstração
lib/cartaz.ts                cartaz SVG local usado quando não há provedor de imagens
lib/types.ts                 tipos do domínio
Dockerfile                   build multi-stage com saída standalone
docker-compose.yml           sobe este app isolado
render.yaml                  blueprint do Render (runtime image)
```
