# Bússola de IA

Versão **0.2.0** · [Notas da versão](./CHANGELOG.md).

Um observatório de inovação com IA para o gestor acompanhar assessments de **empresas, áreas e times**, da criação das perguntas ao plano de ação.

## A experiência

- **Painel do gestor:** indicadores calculados das coletas, busca, filtros por tipo de grupo/status, meta de participação, prazos, respostas e último diagnóstico de cada assessment. Atualiza a cada 30 segundos enquanto a página está visível.
- **Oficina de criação:** informe empresa, área (opcional), setor, meta e missão. O Arquiteto adapta as perguntas usando IA quando conectada; sem conexão, usa um modelo com adaptação limitada às perguntas abertas. O revisor de cobertura usa regras automáticas. Revise as perguntas por dimensão, personalize no editor completo e salve na biblioteca antes de gerar o link.
- **Jornada do participante:** uma dimensão por etapa, escala de 1 a 5 com controles acessíveis, navegação para revisar respostas e recuperação de falhas de envio sem apagar o preenchimento. Não solicita nome nem e-mail. Área e cargo são opcionais; o gestor pode consultar as respostas.
- **Sala de análise:** radar interativo, forças/lacunas, comparação entre áreas e respostas abertas. O Analista interpreta os sinais; o Crítico questiona a amostra e os pressupostos; o Estrategista propõe experimentos. Cada perspectiva informa a origem (IA ou regras automáticas) e as dimensões usadas como evidência.
- **Da leitura à ação:** simule uma mudança de nota no laboratório de cenários (hipótese aritmética, sem alterar o diagnóstico), registre ações concluídas no plano e exporte relatório por impressão/PDF, texto ou CSV. Ações concluídas são persistidas por diagnóstico.

O questionário modelo tem 24 perguntas de escala e duas abertas, em seis dimensões. Os números são calculados no servidor. A IA interpreta os agregados e as respostas abertas; não define notas. Falhas de serviço ou respostas inválidas usam leitura automática identificada. O exemplo (`/?exemplo=1`) contém oito respostas fictícias e é explicitamente rotulado.

A participação conta **submissões, não pessoas únicas verificadas**. A meta do grupo é independente do limite técnico do link e pode ser ultrapassada. Encerrar uma coleta impede novos envios, mas mantém seu histórico e suas respostas mesmo após reiniciar o app. O envio grava as duas coleções de respostas na mesma transação para respeitar o limite sob concorrência.

Opcionais: um quadro conectado via MCP recebe os próximos passos como cartões; e-mail ou Slack podem receber a rotina “Resumo da coleta”, configurada em `/setup`.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo e testa a conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar, o app permite criar coletas reais e calcular diagnósticos com leitura automática (sem IA). O exemplo ilustrativo continua disponível.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher e mostrar a avaliação de exemplo sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3012
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/bussola-ia:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-bussola-ia (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3012:10000 -v bussola-ia-dados:/app/data ghcr.io/startse/bussola-ia:latest` e abra http://localhost:3012.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, para que assistentes como Claude ou ChatGPT chamem as ferramentas `avaliar_respostas` (calcula o diagnóstico a partir de respostas já coletadas) e `resultado_avaliacao` diretamente. Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup` e configure o assistente com o endereço (`https://<seu-app>/mcp`) e o código como `Authorization: Bearer <código>`.

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
Na interface que abre no navegador, escolha o transporte "Streamable HTTP", cole `http://localhost:3000/mcp` (ou o endereço do deploy) em URL e adicione o cabeçalho `Authorization: Bearer <código>` em "Custom Headers". Clique em "Connect": a aba "Tools" deve listar `avaliar_respostas`; ao executá-la, o resultado devolvido é o mesmo objeto (avaliação com análise) que a rota `/api/bussola` produz.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx                entrada do painel do gestor
components/observatorio/    painel, oficina, bússola e sala de análise
components/ResultadoAvaliacao.tsx  relatório para impressão e exportação
lib/assessment-input.ts     validação de grupos, perguntas e saída do Arquiteto
lib/conselho.ts             perspectivas automáticas e validação dos agentes
lib/conselho-ia.ts          Crítico e Estrategista via IA com fallback individual
app/api/bussola/painel/     coletas e diagnósticos associados
app/api/bussola/[id]/plano/ conclusão persistida de ações
app/api/bussola/route.ts    diagnóstico de exemplo (dados fictícios); a análise real é app/api/bussola/link/[codigo]/analisar
app/mcp/route.ts            endpoint MCP (JSON-RPC 2.0) para assistentes de IA
app/api/mcp/token/route.ts  gera, consulta e revoga o código de acesso do endpoint MCP
app/setup/page.tsx          configuração inicial (chaves, OAuth, teste de conexão, acesso MCP)
app/api/setup/              leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts     informa ao frontend se a IA está conectada
app/api/health/route.ts     health check
components/ui.tsx           componentes visuais compartilhados pela suíte
components/setup.tsx        tela de setup genérica, gerada a partir de lib/integracoes.ts
components/AcessoMCP.tsx    cartão do /setup para gerar/revogar o acesso MCP
lib/store.ts                configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts          tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts          integrações que este app precisa
lib/ai.ts                   cliente OpenRouter (askText, askJSON, askWithTools)
lib/mcp.ts                  protocolo MCP (JSON-RPC 2.0), código de acesso e limite de chamadas
lib/ferramentas.ts          ferramentas expostas via MCP (avaliar_respostas)
lib/modelo.ts               questionário modelo (6 dimensões, 24 perguntas de escala + 2 de texto)
lib/questionarios.ts        questionários editados e salvos (SQLite)
lib/link-avaliacao.ts       cria o link público de coleta e registra o callback que grava as respostas
lib/respostas.ts            respostas reais recebidas por um link (SQLite), ligadas ao questionário
lib/bussola.ts              lógica de geração da avaliação, usada pela rota HTTP e pela ferramenta MCP
lib/demo.ts                 avaliação de exemplo do modo demonstração
lib/types.ts                tipos do domínio
components/EditorPerguntas.tsx      editor das perguntas do questionário
components/DialogoLinkAvaliacao.tsx diálogo "Criar link de avaliação" (prazo, limite, link e Copiar)
Dockerfile                  build multi-stage com saída standalone
docker-compose.yml          sobe este app isolado
render.yaml                 blueprint do Render (runtime image)
```

## Testes e decisões de implementação

```bash
npm install
npx playwright install chromium
npm run lint
npm test                    # testes de domínio + build + testes de navegador
npm run test:unit           # domínio, persistência e contratos de IA
npm run test:e2e            # requer build atualizado
```

O Playwright sobe a versão de produção na porta 3118, com SQLite temporário e autenticação habilitada. Cria uma conta de teste, testa o fluxo completo, falhas de rede, demonstração, filtros, limites concorrentes, PDF/CSV e reabertura do plano. As verificações axe cobrem WCAG A/AA nas telas novas; capturas desktop/mobile ficam em `test-results/` (ignorado pelo Git).

Os contratos de IA são testados com provedor simulado, incluindo JSON incompleto e fallback parcial. Não exigem chave nem geram custo externo. O uso real depende de uma conexão configurada em `/setup`. Há limite de 45 segundos por chamada ao provedor. Uma análise completa conectada usa três chamadas: Analista, Crítico e Estrategista; respostas JSON malformadas podem gerar a tentativa adicional já prevista na camada de IA.

`PLANO-EXPERIENCIA.md` registra a direção visual, as etapas e a auditoria. Os novos campos de grupo são opcionais para manter compatibilidade com registros anteriores. Diagnósticos antigos permanecem na biblioteca; apenas os novos armazenam vínculo explícito ao código do assessment. A conta de gestor permanece única por instalação, como na base original.
