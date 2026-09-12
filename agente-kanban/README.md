# Agente de Kanban

Agente de IA que opera um quadro Kanban (Trello) a partir de comandos em linguagem natural. Área: Gestão e RH.

## O que resolve
O gestor fala como falaria com uma pessoa do time — "crie um cartão para entrevistar a candidata Paula na quinta e mova o onboarding do Pedro para concluído" — e o agente executa isso direto no quadro: cria, move, comenta e arquiva cartões, sempre conferindo o quadro real antes de agir para não errar o cartão ou a lista.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão, usando tool calling para operar o quadro.

## Configuração inicial
Nenhuma variável de ambiente é obrigatória. Ao abrir o app pela primeira vez, use o link **Conectar a IA em 1 minuto** (ou vá direto em `/setup`) para conectar:

- **Inteligência artificial (OpenRouter)**: clique em "Conectar com OpenRouter" para autorizar em um clique, ou cole uma chave gerada em [openrouter.ai/keys](https://openrouter.ai/keys).
- **Quadro do Trello** (opcional): salve a chave da API do Trello, clique em **Autorizar no Trello** — você é levado ao Trello, autoriza o acesso e volta já com o token salvo — e então escolha o quadro na lista (ela é carregada automaticamente assim que a chave e o token existem).

As chaves ficam gravadas em SQLite (`DATA_DIR/app.sqlite`, padrão `./data`), nunca aparecem por inteiro na tela depois de salvas (só os 4 primeiros e 4 últimos caracteres) e podem ser trocadas a qualquer momento em `/setup`. Variáveis de ambiente, quando definidas, têm prioridade sobre o que foi salvo ali.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000
```
Abra `/setup` para conectar a IA e o Trello, ou use o app direto: sem `OPENROUTER_API_KEY`, o agente responde por um interpretador de comandos por palavras-chave (criar, mover, listar, comentar, arquivar), tolerante a acentos, para o app continuar testável sem nenhuma chave. Sem a chave, o token e o quadro do Trello, ele opera um quadro de exemplo em memória com listas "A fazer", "Em andamento" e "Concluído" e cartões de RH plausíveis. Abra `/?exemplo=1` para ver um comando composto (criar e mover cartões) executado sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3002
```
O volume `dados` persiste o SQLite com a configuração entre reinícios do contêiner.

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/agente-kanban:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-agente-kanban (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3002:10000 -v agente-kanban-dados:/app/data ghcr.io/startse/agente-kanban:latest` e abra http://localhost:3002.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Como obter as credenciais do Trello
1. Em `/setup`, salve a chave da API do Trello (obtida em [trello.com/power-ups/admin](https://trello.com/power-ups/admin)).
2. Clique em **Autorizar no Trello**: você é levado ao Trello, autoriza o acesso de leitura e escrita e volta ao app com o token já salvo.
3. Escolha o quadro na lista — ela é carregada automaticamente a partir da sua conta assim que a chave e o token existem.
4. O quadro deve ter ao menos as listas onde os cartões vão circular; o agente descobre os IDs das listas e dos cartões sozinho antes de agir (nunca invente um ID).

## Outras ferramentas de gestão
A mesma abordagem serve para Jira, Notion, monday.com ou qualquer board — basta trocar `lib/trello.ts` por um módulo que implemente a mesma interface `ProvedorQuadro` (`lib/quadro.ts`): `listarListas`, `listarCartoes`, `obterQuadro`, `criarCartao`, `moverCartao`, `comentar`, `arquivarCartao`, chamando a API daquela ferramenta — inclusive via um servidor MCP dela, se existir, no lugar de chamadas REST diretas.

## Variáveis de ambiente (opcionais)
Todas as variáveis abaixo são alternativas ao `/setup` — configure por ali sempre que possível. Quando definidas, têm prioridade sobre o que foi salvo no setup.

| Variável | Descrição |
|---|---|
| `DATA_DIR` | Onde fica o banco `app.sqlite` com a configuração do setup. Padrão `./data` (`/app/data` no Docker). |
| `OPENROUTER_API_KEY` | Ativa o agente com IA real (tool calling). Obtenha em https://openrouter.ai/keys. Sem ela, interpretador de comandos por palavras-chave. |
| `OPENROUTER_MODEL` | Padrão `nvidia/nemotron-3-super-120b-a12b:free` (gratuito). Qualquer modelo do OpenRouter com suporte a tools funciona. |
| `OPENROUTER_FALLBACK_MODELS` | Modelos de reserva separados por vírgula. |
| `TRELLO_API_KEY` | Chave da API do Trello. Obtenha em [trello.com/power-ups/admin](https://trello.com/power-ups/admin). |
| `TRELLO_API_TOKEN` | Token de acesso do Trello. Gerado automaticamente ao clicar em "Autorizar no Trello" em `/setup`. |
| `TRELLO_BOARD_ID` | ID do quadro a operar. Escolhido na lista em `/setup`, carregada da sua conta. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

Sem a chave, o token e o quadro do Trello (os três juntos), o app usa o quadro de exemplo em memória.

## Estrutura
```
app/page.tsx                          tela única: chat à esquerda, quadro Kanban à direita
app/setup/page.tsx                    tela de configuração inicial (IA e Trello)
app/setup/trello/page.tsx             volta da autorização do Trello (lê o token do fragmento da URL)
app/api/quadro/route.ts               GET do quadro atual
app/api/agente/route.ts               POST do comando em linguagem natural
app/api/status/route.ts               informa ao frontend se a IA e o Trello estão conectados
app/api/health/route.ts               health check
app/api/setup/route.ts                GET status da configuração, PUT para salvar/apagar chaves
app/api/setup/testar/route.ts         testa a conexão de uma integração
app/api/setup/oauth/openrouter/*      início e volta da autorização em um clique do OpenRouter
app/api/setup/oauth/trello/route.ts   início da autorização em um clique do Trello
components/ui.tsx                     componentes visuais compartilhados pela suíte
components/setup.tsx                  tela genérica de configuração, gerada a partir de lib/integracoes.ts
components/Chat.tsx                   painel de conversa com o agente
components/Quadro.tsx                 colunas e cartões do quadro Kanban
lib/ai.ts                             cliente OpenRouter (askText, askJSON, askWithTools)
lib/agente.ts                         agente (tool calling com IA, ou interpretador por palavras-chave sem ela)
lib/quadro.ts                         tipos do domínio e interface ProvedorQuadro
lib/trello.ts                         integração real com a API REST do Trello
lib/quadro-demo.ts                    quadro de exemplo em memória (fallback sem Trello)
lib/integracoes.ts                    integrações deste app (OpenRouter e Trello) para o /setup
lib/setup-comum.ts                    tipos e utilitários do setup inicial (compartilhado pela suíte)
lib/store.ts                          configuração em SQLite (getConfig/setConfig), alternativa às variáveis de ambiente
Dockerfile                            build multi-stage com saída standalone
docker-compose.yml                    sobe este app isolado (porta 3002) com volume para o SQLite
render.yaml                           blueprint do Render (runtime image)
```
