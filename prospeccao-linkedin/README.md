# Prospecção no LinkedIn

Descreva o seu cliente ideal e receba a lista de leads com sinal de intenção e a sequência de mensagens pronta para cada um. Área: Vendas.

## O que resolve
Prospectar no LinkedIn consome horas por dia entre buscar perfis e escrever mensagem por mensagem. Este app recebe o perfil de cliente ideal (cargos, setores, sinais de intenção e a proposta em uma frase) e devolve uma campanha: a lista de leads pontuada (quem combina mais com o perfil e mostrou o sinal mais forte aparece primeiro) e, para os leads que você marcar, a sequência completa de mensagens: pedido de conexão com até 300 caracteres, dois acompanhamentos e um e-mail opcional, cada um com botão "Copiar". Os leads com pontuação a partir de 80 já vêm marcados; "Copiar lista (CSV)" (menu "Mais") leva a lista inteira para uma planilha.

Com o **Prospect Halo** conectado em `/setup` (servidor MCP remoto, autorizado com um clique), a lista vem do LinkedIn do usuário e as mensagens aprovadas são enviadas da conta dele, dentro dos limites diários do serviço. **Nada é enviado sem aprovação explícita**: o botão "Aprovar e enviar pelo Prospect Halo" abre um diálogo com a quantidade de leads, as três mensagens e o aviso de envio, e só "Confirmar" cria a campanha remota.

Sem o Prospect Halo, os leads são fictícios (10 pessoas e empresas inventadas, rotuladas como demonstração na tela e com `origem: "demo"` nos dados): o objetivo é mostrar o formato e o valor do resultado antes de conectar a conta. Se o Prospect Halo falhar, a tela mostra o erro em português e o botão "Ver com dados de exemplo". As sequências saem da IA quando há chave do OpenRouter; sem chave, saem de um modelo pronto (`lib/demo.ts`).

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter (`askJSON`, em `lib/ai.ts`). Prospect Halo via MCP (`lib/mcp-cliente.ts` + OAuth em `lib/mcp-oauth.ts`). Sem banco externo: histórico e configuração em SQLite (`node:sqlite`).

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo, autoriza o Prospect Halo (botão "Autorizar", fluxo OAuth; o endereço `https://app.prospecthalo.ai/api/agent/v1/mcp` já vem preenchido), conecta o CRM do time (servidor MCP, para o botão "Enviar para o CRM" da lista), configura as notificações (e-mail ou Slack, para as rotinas) e testa cada conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Sem chave de IA, o app roda em modo demonstração.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher o perfil de exemplo, buscar os leads e já escrever as mensagens dos três melhores — a demonstração termina em "Mensagens prontas", não numa lista sem mensagem nenhuma.

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
3. Com o Prospect Halo conectado e mensagens escritas para leads reais, aparece "Aprovar e enviar pelo Prospect Halo": `POST /api/envio` com `{ campanhaId, confirmar: false }` devolve o plano (`lib/envio.ts:planoEnvio`: quantidade de leads com sequência, as três mensagens do primeiro lead como amostra e o aviso "As mensagens serão enviadas da sua conta do LinkedIn, respeitando os limites diários do Prospect Halo"); só "Confirmar" chama de novo com `confirmar: true`, que cria a campanha remota (`enviarCampanha`) e grava `externoId` e `estado: "enviada"`. "Ver andamento" consulta `GET /api/envio?campanhaId=<id>`.
4. O resultado abre em `/r/<id>` (sem seleção nem botão de escrever, só leitura) e imprime em `/imprimir/<id>`. "Baixar PDF", "Copiar texto", "Enviar por e-mail" e "Copiar link" ficam no bloco de entrega padrão.

Tipos (`lib/types.ts`): `Perfil`, `Lead` (`pontuacao` 0 a 100, `origem` `prospecthalo` ou `demo`), `Sequencia` (`leadId`, `conexao`, `acompanhamento1`, `acompanhamento2`, `email?`) e `Campanha` (`estado` `rascunho`, `pronta` ou `enviada`; `externoId` quando enviada pelo Prospect Halo).

## Prospect Halo (busca e envio pelo LinkedIn)
`lib/integracoes.ts` declara `PROSPECTHALO` com `integracaoMCP()` (endereço padrão `https://app.prospecthalo.ai/api/agent/v1/mcp`, botão "Autorizar" com OAuth + PKCE e registro dinâmico de cliente, ou um código de acesso colado em "Opções avançadas"). As chaves salvas são `PROSPECTHALO_URL`, `PROSPECTHALO_CODIGO` (mais `_REFRESH`, `_EXPIRA` e `_CLIENT_ID` do fluxo OAuth).

**Os nomes reais das ferramentas do Prospect Halo são descobertos em tempo de execução.** `lib/prospecthalo.ts` chama `tools/list` no servidor e escolhe cada ferramenta por palavras-chave no nome e na descrição (mesmo método de `prospeccao-ia/lib/crm-mcp.ts`):

| Operação | Palavras procuradas | Usada em |
|---|---|---|
| buscar | `lead`, `prospect`, `search`, `find` | `POST /api/leads` (`buscarLeadsProspectHalo`) |
| campanha | `campaign`, `agent`, `outreach`, `create` | `POST /api/envio` com `confirmar: true` (`criarCampanhaProspectHalo`) |
| estado | `status`, `performance` | `GET /api/envio` (`consultarEstadoProspectHalo`) |

Os argumentos de cada chamada são montados por `montarArgumentos(schema, candidatos)`: cada propriedade do schema remoto recebe o primeiro candidato cujo padrão (regex) casa com o nome dela, ajustado ao tipo declarado (texto com vírgulas vira lista, lista vira texto, texto vira número). A resposta da busca é normalizada em `Lead[]` procurando a lista nas chaves `leads`, `prospects`, `results` ou `data` e os campos nas variantes mais comuns (`name`/`full_name`, `title`/`job_title`, `company`, `linkedin_url`, `intent_signal`/`signal`, `score`, com 0 a 1 convertido em 0 a 100). Se o app escolher a ferramenta errada, corrija no campo avançado "Mapeamento das ferramentas (JSON)" do cartão, por exemplo `{"buscar": "search_leads", "campanha": "create_campaign", "estado": "campaign_status"}`; "Testar conexão" avisa se um nome informado não existir no servidor.

Falhas do Prospect Halo (conexão, ferramenta não reconhecida, resposta em formato desconhecido, nenhum lead) respondem `502` com `{ error, exemploDisponivel: true }`; a tela mostra a mensagem e o botão "Ver com dados de exemplo", que repete a busca com `exemplo: true` (lista fictícia).

## Rotina
Em `/setup`, o cartão "Rotinas" permite criar "Resumo das prospecções geradas" (diária, semanal ou mensal): envia por e-mail ou Slack quantas campanhas foram criadas desde a última execução, com link para a mais recente. Quando não há nada novo, não envia.

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, com as ferramentas `buscar_leads_linkedin(cargos, setores, proposta, sinais?, remetente?, tom?, exemplo?)` (cria a campanha e devolve a lista pontuada; real com o Prospect Halo conectado, fictícia sem ele ou com `exemplo: true`), `escrever_sequencia(lead, proposta, remetente?, tom?)` (a sequência de um lead, informado diretamente ou vindo da busca) e `enviar_campanha(campanhaId, confirmar?)` (com `confirmar` ausente ou `false` devolve só o plano do envio, sem enviar; com `true` cria a campanha no Prospect Halo). Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup` e configure o assistente com o endereço (`https://<seu-app>/mcp`) e o código como `Authorization: Bearer <código>`.

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
Na interface que abre no navegador, escolha o transporte "Streamable HTTP", cole `http://localhost:3000/mcp` (ou o endereço do deploy) em URL e adicione o cabeçalho `Authorization: Bearer <código>` em "Custom Headers". Clique em "Connect": a aba "Tools" deve listar `buscar_leads_linkedin`, `escrever_sequencia` e `enviar_campanha`.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão em `lib/ai.ts`. |
| `PROSPECTHALO_URL` / `PROSPECTHALO_CODIGO` | Alternativa ao setup: endereço do servidor MCP e um código de acesso gerado no Prospect Halo. |
| `PROSPECTHALO_FERRAMENTAS` | Alternativa ao setup: mapeamento manual das ferramentas em JSON (`buscar`, `campanha`, `estado`). |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx                 tela única (perfil → lista de leads → mensagens por lead)
app/api/leads/route.ts       busca os leads e cria a campanha (POST), lista as últimas (GET), apaga o histórico (DELETE)
app/api/sequencias/route.ts  escreve as sequências dos leads escolhidos de uma campanha (POST)
app/api/envio/route.ts       plano de envio e envio confirmado pelo Prospect Halo (POST), andamento (GET)
app/r/[id]/page.tsx          campanha salva, por link (só leitura)
app/imprimir/[id]/page.tsx   folha de impressão (PDF)
app/setup/page.tsx           configuração da IA, notificações, código do MCP e rotinas
app/mcp/route.ts             endpoint MCP (JSON-RPC 2.0)
lib/types.ts                 Perfil, Lead, Sequencia, Campanha
lib/leads.ts                 validarPerfil, buscarLeads (Prospect Halo ou exemplo), obterCampanha (histórico tipo "prospeccao")
lib/prospecthalo.ts          cliente do Prospect Halo: escolha das ferramentas por palavra-chave, montarArgumentos, normalização dos leads
lib/envio.ts                 planoEnvio, enviarCampanha (grava externoId) e andamentoCampanha
lib/integracoes.ts           OPENROUTER, PROSPECTHALO (integracaoMCP com OAuth) e NOTIFICACOES
lib/sequencias.ts            escreverSequencia (IA ou demo) e escreverParaCampanha
lib/demo.ts                  10 leads fictícios e a sequência de exemplo
lib/ferramentas.ts           ferramentas MCP: buscar_leads_linkedin, escrever_sequencia e enviar_campanha
components/DialogoEnvio.tsx  diálogo de aprovação do envio (quantidade, mensagens, aviso, Confirmar)
lib/rotinas-do-app.ts        rotina "Resumo das prospecções geradas"
```
