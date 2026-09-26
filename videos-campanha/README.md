> **Versão 0.4.1 — Creative Flows:** geração individual simultânea, vídeos em modal, prompts UGC com foco e consistência do produto sem textos adicionados, e ajustes visuais. Veja [correções e validação](docs/ux-0.4.1.md).

> **Versão 0.4.0 — Creative Flows:** template UGC com produtos A/B, geração paralela por ramificação, limites de referências por modelo e varinha para melhorar o prompt atual com IA. Veja [novidades e validação](docs/ux-0.4.0.md).

> **Versão 0.3.2 — Creative Flows:** opção Ver inteira abre a imagem original em um modal, sem recorte, no editor e no preview público. Veja [comportamento e validação](docs/ux-0.3.2.md).

> **Versão 0.3.1 — Creative Flows:** prompt editável no card Ideia, cabeçalho compacto, cards simplificados e vídeo em cover com autoplay e loop. Veja [ajustes e validação](docs/ux-0.3.1.md).

> **Versão 0.3.0 — Creative Flows:** preview público somente para visualização, sidebar flutuante, barra centralizada e ações de duplicar/ramificar nos cards. Veja [comportamento e validação](docs/ux-0.3.0.md).

> **Versão 0.2.0:** escolha de modelos com descrições, carregamento e recuperação de erros, toasts e vídeos com autoplay/loop no bloco. Veja o [mapa de melhorias e validação](docs/ux-0.2.0.md).

> **Creative Flow:** a página inicial agora usa projetos com blocos conectáveis, receitas e biblioteca global de assets. Consulte [uso, arquitetura e validação](docs/creative-flow.md). O fluxo de briefing descrito abaixo permanece em `/briefing`.

# Vídeos de Campanha

Descreva a campanha, envie a imagem do produto e escolha entre três conceitos de vídeo curto antes de gastar créditos. Área: Marketing.

## O que resolve
Produzir um vídeo curto para cada campanha leva semanas entre agência, aprovação e ajustes, e gerar vídeo por IA sem saber o que vai sair custa créditos. Este app recebe um briefing (produto ou oferta, para quem, objetivo, tom, formato e duração) e a imagem do produto (PNG ou JPG, até 5 MB) e devolve três conceitos diferentes, cada um com roteiro por cena (o que aparece, quantos segundos, texto na tela), efeito visual sugerido, chamada e legendas prontas para Instagram, LinkedIn e TikTok. A prévia ilustrativa de cada conceito é um storyboard na proporção escolhida, com a imagem do produto ao fundo e as cenas alternando. Sem chave de IA, o app devolve três conceitos fictícios rotulados como demonstração.

Com o Higgsfield conectado (servidor MCP com OAuth), cada conceito vira um vídeo de verdade a partir da imagem do produto: o custo em créditos e o saldo aparecem antes de confirmar, um vídeo é gerado por vez e o app avisa por e-mail ou Slack quando fica pronto (a geração leva minutos). Sem o Higgsfield, o resultado mostra uma vez a frase "conecte o Higgsfield" com o link da configuração e os botões de geração ficam desabilitados.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter (`askJSON`, em `lib/ai.ts`). Storyboard e animação em HTML e CSS puros (sem biblioteca de vídeo, animação ou UI).

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo e testa a conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar, o app roda em modo demonstração.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher o briefing de exemplo (garrafa térmica Vela), carregar a imagem do produto (`public/exemplo-produto.jpg`) e criar os conceitos sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3017
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/videos-campanha:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-videos-campanha (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3017:10000 -v videos-campanha-dados:/app/data ghcr.io/startse/videos-campanha:latest` e abra http://localhost:3017.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. O Blueprint usa o plano `starter` (pago) com um disco de 1 GB em `/app/data`: configuração, conta, campanhas e os projetos e assets do Creative Flow ficam no SQLite desse disco e sobrevivem a cada atualização da imagem. No Docker Compose o volume `videos-campanha-dados` faz o mesmo papel.

## Como os conceitos são criados
1. O navegador lê a imagem do produto como data URL e envia em `POST /api/conceitos` junto com `produto`, `publico`, `objetivo` (`lancamento`, `promocao`, `marca`, `evento`), `tom`, `formato` (`9:16`, `16:9`, `1:1`) e `duracaoSeg` (`5`, `10`, `15`).
2. `lib/conceitos.ts` valida o briefing (`normalizarBriefing`; erro de entrada responde 400) e a imagem (PNG/JPG, até 5 MB), monta o prompt e chama a IA (`criarConceitos`, via `askJSON`). A resposta passa por `normalizarConceitos`: exatamente 3 conceitos com exatamente 3 cenas cada, segundos inteiros que somam a duração pedida (`distribuirSegundos` corrige quando a IA erra a conta), efeito casado por nome com a lista interna (`EFEITOS` em `lib/types.ts`: Zoom dramático, Giro do produto, Explosão de partículas, Câmera lenta, Antes e depois) e legendas por rede com texto de fallback.
3. A campanha é salva no histórico (tipo `campanha`) com o briefing (inclusive a imagem, necessária para redesenhar o storyboard e gerar o vídeo) e os conceitos. O resultado abre em `/r/<id>`. "Entregar" tem "Baixar PDF" (folha de impressão `/imprimir/<id>`: storyboard parado e roteiro por cena) e o menu "Mais" com copiar o roteiro, e-mail, link, "Baixar vídeo" (só quando há vídeo pronto), "Copiar legenda do Instagram/LinkedIn/TikTok" e "Baixar roteiro (texto)" (`.txt`). As legendas saem do conceito que tem vídeo pronto; antes disso, as dos três conceitos, uma por bloco (`lib/roteiro.ts`). Abaixo do vídeo pronto há o aviso de que o link do provedor vale por alguns dias.

O storyboard (`components/Storyboard.tsx`) é um quadro na proporção escolhida com a imagem do produto ao fundo, sobreposição escura a 40% e o texto de cada cena entrando num crossfade de 3 s por cena (CSS puro, desligado por `prefers-reduced-motion`; os botões "Cena 1/2/3" fixam uma cena). O rótulo "Prévia ilustrativa" é fixo: o vídeo real só existe depois de gerar.

## Como o vídeo é gerado (Higgsfield)
O Higgsfield entra como um servidor MCP remoto com OAuth (cartão "Higgsfield" em `/setup`, botão "Autorizar"; endereço padrão `https://mcp.higgsfield.ai`). Sem ele, o botão "Gerar este vídeo" fica desabilitado e nenhum crédito é gasto.

1. **Confirmação antes de gastar.** "Gerar este vídeo" abre um diálogo (`components/DialogoGerar.tsx`) que chama `POST /api/videos` com `confirmar: false`: o app lista os efeitos do Higgsfield (`presets_show`), casa o `efeitoSugerido` do conceito com um deles por nome e por sinônimos em inglês (`mapearEfeito` em `lib/higgsfield.ts`; a lista remota substitui a interna e pode ser trocada no diálogo), pede o custo sem criar nada (`generate_video` com `get_cost: true`) e o saldo (`balance`). Nada é criado até "Confirmar e gerar".
2. **Um vídeo por vez.** Com `confirmar: true`, `lib/videos.ts` grava o `Video` em SQLite (tabela `videos`, estado `enviando`) e responde 202 na hora; em segundo plano envia a imagem (`media_upload` → PUT dos bytes no endereço devolvido → `media_confirm`; ou `media_import_url` com `/api/videos/imagem/<campanha>` quando o app está publicado em https e o servidor só importa por endereço), cria o trabalho (`generate_video`, modelo `higgsfield_preset` com `preset_id`, `aspect_ratio`, `duration`, `medias`) e passa o estado para `gerando`. Um segundo pedido enquanto há vídeo em andamento responde 409.
3. **Acompanhamento.** A tela consulta `GET /api/videos/<id>` a cada 5 s; o servidor repassa ao Higgsfield (`job_status`, ou `jobs_wait` quando não existe): `gerando` → `finalizando` (pronto no provedor, buscando o endereço do arquivo com `show_generation_by_ids`) → `pronto` (mostra `<video controls>`, "Baixar vídeo" e "Gerar outro efeito") ou `falhou` (motivo traduzido em `motivoEmPortugues`). Envio parado há mais de 3 min ou geração acima de 20 min também viram `falhou`.

As ferramentas remotas são escolhidas pelo nome conhecido e, se o servidor renomear alguma, pela ferramenta cujo nome contém as palavras-chave da operação (`FERRAMENTAS_HIGGSFIELD`). Os argumentos são casados com o schema declarado pela ferramenta (`montarArgumentos`), e as respostas são lidas nas variantes mais comuns de nome de campo (`job_id`/`id`, `media_id`, `cost`/`credits`, endereço de vídeo por extensão `.mp4` ou chave `url`/`video`/`result`). O saldo aparece em "Mais detalhes" no painel quando a integração está conectada (`GET /api/higgsfield`).

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, com três ferramentas: `criar_conceitos(produto, publico?, objetivo?, tom?, formato?, duracaoSeg?, imagem_url?)` (o servidor baixa a imagem do produto no endereço público informado — só http/https, sem endereços internos da rede, PNG ou JPG reconhecidos pelos primeiros bytes, até 5 MB — e devolve id, título, link `/r/<id>` e os três conceitos, cada um com o seu `id`); `gerar_video(conceitoId, efeito?, confirmar)`, que sem `confirmar: true` só devolve o plano (efeito escolhido, lista de efeitos, formato, custo estimado e saldo) e com ele cria o vídeo pelo Higgsfield (um por vez) e devolve o id; e `estado_video(id)`, com o andamento e o endereço do arquivo quando pronto. Para a importação por endereço (`media_import_url`) a partir do assistente, defina `APP_URL` com o endereço https público do app. Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup` e configure o assistente com o endereço (`https://<seu-app>/mcp`) e o código como `Authorization: Bearer <código>`.

Decisão de implementação: protocolo implementado à mão em `lib/mcp.ts` (JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`), em vez do pacote `@modelcontextprotocol/sdk` — mesma decisão herdada de `pdi-time`. Rate limit de 60 chamadas por minuto por código, em memória.

```bash
curl -X POST https://<seu-app>/mcp \
  -H "Authorization: Bearer <código>" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"criar_conceitos","arguments":{"produto":"Garrafa térmica Vela 750 ml","publico":"quem treina cedo","formato":"9:16","duracaoSeg":10}}}'
```

### Testar com o MCP Inspector
```bash
npx @modelcontextprotocol/inspector
```
Na interface que abre no navegador, escolha o transporte "Streamable HTTP", cole `http://localhost:3000/mcp` (ou o endereço do deploy) em URL e adicione o cabeçalho `Authorization: Bearer <código>` em "Custom Headers". Clique em "Connect": a aba "Tools" deve listar `criar_conceitos`, `gerar_video` e `estado_video`.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão em `lib/ai.ts`. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |
| `HIGGSFIELD_URL`, `HIGGSFIELD_CODIGO` | Alternativa ao botão Autorizar do setup: endereço do servidor MCP do Higgsfield e um código de acesso gerado manualmente. |
| `APP_URL` | Endereço https público deste app, usado só pela ferramenta MCP `gerar_video` quando o Higgsfield precisa importar a imagem por endereço (`media_import_url`). |

## Estrutura
```
app/page.tsx              tela única (briefing + imagem → três conceitos)
app/api/conceitos/route.ts cria os conceitos (POST), lista as últimas campanhas (GET) e apaga o histórico (DELETE)
app/api/videos/route.ts   plano de geração (POST confirmar:false), criação do vídeo (POST confirmar:true) e lista por campanha (GET)
app/api/videos/[id]/route.ts andamento de um vídeo, consultado ao Higgsfield a cada chamada
app/api/videos/imagem/[campanhaId]/route.ts imagem do produto como arquivo (importação por endereço no Higgsfield)
app/api/videos/erros.ts   erros de lib/videos.ts e lib/higgsfield.ts em respostas HTTP (400/404/409/502)
app/api/higgsfield/route.ts conectado, saldo e quantidade de efeitos para "Mais detalhes"
app/r/[id]/page.tsx       uma campanha salva, por link
app/imprimir/[id]/page.tsx folha de impressão: storyboard parado e roteiro por cena
app/mcp/route.ts          endpoint MCP (JSON-RPC 2.0) para assistentes de IA
app/api/mcp/token/route.ts gera, consulta e revoga o código de acesso do endpoint MCP
app/setup/page.tsx        configuração inicial (IA, acesso MCP)
app/api/setup/            leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts   informa ao frontend se a IA e o Higgsfield estão conectados
app/api/health/route.ts   health check
components/ui.tsx         componentes visuais compartilhados pela suíte
components/setup.tsx      tela de setup genérica, gerada a partir de lib/integracoes.ts
components/AcessoMCP.tsx  cartão do /setup para gerar/revogar o acesso MCP
components/Storyboard.tsx prévia ilustrativa: quadro na proporção, imagem ao fundo, cenas em crossfade
components/DialogoGerar.tsx confirmação antes de gerar: efeito (lista remota), formato, custo estimado e saldo
components/VideoDoConceito.tsx acompanhamento no cartão: etapas, vídeo pronto com download, falha em português
lib/conceitos.ts          validação do briefing, prompt, normalização dos conceitos e gravação no histórico
lib/ferramentas.ts        ferramentas MCP criar_conceitos (baixa a imagem no servidor), gerar_video e estado_video
lib/higgsfield.ts         cliente do Higgsfield sobre lib/mcp-cliente.ts: efeitos, envio da imagem, geração, andamento, saldo
lib/videos.ts             vídeos em SQLite: plano, criação (um por vez, envio em segundo plano) e acompanhamento
lib/demo.ts               briefing e três conceitos fictícios; distribuirSegundos
lib/roteiro.ts            roteiro em texto (copiar/baixar)
lib/types.ts              Briefing, Conceito, Video, PlanoVideo, EfeitoRemoto, Campanha, listas de formato/duração/objetivo/efeito
lib/ai.ts                 cliente OpenRouter (askText, askVision, askJSON, askWithTools)
lib/store.ts              configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts        tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts        integrações que este app precisa (OpenRouter e Higgsfield via integracaoMCP)
lib/mcp-cliente.ts        cliente MCP genérico (compartilhado), usado por lib/higgsfield.ts
lib/mcp-oauth.ts          OAuth para servidores MCP remotos (compartilhado), usado pelo botão Autorizar do Higgsfield
lib/mcp.ts                protocolo MCP (JSON-RPC 2.0), código de acesso e limite de chamadas
public/exemplo-produto.jpg imagem do produto de exemplo usada por "Preencher com um exemplo" e /?exemplo=1
Dockerfile                build multi-stage com saída standalone
docker-compose.yml        sobe este app isolado
render.yaml               blueprint do Render (runtime image)
```
