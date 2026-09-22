# Follow-up de Decisão

Lista de ações combinadas em reunião — o quê, quem é o dono, até quando — com cobrança automática de quem ainda deve algo perto do prazo. Área: Gestão.

## O que resolve
A decisão foi tomada na reunião e ninguém sabe se saiu do papel: ela só reaparece (ou não) na reunião seguinte. Este app cadastra as ações direto num formulário simples, ou extrai a lista a partir do texto de uma ata colada (a IA nunca inventa dono ou prazo que o texto não deixe explícito — cada campo extraído mostra o trecho exato de onde veio, e a pessoa revisa antes de confirmar). Uma rotina diária cobra, pelo canal escolhido, as ações com prazo dentro de uma janela configurável e ainda não concluídas.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão, usada só para extrair ações de uma ata colada — o cadastro manual não depende de nenhuma chave.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo e testa a conexão, e configura o canal de notificação (e-mail ou Slack) usado pela cobrança automática. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar a IA, "Colar ata" funciona em modo demonstração, com um texto de exemplo e uma extração de exemplo; o cadastro manual de ações sempre funciona, com ou sem IA.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para cadastrar ações de exemplo automaticamente.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3026
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/follow-up-de-decisao:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-follow-up-de-decisao (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3026:10000 -v follow-up-de-decisao-dados:/app/data ghcr.io/startse/follow-up-de-decisao:latest` e abra http://localhost:3026.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração e as ações cadastradas se perdem a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, para que assistentes como Claude ou ChatGPT chamem a ferramenta `registrar_acoes` diretamente — recebendo o texto de uma ata (a mesma extração com checagem anti-alucinação da tela) ou uma lista de ações já definidas. Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup` e configure o assistente com o endereço (`https://<seu-app>/mcp`) e o código como `Authorization: Bearer <código>`.

Decisão de implementação: protocolo implementado à mão em `lib/mcp.ts` (JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`), em vez do pacote `@modelcontextprotocol/sdk`. O app só precisa desses três métodos, sem `resources`, `prompts` nem streaming de progresso — a mesma filosofia de `lib/store.ts` (SQLite sem dependências externas) evita adicionar uma dependência pesada para um uso pequeno. Rate limit de 60 chamadas por minuto por código, em memória (`lib/mcp.ts`); reinicia ao reiniciar o servidor ou ao gerar um novo código.

```bash
curl -X POST https://<seu-app>/mcp \
  -H "Authorization: Bearer <código>" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

O cartão também mostra um passo a passo de três passos para o Claude Desktop e para o ChatGPT, e um botão "Copiar configuração" que copia um JSON pronto (endereço + código) logo após gerar um acesso.

### Testar com o MCP Inspector
```bash
npx @modelcontextprotocol/inspector
```
Na interface que abre no navegador, escolha o transporte "Streamable HTTP", cole `http://localhost:3000/mcp` (ou o endereço do deploy) em URL e adicione o cabeçalho `Authorization: Bearer <código>` em "Custom Headers". Clique em "Connect": a aba "Tools" deve listar `registrar_acoes`.

## Rotina de cobrança
Em `/setup`, o cartão "Rotinas" cria uma rotina do tipo "Cobrança de ações perto do prazo" (frequência, horário, canal e um campo próprio "Dias antes do prazo" — padrão 3). A cada execução, a rotina lê as ações pendentes com prazo dentro dessa janela e manda uma mensagem cobrando pelo canal escolhido; sem nada a cobrar, não manda mensagem. Uma ação marcada como concluída para de ser cobrada.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Modelo usado para extrair ações de uma ata colada. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `NOTIFICACOES_CANAL` / `NOTIFICACOES_DESTINO` / `NOTIFICACOES_SLACK_WEBHOOK` / `NOTIFICACOES_RESEND_API_KEY` | Alternativa ao setup: por onde chega a cobrança automática. Chave do Resend em https://resend.com/api-keys. |
| `GOOGLE_CLIENT_ID_APP` / `GOOGLE_CLIENT_SECRET_APP` | Credenciais OAuth da suíte (não da pessoa) para o botão "Conectar meu Gmail" em Notificações. Embutidas na imagem publicada pela equipe técnica; sem elas o botão não aparece. |
| `MICROSOFT_CLIENT_ID_APP` / `MICROSOFT_CLIENT_SECRET_APP` | Idem, para "Conectar meu Outlook". |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx                tela única (nova ação, colar ata, lista de ações)
app/api/acoes/route.ts      lista e cadastro manual de ações
app/api/acoes/[id]/route.ts concluir/reabrir e apagar uma ação
app/api/acoes/extrair/route.ts  propõe ações a partir do texto colado (não salva sozinho)
app/api/acoes/lote/route.ts salva as ações confirmadas depois da revisão
app/api/acoes/exemplo/route.ts  semeia a lista vazia com ações de exemplo ("Preencher com um exemplo")
app/mcp/route.ts            endpoint MCP (JSON-RPC 2.0) para assistentes de IA
app/api/mcp/token/route.ts  gera, consulta e revoga o código de acesso do endpoint MCP
app/setup/page.tsx          configuração inicial (chaves, OAuth, teste de conexão, acesso MCP, rotinas)
app/api/setup/              leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/rotinas/            agenda, lista e executa a rotina de cobrança
app/api/status/route.ts     informa ao frontend se a IA está conectada
app/api/health/route.ts     health check
components/ui.tsx           componentes visuais compartilhados pela suíte
components/setup.tsx        tela de setup genérica, gerada a partir de lib/integracoes.ts
components/Rotinas.tsx      cartão do /setup para agendar a cobrança (com o campo "Dias antes do prazo")
components/AcessoMCP.tsx    cartão do /setup para gerar/revogar o acesso MCP
components/ColarAta.tsx     diálogo "Colar ata": extração, revisão e confirmação
lib/store.ts                configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts          tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts          integrações que este app precisa
lib/ai.ts                   cliente OpenRouter (askText, askJSON, askWithTools)
lib/mcp.ts                  protocolo MCP (JSON-RPC 2.0), código de acesso e limite de chamadas
lib/ferramentas.ts          ferramentas expostas via MCP (registrar_acoes)
lib/acoes.ts                cadastro, extração (com checagem anti-alucinação) e janela de cobrança
lib/rotinas-do-app.ts       executor da rotina "cobranca-acoes"
lib/demo.ts                 texto de ata de exemplo e ações de exemplo do modo demonstração
lib/types.ts                tipos do domínio
Dockerfile                  build multi-stage com saída standalone
docker-compose.yml          sobe este app isolado
render.yaml                 blueprint do Render (runtime image)
```
