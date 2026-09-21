# Clone de Site

Transforme a captura de uma página de referência em uma página sua, em HTML, com o nome e as cores da sua marca. Área: Marketing e Produto.

## O que resolve
Montar uma página nova do zero leva semanas entre briefing, agência e ajustes. Este app recebe a captura (PNG ou JPG, até 5 MB) de uma página que o executivo gosta e devolve, em minutos, a versão dele: um único arquivo HTML em português, com a estrutura da referência, os textos reescritos para a marca informada e as imagens de terceiros trocadas por blocos na cor da marca (com texto alternativo). A prévia aparece em tamanho de computador e de celular (390 px), com o código pronto para copiar. Sem chave de IA, o app devolve uma landing fictícia completa (Nimbus Finanças) rotulada como demonstração.

Aviso mostrado abaixo de toda prévia: use a referência pela estrutura. Textos, marcas e imagens de terceiros são protegidos; troque pelo conteúdo da sua empresa.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com um modelo de visão (a captura é enviada junto com o prompt por `askVision`, em `lib/ai.ts`). O prompt de sistema (`lib/gerador.ts`) foi portado e traduzido do projeto aberto screenshot-to-code, adaptado para um arquivo HTML único, textos em português e imagens substituídas por blocos.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave. O modelo que lê a captura tem cartão próprio, "Qualidade da página gerada", com o botão "Testar leitura de imagem" (manda um PNG mínimo ao modelo escolhido e mostra o que ele respondeu). O cartão opcional "Captura por endereço" guarda a chave de um serviço de captura (ScreenshotOne), que permite colar o endereço de um site em vez de enviar a imagem. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar um modelo com visão, o app roda em modo demonstração.

## OpenRouter ou ChatGPT
O motor que escreve e edita os sites é escolhido no cartão "Motor de inteligência artificial" de `/setup#ia` (`components/ConexaoIA.tsx`, `app/api/ia/route.ts`, config `IA_PROVEDOR`):
- **OpenRouter (padrão)**: a chave do cartão "Inteligência artificial" (OAuth em um clique ou colada). É também o único caminho para **ler capturas** (`askVision`).
- **ChatGPT (assinatura)**: login por código de dispositivo pelo Codex App Server oficial (`lib/chatgpt.ts`, `@openai/codex` fixado em `0.155.1`, o mesmo do Build Agentflows). A sessão fica em `DATA_DIR/chatgpt`, sem herdar credenciais da máquina, sem terminal, arquivos ou navegador. Texto (criação pelo briefing, edições, agente, sugestões) e ferramentas passam por ele; o modelo é escolhido no próprio cartão (`CHATGPT_MODEL`).

`lib/motor.ts` é o único ponto que decide entre os dois (`gerarTexto`, `gerarJSON`, `executarComFerramentas`, `iaDisponivel`); `lib/ai.ts` continua o da suíte. Com o ChatGPT escolhido e sem chave do OpenRouter, clonar por captura cai em demonstração e a tela avisa para conectar também o OpenRouter.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para carregar a captura de exemplo (`public/exemplo-referencia.png`), preencher a marca e gerar a página sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3015
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/clone-site:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-clone-site (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3015:10000 -v clone-site-dados:/app/data ghcr.io/startse/clone-site:latest` e abra http://localhost:3015.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Como a página é gerada
1. O navegador lê a captura como data URL e envia em `POST /api/pagina` com `stack` (`html-tailwind` ou `html-css`), `instrucoes` e `marca` (`nome`, `corPrimaria`, `corSecundaria`, cores em `#RRGGBB`).
2. `lib/gerador.ts` valida a imagem (PNG/JPG, até 5 MB), monta o prompt e chama o modelo de visão. Da resposta, recorta o trecho `<html>...</html>` (exige `<body>` aberto e fechado) e sanitiza: remove todo `<script>` que não seja o Tailwind pela CDN (no formato CSS, remove todos), `iframe`/`object`/`embed`/`base`, atributos `on*` e links `javascript:`.
3. A página é salva no histórico (tipo `pagina`) sem a captura: só formato, instruções, marca e o tamanho da imagem. O resultado abre em `/r/<id>`; "Publicar link" mostra o endereço público `/s/<id>`, que serve a versão atual como HTML puro (sem indexação por buscadores, sem cache e com uma política de segurança de conteúdo que só libera Tailwind pela CDN, fontes do Google e imagens). "Mais" traz "Baixar HTML" e "Copiar código".

A prévia é um `<iframe sandbox="allow-scripts" srcDoc=...>`: o HTML gerado roda numa origem opaca, sem acesso a cookies, armazenamento nem ao próprio app. `allow-scripts` é necessário porque o Tailwind pela CDN é um script; sem ele, o formato Tailwind apareceria sem estilo.

## Sites: projetos com estado, geração em segundo plano e link por slug
Desde 20/09/2026 toda página nasce como um **site** (`lib/projetos.ts`, tabela `projetos` no mesmo `app.sqlite`): nome, marca, origem (`referencia` ou `briefing`), estado (`rascunho` → `gerando` → `pronto` | `falhou`; `falhou` → `gerando` em "Tentar de novo") e um `slug` legível, único na instância, derivado do nome (`clinica-sao-lucas`, `clinica-sao-lucas-2`…). A página com as versões continua no histórico (`resultados`, tipo `pagina`); o site guarda `paginaId` e `versaoPublicada`.

- A geração corre **em segundo plano**: `POST /api/sites/<id>/gerar` responde `202` na hora e a tela consulta `GET /api/sites/<id>` a cada 5 s. Fechar a aba não perde nada.
- A captura fica guardada na linha do site só até `pronto` (para gerar sem a aba aberta e para "Tentar de novo" sem reenviar) e é apagada em seguida. Em `falhou` ela permanece, com o motivo em português (`erro.mensagem`, `erro.codigo`, `erro.acao`), até a pessoa apagar o site.
- Na subida do servidor, todo site em `gerando` vira `falhou` ("O servidor reiniciou durante a geração"); a cada 60 s, quem passou de 15 minutos em `gerando` também.
- `/s/<slug>` (ou `/s/<id>`) serve a **versão publicada** (`POST /api/sites/<id>/publicar` com `{ n }`; a versão 1 é publicada sozinha ao ficar pronto). Edições criam versões novas sem mexer no que está no ar até a próxima publicação. Um id de página antigo, sem site, continua servindo a última versão.
- `POST /api/pagina` e a ferramenta MCP `gerar_pagina` continuam existindo: criam o site, geram e esperam o fim, devolvendo também `projetoId` e `slug`.

Rotas: `POST /api/sites` (cria; `gerar: true` já dispara), `GET /api/sites?estado=`, `GET|PATCH|DELETE /api/sites/<id>` (`PATCH`: `nome`, `slug`; `marca`/`instrucoes`/`briefing`/`stack` só em `rascunho`/`falhou`), `POST /api/sites/<id>/gerar`, `POST /api/sites/<id>/publicar`, `POST /api/sites/<id>/visto`, `GET /api/sites/avisos` (sino do cabeçalho).

Teste rápido, com o app rodando e a sessão em um cookie (`-b cookies.txt`):
```bash
IMG="data:image/png;base64,$(base64 -i public/exemplo-referencia.png | tr -d '\n')"
jq -n --arg img "$IMG" '{nome:"Loja Aurora",origem:"referencia",imagem:$img,marca:{nome:"Loja Aurora",corPrimaria:"#0f766e"},gerar:true}' \
  | curl -s -b cookies.txt -H "Content-Type: application/json" -d @- http://localhost:3000/api/sites      # 201, estado "gerando" em < 1 s
curl -s -b cookies.txt http://localhost:3000/api/sites/<id>                                                 # repita até estado "pronto"
sqlite3 data/app.sqlite "select estado, versaoPublicada, imagem is null from projetos where id='<id>'"       # pronto|1|1
curl -s http://localhost:3000/s/<slug> | head -3                                                            # a versão publicada, sem sessão
```

## Logo e imagens do cliente
Cada site aceita um logo e até 12 imagens (PNG, JPG, WEBP ou SVG sem script; até 2 MB cada), enviados no formulário de criação (até 6 na hora, o resto depois) ou no painel "Imagens" do site (`lib/assets.ts`, tabela `assets`, `GET|POST /api/sites/<id>/imagens`, `DELETE /api/sites/<id>/imagens/<assetId>`). Os arquivos são servidos em `/s/<idDoProjeto>/a/<assetId>` (público como o site, cache de 1 h, `nosniff`; SVG com CSP que não executa nada) — um endereço absoluto que funciona na prévia, no link `/s/<slug>` e no domínio próprio. O gerador e o agente recebem o bloco "Imagens da empresa" (`montarBlocoAssets`) e usam `<img>` com esses endereços: o logo no cabeçalho e no rodapé, as fotos onde a referência tinha imagens; onde faltar imagem, continua o bloco na cor da marca. Em demonstração, a landing fixa recebe o logo e as fotos nos mesmos lugares.

Importante: a lista de origens da CSP de `/s/` (`lib/publicacao.ts`, `img-src 'self' data: https:`) e o que `sanitizarHtml` deixa passar andam juntas — ao liberar qualquer origem nova no sanitizador, atualize a CSP.

## Edições por instrução e versões
Abaixo da prévia, o campo "O que mudar" envia a instrução (e o HTML que a tela está mostrando) em `POST /api/pagina/<id>/editar`. `lib/gerador.ts:editarPagina` usa o prompt de atualização do screenshot-to-code (devolver o arquivo inteiro mudando só o que foi pedido), passa a resposta pela mesma extração e sanitização da geração e grava uma `Versao` nova na página; a prévia mostra sempre a última versão. O botão "Trocar os textos pelos da minha empresa" abre o campo "O que a empresa faz" e envia `{ empresa }`: o servidor monta a instrução pré-pronta (`instrucaoTrocarTextos`) e grava na versão só o rótulo curto "Textos trocados pelos da empresa: ...".

A lista "Versões" (número, instrução e hora) tem "Voltar para esta" em cada versão anterior: `POST /api/pagina/<id>/voltar` com `{ n }` copia o HTML daquela versão como uma versão nova ("Voltou para a versão n"), sem apagar as intermediárias. Em modo demonstração (sem chave do OpenRouter), cada edição aplica mudanças fixas visíveis: a cor de fundo do cabeçalho e o título principal mudam a cada versão (`lib/demo.ts:edicaoDemo`).

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, com as ferramentas `gerar_pagina(imagem_url, instrucoes?, marca?, formato?)` (endereço terminado em `.png`/`.jpg` é baixado direto; qualquer outro é o site a fotografar pelo serviço de captura configurado. Só http/https, sem endereços internos da rede, PNG ou JPG reconhecidos pelos primeiros bytes, até 5 MB; devolve id, título, link `/r/<id>` e o HTML) e `editar_pagina(id, instrucao)` (aplica a mudança sobre a última versão e devolve o número da versão nova e o HTML inteiro). Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup` e configure o assistente com o endereço (`https://<seu-app>/mcp`) e o código como `Authorization: Bearer <código>`.

Decisão de implementação: protocolo implementado à mão em `lib/mcp.ts` (JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`), em vez do pacote `@modelcontextprotocol/sdk` — mesma decisão herdada de `pdi-time`. Rate limit de 60 chamadas por minuto por código, em memória.

```bash
curl -X POST https://<seu-app>/mcp \
  -H "Authorization: Bearer <código>" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"gerar_pagina","arguments":{"imagem_url":"https://exemplo.com/captura.png","marca":{"nome":"Minha Empresa","corPrimaria":"#0f766e"}}}}'
```

### Testar com o MCP Inspector
```bash
npx @modelcontextprotocol/inspector
```
Na interface que abre no navegador, escolha o transporte "Streamable HTTP", cole `http://localhost:3000/mcp` (ou o endereço do deploy) em URL e adicione o cabeçalho `Authorization: Bearer <código>` em "Custom Headers". Clique em "Connect": a aba "Tools" deve listar `gerar_pagina` e `editar_pagina`.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Modelo de texto (usado nas edições por instrução). Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `OPENROUTER_MODEL_VISAO` | Alternativa ao cartão "Qualidade da página gerada" do setup. Modelo com visão que lê a captura; padrão `inclusionai/ling-3.0-flash-vl:free`. Lista em https://openrouter.ai/models?modality=image-%3Etext. |
| `SCREENSHOTONE_ACCESS_KEY` | Opcional, alternativa ao setup. Chave do serviço que fotografa a página de referência a partir do endereço do site. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx              tela única (captura + formato + marca → prévia)
app/api/pagina/route.ts   gera a página (POST), lista as últimas (GET) e apaga o histórico (DELETE)
app/api/pagina/[id]/editar/route.ts aplica uma instrução (ou a troca de textos) e grava uma versão nova
app/api/pagina/[id]/voltar/route.ts copia uma versão anterior como versão nova ("Voltar para esta")
app/r/[id]/page.tsx       prévia de uma página salva, por link
app/s/[id]/route.ts       página publicada: a versão atual como HTML puro, em um link que sai do app
app/mcp/route.ts          endpoint MCP (JSON-RPC 2.0) para assistentes de IA
app/api/mcp/token/route.ts gera, consulta e revoga o código de acesso do endpoint MCP
app/setup/page.tsx        configuração inicial (IA, captura por endereço, modelo que lê a captura, acesso MCP)
app/api/captura/route.ts  traz a captura a partir de um endereço (imagem publicada ou site fotografado)
app/api/visao/route.ts    lê, grava e testa o modelo que lê a captura
app/api/setup/            leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts   informa ao frontend se a IA (com visão) está conectada
app/api/health/route.ts   health check
components/ui.tsx         componentes visuais compartilhados pela suíte
components/setup.tsx      tela de setup genérica, gerada a partir de lib/integracoes.ts
components/AcessoMCP.tsx  cartão do /setup para gerar/revogar o acesso MCP
components/QualidadePagina.tsx cartão do /setup: modelo que lê a captura e "Testar leitura de imagem"
components/PreviaPagina.tsx prévia em iframe (Computador/Celular), "Ver o código" e aviso de terceiros
components/EditorPagina.tsx "O que mudar", "Trocar os textos pelos da minha empresa" e lista "Versões"
lib/gerador.ts            prompts de geração e de edição, extração e sanitização do HTML, versões no histórico
lib/ferramentas.ts        ferramentas MCP gerar_pagina (baixa a imagem no servidor) e editar_pagina
lib/demo.ts               landing fictícia completa e edição de demonstração (cabeçalho e título fixos)
lib/types.ts              Pedido, Versao, Pagina, Marca
lib/ai.ts                 cliente OpenRouter (askText, askVision, askJSON, askWithTools)
lib/store.ts              configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts        tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts        integrações que este app precisa (OpenRouter e, opcional, o serviço de captura)
lib/captura.ts            baixa a captura de um endereço e fotografa o site pelo serviço configurado
lib/teste-visao.ts        PNG mínimo montado em código e teste "Testar leitura de imagem"
lib/mcp.ts                protocolo MCP (JSON-RPC 2.0), código de acesso e limite de chamadas
public/exemplo-referencia.png captura de exemplo usada por "Preencher com um exemplo" e /?exemplo=1
Dockerfile                build multi-stage com saída standalone
docker-compose.yml        sobe este app isolado
render.yaml               blueprint do Render (runtime image)
```
