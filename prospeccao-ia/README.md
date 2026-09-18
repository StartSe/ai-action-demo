# Prospecção com IA

Monta a lista de leads a partir do perfil de cliente ideal e escreve a primeira abordagem personalizada por lead. Área: Vendas.

## O que resolve
O time comercial perde horas montando listas de prospecção e escrevendo a primeira mensagem para cada lead. Este app pede o perfil de cliente ideal (segmento, cargo-alvo, porte, localização e o que sua empresa vende), busca ou gera a lista de leads, e escreve para cada um o gancho, o e-mail, a mensagem de LinkedIn, a de WhatsApp e o próximo passo de contato — prontos para copiar.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar a IA", fluxo OAuth) ou colando uma chave, e também pode conectar a busca de leads (Apollo), o enriquecimento com o site do lead (Bright Data), as notificações (Gmail, Outlook, Slack ou Resend) e o CRM — todos testáveis com um clique. Tudo fica salvo cifrado em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar, o app roda em modo demonstração: leads fictícios verossímeis e abordagens montadas a partir dos próprios dados do lead. Com a IA conectada e a busca de leads ainda não, o resultado avisa na tela que os leads são de exemplo e leva ao cartão da busca.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Rodar localmente
```bash
npm install
npm run dev              # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher, buscar os leads e já abrir a abordagem do primeiro.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3005
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/prospeccao-ia:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-prospeccao-ia (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3005:10000 -v prospeccao-ia-dados:/app/data ghcr.io/startse/prospeccao-ia:latest` e abra http://localhost:3005.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Ativa a IA que escreve as abordagens. Obtenha em https://openrouter.ai/keys |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `APOLLO_API_KEY` | Alternativa ao setup. Ativa a busca de leads reais na Apollo.io. Obtenha em https://app.apollo.io/#/settings/integrations/api |
| `BRIGHTDATA_API_KEY` | Alternativa ao setup. Ativa a pesquisa de mercado e sinais (busca na web, leitura de página, perfil de pessoa) usada pelo workspace de prospecção, e o enriquecimento do site do lead na abordagem. Obtenha em https://brightdata.com/cp/zones |
| `BRIGHTDATA_ZONE` | Alternativa ao setup. Nome da zona Web Unlocker (leitura de página) configurada na Bright Data. Padrão `web_unlocker1`. |
| `BRIGHTDATA_ZONE_LEITURA` | Campo "Zona de leitura" em Opções avançadas (padrão `web_unlocker1`); quando definida, tem prioridade sobre `BRIGHTDATA_ZONE` para leitura de página e perfil de pessoa. |
| `BRIGHTDATA_ZONE_BUSCA` | Campo "Zona de busca" em Opções avançadas (padrão `serp_api1`). Nome da zona SERP usada pela busca na web do workspace de prospecção. |
| `BRIGHTDATA_TETO_CONSULTAS` | Campo "Teto de consultas por prospecção" em Opções avançadas (padrão 60). Quantas buscas e leituras reais uma prospecção pode fazer antes de parar e terminar "pronta" com o aviso de orçamento; páginas já lidas nas últimas 24h são reaproveitadas do cache e não contam. |
| `BRIGHTDATA_BASE_URL` | Só para testes locais: substitui `https://api.brightdata.com` por um fornecedor falso. Não aparece em `/setup`. |
| `MCP_CRM_URL` / `MCP_CRM_CODIGO` | Alternativa ao setup. CRM (HubSpot, Zendesk, Intercom...) que recebe os leads aprovados como contatos e negócios. |
| `GOOGLE_CLIENT_ID_APP`, `GOOGLE_CLIENT_SECRET_APP`, `MICROSOFT_CLIENT_ID_APP`, `MICROSOFT_CLIENT_SECRET_APP` | Credenciais da suíte (equipe técnica, embutidas na imagem por `ARG`→`ENV` no `Dockerfile`) que liberam "Conectar meu Gmail"/"Conectar meu Outlook" no cartão Notificações. Sem elas, os botões não aparecem e o cartão segue por Slack, Resend ou SMTP. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

Qualquer serviço de enriquecimento de leads (Clay, Lusha, Hunter e outros) pode substituir a Apollo.io na rota `/api/leads` — basta trocar a chamada mantendo a resposta no formato `{ fonte, leads: [...] }` descrito abaixo.

## Estrutura
```
app/page.tsx              tela única (formulário + lista de leads + abordagem)
app/api/leads/route.ts    busca leads via Apollo.io ou gera leads de exemplo
app/api/abordagem/route.ts escreve a abordagem (gancho, e-mail, LinkedIn, WhatsApp, próximo passo)
app/setup/page.tsx        configuração inicial (chaves, OAuth, teste de conexão)
app/api/setup/            leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/leads/[id]/crm/   envia os leads escolhidos ao CRM conectado (um contato e um negócio por lead)
app/api/erros.ts          uma resposta de erro só para as rotas do app (traduz a falha da busca de leads)
app/api/status/route.ts   informa ao frontend o que está conectado (IA, busca, enriquecimento, avisos, CRM)
app/conta, app/entrar     conta de administrador da instância (criar e entrar)
app/historico             todos os resultados salvos, com busca por texto
app/api/health/route.ts   health check
components/ui.tsx         componentes visuais compartilhados pela suíte
components/setup.tsx      tela de setup genérica, gerada a partir de lib/integracoes.ts
lib/store.ts               configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts         tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts         integrações que este app precisa (IA, busca de leads, enriquecimento, avisos, CRM)
lib/acoes.ts               "o que fazer agora" de cada aviso/erro, compartilhado entre tela e servidor
lib/crm-mcp.ts             envio de um lead ao CRM conectado via MCP
lib/leads-vistos.ts        quem já foi entregue pela rotina semanal, para não repetir
lib/ultima-busca.ts        último perfil buscado, que pré-preenche a rotina semanal
lib/rotinas-do-app.ts      rotina "Leads novos toda semana"
lib/ai.ts                  cliente OpenRouter (askText, askJSON)
lib/demo.ts                leads e abordagens de exemplo do modo demonstração
lib/types.ts               tipos do domínio
lib/workspace.ts           tabelas do workspace: produto, ICP, prospecção, conta, lead e abordagem
Dockerfile                 build multi-stage com saída standalone
docker-compose.yml         sobe este app isolado (porta 3005)
render.yaml                blueprint do Render (runtime image)
```

## Retenção de dados
Contas e leads do workspace (produtos, prospecções, contas, leads e abordagens; ver `lib/workspace.ts`) são apagados automaticamente depois de um período sem atualização (`limparExpirados()`, rodada na inicialização do app): 180 dias para contas e leads de prospecções B2B (empresas e decisores), 90 dias para leads de prospecções B2C (pessoas físicas) — a retenção segue a jornada do perfil ideal (ICP) da prospecção. Apagar um lead ou uma conta apaga junto as abordagens escritas para ele; na jornada B2C, "Apagar dados desta pessoa" também está disponível a qualquer momento na tela da prospecção. Em B2C, só entram dados que a própria pessoa publicou em perfil ou página pública — o app nunca compra lista, nunca infere dado e nunca grava categoria sensível.

## Limites conhecidos
- A Apollo.io não devolve um "sinal" de prospecção pronto: quando a integração está conectada, o sinal exibido é montado a partir de campos públicos da organização (ano de fundação, setor, número estimado de funcionários), não de um evento recente real.
- O enriquecimento via Bright Data depende do site da empresa estar acessível publicamente e devolver HTML legível; falhas de enriquecimento não impedem a geração da abordagem (o texto sai sem esse contexto extra).
- Cada busca fica salva no histórico deste app (SQLite) até você apagar em "Últimos resultados" ou em Histórico; as abordagens escritas na tela ficam junto do resultado quando saem pela rotina semanal, e as escritas à mão valem enquanto a página está aberta.
- "Escrever para os 5 melhores" ordena pelos leads com mais material para personalizar (sinal, LinkedIn, site e cargo): a busca não devolve uma nota de qualidade do lead, e essa é a única leitura verdadeira de "melhor" aqui.
- Em modo demonstração, o conjunto de leads fictícios é fixo (15 pessoas): a rotina semanal esgota os "novos" depois da primeira execução para o mesmo perfil. Com a busca de leads conectada, isso não acontece.
