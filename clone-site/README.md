# Clone de Site

O site da sua empresa, no ar hoje — e um agente que cuida dele depois. Área: Marketing e Produto.

## O que resolve
Montar e manter um site leva semanas entre briefing, agência e ajustes; depois de publicado, ninguém sabe se alguém abriu. Este app cria o site de três jeitos (clonando a captura de uma página de referência, pelo endereço de um site, ou descrevendo a empresa num briefing), aplica o nome, as cores, o logo e as fotos da empresa, e publica um link único. A partir daí, um **agente** conversa em português com quem cuida do negócio: troca textos, coloca imagens, muda cores, publica quando a pessoa pede e lê as métricas de visitas. Cada site é um projeto com estado, versões (rascunho × publicado), imagens, métricas, sugestões do agente e domínio próprio. Sem chave de IA, tudo funciona em modo demonstração (páginas e mudanças ilustrativas, métricas reais do próprio link).

Aviso mostrado abaixo de toda prévia: use a referência pela estrutura. Textos, marcas e imagens de terceiros são protegidos; troque pelo conteúdo da sua empresa.

## A jornada
1. **Criar um site** (tela inicial): "Clonar uma referência" (captura PNG/JPG até 5 MB), "Pelo endereço do site" (o serviço de captura fotografa a página) ou "Descrever a empresa" (briefing). Marca (nome, cores), nome do site, logo e até 6 imagens com descrição. Criar responde na hora: o site entra em "Meus sites" como **Gerando** e a pessoa pode sair da tela — o sino do cabeçalho avisa quando ficar **No ar** ou **Falhou** (com o motivo e "Tentar de novo", sem reenviar nada).
2. **O site** (`/sites/<id>`): prévia da versão selecionada (computador/celular, tela cheia, código), faixa "há mudanças ainda não publicadas", link público com copiar/abrir/trocar o endereço, e os painéis **Agente**, **Versões** (ver, publicar esta, voltar para esta), **Imagens**, **Métricas** (7/30 dias, barras por dia, origens, "O que o agente sugere" com Aplicar, resumo semanal) e **Domínio próprio**.
3. **O agente**: "troque o título por…", "coloque o logo no topo", "deixe o cabeçalho escuro", "publique", "como estão as visitas?". Toda mudança vira uma versão nova em rascunho; só publica quando a pessoa pede.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript, SQLite nativo do Node (`node:sqlite`), sem biblioteca de UI. IA por **OpenRouter** (chave; também é quem lê a captura, `askVision`) ou **ChatGPT** (assinatura, pelo Codex App Server oficial, `@openai/codex` fixado em `0.155.1`, como no Build Agentflows). Os prompts de geração e de edição foram portados e traduzidos do projeto aberto screenshot-to-code, assim como a ideia do agente que edita por trecho (`edit_file`) em vez de reescrever o arquivo.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup`. Cartões: **Inteligência artificial** (OpenRouter: conectar em um clique ou colar a chave), **Captura por endereço** (ScreenshotOne, opcional), **Hospedagem (Render)** (opcional: cadastra o domínio próprio dos sites sozinho), **Notificações** (e-mail ou Slack, para o resumo semanal), **Motor de inteligência artificial** (OpenRouter × ChatGPT, login por código de dispositivo), **Qualidade da página gerada** (o modelo com visão que lê a captura, com "Testar leitura de imagem"), **Rotinas** e **Usar dentro do seu assistente** (MCP). Tudo fica em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), cifrado em repouso.

## OpenRouter ou ChatGPT
O motor que escreve e edita os sites é escolhido no cartão "Motor de inteligência artificial" de `/setup#ia` (`components/ConexaoIA.tsx`, `app/api/ia/route.ts`, config `IA_PROVEDOR`):
- **OpenRouter (padrão)**: a chave do cartão "Inteligência artificial". É também o único caminho para **ler capturas** (`askVision`).
- **ChatGPT (assinatura)**: login por código de dispositivo pelo Codex App Server oficial (`lib/chatgpt.ts`). A sessão fica em `DATA_DIR/chatgpt`, sem herdar credenciais da máquina, sem terminal, arquivos ou navegador. Texto (criação pelo briefing, edições, agente, sugestões) e ferramentas passam por ele; o modelo é escolhido no cartão (`CHATGPT_MODEL`).

`lib/motor.ts` é o único ponto que decide entre os dois (`gerarTexto`, `gerarJSON`, `executarComFerramentas`, `iaDisponivel`); `lib/ai.ts` continua o da suíte. Com o ChatGPT escolhido e sem chave do OpenRouter, clonar por captura cai em demonstração e a tela avisa para conectar também o OpenRouter.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir `NOVA_SENHA_ADMIN` e reiniciar o app uma vez.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
`/?exemplo=1` cria um site de exemplo (captura `public/exemplo-referencia.png`, marca Nimbus Finanças); "Preencher com um exemplo" só preenche o formulário.

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
Toda página nasce como um **site** (`lib/projetos.ts`, tabela `projetos`): nome, marca, origem (`referencia` ou `briefing`), estado (`rascunho` → `gerando` → `pronto` | `falhou`; `falhou` → `gerando` em "Tentar de novo") e um `slug` legível, único na instância, derivado do nome. A página com as versões continua no histórico (`resultados`, tipo `pagina`); o site guarda `paginaId` e `versaoPublicada`.

- A geração corre **em segundo plano**: `POST /api/sites/<id>/gerar` responde `202` na hora e a tela consulta `GET /api/sites/<id>` a cada 5 s.
- A captura fica guardada só até `pronto` (para gerar sem a aba aberta e para "Tentar de novo") e é apagada em seguida. Em `falhou` ela permanece, com o motivo em português (`erro.mensagem`, `erro.codigo`, `erro.acao`).
- Na subida do servidor, todo site em `gerando` vira `falhou` ("O servidor reiniciou durante a geração"); a cada 60 s, quem passou de 15 minutos também.
- `/s/<slug>` (ou `/s/<id>`) serve a **versão publicada**. Edições criam versões novas sem mexer no que está no ar até a próxima publicação. Um id de página antigo, sem site, continua servindo a última versão.
- `POST /api/pagina` e a ferramenta MCP `gerar_pagina` continuam existindo: criam o site, geram e esperam o fim, devolvendo também `projetoId` e `slug`.

Rotas: `POST /api/sites` (cria; `gerar: true` já dispara), `GET /api/sites?estado=`, `GET|PATCH|DELETE /api/sites/<id>` (`PATCH`: `nome`, `slug`; `marca`/`instrucoes`/`briefing`/`stack` só em `rascunho`/`falhou`), `POST /api/sites/<id>/gerar`, `POST /api/sites/<id>/publicar` (`{ n }`), `POST /api/sites/<id>/visto`, `GET /api/sites/avisos` (sino).

Teste rápido, com o app rodando e a sessão em um cookie (`-b cookies.txt`):
```bash
IMG="data:image/png;base64,$(base64 -i public/exemplo-referencia.png | tr -d '\n')"
jq -n --arg img "$IMG" '{nome:"Loja Aurora",origem:"referencia",imagem:$img,marca:{nome:"Loja Aurora",corPrimaria:"#0f766e"},gerar:true}' \
  | curl -s -b cookies.txt -H "Content-Type: application/json" -d @- http://localhost:3000/api/sites      # 201, estado "gerando" em < 1 s
curl -s -b cookies.txt http://localhost:3000/api/sites/<id>                                                 # repita até estado "pronto"
sqlite3 data/app.sqlite "select estado, versaoPublicada, imagem is null from projetos where id='<id>'"       # pronto|1|1
curl -s http://localhost:3000/s/<slug> | head -3                                                            # a versão publicada, sem sessão
```

## Criar do zero pelo briefing
Na aba "Descrever a empresa", o briefing (o que a empresa faz, para quem, o que o site precisa ter; mínimo 20 caracteres) vai para `lib/gerador.ts:gerarDoBriefing`, que pede ao motor de texto uma landing com a estrutura padrão (cabeçalho com logo, herói, benefícios, como funciona, prova social, chamada final, rodapé) na marca informada e com as imagens enviadas. Em demonstração, a landing fixa recebe a primeira frase do briefing no título.

## Logo e imagens do cliente
Cada site aceita um logo e até 12 imagens (PNG, JPG, WEBP ou SVG sem script; até 2 MB cada), enviados no formulário de criação (até 6 na hora) ou no painel "Imagens" do site (`lib/assets.ts`, `GET|POST /api/sites/<id>/imagens`, `DELETE /api/sites/<id>/imagens/<assetId>`). Os arquivos são servidos em `/s/<idDoProjeto>/a/<assetId>` (público como o site, cache de 1 h, `nosniff`; SVG com CSP que não executa nada). O gerador e o agente recebem o bloco "Imagens da empresa" e usam `<img>` com esses endereços: o logo no cabeçalho e no rodapé, as fotos onde a referência tinha imagens; onde faltar imagem, continua o bloco na cor da marca.

Importante: a lista de origens da CSP de `/s/` (`lib/publicacao.ts`, `img-src 'self' data: https:`) e o que `sanitizarHtml` deixa passar andam juntas — ao liberar qualquer origem nova no sanitizador, atualize a CSP.

## O agente do site
`POST /api/sites/<id>/agente` com `{ texto }` (`lib/agente.ts`). O agente conhece a marca, as imagens (com endereços), a versão atual e a publicada, o código da página e as métricas dos últimos 7 dias, e só muda a página por ferramentas:
- `editar_trecho` — substituições exatas (`antigo` → `novo`), a ferramenta principal: barata e não corrompe o resto;
- `reescrever_pagina` — o arquivo inteiro, só para mudanças estruturais;
- `trocar_imagem` — coloca uma imagem da empresa no cabeçalho, no herói, no rodapé ou junto a um texto;
- `listar_imagens`, `ver_pagina`, `ver_metricas`;
- `publicar` — só quando a pessoa pede.

Tudo o que muda num pedido vira **uma** versão nova, em rascunho. A conversa fica guardada por site (`GET` lista, `DELETE` limpa). Em demonstração, cada pedido aplica uma mudança ilustrativa (e publica se o pedido falar em publicar). Roda no motor escolhido (OpenRouter com `tools` ou ChatGPT com `dynamicTools`).

## Publicar × rascunho
A versão 1 é publicada sozinha ao ficar pronta. Depois, cada edição (agente, "voltar para esta") cria uma versão nova que **não** vai ao ar até "Publicar esta" (painel Versões), "Publicar a versão N" (faixa acima da prévia), o pedido ao agente ou a ferramenta MCP `publicar_site`. O link `/s/<slug>` sempre mostra a publicada.

## Métricas e sugestões
Cada abertura do link público conta uma visita (`lib/metricas.ts`, tabela `visitas`: dia, hora, origem pelo `Referer`, celular × computador pelo `User-Agent`; robôs e `?previa=1` não contam). O painel "Métricas" mostra 7 ou 30 dias (visitas, % no celular, variação contra o período anterior, barras por dia, de onde vieram); `GET /api/sites/<id>/metricas?dias=`. "O que o agente sugere" (`lib/sugestoes.ts`, `GET /api/sites/<id>/sugestoes`) traz três melhorias para a versão atual, cada uma com "Aplicar" (manda a instrução ao agente); cache de 24 h por versão. "Receber este resumo toda semana" cria a rotina `resumo-site` (segunda, 9h, e-mail ou Slack via Notificações): visitas da semana, comparação, origem principal e a primeira sugestão, com o link do site.

## Domínio personalizado
Cada site pode ter um domínio próprio (`www.minhaempresa.com.br`), no painel "Domínio próprio" (`PUT|GET|DELETE /api/sites/<id>/dominio`). A estratégia é **uma instância servindo vários sites**: quando o `Host` da requisição é o domínio cadastrado em um site, `proxy.ts` (divergência registrada em `scripts/padrao-excecoes.json`) reescreve a raiz — e qualquer caminho fora de `/_next/` e `/s/` — para `/s/<projetoId>`, sem exigir sessão. Os assets continuam em `/s/<projetoId>/a/<assetId>`, então a mesma página funciona no link do app e no domínio.

Do lado da hospedagem, o Render precisa saber que o domínio pertence a este serviço (Settings › Custom Domains; domínio próprio exige plano pago do serviço) e o provedor do domínio precisa de um `CNAME` de `www` apontando para `<seu-app>.onrender.com`. Com a integração opcional **"Hospedagem (Render)"** conectada em `/setup#render` (`RENDER_API_KEY` e `RENDER_SERVICE_ID`, `lib/render.ts`), o app cadastra o domínio no serviço sozinho ao salvar e mostra o estado da verificação; sem ela, a tela dá o passo a passo manual. Verificação e certificado levam de minutos a 1 hora; o link `/s/<slug>` continua funcionando.

Alternativa não implementada: **uma instância por site** — subir outra cópia da imagem com `APP_URL` no domínio da empresa. Funciona, mas multiplica instâncias e contas; a rota pelo `Host` cobre o caso comum.

Teste local: `curl -H "Host: www.meusite.exemplo.com" http://127.0.0.1:3000/` devolve o HTML publicado do site com esse domínio; outro `Host` continua redirecionando a raiz para `/entrar`.

## Usar dentro de um assistente de IA (MCP)
`POST /mcp` (JSON-RPC 2.0, `Authorization: Bearer <código>` gerado em `/setup`, 60 chamadas por minuto). Ferramentas (`lib/ferramentas.ts`): `criar_site(nome, briefing, marca?, formato?)`, `gerar_pagina(imagem_url, instrucoes?, marca?, formato?)`, `editar_pagina(id|slug, instrucao)` (pelo agente; versão em rascunho), `publicar_site(id|slug, n?)`, `metricas_site(id|slug, dias?)`, `listar_sites(estado?)`. Protocolo implementado à mão em `lib/mcp.ts` (decisão herdada de `pdi-time`). Teste com `npx @modelcontextprotocol/inspector` (Streamable HTTP, `http://localhost:3000/mcp`, cabeçalho `Authorization`).

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite, da chave mestra e da sessão ChatGPT. Padrão `./data` (Docker: `/app/data`). |
| `APP_URL` | Endereço público do app (links absolutos em e-mails, Slack e no alvo do CNAME). Também gravado por `/setup`. |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida (equipe técnica). |
| `IA_PROVEDOR` | `openrouter` (padrão) ou `chatgpt`. Alternativa ao cartão "Motor de inteligência artificial". |
| `CHATGPT_MODEL` | Modelo da conta ChatGPT (vazio = automático). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Modelo de texto do OpenRouter (edições, briefing, agente). Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `OPENROUTER_MODEL_VISAO` | Modelo com visão que lê a captura; padrão `inclusionai/ling-3.0-flash-vl:free`. |
| `SCREENSHOTONE_ACCESS_KEY` | Serviço que fotografa a página de referência a partir do endereço (https://screenshotone.com). |
| `RENDER_API_KEY`, `RENDER_SERVICE_ID` | Hospedagem (Render): cadastra o domínio próprio dos sites sozinho (https://dashboard.render.com/u/settings#api-keys). |
| `NOTIFICACOES_*` | E-mail (Resend/SMTP/Gmail/Outlook) ou Slack para o resumo semanal (cartão Notificações). |
| `CONTA_DESLIGADA` | `1` trata toda rota como pública (só para o contêiner efêmero de captura do catálogo). |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx                    tela inicial: "Criar um site" (três abas, marca, logo e imagens) + "Meus sites"
app/sites/[id]/page.tsx         workspace do site: prévia, faixa de publicação, agente, versões, link, imagens, métricas, domínio
app/api/sites/**                sites (criar, listar, gerar 202, publicar, visto, avisos, imagens, agente, métricas, sugestões, domínio)
app/api/pagina/**               porta antiga (gera esperando; editar/voltar por versão)
app/s/[id]/route.ts             site publicado (versão publicada por slug ou id) + contagem de visita
app/s/[id]/a/[assetId]/route.ts logo e imagens do site (público, cache 1 h)
app/api/ia, app/api/chatgpt     motor de IA (OpenRouter × ChatGPT) e a conta ChatGPT
app/api/status/route.ts         status da suíte (divergência registrada: IA pelo motor)
app/mcp/route.ts, lib/mcp.ts    endpoint MCP
proxy.ts                        sessão + domínio personalizado (divergência registrada)
components/MeusSites.tsx        lista de sites com estado e acompanhamento
components/Workspace.tsx        nome editável, link público, faixa de publicação, painel de versões
components/ChatAgente.tsx       conversa com o agente
components/PainelImagens.tsx    seletor (criação) e painel (workspace) de logo e imagens
components/PainelMetricas.tsx   visitas, sugestões com Aplicar, resumo semanal (ResumoSemanal.tsx)
components/PainelDominio.tsx    domínio próprio e passo a passo
components/ConexaoIA.tsx        cartão OpenRouter × ChatGPT em /setup
components/useAvisos.ts, TopbarSite.tsx   sino do cabeçalho
lib/projetos.ts                 sites: estados, slug, geração em segundo plano, publicação, domínio
lib/gerador.ts                  prompts (captura, briefing, edição), extração e sanitização, versões
lib/agente.ts                   o agente: ferramentas, edição por trecho, conversa
lib/motor.ts, lib/chatgpt.ts    escolha do provedor; ponte oficial com o ChatGPT (Codex App Server)
lib/assets.ts                   logo e imagens; bloco "Imagens da empresa"
lib/metricas.ts, lib/sugestoes.ts, lib/resumo-site.ts   visitas, sugestões, rotina semanal
lib/render.ts                   API do Render para o domínio próprio
lib/publicacao.ts               CSP, 404 e resolução do que está no ar
lib/demo.ts                     landing fixa e mudanças de demonstração
lib/ferramentas.ts              ferramentas MCP
```
