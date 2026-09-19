# Entrevistadora IA

Entrevistadora de IA que conduz a primeira triagem de candidatos por voz e entrega um parecer técnico e cultural para o gestor decidir. Área: Recursos Humanos.

## O que resolve
A primeira conversa com cada candidato toma horas da equipe e acontece sem critério escrito: cada pessoa pergunta o que lembra e anota o que acha. Aqui a empresa cadastra a cultura uma vez, abre a vaga (cargo, faixa salarial, desafios dos primeiros meses, requisitos e competências culturais), cadastra o candidato — a IA lê o currículo e, se a pesquisa na web estiver conectada, procura o perfil público e completa a ficha **marcando de onde veio cada campo** —, atribui o candidato à vaga e envia um link. O candidato conversa por voz, do celular, no horário dele. Quando a conversa termina, o parecer sai sozinho: nota, recomendação, aderência requisito a requisito, leitura cultural, o que a conversa confirma (ou contradiz) do currículo e do perfil público, e as perguntas que ficaram para a próxima etapa. O gestor registra a decisão, compara os candidatos da vaga lado a lado e acompanha o funil em Relatórios.

## As seis telas
| Tela | Para quê |
|---|---|
| **Início** (`/`) | Onde o processo está hoje: quatro indicadores com variação, "Precisa de você" (parecer sem decisão, identidade a confirmar, convite vencendo) e as vagas abertas. |
| **Vagas** (`/vagas`) | Abrir e editar vagas, ver quantos candidatos estão em cada etapa, comparar os candidatos de uma vaga e testar a entrevista antes de convidar alguém. |
| **Candidatos** (`/candidatos`) | Cadastrar pessoas com currículo, ver a ficha com a origem de cada campo (CV, Web, Você), resolver divergências, confirmar identidade e pedir a pesquisa na web. |
| **Entrevistas** (`/entrevistas`) | Acompanhar todo mundo por situação, vaga, nome e período; abrir o parecer e registrar a decisão. |
| **Relatórios** (`/relatorios`) | Funil, tempo de resposta (média e mediana), taxa de conclusão, nota média e distribuições, com planilha e impressão. Linka os relatórios já salvos. |
| **Configurações** (`/setup`) | A cultura da empresa e as conexões (IA, voz, agente, pesquisa na web, notificações, assistente e rotinas). |

O candidato nunca vê nada disso: ele abre `/entrevista/<código do convite>` e só encontra as boas-vindas, o teste de microfone, a conversa e o agradecimento.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript, com SQLite (`node:sqlite`) no próprio contêiner. IA via OpenRouter com modelo gratuito por padrão. Voz, agente conversacional e ligação telefônica via ElevenLabs (opcionais); pesquisa na web via Bright Data pelo protocolo MCP (opcional).

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você cadastra a cultura da empresa e conecta cada integração colando uma chave (ou, no caso da IA, com um clique em "Conectar com OpenRouter"), testando a conexão antes de usar:

- **Inteligência artificial (OpenRouter)** — **obrigatória para sair do modo demonstração**. É ela que lê o currículo, planeja o roteiro, conduz a conversa e escreve o parecer. Em Opções avançadas há um "Modelo para avaliação" separado: dá para pagar um modelo melhor só no que vira nota sobre uma pessoa.
- **Voz da entrevistadora** (ElevenLabs) — opcional. Com a chave salva, escolha a voz numa lista carregada da própria conta; sem ela, a voz é a do navegador do candidato e a sala avisa isso na tela. Se a ElevenLabs recusar a chamada no meio da conversa, a entrevista continua por texto e o aviso explica o motivo em uma frase.
- **Agente conversacional** (ElevenLabs) — opcional. Crie o agente na sua conta, escolha-o aqui e a entrevista passa a acontecer em conversa contínua (o candidato fala e é interrompido como numa ligação). A conversa volta para o app pelo aviso de pós-conversa, cujo endereço e segredo o próprio cartão mostra. Se o agente não ficar de pé em 10 segundos, a sala cai sozinha para a voz do navegador. Em Opções avançadas, um número de telefone da Twilio ligado ao agente libera "Ligar para o candidato".
- **Pesquisa de candidatos na web** (Bright Data) — opcional. Com o código de acesso salvo, o app procura o candidato e usa o que é público (perfil profissional, portfólio, publicações) para completar a ficha; sem ela, a ficha fica só com o que veio do currículo. O currículo sempre prevalece, a web só preenche vazios e todo conflito vira uma divergência para você decidir. Em Opções avançadas ficam o endereço do serviço e o modo avançado (necessário para a leitura de perfil do LinkedIn).
- **Notificações** (e-mail ou Slack) — opcional. Enviam o convite ao candidato direto da tela e o resumo semanal do processo. Sem elas, o convite é copiado e colado à mão.

Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Variáveis de ambiente, quando existem, têm prioridade sobre o que foi salvo no setup. Até conectar a IA, o app roda em **modo demonstração**: nasce com uma vaga, quatro candidatos (com ficha, fontes e uma divergência) e três pareceres de exemplo, todos marcados com o chip "Exemplo". Eles somem sozinhos quando a primeira vaga ou o primeiro candidato de verdade é criado, e podem ser apagados a qualquer momento no cartão da IA em Configurações.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Rodar localmente
```bash
npm install
npm run dev              # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para garantir que os dados de exemplo estão no lugar e ver o app cheio sem conectar nada.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3003
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/entrevista-ia:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-entrevista-ia (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3003:10000 -v entrevista-ia-dados:/app/data ghcr.io/startse/entrevista-ia:latest` e abra http://localhost:3003.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. O Blueprint usa o plano `standard` (2 GB de RAM e 1 CPU; também chamado `1c-2g`) com um disco persistente de 1 GB em `/app/data`, preservando a configuração, a conta, as vagas, os candidatos e as entrevistas entre deploys.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo lá.

| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |
| `APP_URL` | Endereço público do app. Gravado sozinho no primeiro acesso; só precisa ser definido à mão se o assistente (MCP) ou uma rotina for montar links de convite antes de alguém abrir o app. |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `CONTA_DESLIGADA` | `1` trata toda rota como pública. Só para o contêiner efêmero da captura de prévia — nunca numa instância real. |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Modelo padrão (roteiro, currículo, descrição colada, cultura). Padrão `openai/gpt-5.4-mini`. |
| `OPENROUTER_MODEL_AVALIACAO` | Alternativa ao setup. Modelo usado só nos três passos do parecer. Sem ele, vale o modelo padrão. |
| `BRIGHTDATA_API_TOKEN` | Alternativa ao setup. Liga a pesquisa do candidato na web. Obtenha em [brightdata.com/cp/setting/users](https://brightdata.com/cp/setting/users). |
| `BRIGHTDATA_MCP_URL` | Alternativa ao setup. Endereço do serviço de pesquisa da Bright Data. Padrão `https://mcp.brightdata.com/mcp`. |
| `BRIGHTDATA_MODO_PRO` | Legado, ignorado. O conector sempre inclui `pro=1` e o grupo `social` para habilitar as ações do enriquecimento. |
| `ELEVENLABS_API_KEY` | Alternativa ao setup. Ativa a voz da entrevistadora. Obtenha em [elevenlabs.io/app/settings/api-keys](https://elevenlabs.io/app/settings/api-keys). |
| `ELEVENLABS_VOICE_ID` | Alternativa ao setup. Voz usada no texto-para-voz. Padrão `EXAVITQu4vr4xnSDxMaL`. |
| `ELEVENLABS_AGENT_ID` | Alternativa ao setup. Id do agente conversacional que conduz a entrevista por voz (e a ligação telefônica). |
| `ELEVENLABS_PHONE_NUMBER_ID` | Alternativa ao setup. Id do número Twilio vinculado ao agente (só para a ligação). |
| `ELEVENLABS_WEBHOOK_SECRET` | Alternativa ao setup. Segredo que valida o aviso de pós-conversa da ElevenLabs. |
| `NOTIFICACOES_CANAL` | Alternativa ao setup. `email` ou `slack`. |
| `NOTIFICACOES_DESTINO` | Alternativa ao setup. E-mail que recebe o resumo semanal. |
| `NOTIFICACOES_RESEND_API_KEY` | Alternativa ao setup. Envio por Resend. Obtenha em https://resend.com/api-keys. |
| `NOTIFICACOES_SLACK_WEBHOOK` | Alternativa ao setup. URL de webhook de entrada do Slack. |
| `NOTIFICACOES_SMTP_HOST` / `_PORTA` / `_USUARIO` / `_SENHA` | Alternativa ao setup. Envio por servidor SMTP próprio. |

## Estrutura
```
app/page.tsx                          Início: indicadores, "Precisa de você" e vagas abertas
app/vagas/                            lista, /nova, /[id] (a vaga e seus candidatos), /[id]/editar,
                                      /[id]/comparar (lado a lado) e /[id]/testar (prévia do gestor)
app/candidatos/                       lista, /novo (currículo) e /[id] (ficha, fontes, divergências)
app/entrevistas/                      lista por situação e /[id] (o parecer e a decisão)
app/relatorios/page.tsx               funil, tempos, distribuições, planilha e impressão
app/setup/page.tsx                    configuração inicial (cultura, chaves, OAuth, teste de conexão)
app/entrevista/[token]/page.tsx       sala pública do candidato, aberta pelo link do convite
app/api/entrevista/candidato/         rotas públicas do link (abrir, falar, conversa, voz, estado)
app/webhook/elevenlabs/route.ts       aviso de pós-conversa assinado (a conversa do agente volta aqui)
app/r/[id] e app/imprimir/[id]        um resultado salvo (parecer, scorecard, ranking, relatório)
app/mcp/route.ts                      o assistente (MCP), com as seis ferramentas de lib/ferramentas.ts
lib/banco.ts                          as cinco tabelas próprias do app, sobre a conexão de lib/store.ts
lib/vagas.ts lib/candidatos.ts lib/entrevistas.ts   as entidades (só dependem de lib/banco.ts)
lib/painel.ts lib/convite.ts lib/comparacao.ts lib/relatorios.ts lib/inicio.ts   leituras que juntam entidades
lib/cultura.ts                        a cultura da empresa (um registro por instalação, em config)
lib/curriculo.ts lib/ficha.ts         ler o currículo e montar a ficha com a origem de cada campo
lib/pesquisa-cliente.ts lib/pesquisa.ts   falar com a Bright Data e conduzir a rodada de pesquisa
lib/roteiro.ts lib/conclusao.ts       planejar e conduzir a conversa; encerrá-la por uma porta só
lib/avaliacao.ts                      o parecer em três passos (extrair, cruzar, redigir)
lib/sala-do-candidato.ts lib/sessao-candidato.ts   quem pode entrar na sala e em que aparelho
lib/voz.ts lib/agente.ts              ElevenLabs: voz, ligação e as variáveis do agente
lib/resumo-semanal.ts                 o resumo que a rotina semanal envia
lib/demo.ts lib/semear-demo.ts lib/exemplos.ts   o modo demonstração: conteúdo, semeadura e retirada
lib/formato.ts                        rótulos e formatação que servidor e tela têm de dizer igual
lib/store.ts                          configuração em SQLite, com variáveis de ambiente como prioridade
Dockerfile                            build multi-stage com saída standalone
docker-compose.yml                    sobe este app isolado
render.yaml                           blueprint do Render (runtime image)
```

O enriquecimento usa Search Engine, Search Dataset, LinkedIn Person Profile e Scrape as Markdown. Search Dataset consulta primeiro `list_dataset_fields` para montar um filtro válido; o orçamento por rodada é de até 8 chamadas de ferramenta, mantendo o prazo total. O teste de conexão exige as quatro ações principais.

## Progresso do enriquecimento e recuperação da entrevista

O acompanhamento mostra quatro fases (preparação, consulta das fontes, organização e preparação para revisão). A barra avança conforme as fases registradas pelo servidor, não conforme um temporizador. Cada consulta mantém início e término no banco, permitindo reabrir a janela sem reiniciar a duração. As faixas de tempo em `lib/tempo-pesquisa.ts` são referências iniciais aproximadas, ainda não calibradas por telemetria; ultrapassá-las mostra um aviso e não simula conclusão. Uma falha ao consultar o andamento provoca nova leitura após cinco segundos.

Na sala do candidato, a leitura da conversa repete erros de rede e respostas 502/503/504 até três tentativas, com limite de 15 segundos por tentativa. Se a indisponibilidade persistir, a pessoa pode tentar novamente. Respostas do candidato não são reenviadas automaticamente. Chamadas ao OpenRouter repetem uma vez respostas 502/503/504; a escrita das falas e o planejamento de links legados têm um prazo total de 25 segundos; a preparação no convite tem até 90 segundos, incluindo novas tentativas HTTP e correção de JSON. A primeira pergunta usa diretamente o roteiro, dispensando uma segunda geração. No navegador, registrar a abertura tem prazo de 15 segundos, receber um turno tem prazo de 45 segundos e buscar a voz tem prazo de 10 segundos. Falhas permitem tentar novamente; começar por escrito dispensa o áudio. Turnos da mesma entrevista são serializados no processo para evitar duplicação quando uma tentativa chega antes de a anterior terminar.

`npm test` cobre persistência dos tempos, falhas transitórias e persistentes, links expirados e abertura/retomada com um 502 simulado do provedor. Esses testes não identificam a causa de um 502 ocorrido na hospedagem: para investigá-lo, é necessário correlacionar o caminho da requisição e o horário com os logs do servidor. A mensagem isolada do console não distingue provedor de IA, voz e proxy da hospedagem.

## Versão instalada

Configurações (`/setup`) mostra a versão instalada, incorporada ao build a partir do campo `version` do `package.json`. A versão `0.3.0` prepara o roteiro antes de liberar o convite, adiciona a sala LiveKit com voz ElevenLabs e amplia a seleção de modelos OpenAI e Gemini pelo OpenRouter.

Antes de publicar uma atualização deste app, incremente a versão na pasta `entrevista-ia` com `npm version patch --no-git-tag-version` (correções) ou `npm version minor --no-git-tag-version` (novos recursos). O comando mantém `package.json` e `package-lock.json` sincronizados. Gere e publique uma nova imagem; depois de atualizar a instalação, confira o número em Configurações. A tela identifica a versão instalada, sem consultar automaticamente se há uma atualização disponível.


## Conversa LiveKit (0.3.0)

Em Configurações, salve OpenRouter, a chave ElevenLabs, a voz e o modelo de voz. Depois, no cartão **Conversa em tempo real**, clique em **Autorizar LiveKit Cloud**, entre na conta e escolha o projeto. O app salva a URL e as credenciais automaticamente. O preenchimento manual continua em **Opções avançadas**. A conta precisa ter LiveKit Inference disponível para transcrição Deepgram Nova-3 em português. As chaves ficam no servidor, cifradas no banco, e não são enviadas ao navegador.

`npm run dev` e `npm start` iniciam o site e supervisionam o agente. O agente inicia após salvar as conexões; não exige outro serviço ou disco. A imagem Docker usa Debian e inclui as bibliotecas nativas de áudio. A porta interna 8091 verifica a saúde do agente; apenas a porta web precisa ser publicada. Use uma única instância com o disco persistente deste projeto. Dimensione memória para o Next e o processo de áudio; acompanhe o consumo da instalação antes de aumentar entrevistas simultâneas.

Sem LiveKit configurado, o fluxo por voz do navegador e texto continua disponível. Com LiveKit, a sala oferece conversa por áudio contínuo, interrupção, transcrição, pausa do microfone e reconexão. O botão de texto continua disponível quando a voz falha. A voz e o modelo ElevenLabs selecionados valem para novas sessões, e o modelo OpenRouter selecionado conduz os turnos. As respostas continuam salvas na mesma entrevista e alimentam o parecer existente.

A criação do convite prepara e salva o roteiro **antes de disponibilizar o link**. Se a IA falhar, a criação informa o problema e permite tentar novamente. A abertura de um novo convite usa o roteiro salvo, sem uma chamada de planejamento. Links antigos sem roteiro mantêm o caminho de compatibilidade do app.

Referências de implementação: [LiveKit Agents](https://docs.livekit.io/agents/start/voice-ai/), [ElevenLabs TTS](https://docs.livekit.io/agents/models/tts/elevenlabs/), [transcrição LiveKit](https://docs.livekit.io/agents/models/stt/), [catálogo OpenRouter](https://openrouter.ai/api/v1/models) e [Chat Completions OpenAI](https://developers.openai.com/api/reference/resources/chat).


### Correção de permissões do volume (0.3.1)

A atualização de Alpine para Debian mudou a identificação numérica do usuário e podia causar `EACCES` ao ler `/app/data/chave-mestra`. A imagem 0.3.1 ajusta o proprietário do volume ao iniciar e executa o site e o agente como `app` (UID/GID 10001), sem privilégios de root. A chave e os dados existentes são preservados. O build testa um volume com proprietário antigo e confirma leitura, gravação e reutilização da mesma chave em duas inicializações.

Para recuperar uma instalação afetada, atualize a imagem e faça redeploy **mantendo o disco existente**. Não apague `chave-mestra` e não configure uma `CHAVE_MESTRA` nova: configurações já cifradas precisam da chave original. Falhas de permissão ou uma chave inválida não são mais tratadas como instalação nova. A troca de usuário após a preparação usa [gosu](https://github.com/tianon/gosu).

### Memória da instância no Render

Após um encerramento por exceder os 512 MB do Starter, o Blueprint passa a usar Standard (2 GB de RAM, 1 CPU). O preço de computação consultado em 19/09/2026 é US$ 25/mês, além do disco e de outros consumos: [preços do Render](https://render.com/pricing). Este é o dimensionamento inicial; acompanhe a memória em Metrics, especialmente com entrevistas simultâneas e o agente de voz ativo.

Para uma instalação existente, abra o serviço no Render → **Compute → Edit**, selecione **Standard / 1c-2g** e salve; o Render inicia o deploy. Se a instalação é gerenciada por Blueprint, sincronize a atualização do plano. Mantenha o mesmo serviço e o disco `entrevista-ia-dados` em `/app/data`, incluindo a chave mestra. A mudança de plano com disco persistente envolve uma breve indisponibilidade. Alterar os arquivos do projeto, por si só, não confirma a mudança da máquina em execução. [Documentação do Render](https://render.com/docs/compute-plans#changing-a-services-compute-plan).

### Autorizar LiveKit Cloud (0.4.0)

O botão usa o fluxo de autorização pelo navegador da [CLI oficial](https://docs.livekit.io/reference/developer-tools/livekit-cli/projects/), com `/cli/auth`, a página de aprovação do LiveKit e `/cli/claim`. Não é um OAuth público convencional e depende desses endpoints do provedor. Não exige cadastro de client ID ou redirect URI.

Somente uma sessão administrativa da mesma origem pode iniciar, consultar ou cancelar uma tentativa. Um cookie HttpOnly associa a tentativa ao navegador; a autorização expira em até 15 minutos. URL, API key e secret são salvos juntos e cifrados no servidor; o navegador recebe apenas a confirmação. Cancelamento, expiração e respostas inválidas preservam a conexão anterior. Credenciais definidas por variáveis de ambiente têm prioridade e impedem a troca pelo botão.

Os testes automatizados cobrem autorização, recusa, expiração, isolamento do navegador, limites de consulta, cancelamento e cifragem. O início e a espera pela aprovação foram conferidos contra o serviço real; a aprovação com uma conta e projeto próprios precisa ser feita pela pessoa no LiveKit.

### Acompanhamento da geração do convite (0.4.1)

A escolha de um candidato, a atribuição a uma vaga, o cadastro vindo da vaga e a renovação do convite mostram as etapas registradas pelo servidor: conferir dados, preparar roteiro e salvar link/mensagem. A etapa atual fica em destaque; as demais aparecem em uma lista expansível. O tempo decorrido não faz a etapa avançar artificialmente.

O navegador solicita eventos NDJSON nas mesmas rotas de criação; clientes JSON mantêm o contrato anterior. Uma conexão encerrada antes da confirmação é tratada como falha recuperável. Nova tentativa reaproveita o candidato e a entrevista, e o link só fica disponível depois de salvar o roteiro. O diálogo também permite gerar um convite que ainda não tenha link. O acompanhamento no navegador tem limite de 120 segundos; fechar a janela não desfaz dados já gravados e a operação iniciada pode terminar no servidor.

### Diagnóstico do convite e da versão (0.4.2)

Configurações exibe a versão instalada no rodapé, centralizada e em cinza claro. `GET /api/health` devolve `ok` e `versao`, sem cache e sem dados da conta, para conferir a imagem realmente instalada. Publicar a imagem no GitHub não confirma o redeploy de uma instalação no Render.

Falhas conhecidas da IA na preparação do roteiro preservam código, mensagem e ação tanto em JSON quanto no acompanhamento por etapas. A tela distingue chave recusada, falta de crédito, limite e modelo indisponível; não substitui essas causas por uma mensagem genérica de preparação. Isso permite diagnosticar a tentativa real, sem afirmar que todo erro de geração tem a mesma causa.

### Respostas lentas na preparação (0.4.4)

A criação ou renovação do convite permite até 90 segundos para preparar o roteiro, com prazo único compartilhado entre a chamada e as repetições. O navegador espera até 120 segundos, e o servidor envia um sinal de espera a cada 10 segundos, sem inventar avanço nas etapas. O roteiro salvo é reutilizado.

Um timeout antes dos cabeçalhos ou durante a leitura do corpo da resposta é convertido em `tempo_esgotado`, com orientação para tentar novamente ou trocar o modelo. O link continua condicionado à conclusão do roteiro. Testes cobrem ambos os caminhos de timeout e a manutenção do prazo entre tentativas; uma resposta simulada com corpo atrasado em 30 segundos valida a geração além do limite antigo.


### Condução da entrevista e parecer (0.4.5)

O padrão de texto no OpenRouter é `openai/gpt-5.4-mini` (usa créditos). Uma escolha explícita em Configurações ou `OPENROUTER_MODEL` tem prioridade sobre o padrão do código. A duração estimada é de 10 a 20 minutos, com 15 minutos como padrão; o tempo efetivo depende das respostas do candidato.

As perguntas principais são percorridas na ordem. Aprofundamentos não consomem o total nem substituem tópicos: cada pergunta pode receber um pedido de exemplo quando a resposta for curta. Pedidos de repetição mantêm a posição. O planejamento incompleto é refeito antes de liberar o convite. Nas falas intermediárias, a IA escreve a transição e o sistema preserva o texto da pergunta planejada.

O adaptador LiveKit persiste os turnos; por isso a geração antecipada (`preemptiveGeneration`) fica desativada. A detecção de fim de fala dá mais espaço às pausas e filtra interrupções curtas. No modo mãos livres do navegador, uma pausa de quatro segundos encerra a resposta; o fechamento espontâneo do reconhecimento tenta retomar a escuta preservando o texto.

O parecer organiza nota e síntese lado a lado, alinha os botões e reúne as ações de compartilhamento em um popover. Aprofundamentos não fazem uma entrevista interrompida ser considerada completa. Respostas vazias da IA recebem uma tentativa adicional dentro do prazo original.

### Reabertura pelo gestor (0.5.0)

O modelo padrão passa a ser `openai/gpt-5.4-mini`; escolhas explícitas em Configurações continuam tendo prioridade. No detalhe da entrevista, o gestor pode usar **Reabrir entrevista** (no menu de ações quando já existe parecer). A confirmação apaga a conversa, o parecer e a decisão anteriores, preserva o roteiro e libera o mesmo link por mais 15 dias. Somente a nova entrevista entra no parecer e nos indicadores. A vaga precisa estar aberta, sem outra entrevista ativa para o mesmo candidato.

A ação exige sessão autenticada do gestor. Abas, sessões de voz, webhooks e avaliações em processamento da tentativa anterior não podem gravar dados na nova tentativa. Pareceres antigos deixam de estar disponíveis pelos links de compartilhamento.
