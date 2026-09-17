# PRD: Clone de Site — projetos com estado, geração em segundo plano e aviso no cabeçalho

Data: 17/09/2026. Escopo: só o app `clone-site/`. Continua `tasks/prd-novos-apps.md` (US-020 a US-022, nascimento do app) e `tasks/prd-revisao-onboarding-erros-conta.md` (US-034, revisão do app). Origem: feedback de Rafael em 17/09/2026 depois de testar a instância publicada: a geração "não funcionou" sem dizer por quê, a captura não amplia, não dá para sair da tela enquanto gera, e o modelo que lê a captura precisa ser mais forte.

## Introduction

Hoje o Clone de Site gera a página numa única requisição HTTP: o `POST /api/pagina` fica aberto enquanto o modelo escreve até 12.000 tokens, o que leva minutos com o modelo gratuito de visão. Se a aba fecha, a rede oscila ou a conexão cai, o resultado se perde e a tela mostra só "O servidor não respondeu como esperado". O detalhe do erro do provedor vai para o `console.error` do servidor (regra da suíte: sem jargão na tela), mas **nenhuma falha fica registrada em lugar nenhum** — o histórico só grava sucessos. Resultado: a pessoa vê que "não funcionou" e não tem como descobrir o motivo, nem como tentar de novo sem reenviar tudo.

Esta PRD transforma cada página num **projeto** com estado (`Rascunho`, `Gerando`, `Pronto`, `Falhou`), move a geração para segundo plano (a pessoa pode fechar a tela), guarda o motivo de cada falha com um botão "Tentar de novo", avisa no sino do cabeçalho quando um projeto termina, permite ampliar a captura de referência e a prévia, e atualiza a lista de modelos com visão para os atuais do OpenRouter (Claude Sonnet 5 como recomendado pago).

O padrão de "trabalho em segundo plano com estado no SQLite e acompanhamento por consulta periódica" já existe na suíte em `videos-campanha/lib/videos.ts` (`iniciarVideo` dispara sem esperar, `atualizarEstado` é consultado a cada 5 s pela tela, `expirarSePreciso` encerra o que passou do tempo). Esta PRD copia o desenho, não inventa outro.

### Premissas

- P1. `PADRAO.md` continua valendo: Next.js 16, Tailwind 4, React 19, sem biblioteca de UI, `node:sqlite`, IA via OpenRouter, português sem jargão na tela (`verificar-jargao.mjs`), arquivos compartilhados intocados (`verificar-padrao.sh` saindo 0). Nenhuma dependência nova.
- P2. **Um projeto é uma página.** Projeto = nome + marca + referência + a página gerada com suas versões. É o `Pagina` atual ganhando nome, estado e motivo de falha. Agrupar várias páginas num projeto fica fora (Non-Goals).
- P3. **Quatro estados**: `rascunho` (criado, ainda não gerado), `gerando` (em segundo plano), `pronto` (página salva no histórico) e `falhou` (com `erro`, `codigo` e `acao` gravados, no mesmo formato de `ErroIA`). `Falhou` é o estado que resolve o "não consigo ver qual foi o problema".
- P4. **A captura fica guardada até a página ficar pronta.** Em `rascunho`, `gerando` e `falhou` a imagem (data URL, até 5 MB) fica na linha do projeto, para gerar em segundo plano e para "Tentar de novo" sem reenviar. Ao chegar a `pronto` a imagem é apagada da linha. Apagar o projeto apaga a imagem. O texto de privacidade da tela principal é reescrito para dizer exatamente isso.
- P5. **O modelo padrão continua gratuito.** Um modelo pago como padrão cobraria sem escolha explícita, o que fere a regra da suíte ("ações pagas sem confirmação: 0"). Claude Sonnet 5 entra como o pago **recomendado** (destacado no cartão "Qualidade da página gerada" e no aviso "Gerado com o modelo gratuito"), ao lado de Gemini 3.8 Flash (barato), Claude Opus 5 e GPT-6 Astra (topo). Verificado em 17/09/2026 no catálogo público do OpenRouter (`/api/v1/models`, `input_modalities` contém `image`): todos aceitam imagem e devolvem até 128 mil tokens (Gemini: 65 mil).
- P6. `components/ui.tsx` (compartilhado) **não é editado**: o sino já existe na `Topbar` via a prop `notificacoes` (`NotificacaoTopbar { id, texto, url? }`) e nenhum app a usa ainda; este app passa a alimentá-la. Marcar um aviso como visto acontece ao abrir o projeto (a `Topbar` não expõe "abriu o sino").
- P7. **Reinício do servidor encerra o que estava gerando.** Uma promessa em segundo plano morre com o processo (deploy, plano gratuito do Render dormindo). Ao subir (`instrumentation.ts`) todo projeto em `gerando` vira `falhou` com "O servidor reiniciou durante a geração. Tente de novo." E o laço de 60 s já existente marca como `falhou` o que passou de 15 minutos em `gerando`.
- P8. Rotas HTTP mantêm a regra da suíte: `{ error, codigo, acao }` via `respostaErro`, sem status HTTP cru na tela. A rota de `gerar` responde `202` **imediatamente**; ninguém mais espera uma requisição longa.
- P9. `/r/[id]`, `/s/[id]`, `/imprimir/[id]`, as versões (`editar`/`voltar`) e as ferramentas MCP continuam funcionando com o id da página no histórico (`resultados`); o projeto guarda `paginaId` apontando para ele. Nada do que já existe muda de endereço.
- P10. Ordem: US-001 e US-002 são independentes e podem sair primeiro (quick wins). US-003 é a base de dados; US-004, US-005 e US-006 dependem dela, nessa ordem. US-007 e US-008 fecham.

## Goals

- G1. Nenhuma falha de geração fica sem explicação: 100% das falhas (IA, imagem, servidor reiniciado, tempo excedido) viram um projeto em `Falhou` com o motivo em português, o botão de ação (`acao`) quando existir e "Tentar de novo" sem reenviar a captura.
- G2. A pessoa nunca precisa ficar olhando a tela: a rota de gerar responde em menos de 1 s, a geração corre em segundo plano, e fechar a aba ou navegar não perde nada.
- G3. Quem está em outra tela do app sabe que terminou: o sino do cabeçalho mostra o contador de projetos concluídos ou falhados ainda não vistos, em qualquer página do app, em até 15 s depois do término.
- G4. A captura de referência e a prévia gerada abrem em tamanho natural com um clique, no computador e no celular.
- G5. A lista de modelos com visão contém só modelos existentes no OpenRouter em 17/09/2026, com o custo aproximado por página visível, e a resposta cortada ("A página veio pela metade") deixa de acontecer com os modelos pagos (`max_tokens` maior).
- G6. Lint, `tsc`, `next build`, `verificar-jargao.mjs`, `verificar-padrao.sh` e `verificar-paleta.mjs` limpos; nenhum arquivo compartilhado alterado.

## User Stories

### US-001: Ampliar a captura de referência e a prévia gerada
**Description:** As a executivo de marketing, I want abrir a captura que enviei e a página gerada em tamanho natural so that eu compare os dois sem forçar a vista numa miniatura de 88 pixels.

**Acceptance Criteria:**
- [ ] Novo `components/Ampliar.tsx` (próprio do app): `<AmpliarImagem src alt>` renderiza a miniatura como `<button type="button">` com `aria-label="Ampliar a captura de referência"` e abre um `<dialog>` nativo (`showModal()`) ocupando a tela, com a imagem em `<img>` (largura máxima 100%, altura natural, rolagem vertical dentro do diálogo — capturas de página inteira são altas), botão "Fechar" visível, fechamento por Esc e por clique fora
- [ ] As duas miniaturas atuais (`app/page.tsx`, 76x52, abaixo da zona de arraste; `components/PreviaPagina.tsx`, 88x58, "Referência") passam a usar `AmpliarImagem`; a `figcaption` "Referência" continua
- [ ] `components/PreviaPagina.tsx` ganha o botão "Abrir em tela cheia" ao lado do alternador Computador/Celular: abre um `<dialog>` de tela cheia com o mesmo `<iframe sandbox="allow-scripts" srcDoc>` da prévia, altura `100vh` menos a barra de fechar; no celular o alternador continua oculto mas o botão aparece
- [ ] `<dialog>` estilizado em `app/globals.css` (`::backdrop` escurecido, `prefers-reduced-motion` respeitado); nenhum `window.open` nem nova aba
- [ ] Lint, `tsc --noEmit`, `verificar-jargao.mjs` passam; verificar no navegador em 1400x900 e 390 px (captura de exemplo aberta, rolada até o fim e fechada por Esc)

### US-002: Modelos com visão atuais e sem resposta cortada
**Description:** As a executivo, I want escolher um modelo forte para ler a captura e saber quanto ele custa por página so that a página saia fiel à referência e eu não seja surpreendido pela conta.

**Acceptance Criteria:**
- [ ] `lib/modelos.ts`, `MODELOS_VISAO` atualizada (ordem e rótulos exatos): `inclusionai/ling-3.0-flash-vl:free` "Ling 3.0 Flash VL (gratuito, padrão)", `nex-agi/nex-n2.5-pro:free` "Nex N2.5 Pro (gratuito)", `anthropic/claude-sonnet-5` "Claude Sonnet 5 (pago, recomendado · cerca de US$ 0,10 por página)", `google/gemini-3.8-flash` "Gemini 3.8 Flash (pago, econômico · cerca de US$ 0,04 por página)", `anthropic/claude-opus-5` "Claude Opus 5 (pago, mais fiel · cerca de US$ 0,26 por página)", `openai/gpt-6-astra` "GPT-6 Astra (pago, topo · cerca de US$ 0,53 por página)"; `anthropic/claude-sonnet-4.5` sai da lista. `Opcao.grupo` preenchido (`gratuito`/`recomendado`/`pago`) e `components/QualidadePagina.tsx` agrupa o `<select>` em `<optgroup>` "Gratuitos", "Recomendado", "Outros pagos"
- [ ] `Opcao` ganha `maxSaida?: number` (tokens): 12.000 para os gratuitos, 32.000 para os pagos; `lib/gerador.ts:gerarPagina` e `editarPagina` passam `maxTokens` do modelo em uso em vez do `12000` fixo (a saída real é cobrada só pelo que o modelo produz)
- [ ] `app/api/visao/route.ts` (`GET`) devolve, além de `opcoes`, a lista dinâmica quando há chave: busca `https://openrouter.ai/api/v1/models`, filtra `architecture.input_modalities` contendo `"image"` e `id` sem `:batch`, e **confirma que cada modelo da lista estática ainda existe** (o que sumiu é devolvido com `indisponivel: true` e o cartão mostra "não está mais disponível" no rótulo). Sem chave ou com falha de rede, devolve a estática. A função `confirmarModelosVisao(chave)` mora em `lib/modelos-visao.ts` (próprio do app, com `fetch`, sem `node:*`), nunca em `lib/setup-comum.ts`, que é compartilhado
- [ ] O aviso "Gerado com o modelo gratuito" (`app/page.tsx`, `Resultado`) passa a citar o recomendado: "Gerado com o modelo gratuito. Para uma página mais fiel, troque para o Claude Sonnet 5 (cerca de US$ 0,10 por página)." com o mesmo link para `/setup#qualidade-da-pagina`
- [ ] O cartão "Qualidade da página gerada" mostra, abaixo do seletor, uma linha "Custo estimado por página: gratuito / cerca de US$ X" que muda com a escolha; a frase "Sem escolha própria, o app usa o primeiro da lista." continua
- [ ] `lib/ai.ts:interpretarFalha` já cobre 402/404; nenhuma mudança em arquivo compartilhado. `README.md` seção "Como a página é gerada" cita os modelos e os custos aproximados
- [ ] Lint, `tsc --noEmit`, `verificar-jargao.mjs` passam; verificar no navegador que os seis modelos aparecem agrupados e que "Testar leitura de imagem" funciona com o modelo escolhido

### US-003: Projeto com estado no banco e geração em segundo plano
**Description:** As a desenvolvedor, I need guardar cada pedido como um projeto com estado e rodar a geração fora da requisição HTTP so that nenhuma falha se perca e ninguém precise manter a aba aberta.

**Acceptance Criteria:**
- [ ] `lib/types.ts`: `EstadoProjeto = "rascunho" | "gerando" | "pronto" | "falhou"`; `Projeto { id, nome, estado, stack, instrucoes?, marca?, tamanhoImagem, paginaId?: string, erro?: { mensagem, codigo?, acao? }, criadoEm, atualizadoEm, terminadoEm?, vistoEm? }` (a imagem **não** faz parte do tipo devolvido às telas)
- [ ] Novo `lib/projetos.ts` (próprio do app, mesmo arquivo SQLite de `lib/store.ts`, `CREATE TABLE IF NOT EXISTS projetos` com as colunas acima mais `imagem TEXT NULL`): `criar({ nome, stack, instrucoes, marca, imagem })` valida com `validarImagem`/`normalizarMarca` de `lib/gerador.ts` e grava em `rascunho`; `obter(id)`, `listar({ estado?, limite = 50 })` (sem a coluna `imagem`), `renomear(id, nome)`, `apagar(id)`; `marcarVisto(id)`; `imagemDe(id)` (uso interno)
- [ ] `iniciarGeracao(id)`: só de `rascunho` ou `falhou`; muda para `gerando` (`atualizadoEm` agora, `erro` limpo) e chama `executarGeracao(id)` **sem `await`** (mesmo padrão de `videos-campanha/lib/videos.ts:iniciarVideo`), devolvendo o projeto já em `gerando`. `executarGeracao` chama `gerarPagina` de `lib/gerador.ts` com a imagem lida do banco; em sucesso grava `estado: "pronto"`, `paginaId`, `terminadoEm` e **apaga `imagem`** (`UPDATE ... SET imagem = NULL`); em falha grava `estado: "falhou"`, `erro` (`mensagem`/`codigo`/`acao` de `ErroIA`, ou só a mensagem de `Error`; nunca texto cru do provedor), `terminadoEm`, e **mantém a imagem** para "Tentar de novo"
- [ ] `encerrarAbandonados()`: marca `falhou` com "O servidor reiniciou durante a geração. Tente de novo." todo `gerando` (chamado uma vez em `instrumentation.ts:register()` na subida) e, no laço de 60 s já existente, todo `gerando` com `atualizadoEm` há mais de 15 minutos com "A geração passou de 15 minutos e foi encerrada. Tente de novo ou escolha um modelo mais rápido." (`acao` = `ACAO_ESCOLHER_MODELO`)
- [ ] Rotas novas: `POST /api/projetos` (cria `rascunho`, corpo igual ao `POST /api/pagina` atual mais `nome`; devolve `201` com o projeto); `POST /api/projetos/[id]/gerar` (chama `iniciarGeracao`, devolve `202` com o projeto em `gerando`; `409` com "Este projeto já está sendo gerado." quando já está em `gerando`); `GET /api/projetos/[id]`; `GET /api/projetos?estado=` (lista); `PATCH /api/projetos/[id]` (`nome`; `marca`/`instrucoes`/`stack` só em `rascunho` ou `falhou`); `DELETE /api/projetos/[id]` (apaga o projeto e, se `paginaId`, também a página do histórico); `POST /api/projetos/[id]/visto`. Erros pelo padrão `respostaErro`/`ErroDePedido`/`404`
- [ ] `POST /api/pagina` continua existindo por compatibilidade, mas passa a **criar o projeto, gerar em segundo plano e aguardar** internamente (`await` num laço curto sobre `obter(id)` até sair de `gerando`, ou uma promessa devolvida por `executarGeracao`), devolvendo a mesma resposta de hoje; a ferramenta MCP `gerar_pagina` (`lib/ferramentas.ts`) faz o mesmo, e passa a devolver também `projetoId`. Assim toda página, venha da tela ou do assistente, aparece na lista de projetos
- [ ] `lib/demo.ts`: em modo demonstração `executarGeracao` mantém o `esperar(1400)` atual para o estado `gerando` ser visível na tela
- [ ] Teste por `curl` documentado no `README.md`: criar, gerar (202 em menos de 1 s), consultar até `pronto`, confirmar `imagem IS NULL` via `sqlite3`; forçar falha (chave inválida) e confirmar `estado = 'falhou'` com `erro.mensagem` preenchida e imagem mantida; matar o `next dev` durante `gerando` e confirmar `falhou` "O servidor reiniciou..." ao subir de novo
- [ ] Lint, `tsc --noEmit` passam; `verificar-padrao.sh` sai 0 (nenhum arquivo da lista `ARQUIVOS` alterado)

### US-004: Tela principal por projeto: gerar sem esperar, ver o motivo da falha, tentar de novo
**Description:** As a executivo de marketing, I want criar um projeto, mandar gerar e poder sair da tela so that eu volte depois e encontre a página pronta ou o motivo exato de não ter saído.

**Acceptance Criteria:**
- [ ] `app/page.tsx`: o cartão "A sua marca" ganha o campo "Nome do projeto" (obrigatório, `placeholder` "Ex.: Landing de lançamento", pré-preenchido com o nome da marca quando a pessoa digita a marca antes) como primeiro campo; o botão continua "Gerar a página"
- [ ] Ao enviar: `POST /api/projetos` e em seguida `POST /api/projetos/[id]/gerar`; a tela entra no estado `carregando` **sem esperar a geração** e passa a consultar `GET /api/projetos/[id]` a cada 5 s (`INTERVALO_ACOMPANHAMENTO_MS`, mesmo desenho do `useEffect` de `videos-campanha/app/page.tsx`), parando em `pronto` ou `falhou`
- [ ] Estado `Gerando` no `Stage`: `Loading` com as etapas atuais, mais a linha "Gerando há X min Y s" (contador real, não estimativa) e o aviso "Você pode fechar esta tela ou ir para outra parte do app: avisamos no sino quando terminar." O `?exemplo=1` e "Usar uma referência de exemplo" seguem o mesmo caminho (criam um projeto chamado "Exemplo · Nimbus Finanças")
- [ ] Estado `Pronto`: a rota `GET /api/projetos/[id]` devolve, quando `pronto`, também `pagina` e `meta` (lidas do histórico por `paginaId`), e a tela monta `Resultado` sem segunda chamada. A miniatura "Referência" em `PreviaPagina` só aparece enquanto a tela ainda tem a captura em memória (mesma sessão em que foi enviada); depois de recarregar, ela não existe mais, porque a imagem foi apagada do servidor ao ficar `pronto` (P4)
- [ ] Estado `Falhou`: `ErrorBox` com `erro.mensagem`, `erro.codigo` e `erro.acao` do projeto (mesmos botões de hoje: ação, "Usar um modelo gratuito" quando couber) e **"Tentar de novo"** chamando `POST /api/projetos/[id]/gerar` (a captura já está guardada; nada é reenviado); um link "Ajustar o pedido" volta o formulário preenchido com `nome`/`marca`/`instrucoes`/`stack` do projeto (via `PATCH` ao gerar de novo)
- [ ] Ao abrir a tela principal com um projeto em `gerando` (recarregou a página, voltou de outra tela): o `Stage` retoma o acompanhamento desse projeto automaticamente (o mais recente em `gerando`), em vez de mostrar "O que você vai receber"
- [ ] "Últimos resultados" vira **"Meus projetos"** no mesmo cartão: as 3 mais recentes linhas com `Chip` de estado ("Rascunho" cinza, "Gerando" com o ponto pulsante já usado no chip de status, "Pronto" verde, "Falhou" vermelho), nome, data e link (`/projetos/[id]`); "Ver todos" aponta para `/projetos`; "Apagar tudo" apaga projetos e páginas
- [ ] Texto de `Privacidade` reescrito: "A captura fica guardada só até a página ficar pronta, e é apagada em seguida. Se a geração falhar, ela permanece para você tentar de novo, até você apagar o projeto. O código gerado fica neste app até você apagar."
- [ ] Lint, `tsc --noEmit`, `verificar-jargao.mjs` passam; verificar no navegador: (a) gerar o exemplo, trocar para `/setup` durante o `gerando`, voltar e ver o `Stage` retomar; (b) com chave inválida, ver o `Falhou` com motivo e "Tentar de novo"; (c) 1400x900 e 390 px

### US-005: Lista de projetos e página do projeto
**Description:** As a executivo, I want ver todos os meus projetos por estado e abrir qualquer um so that eu retome um rascunho, releia o motivo de uma falha ou reabra uma página pronta.

**Acceptance Criteria:**
- [ ] Nova `app/projetos/page.tsx` ("Meus projetos"): `Topbar` com `navegacao={[...NAVEGACAO, { rotulo: "Projetos", href: "/projetos" }]}` (mesmo `navegacao` passado nas outras telas do app: `app/page.tsx`, `app/historico/page.tsx`, `app/setup/page.tsx` e `app/r/[id]/page.tsx`, para o destino aparecer sempre); filtro por estado em chips clicáveis ("Todos", "Rascunho", "Gerando", "Pronto", "Falhou") persistido em `?estado=`; `DataTable` de `ui.tsx` (`titulo` nome, `resumo` marca e formato, `chip` estado, `detalhe` data); `Empty` quando não há nenhum, com ação "Criar o primeiro projeto"
- [ ] Nova `app/projetos/[id]/page.tsx` (Client Component com consulta a cada 5 s enquanto `gerando`): cabeçalho com nome editável em linha (`PATCH`), chip de estado, data de criação e término; corpo por estado: `rascunho` → botão "Gerar a página" e "Editar o pedido" (abre a tela principal com `?projeto=<id>`, que carrega o formulário preenchido); `gerando` → mesmo bloco da US-004; `falhou` → `ErrorBox` + "Tentar de novo" + "Editar o pedido"; `pronto` → o `Resultado` completo (prévia, entrega, versões), igual a `/r/[paginaId]`. Ao abrir a página chama `POST /api/projetos/[id]/visto`
- [ ] Botão "Apagar projeto" com `window.confirm` (padrão já usado em "Apagar tudo"), apagando também a página publicada (`/s/[paginaId]` passa a responder 404 amigável, comportamento que já existe)
- [ ] `app/historico/page.tsx` não muda (continua listando `resultados`; é arquivo de `ESTRUTURA` do padrão)
- [ ] Lint, `tsc --noEmit`, `verificar-jargao.mjs` passam; verificar no navegador em 1400x900 e 390 px com pelo menos um projeto em cada estado

### US-006: Aviso no sino do cabeçalho quando um projeto termina
**Description:** As a executivo, I want ser avisado no cabeçalho, em qualquer tela do app, quando um projeto fica pronto ou falha so that eu não precise voltar à tela inicial para conferir.

**Acceptance Criteria:**
- [ ] `GET /api/projetos/avisos`: projetos em `pronto` ou `falhou` com `vistoEm IS NULL`, mais recentes primeiro, até 10, no formato `NotificacaoTopbar { id, texto, url }`: texto "«Nome» está pronta." ou "«Nome» não pôde ser gerada: <motivo curto>."; `url` = `/projetos/[id]`
- [ ] Novo `components/useAvisos.ts` (próprio do app): hook que consulta a rota ao montar e a cada 15 s (`setInterval`, limpo no unmount; pausa quando `document.hidden`), devolvendo a lista; usado em **todas** as telas que renderizam `Topbar` neste app (`app/page.tsx`, `app/historico/page.tsx`, `app/setup/page.tsx`, `app/projetos/**`, `app/r/[id]/page.tsx` via um wrapper client pequeno), passando `notificacoes={avisos}`
- [ ] Abrir `/projetos/[id]` marca visto (US-005) e o contador cai na próxima consulta; na tela principal, ao acompanhar um projeto até `pronto`/`falhou` com a aba aberta, a própria tela chama `visto` (a pessoa já está vendo o resultado; não faz sentido avisar)
- [ ] `document.title` ganha o prefixo "(N) " com o número de avisos não vistos enquanto houver algum (sinal para quem deixou a aba em segundo plano)
- [ ] Nenhuma alteração em `components/ui.tsx`; `verificar-padrao.sh` sai 0
- [ ] Lint, `tsc --noEmit`, `verificar-jargao.mjs` passam; verificar no navegador: gerar em uma aba, ficar em `/setup` em outra, ver o contador aparecer em até 15 s, clicar no aviso, cair em `/projetos/[id]` e ver o contador zerar

### US-007: Aviso por e-mail ou Slack ao terminar (opcional, usa a integração Notificações)
**Description:** As a executivo, I want receber um e-mail ou mensagem no Slack quando a página ficar pronta so that eu feche o app e volte só quando houver o que ver.

**Acceptance Criteria:**
- [ ] `lib/integracoes.ts` passa a declarar `NOTIFICACOES` (de `lib/setup-comum.ts`, já existente e genérica) como integração opcional, `beneficio: "Avisa por e-mail ou Slack quando uma página fica pronta"`; o cartão aparece em `/setup` e no popover "Faz mais com..." sem mais nada a fazer
- [ ] `lib/projetos.ts:executarGeracao`, ao gravar `pronto` ou `falhou`, chama `enviar()` de `lib/notificacoes.ts` **só quando** a integração está configurada (`integracaoConfigurada(NOTIFICACOES)`), com `titulo` "Página pronta: «Nome»" ou "A página «Nome» não pôde ser gerada", `texto` com uma linha de resumo e `link` absoluto `${getConfig("APP_URL") || "http://localhost:3000"}/projetos/<id>` (mesma regra de link absoluto de `lib/rotinas.ts`); falha no envio vai para `console.error` e **não** altera o estado do projeto
- [ ] `README.md` seção nova "Avisos ao terminar" (sino sempre; e-mail/Slack quando configurado)
- [ ] Lint, `tsc --noEmit` passam; verificar com um webhook do Slack de teste (ou `NOTIFICACOES_CANAL=email` com Resend) que uma mensagem chega com o link correto

### US-008: Documentação, catálogo e verificação final
**Description:** As a mantenedor da suíte, I need o app documentado e verificado so that as decisões desta PRD fiquem registradas e nada do padrão tenha quebrado.

**Acceptance Criteria:**
- [ ] `clone-site/CLAUDE.md` ganha notas no formato atual (uma por decisão não óbvia): projeto x página (`paginaId`), imagem apagada só em `pronto`, `encerrarAbandonados` na subida e no laço de 60 s, `POST /api/pagina`/MCP aguardando em cima do projeto, o sino alimentado via prop sem tocar `ui.tsx`, `maxSaida` por modelo
- [ ] `README.md`: seções "Projetos e estados", "Geração em segundo plano" (com os `curl` da US-003), "Avisos ao terminar", modelos e custos atualizados; "Estrutura" cita os arquivos novos
- [ ] `catalogo.json`: `problema`/`ia` do `clone-site` inalterados; `integracoes` passa a citar "Opcional: serviço de captura por endereço e avisos por e-mail ou Slack"; captura `capturas/clone-site.png` refeita em 1400x900 com a lista "Meus projetos" visível
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build`, `node ../scripts/verificar-jargao.mjs`, `../scripts/verificar-padrao.sh` e `node ../scripts/verificar-paleta.mjs` limpos; `git status` sem arquivo compartilhado modificado
- [ ] Capturas de verificação (desktop 1400x900 vazio, `?exemplo=1` em `gerando` e em `pronto`, `/projetos` com quatro estados, celular 390 px) anexadas ao commit da história

## Functional Requirements

- FR-1. Um projeto tem exatamente um estado dentre `rascunho`, `gerando`, `pronto`, `falhou`, e as transições permitidas são: `rascunho → gerando`, `falhou → gerando`, `gerando → pronto`, `gerando → falhou`. Nenhuma outra.
- FR-2. `POST /api/projetos/[id]/gerar` responde `202` em menos de 1 segundo, com o projeto já em `gerando`; a geração corre fora da requisição.
- FR-3. Toda falha em `executarGeracao` grava `erro.mensagem` em português (nunca o corpo do provedor), `erro.codigo` (`CodigoErroIA` quando vier de `ErroIA`) e `erro.acao` (`{ rotulo, url }` quando houver), e mantém a imagem guardada.
- FR-4. Ao entrar em `pronto`, a coluna `imagem` do projeto é zerada na mesma transação em que `paginaId` é gravado.
- FR-5. Na subida do processo, todo projeto em `gerando` vira `falhou` com "O servidor reiniciou durante a geração. Tente de novo."; a cada 60 s, todo `gerando` com `atualizadoEm` há mais de 15 minutos vira `falhou` com a mensagem de tempo excedido.
- FR-6. `GET /api/projetos/[id]` devolve o projeto sem a imagem; quando `pronto`, inclui `pagina` e `meta` lidas do histórico.
- FR-7. A tela principal consulta `GET /api/projetos/[id]` a cada 5 s enquanto o projeto acompanhado estiver em `gerando`, e retoma o acompanhamento do `gerando` mais recente ao ser aberta.
- FR-8. "Tentar de novo" em `falhou` chama só `POST /api/projetos/[id]/gerar`; nenhum dado é reenviado pelo navegador.
- FR-9. `GET /api/projetos/avisos` devolve até 10 projetos em `pronto`/`falhou` com `vistoEm` nulo no formato `NotificacaoTopbar`; abrir `/projetos/[id]` ou terminar o acompanhamento na tela principal marca `vistoEm`.
- FR-10. `MODELOS_VISAO` contém só modelos confirmados no catálogo do OpenRouter em 17/09/2026; cada opção tem `maxSaida` e, para os pagos, o custo aproximado por página no rótulo; o padrão sem escolha continua sendo o primeiro gratuito.
- FR-11. `gerarPagina` e `editarPagina` usam `maxSaida` do modelo em uso como `max_tokens`.
- FR-12. As miniaturas da captura e a prévia gerada abrem em `<dialog>` de tela cheia com fechamento por botão, Esc e clique fora.
- FR-13. `POST /api/pagina` e a ferramenta MCP `gerar_pagina` criam um projeto e aguardam o término antes de responder, devolvendo o mesmo formato de hoje mais `projetoId`.
- FR-14. `DELETE /api/projetos/[id]` apaga o projeto, a imagem e, quando houver, a página do histórico apontada por `paginaId`.
- FR-15. Nenhum arquivo da lista `ARQUIVOS` de `scripts/verificar-padrao.sh` é alterado.

## Non-Goals

- Vários "páginas" por projeto (home, preços, contato) com a mesma marca: fora. Um projeto é uma página (P2).
- **Edição por instrução em segundo plano.** `POST /api/pagina/[id]/editar` continua síncrono. É o mesmo problema (até 12.000 tokens numa requisição), mas a edição parte de HTML já existente e costuma ser mais rápida; entra numa PRD seguinte reaproveitando `lib/projetos.ts` (ver Open Questions).
- Fila com limite de simultaneidade, prioridade ou cancelamento de uma geração em andamento. Várias gerações ao mesmo tempo são permitidas; cada uma é uma chamada independente ao OpenRouter.
- Compartilhar projetos entre contas, permissões, comentários. A instância continua com uma conta de administrador (PRD de 15/09/2026, P3).
- Marcar avisos como vistos pelo próprio sino ("Marcar todos como lidos"): exigiria editar `components/ui.tsx` (compartilhado). Visto acontece ao abrir o projeto.
- Guardar a captura para sempre (ampliar depois de pronto, comparar lado a lado com a página gerada): decidido em 17/09/2026 que a imagem é apagada em `pronto`.
- Streaming da resposta do modelo para mostrar a página "se desenhando": fora; o acompanhamento é por estado.
- Lista de modelos de texto (`MODELOS_GRATUITOS`, `lib/modelos.ts`, compartilhada) e o `DEFAULT_MODEL` de `lib/ai.ts`: intocados.

## Design Considerations

- Reaproveitar sem criar componente novo de tabela: `DataTable`, `Chip`, `Empty`, `ErrorBox`, `Loading`, `Aviso`, `MaisDetalhes` e `Topbar` (com `notificacoes` e `navegacao`) de `components/ui.tsx`.
- Estados na tela, sempre nestas palavras: "Rascunho", "Gerando", "Pronto", "Falhou". Nunca "draft", "in progress", "done", "status" ou "job" em texto visível (`verificar-jargao.mjs`). No código, `estado`, nunca `status`, para não confundir com o `Status` da `Topbar`.
- Cor dos chips de estado a partir dos tons já existentes (`--ok`, `--warn`, `--danger`, cinza de `text-muted`); "Gerando" reaproveita o ponto pulsante do `chip-status`.
- O `Stage` em `gerando` deve caber sem rolagem em 1400x900 junto com o formulário (regra da US-034: botão primário visível sem rolar).
- O `<dialog>` de ampliar é o primeiro modal nativo do app; seguir a nota da US-052 (`pdi-time`): montar condicionalmente (`{aberto && <dialog>}`) para nascer limpo, sem `useEffect` de reset.
- Textos-modelo dos avisos (P6): "«Landing de lançamento» está pronta." / "«Landing de lançamento» não pôde ser gerada: a página veio pela metade." — sempre nome do projeto entre aspas angulares e ponto final.

## Technical Considerations

- **Promessa não aguardada numa rota do Next em Node standalone** continua rodando depois da resposta (não há `waitUntil` de serverless a respeitar; `videos-campanha` já depende disso). Alternativa equivalente: `after()` de `next/server` (Next 16); escolher uma e registrar em `CLAUDE.md`.
- **Plano gratuito do Render** dorme após 15 minutos sem tráfego: uma geração de 2 a 5 minutos termina antes; a consulta a cada 5 s da aba aberta mantém a instância acordada. Se o processo cair mesmo assim, P7 cobre com `falhou` na subida. O disco efêmero já é uma limitação conhecida (P6 da PRD de 15/09/2026).
- **Tamanho no SQLite**: até 5 MB por projeto enquanto não `pronto`. Com o disco efêmero do plano gratuito e imagem apagada em `pronto`, o crescimento é limitado ao número de rascunhos e falhas acumuladas; `DELETE /api/projetos/[id]` e "Apagar tudo" liberam.
- **Custo por página** no rótulo é uma estimativa (cerca de 2,6 mil tokens de entrada com a imagem e o prompt, 10 mil de saída) e diz "cerca de"; o `README.md` explica a conta.
- **`max_tokens` maior não custa mais** por si só: a cobrança é pela saída produzida; o valor só evita cortar uma página longa. Nos gratuitos fica 12.000 porque alguns provedores rejeitam valores acima do limite deles.
- **`GET /api/projetos/avisos` a cada 15 s em todas as telas** é uma consulta SQL trivial; pausar quando `document.hidden` evita gasto em abas esquecidas.
- **`app/r/[id]/page.tsx` é Server Component** e a `Topbar` precisa de `notificacoes` vindas de um hook client: envolver num componente client pequeno (`components/TopbarComAvisos.tsx`) que chama `useAvisos()` e renderiza `Topbar`; as outras telas já são client.
- `lib/projetos.ts` importa `lib/gerador.ts` (que importa `lib/historico.ts`, `node:sqlite`): nunca importar `lib/projetos.ts` de um Client Component; tipos vêm de `lib/types.ts` (nota já existente no `CLAUDE.md` do app).

## Success Metrics

| Métrica | Meta |
|---|---|
| Falhas de geração registradas com motivo em português | 100% (nenhum `falhou` com `erro` vazio) |
| Tempo de resposta de `POST /api/projetos/[id]/gerar` | < 1 s |
| Projetos presos em `gerando` após reinício do servidor | 0 (todos viram `falhou` na subida) |
| Aviso no sino após término, com aba em outra tela | ≤ 15 s |
| Textos crus do provedor, códigos HTTP ou "token"/"status" na tela | 0 (`verificar-jargao.mjs` limpo) |
| Modelos da lista de visão inexistentes no OpenRouter | 0 na data da história |
| "A página veio pela metade" com Claude Sonnet 5 na captura de exemplo | 0 em 5 gerações |
| Arquivos compartilhados alterados | 0 (`verificar-padrao.sh` sai 0) |
| Dependências novas | 0 |

## Open Questions

1. **Edição em segundo plano** (Non-Goal aqui): entra numa PRD seguinte como "toda edição vira uma tarefa do projeto" reaproveitando `lib/projetos.ts`? Ou basta guardar a falha da edição numa lista "Tentativas" do projeto sem sair da requisição síncrona?
2. **Imagem em `falhou` para sempre**: a PRD mantém a captura enquanto o projeto estiver em `falhou` (para "Tentar de novo"). Deve haver um prazo (ex.: apagar depois de 7 dias em `falhou`) ou só quando a pessoa apagar o projeto?
3. **MCP síncrono em cima do projeto** (FR-13): assistentes como o Claude esperam a resposta; manter síncrono é o esperado. Alternativa: `gerar_pagina` devolve `projetoId` em `gerando` e uma nova ferramenta `consultar_projeto` acompanha. A PRD assume síncrono; decidir se a ferramenta de consulta vale a história extra.
4. **Lista dinâmica de modelos de visão** (US-002): devolver os 270+ modelos com imagem do OpenRouter no `<select>` ou só confirmar a existência dos seis da lista estática? A PRD assume só confirmar (lista curta, rótulos com custo escritos à mão).
5. **Limite de simultaneidade**: sem limite (assumido). Se o plano gratuito do OpenRouter rejeitar chamadas paralelas (429 "fila cheia"), considerar processar um por vez como `videos-campanha` (`VideoEmAndamento`).
6. **Navegação "Projetos"**: entra como quarto destino do cabeçalho (assumido) ou substitui "Histórico" neste app, já que todo resultado passa a ser um projeto? Manter os dois evita divergir do padrão da suíte, mas "Histórico" e "Projetos" mostram quase a mesma coisa.
