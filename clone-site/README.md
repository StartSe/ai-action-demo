# Site Cowork

Seu colaborador para criação, hospedagem e estratégia do site.

Os identificadores técnicos `clone-site` (pasta, imagem e serviço) continuam iguais para preservar as instalações e os volumes existentes.

O site da sua empresa, no ar hoje — e um agente que cuida dele depois. Área: Marketing e Produto.

## O que resolve
Montar e manter um site leva semanas entre briefing, agência e ajustes; depois de publicado, ninguém sabe se alguém abriu. Este app cria o site a partir de UMA entrada (a captura de uma página de referência, o endereço de um site, que ele lê sozinho, ou uma frase sobre a empresa), **constrói a página seção a seção mostrando o progresso**, e publica um link único. A partir daí, um **agente** conversa em português com quem cuida do negócio e edita **ao vivo na prévia**: troca textos, coloca o logo e as fotos, aplica a marca, publica quando a pessoa pede e lê as métricas de visitas. Cada site é um projeto com estado, versões (rascunho × publicado), imagens, métricas, sugestões do agente, domínio próprio e, opcionalmente, um endereço próprio na Netlify. Sem chave de IA, tudo funciona em modo demonstração (páginas e mudanças ilustrativas, métricas reais do próprio link).

Aviso mostrado abaixo de toda prévia: use a referência pela estrutura. Textos, marcas e imagens de terceiros são protegidos; troque pelo conteúdo da sua empresa.

## A jornada
1. **Criar um projeto**: nome, descrição do negócio e materiais da empresa (product book, apresentação ou briefing em TXT, Markdown, DOCX ou PDF). Referência por URL ou captura, logo e cor principal são opcionais. O texto extraído pode ser conferido antes de criar. Limites: 5 documentos, 8 MB por arquivo, 100 mil caracteres no conjunto; PDF com texto selecionável, até 150 páginas. O original é processado em memória; o texto extraído fica no banco do projeto.
2. **Acompanhar a criação**: planejamento e construção por seção, com prévia parcial. Os documentos orientam o conteúdo; a referência orienta a composição visual. O logo enviado já participa da primeira geração.
3. **Revisar e editar**: o site pronto ainda é um rascunho. A bolha do assistente está disponível na prévia e no editor em tela cheia. O editor permite clicar em textos, navegar e editar HTML com CodeMirror (sintaxe, busca, desfazer). Salvar cria uma versão sem alterar o que está publicado. Edições concorrentes são detectadas e preservam o conteúdo local do editor.
4. **Publicar e restaurar**: publique a versão escolhida no link desta instância, na Netlify ou em um serviço independente no Render. A aba Publicação mostra o histórico por destino e permite **Restaurar publicação**. A restauração muda a versão que está no ar e preserva todas as versões e os rascunhos posteriores. Imagens de versões antigas são mantidas para viabilizar o rollback.
5. **Manter o site**: a aba Materiais permite atualizar o contexto e pedir uma revisão ao agente. Versões, Imagens, Marca, Métricas e Publicação permanecem disponíveis no workspace.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript, SQLite nativo do Node (`node:sqlite`), sem biblioteca de UI. IA por **OpenRouter** (chave; também é quem lê a captura, `askVision`) ou **ChatGPT** (assinatura, pelo Codex App Server oficial, `@openai/codex` fixado em `0.155.1`, como no Build Agentflows). Os prompts de edição foram portados e traduzidos do projeto aberto screenshot-to-code, assim como a ideia do agente que edita por trecho (`edit_file`) em vez de reescrever o arquivo; a construção por seções (`lib/construtor.ts`) é própria deste app.

## Configurações (sem variáveis de ambiente)
Abra `/setup` (`components/Configuracoes.tsx`, tela própria deste app, no desenho do Build Agentflows). Três seções:
- **Inteligência artificial**: os cartões **ChatGPT** (assinatura, login por código de dispositivo) e **OpenRouter** (conectar em um clique ou colar a chave; modelo para textos; **modelo que lê a captura**, com "Testar leitura de imagem"). Um dos dois leva o selo **Principal** ("Usar como principal" no outro).
- **Hospedagem e publicação**: **Publicar na Netlify** (opcional: cada site ganha um endereço próprio lá) e **Publicar no Render** (opcional: cria um Static Site independente para cada projeto, com domínio próprio e rollback).
- **Assistente de IA**: **Usar dentro do seu assistente** (código de acesso MCP).

Tudo fica em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), cifrado em repouso. Não há mais cartões de notificações nem de rotinas, e a leitura de um site pelo endereço não depende de nenhum serviço de captura.

## ChatGPT ou OpenRouter
O **ChatGPT é recomendado** e é o padrão de instalações novas sem chave OpenRouter. A preferência explícita e instalações já configuradas com OpenRouter são preservadas.

- **ChatGPT (assinatura)**: conexão por código de dispositivo, usando o Codex App Server oficial (`@openai/codex` 0.155.1). Texto, imagens de referência e ferramentas passam pela conta conectada. As sessões ficam em `DATA_DIR/chatgpt`, isoladas das credenciais da máquina, sem ferramentas de terminal, navegador ou arquivos.
- **OpenRouter**: conexão por OAuth/PKCE ou chave de API, com escolha de modelo de texto e visão. O botão de teste de leitura no cartão testa especificamente o modelo OpenRouter.

`lib/motor.ts` decide o provedor. Sem a conta correspondente conectada, a geração usa um exemplo claramente identificado. Referência do protocolo: [Codex App Server — autenticação e entradas de imagem](https://learn.chatgpt.com/docs/app-server).

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir `NOVA_SENHA_ADMIN` e reiniciar o app uma vez.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
`/?exemplo=1` cria um site de exemplo (captura `public/exemplo-referencia.png`, marca Nimbus Finanças) e abre o acompanhamento; "Preencher com um exemplo" só preenche a caixa. Em `/sites/<id>`, `?agente=1` abre o agente e `?aba=publicacao` (ou `versoes`, `imagens`, `marca`, `metricas`) abre numa aba.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3015
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/clone-site:latest`.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-clone-site (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar sem construir: `docker run --rm -p 3015:10000 -v clone-site-dados:/app/data ghcr.io/startse/clone-site:latest` e abra http://localhost:3015.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- Health check em `/api/health`. O Blueprint individual e o da suíte usam o plano pago `0.5c-512mb`, com disco de 1 GB em `/app/data` para manter conta, configurações, sessão ChatGPT, sites, versões e imagens entre reinícios e deploys. No Docker Compose, esse diretório também tem volume persistente.

## Sites: projetos com estado, geração em segundo plano e link por slug
Toda página nasce como um **site** (`lib/projetos.ts`, tabela `projetos`): nome, marca, origem (`referencia`, `endereco` ou `briefing`), estado (`rascunho` → `gerando` → `pronto` | `falhou`; `falhou` → `gerando` em "Tentar de novo") e um `slug` legível, único na instância, derivado do nome. A página com as versões continua no histórico (`resultados`, tipo `pagina`); o site guarda `paginaId` e `versaoPublicada`.

- A geração corre **em segundo plano**: `POST /api/sites/<id>/gerar` responde `202` na hora e a tela consulta `GET /api/sites/<id>` a cada 2,5 s. A resposta traz `projeto.progresso` (as etapas) e, enquanto gera, `htmlParcial` (a página com as seções prontas e marcadores nas demais).
- A captura fica guardada só até `pronto` (para gerar sem a aba aberta e para "Tentar de novo") e é apagada em seguida. Em `falhou` ela permanece, com o motivo em português (`erro.mensagem`, `erro.codigo`, `erro.acao`) e as etapas até a falha. Na origem `endereco`, fica só o endereço: o site de referência é lido de novo a cada geração.
- Na subida do servidor, todo site em `gerando` vira `falhou` ("O servidor reiniciou durante a geração"); a cada 60 s, quem está há mais de 15 minutos sem concluir nenhuma etapa também.
- `/s/<slug>` (ou `/s/<id>`) serve a **versão publicada**. Edições criam versões novas sem mexer no que está no ar até a próxima publicação. Um id de página antigo, sem site, continua servindo a última versão.
- `POST /api/pagina` e a ferramenta MCP `gerar_pagina` continuam existindo: criam o site, geram e esperam o fim, devolvendo também `projetoId` e `slug`.

Rotas: `POST /api/sites` (cria; `gerar: true` já dispara), `GET /api/sites?estado=`, `GET|PATCH|DELETE /api/sites/<id>` (`PATCH`: `nome`, `slug`, `marca` a qualquer momento; `instrucoes`/`briefing`/`url`/`stack` só em `rascunho`/`falhou`), `POST /api/sites/<id>/gerar`, `POST /api/sites/<id>/publicar` (`{ n }`), `POST /api/sites/<id>/visto`, `GET /api/sites/avisos` (sino).

Teste rápido, com o app rodando e a sessão em um cookie (`-b cookies.txt`):
```bash
IMG="data:image/png;base64,$(base64 -i public/exemplo-referencia.png | tr -d '\n')"
jq -n --arg img "$IMG" '{nome:"Loja Aurora",origem:"referencia",imagem:$img,marca:{nome:"Loja Aurora",corPrimaria:"#0f766e"},gerar:true}' \
  | curl -s -b cookies.txt -H "Content-Type: application/json" -d @- http://localhost:3000/api/sites      # 201, estado "gerando" em < 1 s
curl -s -b cookies.txt http://localhost:3000/api/sites/<id>                                                 # repita até estado "pronto"
sqlite3 data/app.sqlite "select estado, versaoPublicada, imagem is null from projetos where id='<id>'"       # pronto|1|1
curl -s http://localhost:3000/s/<slug> | head -3                                                            # a versão publicada, sem sessão
```

## Construção por etapas (`lib/construtor.ts`)
Uma página inteira numa resposta só estourava a janela do modelo ("a página veio pela metade"). Agora a construção tem três fases, cada uma cabendo folgada:
1. **Plano**: a IA lê a referência (captura pelo modelo de visão; endereço pelo HTML simplificado de `lib/captura.ts:lerReferencia`, sem serviço externo; briefing pelo texto) e devolve JSON com título, paleta, fontes e a lista de 3 a 10 seções, cada uma com o que contém (textos, quantidade de itens, imagens).
2. **Uma seção por vez**: um elemento raiz (`<header>`, `<section>`, `<footer>`, `id="secao-<id>"`) com Tailwind (ou CSS prefixado pelo id, no formato CSS), usando as variáveis da paleta definidas no documento (`--primaria`, `--secundaria`, `--fundo`, `--texto`, fontes). O prompt leva o plano, a seção pedida, o final da anterior (continuidade) e a referência.
3. **Montagem**: cabeça do documento (Tailwind, Google Fonts, variáveis, CSS das seções) + seções na ordem, sanitizado.

Depois de cada passo o andamento é gravado no projeto (`progresso.etapas`, `htmlParcial`); a tela mostra a lista e a prévia parcial. Em demonstração, a landing fixa de `lib/demo.ts` é fatiada e "construída" com pausas, pelo mesmo caminho. Uma seção que vem sem código tem uma segunda tentativa; se repetir, a geração falha apontando a seção e o botão "Escolher o modelo".

## Logo e imagens do cliente
Cada site aceita um logo e até 12 imagens (PNG, JPG, WEBP ou SVG sem script; até 2 MB cada), enviados na aba "Imagens" do site (`lib/assets.ts`, `GET|POST /api/sites/<id>/imagens`, `DELETE /api/sites/<id>/imagens/<assetId>`). Os arquivos são servidos em `/s/<idDoProjeto>/a/<assetId>` (público como o site, cache de 1 h, `nosniff`; SVG com CSP que não executa nada). O gerador e o agente recebem o bloco "Imagens da empresa" e usam `<img>` com esses endereços: o logo no cabeçalho e no rodapé, as fotos onde a referência tinha imagens; onde faltar imagem, continua o bloco na cor da marca.

Importante: a lista de origens da CSP de `/s/` (`lib/publicacao.ts`, `img-src 'self' data: https:`) e o que `sanitizarHtml` deixa passar andam juntas — ao liberar qualquer origem nova no sanitizador, atualize a CSP.

## O agente do site
`POST /api/sites/<id>/agente` com `{ texto }` (`lib/agente.ts`). O agente conhece a marca, as imagens (com endereços), a versão atual e a publicada, o código da página e as métricas dos últimos 7 dias, e só muda a página por ferramentas:
- `editar_trecho` — substituições exatas (`antigo` → `novo`), a ferramenta principal: barata e não corrompe o resto;
- `reescrever_pagina` — o arquivo inteiro, só para mudanças estruturais;
- `trocar_imagem` — coloca uma imagem da empresa no cabeçalho, no herói, no rodapé ou junto a um texto;
- `listar_imagens`, `ver_pagina`, `ver_metricas`;
- `publicar` — só quando a pessoa pede.

Tudo o que muda num pedido vira **uma** versão nova, em rascunho. A conversa fica guardada por site (`GET` lista, `DELETE` limpa). Em demonstração, cada pedido aplica uma mudança ilustrativa (e publica se o pedido falar em publicar). Roda no motor escolhido (OpenRouter com `tools` ou ChatGPT com `dynamicTools`).

**Ao vivo**: com `Accept: application/x-ndjson`, o `POST` responde uma linha JSON por evento — `{ tipo: "passo", nome }` a cada ferramenta, `{ tipo: "previa", html }` a cada mudança no rascunho (a prévia da tela troca na hora, antes de a versão ser gravada), `{ tipo: "ping" }` a cada 10 s e `{ tipo: "fim", ...resposta }` ou `{ tipo: "erro" }`. A bolha do agente (`components/ChatAgente.tsx`) usa esse fluxo; o JSON único continua para quem não manda o cabeçalho (MCP, scripts).

## Publicar × rascunho
A primeira versão fica em rascunho e só é publicada quando a pessoa pede. Depois, cada edição (agente, "voltar para esta") cria uma versão nova que **não** vai ao ar até "Publicar esta" (painel Versões), "Publicar a versão N" (faixa acima da prévia), o pedido ao agente ou a ferramenta MCP `publicar_site`. O link `/s/<slug>` sempre mostra a publicada.

## Métricas e sugestões
Cada abertura do link público conta uma visita (`lib/metricas.ts`, tabela `visitas`: dia, hora, origem pelo `Referer`, celular × computador pelo `User-Agent`; robôs e `?previa=1` não contam). O painel "Métricas" mostra 7 ou 30 dias (visitas, % no celular, variação contra o período anterior, barras por dia, de onde vieram); `GET /api/sites/<id>/metricas?dias=`. "O que o agente sugere" (`lib/sugestoes.ts`, `GET /api/sites/<id>/sugestoes`) traz três melhorias para a versão atual, cada uma com "Aplicar" (manda a instrução ao agente); cache de 24 h por versão.

## Publicar na Netlify
A conta é conectada em Configurações por chave de acesso ou OAuth quando `NETLIFY_CLIENT_ID_APP` está configurado. `POST /api/sites/<id>/netlify` publica a versão que está no ar no link principal, ou `{ n }` para selecionar uma versão. `{ n, rollback: true }` restaura uma versão já publicada nesse destino.

A publicação envia `index.html` e todas as imagens locais usadas pela versão por digest SHA-1. O endereço da Netlify não depende dos arquivos do app. O vínculo do site e o deploy em andamento são persistidos antes de aguardar o provedor. Uma publicação só entra no histórico como concluída quando a Netlify confirma `ready`; o painel consulta o estado enquanto estiver processando, inclusive após reabrir a página. Falhas preservam a versão anteriormente registrada. A retirada do site é uma ação separada.

O histórico (`publicacoes`) registra destino, versão, versão anterior, operação, horário e deploy. A troca da versão e o registro de publicação no banco usam uma transação. Instalações antigas importam somente a publicação atual conhecida; publicações anteriores à atualização não são inventadas.

Referência: [API oficial da Netlify](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/).

## Publicar no Render
Cada projeto usa **um serviço Static Site independente** no workspace conectado. Atualizações e rollback reutilizam esse mesmo serviço; o app principal não recebe o tráfego desses sites.

Conecte `RENDER_API_KEY` e `RENDER_OWNER_ID` em `/setup#render` e configure o endereço público HTTPS do app (`APP_URL`). Na aba Publicação, **Publicar versão N no Render** envia a versão indicada. `POST /api/sites/<id>/render` aceita `{ n }` ou `{ n, rollback: true }`; rollback exige uma versão já publicada nesse destino. `GET` acompanha o deploy e só registra a nova versão quando o Render confirma `live`. Falhas de build mantêm a publicação anterior. Acompanhar novamente funciona depois de fechar a aba ou reiniciar o app.

O pacote imutável de cada versão (HTML e imagens, inclusive imagens arquivadas) fica no SQLite do volume, comprimido e identificado por SHA-256. Durante o build, o Render baixa esse pacote por uma URL aleatória de leitura restrita, confere o hash e grava os arquivos em seu próprio armazenamento. O site publicado funciona mesmo com o app principal desligado. Novas publicações e restaurações feitas pelo app precisam dele disponível para o build.

O serviço usa o repositório público `StartSe/ai-action-app-deploy`, branch `deploy-clone-site`, diretório `site-build`, comando `node build.mjs`, saída `public`, sem auto-deploy por alterações no Git. O workflow da suíte publica somente o script de build junto ao Blueprint; os sites não precisam de acesso ao código privado do app. **A publicação do catálogo precisa concluir antes do primeiro deploy de site.** Forks podem configurar `RENDER_SITE_REPO`, `RENDER_SITE_BRANCH` e `RENDER_SITE_ROOT` no app principal. Os limites de banda, builds e domínios são os da conta conectada.

Referências: [Static Sites](https://render.com/docs/static-sites), [criação de serviços](https://api-docs.render.com/reference/create-service) e [deploy pela API](https://api-docs.render.com/reference/create-deploy).

## Domínio personalizado
Depois de publicar no Render, o painel **Domínio próprio** cadastra o domínio no serviço daquele projeto e informa o CNAME correto. O DNS é configurado no provedor do domínio; certificado e verificação são gerenciados pelo Render. Na Netlify, configure o domínio no painel do site criado lá.

Links locais `/s/<slug>` continuam disponíveis para publicações locais. Instalações antigas podem manter `RENDER_SERVICE_ID` como alternativa de domínio no serviço principal; serviços independentes têm prioridade quando existem. Excluir um projeto remove seus dados locais e histórico, mas não exclui automaticamente os serviços externos.

## Usar dentro de um assistente de IA (MCP)
`POST /mcp` (JSON-RPC 2.0, `Authorization: Bearer <código>` gerado em `/setup`, 60 chamadas por minuto). Ferramentas (`lib/ferramentas.ts`): `criar_site(nome, briefing, marca?, formato?)`, `gerar_pagina(imagem_url, instrucoes?, marca?, formato?)` (endereço de uma captura PNG/JPG ou do próprio site de referência), `editar_pagina(id|slug, instrucao)` (pelo agente; versão em rascunho), `publicar_site(id|slug, n?)`, `metricas_site(id|slug, dias?)`, `listar_sites(estado?)`. Protocolo implementado à mão em `lib/mcp.ts` (decisão herdada de `pdi-time`). Teste com `npx @modelcontextprotocol/inspector` (Streamable HTTP, `http://localhost:3000/mcp`, cabeçalho `Authorization`).

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite, da chave mestra e da sessão ChatGPT. Padrão `./data` (Docker: `/app/data`). |
| `APP_URL` | Endereço público do app (links absolutos em e-mails, Slack e no alvo do CNAME). Também gravado por `/setup`. |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida (equipe técnica). |
| `IA_PROVEDOR` | `chatgpt` (padrão novo) ou `openrouter`: qual conta é a principal. Alternativa ao selo "Principal" de Configurações. |
| `CHATGPT_MODEL` | Modelo da conta ChatGPT (vazio = automático). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Modelo de texto do OpenRouter (plano e seções pelo briefing/endereço, edições, agente). Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `OPENROUTER_MODEL_VISAO` | Modelo com visão que lê a captura (plano e seções pela captura); padrão `inclusionai/ling-3.0-flash-vl:free`. |
| `NETLIFY_ACCESS_TOKEN` | Chave de acesso pessoal da Netlify (https://app.netlify.com/user/applications#personal-access-tokens). Alternativa ao cartão. |
| `NETLIFY_CLIENT_ID_APP` | Credencial da suíte: id do aplicativo OAuth registrado na Netlify pela equipe técnica; liga o botão "Conectar com a Netlify" (redirect `https://<app>/setup/netlify`). Nunca aparece em `/setup`. |
| `RENDER_API_KEY`, `RENDER_OWNER_ID` | Chave da conta e workspace (`tea-...`) para criar um serviço independente por projeto. |
| `RENDER_SITE_REPO`, `RENDER_SITE_BRANCH`, `RENDER_SITE_ROOT` | Opcionais para forks; repositório, branch e pasta do script de publicação. |
| `RENDER_SERVICE_ID` | Compatibilidade com domínios locais de instalações antigas. |
| `CONTA_DESLIGADA` | `1` trata toda rota como pública (só para o contêiner efêmero de captura do catálogo). |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx                    tela inicial: caixa de criação (CriarSite.tsx) + grade "Meus sites"
app/sites/[id]/page.tsx         workspace: acompanhamento por etapas (gerando), abas Prévia/Versões/Imagens/Marca/Métricas/Publicação, bolha do agente
app/setup/page.tsx              Configurações (Configuracoes.tsx): ChatGPT × OpenRouter, Netlify, Render, MCP
app/setup/netlify/page.tsx      retorno do OAuth da Netlify (grava a chave do fragmento da URL)
app/api/sites/**                sites (criar, listar, gerar 202, publicar, visto, avisos, imagens, agente ao vivo, métricas, sugestões, domínio, netlify)
app/api/captura/route.ts        confere um endereço colado: captura (PNG/JPG) ou site (título, descrição, seções)
app/api/pagina/**               porta antiga (gera esperando; editar/voltar por versão)
app/s/[id]/route.ts             site publicado (versão publicada por slug ou id, público) + contagem de visita
app/s/[id]/a/[assetId]/route.ts logo e imagens do site (público, cache 1 h)
app/api/ia, app/api/chatgpt, app/api/visao   principal (OpenRouter × ChatGPT), conta ChatGPT, modelo que lê a captura
app/api/status/route.ts         status da suíte (divergência registrada: IA pelo motor)
app/mcp/route.ts, lib/mcp.ts    endpoint MCP
proxy.ts                        sessão + domínio personalizado (divergência registrada)
components/CriarSite.tsx        a caixa única de criação (endereço, captura, descrição) com "Mais opções" recolhido
components/MeusSites.tsx        grade de sites com miniatura, estado e etapa atual
components/ProgressoGeracao.tsx lista de etapas + prévia parcial
components/ChatAgente.tsx       bolha e painel do agente, resposta ao vivo (linhas JSON) → prévia
components/Workspace.tsx        nome editável, link público, faixa de publicação, painel de versões
components/PainelMarca.tsx      nome e cores; "Aplicar ao site com o agente"
components/PainelNetlify.tsx    publicar/atualizar/tirar o site da Netlify
components/PainelImagens.tsx, PainelMetricas.tsx, PainelDominio.tsx   imagens, métricas e sugestões, domínio próprio
components/Configuracoes.tsx    a tela de configuração (cartões de conexão); AcessoMCP.tsx o corpo do cartão MCP
components/Icones.tsx           ícones de traço do app
components/useAvisos.ts, TopbarSite.tsx   sino do cabeçalho
lib/construtor.ts               construção por etapas: plano → seções → montagem, com progresso
lib/captura.ts                  baixar captura por endereço; ler e simplificar o HTML do site de referência
lib/projetos.ts                 sites: estados, slug, geração em segundo plano com progresso, publicação, domínio, Netlify
lib/gerador.ts                  sanitização, título, validações, gravação no histórico, edição por instrução e versões
lib/agente.ts                   o agente: ferramentas, edição por trecho, conversa, eventos ao vivo
lib/motor.ts, lib/chatgpt.ts    escolha do provedor; ponte oficial com o ChatGPT (Codex App Server)
lib/netlify.ts                  publicação na Netlify (digest, criação do site, OAuth implícito)
lib/render.ts                   Serviços independentes, deploy e domínios no Render
lib/releases.ts                 Pacotes imutáveis de versões e imagens
deploy/render-site/build.mjs     Build dos Static Sites independentes
lib/assets.ts                   logo e imagens; bloco "Imagens da empresa"
lib/metricas.ts, lib/sugestoes.ts   visitas e sugestões
lib/publicacao.ts               CSP, 404 e resolução do que está no ar
lib/demo.ts                     landing fixa e mudanças de demonstração
lib/ferramentas.ts              ferramentas MCP
lib/config-tipos.ts, lib/acoes.ts   caminhos e tipos da configuração sem jargão nos componentes
```

## Persistência e rollback no Render
O Blueprint `render.yaml` e o catálogo da suíte já exigem um disco de **1 GB em `/app/data`**, no plano pago. O Docker define `DATA_DIR=/app/data` e o Compose monta um volume no mesmo caminho. SQLite, chave mestra, sessão ChatGPT, materiais extraídos, imagens, versões, conversas e publicações ficam nesse diretório e sobrevivem a reinícios e deploys.

Para um serviço criado manualmente, anexe o disco em `/app/data` antes de usar o app. As publicações no Render criam um serviço Static Site separado por projeto. Esses serviços guardam os arquivos publicados no Render e não precisam de disco próprio; o volume do app mantém os dados e pacotes usados para novas publicações e rollback. O rollback de conteúdo é feito dentro do app; é independente de um rollback da imagem Docker. Um disco anexado em produção deve ser conferido no painel do serviço; a configuração no repositório não comprova o estado de uma instalação já existente. [Documentação de discos do Render](https://render.com/docs/disks).

## Verificação
```bash
npm test                 # extração, contexto na geração, versões, rollback, persistência, Netlify, Render e ponte ChatGPT
npm run lint
npm run build
# Com uma instância descartável na porta 3118 e Playwright instalado:
PLAYWRIGHT_MODULE=/caminho/para/playwright/index.mjs npm run test:browser
```
Os testes de integração dos provedores usam respostas controladas e não consomem contas reais. O teste de navegador cria conta, projeto, materiais e publicações em uma instância de teste; não rode contra produção. O teste de persistência abre o mesmo banco em um segundo processo e verifica versões, materiais e histórico.
