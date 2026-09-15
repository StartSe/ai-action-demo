# Prospecção no LinkedIn

Descreva o seu cliente ideal e receba a lista de leads com sinal de intenção e a sequência de mensagens pronta para cada um. Área: Vendas.

## O que resolve
Prospectar no LinkedIn consome horas por dia entre buscar perfis e escrever mensagem por mensagem. Este app recebe o perfil de cliente ideal (cargos, setores, sinais de intenção e a proposta em uma frase) e devolve uma campanha: a lista de leads pontuada (quem combina mais com o perfil e mostrou o sinal mais forte aparece primeiro) e, para os leads que você marcar, a sequência completa de mensagens: pedido de conexão com até 300 caracteres, dois acompanhamentos e um e-mail opcional, cada um com botão "Copiar".

**Nesta versão os leads são sempre fictícios** (10 pessoas e empresas inventadas, rotuladas como demonstração na tela e com `origem: "demo"` nos dados): o objetivo é mostrar o formato e o valor do resultado antes de conectar a conta. A busca real e o envio das mensagens aprovadas entram na próxima versão, pelo Prospect Halo (servidor MCP remoto), mantendo a mesma tela e a mesma assinatura de `buscarLeads`. As sequências, por outro lado, já saem da IA quando há chave do OpenRouter; sem chave, saem de um modelo pronto (`lib/demo.ts`).

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter (`askJSON`, em `lib/ai.ts`). Sem banco externo: histórico e configuração em SQLite (`node:sqlite`).

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo, configura as notificações (e-mail ou Slack, para as rotinas) e testa cada conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Sem chave de IA, o app roda em modo demonstração.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher o perfil de exemplo e buscar os leads sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3016
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/prospeccao-linkedin:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-prospeccao-linkedin (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3016:10000 -v prospeccao-linkedin-dados:/app/data ghcr.io/startse/prospeccao-linkedin:latest` e abra http://localhost:3016.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Como funciona
1. O formulário envia o perfil em `POST /api/leads`: `cargos` e `setores` (texto livre, separados por vírgula), `sinais` (lista entre `mudou_de_cargo`, `empresa_contratando`, `publicou_sobre_tema`, `levantou_investimento`; vazia = qualquer sinal), `proposta`, `remetente` (`nome`, `empresa`) e `tom` (`direto`, `consultivo` ou `informal`). `lib/leads.ts:validarPerfil` valida (400 em caso de erro) e `buscarLeads` cria a campanha em estado `rascunho`, salva no histórico (tipo `prospeccao`, entrada = perfil, saída = campanha) e devolve `{ campanha, meta, id }`. "Seu nome" e "Sua empresa" ficam lembrados (`REMETENTE_NOME`/`REMETENTE_EMPRESA`) e pré-preenchem o formulário da próxima vez.
2. Na tabela, marque os leads e clique em "Escrever para os selecionados": `POST /api/sequencias` com `{ campanhaId, leadIds }` (até 20 por vez). `lib/sequencias.ts:escreverParaCampanha` lê o perfil da própria campanha salva, escreve uma sequência por lead (`escreverSequencia`, uma chamada ao modelo por lead, em paralelo), substitui a sequência anterior do mesmo lead quando houver, grava a campanha (estado `pronta`) e devolve a campanha atualizada. O pedido de conexão é recortado no servidor em 300 caracteres; se a resposta trouxer marcadores entre colchetes ou chaves, o modelo é chamado uma segunda vez com a correção explícita.
3. O resultado abre em `/r/<id>` (sem seleção nem botão de escrever, só leitura) e imprime em `/imprimir/<id>`. "Baixar PDF", "Copiar texto", "Enviar por e-mail" e "Copiar link" ficam no bloco de entrega padrão.

Tipos (`lib/types.ts`): `Perfil`, `Lead` (`pontuacao` 0 a 100, `origem` `prospecthalo` ou `demo`), `Sequencia` (`leadId`, `conexao`, `acompanhamento1`, `acompanhamento2`, `email?`) e `Campanha` (`estado` `rascunho`, `pronta` ou `enviada`; `externoId` quando enviada pelo Prospect Halo).

## Rotina
Em `/setup`, o cartão "Rotinas" permite criar "Resumo das prospecções geradas" (diária, semanal ou mensal): envia por e-mail ou Slack quantas campanhas foram criadas desde a última execução, com link para a mais recente. Quando não há nada novo, não envia.

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, com as ferramentas `buscar_leads_linkedin(cargos, setores, proposta, sinais?, remetente?, tom?)` (cria a campanha e devolve a lista pontuada) e `escrever_sequencia(lead, proposta, remetente?, tom?)` (a sequência de um lead, informado diretamente ou vindo da busca). Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup` e configure o assistente com o endereço (`https://<seu-app>/mcp`) e o código como `Authorization: Bearer <código>`.

Decisão de implementação: protocolo implementado à mão em `lib/mcp.ts` (JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`), em vez do pacote `@modelcontextprotocol/sdk` — mesma decisão herdada de `pdi-time`. Rate limit de 60 chamadas por minuto por código, em memória.

```bash
curl -X POST https://<seu-app>/mcp \
  -H "Authorization: Bearer <código>" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"buscar_leads_linkedin","arguments":{"cargos":"Diretor de Operações","setores":"Indústria de alimentos","proposta":"Reduzimos o custo de frete em até 20%."}}}'
```

### Testar com o MCP Inspector
```bash
npx @modelcontextprotocol/inspector
```
Na interface que abre no navegador, escolha o transporte "Streamable HTTP", cole `http://localhost:3000/mcp` (ou o endereço do deploy) em URL e adicione o cabeçalho `Authorization: Bearer <código>` em "Custom Headers". Clique em "Connect": a aba "Tools" deve listar `buscar_leads_linkedin` e `escrever_sequencia`.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão em `lib/ai.ts`. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx                 tela única (perfil → lista de leads → mensagens por lead)
app/api/leads/route.ts       busca os leads e cria a campanha (POST), lista as últimas (GET), apaga o histórico (DELETE)
app/api/sequencias/route.ts  escreve as sequências dos leads escolhidos de uma campanha (POST)
app/r/[id]/page.tsx          campanha salva, por link (só leitura)
app/imprimir/[id]/page.tsx   folha de impressão (PDF)
app/setup/page.tsx           configuração da IA, notificações, código do MCP e rotinas
app/mcp/route.ts             endpoint MCP (JSON-RPC 2.0)
lib/types.ts                 Perfil, Lead, Sequencia, Campanha
lib/leads.ts                 validarPerfil, buscarLeads, obterCampanha (histórico tipo "prospeccao")
lib/sequencias.ts            escreverSequencia (IA ou demo) e escreverParaCampanha
lib/demo.ts                  10 leads fictícios e a sequência de exemplo
lib/ferramentas.ts           ferramentas MCP: buscar_leads_linkedin e escrever_sequencia
lib/rotinas-do-app.ts        rotina "Resumo das prospecções geradas"
```
