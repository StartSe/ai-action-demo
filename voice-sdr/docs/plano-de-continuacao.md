# Plano de continuação

Para o agente que pega o trabalho daqui (Claude Tag ou outro). Escrito em
2026-09-25, depois de uma sessão com várias frentes em paralelo. Leia inteiro
antes de mexer em qualquer coisa: a ordem das frentes importa, e há trabalho
pela metade em duas branches.

## 1. Antes de começar

Leia, nesta ordem:

1. `CLAUDE.md` (raiz), `app/CLAUDE.md`, `supabase/CLAUDE.md`, `testes/CLAUDE.md`:
   as regras de validação, de código e de banco. Elas não são sugestão.
2. `docs/PRD-implementacao.md`: arquitetura, esquema, rotas e fases.
3. `docs/instalacao.md`: como a solução se instala no Supabase de cada cliente.
4. `docs/personas.md` e `docs/validacao-por-persona.md`: para quem é o produto e
   os defeitos que a validação achou.
5. `docs/roteiro-de-apresentacao.md`: como o produto é apresentado ao cliente.
6. `progress.txt`: o aprendizado de cada história, fase a fase.

## 2. Regras que não se quebram

- **Validação local é `npm run check`**, da raiz. Nunca rode `docker`,
  `supabase start`, `supabase db reset`, `supabase migration up`, Playwright nem
  automação de navegador. `npm run check:full` é só do CI.
- **Mudou migração, função de borda ou `supabase/config.toml`? Rode
  `npm run pacote`** e commite o que ele gerar (`instalacao.json` e
  `instalacao/`). O teste `testes/estatica/pacote-de-instalacao.test.ts` reprova
  pacote desatualizado. Conflito de merge em `instalacao/` se resolve rodando o
  gerador de novo, nunca à mão.
- **Nada depende de conta da StartSe.** Toda credencial de terceiro (Twilio,
  ElevenLabs, OpenRouter, Z-API, e-mail) vem do cliente, digitada na configuração
  com instrução de onde achar. A instalação por OAuth do ai-hub só atua durante a
  instalação e revoga o token no fim.
- **Nenhum texto de interface diz "Sarah".** A marca é "Voice SDR"; a assistente
  tem o nome que o cliente escolhe (`useNomeDaAssistente()`, ou "a assistente").
  `testes/estatica/marca.test.ts` cobra.
- **Sem jargão de construção na tela**: nada de "fase", "fatia", "portão",
  "nesta fase". Frase de cliente.
- **Código, nomes e textos em português**, com acento. Literais de interface em
  `app/src/copy/`; falas do servidor em `supabase/functions/_shared/speech/`.
- **Commits pequenos**, um por história ou defeito, mensagem em português no
  estilo do `git log` (`feat: US-XXX - título`, `fix: ...`).
- **Migração nova** usa timestamp maior que a maior de `main`. Hoje a maior
  de `main` é `20261020000000` (ainda não aplicada no ambiente de teste; a maior
  aplicada é `20261012110000`). A próxima desta faixa é `20261020010000`, e
  `frente/f7-escala` usa `20261021000000` em diante.

## 3. Onde as coisas estão

| Lugar | O que é |
|---|---|
| `main` (GitHub `StartSe/toolkit-sarah-voice-sdr`) | Tudo o que está no ar no ambiente de teste. F0 a F5 inteiras, F6 parcial (13/30), WhatsApp, instalação pelo ai-hub, diagnóstico da chamada |
| `frente/defeitos-da-persona` | Mesclada em `main` (seção 4.1); falta publicar no ambiente de teste |
| `frente/f7-escala` | F7 com 24/29 histórias + 1 WIP (US-240), não mescladas |
| Ambiente de teste | Supabase `tlepdumfvwywtchdxsuk`: as funções e as migrações de `main` publicadas e aplicadas |

Os commits com prefixo `wip:` estão **sem validação**: foram salvos no meio,
quando o trabalho foi interrompido. Comece conferindo cada um.

## 4. As frentes, em ordem

### 4.1 Defeitos da persona — feito e mesclado em `main`

A branch `frente/defeitos-da-persona` foi mesclada em `main`. Cada defeito tem
commit próprio, com teste, e `npm run check` verde:

| Defeito | Commit | O que foi feito |
|---|---|---|
| D-01 | `da0a017` | O painel conta reuniões marcadas, realizadas e o custo por reunião |
| D-02 | `1c5b4ab` | "Formulário do site" em Integrações, com a chave e o endereço de entrada |
| D-03 | `06fb0bf` | "Ligar para o lead novo em minutos" pela tela e no fecho do tutorial |
| D-06 | `d8ace5a` | Contagem de itens da fila na barra lateral |
| D-07, D-15 | `78813c5`, `3150592` | Sem "nesta fase" na guarda, na fila e no playbook |
| D-17 | `1c46d55` | "Em breve" e nome da navegação na copy |
| D-11 | `b7279da` | Ligação de teste fora da janela diz quando abre e aponta Discagem |
| D-14 | `97894ef` | Estimativa de custo antes de ligar, no discador e na primeira ligação |
| D-09 | `abcaa43` | Fuso como seletor pelo nome, com os cinco fusos do Brasil e "Outro fuso" |
| D-16 | `06b528e` | Parcial: a área do especialista sugere as já cadastradas, e o roteamento por área as lista |
| D-10 | `25f226e` | O negócio do tutorial nasce com a empresa, sem perguntar de novo |
| D-12 | `d9a2718` | Zerar o ambiente vale sem variável enquanto a instalação tem uma conta só |
| D-08 | `0030c28` | A importação aceita `.xlsx`, sem biblioteca nova |
| Docs | `f7094a9` | Estado de cada defeito em `docs/validacao-por-persona.md` |

O que ficou de D-16: levar a lista de áreas à descrição do campo `area` da
ferramenta `tool-availability` na publicação. Isso muda o hash da publicação, e
a decisão vai junto com a subida de `FATIA_PUBLICADA` (seção 4.3).

Migração nova: `20261020000000_estimativa_de_custo.sql`. A próxima desta faixa é
`20261020010000`; `frente/f7-escala` usa `20261021000000` em diante.

**Nada disso foi publicado no Supabase de teste.** Alguém com a CLI autenticada
precisa rodar `supabase db push` (as migrações `20261013100000`,
`20261013110000` e `20261020000000`) e `supabase functions deploy
environment-reset` (D-12), seguindo a seção 5. A frase da guarda (D-07) mudou
em `_shared/discagem/guarda.ts`, que `call-place` e `cron-dial` usam, e a versão
da instalação mudou em `saude`: publique essas três junto.

### 4.2 Terminar a F7 — branch `frente/f7-escala`

Prontas: US-216 a US-239 (campanha de ponta a ponta com prévia, disparo, pausa,
acompanhamento e custo; secretária eletrônica; saúde e rodízio das linhas; busca
em transcrições; webhooks de saída).

A fazer:

1. **US-240** (há um `wip:` no topo): alarme de laço de automação e de rotina
   silenciosa (`cron-operation-watch`, `_shared/operacao/`, migração
   `20261011280000_alarmes_de_operacao.sql`).
2. **US-241**: saúde da operação no painel (rotinas, números, crédito).
3. **US-242**: registrar a decisão sobre integração com CRM (é decisão
   documentada, não integração).
4. **US-243**: ponto de checagem da F7.
5. **US-244**: fecho do produto (toda fase com ponto de checagem e nenhum
   critério sem prova).

A branch nasceu antes de F6, canais/agenda iCal/e-mail e instalação entrarem em
`main`. O merge vai dar conflito: preserve o que `main` tem e acrescente a F7 por
cima; rode `npm run pacote` depois do merge. Cuidado com `cron-dial` e
`dial_queue`, que a F6 também mexeu.

### 4.3 Subir o que a assistente publica para a F6

A publicação na ElevenLabs ainda usa o conjunto de ferramentas da F3
(`FATIA_PUBLICADA` em `supabase/functions/_shared/agente/compilador.ts`). Com
isso, na ligação de voz ainda não estão no ar: oferecer horário e marcar
(`tool-availability`, `tool-book-meeting`, F5), confirmar e remarcar reunião
(`tool-confirm-meeting`, `tool-reschedule`, F6) e qualificar (`tool-qualify`,
F4). O WhatsApp já usa as de F5 (`FATIA_DO_WHATSAPP`).

Suba `FATIA_PUBLICADA` para `F6` com os testes da publicação ajustados
(`agent-publish/publicacao.test.ts`, `_shared/agente/compilador.test.ts`), e
avise que toda conta precisa republicar (o hash muda).

### 4.4 Terminar a F6 — `prd-f6.json`

Prontas: US-186, US-188 a US-199 e US-190 (retentativa por resultado, lembrete,
confirmar e remarcar, resgate de falta, automação da conta). Faltam, nesta
ordem:

1. **US-200 a US-206**: apuração da reunião (tabela, token, rotina por e-mail,
   página de resposta, fila do dia anterior, terceira fonte na ligação de
   acompanhamento, painel com taxa de apuração).
2. **US-187**: alarme de laço de automação como item de exceção (confira se o
   US-240 da F7 já cobre).
3. **US-207 a US-214**: cadências (gatilho, passos, saída, rotina, modelos
   prontos, telas).
4. **US-215**: ponto de checagem da F6.

### 4.5 Ajustes no ai-hub — repositório `StartSe/ai-hub`

A instalação pelo ai-hub está pronta do lado da Voice SDR (`instalacao.json`,
`docs/instalacao.md`), mas o painel precisa de quatro coisas. Trabalhe numa
branch própria lá, com as regras do `CLAUDE.md` do ai-hub:

1. Aceitar `?volta=<origem da cópia>` no instalador (validado) e, no fim,
   oferecer `<volta>#projeto=<supabase_url>&chave=<chave publicável>`.
2. Aceitar `revelar` na conferência da família supabase (o roteiro já declara
   `revelar: {campo: "chave"}`), ou o painel ler a chave publicável direto do
   Supabase.
3. Escopo por roteiro: a Voice SDR não precisa de Secrets nem de Auth. Hoje o
   app "AI Hub" pede escopos fixos.
4. Atualização: um passo que aplica só as migrações que faltam, lendo a versão
   registrada por `versao_da_instalacao()`, e republica as funções. As
   migrações da Voice SDR não podem rodar duas vezes.

### 4.6 CI no GitHub Actions

O repositório subiu para o GitHub agora, e a esteira
(`.github/workflows/integracao.yml`) nunca tinha rodado. Acompanhe a primeira
rodada e deixe verde. O que depender de credencial ausente deve sair com zero e
dizer por quê (regra do `CLAUDE.md`).

## 5. Publicar no ambiente de teste

Publicar mexe no Supabase de teste e precisa da CLI autenticada. Se você não
tiver acesso, deixe a lista pronta para uma pessoa rodar.

1. **Migrações**: `supabase db push`. Se a CLI pedir `--include-all` (migração
   com data anterior à última aplicada), antes confira que nenhuma migração nova
   redefine função, visão, gatilho ou restrição que uma posterior já aplicada
   criou; senão aplicar fora de ordem desfaz a posterior.
2. **Funções**: `deno check` numa cópia de `supabase/functions` com
   `deno.json` `{"nodeModulesDir":"auto"}`, e `supabase functions deploy <nomes>`.
3. **Republicar a assistente** quando a mudança tocar o que vai ao ar (prompt,
   ferramentas, critérios, retrato por canal).

## 6. O que só se confirma com os provedores de verdade

Nada disto foi testado contra o serviço real. É o primeiro teste de uma pessoa,
e cada item tem a suposição escrita no código:

- **ElevenLabs**: nomes dos campos do webhook de início, dos registros da
  conversa (diagnóstico) e o valor vazio de reserva das variáveis
  (`agent-publish/formato-do-provedor.ts`, `call-diagnose/formato-do-provedor.ts`).
- **Ligação recebida**: se o webhook de início traz o identificador da
  conversa (`call-init/formato-do-provedor.ts`).
- **Z-API**: formato das mensagens, das mídias e do cadastro de webhook
  (`_shared/whatsapp/zapi.ts`, suposições Z1 a Z9).
- **OpenRouter**: áudio `ogg/opus` do WhatsApp aceito pelo Gemini sem conversão
  (`_shared/modelo/leitura-de-midia.ts`, M3).
- **Resend** e **calendário iCal**: envio do convite e leitura dos três
  provedores de calendário.

## 7. Decisões que são do dono

Não decida sozinho; pergunte:

- Quem é membro de duas contas sempre abre a mais antiga: falta desenhar a troca
  de conta.
- Particularidades por canal foram feitas no mínimo (abertura e jeito por canal);
  roteiros inteiros por canal ficaram para quando houver pedido.
- Mensagem de número fora da lista no modo de teste do WhatsApp é ignorada mesmo
  com o canal desligado.
- Controle de acesso comercial (licença): hoje a StartSe não consegue desligar a
  operação de um cliente, só não hospeda a tela.

## 8. Pronto quer dizer

- `npm run check` verde e CI verde em `main`.
- Os `test.fails` das jornadas viraram `test`.
- `docs/validacao-por-persona.md` sem defeito P0 ou P1 aberto.
- F6 e F7 com ponto de checagem (US-215, US-243) e o fecho do produto (US-244).
- A instalação pelo ai-hub leva um cliente novo, sem esta máquina, do OAuth à
  primeira ligação.
