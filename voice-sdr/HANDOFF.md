> **Atualizado em 2026-09-25:** o estado atual e o que fazer a seguir estão em
> [`docs/plano-de-continuacao.md`](docs/plano-de-continuacao.md). O resto deste
> arquivo é o histórico das fases anteriores.

# Continuando o Sarah Voice SDR

> Prompt de handoff. Escrito em 2026-09-24, ao fim da sessão que entregou
> US-245 a US-251. Passe este arquivo inteiro para o próximo agente.

## ANTES DE QUALQUER COISA: 73 arquivos sem commit

Último commit: `26e9580`. Tudo descrito abaixo como "pronto" existe só no
diretório de trabalho e no Supabase remoto. Um `git checkout` acidental apaga
um dia de trabalho.

**Commite primeiro, por assunto:** ciclo de evolução (US-245), provedor de
modelo por OAuth (US-246), ensaio (US-247), janela e número de teste (US-248),
menu e rotas (US-249), funil (US-250), especialistas (US-251).

## Onde está

3.370 testes verdes em `npm run check`, 55 migrações, 30 funções de borda.
Supabase `tlepdumfvwywtchdxsuk` com pg_cron e pg_net. A primeira ligação real
funcionou (163 s). O menu tem 17 telas de 23.

**F2 está a uma história de fechar** — falta só a US-093.

## A ordem de construção

### 1. Fechar a F2 — 1 história

**US-093, ponto de checagem da F2.** Molde em
`testes/estatica/ponto-de-checagem-f1.test.ts`, auxiliar em
`testes/auxiliares/ponto-de-checagem.ts`. Os sete critérios estão em
`docs/PRD.md:292-298`. Arquivos de prova já levantados:

- `call-place/discagem.test.ts`, `call-init/contexto.test.ts`
- `call-finalize/finalizacao.test.ts`, `call-classify/classificacao.test.ts`
- `cron-call-recovery/recuperacao.test.ts`, `emergency-stop/freio.test.ts`
- `testes/banco/{guarda-de-discagem,janela-de-discagem,custo-da-chamada,freio-de-emergencia,recuperacao-de-chamadas}.test.ts`
- `app/src/chamadas/{discador,ficha}.test.ts`, `app/src/componentes/freio-de-emergencia.test.tsx`

`faltaNoCi` obrigatórios: os 8 s, 60 s, 5 min e 10 s; a concorrência da guarda
e da fila; o `deno check` de todos os `index.ts`; pg_cron e pg_net; as chamadas
reais aos provedores; o Vault; a sonda de T-01 da US-041.

### 2. Tutorial guiado — US-252 a US-256, 5 histórias

Hoje `/configuracao-inicial` tem nove passos que **só apontam** para outras
telas: cada um mostra um botão "Abrir integrações", a pessoa sai, configura,
volta e marca o passo. O dono quer o oposto: **configurar tudo dentro do
tutorial**, sem sair dele.

Os nove passos do catálogo (`passos_de_configuracao`, literais em
`app/src/copy/configuracao-inicial.ts`): `credenciais`, `agente`, `roteiro`,
`numero`, `especialista`, `agenda`, `leads`, `equipe`, `concluida`.

**US-252 — O passo embute o formulário, em vez de apontar para a tela.**
Cada passo passa a renderizar o formulário da tela correspondente, reusando o
componente que já existe. Nenhum formulário é reescrito: `TelaDeIntegracoes`,
`TelaDeIdentidadeDaSarah`, `TelaDeVozDaSarah`, `TelaDePlaybooksDaSarah`,
`TelaDeNumeros`, `TelaDeEspecialistas`, `TelaDeConhecimento` e
`TelaDeImportacaoDeLeads` ganham um modo compacto (prop `dentroDoAssistente`)
que esconde cabeçalho e navegação e devolve o mesmo formulário. Uma segunda
versão de qualquer um divergiria do original na primeira mudança.

**US-253 — Toda opção aparece, com o padrão e o porquê.**
O tutorial expõe **todas** as configurações que hoje só existem em telas
avançadas, cada uma com o valor padrão visível e uma linha dizendo o que
acontece se ficar assim:

- Discagem: janela por dia da semana, intervalo mínimo, tentativas por número,
  teto diário de ligações, teto de gasto, concorrência, duração máxima.
- Privacidade: gravação ligada, texto do aviso, dias de retenção.
- Modelo: provedor (plataforma ou OpenRouter) e o modelo de cada tarefa.
- Voz: voz escolhida, estabilidade, velocidade.
- Playbooks: os quatro propósitos, com as três camadas.
- Especialista: modalidades, duração, teto diário, antecedências.

Nada fica escondido atrás de "avançado": o dono decide o que muda, e o padrão
fica explícito. Quem não quiser mexer avança com um clique.

**US-254 — Avançar não exige terminar, e o progresso é por passo.**
Permitir pular e voltar em qualquer ordem, e cada passo diz o que ele bloqueia
se ficar pendente — `bloqueia` já existe no catálogo. Passo opcional (`equipe`,
`leads`) se distingue do que trava a primeira ligação.

**US-255 — O tutorial conduz até a primeira ligação de teste.**
O último passo antes de `concluida` dispara uma ligação para o número de teste
cadastrado, mostra o estado ao vivo, e ao fim abre a ficha com transcrição.
É o que fecha o laço: quem terminou o tutorial já ouviu a Sarah.

**US-256 — Testes do tutorial.**
Em jsdom, com os serviços dublados: cada passo abre o formulário certo, salvar
dentro do tutorial grava pelo mesmo serviço da tela, pular mantém o progresso,
e o passo que bloqueia diz o que bloqueia.

### 3. Canvas do agente — removido

Construído (US-257 a US-264) e descartado pelo dono em 2026-09-24: não ajudou
a entender a configuração. Branch e worktree apagados; a migração do layout
nunca foi aplicada no Supabase remoto. Não reabrir sem pedido explícito.

### 4. F3 — 25 histórias, US-096 a US-120

Ferramentas do agente e fila de exceções. Destrava `/fila` e completa o ensaio.

1. `US-096` a `US-099` — migrações: conformidade, `exception_items`,
   `rehearsals`, ensaio fora das métricas.
   **Reconciliação:** `rehearsals` já existe na migração `20260924120000`
   (US-247). A US-098 confere o que falta, não recria.
2. `US-100` a `US-103` — segredo derivado com rotação de dois segredos,
   esqueleto comum das ferramentas, modo ensaio no esqueleto (leitura de
   verdade, efeitos pulados), camada 1 da F3.
3. `US-104` a `US-111` — `tool-dnc`, `tool-transfer`, as três ferramentas de
   sistema nas quatro publicações, captura na finalização, reaplicação do
   bloqueio que falhou, conferência das falas de pessoa errada, item de falha
   repetida, rediscagem recusada.
4. `US-112` a `US-115` — perfis de lead simulados, `rehearsal-session`, ensaio
   por texto com as ferramentas em ordem, ensaio por voz.
   **Reconciliação:** `rehearsal-session` e as duas telas já existem (US-247).
   Falta: os perfis simulados e a lista de ferramentas chamadas em ordem.
5. `US-116` e `US-117` — RPC de criação e resolução de item, tela `/fila` com
   contexto, áudio e resolver em um clique.
6. `US-118` e `US-119` — migração que liga `feature_flags.real_dialing`, estado
   do portão em `/config/discagem`.
7. `US-120` — ponto de checagem da F3.

### 5. F4 — 26 histórias, US-126 a US-151

Qualificação, funil configurável e painel com números de verdade.

1. `US-126` a `US-131` — migrações: limiares da fila, etapas configuráveis com
   chave imutável, `mover_lead_de_etapa`, classificação com confiança e trava
   da correção humana, `corrigir_classificacao`, fila completa.
2. `US-132` a `US-135` — módulos puros: mapeamento de etapa por chave,
   pontuação e temperatura com régua em configuração, avaliação por critérios
   objetivos, gatilhos da fila com limiares por conta.
3. `US-136` a `US-142` — `tool-qualify` portável e adaptador, restrição por
   propósito, obrigatoriedade antes de encerrar descoberta, retaguarda com
   confiança menor, acionamento em via dupla e idempotente, sentimento,
   avaliação automática.
4. `US-143` e `US-144` — `dashboard_summary` sem agregar no cliente, painel
   lendo dele com a métrica norte declarada.
5. `US-145` a `US-150` — quadro do funil por etapa, configuração de etapas com
   a prova de que renomear não quebra automação, ficha do lead com linha do
   tempo unificada, ficha da chamada com avaliação e correção, fila completa,
   tela dos limiares.
   **Reconciliação:** `/funil` já existe (US-250) sobre etapas fixas. A US-145
   o reescreve sobre etapas configuráveis.
6. `US-151` — ponto de checagem da F4.

### 6. F5 — 30 histórias, US-156 a US-185

Agenda e reuniões. Destrava `/reunioes`.

1. `US-156` — verificação OAuth do Google como estado do checklist.
2. `US-157` a `US-162` — migrações: `specialists` com fuso e marca de rodízio,
   `specialist_availability` e `_blocks`, `specialist_calendars` e
   `_busy_blocks`, `meetings` com restrição de exclusão, RPC de inserção com
   lock por especialista e dia, `call_slot_offers`.
   **Reconciliação:** `specialists` já existe e já tem tela (US-251).
3. `US-163` em diante — roteamento como configuração, `tool-availability` e
   `tool-book-meeting`, sincronização de calendário, telas de disponibilidade e
   de reuniões.
4. Ponto de checagem da F5 no fim.

### 7. F6 — 30 histórias, US-186 a US-215

Automação e cadências: contrato de execução de `job_runs`, alarme de laço,
política de retentativa, `reprogramar_tentativa`, configurações de automação,
lembrete de reunião, `tool-confirm-meeting`, `tool-reschedule`, cadências.
Destrava `/cadencias`.

### 8. F7 — 29 histórias, US-216 a US-244

Campanhas: `campaigns` e `campaign_targets`, regra de liberação (50 ligações
manuais com conversão), público, prévia obrigatória, `campaign-preview`, telas.
Destrava `/campanhas`.

### 9. Fora das fases

- **Webhooks de saída (RF-914).** `outbound_webhooks` e `outbound_deliveries`
  estão em `docs/PRD-implementacao.md:322` e não existem. Migração + borda
  `webhook-dispatch` + tela `/config/webhooks`.
- **`/config/conta`.** Nome da conta, fuso e os dois parâmetros do disjuntor
  (`breaker_failures`, `breaker_window_minutes`) — as demais colunas de
  `account_settings` já têm tela.

## Como executar: Ralph em subagentes

O trabalho é longo demais para uma conversa. Instancie o Ralph.

Uma frente por vez — **a máquina tem 8 GB e já matou processos por memória**.
Rode com `ralph --tool claude N`; sem `--tool` ele abre menu e trava.

A ordem é sequencial por dependência: F3 antes de F4 (a fila e as ferramentas
alimentam a qualificação), F4 antes de F5 (a etapa configurável entra no
roteamento), F5 antes de F6 (o lembrete depende da reunião), F6 antes de F7 (a
campanha usa a política de retentativa).

**O tutorial é independente das fases.** Ele depende da US-252 antes de tudo,
porque as demais reusam o modo compacto que ela cria.

**Dentro de cada fase há paralelismo seguro**: as migrações vêm primeiro e o
resto pendura nelas. Na F3, `US-100` a `US-103` e `US-112` a `US-115` não se
tocam depois que `US-096` a `US-099` estiverem aplicadas. Use `ralph-parallel`
para dividir em worktrees quando a fase permitir, e `squad` se quiser builder e
validador separados.

Antes de disparar qualquer frente, leia `progress.txt`: ele tem os learnings
por história.

## Contexto que evita repetir erro

- **A escada não vê o PostgREST, e isso mordeu três vezes.** Nesta sessão:
  `rehearsal-session` pedia `playbook_version_id` a `agent_publications`, coluna
  que nunca existiu — passou por typecheck, lint e 3.300 testes e só apareceu
  quando um humano clicou. `testes/estatica/colunas-das-consultas.test.ts`
  agora pega essa família; junções ambíguas e CORS já tinham redes.
- **O relatório JSON do vitest chega atrasado.** O `rtk` engole a saída, e ler
  `.vitest/json/output.json` logo depois devolve a rodada **anterior**. Isso me
  fez acreditar em duas sabotagens que não derrubaram nada. Use
  `rtk proxy npx vitest run ...` e leia a saída direta.
- **Guarda duplicada não se prova.** A mesma regra em dois lugares faz as duas
  se cobrirem, e nenhuma sabotagem cai.
- **Dublê com `Proxy` já registra membros tocados** (`playbook-draft`): um
  `tocados.push` manual conta duas vezes.
- **`npm run check` inteiro estoura os 8 GB** e derruba arquivos de PGlite com
  FAIL sem teste falhando. Rodar isolado confirma.
- **`tsc --build` com cache não pega teste novo**, e vitest não faz typecheck.
- **Regras do CLAUDE.md**: nunca docker, `supabase start`, `db reset` nem
  navegador no laço. Português no código. Literais em `app/src/copy/`. Contrato
  + implementação + dublê + provedor. Alias novo exige `vite.config.ts` **e**
  `tsconfig.app.json`.
- **`supabase db push` é bloqueado pelo classificador do modo auto.** Peça ao
  usuário: `! supabase db push --include-all`. `functions deploy` passa.

## Estado do ambiente real

`SARAH_ORIGENS_PERMITIDAS=http://localhost:5173`. As 55 migrações aplicadas.
Publicadas: `call-review`, `model-connect`, `rehearsal-session`,
`playbook-draft`, `call-classify`.

**`SARAH_MODELO_API_KEY` não está configurada por decisão do dono** — ele vai
pelo OpenRouter. Até a conta concluir o OAuth em `/config/integracoes`, as três
funções de modelo respondem 428 `modelo_nao_conectado`.

## Pendências de antes, ainda abertas

- Webhooks `call-init` e `call-events` não cadastrados na ElevenLabs: o
  contexto do lead não é injetado no começo da ligação.
- `phone-numbers` lista os números da Twilio, mas o cofre devolve "não
  configurada" e a tela não foi ligada.
- Repositório sem remote; **o CI nunca rodou**. O degrau 3 nunca foi executado,
  inclusive o `deno check` dos cinco `index.ts` novos. `deno check` local falha
  por falta das dependências npm; `deno lint` valida a sintaxe.
- Porta 54322 vs 54422 em `test:rls:postgres` quebra o degrau 3.
- A **voz** do ensaio nunca foi exercitada: jsdom não tem microfone nem
  WebSocket.

## O que esta sessão entregou

Tudo publicado no Supabase, nada commitado.

- **US-245, ciclo de evolução da ligação.** Botão na ficha da chamada: analisa
  a conversa, pergunta o que só o dono sabe, propõe mudanças, aceita/recusa/
  questiona, aplica como rascunho. Nunca publica (RF-307). O que não pode
  aplicar (voz, conhecimento) vira encaminhamento com o caminho exato da tela.
  Migração `20260924100000`, borda `call-review`.
- **US-246, provedor de modelo por OAuth PKCE.** A conta conecta o OpenRouter
  e escolhe o modelo por tarefa. `call-review`, `playbook-draft` e
  `call-classify` resolvem a porta por `_shared/modelo/resolucao.ts`. Migração
  `20260924110000`, borda `model-connect`, cartão em `/config/integracoes`.
- **US-247, ensaio.** `/sarah/ensaio` conversa com o agente publicado (T-16),
  por texto ou voz, sem telefone. Grava `calls` com `direction='rehearsal'`, e
  o ciclo de evolução funciona sobre ele. Migração `20260924120000`, borda
  `rehearsal-session`, SDK `@elevenlabs/client` 1.25.0.
- **US-248, janela e número de teste.** Migração `20260924130000`. A exceção é
  do número, não de `p_bypass`.
- **US-249, menu.** Itens sem tela apagados com "em breve"; os com tela usam
  `<Link>`. `navegacao-e-rotas.test.ts` cruza menu × rotas nos dois sentidos.
- **US-085, base de conhecimento.** `/sarah/conhecimento`. Fecha a F2 com a
  US-064.
- **US-250, funil** e **US-251, especialistas**.
