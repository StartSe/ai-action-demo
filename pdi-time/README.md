# PDI do Time

Plano de Desenvolvimento Individual gerado por IA a partir das entregas recentes do profissional e dos objetivos da empresa. Área: Recursos Humanos.

## O que resolve
Líderes chegam à conversa de feedback sem plano. Este app transforma o que a pessoa entregou e o que a empresa precisa em um PDI de 90 dias, com pontos fortes, lacunas priorizadas, objetivos com ações em 30/60/90 dias, recursos de apoio e perguntas para a conversa.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo e testa a conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar, o app roda em modo demonstração com um plano de exemplo.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher e executar um exemplo sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3001
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/pdi-time:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-pdi-time (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3001:10000 -v pdi-time-dados:/app/data ghcr.io/startse/pdi-time:latest` e abra http://localhost:3001.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

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
app/api/pdi/route.ts    geração do PDI
app/setup/page.tsx      configuração inicial (chaves, OAuth, teste de conexão)
app/api/setup/          leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts informa ao frontend se a IA está conectada
app/api/health/route.ts health check
components/ui.tsx       componentes visuais compartilhados pela suíte
components/setup.tsx    tela de setup genérica, gerada a partir de lib/integracoes.ts
lib/store.ts            configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts      tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts      integrações que este app precisa
lib/ai.ts               cliente OpenRouter (askText, askJSON, askWithTools)
lib/demo.ts             resposta de exemplo do modo demonstração
lib/types.ts            tipos do domínio
Dockerfile              build multi-stage com saída standalone
docker-compose.yml      sobe este app isolado
render.yaml             blueprint do Render (runtime image)
```
