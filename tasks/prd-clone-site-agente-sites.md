# PRD: Clone de Site — sites como projetos, assets do cliente, agente que edita e publica, métricas e domínio próprio

Data: 20/09/2026. Escopo: só o app `clone-site/` (mais a entrada dele em `catalogo.json` e as exceções registradas em `scripts/`). Continua `tasks/prd-clone-site-projetos.md` (17/09/2026; só a US-001 daquela PRD, "Ampliar", chegou ao código — ver `docs/analise-ux-2026-09-18.md`) e absorve o que ficou de lá. Origem: pedido de 20/09/2026 — "uma interface moderna e de fácil uso para executivos: clonar o site, adaptar com os assets enviados pelo cliente (logo etc.), já gerar um link navegável da empresa; uma experiência agêntica, como um funcionário que edita o site real da pessoa; criar projeto ou site a partir de uma referência ou do zero, publicar uma versão, ter o agente para editar e publicar qualquer modificação; cada site vira um projeto com domínio personalizado (link único no Render ou nova instância); o agente traz métricas e sugestões; mesma conexão OpenRouter e ChatGPT do `build-agentflows`".

Referências consultadas: `screenshot-to-code` (agente com ferramentas `create_file`/`edit_file` por substituição exata em vez de reescrever o arquivo inteiro, `screenshot_preview`, `extract_assets`; edição por elemento selecionado; bloco de *design system* no prompt; prompts de criação a partir de imagem e de atualização com histórico) e `build-agentflows` (`lib/chatgpt.ts`: ponte oficial Codex App Server com login por código de dispositivo e `dynamicTools`; `lib/openrouter.ts`: catálogo de modelos e loop de ferramentas; `ModelPicker`; `ChatGPTConnection`). O `radar-sinais` (não commitado, 18/09) já traz o mesmo `lib/chatgpt.ts` e um cartão `ConexaoIA` no visual da suíte — o desenho do cartão é reaproveitado.

## Introduction

O Clone de Site hoje é uma tela única: captura → página HTML → edições por instrução (reescrevendo o arquivo inteiro) → link `/s/<id>` da última versão. Falta o que transforma isso num produto que um executivo usa no dia a dia:

1. **Um lugar por site.** Não há "projeto": cada geração é um registro do histórico. Não dá para nomear, voltar depois, saber se ainda está gerando ou por que falhou.
2. **A marca do cliente de verdade.** A página troca imagens de terceiros por blocos coloridos; o logo e as fotos da empresa não entram em lugar nenhum.
3. **Um funcionário que edita o site.** "O que mudar" é um formulário que reescreve 12 mil tokens por mudança. Não há conversa, não há memória, não há ações (publicar, trocar imagem, medir).
4. **Publicar é implícito.** `/s/<id>` mostra sempre a última versão: qualquer edição vai ao ar na hora, sem uma versão "publicada" separada do rascunho.
5. **Sem métricas.** Ninguém sabe se alguém abriu o link.
6. **Sem domínio.** O link é `/s/<id>` no endereço do app; não há como apontar `www.minhaempresa.com.br` para o site.
7. **Só OpenRouter.** Quem tem assinatura ChatGPT não consegue usá-la, como já consegue no `build-agentflows`.

Esta PRD reorganiza o app em torno de **Site = projeto com estado**, com *assets* do cliente, um **agente** com ferramentas (edita por trecho, troca imagens, publica, lê métricas), **versão publicada** separada do rascunho, **métricas de visitas e sugestões**, **domínio personalizado** servido pela própria instância no Render (com automação opcional pela API do Render) e o **motor de IA escolhido entre OpenRouter e ChatGPT**.

### Premissas

- P1. `PADRAO.md` continua valendo: Next.js 16, Tailwind 4, React 19, sem biblioteca de UI, `node:sqlite`, português sem jargão na tela (`verificar-jargao.mjs`), `verificar-paleta.mjs` limpo. A única dependência nova é `@openai/codex@0.155.1` (a mesma do `build-agentflows` e do `radar-sinais`), porque a conexão ChatGPT exige o App Server oficial.
- P2. **Site = projeto.** Um projeto tem nome, marca, origem (referência ou briefing), assets, uma página (com versões, como hoje) e estado. Agrupar várias páginas num site fica fora (Non-Goals).
- P3. **Versões continuam no histórico** (`resultados`, tipo `pagina`, `Pagina.versoes`), com `/r/[id]`, `/imprimir/[id]`, `editar`/`voltar` e as ferramentas MCP atuais funcionando com o mesmo id. O projeto guarda `paginaId` e passa a guardar **`versaoPublicada`**: `/s/<slug>` serve essa versão, não a última. Página sem projeto (registro antigo) continua servindo a última versão.
- P4. **Link único por site**: `/s/<slug>`, com `slug` legível derivado do nome (único na instância, editável), além do id. O endereço absoluto usa `APP_URL` quando definido (`lib/setup-comum.ts:enderecoPublico()`), senão a origem da requisição — no Render, `https://<app>.onrender.com/s/<slug>`.
- P5. **Domínio personalizado sem nova instância.** A estratégia primária é uma instância servindo vários sites: quando o `Host` da requisição é um domínio cadastrado num projeto, a instância serve a versão publicada dele na raiz. Isso exige uma divergência de propósito em `proxy.ts` (arquivo `INFRA`), registrada em `scripts/padrao-excecoes.json`. A automação pela API do Render (`POST /v1/services/{id}/custom-domains`) é opcional e só roda quando `RENDER_API_KEY` e `RENDER_SERVICE_ID` estão conectados em `/setup`; sem ela, a tela dá o passo a passo (adicionar o domínio em Settings › Custom Domains no Render e criar o CNAME). "Uma instância por site" fica documentado como alternativa (o app já é uma imagem Docker), não implementado.
- P6. **Assets do cliente ficam no banco** (`assets`, base64, até 2 MB cada, até 12 por site) e são servidos em `/s/<idDoProjeto>/a/<idDoAsset>` (público, cache de 1 h). O HTML gerado referencia esses endereços absolutos, que funcionam na prévia (`srcDoc`), no link `/s/` e no domínio próprio. A CSP de `/s/` ganha `'self'` em `img-src`.
- P7. **Motor de IA**: `IA_PROVEDOR` (`openrouter` padrão | `chatgpt`) escolhido em `/setup`, como no `radar-sinais`. Texto (criação do zero, edições, agente, sugestões) segue o provedor escolhido. **Leitura de captura continua pelo OpenRouter** (`askVision`): quando o provedor é ChatGPT e não há chave do OpenRouter, clonar por captura cai no modo demonstração com aviso claro ("Para ler capturas, conecte o OpenRouter"). `lib/ai.ts` (INFRA) **não muda**: a escolha mora em `lib/motor.ts` (próprio do app); `app/api/status/route.ts` passa a considerar o ChatGPT como IA conectada (exceção registrada, precedente `radar-sinais`).
- P8. **O agente edita por trecho.** A ferramenta principal é `editar_trecho` (lista de `{ antigo, novo }` com casamento exato, como o `edit_file` do screenshot-to-code): barata, rápida e não corrompe o resto. `reescrever_pagina` (arquivo inteiro) fica para mudanças estruturais. Toda edição vira uma **versão nova** (rascunho); publicar é uma ação explícita (botão ou ferramenta `publicar`).
- P9. **Geração em segundo plano** (da PRD anterior): a rota de gerar responde `202`, a tela consulta a cada 5 s, o servidor marca `falhou` quem reinicia ou passa de 15 min. A captura fica guardada até `pronto` (para "Tentar de novo") e é apagada em seguida.
- P10. **Modo demonstração completo**: sem nenhuma chave, criar site (referência ou briefing), conversar com o agente (resposta fixa que aplica `edicaoDemo`), publicar, ver métricas (visitas reais do próprio link) e sugestões fixas funcionam.
- P11. Nenhum texto na tela usa "token", "API", "OpenRouter", "webhook", "endpoint", "/setup" (verificador de jargão). "OpenRouter" e "ChatGPT" aparecem só em `components/setup.tsx`/cartões de `/setup` (não varridos, ou com exceção registrada em `scripts/jargao-excecoes.json` para o cartão `ConexaoIA.tsx`, como no `radar-sinais`).

## Goals

- G1. Um executivo cria um site (por captura, por endereço ou por briefing), com o logo da empresa, e recebe um link navegável único em menos de 3 minutos de interação, podendo fechar a tela enquanto gera.
- G2. Toda mudança passa por uma conversa: "troque o título", "coloque o logo no topo", "publique", "como está a visita?" — o agente executa e responde em português, e cada edição vira versão.
- G3. Rascunho e publicado são coisas diferentes: o link público só muda quando a pessoa (ou o agente, a pedido dela) publica.
- G4. O site mede visitas (total, por dia, celular x computador, de onde vieram) e o agente transforma isso em três sugestões aplicáveis com um clique.
- G5. Um domínio próprio aponta para o site pela própria instância; com a chave do Render conectada, o app cadastra o domínio sozinho.
- G6. Quem tem ChatGPT usa a assinatura; quem tem OpenRouter usa a chave; a escolha é um clique em `/setup`.
- G7. `npm run lint`, `npx tsc --noEmit`, `npm run build`, `verificar-jargao.mjs`, `verificar-padrao.sh` (exceções registradas) e `verificar-paleta.mjs` limpos; verificação em navegador em 1400x900 e 390 px.

## User Stories

### US-001: Sites como projetos com estado, geração em segundo plano e link por slug
**Description:** As a executivo, I want que cada site seja um projeto com nome, estado e link próprio so that eu volte depois, saiba se ainda está gerando ou por que falhou e compartilhe um endereço legível.

**Acceptance Criteria:**
- [ ] `lib/types.ts`: `EstadoProjeto = "rascunho" | "gerando" | "pronto" | "falhou"`; `OrigemProjeto = "referencia" | "briefing"`; `Projeto { id, nome, slug, estado, origem, stack, instrucoes?, briefing?, marca?, tamanhoImagem, paginaId?, versaoPublicada?, dominio?, erro?: { mensagem, codigo?, acao? }, criadoEm, atualizadoEm, terminadoEm?, vistoEm? }` (a imagem não faz parte do tipo devolvido às telas)
- [ ] Novo `lib/projetos.ts` (próprio do app, mesmo `app.sqlite`, `CREATE TABLE IF NOT EXISTS projetos` com as colunas acima mais `imagem TEXT NULL`, índice único em `slug`): `criar({ nome, origem, stack, instrucoes, briefing, marca, imagem })` valida com `validarImagem`/`normalizarMarca` (imagem obrigatória só em `referencia`, briefing obrigatório só em `briefing`) e grava em `rascunho` com `slug` gerado de `nome` (minúsculas, sem acento, hifens, sufixo `-2`, `-3`… quando repetido); `obter(id)`, `obterPorSlug(slugOuId)`, `listar({ estado?, limite = 50 })` (sem `imagem`), `renomear(id, nome)`, `definirSlug(id, slug)` (valida `^[a-z0-9-]{3,60}$`, único), `apagar(id)` (apaga também a página do histórico e os assets), `marcarVisto(id)`, `publicar(id, n)` (grava `versaoPublicada`), `imagemDe(id)`
- [ ] `iniciarGeracao(id)`: só de `rascunho` ou `falhou`; muda para `gerando` e chama `executarGeracao(id)` **sem `await`**. `executarGeracao` chama `gerarPagina` (referência) de `lib/gerador.ts` com a imagem lida do banco; em sucesso grava `pronto`, `paginaId`, `versaoPublicada = 1`, `terminadoEm` e **apaga `imagem`**; em falha grava `falhou`, `erro` (`mensagem`/`codigo`/`acao` de `ErroIA`, ou só a mensagem de `Error`; nunca texto cru do provedor), `terminadoEm`, e mantém a imagem
- [ ] `encerrarAbandonados()`: na subida (`instrumentation.ts`) todo `gerando` vira `falhou` com "O servidor reiniciou durante a geração. Tente de novo."; no laço de 60 s, todo `gerando` há mais de 15 min vira `falhou` com "A geração passou de 15 minutos e foi encerrada. Tente de novo ou escolha um modelo mais rápido." (`acao` = `ACAO_ESCOLHER_MODELO`)
- [ ] Rotas novas em `app/api/sites/`: `POST /api/sites` (cria `rascunho` e, com `gerar: true`, já dispara; devolve `201`), `GET /api/sites?estado=`, `GET /api/sites/[id]` (sem imagem; quando `pronto`, inclui `pagina` e `meta` do histórico), `PATCH /api/sites/[id]` (`nome`, `slug`; `marca`/`instrucoes`/`briefing`/`stack` só em `rascunho`/`falhou`), `DELETE /api/sites/[id]`, `POST /api/sites/[id]/gerar` (`202`; `409` "Este site já está sendo gerado." quando em `gerando`), `POST /api/sites/[id]/publicar` (`{ n }`; padrão: a última versão), `POST /api/sites/[id]/visto`, `GET /api/sites/avisos` (até 10 `pronto`/`falhou` com `vistoEm` nulo, formato `NotificacaoTopbar`, texto "«Nome» está no ar." / "«Nome» não pôde ser gerado: <motivo>", `url` `/sites/[id]`). Erros pelo padrão `respostaErro`/`ErroDePedido`/404
- [ ] `app/s/[id]/route.ts` passa a resolver `slug` ou id de projeto (servindo `versaoPublicada`) e, por compatibilidade, id de página do histórico (última versão). `lib/gerador.ts:versaoAtual` continua para o segundo caso
- [ ] `POST /api/pagina` e a ferramenta MCP `gerar_pagina` continuam existindo: passam a criar o projeto (nome = título da página ou da marca), gerar e **aguardar** internamente (laço curto sobre `obter(id)` até sair de `gerando`, limite 15 min), devolvendo a resposta atual mais `projetoId` e `slug`
- [ ] `lib/demo.ts`: em demonstração `executarGeracao` mantém o `esperar(1400)` para o estado `gerando` ser visível
- [ ] `npm run lint`, `npx tsc --noEmit` passam; `curl` documentado no README: criar, gerar (202 em menos de 1 s), consultar até `pronto`, confirmar `imagem IS NULL` via `sqlite3`, `/s/<slug>` respondendo a versão publicada

### US-002: Tela inicial "Meus sites" e criação por referência, endereço ou briefing
**Description:** As a executivo, I want abrir o app e ver meus sites com estado, e criar um novo em três caminhos (captura, endereço do site, ou descrever a empresa) so that eu comece em segundos e saiba onde está cada coisa.

**Acceptance Criteria:**
- [ ] `app/page.tsx` reescrita: `Hero` com `PROMESSA` nova (título ≤ 8 palavras, ex. "O site da sua empresa, no ar hoje"; apoio ≤ 20 palavras; 5 itens ≤ 6 palavras) e `Passos` ("Referência ou briefing", "Marca e imagens", "No ar com o agente"); à esquerda o cartão **"Criar um site"** com um alternador de três abas ("Clonar uma referência" · "Pelo endereço do site" · "Descrever a empresa"): aba 1 = `Dropzone` atual; aba 2 = campo de endereço + "Trazer" (rota `/api/captura` atual); aba 3 = `textarea` "O que a empresa faz, para quem e o que o site precisa ter" (≥ 20 caracteres); abaixo, o cartão "A sua marca" (nome do site pré-preenchido pela marca, nome da marca, cor principal, cor secundária em "Mais detalhes", instruções, formato) e o botão "Criar o site"
- [ ] À direita, o `Stage` mostra **"Meus sites"**: lista dos projetos (`GET /api/sites`) com `Chip` de estado ("Rascunho" cinza, "Gerando" âmbar com ponto pulsante, "No ar" verde quando `pronto`, "Falhou" vermelho), nome, marca, data, link para `/sites/[id]` e "Abrir o link" quando publicado; `Empty` ("Nenhum site ainda", ação "Preencher com um exemplo") quando vazio; o cartão do site em `gerando` mostra "Gerando há X min Y s" e atualiza a cada 5 s (`INTERVALO_ACOMPANHAMENTO_MS`)
- [ ] Ao enviar: `POST /api/sites` com `gerar: true` → a tela **não espera**: o site novo aparece no topo de "Meus sites" em `gerando`, o formulário limpa e um `Aviso` diz "Estamos criando «Nome». Você pode sair desta tela: avisamos no sino quando ficar pronto." Ao chegar a `pronto`, o cartão vira "No ar" com o link; ao `falhou`, mostra o motivo, a ação (`erro.acao`) e "Tentar de novo" (`POST /api/sites/[id]/gerar`, nada é reenviado)
- [ ] "Preencher com um exemplo" preenche a aba 1 com `public/exemplo-referencia.png` e a marca Nimbus Finanças (sem enviar); `/?exemplo=1` preenche e envia; `?captura=1` desliga a rolagem automática
- [ ] Sino do cabeçalho: novo `components/useAvisos.ts` (consulta `GET /api/sites/avisos` ao montar e a cada 15 s, pausa com `document.hidden`), passado como `notificacoes` ao `Topbar` em `app/page.tsx`, `app/setup/page.tsx` (via wrapper client), `app/historico/page.tsx` e nas telas novas; `document.title` ganha "(N) " enquanto houver avisos
- [ ] `Topbar` recebe `navegacao={[...NAVEGACAO, { rotulo: "Sites", href: "/" }]}`? Não: "Início" já é "Meus sites"; a navegação continua Início · Histórico · Configurações (sem tocar `lib/navegacao.ts`)
- [ ] Texto de `Privacidade`: "A captura fica guardada só até o site ficar pronto e é apagada em seguida. Se falhar, ela permanece para você tentar de novo, até apagar o site. Logo, imagens e o código ficam neste app até você apagar."
- [ ] Lint, `tsc`, `verificar-jargao.mjs` passam; verificar no navegador (1400x900 e 390 px): criar pelo exemplo, ir a `/setup` durante `gerando`, voltar e ver o cartão atualizado; `falhou` com motivo

### US-003: Criar do zero a partir de um briefing
**Description:** As a executivo sem referência em mãos, I want descrever a empresa e receber um site completo so that eu não dependa de uma captura de outro site.

**Acceptance Criteria:**
- [ ] `lib/gerador.ts`: `SYSTEM_BRIEFING_TAILWIND`/`SYSTEM_BRIEFING_CSS` (portados do `create/text` do screenshot-to-code e das regras comuns atuais: um arquivo, português, sem scripts além do permitido, imagens como blocos na cor da marca **ou os assets informados**, responsivo) e `gerarDoBriefing({ briefing, marca, stack, instrucoes, assets })` que monta a estrutura padrão de uma landing (cabeçalho com logo/nome, herói com chamada e botão, 3 a 6 benefícios, como funciona, depoimentos ou números, chamada final, rodapé com contato) e chama o **motor de texto** (`lib/motor.ts`, US-005; até lá `askText`); mesma extração/sanitização; salva no histórico como `pagina` com `entrada.briefing`
- [ ] `lib/projetos.ts:executarGeracao` escolhe `gerarPagina` (origem `referencia`) ou `gerarDoBriefing` (origem `briefing`)
- [ ] `lib/demo.ts:paginaDemo` aceita o briefing: em demonstração, o título e a chamada do herói citam o que a empresa faz (primeira frase do briefing, até 90 caracteres), o resto é a landing fixa
- [ ] Ferramenta MCP nova `criar_site(nome, briefing, marca?, formato?)` em `lib/ferramentas.ts`, reaproveitando `lib/projetos.ts` (cria, gera, aguarda, devolve id, slug, links)
- [ ] Lint, `tsc` passam; verificar pela tela (aba "Descrever a empresa") em demonstração e, se houver chave, com IA real

### US-004: Logo e imagens do cliente
**Description:** As a executivo, I want enviar o logo e fotos da minha empresa so that o site saia com a minha marca de verdade, não com blocos coloridos.

**Acceptance Criteria:**
- [ ] Novo `lib/assets.ts`: tabela `assets (id, projetoId, papel 'logo'|'imagem', nome, mime, tamanho, dados, descricao, criadoEm)`; `adicionar(projetoId, { papel, nome, mime, dados(base64), descricao })` (PNG, JPG, WEBP ou SVG; até 2 MB; até 12 por site; um só `logo` — o novo substitui), `listar(projetoId)` (sem `dados`), `obter(id)`, `apagar(id)`, `urlDoAsset(projetoId, id)` = `/s/<projetoId>/a/<id>`
- [ ] Rotas: `GET/POST /api/sites/[id]/imagens` (`POST` com `multipart/form-data`: `arquivo`, `papel`, `descricao`), `DELETE /api/sites/[id]/imagens/[assetId]`; `GET /s/[id]/a/[assetId]` (público, `Content-Type` do asset, `Cache-Control: public, max-age=3600`, `X-Content-Type-Options: nosniff`; SVG servido com `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` para não executar script). `proxy.ts` já libera `/s/*`
- [ ] `lib/gerador.ts`: os prompts de geração (captura e briefing) e de edição recebem o bloco "Imagens da empresa" (`montarBlocoAssets(assets)`): para cada asset, papel, descrição e endereço absoluto; regra: "use o logo no cabeçalho e no rodapé com `<img>` e `alt` com o nome da marca; use as imagens onde a referência tinha fotos, com `object-fit: cover`; onde faltar imagem, continue com o bloco na cor da marca". `sanitizarHtml` continua deixando `<img src="/s/...">` e `https:` passar
- [ ] CSP de `app/s/[id]/route.ts` ganha `'self'` em `img-src` (assets) e o README anota que as duas listas (sanitização e CSP) andam juntas
- [ ] Tela: no formulário de criação (US-002), o cartão "A sua marca" ganha "Logo da empresa" (`Dropzone` pequena, opcional) e "Fotos e imagens" (até 6 na criação, com descrição de uma linha cada, opcional) — enviados **depois** do `POST /api/sites` e antes do `gerar` (a rota `POST /api/sites` sem `gerar` + `POST /api/sites/[id]/imagens` × N + `POST /api/sites/[id]/gerar`); no workspace (US-006) o painel "Imagens" lista, adiciona e remove
- [ ] Demonstração: `paginaDemo` usa o logo (quando houver) no cabeçalho e as imagens nos blocos do herói e dos benefícios
- [ ] Lint, `tsc` passam; verificar no navegador: criar com logo + 2 fotos, ver o logo no cabeçalho da prévia e as fotos nos blocos; `/s/<slug>` carrega as imagens (CSP sem bloqueio no console)

### US-005: Conexão ChatGPT e escolha do motor de IA
**Description:** As a executivo com assinatura ChatGPT, I want conectar minha conta e usá-la no lugar do OpenRouter so that eu não precise de outra chave, como já faço no Build Agentflows.

**Acceptance Criteria:**
- [ ] `package.json`: `@openai/codex` fixado em `0.155.1`. `lib/chatgpt.ts` copiado do `build-agentflows` com `clientInfo` `clone_site`/"Clone de Site", mensagens adaptadas ("Conecte sua conta ChatGPT para editar o site.") e `baseInstructions` "Você ajuda a construir e editar o site de uma empresa. Responda em português…"; `run()` aceita `tools` (`dynamicTools`), `onText` e `signal` como lá
- [ ] `app/api/chatgpt/route.ts` (GET estado+modelos, POST inicia login por código de dispositivo, DELETE `{cancel}`/logout) — igual ao do `radar-sinais`
- [ ] Novo `lib/motor.ts` (próprio do app): `provedor()` lê `IA_PROVEDOR` (`openrouter` padrão | `chatgpt`); `iaDisponivel()` (async: chave do OpenRouter, ou conta ChatGPT conectada); `gerarTexto({ system, prompt, maxTokens, temperature })` roteia para `askText` ou `chatGPT().run` (modelo `CHATGPT_MODEL`); `executarComFerramentas({ system, mensagens, ferramentas, executar })` roteia para `askWithTools` (OpenRouter) ou `chatGPT().run` com `dynamicTools`; `visaoDisponivel()` = OpenRouter com chave (a leitura de captura não muda de provedor); erros do ChatGPT viram `ErroIA("provedor_fora", …, 502, { rotulo: "Conectar a IA", url: "/setup#ia" })`
- [ ] `lib/gerador.ts:editarPagina`, `gerarDoBriefing` e (US-007/US-008) o agente e as sugestões usam `lib/motor.ts`; `gerarPagina` (captura) continua em `askVision`, e quando `provedor() === "chatgpt"` sem chave do OpenRouter, o projeto de referência é gerado em demonstração com `meta.demo = true` e a tela mostra o `Aviso` "Para ler capturas, conecte também o OpenRouter"
- [ ] `app/api/ia/route.ts` (GET/PUT `{ provedor, modelo }`, como no `radar-sinais`) e `components/ConexaoIA.tsx` (cartão de `/setup`, `id="ia"`, rádio "OpenRouter" / "ChatGPT"; com ChatGPT: estado, código de dispositivo com copiar, "Entrar no ChatGPT", "Aguardando sua autorização…", modelo em `<select>`, "Desconectar"); com OpenRouter, o cartão genérico atual continua. Registrado em `app/setup/page.tsx` antes de `QualidadePagina`. `scripts/jargao-excecoes.json` ganha `"clone-site": ["OpenRouter"]` (o cartão nomeia o provedor, como no `radar-sinais`)
- [ ] `app/api/status/route.ts`: `ai`/`demo` passam a considerar `iaDisponivel()` (exceção em `scripts/padrao-excecoes.json` com o motivo; precedente `radar-sinais`), e `integrations.chatgpt` reflete a conta conectada via `lib/status-do-app.ts:statusExtra()`
- [ ] `Dockerfile` não muda (o binário musl do Codex vem como dependência opcional; comentário do `build-agentflows` sobre `/app/data` copiado); `README.md` explica os dois caminhos
- [ ] Lint, `tsc`, `npm run build` passam; verificar no navegador: `/setup#ia` alterna, inicia o login (código aparece) e cancela; com OpenRouter, nada muda

### US-006: Workspace do site: prévia, versões, publicar, imagens, link
**Description:** As a executivo, I want abrir um site e ver, num lugar só, a prévia, o que está publicado, as versões, as imagens e o link so that eu opere o site sem procurar nada.

**Acceptance Criteria:**
- [ ] Nova `app/sites/[id]/page.tsx` (Client Component, consulta `GET /api/sites/[id]` a cada 5 s enquanto `gerando`): cabeçalho com nome editável em linha (`PATCH`), `Chip` de estado, "Criado em", e o bloco de link: endereço `/s/<slug>` absoluto (`location.origin` só no clique/efeito, ver nota de hydration no CLAUDE.md), "Copiar", "Abrir", "Trocar o endereço" (edita o `slug` com validação e mensagem quando já existe); ao abrir chama `POST /api/sites/[id]/visto`
- [ ] Layout em duas colunas no desktop (`grid-cols-[1fr_380px]`) e empilhado no celular: à esquerda a prévia (`PreviaPagina` com Computador/Celular, tela cheia, "Ver o código") da **versão selecionada** (padrão: a última); à direita os painéis: **Agente** (US-007), **Versões** (lista com número, instrução, hora, marcador "Publicada" na `versaoPublicada`, "Ver" seleciona para a prévia, "Publicar esta" chama `POST /api/sites/[id]/publicar`, "Voltar para esta" chama a rota `voltar` atual), **Imagens** (US-004: logo e fotos com miniatura, adicionar, remover), **Métricas** (US-008), **Domínio** (US-009)
- [ ] Quando a última versão difere da publicada, uma faixa acima da prévia diz "Há mudanças ainda não publicadas" com o botão "Publicar a versão N"; quando igual, "Esta é a versão que está no ar"
- [ ] Estados: `rascunho` → botões "Gerar o site" e "Editar o pedido" (volta à tela inicial com `?site=<id>` que preenche o formulário via `PATCH` ao gerar); `gerando` → `Loading` com etapas + "Gerando há X min Y s" + aviso de que pode sair; `falhou` → `ErrorBox` com `erro` + "Tentar de novo" + "Editar o pedido"; `pronto` → o workspace completo
- [ ] "Apagar site" com `window.confirm`, apagando página, assets e métricas (`/s/<slug>` passa a 404 amigável)
- [ ] `EntregarPagina` (cabeçalho do resultado) deixa de mostrar "Publicar link" como se fosse instantâneo: em `/r/[id]` de uma página **com projeto**, o botão vira "Abrir o site" (link para `/sites/[projetoId]`); sem projeto, continua como hoje
- [ ] Lint, `tsc`, `verificar-jargao.mjs` passam; verificar no navegador em 1400x900 e 390 px: publicar a versão 1, editar (US-007 ou "voltar"), ver a faixa "não publicadas", publicar a 2, conferir `/s/<slug>` trocando

### US-007: O agente do site: conversa que edita, troca imagens e publica
**Description:** As a executivo, I want pedir mudanças em português a um assistente que conhece o meu site so that eu não precise de formulário nem de agência para cada ajuste.

**Acceptance Criteria:**
- [ ] Novo `lib/agente.ts` (próprio do app): tabela `mensagens (id, projetoId, papel 'pessoa'|'agente', texto, versaoN NULL, criadoEm)`; `conversar(projetoId, texto)` monta o `system` (quem é: "o funcionário que cuida do site «Nome» da empresa «Marca»"; o que sabe: marca, cores, assets com endereços, versão atual N, versão publicada M, resumo de métricas dos últimos 7 dias; regras: responda curto, em português, sem código na resposta, use ferramentas para toda mudança, uma versão por pedido, nunca publique sem a pessoa pedir) e as últimas 12 mensagens; executa por `lib/motor.ts:executarComFerramentas` com as ferramentas: `ver_pagina()` (HTML atual; acima de 60 mil caracteres devolve por seções `<header>/<section>/<footer>` com índices), `editar_trecho({ edicoes: [{ antigo, novo }] })` (casamento exato, todos os trechos ou nenhum; erro claro "Trecho não encontrado: …" para o modelo tentar de novo; grava versão nova com `instrucao` = o pedido da pessoa), `reescrever_pagina({ html })` (mesma extração/sanitização; versão nova), `trocar_imagem({ assetId, onde })` (atalho: insere `<img>` do asset no cabeçalho/herói/seção indicada, via `editar_trecho` interno), `listar_imagens()`, `publicar({ n? })`, `ver_metricas({ dias })` (US-008; até lá devolve "Ainda sem métricas"). Limite de 8 rodadas de ferramentas; toda versão gravada anota `versaoN` na mensagem do agente
- [ ] `POST /api/sites/[id]/agente` (`{ texto }`, até 2.000 caracteres) devolve `{ resposta, versoes: [n], pagina, publicou }`; `GET /api/sites/[id]/agente` devolve as últimas 50 mensagens; `DELETE` limpa a conversa. Em demonstração: resposta fixa em português ("Apliquei a mudança na versão N…") que grava `edicaoDemo`; "publique" em demonstração publica de verdade
- [ ] `components/ChatAgente.tsx`: lista de mensagens (pessoa à direita, agente à esquerda, cada mensagem do agente com "Versão N" clicável que seleciona a prévia), campo "Peça uma mudança" com `Enter` para enviar e `Shift+Enter` para quebrar linha, botão "Enviar", três atalhos acima do campo quando a conversa está vazia ("Coloque o logo no topo", "Troque o título principal", "Publique esta versão"), estado "O agente está trabalhando…" com os passos executados (nomes das ferramentas traduzidos: "Lendo a página", "Editando um trecho", "Publicando"), erro inline com "Tentar de novo"
- [ ] `lib/ferramentas.ts` (MCP): `editar_pagina` passa a chamar `conversar` (o agente decide entre trecho e reescrita); nova `publicar_site(id, n?)`
- [ ] Lint, `tsc`, `verificar-jargao.mjs` passam; verificar no navegador (demonstração): três pedidos, três versões, "publique" atualiza `/s/<slug>`; com IA real, um pedido de trecho ("troque o título") gera versão por `editar_trecho` sem reescrever o arquivo (conferir no log do servidor a ferramenta usada)

### US-008: Métricas de visitas e sugestões do agente
**Description:** As a executivo, I want saber quantas pessoas abriram meu site, de onde e em que aparelho, e receber sugestões do que melhorar so that o site trabalhe para mim depois de publicado.

**Acceptance Criteria:**
- [ ] Novo `lib/metricas.ts`: tabela `visitas (id, projetoId, dia 'AAAA-MM-DD', hora INTEGER, origem TEXT, dispositivo 'celular'|'computador', caminho, criadoEm)`; `registrarVisita(projetoId, req)` (origem = hostname do `Referer` sem `www.`, ou "direto"; dispositivo por `User-Agent` `/Mobile|Android|iPhone/`; ignora `User-Agent` de robôs conhecidos `/bot|crawl|spider|preview|HeadlessChrome/i` e requisições com `?previa=1`); `resumo(projetoId, dias)` → `{ total, porDia: [{ dia, visitas }], celular, computador, origens: [{ origem, visitas }] (top 5), comparadoAoPeriodoAnterior: number|null }`
- [ ] `app/s/[id]/route.ts` registra a visita **só** quando serve HTML de um projeto (não em assets nem em 404), sem esperar (`void`)
- [ ] `GET /api/sites/[id]/metricas?dias=7|30` devolve o `resumo`; painel **Métricas** no workspace: três `Destaque` (Visitas, No celular %, Comparado ao período anterior), barras por dia em CSS puro (`div` com altura proporcional, `aria-label` com o valor; sem biblioteca), lista "De onde vieram"; alternador 7/30 dias; estado vazio "Ninguém abriu o link ainda. Compartilhe o endereço acima."
- [ ] Novo `lib/sugestoes.ts`: `sugerir(projetoId)` → `askJSON`/motor com o HTML (resumido: títulos, botões, textos de até 200 caracteres por seção), a marca e o `resumo` de 30 dias; devolve 3 itens `{ titulo, motivo, instrucao }` (a `instrucao` é o que mandar ao agente); em demonstração, três sugestões fixas coerentes com uma landing; cache de 24 h por versão (`config` `SUGESTOES_<projetoId>_<n>`)
- [ ] `GET /api/sites/[id]/sugestoes` (`?forcar=1` ignora o cache); no painel Métricas, o bloco "O que o agente sugere" com os três cartões e o botão "Aplicar" em cada (envia `instrucao` ao chat do agente, US-007, que edita e responde) e "Pedir novas sugestões"
- [ ] Ferramenta do agente `ver_metricas({ dias })` passa a devolver o `resumo` real; o `system` do agente recebe o resumo de 7 dias
- [ ] Lint, `tsc`, `verificar-jargao.mjs` passam; verificar: abrir `/s/<slug>` 3 vezes (uma com `User-Agent` de celular via `curl -A`), ver 3 visitas, 1 no celular, origem "direto"; "Aplicar" uma sugestão gera versão

### US-009: Domínio personalizado
**Description:** As a executivo, I want que `www.minhaempresa.com.br` abra o meu site so that o link não tenha o nome do app.

**Acceptance Criteria:**
- [ ] `lib/projetos.ts`: `definirDominio(id, dominio | null)` valida hostname (`^[a-z0-9.-]+\.[a-z]{2,}$`, minúsculas, sem esquema nem caminho, único entre projetos) e `projetoDoDominio(host)` (lê o `Host` sem porta; cache em memória de 60 s)
- [ ] `proxy.ts`: **divergência de propósito** registrada em `scripts/padrao-excecoes.json` (`clone-site` → `proxy.ts`: "Domínio personalizado: quando o Host da requisição é o domínio cadastrado em um projeto, a instância serve a versão publicada dele na raiz…"): antes de qualquer outra regra, se `projetoDoDominio(host)` existir e o caminho não começar com `/_next/` nem `/s/`, reescreve (`NextResponse.rewrite`) `/` para `/s/<projetoId>` e qualquer outro caminho para `/s/<projetoId>` também (site de uma página; `?previa=1` não é propagado), sem exigir sessão. O restante do arquivo fica byte a byte igual ao do `pdi-time`
- [ ] Integração opcional **"Hospedagem (Render)"** em `lib/integracoes.ts` (`id: "render"`, campos `RENDER_API_KEY` (secret) e `RENDER_SERVICE_ID` (text, ajuda "Começa com srv-; está no endereço do serviço no painel do Render"), `beneficio: "Cadastra o domínio do site no Render sozinho"`, `testar` chama `GET https://api.render.com/v1/services/{id}` e traduz 401/404)
- [ ] Novo `lib/render.ts`: `cadastrarDominio(dominio)` (`POST /v1/services/{id}/custom-domains`), `estadoDominio(dominio)` (`GET …/custom-domains?name=`) → `{ verificado: boolean, instrucao: "CNAME → <app>.onrender.com" }`; erros traduzidos, nunca corpo cru
- [ ] Rotas `PUT /api/sites/[id]/dominio` (`{ dominio }`; grava e, com a integração conectada, cadastra no Render e devolve o estado) e `DELETE`; `GET` devolve o estado atual (com a integração) ou só as instruções
- [ ] Painel **Domínio** no workspace: campo "Seu domínio" + "Usar este domínio"; abaixo, o passo a passo em três itens (1. No seu provedor de domínio, crie um registro CNAME de `www` apontando para `<host do app>`; 2. No painel de hospedagem, adicione o domínio ao serviço (feito sozinho quando a hospedagem está conectada); 3. Aguarde a verificação — pode levar até 1 h) e o estado ("Aguardando verificação" / "Verificado" / "Hospedagem não conectada: faça o passo 2 à mão"); link "Conectar a hospedagem" para `/setup#render`
- [ ] `README.md` seção "Domínio personalizado": a estratégia (uma instância, vários sites, servindo pelo `Host`), o que o Render exige (plano com domínio próprio), o passo a passo manual, a automação opcional e a alternativa "uma instância por site" (subir outra cópia da imagem apontando `APP_URL` para o domínio)
- [ ] Verificação local: `curl -H "Host: meusite.exemplo.com" http://127.0.0.1:<porta>/` devolve o HTML publicado do projeto com esse domínio; `curl` com outro `Host` continua redirecionando a raiz para `/entrar`; `scripts/verificar-padrao.sh` sai 0 com a exceção aceita

### US-010: Resumo semanal, MCP, documentação, catálogo e verificação final
**Description:** As a mantenedor da suíte, I need o app documentado, com rotina semanal e ferramentas MCP completas, e tudo verificado so that o ciclo feche sem quebrar o padrão.

**Acceptance Criteria:**
- [ ] `lib/rotinas-do-app.ts` registra o tipo `resumo-site` ("Resumo semanal do site", parâmetros `{ projetoId }`, `validar` confere que o projeto existe e está `pronto`) e o executor (`lib/resumo-site.ts`): visitas dos 7 dias, comparação com os 7 anteriores, origem principal, e a primeira sugestão de `lib/sugestoes.ts`; `link` absoluto para `/sites/[id]` via `enderecoPublico()`; `catalogo.json` ganha `"rotina"` em `capacidades`; no painel Métricas, "Receber este resumo toda semana" cria a rotina via `POST /api/rotinas` (semanal, segunda 09:00, canal e destino do formulário) e mostra "Você recebe este resumo às segundas" quando já existe
- [ ] `lib/ferramentas.ts` completo: `criar_site`, `gerar_pagina` (compatível), `editar_pagina` (via agente), `publicar_site`, `metricas_site(id, dias?)`, `listar_sites()`; descrições em português; `components/AcessoMCP.tsx` lista as ferramentas
- [ ] `clone-site/CLAUDE.md` ganha notas (uma por decisão não óbvia): projeto × página (`paginaId`, `versaoPublicada`), imagem apagada só em `pronto`, `encerrarAbandonados`, `/s/` resolvendo slug/id/página antiga, assets em `/s/<projetoId>/a/`, `lib/motor.ts` como único ponto de escolha OpenRouter × ChatGPT (e por que `lib/ai.ts` não muda), agente por trecho, `proxy.ts` com domínio (exceção), métricas sem robôs
- [ ] `README.md` reescrito: a jornada num parágrafo, as telas, os três caminhos de criação, o agente e suas ações, publicar × rascunho, métricas e sugestões, domínio, IA (OpenRouter × ChatGPT), MCP com as ferramentas, tabela completa de variáveis (`IA_PROVEDOR`, `CHATGPT_MODEL`, `RENDER_API_KEY`, `RENDER_SERVICE_ID`, `APP_URL`, mais as atuais), estrutura
- [ ] `catalogo.json`: `clone-site` com `ia` e `integracoes` atualizados ("Lê a captura ou o briefing e escreve o site; um agente edita por conversa, publica e lê as métricas", "IA (OpenRouter ou ChatGPT). Opcional: captura por endereço, hospedagem Render para domínio próprio, avisos"), `capacidades` `["artefato","mcp","rotina"]`, `versao` `"0.2.0"`; `node scripts/gerar-deploy.mjs` roda sem erro
- [ ] Verificação: `npm run lint`, `npx tsc --noEmit`, `npm run build`, `node ../scripts/verificar-jargao.mjs clone-site`, `../scripts/verificar-padrao.sh` (exceções aceitas, sem "exceção sem uso"), `node ../scripts/verificar-paleta.mjs`; standalone em porta livre com conta criada por `curl`: `/api/health`, `/api/status`, criar site por briefing em demonstração, agente, publicar, `/s/<slug>`, métrica registrada, `Host` personalizado; capturas em 1400x900 (início com sites, workspace) e 390 px anexadas ao `progress.txt`

## Functional Requirements

- FR-1. Um projeto tem um estado dentre `rascunho`, `gerando`, `pronto`, `falhou`; transições: `rascunho→gerando`, `falhou→gerando`, `gerando→pronto`, `gerando→falhou`.
- FR-2. `POST /api/sites/[id]/gerar` responde `202` em menos de 1 s; a geração corre fora da requisição; falhas gravam `erro` em português; a imagem some só em `pronto`.
- FR-3. `/s/<slug>` (ou `/s/<id>`) serve a `versaoPublicada` do projeto; edições criam versões novas sem alterar o que está no ar até `publicar`.
- FR-4. Assets são servidos em `/s/<projetoId>/a/<assetId>` com cache de 1 h e tipos restritos (PNG, JPG, WEBP, SVG sem script).
- FR-5. O agente só altera a página por ferramentas (`editar_trecho`, `reescrever_pagina`, `trocar_imagem`) e só publica por `publicar` a pedido explícito; cada alteração é uma versão com a instrução da pessoa.
- FR-6. `lib/motor.ts` é o único ponto que decide entre OpenRouter e ChatGPT para texto e ferramentas; leitura de captura fica no OpenRouter.
- FR-7. Cada `GET /s/<slug>` de HTML registra uma visita (dia, hora, origem, dispositivo), ignorando robôs e `?previa=1`.
- FR-8. Um domínio cadastrado num projeto faz a instância servir a versão publicada dele na raiz para requisições com esse `Host`, sem sessão.
- FR-9. Nenhuma tela mostra jargão técnico; nenhum segredo volta inteiro ao navegador; nenhum arquivo `INFRA` muda além das exceções registradas (`proxy.ts`, `app/api/status/route.ts`).

## Non-Goals

- Vários "pages" por site (site de uma página só nesta rodada; o agente pode criar seções, não páginas novas).
- Editor visual de arrastar e soltar; seleção de elemento na prévia (o screenshot-to-code tem; aqui a conversa cumpre o papel — candidato para a próxima rodada).
- Geração de imagens por IA (Replicate) e extração de assets da captura (o cliente envia os assets).
- Deploy automático de uma nova instância por site (documentado como alternativa; não implementado).
- HTTPS do domínio personalizado (é o Render quem emite o certificado ao verificar o domínio).
- Formulários de contato funcionais no site publicado (sem backend por site nesta rodada).
- Leitura de captura pelo ChatGPT (fica no OpenRouter).

## Design Considerations

- Continua no visual da suíte (`Topbar`, `Hero`, `Passos`, `card`, acento `#792a3f`), sem tornar o app `independente`: nada em `components/ui.tsx` muda; o app acrescenta componentes próprios (`ChatAgente`, `PainelVersoes`, `PainelImagens`, `PainelMetricas`, `PainelDominio`, `ConexaoIA`, `useAvisos`).
- Limites de texto do `PADRAO.md` (título ≤ 8 palavras, apoio ≤ 20, listas ≤ 5 × 6, uma linha de ajuda por campo).
- Chat do agente com o mesmo tom dos apps: respostas curtas, sem código, nomes de ferramentas traduzidos na tela.

## Technical Considerations

- Tabelas novas no mesmo `app.sqlite`: `projetos`, `assets`, `mensagens`, `visitas`. Todas com `CREATE TABLE IF NOT EXISTS` em módulos próprios (`lib/projetos.ts`, `lib/assets.ts`, `lib/agente.ts`, `lib/metricas.ts`), abrindo o banco por `lib/store.ts:abrirBanco()`.
- Geração em segundo plano dentro do processo Next (promessa sem `await`), como `videos-campanha`. Reinício encerra o que estava gerando (P9).
- Ferramentas do agente no formato OpenAI (`{ type: "function", function: { name, description, parameters } }`) para o OpenRouter e `dynamicTools` (`{ type: "function", name, description, inputSchema }`) para o Codex; `lib/motor.ts` converte.
- `proxy.ts` roda no runtime Node (já importa `lib/conta.ts` com `node:sqlite`), então `projetoDoDominio()` pode ler o banco; cache de 60 s para não consultar a cada asset.
- Slug: `nome.normalize("NFD")` sem diacríticos, minúsculas, `[^a-z0-9]+ → -`, 3 a 60 caracteres; palavras reservadas (`a`, `api`, `setup`, `entrar`, `conta`) recebem sufixo.

## Success Metrics

- Criar um site por briefing em demonstração: menos de 6 cliques e menos de 2 minutos até o link.
- Um pedido ao agente ("troque o título") com IA real: uma versão nova via `editar_trecho`, resposta em menos de 30 s com o modelo pago.
- 100% das falhas de geração aparecem em `falhou` com motivo e "Tentar de novo".
- Zero jargão, zero divergência não registrada, `verificar-padrao.sh` saindo 0.

## Open Questions

- Q1. O Render exige plano pago para domínio próprio no serviço? Confirmar na documentação e anotar no README (o app funciona no free sem domínio).
- Q2. Vale registrar visitas também por versão publicada (para comparar versões)? Fica para a próxima rodada; a tabela já guarda `criadoEm`, então dá para cruzar com `versoes[].criadoEm`.
- Q3. Assets acima de 2 MB (vídeos, PDFs): fora nesta rodada.
