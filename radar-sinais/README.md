> **Interface executiva (19/09/2026):** mapa interativo como foco do Radar & Insights, detalhes por seleção e configurações compactas com orientação do mínimo necessário. Relatórios saíram da navegação; Redis é infraestrutura interna, configurada por ambiente.

> **Radar estratégico:** veja [a pesquisa técnica e o funcionamento](docs/pesquisa-estrategica.md) para last30days, fontes cadastradas, Grok X Search, ontologia e cache Redis. As telas principais são Início (`/`), Termos (`/termos`), Radar & Insights (`/radar`) e Configurações (`/setup`).

# Radar de Sinais

Radar de sinais de mercado gerado por IA a partir dos temas que você acompanha, agrupados por força e tendência e conectados entre si. Área: Estratégia, Inovação.

## O que resolve
Movimentos do mercado chegam tarde e dispersos. Este app junta o que saiu no período sobre os temas acompanhados, agrupa em sinais (com força, tendência e o que fazer em cada um) e mostra as conexões entre eles.

Como funciona: o motor de busca (`lib/busca.ts`) consulta em paralelo as fontes sem chave (Hacker News, Reddit, GitHub e Google Notícias, este em português do Brasil) e, quando Exa, Tavily ou Bright Data estão conectadas, também notícias em português e conteúdo geral da web. A Bright Data usa MCP HTTP com `pro=1`, `search_engine` e `scrape_as_markdown` (até quatro páginas por radar). Cada fonte é isolada: uma que falhar (o Reddit, por exemplo, bloqueia endereços de nuvem) não derruba a rodada, e a tela diz quais fontes entraram ("Hacker News, GitHub, Google Notícias; Reddit indisponível") antes e depois de montar o radar. Quando o Reddit retorna HTTP 403, o radar registra um aviso e pausa novas consultas a ele por 15 minutos por processo; depois volta a tentar automaticamente. A IA agrupa o que foi encontrado em sinais com força, tendência e o que fazer, e só cita fontes que de fato vieram da busca; quando nenhum achado sustenta um sinal, o radar sai vazio e explica o motivo. Sem IA conectada, o radar é um exemplo (`lib/demo.ts`) com fontes marcadas como "(exemplo)" e links para a página de cada veículo. O grafo de nós e arestas é desenhado em SVG por `components/Grafo.tsx`, com layout de força próprio, sem biblioteca externa. O monitoramento diário salva termos, setor, período, horários e fuso no SQLite. Cada rodada gera um radar novo e entrega resumo, ações sugeridas e fontes por e-mail ou Slack. Rotinas semanais antigas permanecem compatíveis.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo e testa a conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar, o app roda em modo demonstração com um radar de exemplo.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher e executar um exemplo sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3011
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/radar-sinais:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-radar-sinais (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3011:10000 -v radar-sinais-dados:/app/data ghcr.io/startse/radar-sinais:latest` e abra http://localhost:3011.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. O Blueprint usa plano Starter (pago), com disco de 1 GB em `/app/data`, para manter termos e agendas entre deploys e executar as rotinas sem suspensão por inatividade.

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, para que assistentes como Claude ou ChatGPT chamem a ferramenta `montar_radar` diretamente. Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup` e configure o assistente com o endereço (`https://<seu-app>/mcp`) e o código como `Authorization: Bearer <código>`.

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
Na interface que abre no navegador, escolha o transporte "Streamable HTTP", cole `http://localhost:3000/mcp` (ou o endereço do deploy) em URL e adicione o cabeçalho `Authorization: Bearer <código>` em "Custom Headers". Clique em "Connect": a aba "Tools" deve listar `montar_radar`; ao executá-la com os temas preenchidos, o resultado devolvido é o mesmo objeto (sinais, nós, arestas, conexões) que a rota `/api/radar` produz.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `EXA_API_KEY` | Opcional. Amplia a busca para notícias em português e a web em geral. Obtenha em https://dashboard.exa.ai/api-keys. Sem ela (e sem Tavily), o radar usa só Hacker News, Reddit, GitHub e Google Notícias. |
| `BRIGHTDATA_API_TOKEN` | Token do MCP HTTP da Bright Data. O conector usa `https://mcp.brightdata.com/mcp?token=...&pro=1`. |
| `TAVILY_API_KEY` | Opcional, alternativa à Exa (basta uma das duas). Obtenha em https://app.tavily.com (API Keys). |
| `NOTIFICACOES_*` | Opcionais, configuradas em `/setup` (cartão Notificações): canal, destino e credencial do Resend/SMTP/Slack, ou Gmail/Outlook conectados em um clique. Necessárias para os alertas de monitoramento. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx            tela única (formulário + resultado)
app/api/radar/route.ts  geração do radar (POST), últimos radares com temas (GET) e apagar tudo (DELETE)
app/api/radar/fontes/route.ts    situação das fontes de busca antes de montar (linha "Fontes desta rodada")
app/api/radar/andamento/route.ts fontes que já responderam numa rodada em andamento (Loading)
app/api/radar/monitoramentos/route.ts lista, cadastra e edita monitoramentos diários
app/api/radar/semanal/route.ts   compatibilidade com rotinas semanais anteriores
components/Monitoramentos.tsx   cadastro, edição, pausa e execução manual
lib/monitoramento.ts           validação e cálculo de slots no fuso escolhido
lib/brightdata.ts              Search Engine e Scraper as Markdown por MCP HTTP
app/mcp/route.ts        endpoint MCP (JSON-RPC 2.0) para assistentes de IA
app/api/mcp/token/route.ts  gera, consulta e revoga o código de acesso do endpoint MCP
app/setup/page.tsx      configuração inicial (chaves, OAuth, teste de conexão, acesso MCP)
app/api/setup/          leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts informa ao frontend se a IA está conectada
app/api/health/route.ts health check
components/ui.tsx       componentes visuais compartilhados pela suíte
components/setup.tsx    tela de setup genérica, gerada a partir de lib/integracoes.ts
components/AcessoMCP.tsx cartão do /setup para gerar/revogar o acesso MCP
lib/store.ts            configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts      tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts      integrações que este app precisa
lib/ai.ts               cliente OpenRouter (askText, askJSON, askWithTools)
lib/mcp.ts              protocolo MCP (JSON-RPC 2.0), código de acesso e limite de chamadas
lib/ferramentas.ts      ferramentas expostas via MCP (montar_radar)
lib/radar.ts            lógica de geração do radar, usada pela rota HTTP e pela ferramenta MCP
lib/busca.ts            busca em Hacker News, Reddit, GitHub, Google Notícias, Exa, Tavily e Bright Data (fontes isoladas entre si)
lib/fontes.ts           nomes das fontes e a frase "X, Y; Z indisponível" (puro, usado na tela e no servidor)
lib/andamento.ts        andamento de uma rodada em memória (quais fontes já responderam)
lib/perfil.ts           chave do perfil acompanhado (temas + setor), usada pela rotina semanal e pela tela
components/Grafo.tsx    grafo de sinais em SVG com layout de força próprio
lib/demo.ts             radar de exemplo do modo demonstração
lib/types.ts            tipos do domínio (Sinal, No, Aresta, Radar)
Dockerfile              build multi-stage com saída standalone
docker-compose.yml      sobe este app isolado
render.yaml             blueprint do Render (runtime image)
```

## Monitoramento diário

1. Conecte OpenRouter e o canal de notificações em `/setup`. Opcionalmente conecte Tavily, Exa e/ou Bright Data; o teste da Bright Data verifica as duas ferramentas MCP.
2. Informe até 12 termos (um por linha), setor e período no formulário inicial.
3. Em **Monitoramento diário**, mantenha `08:00, 16:00, 20:00` ou escolha até 12 horários. O fuso padrão é `America/Sao_Paulo`, independente do relógio do servidor.
4. Clique em **Monitorar estes termos**. Use **Editar** para carregar os termos e horários no formulário, **Pausar/Retomar**, **Executar agora** ou **Excluir**. Os radares completos, com grafos e fontes, ficam no histórico.

A rotina começa no próximo horário após o cadastro. O agendador verifica a cada minuto; o processo precisa permanecer ativo. Depois de uma interrupção, executa somente a rodada mais recente pendente. Um lock no SQLite impede execuções simultâneas da mesma rotina entre processos; após queda, o lock expira em 30 minutos. Três falhas consecutivas pausam a rotina e o motivo fica visível. Não há envio de exemplos sem IA configurada. Rodadas sem evidência enviam um aviso explícito, sem inventar insights. Fontes sem data mostram “data não informada”.

O gatilho autenticado `POST /api/rotinas/executar` também pode ser chamado por um agendador externo; gere seu código em `/setup`. Configure o endereço público para os alertas incluírem o link do radar. O canal/destino é definido a partir de Notificações no cadastro; para mudar a entrega de uma rotina existente, recrie-a.

## Validação

`npm test` cobre validação de termos/horários, fusos, slots, recuperação, execução concorrente e fluxo integrado de cadastro, MCP HTTP/SSE, busca, Markdown, síntese, fontes, grafo, histórico e alerta usando serviços simulados. `npm run lint` e `npm run build` verificam o projeto. Chamadas reais aos provedores e entrega externa exigem credenciais da instância.

Referências: [Bright Data MCP](https://docs.brightdata.com/ai/mcp-server/overview), [cliente MCP HTTP](https://docs.brightdata.com/cn/ai/mcp-server/integrations/llamaindex).
