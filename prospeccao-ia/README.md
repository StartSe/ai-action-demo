# Prospecção com IA

Versão **0.4.0**. Veja as [notas de versão](CHANGELOG.md).

Workspace de prospecção com cinco áreas: Início, Produtos, Prospecções, Leads e Configurações. Área: Vendas.

## O que resolve
Prospectar hoje é manual e disperso: a cada busca a pessoa redigita o perfil de cliente ideal, não sabe por que um lead entrou na lista e escreve a mensagem sem estratégia. Este app guarda o produto e o perfil ideal (ICP) como algo salvo, pesquisa empresas e pessoas pelo perfil, qualifica cada uma com evidências item a item e uma hipótese de dor datada, define a estratégia da abordagem (objetivo, gancho, dor provável, tom, CTA) e só então escreve e-mail, LinkedIn e WhatsApp — coerentes entre si e prontos para copiar.

- **Início** — números do funil, prospecções recentes e um campo único para descrever em uma frase o que você quer encontrar.
- **Produtos** — o produto/serviço e um ou mais perfis de cliente ideal (ICP) por produto, com critérios, personas, dores e sinais de intenção.
- **Prospecções** — o assistente que cria uma busca (empresas, pessoas, uma empresa específica ou oportunidades por sinal, nas jornadas B2B e B2C) e acompanha a execução por etapas.
- **Leads** — todos os leads de todas as prospecções, com filtro por estado, prospecção e aderência, a ficha de cada um e a abordagem gerada.
- **Configurações** — `/setup`, com a conta de IA (OpenRouter ou ChatGPT), Bright Data, Exa, Tavily, SearchAPI e as demais integrações opcionais.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter (modelo gratuito por padrão; GPT, Gemini, Claude e DeepSeek entre os pagos) ou pela assinatura ChatGPT, com a conta escolhida explicitamente em Configurações.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. No cartão **Inteligência artificial**, escolha a conta que vai qualificar os leads e escrever as abordagens:

- **OpenRouter:** conecte com um clique ("Conectar com OpenRouter", fluxo OAuth) ou cole uma chave, escolha o modelo (Automático, gratuitos, "Mais usados" como GPT-5.4 Mini, Gemini 3.8 Flash e Claude Sonnet 5, ou qualquer outro do catálogo) e teste a conexão.
- **ChatGPT:** clique em **Conectar com ChatGPT**, abra a página oficial da OpenAI e informe o código mostrado. Se solicitado, habilite o login por código de dispositivo nas configurações de segurança do ChatGPT. A conexão usa o [Codex App Server oficial](https://developers.openai.com/codex/app-server) (`@openai/codex` 0.155.1, o mesmo do Radar de Sinais e do Build Agentflows); o uso segue o acesso e os limites do seu plano, e os modelos listados são os da sua conta.

A conta escolhida atende a todo o app: leitura de produto pelo site, qualificação com evidências, hipótese de dor, estratégia e mensagens, interpretação da busca livre e as ferramentas MCP. Uma falha na conta ChatGPT nunca cai no OpenRouter (nem o contrário) e nunca vira exemplo: a tela explica o que houve e oferece o caminho. A escolha fica em SQLite, as chaves do OpenRouter permanecem cifradas e a sessão ChatGPT fica isolada em `DATA_DIR/chatgpt` (preserve o disco de dados). O processo do conector roda em ambiente restrito, sem acesso às demais credenciais, sem terminal, arquivos ou navegador.

No mesmo `/setup` você também conecta a pesquisa de mercado e sinais (Bright Data), a busca de contatos via ProspectHalo (MCP), Exa (pesquisa profunda), Tavily, SearchAPI e o CRM — todos testáveis com um clique. Tudo fica salvo cifrado em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar nada, o app roda em modo demonstração: produto, perfil ideal, prospecção, contas, leads e abordagem de exemplo prontos (Zetta Manutenção Industrial).

## Mensagens específicas para cada lead — versão 0.4.0

Estratégia, geração, edição e regeneração usam a descrição e aplicações do produto, o resumo da empresa, sinais com origem, trechos de evidências e pesquisa complementar. Dores típicas do ICP e informações não confirmadas ficam identificadas como hipóteses ou lacunas. O texto deve conectar um detalhe público a uma aplicação concreta do produto e terminar com uma pergunta sobre o assunto; sem evidência, pergunta sobre o processo sem fingir familiaridade.

O botão **Personalizar mensagem** revisa o canal aberto de uma abordagem já salva, usando a versão anterior como referência. Preserva os outros canais e a estratégia e permite desfazer. Novos textos passam por uma revisão automática quando há fórmulas genéricas conhecidas, marcadores não preenchidos ou LinkedIn com mais de 300 caracteres. Se a revisão continuar inválida, mantém a mensagem anterior. Textos salvos não são reescritos automaticamente no deploy.

## Conta de IA e jornada Produto › Prospecção › Leads — versão 0.3.0

Além da escolha da conta de IA descrita acima, a jornada principal ficou mais fácil de ler sem perder nada do que já existia:

- **Nova prospecção** mostra os quatro passos como um indicador numerado (o mesmo componente da suíte) com uma orientação curta por passo, no lugar da frase "Passo X de 4".
- **Página da prospecção** abre com o tipo de busca e a data em chips e o funil em cinco números (encontrados, qualificados, selecionados, contatados, responderam). Quando há uma lista de pessoas, esses números são as próprias abas de filtro. Nos cartões de empresa, as evidências aparecem resumidas ("3 atendem · 1 sem verificação") e abrem item a item ao clicar. O link para ajustar os critérios agora diz "Editar perfil ideal".
- **Ficha do lead** aberta como página fica em duas colunas no desktop: quem é a pessoa, evidências, sinais e empresa à esquerda; situação no funil (papel e status) e qualificação aprofundada à direita. No painel lateral da exploração de empresa, a ficha continua em uma coluna.
- **Leads** ganhou a coluna "Abordagem" (criar ou ver a abordagem direto da lista).
- **Configurações** mostra o cartão da IA como conectado pela conta escolhida, e o menu de modelos do OpenRouter traz um grupo "Mais usados" com GPT, Gemini, Claude, DeepSeek, Grok, Llama, Mistral e Qwen, sempre conferidos no catálogo vivo (variantes de lote, imagem, áudio e código ficam de fora).

Validação: `npm test` (65 testes, incluindo protocolo do conector com respostas simuladas, escolha de conta sem fallback e curadoria do catálogo), `npm run lint`, `npm run build`, verificadores de padrão e jargão da suíte. O login em uma conta ChatGPT real e a geração com ela não fizeram parte da validação automatizada.

## Abordagem e qualificação aprofundada — versão 0.1.6

A criação da abordagem transmite etapas reais do servidor (contexto, estratégia, mensagens e salvamento). O resultado tem estratégia editável, mensagens por canal, cópia direta, regeneração com desfazer e exportação. Falhas da IA preservam a versão anterior e permitem nova tentativa; conteúdo incompleto não vira mensagem salva. Gerações simultâneas do mesmo lead compartilham a execução no processo.

Na ficha do lead, **Pesquisar e sugerir pontuação** inicia uma pesquisa em segundo plano. Marcar o status como **Qualificado** pela API da ficha também inicia a pesquisa quando há fontes conectadas e ainda não há uma avaliação concluída. O usuário pode sair e voltar; fontes, etapas, avisos e resultado ficam em SQLite. Uma reinicialização do servidor interrompe o trabalho ativo e a ficha oferece nova tentativa — não há um worker externo com retomada automática.

Com Bright Data, a pesquisa faz leituras novas com `web_data_linkedin_person_profile`, `web_data_linkedin_posts`, `web_data_instagram_profiles` e `web_data_instagram_posts`/`web_data_instagram_reels`, conforme os endereços disponíveis. Busca até três posts vinculados ao identificador do LinkedIn. Instagram só é consultado quando vinculado no perfil ou informado pelo vendedor; até dois posts ligados a esse perfil são lidos. Sem Bright Data, usa as fontes alternativas de pesquisa/leitura conectadas. Há um limite de dez operações de busca/leitura por execução, além dos limites por fonte; uma busca alternativa pode consultar mais de um fornecedor.

A pontuação sugerida soma **60 pontos para critérios do ICP/personas e 40 para necessidade relacionada ao produto**. A IA interpreta cada critério; o servidor exige URL coletada e citação literal antes de atribuir pontos. Critérios sem evidência ficam não verificados; a cobertura aparece separadamente e, sem nenhuma evidência verificável, não há nota. A pontuação não altera o status nem o papel do lead, e não representa probabilidade de compra. A pesquisa não usa atributos pessoais sensíveis para pontuar. Evidências confirmadas entram no contexto das novas estratégias e mensagens; textos já salvos são preservados.

Validação automatizada usa fornecedores simulados, incluindo falhas, geração concorrente, retomada da tela, reinício do processo, remoção do lead e pontuação sem evidências. As telas foram verificadas em desktop e celular; chamadas reais dependem das chaves e permissões das contas conectadas.

## Pesquisa adaptativa e acompanhamento — versão 0.6.1

Conecte somente as fontes que deseja usar em Configurações. Exa oferece os modos automático, rápido, profundo (padrão) e profundo com raciocínio; Tavily oferece básico ou avançado (padrão). Cada cartão permite salvar a chave, testar a conexão e limitar consultas por prospecção. Os testes de conexão também consomem a cota do fornecedor.

A descoberta B2B de pessoas trabalha em **rodadas de até duas fontes**: ProspectHalo, dataset e Search Engine da Bright Data, Exa, Tavily e SearchAPI. Intercala resultados e unifica URLs. Para de consultar novas fontes quando há candidatos suficientes com contexto do cargo e da empresa; isso não equivale a qualificá-los. Se faltar informação, continua por outras fontes. A busca geral de empresas e sinais também consulta fontes em pares e combina os resultados.

Com a IA conectada, uma revisão do plano pode reordenar as fontes restantes e propor até duas formas equivalentes de escrever o cargo. IDs fora das opções conectadas são rejeitados. Sem IA ou em caso de falha, a ordem padrão continua funcionando. Há no máximo oito estratégias de descoberta; não são iniciadas novas rodadas após três minutos. As chamadas já iniciadas respeitam seus próprios prazos.

A verificação de perfis usa dois trabalhadores. Todo candidato selecionado para verificação com URL pessoal do LinkedIn passa por `web_data_linkedin_person_profile` quando a ação está disponível, mesmo se a busca ou o dataset já trouxe nome, cargo, empresa e contexto detalhado. Leituras do mesmo endereço em cache são reaproveitadas por até 24 horas, e candidatos já verificados não são consultados novamente. Person Profile/Markdown pode acrescentar descrição, experiência e outras informações públicas. Para lacunas de identidade, também usa LinkedIn People Search por nome (se anunciado no catálogo e com os parâmetros exigidos). Se o conteúdo continuar insuficiente, tenta até duas buscas no formato `"Nome Completo" "linkedin.com/in/perfil"`, pela Bright Data ou pelas fontes opcionais conectadas. Só incorpora resultados que apontem para o mesmo perfil e contenham o nome completo; nesta etapa incremental, páginas externas sem essa identidade não são incorporadas. Exa Contents e Tavily Extract continuam como alternativas de leitura. Não repete uma leitura já registrada para o mesmo endereço. Homônimos só são associados pelo mesmo URL de perfil; extração por IA exige nome correspondente ao titular e uma citação literal com cargo e empresa atuais. Educação, empregos anteriores e referências a terceiros não sustentam o vínculo. Novos perfis deixam de ser agendados após cinco minutos. Os limites de consultas e o cancelamento continuam valendo.

Em buscas por empresa, Exa combina busca web restrita a perfis do LinkedIn e categoria `people` com consulta em linguagem natural; Tavily combina trechos relevantes e conteúdo Markdown, com extração avançada; SearchAPI usa Google com operadores de busca e variações de consulta. Outras APIs dos fornecedores não são acionadas indiscriminadamente. Os tetos de cada fonte continuam valendo.

Na pesquisa por uma empresa específica, cada pessoa precisa de vínculo profissional explícito com a empresa atual, pelo cabeçalho do próprio perfil ou por campos estruturados. A empresa solicitada nunca é copiada para o lead como se fosse evidência. Leituras atuais com outra empresa prevalecem sobre títulos antigos. Candidatos irrelevantes não consomem as primeiras vagas: a descoberta continua se faltarem vínculos confirmados e pode tentar a empresa sem restringir cargos. O limite é aplicado após essa conferência. Menções em cursos, publicações ou empregos anteriores não confirmam vínculo. A descoberta continua sujeita à atualização e à cobertura dos fornecedores.

Ao repetir a exploração de uma empresa, pessoas que já existem no mesmo produto aparecem em **Contatos já encontrados**, com acesso à ficha e ao histórico existentes. Não são duplicadas, requalificadas nem descartadas silenciosamente para dar lugar a outros nomes. URLs regionais e variantes de idioma do LinkedIn são unificadas.

Para contatos B2B, o ProspectHalo complementa a web e o dataset da Bright Data. O fluxo usa `list_dataset_fields` antes de montar filtros e só usa o dataset quando todos os filtros têm correspondência. Pessoas e empresas recebem evidências; sem confirmação de todos os critérios avaliados, o contato permanece pesquisado. A etapa de sinais também pesquisa notícias e páginas além do site institucional.

No cartão ProspectHalo, cole a chave ou o link oficial `https://app.prospecthalo.ai/api/agent/v1/mcp?key=<sua-chave>`. O app extrai a chave do link, salva cifrada e envia por `Authorization: Bearer`, sem segredo na URL. A conexão usa inicialização MCP, sessões, catálogo dinâmico e respostas JSON/SSE. O teste consulta contexto e disponibilidade das ferramentas, sem iniciar busca. É necessário vincular sua conta LinkedIn no ProspectHalo para pesquisar.

As ferramentas de contexto, ICP, contas LinkedIn, buscas e leitura de leads também ficam disponíveis em `listar_acoes_pesquisa` / `executar_acao_pesquisa`. Criação de campanhas e envio de mensagens não fazem parte desta versão. Uma busca `qualifying` guarda o `searchId` em SQLite: **Repetir busca** com os mesmos critérios consulta esse identificador em vez de iniciar outra busca, respeitando `nextRetryAt`. Enquanto isso, resultados parciais continuam disponíveis e a tela informa a pendência; não há polling remoto permanente em segundo plano.

Apollo fica oculto e não recebe novas chamadas, mesmo que uma chave antiga esteja salva. Registros históricos continuam legíveis.

O acompanhamento mostra uma hierarquia compacta, contexto expansível, exclusão com confirmação, trabalho atual, decisões de pesquisa, fontes consultadas, resultados candidatos, falhas e limites. Os horários de início e fim de cada etapa ficam no banco, inclusive após recarregar ou cancelar. As estimativas são referências iniciais aproximadas, não médias históricas nem contagem regressiva garantida. Dados antigos sem horário não recebem tempos inventados. A interface avisa se a etapa ultrapassar a estimativa ou se a atualização falhar, tenta reconectar e oferece ações para ajustar critérios, verificar conexões e repetir. Falha de fornecedor não aparece como busca concluída vazia; resultados parciais recebem ressalvas. Uma fonte real conectada nunca é substituída por dados de demonstração. Rotinas e notificações permanecem ocultas na interface.

**Resultados parciais:** na descoberta B2B, cada fonte disponibiliza candidatos assim que responde. Nome, cargo, empresa, fontes e andamento da conferência aparecem no próximo ciclo de atualização da tela (a cada dois segundos enquanto visível), sem esperar a outra fonte da rodada ou todos os perfis. A leitura de cada perfil atualiza sua prévia. Os registros persistem ao recarregar e após cancelamento; respostas tardias não modificam buscas encerradas ou excluídas. A prévia não atribui qualificação e é retirada quando o lead correspondente é criado. Empresas e leads já salvos também aparecem durante a execução. A lista final continua sujeita aos critérios, ao limite de candidatos e aos contatos já encontrados.

**Avatares:** o campo público `avatar` recebido no dataset ou Person Profile é associado somente ao mesmo perfil LinkedIn. Fotos HTTPS do CDN público do LinkedIn são exibidas na prévia e nas listas; sem foto ou em caso de erro, aparecem as iniciais do nome. A URL é preservada no lead. Não há consulta adicional exclusiva para buscar fotos.

Os testes automatizados simulam as APIs externas, incluindo autenticação recusada, limites, respostas vazias e troca entre fontes. A validação com uma conta real depende das chaves salvas em Configurações.

Referências dos contratos: [ProspectHalo para agentes](https://prospecthalo.ai/for-agents), [OpenAPI do ProspectHalo](https://app.prospecthalo.ai/api/agent/v1/openapi.json), [Exa Search](https://exa.ai/docs/reference/search), [Exa Contents](https://exa.ai/docs/reference/get-contents), [Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search), [Tavily Extract](https://docs.tavily.com/documentation/api-reference/endpoint/extract), [SearchAPI Google](https://www.searchapi.io/docs/google) e [Bright Data MCP](https://github.com/brightdata/brightdata-mcp).

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
| `AI_PROVIDER` | `openrouter` (padrão) ou `chatgpt`. Prefira escolher na tela; definida no ambiente, trava a escolha. |
| `CHATGPT_MODEL` | Opcional. Modelo da conta ChatGPT; vazio usa Automático. |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Ativa a IA que qualifica leads, gera a hipótese de dor e escreve a estratégia e as mensagens. Obtenha em https://openrouter.ai/keys |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão `nvidia/nemotron-3-super-120b-a12b:free`; aceita qualquer id do catálogo, como `openai/gpt-5.4-mini` ou `google/gemini-3.8-flash`. |
| `PROSPECTHALO_API_KEY` | Chave ou link MCP oficial do ProspectHalo; alternativa ao cartão em Configurações. |
| `PROSPECTHALO_TETO_CONSULTAS` | Limite de busca e acompanhamento por prospecção; padrão 10. |
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
components/ConexaoIA.tsx                   escolha da conta de IA (OpenRouter ou ChatGPT), login por código e modelo
app/api/setup/                             leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/ia/, app/api/chatgpt/              preferência da conta de IA; conexão, código de dispositivo e modelos do ChatGPT
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
lib/ai.ts                                  camada de IA: OpenRouter ou ChatGPT conforme a conta escolhida (askText, askJSON)
lib/chatgpt.ts                             conector do Codex App Server com sessão isolada em DATA_DIR/chatgpt
lib/modelos.ts                             rede de segurança e curadoria do catálogo de modelos ("Mais usados")
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

### Módulo de busca avançada de pessoas (0.2.1)

Adiciona o módulo `lib/busca-avancada-pessoas.ts` para consultar perfis públicos via dataset da Bright Data, com filtros compatíveis com os campos disponíveis, paginação, deduplicação e alternativa de busca web. O módulo ainda não está integrado ao fluxo da aplicação.

### Arquivar prospecções (0.2.0)

A lista de Prospecções abre em **Ativas** e oferece o filtro **Arquivadas**, com a quantidade de itens em cada grupo. **Arquivar** retira a busca da lista de ativas; **Restaurar** a devolve. O arquivamento é salvo no SQLite e preserva leads, contas, abordagens, histórico e acesso ao detalhe. Ele organiza a lista, sem cancelar uma execução em andamento.

A API aceita `GET /api/prospeccoes?situacao=ativas|arquivadas|todas` (sem filtro mantém todas) e `PATCH /api/prospeccoes/:id/arquivo` com `{ "arquivada": true }` ou `false`. A rota usa a autenticação administrativa existente.
