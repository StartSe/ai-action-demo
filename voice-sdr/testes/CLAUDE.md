# testes/

Testes de banco e de validação estática. Ambiente Node, configurados por
`vitest.config.ts` e `tsconfig.ferramentas.json`, ambos na raiz. Os testes de
componente da interface ficam em `app/src/`, com ambiente jsdom e configuração
própria; os das funções de servidor, ao lado do código em
`supabase/functions/`, pelo projeto `vitest.funcoes.config.ts`. Três projetos,
três configurações — não misture.

O corte entre esta pasta e `supabase/functions/` é o banco: o que precisa de
Postgres para ser provado vem para cá; o que se prova com a camada de dados
dublada fica junto da função. `invitations` é o exemplo dos dois lados — a
regra de quando um convite vale está em `testes/banco/convites.test.ts`, e a
tradução dela em resposta HTTP está em
`supabase/functions/invite-accept/aceite.test.ts`.

Rodar: `npm run test:db` da raiz. Arquivo precisa terminar em `.test.ts` e estar
sob `testes/`, senão o `include` não pega.

## Banco em processo

```ts
import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
beforeAll(async () => { banco = await criarBancoDeTeste() }, 60_000)
afterAll(async () => { await banco?.encerrar() })
```

Cada chamada devolve um banco novo, isolado, com todas as migrações aplicadas.

- **Import com extensão `.ts`.** O CLI de `check:sql` roda por type stripping do
  Node, que exige o especificador completo. Vale para todo import entre módulos
  de `scripts/` e `testes/`.
- **RLS não vale para `postgres`.** O superusuário passa por cima de toda
  política. Teste de isolamento só prova algo depois de `comoUsuario(id)` ou
  `comoAnonimo()`; `comoServico()` volta ao superusuário para preparar dado.
- **Prepare dado como serviço, verifique como usuário.** Inserir a fixture já
  sob RLS costuma falhar por falta de política de `insert`, e o teste passa a
  medir a coisa errada.
- **`criarUsuario(email)`** insere em `auth.users` e o gatilho cria o `profile`
  na mesma transação. É o caminho para ter um id que `auth.uid()` reconhece.
- **Preâmbulo é contrato.** O auxiliar recria à mão o que o Supabase entrega
  pronto: papéis, schemas `auth` e `extensions`, recorte de `auth.users`,
  `auth.uid()`, `auth.role()` e os privilégios padrão de `public`. Migração que
  passar a depender de outra coisa do Supabase precisa de linha nova ali.
- **Extensão nova** tem que ser registrada no construtor do PGlite
  (`extensions: { ... }`) além do `create extension` na migração. Os pacotes
  vêm de `@electric-sql/pglite/contrib/<nome>`. Sem par, a migração quebra
  só no teste, e a mensagem não é óbvia.
- **Auxiliar de semeadura recebe os extras por sobreposição, não por soma.**
  `{ ...minimo, ...extras }` e depois monta as colunas do resultado: concatenar
  extras ao mínimo faz a coluna aparecer duas vezes, e o erro que volta é
  "specified more than once" em vez da restrição que o teste queria ver cair.
  Ver `semearEspecialista` em `testes/banco/especialistas.test.ts`.
- **Cenário que depende do Vault se prepara antes de trocar de papel.**
  `vault.create_secret(...)` dentro de um insert feito por `authenticated`
  esbarra em "permission denied for schema vault" **antes** de a política de RLS
  ser avaliada, e o teste passa a medir o grant do schema em vez da política.
  Auxiliar de semeadura que cria segredo só o cria quando o chamador não trouxe
  o dele — ver `conectarCalendario` em
  `testes/banco/calendario-do-especialista.test.ts`.
- **Tabela com único por conta se limpa no `beforeEach`.** Enquanto o arquivo
  inteiro compartilha a mesma conta, o agente que um teste criou faz o insert
  do teste seguinte cair — e cair pela restrição errada, com a mensagem de
  "já existe uma" no caso que queria medir outra coisa. `delete from` a tabela
  no `beforeEach`, junto com o `comoServico()`. Ver `testes/banco/agente.test.ts`.
- **O pool do Vitest tem teto, e o teto é de memória.** Cada arquivo de
  `testes/banco/` sobe um Postgres inteiro em memória, e o padrão do Vitest é um
  processo por núcleo. Numa máquina de 8 GB isso põe mais bancos de pé do que
  cabem, e o sintoma não parece memória: é `beforeAll` estourando os 60 segundos
  em arquivos sorteados a cada corrida, enquanto cada um deles passa em um
  segundo quando rodado sozinho. `maxWorkers: 4` em `vitest.config.ts` é o que
  segura isso; arquivo de banco novo não muda o teto, só o tempo total.
- **`comoServico()` é `postgres`, não `service_role`.** O superusuário passa por
  cima de grant e de RLS, então um teste de grant contra ele passaria mesmo com
  o grant ausente. Para medir o alcance da borda de verdade, `comoServico()` e
  depois `set role service_role` — é o que `cofre-de-credenciais.test.ts` faz em
  `comoBorda()`.

- **Tabela de casos compartilhada com a borda se importa por caminho
  relativo**, com extensão `.ts`: `janela-de-discagem.test.ts` lê
  `../../supabase/functions/_shared/discagem/casos-de-janela.ts`, o mesmo módulo
  que o teste de `test:unit` lê. É assim que uma regra que vive nos dois lados
  (aqui em SQL, lá em TypeScript) fica com uma verdade só — e o módulo de casos
  não importa `vitest`, senão as chamadas de `test()` dele se registrariam na
  suíte de quem o importa.

## Políticas de RLS

- **Recusa tem duas formas.** `insert` e `update` que violam o `with check`
  levantam erro (`new row violates row-level security policy`); `update` e
  `delete` cujo `using` não casa simplesmente não afetam linha. Teste de
  leitura e de `using` verifica `returning` vazio; teste de `with check` usa
  `rejects.toThrow(/row-level security/i)`.
- **`update ... returning` é a medida honesta** do que a política deixou passar.
  `affectedRows` mistura "linha não existe" com "política negou".
- **Duas contas em cada teste de leitura.** Ver a própria conta não prova nada
  sem uma conta vizinha para não aparecer no mesmo `select`.
- **Barreira defendida em profundidade não se mede pelo caminho comum.**
  `lead_merge` confere `has_role` na porta, mas `registrar_evento_de_lead`, que
  ele chama depois, também recusa quem não é membro — então apagar a conferência
  da porta não derruba o teste do operador da conta vizinha. Quem mede a porta
  sozinha é o chamador que as barreiras de trás deixam passar: aqui, a borda sem
  sessão (`service_role`), que `registrar_evento_de_lead` aceita de propósito.
  Ao escrever o teste de uma conferência, pergunte primeiro quem mais a faz.
- **`pg_policies` devolve a expressão reescrita, não o texto da migração.**
  `(select public.has_role(account_id, 'admin'))` volta como
  `( SELECT has_role(specialists.account_id, 'admin'::text) ...`: a
  coluna vem qualificada pela tabela e o literal com o tipo. Regex sobre `qual`
  e `with_check` aceita o prefixo (`(\w+\.)?account_id`), senão reprova a
  política certa. Ver `testes/banco/classes-da-agenda.test.ts`.
- **Medir os dois lados.** "Zero linha da conta vizinha" continua verdadeiro
  quando a política some — sem política, ninguém vê nada. Todo teste de
  isolamento afirma também que a conta enxerga as próprias linhas, senão a
  remoção de uma política passa despercebida.

## Travessia entre contas

`testes/banco/travessia-entre-contas.test.ts` é a varredura geral do isolamento,
e `npm run test:rls` é o atalho para rodar só ela. Duas coisas a saber antes de
mexer no esquema:

- **As tabelas vêm de `pg_class`, não de uma lista.** Tabela nova entra na
  varredura sozinha. Se ela não tiver `account_id`, o teste reprova até alguém
  declarar em `LIGACOES_DECLARADAS` como encontrar as linhas dela — é o mesmo
  contrato das isenções de `scripts/analise-de-migracoes.ts`, do outro lado.
- **A varredura também exige que cada conta veja as próprias linhas**, então o
  cenário precisa criar pelo menos uma linha por tabela, para cada conta.
  Tabela nova sem linha no cenário reprova, e a mensagem diz o que fazer.
- **Tabela sem leitura de cliente nenhuma** — RLS ligada e zero política, como
  `account_secrets` — declara isso em `SEM_LEITURA_DE_CLIENTE`, com a razão e o
  caminho por onde o dado sai. Ela sai do par "vê a própria, não vê a vizinha" e
  entra em dois testes próprios: não devolve linha nem para a própria conta, e o
  catálogo confirma que continua sem política. Declarar não é calar o teste:
  remover a declaração faz a varredura reprovar de novo, e criar a política faz
  o teste do catálogo reprovar.

## Auditoria

`testes/banco/registro-de-auditoria.test.ts` tem uma varredura estrutural que
alcança tabela de fase futura: **toda tabela de `public` com coluna
`updated_at` precisa de gatilho `after update or delete` chamando
`registrar_auditoria`**, ou de razão escrita em `SEM_AUDITORIA`. Tabela que
alguém edita e a trilha não registra reprova ali.

- **Não semeie `audit_log` por `insert`.** O cliente não escreve nela e o teste
  não deveria ser a exceção: a linha nasce mudando uma configuração da conta.
  É o que o cenário de `travessia-entre-contas.test.ts` faz.
- **O bitmap de `pg_trigger.tgtype`**: 1 = por linha, 2 = before (zero
  significa after), 4 = insert, 8 = delete, 16 = update. `after` se verifica por
  `(tgtype & 2) = 0`, não por um bit próprio.

## Índice que só uma contagem interna consome

Índice que nenhuma tela usa — os três de `call_attempts`, que só `guard_dial`
lê — **não quebra nada quando some**: a consulta continua respondendo, só que
varrendo a tabela com o advisory lock na mão. O único jeito de a falta
aparecer é um teste de catálogo, e ele tem duas metades: cada índice com as
colunas na ordem declarada, e o **conjunto** de índices da tabela, para que
índice a mais também reprove.

- **A ordem das colunas se lê do catálogo, não do texto de `indexdef`.**
  `unnest(string_to_array(i.indkey::text, ' ')::smallint[]) with ordinality`
  junto a `pg_attribute` devolve nome por posição; casar a string do `indexdef`
  com regex passa a aceitar qualquer ordem no dia em que alguém reformatar o
  DDL. `indkey` é `int2vector` e não aceita `unnest` direto — daí o
  `string_to_array` sobre o texto.
- **Sabotar `create index` sem tirar o `comment on index` do lado derruba a
  migração inteira**, e aí *todos* os testes do arquivo caem por erro de
  aplicação. Isso não prova nada sobre a asserção; tire os dois e veja cair só
  o que deveria.

## "Este update não emite evento" se prova pelo `xmin`

Tabela fina cujo propósito é o que **não** trafega (`call_live`, de R-08) tem
duas asserções, e as duas são a mesma regra vista de dois lados:

- **O conjunto exato de colunas, lido de `pg_attribute`**, e não só a ausência
  de `transcript`: acrescentar coluna ali é decisão sobre o que vai para todo
  navegador assinante, e `expect(colunas).toEqual([...])` é o que faz a decisão
  passar por alguém.
- **`xmin::text` antes e depois do update que não deveria mexer na linha.**
  Comparar só os valores passa verde com um gatilho `update` seco, porque o
  `on conflict do update` reescreve a linha com os mesmos valores — e é a
  reescrita, não a mudança de valor, que a replicação lógica emite. O `xmin` é
  a versão da linha, e é ele que muda. Feche o teste confirmando que a coluna
  grande **chegou mesmo** a ser gravada, senão um update que falhou em silêncio
  passa por prova.

## Asserção escrita contra estado provisório

Teste que afirma a ausência de algo que vai chegar — "`call_id` ainda não tem
chave estrangeira, e a razão é a ordem das migrações" — **muda de lado no dia em
que a fatia chega**, e quem cria a tabela é que o vira. Não é regressão: é a
asserção cumprindo o papel de avisar que a ordem mudou. Duas formas de escrever
a ausência, e a segunda é a que sobrevive:

- Contar restrições (`expect(total).toBe(2)`) obriga a reescrever o teste por um
  número.
- Comparar o **conjunto** de colunas com chave estrangeira diz o que se espera,
  e a mensagem de falha já mostra qual chave entrou ou sumiu.

Quando a ausência for de tabela, e não de restrição, pergunte ao catálogo se ela
existe e compare com isso, em vez de fixar `disponivel: false`.

## Banco real, no CI

`abrirBancoParaRls()` (`testes/auxiliares/banco-para-rls.ts`) devolve PGlite por
padrão e, com `SUPABASE_DB_URL` definida, o Postgres apontado por ela, pelo
adaptador `postgres-real.ts` sobre `pg`. O import é dinâmico: no laço local o
cliente `pg` nunca é carregado e nenhum teste passa perto de porta de rede.

- **Nunca defina `SUPABASE_DB_URL` localmente.** Esse caminho pressupõe
  `supabase db reset`, que é do CI.
- **Teste que mexe no esquema** — derrubar política para provar que a asserção
  tem dente — fica fora desse modo por `test.runIf`, e confirma `banco.efemero`
  já dentro do teste. Num banco compartilhado, um rollback que falhasse deixaria
  a tabela aberta para a execução seguinte.
- **O que o teste cria, o teste apaga.** No PGlite não faz diferença; contra
  Postgres real é o que impede sujeira acumulada. Marque as linhas do cenário
  com um prefixo próprio da execução e apague por ele no `afterAll`.
- **Prova que precisa de duas conexões não roda no laço**: PGlite atende uma
  só, então `for update skip locked`, bloqueio e espera não têm como ser
  observados ali. O teste fica escrito, em arquivo próprio, sob
  `test.runIf(!EFEMERO)` — e `EFEMERO` sai da **variável de ambiente**, não de
  `banco.efemero`, porque o `runIf` é avaliado antes do `beforeAll`; a asserção
  de `banco.efemero` entra dentro do teste. O arquivo abre duas conexões
  (`abrirBancoParaRls()` duas vezes), e o `beforeAll` sai cedo quando a variável
  não está posta, para o laço local não montar cenário nenhum.
- **Arquivo que só roda no degrau 3 precisa de par de script**, senão ele é
  pulado no `check` e nunca executado em lugar nenhum: `test:<assunto>` aponta o
  arquivo e `test:<assunto>:postgres` põe `SUPABASE_DB_URL` na frente, e o
  `check:full` chama o segundo. `testes/estatica/scripts-de-validacao.test.ts` é
  quem cobra isso. Arquivo novo desse tipo vai para `testes/concorrencia/` e
  entra em `DIVIDAS` de `testes/estatica/dividas-de-concorrencia.test.ts`, que
  cobra o cabeçalho `DÍVIDA DE DEGRAU 3`, todo caso sob `runIf`, a razão do pulo
  impressa, a linha na tabela de dívidas de `docs/PRD-implementacao.md` e o
  alcance por `check:full`.
- **Bloqueio vira asserção com `set local lock_timeout`.** Sem o tempo limite, a
  espera é indefinida e o teste trava em vez de reprovar; com ele, a segunda
  transação levanta SQLSTATE `55P03` e a espera fica observável. É a metade que
  falta para "cada passagem tomou itens diferentes" provar exclusão em vez de
  sorte de ordenação.

## Sabotagem que não sabota

Teste de **ordem** entre passos de uma função só cai quando a sabotagem escreve
o passo como ele estaria escrito na posição nova. Mover o passo 0 de
`guard_dial` para depois do passo 4 sem acrescentar a guarda `v_motivo is null`
deixa a atribuição sobrescrever o motivo que os passos 2, 3 e 4 já tinham posto,
e o teste de precedência continua verde com a ordem trocada. Quando a sabotagem
passa, pergunte primeiro se ela sabotou mesmo — e só depois se o teste tem dente.

## SQLSTATE e restrição entre linhas

O erro que o PGlite levanta carrega os campos da resposta do Postgres, e `code`
é o SQLSTATE: `erro.code === '23P01'` é asserção mais firme que casar a
mensagem, que muda de versão para versão. Vale para qualquer restrição com
nome próprio — a mensagem entra junto, para dizer *qual* restrição caiu.

Tabela com restrição **entre linhas** (exclusão, unique parcial) precisa de
limpeza no `beforeEach`: o que um teste inseriu conflita com o que o próximo
quer inserir, e a falha aparece longe da causa.

Quando as linhas **nascem de gatilho** (os quatro playbooks da conta, a versão
draft de cada um), a limpeza não é apagar: é apagar e recriar o estado de
nascença, pelo catálogo — `insert into playbook_versions (account_id,
playbook_id) select account_id, id from playbooks`. Só apagar faz a numeração
seguinte começar em 1 e as asserções de número deixarem de bater.

`descartando()` faz `rollback` **antes** de trocar de papel. A manobra que
termina numa recusa deixa a transação abortada, e numa transação abortada o
`reset role` de `comoServico()` também falha: a conexão sai dali envenenada e
todos os testes seguintes caem com "current transaction is aborted".

Regra que um gatilho aplica sozinho (publicar arquiva a anterior) esconde a
restrição que está embaixo: as duas linhas nunca chegam juntas ao índice. Para
medir o índice, desligue o gatilho dentro de `descartando()` —
`alter table ... disable trigger <nome>` — e veja a recusa acontecer.

`with entrando as (insert ...) select count(*) from <a mesma tabela>` conta
errado: a parte de leitura enxerga a fotografia anterior à escrita do próprio
comando. Duas consultas.

## Parâmetro de sessão e migração de expansão

`set_config(<nome>, <valor>, true)` é **local à transação**, e cada consulta do
teste é uma transação sua: o parâmetro cai antes da próxima chamada. Teste que
precisa da trava aberta por mais de um comando usa `false` e a derruba num
`finally` — `comoServidor()`, em `operacao-da-conta.test.ts`, é o molde. Com
`true`, a trava parece inquebrável e o teste prova o contrário do que diz: o
update que deveria passar não passa, e ninguém repara porque a asserção era de
recusa.

Migração de **expansão** tem duas metades, e a segunda passa sabotada no
cenário comum. O default da coluna alcança quem nasce depois; o
`update ... where <condição>` da retroação alcança quem já existia — e as
contas do arquivo de teste nascem *depois* de todas as migrações, então apagar
a retroação não derruba teste nenhum. Para medi-la,
`criarBancoDeTeste({ pararAntesDe: '<arquivo da migração>' })` sobe um segundo
banco parado antes dela: crie ali a linha no estado antigo, chame
`retomarMigracoes()` e confira o estado novo. É banco à parte e se encerra no
`finally`.

## Validação estática

`scripts/analise-de-migracoes.ts` separa estrutura de conteúdo antes de aplicar
qualquer regra: comentário some, literal de texto e corpo de função saem da
estrutura e vão para uma lista. Regra sobre política (`is_member`) olha só a
estrutura; caça a segredo olha só o conteúdo. Regra nova entra nesse mesmo
recorte, e com caso de teste nos dois sentidos: o que deve acusar e o que não
deve.

`testes/estatica/analise-de-migracoes.test.ts` também roda as regras contra o
conjunto real de `supabase/migrations`. Migração nova que violar uma regra
reprova ali, não só no `check:sql`.

## Ponto de checagem de fase

Um arquivo por fase em `testes/estatica/`: `ponto-de-checagem-f0.test.ts`,
`ponto-de-checagem-f1.test.ts`, `ponto-de-checagem-f2.test.ts`,
`ponto-de-checagem-f3.test.ts`, `ponto-de-checagem-f4.test.ts`,
`ponto-de-checagem-f5.test.ts`. Cada um lê os
critérios de aceite da fase em `docs/PRD.md` e cobra, para cada um, uma prova
declarada: os arquivos de teste
que o fecham e a razão do que ficou para o degrau 3. O teste reprova nos dois
sentidos — critério novo no PRD sem prova, e prova declarada cujo critério saiu
do PRD — e confere que cada arquivo existe e cai em uma das três suítes de
`npm run check`.

O molde mora em `testes/auxiliares/ponto-de-checagem.ts`:
`lerCriteriosDaFase('F1')` extrai as linhas de `- [ ]` da seção `### F1.` do PRD
e `verificarPontoDeChecagem({ fase, arquivo, criterios, provas })` declara o
bloco comum. O arquivo da fase fica com o que é dela — a tabela `PROVAS` e os
testes de recorte próprio. Fase nova chama o mesmo molde; **não recopie a
leitura do PRD**, ou as fases passam a medir coisas diferentes.

Conferência de fase escrita em prosa envelhece calada. O que não roda em
processo não vira `faltaNoCi: null`: vira uma frase dizendo o que falta e por
quê, nomeando o arquivo (`supabase/functions/<funcao>/index.ts`) em vez de
aludir a "o adaptador". Frase com o caminho escrito é o que um teste consegue
cobrar.

Quem cobra o que um script de npm alcança — e o que ele **não** pode alcançar —
usa `comandosAlcancados(nome, pacotes)` de
`testes/auxiliares/scripts-do-pacote.ts`, que segue as delegações `npm run` para
dentro da raiz e do workspace `app`. Duas expansões copiadas se desencontram no
primeiro script novo.

Os relatores do vitest desta máquina passam pelo RTK, e uma rodada com falha
pode sair sem uma linha de resumo no terminal ("All parsing tiers failed").
Leia o resultado da sabotagem em `.vitest/json/output.json`, apagado antes da
rodada: terminal vazio não é verde.
Arquivo de `testes/concorrencia/` nunca entra em `arquivos`: sem
`SUPABASE_DB_URL` ele é todo pulado, e declarado como prova em processo faria
um critério parecer fechado por um arquivo que não rodou. Ele é citado pelo
caminho no `faltaNoCi`, junto do `test:<assunto>:postgres` que o executa — a F5
cobra isso num teste próprio.

Ponto de checagem se prova por sabotagem, nas duas direções: renomeie um
critério em `docs/PRD.md` e veja os dois testes de casamento caírem; troque um
caminho de `arquivos` por um inexistente e veja o `test.each` cair. Restaure
depois. Sem isso, a tabela é prosa com sintaxe de TypeScript.

## Pendência que depende de terceiro

Há trabalho que nenhuma suíte fecha: abrir protocolo em operadora, pedir
verificação OAuth ao Google, publicar registro de DNS. O que o laço consegue
provar é que o registro dessa pendência continua legível e continua sendo
conferido. `testes/estatica/esperas-externas.test.ts` lê
`docs/esperas-externas.md` e cobra, por espera, os campos que a descrevem, um
estado dentro do conjunto conhecido e a data da última conferência em ISO.

Espera externa nova entra nas duas pontas: seção no documento e linha em
`ESPERADAS` no teste. O documento guarda o estado; o teste guarda o documento.
