# Validação por persona

O que as três personas de [`personas.md`](personas.md) encontram quando
atravessam o produto, provado por testes de jornada e por leitura das telas.
Conferido em 2026-09-25, na base de `main` com o modo de teste do WhatsApp
(commit `6478326`). Outras frentes estavam em andamento em paralelo (F6, F7,
canais, iCal, e-mail, mídia no WhatsApp); o que elas entregarem pode fechar
itens daqui.

**Estado em 2026-09-25, na branch `frente/defeitos-da-persona`.** Todos os
defeitos da seção 2 estão corrigidos, cada um em commit próprio e com o teste
que o cobra, e nenhum `test.fails` sobrou nas jornadas. A tabela abaixo é o
resumo; a descrição de cada defeito na seção 2 continua como foi achada, para
quem quiser ver de onde a correção partiu.

| defeito | prioridade | estado | commit | quem cobra |
| --- | --- | --- | --- | --- |
| D-01 | P0 | corrigido: o painel conta marcadas, realizadas e o custo por reunião | `da0a017` | `testes/jornadas/lead-do-formulario.test.ts`, "D-01" |
| D-02 | P0 | corrigido: "Formulário do site" em Integrações, com a chave e o endereço | `1c5b4ab` | `testes/jornadas/lead-do-formulario.test.ts`, "D-02" |
| D-03 | P0 | corrigido: ligar para o lead novo em minutos pela tela e no fecho do tutorial | `06fb0bf` | `lead-do-formulario.test.ts` e `dona-de-servicos.test.tsx`, "D-03" |
| D-06 | P1 | corrigido: a barra lateral conta os itens da fila | `d8ace5a` | `app/src/jornadas/gerente-comercial.test.tsx`, "D-06" |
| D-07 | P1 | corrigido: a recusa da guarda diz por que só liga para teste, sem "fase" | `78813c5` | `supabase/functions/_shared/discagem/guarda.test.ts` |
| D-13 | P1 | coberto pela agenda por endereço iCal, sem aplicativo no Google Cloud; o OAuth do Google fica como caminho avançado | `78dd519` | `testes/banco/calendario-por-endereco-ical.test.ts` |
| D-11 | P2 | corrigido: antes do botão, o passo diz que a ligação de teste respeita a janela e quando ela abre; a recusa aponta Discagem, não o passo do número | `b7279da` | `app/src/rotas/configuracao-inicial-ligacao.test.tsx`, "D-11" |
| D-14 | P2 | corrigido: estimativa de custo antes de ligar no discador e na primeira ligação, pela média medida da conta (`estimativa_de_custo`), por moeda, declarada como estimativa | `97894ef` | `testes/banco/estimativa-de-custo.test.ts`, `app/src/rotas/painel.test.tsx` e `configuracao-inicial-ligacao.test.tsx`, "D-14" |
| D-08 | P2 | corrigido: a importação aceita `.xlsx` (primeira aba) sem biblioteca nova, e o teto de 5.000 linhas aparece antes de escolher o arquivo | `0030c28` | `app/src/leads/xlsx.test.ts`, `app/src/rotas/leads-importar.test.tsx`, "D-08" |
| D-09 | P2 | corrigido: fuso como seletor dos cinco fusos do Brasil pelo nome, mais "Outro fuso"; listas e fichas mostram o nome | `abcaa43` | `app/src/rotas/especialistas.test.tsx` e `leads-novo.test.tsx`, "D-09" |
| D-16 | P2 | corrigido em parte: o cadastro sugere as áreas já cadastradas e o roteamento por área as lista. Falta levar a lista à descrição do campo `area` da ferramenta, na publicação | `06b528e` | `app/src/rotas/especialistas.test.tsx` e `config-conta-roteamento.test.tsx`, "D-16" |
| D-12 | P2 | corrigido: sem a variável, o dono zera enquanto a instalação tem uma conta só; com a variável definida, ela manda | `d9a2718` | `supabase/functions/environment-reset/reset.test.ts`, `app/src/rotas/config-conta.test.tsx`, "D-12" |
| D-15 | P2 | corrigido: a fila e o playbook deixam de dizer "indisponível nesta fase" | `3150592` | `app/src/rotas/fila.test.tsx` |
| D-10 | P3 | corrigido: o negócio do tutorial nasce com a empresa gravada, senão com o nome da conta | `25f226e` | `app/src/rotas/configuracao-inicial-inicio.test.tsx`, "D-10" |
| D-17 | P3 | corrigido: "em breve" e o nome da navegação saem do componente para a copy | `1c46d55` | `app/src/componentes/barra-lateral.test.tsx` |

**Como ler.** A seção 1 diz o que foi testado e o resultado. A seção 2 lista
os defeitos em ordem de prioridade, cada um com arquivo e linha, o que a
persona veria e a correção sugerida. A seção 3 lista o que foi corrigido
aqui, por commit. A seção 4 é a revisão de experiência pelo olhar de cada
persona. A seção 5 diz o que ficou de fora das jornadas.

**Prioridade.** P0 quebra a promessa principal para a persona no primeiro
dia. P1 trava ou confunde uma etapa que ela precisa fazer. P2 atrapalha ou
exige explicação de quem apresenta. P3 é acabamento.

---

## 1. As jornadas testadas

Cinco arquivos. Na conferência, 40 testes: 35 passavam provando
comportamento e 5 eram `test.fails` que provavam defeito (passam enquanto o
defeito existir e caem no dia da correção, que é o sinal para trocar por
`test`). Com as correções, os cinco viraram `test` e as jornadas têm hoje 39
casos, todos provando comportamento. Cada `test.fails`
tem um teste irmão que retrata o estado de hoje, para ele cair pelo motivo
certo e não por uma consulta quebrada.

| arquivo | onde roda | testes | resultado |
| --- | --- | --- | --- |
| `app/src/jornadas/dona-de-servicos.test.tsx` | `test:unit`, jsdom | 8 | 8 passam (5 só depois das correções da seção 3) |
| `app/src/jornadas/gerente-comercial.test.tsx` | `test:unit`, jsdom | 6 | 5 passam, 1 prova defeito (D-06) |
| `app/src/jornadas/operacao-de-volume.test.tsx` | `test:unit`, jsdom | 4 | 4 passam |
| `testes/jornadas/lead-do-formulario.test.ts` | `test:db`, PGlite | 18 | 14 passam, 4 provam defeito (D-01, D-02, D-03 duas vezes) |
| `testes/jornadas/whatsapp-em-modo-de-teste.test.ts` | `test:db`, Node | 4 | 4 passam |

Os dois `include` já pegavam as pastas novas: o do workspace `app`
(`src/**/*.test.{ts,tsx}`) e o da raiz (`testes/**/*.test.ts`). Nada foi
registrado a mais.

**`conta-da-jornada.ts`** (`app/src/testes/`) liga os dublês de sempre entre
si para o tutorial inteiro rodar numa montagem: o modelo passa a conectado
quando a volta do OAuth conclui; `credenciais` resolve com voz e telefonia
salvas; `agente` com a identidade gravada com empresa; `roteiro` com a
descoberta publicada; `numero` com a linha registrada. A publicação passa
por `atenderPublicacao`, a sugestão por `atenderSugestao` e a guarda por
`guardarDiscagem`, o mesmo código das bordas.

### Persona 1, Carla (dona de empresa de serviços)

| passo | o que se prova | resultado |
| --- | --- | --- |
| fundação | instalação virgem abre o modal, criar a conta leva ao tutorial | passa |
| tutorial inteiro | numa visita: boas-vindas, nome (Lia), plano, modelo (clique em Conectar sai para o OpenRouter, a volta com `code` conclui), chave da ElevenLabs e uma das seis vozes, as duas chaves da Twilio, WhatsApp pulado, negócio por escrito, sugestões com a pergunta respondida, resumo aplicado sem nada no ar, publicar pelo código de `agent-publish`, número cadastrado e registrado, celular cadastrado como número de teste, ligação pelo discador com estado ao vivo, ficha, ligação declarada, fecho | passa depois da correção do botão duplicado (seção 3) |
| fecho | com especialista e agenda pendentes, o fecho lista os dois e diz "A conversa não vira reunião marcada" | caía ("Não falta nada"); passa depois da correção |
| discador antes da ligação de teste | o aviso diz por que só liga para teste, sem "fase", "portão" nem "fatia" | caía; passa depois da correção de texto |
| política de discagem | as duas condições da discagem para lead real, sem "fase" nem "portão" | caía ("Liberação da fase"); passa depois da correção de texto |
| primeiro lead | cadastro manual com DDD 31 (MG), a lista leva à ficha, "Ligar" da ficha dispara descoberta com o lead | caía (a ficha não tinha discador); passa depois da correção |
| janela | às 21h de sexta a ligação da ficha é recusada com a janela e a próxima abertura, e nada é discado | passa |
| diagnóstico | a ficha da ligação mostra a classificação; analisar, aplicar (rascunho, nada no ar) e publicar pelo playbook | passa |

### Persona 2, Marcos (gerente comercial, inbound de formulário)

| passo | o que se prova | resultado |
| --- | --- | --- |
| fundação (banco) | `fundar_instalacao` cria a conta com o Marcos como dono, fuso de São Paulo | passa |
| chave do formulário (banco) | `girar_chave_de_entrada` grava só o hash | passa |
| entrada pelo endereço público | `receberLead` sobre o banco: corpo de landing page (nomes em inglês, campos a mais) vira lead com SC e fuso pelo DDD 48, origem `intake` | passa |
| duplicado e chave errada | o segundo envio não duplica e preenche a empresa que faltava; chave errada é 401 e não grava | passa |
| fala-rápido | a conta nasce com `speed_to_lead_enabled` falso e o lead não vira candidato; ligado à mão no banco, vira | prova D-03 |
| guarda antes da ligação de teste | lead real recusado (`real_dialing_gate`), celular de teste liberado | passa |
| guarda depois | lead real liberado às 14h, recusado às 22h (`outside_window`) e com o freio (`dialing_paused`) | passa |
| reunião | `agendar_reuniao` com a consultora de horário livre | passa |
| painel | `dashboard_summary` devolve "indisponivel_nesta_fase" para a reunião marcada | prova D-01 |
| fila | `pedido_humano` registrado pela borda, resolvido pelo Marcos com texto | passa |
| zerar | `zerar_ambiente` apaga conta, lead, reunião, fila e consultor; a instalação volta a pedir fundação | passa |
| pela tela | nenhuma tela gira a chave do formulário nem liga o fala-rápido | prova D-02 e D-03 |
| consultores (tela) | cadastrar dois, cada um com área, no fuso da conta | passa |
| fila (tela) | o pedido de gente chega pelo tempo real, com o trecho, o `tel:` e a resolução escrita | passa |
| contagem da fila | a barra lateral não mostra quantos itens esperam | prova D-06 |
| reunião (tela) | resumo de passagem em blocos, sem JSON; desfecho "realizada" marcado e apurado | passa |

### Persona 3, Juliana (operação de alto volume)

| passo | o que se prova | resultado |
| --- | --- | --- |
| importação | mil linhas: 920, 30 e 50 na prévia, nada gravado antes de confirmar, relatório com 920 criados e 30 erros; a tela avisa que `.xlsx` não entra | passa |
| freio | puxado com motivo em /leads, aviso na casca, o discador do painel recusa sem pedir a ligação, retomar pede outro motivo | passa |
| o que não existe | Campanhas e Cadências na barra lateral sem link, como "em breve" | passa |
| zerar | a dona zera com a palavra exata e volta à entrada | passa |
| WhatsApp em modo de teste | o celular de teste conversa e a segunda rodada leva o histórico; aluno antigo fora da lista não vira lead nem recebe nada; "parar" bloqueia, encerra e confirma uma vez; o modo "todos" é o que faz o número de fora virar lead | passa |

---

## 2. Defeitos, em ordem de prioridade

### P0

**D-01. O painel não conta reunião nenhuma.**
`supabase/migrations/20260930200000_resumo_do_painel.sql:258` a `269`:
`dashboard_summary` devolve `{"codigo": "indisponivel_nesta_fase", "fatia":
"F5"}` para reuniões marcadas, confirmadas, faltas, comparecimento, custo por
reunião realizada e próximas reuniões, e a agenda da F5 já grava reuniões
(`agendar_reuniao`, migração `20260930120000`, anterior ao resumo).
*O que a persona vê:* a assistente marca a reunião, a reunião aparece em
Reuniões, e o painel diz "Reuniões marcadas: Ainda não apurável. Entra com o
agendamento de reuniões pela assistente." O número que justifica o produto
(reuniões e custo por reunião, especificação seção 1) não aparece para
nenhuma das três.
*Correção sugerida:* ligar no RPC as métricas que dependem só de `meetings`
(marcadas, confirmadas, faltas, comparecimento, próximas) lendo
`reunioes_reais` no intervalo, e deixar indisponível só o que depende da
apuração da F6 (realizadas e custo por realizada). O painel já desenha o
número quando ele chega no lugar do objeto (`lerCampo`, `app/src/painel/cartoes.ts`).
*Prova:* `testes/jornadas/lead-do-formulario.test.ts`, "D-01".

**D-02. O endereço público do formulário não tem tela.**
O RPC `girar_chave_de_entrada` existe
(`supabase/migrations/20260921130000_chave_de_entrada.sql:65`) e a borda
`lead-intake` funciona, mas nenhum arquivo de `app/src` o chama, e o item
Webhooks da barra lateral está "em breve" (`app/src/copy/navegacao.ts:63`). A
especificação (5.12, Webhooks, "entrada: chave para receber leads") e a
primeira frase do produto contam com isso.
*O que a persona vê:* o Marcos pergunta "onde pego o endereço para colar no
formulário?" e não há resposta dentro do produto. Hoje só alguém com acesso
ao banco gira a chave.
*Correção sugerida:* um cartão "Formulário do site" em Integrações (ou
Webhooks de entrada) com o endereço (`<projeto>/functions/v1/lead-intake`),
o botão "Gerar chave" que chama `gerarChaveDeEntrada` e
`girar_chave_de_entrada`, mostra a chave uma vez com botão de copiar, e um
exemplo de corpo (`nome`, `telefone`, `email`). A disciplina já está escrita
no cabeçalho da migração: a chave nasce no navegador e só o hash vai ao banco.
*Prova:* `testes/jornadas/lead-do-formulario.test.ts`, "D-02".

**D-03. A ligação em minutos nasce desligada e não tem tela.**
`supabase/migrations/20260921230000_politica_da_conta.sql:72`:
`speed_to_lead_enabled boolean not null default false`, e nenhum arquivo de
`app/src` o lê ou grava. `candidatos_do_fala_rapido` só devolve lead de conta
com a coluna verdadeira.
*O que a persona vê:* o primeiro destaque das boas-vindas é "Liga em minutos
depois que o lead chega". Mesmo com D-02 resolvido, o lead do formulário
entra e ninguém liga até alguém mexer no banco.
*Correção sugerida:* um interruptor em Discagem (ou em Conta, junto dos
limiares) para `speed_to_lead_enabled`, com `speed_to_lead_minutes` ao lado,
gravado pelo mesmo RPC com motivo da política de discagem; e no fecho do
tutorial um item "Ligar para o lead do formulário em minutos" quando D-02
estiver pronto.
*Prova:* `testes/jornadas/lead-do-formulario.test.ts`, "D-03" (banco e tela).

### P1

**D-06. A fila "Precisam de você" não tem contagem na navegação.**
`app/src/componentes/barra-lateral.tsx:31`: a barra desenha só o rótulo. A
especificação (5.2) pede "contagem visível na navegação e ordenação por
urgência": é a segunda tela mais visitada.
*O que a persona vê:* o Marcos trabalha no funil e não sabe que alguém pediu
para falar com gente até abrir a fila.
*Correção sugerida:* a casca lê a contagem de itens abertos pela mesma
assinatura da fila (`servico.assinar`) e a barra recebe por prop, como o
checklist; na barra recolhida, um ponto com o número no `aria-label`.
*Prova:* `app/src/jornadas/gerente-comercial.test.tsx`, "D-06".

**D-13. Conectar o calendário do consultor exige o Google Cloud do cliente.**
`app/src/copy/instrucoes-das-chaves.ts:59` a `71`: o cartão do calendário pede
`client_id`, `client_secret` e `refresh_token` de um aplicativo OAuth do
próprio cliente, e o passo "Agenda do especialista" espera a verificação do
Google, que leva semanas (`docs/esperas-externas.md`). Cada instalação é um
projeto próprio, então a espera é de cada cliente.
*O que a persona vê:* o Marcos não cria aplicativo no Google Cloud, e o
consultor dele tem visita técnica no calendário. Sem calendário, a assistente
oferece horário pela disponibilidade semanal cadastrada e pode marcar em
cima de compromisso.
*Correção sugerida:* no curto prazo, a tela do especialista dizer isso com
todas as letras ("sem calendário, bloqueie à mão os horários ocupados") e o
roteiro de apresentação tratar o calendário como fase dois. No médio prazo,
um aplicativo OAuth da StartSe verificado uma vez, usado por todas as
instalações, ou a leitura por iCal de uma agenda compartilhada (frente de
canais e iCal em andamento).

**D-07. A recusa da guarda ainda fala de fase.**
`supabase/functions/_shared/discagem/guarda.ts:315`: "Nesta fase a assistente
só liga para os números de teste que a conta cadastrou." É a frase que o
discador mostra quando o lead real é recusado antes da ligação de teste.
*O que a persona vê:* depois de ler, no aviso corrigido, que falta a ligação
de teste, a recusa diz "nesta fase", como se o produto estivesse pela metade.
*Correção sugerida:* "Até a primeira ligação de teste terminar com a conversa
transcrita, a assistente só liga para os números de teste da conta." A frase
tem teste literal em `app/src/rotas/painel.test.tsx` e em
`supabase/functions/_shared/discagem/guarda.test.ts`; não foi trocada aqui
por ser texto do servidor com prova dos dois lados.

### P2

**D-11. A ligação de teste fora do horário é recusada e manda para o passo do número.**
`app/src/configuracao-inicial/primeira-ligacao.ts:28`: `fora_da_janela` resolve
em `numero`, e a guarda aplica a janela também ao número de teste.
*O que a persona vê:* a Carla configura às 20h30, chega à primeira ligação,
e a recusa diz para resolver no passo Número, onde ela não encontra nada de
errado (a política de discagem está lá embaixo, embutida).
*Correção sugerida:* o passo da ligação dizer antes do botão, quando o
relógio está fora da janela da conta, que a ligação de teste também respeita
a janela e quando ela abre; ou a guarda aceitar `min_interval` e janela no
bypass para número de teste com ator humano. A primeira é só tela.

**D-14. Não há custo antes de ligar.**
Nenhuma tela estima o custo de uma ligação ou de um lote; o painel mostra o
custo do período depois, somado por moeda (dólar da ElevenLabs e real da
Twilio lado a lado). A Juliana pergunta "quanto custa 5 mil ligações" e a
Carla "quanto dá por mês".
*Correção sugerida:* a prévia da campanha (F7) já prevê estimativa. Até lá,
a ficha da ligação de teste pode mostrar o custo por minuto medido
(`custoTotalCentavos` sobre `duracaoSeg`) como referência, e o roteiro de
apresentação leva uma conta de bolso (seção 7 do roteiro).

**D-08. Planilha do Excel não entra.**
`app/src/copy/leads-importar.ts:60`: só CSV e TSV, e a tela manda salvar como
CSV. O teto é 5.000 linhas por importação (`app/src/leads/planilha.ts:37`).
*O que a persona vê:* a Juliana tem a base em `.xlsx` com 20 mil linhas: são
quatro arquivos e uma conversão antes de começar.
*Correção sugerida:* aceitar `.xlsx` com uma biblioteca de leitura no
navegador, ou pelo menos dizer o teto antes de ela escolher o arquivo.

**D-09. Fuso horário como texto técnico.**
`app/src/copy/especialistas.ts:171` (`exemploDoFuso: 'America/Sao_Paulo'`) e o
campo de fuso do cadastro de lead (`app/src/copy/leads.ts:364`) pedem o nome
IANA num campo de texto.
*O que a persona vê:* "Fuso horário: America/Sao_Paulo", um campo que ela não
sabe preencher.
*Correção sugerida:* seletor com os fusos brasileiros por nome de cidade
("Horário de Brasília", "Manaus", "Cuiabá", "Rio Branco", "Fernando de
Noronha"), gravando o IANA.

**D-16. A área do roteamento é texto livre.**
Em `area`, a assistente passa a área na chamada de `tool-availability`
(`supabase/functions/tool-availability/disponibilidade.ts:83`) e ela precisa
casar com o texto cadastrado no especialista. Nada na tela liga a área do
cadastro ao roteiro.
*O que a persona vê:* o Marcos cadastra "Comercial e agro" e o roteiro diz
"agronegócio"; a oferta sai sem consultor.
*Correção sugerida:* a tela de roteamento listar as áreas cadastradas e o
compilador do agente incluí-las na camada 1 como a lista fechada que a
ferramenta aceita.

**D-12. Zerar o ambiente depende de variável que a instalação não grava.**
`supabase/functions/environment-reset/index.ts:30`: sem
`SARAH_PERMITE_ZERAR_AMBIENTE=sim` nos segredos das funções, o botão recusa, e
o instalador não tem o escopo Secrets (`docs/instalacao.md` seção 3).
*O que a persona vê:* no fim do piloto, "zerar" recusa com a frase da borda.
*Correção sugerida:* o roteiro de instalação dizer onde ligar a variável
(Supabase, Edge Functions, Secrets) quando o cliente quer um ambiente de
piloto; a recusa da tela apontar esse lugar.

**D-15. "Indisponível nesta fase" em telas do cliente.**
`app/src/copy/fila.ts:111` (`(indisponível nesta fase)` no filtro da fila) e as
frases de fatia do painel (`app/src/copy/painel.ts:141`). Somem com D-01 no
painel; na fila, o tipo sem produtor pode simplesmente não aparecer no filtro.

### P3

**D-10. O nome da empresa é pedido duas vezes.**
A fundação pede "Nome da empresa"; o negócio do tutorial pede de novo, vazio
(`app/src/configuracao-inicial/assistente-de-inicio.tsx:71`, `CONTEXTO_VAZIO`).
*Correção sugerida:* o negócio nascer com o nome da conta.

**D-17. "em breve" fora de `copy/`.**
`app/src/componentes/barra-lateral.tsx:10` escreve o literal no componente,
contra a convenção dos literais de interface.

---

## 3. Correções pequenas feitas aqui

Cada uma em commit próprio, com a jornada que a cobra.

| commit | o que muda | quem cobra |
| --- | --- | --- |
| `9b97e57` | O botão da lista de números de teste passa a "Cadastrar número de teste" (`app/src/copy/discagem.ts`). No passo do número, a tela de números e a lista de teste ficavam lado a lado com dois "Cadastrar número". | o tutorial inteiro, em `dona-de-servicos.test.tsx` |
| `239d3b8` | O fecho do tutorial lista tudo o que não trava a primeira ligação e ainda falta (especialista, agenda, leads, equipe), cada um com o que a falta custa, em vez de só o que não trava nada e "Não falta nada" (`app/src/configuracao-inicial/etapas-finais.tsx:281`). Entra junto `conta-da-jornada.ts`. | "o fecho não diz que está completa..." |
| `71d0752` | A ficha do lead monta o discador com o lead como destino (`app/src/rotas/lead.tsx:183`). A especificação (5.3) e o comentário do próprio `Discador` diziam "no painel e na ficha"; só o painel o montava. | "cadastra o lead da indicação e liga da ficha dele" |
| `2d59f65` | O aviso do discador antes da ligação de teste e o campo de destino da transferência deixam de falar de "fase", "portão" e "fatia" (`app/src/copy/chamadas.ts`, `app/src/copy/sarah.ts`, `app/src/copy/configuracao-inicial.ts`). A transferência já existe; o texto dizia que chegaria "na fatia seguinte". | "antes da ligação de teste, o painel diz por que só liga para teste..." |
| `1b6f182` | O apoio da tela do tutorial deixa de dizer "Oito passos" atrás de um cartão que conta catorze (`app/src/copy/configuracao-inicial.ts:252`). | o tutorial inteiro |
| `8223166` | Em Discagem, a condição "Liberação da fase" passa a "Liberação da instalação", sem a promessa de uma atualização que já chegou, e a espera e as falhas deixam de falar em "portão" (`app/src/copy/discagem.ts:40`). | "a política de discagem mostra as duas condições..." |

---

## 4. Revisão de experiência

O que confunde, o que está em jargão, onde a pessoa trava e o que falta para
ela confiar, em ordem de peso para cada persona. Os itens com número de
defeito estão detalhados na seção 2.

### Carla (dona de empresa de serviços)

1. **O que ela confia: ouvir antes de ligar para alguém.** Está bem servido.
   As seis vozes de exemplo tocam no tutorial, a tela Voz ouve a primeira
   fala com a voz e os ajustes, o Ensaio conversa por texto e por voz com
   perfis de lead difícil, e a primeira ligação é para o celular dela. É o
   ponto mais forte da demonstração.
2. **Travas antes da primeira ligação que ela não controla.** Três contas em
   serviços que ela não conhece (OpenRouter, ElevenLabs, Twilio) e um número
   que, se for novo, espera o pacote regulatório da operadora por dias. O
   tutorial diz "uns quinze minutos": é verdade com as contas criadas e o
   número já comprado, e só assim. Quem apresenta precisa chegar com isso
   resolvido (roteiro, seção 3).
3. **Custo.** Ela não vê quanto custa uma ligação antes de ligar, e o painel
   soma dólar e real separados (D-14). A ficha da ligação de teste mostra o
   custo dela: é o número a apontar na demonstração.
4. **Reunião sem vendedor.** Corrigido o fecho (seção 3), o tutorial ainda
   termina sem pedir o especialista: ele é passo "depois da primeira
   ligação". Para ela, o Rafael é a razão de comprar; o especialista deveria
   entrar no tutorial logo depois do número.
5. **Painel sem o número dela** (D-01). Depois da primeira semana, "reuniões
   marcadas: ainda não apurável" é a pior frase possível.
6. **Jargão que sobrou.** "Playbooks" na barra lateral (a tela chama de
   roteiros), "propósito" (descoberta, lembrete, reativação, retorno), o fuso
   IANA (D-09), "E.164" só em comentário. "Descoberta" é palavra de vendas e
   ela entende com um exemplo.
7. **Fora do horário.** Se ela configurar à noite, a ligação de teste é
   recusada pela janela e o tutorial manda ao passo do número (D-11).

### Marcos (gerente comercial)

1. **O formulário não se conecta sozinho** (D-02 e D-03). É a razão de ele
   comprar, e hoje depende de alguém com acesso ao banco para gerar a chave e
   ligar o fala-rápido.
2. **Agenda real do consultor** (D-13). Sem calendário, a disponibilidade é a
   semanal cadastrada; o consultor de campo precisa bloquear à mão.
3. **Roteamento por área frágil** (D-16).
4. **A fila é boa e precisa de contagem** (D-06). O item traz o trecho, o
   áudio e o `tel:` para retornar; resolver é um clique.
5. **Qualidade das ligações.** A ficha da chamada mostra transcrição com o
   áudio, as ferramentas em linguagem humana, a avaliação automática e o
   diagnóstico com proposta de correção do roteiro. É o que responde "como
   sei que ela qualifica direito": levar para a demonstração uma ligação que
   deu errado.
6. **CRM.** Não há integração com CRM nesta versão, nem webhook de saída
   (F7 em andamento). Hoje a exportação de leads é o caminho.
7. **Transferência para gente.** Com "Para quem transferir" preenchido na
   Identidade, a ligação é passada; sem ele, vira item na fila. A tela agora
   diz isso (seção 3).

### Juliana (operação de volume)

1. **Campanha e cadência não existem** nesta versão. Sem elas, volume é lead
   a lead pelo discador, ou o fala-rápido para quem chega pelo formulário.
   A barra lateral diz "em breve"; quem apresenta não promete data.
2. **O freio é o que ela mais quer ver**, e está bem feito: em toda tela, com
   motivo, quem puxou e quando, retomada separada e só de quem administra.
3. **Importação**: prévia honesta, nada grava antes de confirmar, relatório
   linha a linha. Trava no `.xlsx` e no teto de 5.000 linhas (D-08).
4. **Política de discagem**: janela por dia no fuso do lead, intervalo,
   tetos por número e por conta, teto de gasto diário. É onde ela passa mais
   tempo; os limites explicam a consequência de cada um.
5. **WhatsApp em modo de teste** resolve o medo do número comercial. O canal
   é a Z-API, que não é a API oficial da Meta: há risco de o número ser
   restrito pelo WhatsApp em volume, e ela precisa saber disso antes.
6. **Saúde da linha** (taxa de atendimento por número, spam) aparece na tela
   de números quando há histórico; o rodízio automático é da F7.
7. **Zerar o piloto** depende de uma variável nos segredos das funções
   (D-12).

---

## 5. O que ficou de fora das jornadas

- **Ligação de verdade.** Nenhuma jornada liga: ElevenLabs e Twilio estão
  dublados pelas portas das bordas, e a ligação real é do degrau 3
  (`scripts/sonda-de-publicacao.ts`, no CI com chave). O que a ligação de
  teste prova no tutorial é o caminho da tela até `call-place` e a leitura de
  `call_live`.
- **Entrevista por voz no tutorial.** O caminho testado é o "Prefiro
  escrever"; a entrevista precisa de microfone e já tem teste próprio
  (`entrevista-com-a-sarah.test.tsx`).
- **Ferramentas dentro da ligação** (consultar agenda, agendar, qualificar,
  transferir, não perturbe). Têm testes próprios nas bordas
  (`supabase/functions/tool-*`); a jornada do banco usa `agendar_reuniao` e
  `registrar_item_de_fila`, que são o que elas gravam.
- **Lembrete e resgate de reunião, cadência, campanha.** Frentes F6 e F7 em
  andamento.
- **Mídia no WhatsApp, e-mail e iCal.** Frentes em andamento.
- **Instalação pelo painel.** O contrato do instalador e o pacote têm testes
  estáticos (`testes/estatica/pacote-de-instalacao.test.ts`); o painel em si
  (`StartSe/ai-hub`) não roda daqui.
