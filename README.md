# IA para Executivos

Vinte apps independentes, cada um resolvendo um problema específico do dia a dia de uma empresa com IA em alguma etapa. Feitos para executivos: crie sua conta em 30 segundos, teste com dados de exemplo sem nenhuma chave e publique com um clique, na sua própria conta no Render, a partir de uma imagem Docker pública via Blueprint. Catálogo com botão de um clique: https://startse.github.io/ai-action-app-deploy/

## Mapa de ideias

| # | App | Área | Problema que resolve | IA faz o quê | Integrações externas (opcionais) |
|---|---|---|---|---|---|
| 1 | [PDI do Time](pdi-time/) | RH | Líder chega à conversa de feedback sem plano | Cruza entregas com objetivos da empresa e gera PDI de 90 dias | só OpenRouter |
| 2 | [Agente de Kanban](agente-kanban/) | Gestão e RH | Operar o quadro toma tempo do gestor | Agente com ferramentas cria, move e comenta cartões por linguagem natural | Trello API (chave + token). Adaptável a Jira, Notion, monday ou MCP |
| 3 | [Entrevistadora IA](entrevista-ia/) | RH | Triagem inicial de candidatos consome horas | Conduz a entrevista por voz e texto e entrega scorecard | ElevenLabs (voz e ligação via agente conversacional + Twilio) |
| 4 | [Posts em Minutos](posts-sociais/) | Marketing | Há o que dizer, não há tempo de escrever para cada rede | Escreve posts por rede e gera a imagem | OpenAI Images (trocável por Higgsfield ou outro) |
| 5 | [Prospecção com IA](prospeccao-ia/) | Vendas | Montar lista e escrever primeira abordagem é lento | Monta a lista pelo ICP e escreve e-mail, LinkedIn e WhatsApp por lead | Apollo (busca), Bright Data (enriquecimento). Adaptável a Clay |
| 6 | [Atendente no WhatsApp](whatsapp-atendente/) | Atendimento e Vendas | Perguntas repetidas fora do horário | Responde com base no conhecimento da empresa e transfere quando não sabe | WhatsApp Cloud API (Meta) via webhook |
| 7 | [Leitura de Contratos](contratos-ia/) | Jurídico | Decidir o que negociar antes de acionar o jurídico | Lê o PDF, pontua risco, lista cláusulas críticas, prazos e lacunas | OpenRouter (texto extraído do PDF) |
| 8 | [Ata Executiva](reunioes-ia/) | Gestão | Reunião acaba sem decisões e responsáveis registrados | Transcreve o áudio e gera ata com ações, prazos e e-mail de follow-up | ElevenLabs Scribe ou OpenAI Whisper (transcrição) |
| 9 | [Analista Financeiro](financas-ia/) | Financeiro | Planilha de despesas sem tempo de destrinchar | Lê o CSV, mostra os números que importam e responde perguntas | OpenRouter (dados ficam no navegador; só agregados vão para a IA) |
| 10 | [Voz do Cliente](voz-do-cliente/) | CX e Marketing | Centenas de comentários que ninguém lê | Agrupa por tema, mede sentimento e NPS, prioriza ações | só OpenRouter |
| 11 | [Radar de Sinais](radar-sinais/) | Estratégia e Inovação | Movimentos do mercado chegam tarde e dispersos | Busca o que saiu no período em Hacker News, Reddit, GitHub e na web, agrupa em sinais com fontes verificadas e mostra as conexões em grafo | Hacker News, Reddit e GitHub sem chave; Exa (opcional) para a web em geral |
| 12 | [Bússola de IA v0.3.0](bussola-ia/) | Estratégia e Gestão | O gestor precisa acompanhar assessments de empresas, áreas e times | Cria questionários, acompanha participação e prazos, analisa respostas em seis dimensões e propõe ações | ChatGPT por assinatura ou OpenRouter; [Render com volume (pago)](https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-bussola-ia-persistente) |
| 13 | [Simulador de Vendas](simulador-vendas/) | Vendas | O gestor só vê o resultado da venda, não como a conversa foi conduzida | Avalia conversas contra 7 critérios de venda consultiva, treina por texto e voz e resume a equipe por semana | ElevenLabs (sala de treino por voz, com aviso de pós-conversa assinado) |
| 14 | [Custos de IA](custos-ia/) | Financeiro e TI | O CFO não sabe quanto gasta com ferramentas de IA nem se está no orçamento | Lê notas em PDF, texto ou direto do e-mail, compara com o orçamento e alerta o que estourou | Gmail (OAuth em um clique); câmbio manual |
| 15 | [Clone de Site](clone-site/) | Marketing e Produto | Montar uma página nova leva semanas entre briefing e agência | Lê a captura de uma página de referência e escreve a sua versão em HTML, editável por instrução e publicável em um link | OpenRouter com modelo de visão |
| 16 | [Prospecção no LinkedIn](prospeccao-linkedin/) | Vendas | Prospectar no LinkedIn consome horas entre buscar perfis e escrever mensagens | Monta a lista de leads pelo cliente ideal, escreve a sequência de mensagens e envia as aprovadas | Prospect Halo (servidor MCP com OAuth) |
| 17 | [Vídeos de Campanha](videos-campanha/) | Marketing | Produzir um vídeo curto por campanha leva semanas e gastar créditos às cegas custa caro | Propõe três conceitos com roteiro por cena e gera o vídeo a partir da imagem do produto, mostrando o custo antes | Higgsfield (servidor MCP com OAuth) |
| 18 | [AutoML](automl-pocket/) | Dados, Financeiro e Vendas | Prever churn, fraude ou vendas a partir de planilhas depende de um cientista de dados que não existe | Treina sozinho modelos de classificação, regressão e previsão de séries e explica o resultado em português | nenhuma: aprendizado de máquina local (scikit-learn, XGBoost). **Exceção ao padrão: web + worker Python + Redis numa imagem única, plano pago no Render** |
| 19 | [Build Agentflows v0.7.0](build-agentflows/) | Gestão | Orquestrar tarefas de IA entre agentes e sistemas | Editor visual com agentes, condições, ferramentas, aprovação humana e versões publicadas | OpenRouter, ferramentas MCP e HTTP; execução por MCP e HTTP autenticado. Disco persistente no Render |
| 20 | [Daily Second Brain v1.0.1](daily-second-brain/) | Gestão | Memórias e decisões dispersas | Wiki Markdown conectada, grafo, chat, voz e artefatos com fontes | ChatGPT, OpenRouter, Zapier MCP e ElevenLabs. Disco persistente no Render |

Ideias mapeadas e deixadas para uma segunda rodada: copiloto de OKRs com check-in semanal, análise de concorrentes a partir de sites e redes, triagem de currículos contra a descrição da vaga, gerador de propostas comerciais a partir do CRM, resumo diário de e-mails e Slack para a diretoria.

## Como cada app é construído

Todos seguem o mesmo padrão (detalhes em [PADRAO.md](PADRAO.md)):

- Next.js 16 (App Router, TypeScript) + Tailwind CSS 4. Componentes visuais compartilhados em `components/ui.tsx`.
- IA via **OpenRouter**, com o modelo gratuito `nvidia/nemotron-3-super-120b-a12b:free` como padrão e modelos de reserva gratuitos. Qualquer modelo pago pode ser escolhido no setup.
- **Configuração sem variáveis de ambiente.** Cada app tem uma tela `/setup` onde a pessoa conecta a IA em um clique (OAuth do OpenRouter) ou colando uma chave, conecta as integrações do app (com links diretos para obter cada chave, listas carregadas da própria integração e botão "Testar conexão") e tudo fica salvo em SQLite dentro do app. Variáveis de ambiente continuam funcionando como alternativa e têm prioridade.
- Até conectar, o app roda em modo demonstração com respostas de exemplo. Sem chave de integração externa, usa um fallback local. Nada quebra ao abrir.
- Rotas fixas: `GET /api/health` para o Render e `GET /api/status` para o frontend saber o que está conectado.
- Mesma linguagem visual (fonte Manrope, painel de entrada à esquerda, resultado à direita) com uma cor de acento por app.
- Uma conta de administrador por instância: a primeira pessoa a abrir o app cria a conta (nome, e-mail e senha) em `/conta`; as visitas seguintes entram em `/entrar`. Histórico, chaves e configurações ficam salvos em SQLite dentro do app, atrás dessa conta.

## Rodar a suíte inteira com Docker Compose

```bash
docker compose up --build     # constrói e sobe os 20 apps; depois abra http://localhost:3001/setup (e assim por diante)
```

Cada app guarda sua configuração em um volume Docker próprio, então as chaves sobrevivem a reinícios.

| Porta | App | | Porta | App |
|---|---|---|---|---|
| 3001 | pdi-time | | 3006 | whatsapp-atendente |
| 3002 | agente-kanban | | 3007 | contratos-ia |
| 3003 | entrevista-ia | | 3008 | reunioes-ia |
| 3004 | posts-sociais | | 3009 | financas-ia |
| 3005 | prospeccao-ia | | 3010 | voz-do-cliente |
| 3011 | radar-sinais | | 3012 | bussola-ia |
| 3013 | simulador-vendas | | 3014 | custos-ia |
| 3015 | clone-site | | 3016 | prospeccao-linkedin |
| 3017 | videos-campanha | | 3018 | automl-pocket |
| 3019 | build-agentflows | | | |
| 3020 | daily-second-brain | | | |

Um app só: `docker compose up --build pdi-time`, ou dentro da pasta do app `docker compose up --build`.

Construir as dezoito imagens em paralelo consome vários gigabytes de cache. Em máquinas com pouco espaço, construa uma por vez:

```bash
COMPOSE_PARALLEL_LIMIT=1 docker compose build
docker builder prune -f        # libera o cache intermediário depois do build
```

## Rodar um app localmente sem Docker

```bash
cd pdi-time            # ou qualquer outro app
npm install
npm run dev            # http://localhost:3000 e http://localhost:3000/setup para conectar a IA
```

Dica para demonstrações: abra `http://localhost:3000/?exemplo=1` e o app preenche e executa um exemplo sozinho.

## Publicação: imagens, Blueprints e catálogo

Tudo parte de um push na `main` deste repositório (privado, `StartSe/ai-action-demo`). O workflow `.github/workflows/publicar.yml`:

1. Descobre quais pastas de app mudaram e constrói só essas imagens (rodar à mão com "Reconstruir todas" refaz as dezoito).
2. Publica cada imagem em `ghcr.io/startse/<app>:latest` (e na tag do commit) usando o token do próprio Actions, sem segredo extra.
3. Regenera o repositório **público** `StartSe/ai-action-app-deploy` a partir de `catalogo.json`: o branch `main` recebe a página do catálogo (GitHub Pages) e o Blueprint da suíte; cada app ganha um branch `deploy-<app>` com o seu Blueprint. Ninguém edita esse repositório à mão.
4. Confere se as dezoito imagens estão públicas e avisa no resumo do job quando alguma ainda está privada.

Catálogo público: https://startse.github.io/ai-action-app-deploy/ (filtro por área, botão "Publicar no Render" por app, comando `docker run` copiável).

`catalogo.json` é a fonte única: nome, áreas, textos, cor de acento, porta e URL de demonstração de cada app. Depois de alterar, rode `node scripts/gerar-deploy.mjs` para atualizar os `render.yaml` versionados aqui (o workflow faz o mesmo antes de publicar).

Campos opcionais para um app que não cabe no plano gratuito: `plano` (`free`, `0.5c-512mb` ou os legados `starter`, `standard`, `pro`; ausente = `free`), `discoGB` (disco persistente em `/app/data`, só com plano pago), `variaveisGeradas` (segredos que o Render gera no deploy, com `generateValue`), `aposPublicar` (texto que substitui "abra /setup e conecte a IA") e `padrao: "proprio"` (o app não segue o padrão de `pdi-time` e sai de `verificar-padrao.sh`, `verificar-jargao.mjs` e `verificar-paleta.mjs`). Um app pago entra no Blueprint da suíte com o seu plano e ganha aviso de plano pago na página e nos READMEs.

Para oferecer persistência como **opção**, use `persistencia: { "plano": "0.5c-512mb", "discoGB": 1, "discoGuarda": "os dados do app" }`. O gerador cria `<app>/render-persistente.yaml` e o branch público `deploy-<app>-persistente`; o índice oferece uma escolha de volume antes de abrir o Render. A opção não muda o plano padrão do app nem o da suíte. `versao` exibe a versão no catálogo. Valide o gerador com `node --test scripts/gerar-deploy.test.mjs`.

### Uma vez, depois do primeiro build

Pacotes criados a partir de repositório privado nascem privados, e o botão do Render só puxa imagem pública. Em https://github.com/orgs/StartSe/packages abra cada um dos dezoito pacotes, Package settings, Change visibility, Public. O resumo do job "Atualizar repositório público" lista os que ainda faltam.

### Segredos e variáveis do repositório

| Nome | Tipo | Para quê |
|---|---|---|
| `CHAVE_DEPLOY_PUBLICO` | secret | Chave SSH privada do deploy key (com escrita) do repositório público. Já configurada. |
| `RENDER_DEPLOY_HOOKS` | secret, opcional | JSON `{ "pdi-time": "https://api.render.com/deploy/srv-...?key=..." }` com o deploy hook das suas instâncias de demonstração. |
| `RENDER_DEPLOY_HOOKS_ATIVO` | variable, opcional | `true` para o workflow chamar os hooks acima após cada build. |

### Fallback manual

```bash
docker login ghcr.io                   # token do GitHub com escopo write:packages
./build-and-push.sh                    # constrói e publica as dezoito imagens, uma por vez
```

## Deploy no Render

Botão por app e da suíte inteira no catálogo público, ou direto:

- Suíte (os 18; Atendente no WhatsApp, Vídeos de Campanha e AutoML são os pagos, com disco persistente): `https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy`
- Um app: `https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-<app>`
- Bússola de IA: [teste gratuito, sem volume](https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-bussola-ia) ou [com volume de 1 GB (pago)](https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-bussola-ia-persistente). O volume mantém contas, configurações, a sessão ChatGPT, assessments, respostas, diagnósticos e planos de ação. A suíte usa a opção gratuita, sem volume.

Depois do deploy, abra `https://<nome>.onrender.com/setup` e conecte a IA e as integrações. O plano `free` hiberna após inatividade. Sem volume persistente, contas, configurações e respostas podem se perder em reinícios e atualizações. Para a Bússola, a opção com volume já configura o disco; nos demais apps sem disco, ative o bloco `disk` e use um plano pago.

### AutoML: a exceção paga

O `automl-pocket/` é web (Next) + worker Python (pandas, scikit-learn, XGBoost) + Redis compartilhando `/app/data` (SQLite, planilhas, modelos). No Render um disco pertence a um só serviço e worker não tem plano gratuito, então o `Dockerfile` da raiz da pasta empacota os três processos numa imagem única, orquestrada por `start.sh` (Redis, `migrate.mjs`, `server.js` e `main.py`; se um processo morrer, o contêiner reinicia). O Blueprint dele usa `plan: standard` (2 GB de memória; o treino com scikit-learn e XGBoost não cabe nos 512 MB do `starter`), disco de 1 GB e `AUTH_SECRET` gerado pelo Render. Sem a variável, `start.sh` cria um segredo e o guarda em `/app/data/auth-secret`, então `docker run` sem `-e` também funciona. Desenvolvimento com os serviços separados: `automl-pocket/docker-compose.yml` e o README de lá.

## Onde obter as chaves

Os links abaixo aparecem também dentro de cada tela `/setup`, ao lado do campo correspondente.

| Chave | Onde obter |
|---|---|
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys (modelos gratuitos disponíveis) |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io/app/settings/api-keys |
| `TRELLO_API_KEY`, `TRELLO_API_TOKEN` | https://trello.com/power-ups/admin |
| `APOLLO_API_KEY` | https://app.apollo.io/#/settings/integrations/api |
| `BRIGHTDATA_API_KEY`, `BRIGHTDATA_ZONE` | https://brightdata.com/cp/zones |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | https://developers.facebook.com/apps (produto WhatsApp) |
| `EXA_API_KEY` | https://dashboard.exa.ai/api-keys |
| `ELEVENLABS_AGENT_ID`, `ELEVENLABS_WEBHOOK_SECRET` | https://elevenlabs.io/app/conversational-ai (agente e webhook de pós-conversa) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | https://console.cloud.google.com/apis/credentials (cliente OAuth para o botão "Conectar o Gmail") |
| `PROSPECTHALO_URL`, `PROSPECTHALO_CODIGO` | servidor MCP do Prospect Halo; o botão "Autorizar" em `/setup` dispensa o código manual |
| `HIGGSFIELD_URL`, `HIGGSFIELD_CODIGO` | servidor MCP do Higgsfield; o botão "Autorizar" em `/setup` dispensa o código manual |

## Estrutura

```
README.md              este arquivo
PADRAO.md              padrão técnico e visual seguido por 17 dos 20 apps (automl-pocket e daily-second-brain têm estrutura própria)
catalogo.json          fonte única: apps, áreas, textos, cor, porta (alimenta render.yaml, página e branches de deploy)
render.yaml            blueprint da suíte completa (gerado)
docker-compose.yml     sobe os 20 apps localmente (portas 3001 a 3020); com `docker compose pull` usa as imagens do GHCR
site/index.html        página do catálogo publicada no GitHub Pages do repositório público
scripts/               gerar-deploy.mjs (gera render.yaml e a pasta publico/), publicar-publico.sh (envia ao repo público), verificar-padrao.sh (compara os apps com pdi-time; exceções em padrao-excecoes.json) e verificar-jargao.mjs (jargão técnico na tela; exceções em jargao-excecoes.json)
.github/workflows/     publicar.yml: constrói as imagens alteradas e atualiza o repositório público
.env.example           variáveis opcionais (o setup em /setup substitui todas)
build-and-push.sh      fallback manual para construir e publicar as 18 imagens
<app>/                 um projeto Next.js completo por pasta (código, Dockerfile, docker-compose.yml, render.yaml, README)
automl-pocket/         AutoML: apps/web (Next) + apps/worker (Python) + Dockerfile único e start.sh na raiz
```
