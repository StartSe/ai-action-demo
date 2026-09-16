# Voz do Cliente

Leitura de comentários de clientes com IA: agrupa por tema, mede o sentimento, calcula o NPS e prioriza o que fazer. Área: Experiência do Cliente e Marketing.

## O que resolve
Centenas de comentários de NPS, avaliações de loja e tickets de suporte chegam todo mês e ninguém lê tudo. Este app lê por você: cola-se (ou envia-se um arquivo CSV/TXT com) os comentários e a IA devolve um resumo executivo, a distribuição de sentimento, o NPS calculado a partir das notas, os temas mais citados com uma ação sugerida para cada um, o que os clientes mais elogiam e de que mais reclamam, citações reais marcantes e uma matriz de prioridade (impacto x esforço) para decidir por onde começar.

Cada análise processa no máximo **500 comentários**. Acima disso, o app avisa e analisa os 500 primeiros. Acima de **120 comentários**, a análise é feita em lotes: cada lote é classificado (tema + sentimento por comentário) e uma chamada final consolida os agregados em um único relatório — assim o app continua rápido e preciso mesmo em volumes grandes. O NPS nunca é estimado pela IA: é sempre calculado no servidor a partir das notas 0–10 informadas (promotores 9–10, neutros 7–8, detratores 0–6).

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo e testa a conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar, o app roda em modo demonstração com uma análise de exemplo cujas contagens são derivadas do número real de comentários enviados.

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
docker compose up --build   # http://localhost:3010
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/voz-do-cliente:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-voz-do-cliente (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3010:10000 -v voz-do-cliente-dados:/app/data ghcr.io/startse/voz-do-cliente:latest` e abra http://localhost:3010.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `NOTIFICACOES_*` | Alternativa ao cartão "Notificações" (canal, destino, chave do Resend ou SMTP) para a análise semanal e o alerta de detratores. |
| `MCP_CRM_URL` / `MCP_CRM_CODIGO` | Alternativa ao cartão "CRM (MCP)": endereço e código de acesso do HubSpot, Zendesk ou Intercom para importar tickets. |
| `MCP_DADOS_URL` / `MCP_DADOS_CODIGO` | Alternativa ao cartão "Fonte de dados (MCP)": planilha viva de onde o app lê as notas de NPS. `MCP_DADOS_FERRAMENTA` e `MCP_DADOS_ARGUMENTOS` (JSON) escolhem a leitura e a aba. |
| `GOOGLE_CLIENT_ID_APP`, `GOOGLE_CLIENT_SECRET_APP`, `MICROSOFT_CLIENT_ID_APP`, `MICROSOFT_CLIENT_SECRET_APP` | Credenciais da suíte (equipe técnica, embutidas na imagem) que liberam "Conectar meu Gmail"/"Conectar meu Outlook" no cartão Notificações. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx                    tela única (formulário + resultado)
app/api/analisar/route.ts       análise de comentários (com classificação em lotes acima de 120 comentários)
app/api/pesquisas/              pesquisa NPS por link público (criar, listar, encerrar, analisar respostas)
app/api/tickets/importar/       importa tickets do CRM conectado (HubSpot, Zendesk, Intercom) para a análise
app/api/planilha/importar/      lê as notas de NPS da planilha viva conectada para a análise
app/conta, app/entrar           criar a conta de administrador e entrar (uma conta por instância)
app/historico/page.tsx          todos os resultados salvos, com busca
app/setup/page.tsx              configuração inicial (chaves, OAuth, teste de conexão)
app/api/setup/                  leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts         informa ao frontend se a IA está conectada
app/api/health/route.ts         health check
components/ui.tsx               componentes visuais compartilhados pela suíte
components/setup.tsx            tela de setup genérica, gerada a partir de lib/integracoes.ts
components/CampoArquivo.tsx     upload de CSV/TXT com seleção de coluna
components/BarraSentimento.tsx  barra de sentimento e bloco de NPS
components/MatrizPrioridade.tsx matriz de prioridade (impacto x esforço)
components/AcessoMCP.tsx        cartão "Usar dentro do seu assistente" (código de acesso do MCP)
lib/store.ts                    configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts              tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts              integrações que este app precisa
lib/ai.ts                       cliente OpenRouter (askText, askJSON)
lib/demo.ts                     análise de exemplo do modo demonstração; COMENTARIOS_EXEMPLO tem os 45 comentários (com nota NPS) do botão de exemplo
lib/analise-salva.ts            monta o resultado salvo e a resposta JSON, igual para as quatro fontes
lib/erro-fonte.ts               erros de fonte externa (CRM, planilha) com frase pronta e ação; 400 "vazio" vira aviso inline
lib/tickets-mcp.ts              importa tickets do CRM conectado (MCP) como comentários
lib/planilha-mcp.ts             lê a planilha de NPS conectada (MCP) como comentários com nota
lib/conta.ts                    conta de administrador e sessão (node:crypto + node:sqlite)
lib/parse.ts                    leitura de CSV/TXT no navegador
lib/types.ts                    tipos do domínio
Dockerfile                      build multi-stage com saída standalone
docker-compose.yml              sobe este app isolado
render.yaml                     blueprint do Render (runtime image)
```
