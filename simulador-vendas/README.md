# Simulador de Vendas

Treine o time inteiro em conversas de venda de verdade. O gestor cadastra o produto uma vez, cria um treino e manda **um link só** para o time; cada vendedor abre esse link, conversa **por voz** com um cliente simulado pela IA e recebe um feedback que ensina — enquanto o gestor acompanha por vendedor, por tipo de cliente e ao longo dos meses. Área: Vendas.

## O que resolve
Vendedor não aprende a vender lendo material: aprende conversando. Só que a conversa onde ele aprende é a conversa com o cliente de verdade, e o erro ali custa o negócio. Aqui ele erra antes, com um cliente simulado que conhece o produto da empresa, tem um jeito próprio de responder e levanta as objeções reais — e sai com nota por critério, o trecho da conversa que justifica cada nota e uma frase pronta para usar na próxima vez.

## Produto → Simulação → Sessão
Três coisas, nesta ordem. Entender esta sequência é entender o app inteiro:

1. **Produto** — o que sua empresa vende. Cadastrado **uma vez** em `/produtos`: nome, categoria e o material que ensina a IA (o endereço da página do produto, arquivos `.txt`/`.md`/`.vtt`/`.srt`, ou texto colado). A partir desse material o app gera a **ficha do produto** — resumo, público, principais benefícios, diferenciais, objeções prováveis, faixa de preço e concorrentes —, você confere, corrige o que estiver torto e salva. A ficha é o que o cliente simulado e o avaliador sabem sobre o produto; o material bruto fica guardado só para gerar a ficha de novo.
2. **Simulação** — o treino, criado em `/simulacoes/nova` em três passos: escolher o produto, montar o desafio (metodologia, dificuldade, tipos de cliente, tentativas, tempo, se mostra o feedback, se aceita voz e texto) e pegar **o link**. O link é do treino, não de uma pessoa: o mesmo endereço serve para o time inteiro, sem cadastro nenhum e sem prazo de validade. Quem tira um treino do ar é você, pausando ou encerrando em `/simulacoes`.
3. **Sessão** — uma conversa de um vendedor. Trinta pessoas no mesmo link geram trinta sessões independentes, cada uma com o seu tipo de cliente, a sua transcrição e a sua avaliação. Nada se mistura: o vendedor vê só o que é dele, e o gestor vê tudo em `/resultados`.

### Os seis lugares do app
| Onde | Para quê |
|---|---|
| **Início** (`/`) | O que está acontecendo: quatro números com a variação contra os 30 dias anteriores, os treinos ativos e o que fazer a seguir. |
| **Produtos** (`/produtos`) | A biblioteca do que sua empresa vende, com o material e a ficha de cada um. |
| **Simulações** (`/simulacoes`) | Os treinos criados, com o link de cada um, quantas pessoas treinaram e a nota média. |
| **Equipe** (`/equipe`) | Quem já treinou, como cada um foi, o convite para quem ainda não entrou — e "Analisar uma conversa real". |
| **Resultados** (`/resultados`) | O painel de cada treino: visão geral, equipe, tipos de cliente e evolução ao longo dos meses. |
| **Configurações** (`/setup`) | A IA, a voz e o acesso para assistentes. |

### O que o vendedor vê
Ele abre o link, diz quem é (com Google, com Microsoft ou escrevendo nome e e-mail), lê **quem é o cliente** — nome, cargo, empresa e por que aceitou falar — e começa a conversa. Ele não vê o tipo de cliente antes: isso só é revelado no feedback, senão o treino vira decoreba. No fim ele recebe a nota, o que foi bem, **uma** coisa para fazer diferente e uma frase pronta para usar. Nenhuma tela do vendedor tem menu do app, cabeçalho de gestor ou caminho para as configurações.

## Conversa por voz
A duração definida pelo gestor aparece como referência na sala: tempo restante, faixa de progresso e, após o limite, tempo excedido. Ao atingir a duração, o cliente diz que precisa encerrar e pergunta se há pontos para retomarem depois. Na voz contínua, o aviso espera uma pausa; por texto ou voz do navegador, entra na próxima resposta ou em uma pausa sem texto em edição. O aviso fica salvo na sessão. A conversa continua aberta para combinar os próximos passos; **Encerrar e ver resultado** conclui o treino.

A IA do simulador conduz todas as conversas. A ElevenLabs fornece apenas a voz: salve a chave em `/setup`, selecione **Voz do cliente** e ouça uma amostra. A voz escolhida é usada para todos os clientes; o ajuste por perfil muda o ritmo e a expressividade.

A sala usa a Web Speech API do navegador quando a conversa ao vivo pelo LiveKit não está configurada. Um toque inicia o microfone, uma pausa de 1,4 segundo envia a fala e a escuta volta após a resposta. **Enviar fala agora**, **Pausar microfone** e **Interromper e falar** permitem controlar o ritmo sem segurar botões. Texto e voz compartilham a transcrição salva no servidor.

O reconhecimento depende do suporte do navegador à Web Speech API. A tela só indica escuta depois da confirmação do navegador. Falhas de conexão, captura ou permissão oferecem texto e permitem tentar a voz novamente; uma inicialização sem resposta é cancelada após 10 segundos. Cada escuta usa uma instância nova, preservando as palavras finais e permitindo recuperar permissões sem recarregar a página. Se a ElevenLabs falhar, a síntese do navegador fornece o áudio. Não é necessário criar ou selecionar agentes externos.

Os testes de conversa rodam com `npx playwright test tests/conversa.spec.ts tests/voz-fallback.spec.ts`. Para exercitar também o reconhecimento real do Chrome, forneça um WAV curto em português: `VOZ_TESTE_ARQUIVO=/caminho/fala.wav npx playwright test tests/voz-real.spec.ts`. Este teste usa a conexão externa do Chrome, substitui apenas a entrada de áudio pelo arquivo e não abre o microfone físico.

## Metodologia e avaliação
O gestor escolhe a régua por treino: **SPIN Selling** (9 critérios), **Venda consultiva** (7 critérios) ou **Personalizada** (o gestor escreve de 3 a 10 critérios). A avaliação devolve uma nota por critério com o **trecho literal da conversa** que a justifica — citação conferida contra a transcrição, não texto de confiança: o que não aparece na conversa é descartado. A nota geral e as notas por momento da conversa são calculadas no app, nunca pedidas à IA, que é o que permite comparar duas pessoas avaliadas em dias diferentes.

Os tipos de cliente são sete (Amigável, Apressado, Direto, Cético, Sensível a preço, Especialista e Resistente) e a dificuldade (Fácil, Realista, Difícil) muda quantas objeções o cliente levanta e quanta informação ele dá. No modo "Clientes variados", o app distribui os tipos pelo time em vez de sortear, para o painel não ficar enviesado por um perfil que caiu para nove pessoas e outro para uma.

## Analisar uma conversa real
Em **Equipe › Analisar uma conversa real** você cola (ou envia em `.txt`, `.vtt` ou `.srt`) uma conversa que aconteceu com um cliente de verdade e recebe a mesma avaliação, vinculada à pessoa. Formato: uma fala por linha, começando com `Vendedor:` ou `Cliente:`. Também são reconhecidos `Vendedora`, `Eu`, `Atendente`, `Consultor(a)`, `Representante` e `Falante 1`/`Speaker 1` (como vendedor); `Comprador(a)`, `Prospecto` e `Falante 2`/`Speaker 2` (como cliente). Carimbos de tempo antes do nome (`[00:12] Vendedor:`, `00:12:45 Cliente:`) são descartados. Quando nenhuma linha é reconhecida, o app avisa antes de gastar uma chamada de IA.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. Banco em SQLite (`node:sqlite`, sem dependência externa). IA via OpenRouter com modelo gratuito por padrão.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe os modelos e testa a conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`.

São **dois** modelos, porque as duas pontas têm exigências opostas: o **cliente simulado** responde a cada fala e precisa ser rápido; a **avaliação** acontece uma vez por conversa e vira nota, então vale um modelo mais capaz. Em "Automático" (o padrão dos dois), a avaliação usa o mesmo modelo da simulação.

Até conectar a IA, o app roda em **modo demonstração**: ele nasce com um produto, dois treinos, três pessoas e seis conversas já avaliadas, espalhadas por quatro meses, para você abrir qualquer tela e ver como ela fica cheia. Esse conjunto sai de cena sozinho assim que chega dado de verdade — o primeiro produto real apaga os exemplos, a primeira conversa real apaga as conversas de exemplo. Um treino de exemplo em que alguém conversou de verdade fica.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

O **vendedor não tem conta**: ele se identifica no próprio link, com Google, com Microsoft ou escrevendo nome e e-mail. Os botões dos provedores só aparecem quando a instalação tem as credenciais; o caminho manual fica sempre visível. Nenhum acesso do provedor é guardado — o app lê o nome e o e-mail e descarta o resto.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3013
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/simulador-vendas:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-simulador-vendas (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3013:10000 -v simulador-vendas-dados:/app/data ghcr.io/startse/simulador-vendas:latest` e abra http://localhost:3013.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. O blueprint usa o plano Starter com disco persistente de 1 GB em `/app/data`, onde ficam os dados e as configurações cifradas.

## Convite e resultados
O botão **Convidar** em Equipe gera um link público onde a pessoa informa nome e e-mail e vê o endereço do treino. O feedback fica disponível no simulador e no histórico de resultados. Não há notificações, envios automáticos de feedback nem resumos agendados. Endpoints antigos de envio e webhook respondem HTTP 410, inclusive para instalações com credenciais antigas salvas.

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, para que assistentes como Claude ou ChatGPT operem o app conversando. Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup` e configure o assistente com o endereço (`https://<seu-app>/mcp`) e o código como `Authorization: Bearer <código>`.

Quatro ferramentas:

| Ferramenta | O que faz |
|---|---|
| `criar_simulacao` | Cria um treino e devolve o link. Aceita o produto pelo **nome** ("crie um treino do Plano Empresarial"), não só pelo identificador. |
| `resultados_da_simulacao` | Os agregados de um treino (nota, competências, equipe, tipos de cliente). Sem o código, devolve a lista de treinos. Nunca devolve transcrição nem feedback individual. |
| `analisar_conversa` | Avalia uma conversa real colada, igual à tela de Equipe. |
| `painel_equipe` | O resumo da equipe no período. |

Decisão de implementação: protocolo implementado à mão em `lib/mcp.ts` (JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`), em vez do pacote `@modelcontextprotocol/sdk`. O app só precisa desses três métodos, sem `resources`, `prompts` nem streaming de progresso — a mesma filosofia de `lib/store.ts` (SQLite sem dependências externas) evita adicionar uma dependência pesada para um uso pequeno. Rate limit de 60 chamadas por minuto por código, em memória; reinicia ao reiniciar o servidor ou ao gerar um novo código.

```bash
curl -X POST https://<seu-app>/mcp \
  -H "Authorization: Bearer <código>" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Testar com o MCP Inspector
```bash
npx @modelcontextprotocol/inspector
```
Na interface que abre no navegador, escolha o transporte "Streamable HTTP", cole `http://localhost:3000/mcp` (ou o endereço do deploy) em URL e adicione o cabeçalho `Authorization: Bearer <código>` em "Custom Headers". Clique em "Connect": a aba "Tools" deve listar as quatro ferramentas.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `APP_URL` | Endereço público do app. Sem ele, o assistente devolve o caminho relativo do treino. É aprendido sozinho na primeira criação de treino pela tela. |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Modelo do dia a dia: o cliente simulado, a ficha do produto e a análise de conversa real. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `OPENROUTER_MODEL_AVALIACAO` | Alternativa ao setup. Modelo usado só na avaliação da conversa; sem ele vale o de `OPENROUTER_MODEL`. |
| `GOOGLE_CLIENT_ID_APP` / `GOOGLE_CLIENT_SECRET_APP` | Opcionais. Habilitam "Entrar com Google" para o vendedor se identificar no link (escopo `openid email profile`). |
| `MICROSOFT_CLIENT_ID_APP` / `MICROSOFT_CLIENT_SECRET_APP` | Opcionais. O mesmo, para "Entrar com Microsoft". |
| `ELEVENLABS_API_KEY` | Opcional. Gera a voz do cliente escolhida em Configurações. Obtenha em https://elevenlabs.io/app/settings/api-keys. |
| `ELEVENLABS_VOICE_ID` | Opcional. Voz selecionada em Configurações, usada em todas as conversas e amostras. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx                       Início: indicadores, treinos ativos, "Comece em 3 passos" e a dica da semana
app/produtos/page.tsx              biblioteca de produtos (lista + cadastro)
app/produtos/[id]/page.tsx         um produto: dados, materiais e a ficha
app/simulacoes/page.tsx            os treinos criados, com filtro, busca, link e ações
app/simulacoes/nova/page.tsx       criar treino em três passos (produto → desafio → link)
app/equipe/page.tsx                quem já treinou, cadastro, convite e a linha do tempo de cada um
app/equipe/analisar/page.tsx       analisar uma conversa real (colar ou enviar .txt/.vtt/.srt)
app/resultados/page.tsx            lista dos treinos com conversa, avaliações pendentes
app/resultados/[codigo]/           painel de um treino: visão geral, equipe, tipos de cliente e evolução
app/simular/[token]/page.tsx       o link do vendedor: identificação → preparação → conversa
app/simular/[token]/meus-resultados/  o histórico e o feedback de quem treinou (público, por cookie assinado)
app/setup/page.tsx                 configuração (IA, voz e acesso MCP)
app/r/[id] · app/imprimir/[id]     ler e imprimir um resultado salvo (conversa, sessão, painel, painel do treino)
app/webhook/elevenlabs/route.ts    endpoint aposentado (HTTP 410)
app/mcp/route.ts                   endpoint MCP (JSON-RPC 2.0) para assistentes de IA
app/api/produtos/**                produtos, materiais e a ficha
app/api/simulacoes/**              treinos, mudança de status e o convite
app/api/salas/[token]/**           rotas públicas do vendedor (o prefixo é histórico; a entidade é a simulação)
app/api/resultados/[codigo]/**     o painel de um treino e a frase dos tipos de cliente
app/api/sessoes/**                 avaliações pendentes de e-mail
app/api/equipe/**                  a lista da equipe e a linha do tempo de uma pessoa

lib/banco.ts               esquema e migração das tabelas do modelo Produto → Simulação → Sessão
lib/produtos.ts            produtos e os materiais de cada um
lib/conhecimento.ts        gera e normaliza a ficha do produto (com tetos aplicados no código)
lib/extrair-pagina.ts      lê o texto de uma página, com bloqueio de endereços internos
lib/legendas.ts            converte .txt/.md/.vtt/.srt em texto
lib/simulacoes.ts          os treinos e o código do link
lib/metodologias.ts        SPIN, consultiva e personalizada — os critérios e os quatro momentos
lib/personas.ts            os 7 tipos de cliente e os atributos de cada um
lib/atribuicao.ts          distribui os tipos de cliente pelo time (não sorteia)
lib/cliente-simulado.ts    monta o personagem da conversa a partir de produto + tipo + dificuldade
lib/participantes.ts       quem treina (criado no próprio link, sem conta)
lib/sessoes.ts             as conversas, as transcrições e todas as consultas agregadas
lib/conversa-sessao.ts     o turno da conversa: a próxima fala do cliente
lib/sala-do-vendedor.ts    o que a sala pode fazer agora (tempo restante, tentativas)
lib/sessao-vendedor.ts     o cookie assinado que identifica quem treina
lib/entrar-vendedor.ts     identificação por Google e Microsoft (openid email profile)
lib/vozes.ts               a voz de cada tipo de cliente, no navegador e na ElevenLabs
lib/avaliacao.ts           o avaliador: nota por critério, evidência conferida e as médias
lib/analise.ts             a análise de conversa real e a gravação de todo resultado no histórico
lib/painel-simulacao.ts    os agregados do painel de um treino (cálculo puro)
lib/painel-equipe.ts       o resumo da equipe no período
lib/inicio.ts              os quatro indicadores e os três passos do Início
lib/equipe.ts              a tela de Equipe
lib/demo.ts                o conteúdo de exemplo; lib/semear-demo.ts semeia, lib/exemplos.ts remove
lib/ferramentas.ts         as quatro ferramentas expostas por MCP
lib/store.ts               configuração em SQLite, com variáveis de ambiente como prioridade
lib/ai.ts                  cliente OpenRouter (askText, askJSON, askWithTools), com modelo por tarefa
components/Resultado.tsx   as telas dos quatro formatos de resultado, compartilhadas
components/SalaVoz.tsx     conversa e voz selecionada
components/useReconhecimentoVoz.ts  captura, transcrição e recuperação de falhas do navegador
components/FeedbackVendedor.tsx  o feedback de quem treinou, nas duas telas que o mostram
Dockerfile                 build multi-stage com saída standalone
docker-compose.yml         sobe este app isolado
render.yaml                blueprint do Render (runtime image)
```

## Verificação local
`npm run build` verifica o build e os tipos. `npm run lint` verifica as regras do projeto.

`npm test` executa os testes Playwright usando um servidor na porta 3217 e SQLite temporário. Se necessário, instale o navegador com `npx playwright install chromium`. O reconhecimento de fala, a síntese e a resposta da ElevenLabs são simulados nos testes; sessões, cookies, transcrição e avaliação em modo demonstração usam o código real. Para conferir timbre e latência com a sua conta, selecione uma voz em `/setup` e faça uma conversa com microfone real.

## Orientação durante e depois da conversa
O cartão **Dica para sua próxima fala** mostra uma orientação de até 160 caracteres após cada resposta do cliente. Um orientador com ferramentas consulta o objetivo, os critérios da metodologia e a ficha do produto; a última parte da conversa orienta a sugestão. Ele não recebe a persona oculta. A dica é buscada separadamente da resposta de voz, guardada por mensagem e nunca entra na transcrição nem no áudio. Recarregar a sala reutiliza a dica.

No encerramento, o avaliador calcula o feedback com a rubrica e verifica as citações. Um segundo agente consulta essa avaliação para produzir até três ações, cada uma ligada a um critério existente e com uma forma observável de conferir a aplicação. O plano fica salvo junto ao resultado, aparece também no histórico, na impressão e no texto copiado. As duas menores notas abaixo de 7 recebem destaque como pontos a melhorar.

O orientador tem limite de 8 segundos; o planejador, 15 segundos. Ambos executam no máximo três rodadas com o modelo. Falha, resposta inválida ou ausência da consulta obrigatória utiliza uma orientação básica, identificada na tela. Sem IA conectada, dicas e plano são exemplos explicitamente rotulados. Os testes simulam respostas dos modelos e verificam as consultas às ferramentas, validação, isolamento por sessão e continuidade da conversa.


## Conversa contínua com LiveKit

O vendedor recebe um roteiro antes de iniciar. O roteiro, o personagem e o contexto do produto ficam salvos por sessão; alterações no cadastro não mudam a conversa em andamento.

Em `/setup`, conecte OpenRouter, ElevenLabs e LiveKit. Escolha o modelo da simulação e o da avaliação separadamente: os seletores incluem Gemini e OpenAI. A ElevenLabs fornece transcrição Scribe v2 Realtime e voz Flash v2.5; o LiveKit transporta o áudio e permite interrupções. As chaves ficam no servidor.

Além do Next.js, execute o serviço de voz:

```sh
npm ci
npm run agent:dev
# Produção:
npm run agent:start
```

Os dois processos precisam usar o mesmo diretório de trabalho e `DATA_DIR` (SQLite e arquivo `chave-mestra`). Se usar `CHAVE_MESTRA` por ambiente, defina a mesma nos dois processos. Variáveis de ambiente precisam ser fornecidas aos dois processos; o comando `tsx` não carrega `.env.local` automaticamente. Reinicie o serviço de voz após alterar credenciais do LiveKit. O servidor deve permitir conexões de saída aos três provedores, e o navegador precisa de HTTPS (ou localhost) para o microfone.

Com Docker, execute `docker compose up --build -d` e configure as conexões no app. A imagem Debian compartilha `/app/data` entre site e serviço de voz; isso também vale para o blueprint do Render. Em instâncias com menos de 2 GiB de memória, como o Starter de 512 MB, o serviço de voz local não é iniciado: a conversa usa o reconhecimento de fala do navegador, as respostas do OpenRouter e o áudio do ElevenLabs, quando configurados. A mesma verificação de memória controla o processo e a tela, mesmo com credenciais LiveKit salvas.

Com pelo menos 2 GiB, o serviço LiveKit aguarda as credenciais e é reiniciado se parar. Mantém um processo de chamada pré-aquecido. Esse limite é uma margem de proteção, não uma garantia para chamadas simultâneas: o SDK também carrega inferência local antes da primeira conversa. Monitore a memória para dimensionar a instância. Se o agente não responder ou desconectar durante a conversa, a tela oferece a voz do navegador. Uma chamada real depende de credenciais válidas, acesso ao microfone e recursos disponíveis na instância.

Na conversa, um toque abre o microfone. É possível interromper o cliente falando, pausar o microfone e digitar sem trocar de sessão. As falas são gravadas pelo worker no servidor e reutilizadas na avaliação; ao encerrar, o navegador aguarda o worker fechar a conversa antes de pedir a avaliação. Uma reconexão reutiliza o histórico e o roteiro. Sem as três integrações configuradas, continua disponível o modo anterior de voz do navegador e a demonstração.

Referências: [LiveKit Agents](https://docs.livekit.io/reference/agents-js/), [ElevenLabs no LiveKit](https://docs.livekit.io/agents/models/tts/elevenlabs/) e [OpenRouter no LiveKit](https://docs.livekit.io/agents/models/llm/openrouter/).


### Conectar a conta LiveKit pelo navegador

Em `/setup`, o botão **Conectar LiveKit Cloud** abre a autorização no LiveKit. Após entrar na conta e selecionar o projeto, a aplicação consulta a aprovação e salva URL, chave e segredo cifrados no servidor. Não é necessário instalar a CLI ou copiar as chaves.

Esta é uma adaptação experimental do [fluxo público no código da CLI oficial](https://github.com/livekit/livekit-cli/blob/main/cmd/lk/cloud.go), usando `/cli/auth`, `/cli/confirm-auth` e `/cli/claim`. Não é uma API OAuth pública documentada para terceiros, e esses endpoints podem mudar. Os campos manuais continuam disponíveis. O navegador precisa permitir acesso a `cloud.livekit.io`, e o servidor precisa acessar `cloud-api.livekit.io`.

A tentativa expira em até 15 minutos, fica vinculada ao navegador que a iniciou e exige acesso administrativo ao app. Cancelar interrompe a importação neste app; não revoga credenciais que já tenham sido emitidas no LiveKit. As variáveis de ambiente têm prioridade: remova as variáveis `LIVEKIT_*` antes de trocar o projeto pela tela. Uma troca de projeto exige reiniciar o serviço de voz, como na configuração manual.

### Cadastro pela página de vendas

Em Produtos → Novo produto, informe o link da LP. O nome é obtido do título quando não preenchido. A página fica salva como material e, com a IA conectada, gera uma ficha em rascunho para revisão. Se a geração falhar, o material permanece disponível para tentar novamente. A coleta não segue links para outras páginas; confira a cobertura do material importado.

Bright Data é opcional em Configurações (ou `BRIGHTDATA_API_KEY`). A aplicação usa `scrape_as_markdown` no [MCP hospedado](https://docs.brightdata.com/products/mcp-server/overview). Sem a integração, tenta a leitura direta de HTML.

### Persistência e exemplos

O blueprint usa Starter com disco de 1 GB em `/app/data`. SQLite e o arquivo `chave-mestra` devem permanecer juntos: guardam dados e acesso às configurações cifradas. Instalações existentes precisam sincronizar o blueprint no Render. Antes de alterar uma instalação sem disco, copie seu diretório de dados; anexar um disco não migra o conteúdo efêmero automaticamente.

Em Configurações → Dados de exemplo, é possível remover a demonstração. Dados reais, credenciais e exemplos referenciados por treinos reais são preservados. A remoção fica registrada para impedir recriação no próximo reinício.

### Cadastro e revisão (0.4.0)

Escolha **Importar pelo link** ou **Preencher manualmente**. A importação mostra as etapas informadas pelo servidor e sugere nome, categoria, descrição e ficha em uma única leitura com IA. A revisão abre esses campos editáveis; materiais adicionais ficam recolhidos. **Confirmar ficha** salva os dados básicos junto da ficha e libera o treino. Informações ausentes, como preço e concorrentes, não são inventadas. Respostas vazias da IA preservam a página como material e oferecem nova tentativa, sem anunciar sucesso.

### Ajustes de voz (0.4.1)

O fluxo LiveKit publica o microfone antes de aguardar a prontidão do agente, como no Entrevistadora IA, evitando uma espera circular na conexão. O agente aguarda o participante e só inicializa a CLI quando executado diretamente. A imagem inclui as bibliotecas de áudio e corrige a propriedade do volume antes de iniciar os processos sem root. O build testa a preservação da chave mestra e das configurações em um volume com proprietário antigo.

### Reconhecimento de fala no navegador (0.4.2)

A sala confirma o início do reconhecimento antes de mostrar “Estou ouvindo você” e explica falhas de conexão, captura ou permissão. É possível reiniciar a voz sem recarregar a página. Falas finais consecutivas são preservadas, e pausas ou cancelamentos não deixam o envio preso nem interrompem uma nova tentativa. A correção foi validada em 21 testes de voz, incluindo transcrição real pelo Chrome com áudio sintético, além de TypeScript, lint e build de produção.

### Memória e acesso ao banco (0.4.3)

Instâncias com menos de 2 GiB usam a voz do navegador e não iniciam o agente LiveKit local, mesmo com as credenciais configuradas. As respostas da IA e o áudio ElevenLabs continuam disponíveis. A queda de um agente encerra o estado de escuta e permite reconectar ou selecionar a voz do navegador.

As conexões SQLite do app passam a compartilhar WAL e espera por bloqueios desde a inicialização. A criação e migração das tabelas reservam a escrita antes de consultar o esquema e só ficam marcadas como concluídas após o commit. Isso corrige o caso reproduzido de `database is locked` na limpeza inicial e permite nova tentativa após uma falha, preservando os dados existentes.

Validação: 33 testes, incluindo contenção real entre processos, migração concorrente, recuperação do agente e transcrição real no Chrome; TypeScript, lint dos arquivos alterados e build de produção. No teste local do servidor de produção com o limite informado simulado em 512 MiB e cinco credenciais fictícias configuradas, o navegador abriu o microfone sem acionar LiveKit e 20 verificações de saúde responderam 200. Esse teste verifica a seleção do modo de voz, não impõe um limite físico de memória nem substitui a validação no Render.

### Gestão de treinos e resultados (0.5.0)

Produtos, Simulações, Equipe e Resultados têm busca, indicadores e listas adaptadas ao celular. As opções ficam em popovers com ícones, navegação por teclado, fechamento por Escape e clique fora. Criar treino ganha destaque. O gestor pode renomear e apagar treinos, editar pessoas e consultar seus detalhes sem abrir uma tabela extensa. Exclusões pedem confirmação e explicam o destino das avaliações.

Treinos pausados ou encerrados desativam o compartilhamento e a interação. Quem abre o link vê um aviso; uma sala já aberta confere a disponibilidade a cada cinco segundos e o agente de voz confere a cada dois segundos. Reativar mantém o mesmo endereço. As rotas antigas também respeitam a pausa.

Conversas sem fala do vendedor (inclusive texto vazio ou só espaços) ficam fora das listas de resultados, médias, indicadores, históricos de treino e avaliações pendentes. Encerrar sem falar não consome uma tentativa. A regra vale também para registros antigos, sem apagar os dados. Exemplos só são removidos quando o vendedor efetivamente fala.

Para validar a versão de produção com banco temporário e navegador Chromium:

```sh
npm run lint
npm run build
PLAYWRIGHT_PRODUCTION=1 npm test
```

Os testes de gestão incluem pausa e reativação do mesmo link, sessão sem fala, edição e exclusão com confirmação, recuperação de erros e popovers em desktop e celular. O teste opcional de reconhecimento real continua dependendo de `VOZ_TESTE_ARQUIVO`.

### Orientação e compartilhamento (0.6.0)

- Configurações ocultam o bloco “Para a equipe técnica”. A opção de remover exemplos desaparece após uma limpeza bem-sucedida, inclusive ao recarregar ou acessar de outro navegador; dados reais e exemplos vinculados a treinos reais continuam preservados.
- Copiar link mostra uma confirmação via toast. Abrir link usa uma nova aba. As ações têm ícone e texto nos treinos, convites e resultados; treinos indisponíveis mantêm o compartilhamento desativado.
- O orientador pode destacar um acerto com evidência na última fala do vendedor. O retorno é silencioso, dura seis segundos, respeita movimento reduzido e aparece no máximo três vezes por sessão, com intervalo mínimo de 45 segundos. Não altera notas, transcrição ou a fala do cliente.
- O simulador destaca o tempo e orienta o cliente virtual a encerrar naturalmente ao atingir a duração prevista, dando espaço para o vendedor combinar os assuntos da próxima conversa. Texto, voz do navegador e LiveKit compartilham essa regra.

Validação: build de produção, lint e testes de interação e persistência, incluindo o cronômetro, aviso sem repetição, texto em edição, instruções da IA e agente LiveKit com serviços de voz simulados. O teste opcional de reconhecimento real depende de `VOZ_TESTE_ARQUIVO`.

Validação desta versão: 52 testes aprovados no servidor de produção standalone, incluindo capturas e navegação por teclado em 1280 px e 390 px; build com TypeScript aprovado e lint sem erros (um aviso preexistente em `components/setup.tsx`). O teste opcional de voz real não foi executado por depender de `VOZ_TESTE_ARQUIVO`.
