# Prospecção com IA

Workspace de prospecção com cinco áreas: Início, Produtos, Prospecções, Leads e Configurações. Área: Vendas.

## O que resolve
Prospectar hoje é manual e disperso: a cada busca a pessoa redigita o perfil de cliente ideal, não sabe por que um lead entrou na lista e escreve a mensagem sem estratégia. Este app guarda o produto e o perfil ideal (ICP) como algo salvo, pesquisa empresas e pessoas pelo perfil, qualifica cada uma com evidências item a item e uma hipótese de dor datada, define a estratégia da abordagem (objetivo, gancho, dor provável, tom, CTA) e só então escreve e-mail, LinkedIn e WhatsApp — coerentes entre si e prontos para copiar.

- **Início** — números do funil, prospecções recentes e um campo único para descrever em uma frase o que você quer encontrar.
- **Produtos** — o produto/serviço e um ou mais perfis de cliente ideal (ICP) por produto, com critérios, personas, dores e sinais de intenção.
- **Prospecções** — o assistente que cria uma busca (empresas, pessoas, uma empresa específica ou oportunidades por sinal, nas jornadas B2B e B2C) e acompanha a execução por etapas.
- **Leads** — todos os leads de todas as prospecções, com filtro por estado, prospecção e aderência, a ficha de cada um e a abordagem gerada.
- **Configurações** — `/setup`, com Bright Data, Exa, Tavily, SearchAPI e as demais integrações opcionais.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar a IA", fluxo OAuth) ou colando uma chave, e também pode conectar a pesquisa de mercado e sinais (Bright Data), a busca de leads como fonte alternativa de contatos (Apollo), Exa (pesquisa profunda), Tavily, SearchAPI e o CRM — todos testáveis com um clique. Tudo fica salvo cifrado em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar nada, o app roda em modo demonstração: produto, perfil ideal, prospecção, contas, leads e abordagem de exemplo prontos (Zetta Manutenção Industrial).

## Abordagem e qualificação aprofundada — versão 0.1.6

A criação da abordagem transmite etapas reais do servidor (contexto, estratégia, mensagens e salvamento). O resultado tem estratégia editável, mensagens por canal, cópia direta, regeneração com desfazer e exportação. Falhas da IA preservam a versão anterior e permitem nova tentativa; conteúdo incompleto não vira mensagem salva. Gerações simultâneas do mesmo lead compartilham a execução no processo.

Na ficha do lead, **Pesquisar e sugerir pontuação** inicia uma pesquisa em segundo plano. Marcar o status como **Qualificado** pela API da ficha também inicia a pesquisa quando há fontes conectadas e ainda não há uma avaliação concluída. O usuário pode sair e voltar; fontes, etapas, avisos e resultado ficam em SQLite. Uma reinicialização do servidor interrompe o trabalho ativo e a ficha oferece nova tentativa — não há um worker externo com retomada automática.

Com Bright Data, a pesquisa faz leituras novas com `web_data_linkedin_person_profile`, `web_data_linkedin_posts`, `web_data_instagram_profiles` e `web_data_instagram_posts`/`web_data_instagram_reels`, conforme os endereços disponíveis. Busca até três posts vinculados ao identificador do LinkedIn. Instagram só é consultado quando vinculado no perfil ou informado pelo vendedor; até dois posts ligados a esse perfil são lidos. Sem Bright Data, usa as fontes alternativas de pesquisa/leitura conectadas. Há um limite de dez operações de busca/leitura por execução, além dos limites por fonte; uma busca alternativa pode consultar mais de um fornecedor.

A pontuação sugerida soma **60 pontos para critérios do ICP/personas e 40 para necessidade relacionada ao produto**. A IA interpreta cada critério; o servidor exige URL coletada e citação literal antes de atribuir pontos. Critérios sem evidência ficam não verificados; a cobertura aparece separadamente e, sem nenhuma evidência verificável, não há nota. A pontuação não altera o status nem o papel do lead, e não representa probabilidade de compra. A pesquisa não usa atributos pessoais sensíveis para pontuar. Evidências confirmadas entram no contexto das novas estratégias e mensagens; textos já salvos são preservados.

Validação automatizada usa fornecedores simulados, incluindo falhas, geração concorrente, retomada da tela, reinício do processo, remoção do lead e pontuação sem evidências. As telas foram verificadas em desktop e celular; chamadas reais dependem das chaves e permissões das contas conectadas.

## Pesquisa com fontes opcionais — versão 0.1.5

Conecte somente as fontes que deseja usar em Configurações. Exa oferece os modos automático, rápido, profundo (padrão) e profundo com raciocínio; Tavily oferece básico ou avançado (padrão). Cada cartão permite salvar a chave, testar a conexão e limitar consultas por prospecção. Os testes de conexão também consomem a cota do fornecedor.

A busca web tenta **Exa → Bright Data → Tavily → SearchAPI**, avançando quando a fonte está desconectada, falha ou não encontra resultados compatíveis. Para contatos B2B, a Apollo continua sendo consultada primeiro; se falhar ou não adicionar contatos, a busca continua nas fontes web conectadas. A leitura de páginas tenta Bright Data, Exa e Tavily; quando só há um trecho real da busca, ele serve como evidência limitada, sem inventar conteúdo de página.

Bright Data continua usando MCP com `pro=1`: o catálogo dinâmico disponibiliza `search_engine`, `search_dataset` e ações de dados públicos, incluindo LinkedIn e Instagram. As novas fontes também expõem ações de busca e, para Exa/Tavily, leitura ao assistente.

O acompanhamento mostra fontes consultadas, resultados candidatos, falhas e limites. Falha de fornecedor não aparece como busca concluída vazia; resultados parciais recebem ressalvas. Uma fonte real conectada nunca é substituída por dados de demonstração. Rotinas e notificações permanecem ocultas na interface.

Os testes automatizados simulam as APIs externas, incluindo autenticação recusada, limites, respostas vazias e troca entre fontes. A validação com uma conta real depende das chaves salvas em Configurações.

Referências dos contratos: [Exa Search](https://exa.ai/docs/reference/search), [Exa Contents](https://exa.ai/docs/reference/get-contents), [Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search), [Tavily Extract](https://docs.tavily.com/documentation/api-reference/endpoint/extract), [SearchAPI Google](https://www.searchapi.io/docs/google) e [Bright Data MCP](https://github.com/brightdata/brightdata-mcp).

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Rodar localmente
```bash
npm install
npm run dev              # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para semear produto, perfil ideal, prospecção, leads e abordagem de exemplo.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3005
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/prospeccao-ia:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-prospeccao-ia (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3005:10000 -v prospeccao-ia-dados:/app/data ghcr.io/startse/prospeccao-ia:latest` e abra http://localhost:3005.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. O Blueprint usa o plano `starter` (pago) e um disco persistente de 1 GB, chamado `prospeccao-ia-dados`, montado em `/app/data`. Ele preserva a configuração, a conta, os produtos, os perfis de cliente, as prospecções e os leads entre deploys e reinícios.
- Para uma instância existente, aplique o Blueprint atualizado no Render e confirme o disco em `/app/data`. O push da imagem sozinho não adiciona o disco. Antes de migrar uma instância com dados efêmeros, faça backup de `/app/data`, incluindo o SQLite e a chave de cifragem; adicionar um disco não copia automaticamente os arquivos antigos.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Ativa a IA que qualifica leads, gera a hipótese de dor e escreve a estratégia e as mensagens. Obtenha em https://openrouter.ai/keys |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `APOLLO_API_KEY` | Alternativa ao setup. Ativa a Apollo.io como fonte alternativa de contatos. Obtenha em https://app.apollo.io/#/settings/integrations/api |
| `BRIGHTDATA_API_KEY` | Alternativa ao setup. Ativa a pesquisa de mercado e sinais (busca de empresas, pessoas e sinais públicos) — o motor de descoberta do workspace, atrás de `lib/descoberta.ts`. A chave já salva é reaproveitada pelo MCP HTTP com `pro=1`, sem zonas manuais. Obtenha em https://brightdata.com/cp/mcp |
| `BRIGHTDATA_TETO_CONSULTAS` | Campo "Teto de consultas por prospecção" em Opções avançadas (padrão 60). Quantas buscas e leituras reais uma prospecção pode fazer antes de parar e terminar "pronta" com o aviso de orçamento; páginas já lidas nas últimas 24h são reaproveitadas do cache e não contam. |
| `EXA_API_KEY` / `TAVILY_API_KEY` / `SEARCHAPI_API_KEY` | Credenciais opcionais; também podem ser salvas em Configurações. |
| `EXA_TIPO_BUSCA` | `auto`, `deep-lite`, `deep` (padrão) ou `deep-reasoning`. |
| `TAVILY_PROFUNDIDADE` | `basic` ou `advanced` (padrão). |
| `EXA_TETO_CONSULTAS` / `TAVILY_TETO_CONSULTAS` / `SEARCHAPI_TETO_CONSULTAS` | Limite de buscas e leituras por fonte e prospecção; padrão 10. Ao atingir, tenta outra fonte conectada. |
| `MCP_CRM_URL` / `MCP_CRM_CODIGO` | Alternativa ao setup. CRM (HubSpot, Zendesk, Intercom...) que recebe os leads aprovados como contatos e negócios. |
| `GOOGLE_CLIENT_ID_APP`, `GOOGLE_CLIENT_SECRET_APP`, `MICROSOFT_CLIENT_ID_APP`, `MICROSOFT_CLIENT_SECRET_APP` | Credenciais da suíte (equipe técnica, embutidas na imagem por `ARG`→`ENV` no `Dockerfile`) que liberam "Conectar meu Gmail"/"Conectar meu Outlook" no cartão Notificações. Sem elas, os botões não aparecem e o cartão segue por Slack, Resend ou SMTP. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx, components/Inicio.tsx        Início: funil, prospecções recentes, campo único de busca livre
app/produtos/**, components/Produtos*.tsx  Produtos e perfil de cliente ideal (ICP), com IA a partir do site
app/prospeccoes/**, components/Prospeccoes*.tsx  Assistente de 4 passos, execução assíncrona e resultado por modo
app/leads/**, components/Leads.tsx, FichaLead*.tsx, AbordagemLead.tsx  Lista de leads, ficha e abordagem
app/setup/page.tsx, components/setup.tsx   Configuração inicial (chaves, OAuth, teste de conexão)
app/api/setup/                             leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/produtos/, app/api/icps/           CRUD de produto e ICP
app/api/prospeccoes/                       criação, andamento, cancelamento e resultado de uma prospecção
app/api/leads/                             lista, ficha, status e abordagem de um lead
app/api/leads/[id]/crm/                    envia o lead ao CRM conectado (um contato e um negócio)
app/api/inicio/                            números do funil e prospecções recentes, exemplo e busca livre
app/r, app/imprimir                        link permanente e impressão da ficha + estratégia + mensagens
app/conta, app/entrar                      conta de administrador da instância (criar e entrar)
app/historico                              redirect para /prospeccoes (nome antigo da área, sem quebrar link salvo)
components/ui.tsx                          componentes visuais compartilhados pela suíte
components/setup.tsx                       tela de setup genérica, gerada a partir de lib/integracoes.ts
lib/workspace.ts                           tabelas do workspace: produto, ICP, prospecção, conta, lead, abordagem
lib/descoberta.ts                          busca, leitura de página e perfil, com fallback de demonstração
lib/brightdata.ts, brightdata-http.ts       catálogo e chamadas MCP HTTP com pro=1, sessões e JSON/SSE
lib/qualificacao.ts, qualificacao-ia.ts    aderência ao ICP com evidências e hipótese de dor
lib/estrategia.ts                          estratégia da abordagem e as três mensagens (e-mail, LinkedIn, WhatsApp)
lib/execucao-prospeccao.ts                 pipeline assíncrono de uma prospecção, por etapas
lib/interpretacao.ts                       interpreta o campo único de busca livre do Início
lib/rotinas-do-app.ts                      rotinas "Leads novos toda semana" e "Oportunidades novas"
lib/ferramentas.ts                         ferramentas MCP do workspace
lib/ai.ts                                  cliente OpenRouter (askText, askJSON)
lib/demo.ts                                produto, ICP, prospecção, contas, leads e abordagem de exemplo
lib/store.ts                               configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
Dockerfile                                 build multi-stage com saída standalone
docker-compose.yml                         sobe este app isolado (porta 3005)
render.yaml                                blueprint do Render (runtime image)
```

## Exceção da suíte
Este é o único app com mais de um destino além de `/setup` no `Topbar` (`Início`, `Produtos`, `Prospecções`, `Leads`, `Configurações`) — a exceção está registrada no `PADRAO.md` da suíte, porque o produto é um fluxo de prospecção com estado (produto/ICP → prospecção → descoberta → qualificação → pessoas-chave → abordagem) que não cabe numa tela única de formulário + resultado. Os outros dezessete apps da suíte continuam de tela única, sem menu.

## Retenção de dados
Contas e leads do workspace (produtos, prospecções, contas, leads e abordagens; ver `lib/workspace.ts`) são apagados automaticamente depois de um período sem atualização (`limparExpirados()`, rodada na inicialização do app): 180 dias para contas e leads de prospecções B2B (empresas e decisores), 90 dias para leads de prospecções B2C (pessoas físicas) — a retenção segue a jornada do perfil ideal (ICP) da prospecção. Apagar um lead ou uma conta apaga junto as abordagens escritas para ele; na jornada B2C, "Apagar dados desta pessoa" também está disponível a qualquer momento na tela da prospecção. Em B2C, só entram dados que a própria pessoa publicou em perfil ou página pública — o app nunca compra lista, nunca infere dado e nunca grava categoria sensível.

## Limites conhecidos
- A Apollo.io não devolve um "sinal" de prospecção pronto: quando ela é a fonte de um contato, o texto "Sobre a empresa" vem de campos públicos da organização (ano de fundação, setor, número estimado de funcionários), não de um evento recente real — sinal, no sentido de evidência datada, é sempre da pesquisa pública (Bright Data).
- A descoberta em lote (`descobrirEmLote`) continua como busca na web + leitura de página. Search Dataset fica disponível como ação de pesquisa com filtros explícitos, sem iniciar uma compra ou exportação assíncrona. O teto de consultas por prospecção (padrão 60) e o cache de páginas de 24h continuam valendo.
- Uma conta ou pessoa sem nenhuma evidência verificável não entra na lista; um critério sem dado nunca conta como atendido, aparece como "não foi possível verificar".
- Em modo demonstração, o exemplo (produto, ICP, prospecção, 3 contas, 6 pessoas, 1 abordagem) é fixo e marcado como exemplo em toda tela onde aparece; "Limpar exemplo" remove só o que ele criou.
- O modelo antigo de busca única (`lib/historico.ts`, `app/historico`) continua funcionando em paralelo para o link permanente, a impressão e o envio ao CRM de resultados anteriores ao workspace; toda tela e rota novas usam só o modelo do workspace (`lib/workspace.ts`).

## Bright Data via MCP

O teste e as pesquisas usam `POST https://mcp.brightdata.com/mcp?token=<chave>&pro=1`
(Streamable HTTP). O cliente inicializa a sessão, envia `notifications/initialized` e aceita respostas
JSON ou SSE. A chave continua em `BRIGHTDATA_API_KEY`; zonas antigas salvas são ignoradas e não
precisam ser apagadas. O teste de conexão lista o catálogo, executa Search Engine e Scrape as Markdown
e informa quais capacidades adicionais estão disponíveis. Ter uma ação no catálogo não comprova saldo
ou permissão para executar todos os datasets; falhas são informadas quando a ação é chamada.

O MCP hospedado pode envolver o resultado em um aviso `SECURITY NOTICE` e marcadores com um id.
O cliente confere o id do aviso e dos dois marcadores antes de extrair JSON ou Markdown; esses
metadados de transporte não entram no resumo da empresa. O conteúdo extraído continua sendo dado externo.
Chamadas de ferramentas têm limite de três minutos; inicialização e catálogo, de 30 segundos.
Se esse prazo for excedido, o teste informa demora da consulta, sem confundir com chave recusada.

- Busca: `search_engine` com `engine: "google"` e `cursor` para paginação.
- Páginas: `scrape_as_markdown`. Perfis, empresas, vagas e posts do LinkedIn, além de perfis,
  posts e reels do Instagram, usam a extração estruturada correspondente quando disponível.
  Falhas dessa extração tentam Markdown; chave recusada, saldo e teto de consultas são respeitados.
- Assistentes conectados ao MCP deste app usam `listar_acoes_pesquisa` para obter nomes e schemas
  atuais e `executar_acao_pesquisa` para chamar uma ação. O catálogo inclui todas as `web_data_*`
  disponibilizadas pela conta (inclusive busca de pessoas e comentários), Search Dataset e as buscas
  e leituras em lote. Ações de interação com navegador ficam de fora.
- Para Search Dataset, consulte `list_dataset_fields` com o `dataset_id` antes de montar o filtro de
  `search_dataset`. Passe os campos, operadores, tamanho e cursor conforme o schema retornado pelo
  servidor. A resposta mantém `hits`, `total_hits` e `search_after` para a próxima página.

Sem chave, os fluxos existentes continuam em demonstração. Com chave, uma falha de conexão ou de
ferramenta nunca é substituída por dados fictícios. Tokens e respostas externas de erro não são
registrados em logs nem devolvidos ao usuário.

Referências oficiais: [conexão HTTP Pro](https://brightdata.com/blog/ai/truefoundry-with-bright-data)
e [schemas e implementação das ferramentas](https://github.com/brightdata/brightdata-mcp/blob/main/server.js).

Validação local: `npm test`, `npm run lint` e `npm run build`. Os testes usam um servidor simulado;
a conta publicada precisa ser validada no botão de teste do setup após atualizar o app.

Rotinas e Notificações ficam ocultas na interface, incluindo o convite para receber leads semanalmente. As configurações e os serviços existentes são preservados.

Criação de produto por link (0.1.3): o modal acompanha a leitura da página, a análise do produto e do perfil ideal e a preparação dos campos para revisão. Exibe tempo decorrido e permite cancelar sem perder o endereço. A leitura usa `scrape_as_markdown` da Bright Data; falhas pedem corrigir o link ou colar uma descrição, sem gerar um produto apenas a partir da URL. A resposta da IA usa modo JSON, recuperação de formato e validação dos campos, com uma nova tentativa quando vier incompleta. O produto só é salvo após a revisão do usuário.

Validação: `npm test` cobre extração, falhas e transmissão do progresso; `npm run build` verifica o build de produção. Referências: [ferramentas Bright Data](https://github.com/brightdata/brightdata-mcp/blob/main/assets/Tools.md) e [Response Healing do OpenRouter](https://openrouter.ai/docs/guides/features/plugins/overview).

Na versão 0.1.4, os cards de produtos destacam a nova prospecção e separam editar e apagar, com confirmação e tratamento de falha na exclusão. O assistente de prospecção envia o perfil efetivamente exibido, inclusive quando ele foi escolhido automaticamente; o botão mostra o envio em andamento e permite tentar novamente após uma falha sem perder os critérios.
