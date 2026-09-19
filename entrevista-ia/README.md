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
- O health check responde em `/api/health`. O Blueprint usa o plano `starter` (pago) com um disco persistente de 1 GB em `/app/data`, preservando a configuração, a conta, as vagas, os candidatos e as entrevistas entre deploys.

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
| `OPENROUTER_MODEL` | Alternativa ao setup. Modelo padrão (roteiro, currículo, descrição colada, cultura). Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
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

Na sala do candidato, a leitura da conversa repete erros de rede e respostas 502/503/504 até três tentativas, com limite de 15 segundos por tentativa. Se a indisponibilidade persistir, a pessoa pode tentar novamente. Respostas do candidato não são reenviadas automaticamente. Chamadas ao OpenRouter repetem uma vez respostas 502/503/504; o planejamento e a escrita das falas têm, cada um, um prazo total de 25 segundos, incluindo novas tentativas HTTP e correção de JSON. A primeira pergunta usa diretamente o roteiro, dispensando uma segunda geração. No navegador, registrar a abertura tem prazo de 15 segundos, receber um turno tem prazo de 45 segundos e buscar a voz tem prazo de 10 segundos. Falhas permitem tentar novamente; começar por escrito dispensa o áudio. Turnos da mesma entrevista são serializados no processo para evitar duplicação quando uma tentativa chega antes de a anterior terminar.

`npm test` cobre persistência dos tempos, falhas transitórias e persistentes, links expirados e abertura/retomada com um 502 simulado do provedor. Esses testes não identificam a causa de um 502 ocorrido na hospedagem: para investigá-lo, é necessário correlacionar o caminho da requisição e o horário com os logs do servidor. A mensagem isolada do console não distingue provedor de IA, voz e proxy da hospedagem.

## Versão instalada

Configurações (`/setup`) mostra a versão instalada, incorporada ao build a partir do campo `version` do `package.json`. A versão `0.2.0` inclui o progresso do enriquecimento e a recuperação de falhas na abertura da entrevista.

Antes de publicar uma atualização deste app, incremente a versão na pasta `entrevista-ia` com `npm version patch --no-git-tag-version` (correções) ou `npm version minor --no-git-tag-version` (novos recursos). O comando mantém `package.json` e `package-lock.json` sincronizados. Gere e publique uma nova imagem; depois de atualizar a instalação, confira o número em Configurações. A tela identifica a versão instalada, sem consultar automaticamente se há uma atualização disponível.
