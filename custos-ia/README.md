# Custos de IA

Quanto a empresa gasta com ferramentas de IA, comparado ao orçamento planejado. Área: Financeiro e TI.

## O que resolve
O CFO não sabe quanto a empresa gasta com ferramentas de IA (ChatGPT, Claude, Copilot, Midjourney, ElevenLabs, Notion AI...) nem se está dentro do orçamento. Este app lê as faturas lançadas, agrega por ferramenta e por mês, e mostra o total do período contra o planejado — com aviso de quem estourou. As faturas entram de três formas: lançadas manualmente, enviadas em PDF/imagem pelo botão "Enviar notas em PDF" (até 10 arquivos de 5 MB por vez; o texto do PDF é extraído com `unpdf`, imagens passam pelo modelo de visão quando configurado, e `lib/leitor.ts` reconhece fornecedor, ferramenta, valor, moeda e data — tudo vai para uma prévia editável e só é gravado depois de "Confirmar tudo"), ou lidas direto do Gmail pelo botão "Ler as notas do e-mail" (conecte a caixa em `/setup`; o app busca as mensagens dos últimos 30, 90 ou 365 dias com jeito de cobrança, passa anexos PDF e corpo pelo mesmo `lib/leitor.ts` e lança o que reconhecer com origem "e-mail" — o conteúdo dos e-mails nunca é gravado, só a fatura). Sem chave de IA, cada arquivo enviado vira uma fatura de exemplo rotulada como demonstração, e a leitura do e-mail fica desabilitada (ela grava direto, sem prévia, então não faz sentido sem o modelo).

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. Todo o cálculo (total, variação, gasto por ferramenta/mês) é feito no servidor, sem IA — não há geração por modelo de linguagem nesta história.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você cadastra a cotação manual de dólar e euro (cartão "Câmbio", usados só para converter faturas em moeda estrangeira para reais), conecta a IA (OpenRouter, usada pelas próximas histórias) e configura notificações. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Sem nenhuma fatura lançada nem orçamento cadastrado, o app mostra doze meses de dados de exemplo (seis ferramentas reais do mercado, com dois meses que estouram o orçamento).

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para ver a leitura do mês atual sozinha.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3014
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/custos-ia:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-custos-ia (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3014:10000 -v custos-ia-dados:/app/data ghcr.io/startse/custos-ia:latest` e abra http://localhost:3014.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Ler as notas do Gmail
O cartão "Gmail" em `/setup` conecta a caixa em um clique (OAuth 2.0 Authorization Code com PKCE, escopo somente leitura `https://www.googleapis.com/auth/gmail.readonly`, `access_type=offline` e `prompt=consent`). O app guarda só o código de renovação (`GMAIL_REFRESH_TOKEN`) e o e-mail conectado (`GMAIL_CONTA`); o access token vive em memória e é renovado sozinho. "Desconectar" apaga os dois e pede a revogação ao Google.

O botão precisa de um cliente OAuth do **próprio app** no Google Cloud (o executivo não cria nada — é tarefa de quem publica a suíte, uma vez só):

1. Em https://console.cloud.google.com crie um projeto e, em "APIs e serviços › Biblioteca", ative a **Gmail API**.
2. Em "Tela de permissão OAuth", cadastre o app (tipo **Externo**, ou **Interno** se a empresa usa Google Workspace) e adicione o escopo `.../auth/gmail.readonly`.
3. Em "Credenciais", crie um **ID do cliente OAuth** do tipo "Aplicativo da Web" e cadastre em "URIs de redirecionamento autorizados" o endereço de retorno: `https://<seu-app>/api/setup/oauth/google/callback` (em desenvolvimento, `http://localhost:3000/api/setup/oauth/google/callback`). O cartão mostra esse endereço pronto para copiar.
4. Defina `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no ambiente onde o app roda — ou cole os dois valores no próprio cartão, em "Para a equipe técnica" (ficam no SQLite, como as demais chaves; a variável de ambiente tem prioridade).

Restrições do Google que valem saber antes de publicar:
- **App "Em teste"** (padrão para tipo Externo): só até 100 usuários cadastrados como testadores na tela de permissão, e cada autorização **expira em 7 dias** — a pessoa precisa clicar em Conectar o Gmail de novo.
- `gmail.readonly` é um **escopo restrito**: para tirar o app do modo de teste e abrir para o público, o Google exige a verificação do app (formulário, vídeo de demonstração e, para escopos restritos, uma avaliação de segurança anual que pode levar semanas e ter custo).
- **Google Workspace com tipo "Interno"** dispensa tudo isso: qualquer pessoa da organização conecta, sem limite de usuários nem expiração de 7 dias, e sem verificação. É o caminho recomendado para uma empresa usar o app internamente.

Como funciona a leitura (`lib/email.ts` + `app/api/faturas/importar/route.ts`): `users.messages.list` com `newer_than:<dias>d (fatura OR invoice OR recibo OR receipt OR "nota fiscal" OR has:attachment)`, paginado até 200 mensagens por clique; `messages.get` (`format=full`) para assunto, remetente e corpo (texto simples, ou HTML convertido em texto); `attachments.get` para até 3 anexos PDF de 5 MB por mensagem. Anexos são lidos primeiro (a nota costuma estar lá), o corpo só quando nenhum PDF rende fatura. Mensagens já importadas (mesma `referencia` = id da mensagem) são puladas sem gastar chamada ao modelo; a deduplicação por fornecedor + valor + data de `lib/faturas.ts` também vale aqui. Em `429`/`503` o cliente espera o `Retry-After` (ou recuo exponencial) e tenta de novo; em `401` renova o access token uma vez.

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, para que assistentes como Claude ou ChatGPT chamem a ferramenta `gastos_ia(periodo)` diretamente. Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup` e configure o assistente com o endereço (`https://<seu-app>/mcp`) e o código como `Authorization: Bearer <código>`.

Decisão de implementação: protocolo implementado à mão em `lib/mcp.ts` (JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`), em vez do pacote `@modelcontextprotocol/sdk` — mesma decisão herdada de `pdi-time`. Rate limit de 60 chamadas por minuto por código, em memória (`lib/mcp.ts`); reinicia ao reiniciar o servidor ou ao gerar um novo código.

```bash
curl -X POST https://<seu-app>/mcp \
  -H "Authorization: Bearer <código>" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"gastos_ia","arguments":{"periodo":"mes"}}}'
```

### Testar com o MCP Inspector
```bash
npx @modelcontextprotocol/inspector
```
Na interface que abre no navegador, escolha o transporte "Streamable HTTP", cole `http://localhost:3000/mcp` (ou o endereço do deploy) em URL e adicione o cabeçalho `Authorization: Bearer <código>` em "Custom Headers". Clique em "Connect": a aba "Tools" deve listar `gastos_ia`.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `GOOGLE_CLIENT_ID` | Cliente OAuth do app no Google Cloud, para o botão "Conectar o Gmail" (ver seção acima). Alternativa: colar em `/setup`. |
| `GOOGLE_CLIENT_SECRET` | Segredo do cliente OAuth acima. |
| `GMAIL_REFRESH_TOKEN` / `GMAIL_CONTA` | Gravados pelo próprio fluxo de conexão; só defina à mão para reaproveitar uma conexão existente. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx              tela única (período + resultado)
app/api/leitura/route.ts  leitura agregada do gasto (lib/leitura.ts)
app/api/orcamento/route.ts leitura/gravação do orçamento planejado (lista completa)
app/api/faturas/route.ts  lançamento manual de uma fatura e confirmação da prévia do upload
app/api/faturas/upload/route.ts   leitura de notas em PDF/imagem/texto (prévia, nada gravado)
app/api/faturas/importar/route.ts leitura das notas do Gmail do período (grava com origem "email")
app/api/setup/oauth/google/       conexão do Gmail (OAuth PKCE) e callback que grava o código de renovação
app/api/gmail/route.ts    estado da conexão do Gmail para o cartão de /setup e desconexão
app/mcp/route.ts          endpoint MCP (JSON-RPC 2.0) para assistentes de IA
app/api/mcp/token/route.ts gera, consulta e revoga o código de acesso do endpoint MCP
app/setup/page.tsx        configuração inicial (câmbio, IA, notificações, acesso MCP, rotinas)
app/api/setup/            leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts   informa ao frontend se a IA e as integrações estão conectadas
app/api/health/route.ts   health check
components/ui.tsx         componentes visuais compartilhados pela suíte
components/setup.tsx      tela de setup genérica, gerada a partir de lib/integracoes.ts
components/AcessoMCP.tsx  cartão do /setup para gerar/revogar o acesso MCP
components/ConectarGmail.tsx cartão do /setup do Gmail ("Conectado como", Desconectar, instruções para a equipe técnica)
components/EnviarNotas.tsx   área de envio de várias notas e prévia editável antes de gravar
components/ImportarEmail.tsx resumo de uma importação do Gmail (lidas, reconhecidas, ignoradas)
components/GraficoGastoPlanejado.tsx barras pareadas (gasto x planejado) por mês, em HTML+CSS puro
components/OrcamentoPlanejado.tsx  cartão do painel: orçamento mensal por ferramenta
components/LancarManualmente.tsx   cartão do painel: lançamento manual de fatura
lib/store.ts               configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts         tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts         integrações que este app precisa (OpenRouter, Notificações, Câmbio, Gmail)
lib/email.ts               cliente do Gmail: renovação do acesso, busca e leitura de mensagens e anexos PDF
lib/leitor.ts              transforma o texto de um documento (PDF, e-mail, imagem transcrita) em Fatura via IA
lib/ai.ts                  cliente OpenRouter (askText, askJSON, askWithTools) — sem uso de IA nesta história
lib/mcp.ts                 protocolo MCP (JSON-RPC 2.0), código de acesso e limite de chamadas
lib/ferramentas.ts         ferramentas expostas via MCP (gastos_ia)
lib/faturas.ts             faturas em SQLite (salvar com deduplicação, listar por período)
lib/orcamento.ts           orçamento planejado (JSON único via lib/store.ts)
lib/leitura.ts             agrega faturas + orçamento num Leitura do período, usada pela rota HTTP e pelo MCP
lib/demo.ts                doze meses de faturas de exemplo e um orçamento, com dois estouros
lib/types.ts                tipos do domínio
Dockerfile                 build multi-stage com saída standalone
docker-compose.yml         sobe este app isolado
render.yaml                 blueprint do Render (runtime image)
```
