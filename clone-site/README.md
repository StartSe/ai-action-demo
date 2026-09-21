# Clone de Site

O site da sua empresa, no ar hoje — e um agente que cuida dele depois. Área: Marketing e Produto.

## O que resolve
Montar e manter um site leva semanas entre briefing, agência e ajustes; depois de publicado, ninguém sabe se alguém abriu. Este app cria o site a partir de UMA entrada (a captura de uma página de referência, o endereço de um site, que ele lê sozinho, ou uma frase sobre a empresa), **constrói a página seção a seção mostrando o progresso**, e publica um link único. A partir daí, um **agente** conversa em português com quem cuida do negócio e edita **ao vivo na prévia**: troca textos, coloca o logo e as fotos, aplica a marca, publica quando a pessoa pede e lê as métricas de visitas. Cada site é um projeto com estado, versões (rascunho × publicado), imagens, métricas, sugestões do agente, domínio próprio e, opcionalmente, um endereço próprio na Netlify. Sem chave de IA, tudo funciona em modo demonstração (páginas e mudanças ilustrativas, métricas reais do próprio link).

Aviso mostrado abaixo de toda prévia: use a referência pela estrutura. Textos, marcas e imagens de terceiros são protegidos; troque pelo conteúdo da sua empresa.

## A jornada
1. **Criar um site** (tela inicial, `components/CriarSite.tsx`): uma única caixa. Cole o endereço de um site (o app confere que a página abre e mostra o título), solte ou cole a captura de uma página (PNG/JPG até 5 MB) ou descreva a empresa em uma frase (mínimo 20 caracteres). Nada mais é obrigatório: nome, cor, formato e instruções ficam em "Mais opções", recolhido; logo, fotos e ajustes entram depois, pelo agente. Criar leva direto ao acompanhamento.
2. **Construção etapa a etapa** (`/sites/<id>` em **Gerando**): a lista de etapas (entender a referência, uma por seção, montar a página) e a prévia parcial, que cresce conforme as seções ficam prontas. A pessoa pode sair da tela — o sino avisa quando ficar **No ar** ou **Falhou** (com o motivo, até onde chegou e "Tentar de novo", sem reenviar nada).
3. **O site pronto**: prévia em largura total com as abas **Prévia**, **Versões** (ver, publicar esta, voltar para esta), **Imagens**, **Marca** (nome e cores, "Aplicar ao site com o agente"), **Métricas** (7/30 dias, barras por dia, origens, "O que o agente sugere" com Aplicar) e **Publicação** (link público, endereço próprio na Netlify, domínio próprio). O **agente** fica numa bolha no canto: "troque o título por…", "coloque o logo no topo", "publique", "como estão as visitas?". Enquanto ele trabalha, a prévia mostra o rascunho mudando ao vivo; toda mudança vira uma versão nova em rascunho e só publica quando a pessoa pede.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript, SQLite nativo do Node (`node:sqlite`), sem biblioteca de UI. IA por **OpenRouter** (chave; também é quem lê a captura, `askVision`) ou **ChatGPT** (assinatura, pelo Codex App Server oficial, `@openai/codex` fixado em `0.155.1`, como no Build Agentflows). Os prompts de edição foram portados e traduzidos do projeto aberto screenshot-to-code, assim como a ideia do agente que edita por trecho (`edit_file`) em vez de reescrever o arquivo; a construção por seções (`lib/construtor.ts`) é própria deste app.

## Configurações (sem variáveis de ambiente)
Abra `/setup` (`components/Configuracoes.tsx`, tela própria deste app, no desenho do Build Agentflows). Três seções:
- **Inteligência artificial**: os cartões **ChatGPT** (assinatura, login por código de dispositivo) e **OpenRouter** (conectar em um clique ou colar a chave; modelo para textos; **modelo que lê a captura**, com "Testar leitura de imagem"). Um dos dois leva o selo **Principal** ("Usar como principal" no outro).
- **Hospedagem e publicação**: **Publicar na Netlify** (opcional: cada site ganha um endereço próprio lá) e **Domínio próprio no Render** (opcional: cadastra o domínio no serviço desta instância sozinho).
- **Assistente de IA**: **Usar dentro do seu assistente** (código de acesso MCP).

Tudo fica em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), cifrado em repouso. Não há mais cartões de notificações nem de rotinas, e a leitura de um site pelo endereço não depende de nenhum serviço de captura.

## OpenRouter ou ChatGPT
O **Principal** é quem escreve e edita os sites (`app/api/ia/route.ts`, config `IA_PROVEDOR`):
- **OpenRouter (padrão)**: chave da conta. É também o único caminho para **ler capturas** (`askVision`); por isso o modelo com visão fica dentro do cartão do OpenRouter (`OPENROUTER_MODEL_VISAO`, `app/api/visao/route.ts`).
- **ChatGPT (assinatura)**: login por código de dispositivo pelo Codex App Server oficial (`lib/chatgpt.ts`). A sessão fica em `DATA_DIR/chatgpt`, sem herdar credenciais da máquina, sem terminal, arquivos ou navegador. Texto (plano e seções pelo briefing ou pelo endereço, edições, agente, sugestões) e ferramentas passam por ele; o modelo é escolhido no cartão (`CHATGPT_MODEL`).

`lib/motor.ts` é o único ponto que decide entre os dois (`gerarTexto`, `gerarJSON`, `executarComFerramentas`, `iaDisponivel`); `lib/ai.ts` continua o da suíte. Com o ChatGPT escolhido e sem chave do OpenRouter, clonar por captura cai em demonstração e a tela avisa para conectar também o OpenRouter.

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
- Health check em `/api/health`. No plano free o disco é efêmero: sites, imagens e configuração se perdem a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

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
A versão 1 é publicada sozinha ao ficar pronta. Depois, cada edição (agente, "voltar para esta") cria uma versão nova que **não** vai ao ar até "Publicar esta" (painel Versões), "Publicar a versão N" (faixa acima da prévia), o pedido ao agente ou a ferramenta MCP `publicar_site`. O link `/s/<slug>` sempre mostra a publicada.

## Métricas e sugestões
Cada abertura do link público conta uma visita (`lib/metricas.ts`, tabela `visitas`: dia, hora, origem pelo `Referer`, celular × computador pelo `User-Agent`; robôs e `?previa=1` não contam). O painel "Métricas" mostra 7 ou 30 dias (visitas, % no celular, variação contra o período anterior, barras por dia, de onde vieram); `GET /api/sites/<id>/metricas?dias=`. "O que o agente sugere" (`lib/sugestoes.ts`, `GET /api/sites/<id>/sugestoes`) traz três melhorias para a versão atual, cada uma com "Aplicar" (manda a instrução ao agente); cache de 24 h por versão.

## Publicar na Netlify
Além do link desta instalação, cada site pode ir para um endereço próprio na Netlify (aba "Publicação", `lib/netlify.ts`, `GET|POST|DELETE /api/sites/<id>/netlify`). A conta é conectada em `/setup#netlify` por uma **chave de acesso pessoal** (User settings › Applications) ou, quando a equipe técnica registrou um aplicativo OAuth na Netlify e definiu `NETLIFY_CLIENT_ID_APP`, pelo botão "Conectar com a Netlify" (fluxo implícito: a chave volta em `/setup/netlify` e é gravada). Publicar cria o site na Netlify na primeira vez (`<slug>-xxxx.netlify.app`) e envia a versão que está no ar aqui pelo método de digest (SHA-1 do `index.html`, depois o conteúdo só se a Netlify ainda não o tiver — sem zip); as publicações seguintes reaproveitam o mesmo site. Domínio próprio, HTTPS e redirecionamentos se ajustam no painel da Netlify. Por que Netlify: é a hospedagem estática com o caminho mais curto para publicar um arquivo por API e a única das candidatas (Vercel, Cloudflare Pages, GitHub Pages) com OAuth aberto a aplicativos de terceiros sem marketplace; o Render, onde esta instância roda, não publica páginas avulsas.

## Domínio personalizado
Cada site pode ter um domínio próprio (`www.minhaempresa.com.br`), no painel "Domínio próprio" (`PUT|GET|DELETE /api/sites/<id>/dominio`). A estratégia é **uma instância servindo vários sites**: quando o `Host` da requisição é o domínio cadastrado em um site, `proxy.ts` (divergência registrada em `scripts/padrao-excecoes.json`) reescreve a raiz — e qualquer caminho fora de `/_next/` e `/s/` — para `/s/<projetoId>`, sem exigir sessão. Os assets continuam em `/s/<projetoId>/a/<assetId>`, então a mesma página funciona no link do app e no domínio.

Do lado da hospedagem, o Render precisa saber que o domínio pertence a este serviço (Settings › Custom Domains; domínio próprio exige plano pago do serviço) e o provedor do domínio precisa de um `CNAME` de `www` apontando para `<seu-app>.onrender.com`. Com a integração opcional **"Domínio próprio no Render"** conectada em `/setup#render` (`RENDER_API_KEY` e `RENDER_SERVICE_ID`, `lib/render.ts`), o app cadastra o domínio no serviço sozinho ao salvar e mostra o estado da verificação; sem ela, a tela dá o passo a passo manual. Verificação e certificado levam de minutos a 1 hora; o link `/s/<slug>` continua funcionando.

Alternativa não implementada: **uma instância por site** — subir outra cópia da imagem com `APP_URL` no domínio da empresa. Funciona, mas multiplica instâncias e contas; a rota pelo `Host` cobre o caso comum.

Teste local: `curl -H "Host: www.meusite.exemplo.com" http://127.0.0.1:3000/` devolve o HTML publicado do site com esse domínio; outro `Host` continua redirecionando a raiz para `/entrar`.

## Usar dentro de um assistente de IA (MCP)
`POST /mcp` (JSON-RPC 2.0, `Authorization: Bearer <código>` gerado em `/setup`, 60 chamadas por minuto). Ferramentas (`lib/ferramentas.ts`): `criar_site(nome, briefing, marca?, formato?)`, `gerar_pagina(imagem_url, instrucoes?, marca?, formato?)` (endereço de uma captura PNG/JPG ou do próprio site de referência), `editar_pagina(id|slug, instrucao)` (pelo agente; versão em rascunho), `publicar_site(id|slug, n?)`, `metricas_site(id|slug, dias?)`, `listar_sites(estado?)`. Protocolo implementado à mão em `lib/mcp.ts` (decisão herdada de `pdi-time`). Teste com `npx @modelcontextprotocol/inspector` (Streamable HTTP, `http://localhost:3000/mcp`, cabeçalho `Authorization`).

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite, da chave mestra e da sessão ChatGPT. Padrão `./data` (Docker: `/app/data`). |
| `APP_URL` | Endereço público do app (links absolutos em e-mails, Slack e no alvo do CNAME). Também gravado por `/setup`. |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida (equipe técnica). |
| `IA_PROVEDOR` | `openrouter` (padrão) ou `chatgpt`: qual conta é a principal. Alternativa ao selo "Principal" de Configurações. |
| `CHATGPT_MODEL` | Modelo da conta ChatGPT (vazio = automático). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Modelo de texto do OpenRouter (plano e seções pelo briefing/endereço, edições, agente). Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `OPENROUTER_MODEL_VISAO` | Modelo com visão que lê a captura (plano e seções pela captura); padrão `inclusionai/ling-3.0-flash-vl:free`. |
| `NETLIFY_ACCESS_TOKEN` | Chave de acesso pessoal da Netlify (https://app.netlify.com/user/applications#personal-access-tokens). Alternativa ao cartão. |
| `NETLIFY_CLIENT_ID_APP` | Credencial da suíte: id do aplicativo OAuth registrado na Netlify pela equipe técnica; liga o botão "Conectar com a Netlify" (redirect `https://<app>/setup/netlify`). Nunca aparece em `/setup`. |
| `RENDER_API_KEY`, `RENDER_SERVICE_ID` | Domínio próprio no Render: cadastra o domínio dos sites neste serviço sozinho (https://dashboard.render.com/u/settings#api-keys). |
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
lib/render.ts                   API do Render para o domínio próprio
lib/assets.ts                   logo e imagens; bloco "Imagens da empresa"
lib/metricas.ts, lib/sugestoes.ts   visitas e sugestões
lib/publicacao.ts               CSP, 404 e resolução do que está no ar
lib/demo.ts                     landing fixa e mudanças de demonstração
lib/ferramentas.ts              ferramentas MCP
lib/config-tipos.ts, lib/acoes.ts   caminhos e tipos da configuração sem jargão nos componentes
```
