# supabase/

Migrações versionadas em `migrations/` e funções de servidor em `functions/`.
O esquema canônico está em `docs/PRD-implementacao.md` seção 3; a matriz de
isolamento, na seção 3.9.

## Migrações

Nome do arquivo é `AAAAMMDDHHMMSS_assunto.sql`, e a ordem alfabética é a ordem
de aplicação — tanto no Supabase quanto em `criarBancoDeTeste()`.

- **Toda tabela criada precisa de `enable row level security`** na mesma
  migração, e toda tabela de negócio precisa de `account_id`. `npm run check:sql`
  reprova o contrário. Isenção se declara em `scripts/analise-de-migracoes.ts`,
  com a razão. RLS sem política nega tudo, que é o estado seguro para chegar
  na migração de políticas.
- **`is_member` só na forma `(select is_member(account_id))`**, para o
  planejador avaliar uma vez por consulta em vez de uma por linha.
- **Função chamada por política precisa de `grant execute` para `anon`
  também**, não só `authenticated`. Sem isso, a sessão anônima esbarra em
  "permission denied for function" em vez de simplesmente não receber linha —
  um 500 onde deveria haver lista vazia. `auth.uid()` é null para `anon`, então
  a função já devolve falso sozinha.
- **`set search_path = ''` em toda função**, e por isso toda referência dentro
  dela vai qualificada: `public.role_rank(...)`, `auth.uid()`. `gen_random_uuid()`
  escapa por ser built-in do Postgres 13+, não por causa do pgcrypto.
- **Extensão nova tem par**: `create extension` aqui e registro em
  `extensions: { ... }` no construtor do PGlite, em
  `testes/auxiliares/banco-de-teste.ts`, com o pacote
  `@electric-sql/pglite/contrib/<nome>`. Sem o par, a migração quebra só no teste.
- **Função que a interface chama por RPC leva `revoke execute ... from public`
  antes do grant.** O padrão do Postgres é conceder execução a `public`, o que
  alcança qualquer papel presente ou futuro. Depois do revoke, o grant nomeia
  quem pode: `anon` quando quem chama ainda não entrou, `authenticated` e
  `service_role` conforme o uso. `testes/banco/conferencia-de-email.test.ts`
  mostra como provar isso por `information_schema.routine_privileges`.
  Função de papel restrito nomeia no `revoke` também os papéis que ficam de
  fora (`from public, anon, service_role`): o Supabase concede execução a
  `anon`, `authenticated` e `service_role` por `alter default privileges` no
  `create function`, e esse grant explícito sobrevive ao `revoke ... from
  public`. O PGlite não reproduz isso, então o teste fica verde nos dois
  jeitos; `20260924220000_resolucao_da_excecao.sql` é o modelo.
- **Segredo literal reprova**: chave, URL de provedor e token não entram em
  migração. Vão para o cofre (`account_secrets`) ou para variável de ambiente.
  A regra da URL olha **todo literal de texto**, e `comment on ... is '...'` é
  literal: um exemplo de link dentro de um comentário reprova o `check:sql`
  igual a uma credencial. Descreva o formato em palavras.
- **Padrão que vem de outra tabela é gatilho `before insert`, não `default`.**
  O default de coluna não alcança outra linha, e o `not null` é conferido
  **depois** dos gatilhos `before`: a coluna fica `not null`, o gatilho preenche
  quando o insert a omite, e quem informou o valor fica com o dele.
  `herdar_fuso_da_conta()` é o modelo — `security definer`, porque sob RLS a
  conta pode estar fora do alcance da sessão, e aí quem deve recusar é a
  política de insert, com a mensagem certa, não um "valor nulo" enganoso.
- **Recurso que a plataforma entrega pronto não se cria na migração, se
  confere.** O Vault (schema `vault`, da extensão `supabase_vault`) é como
  `auth.users`: existe antes da primeira migração. A migração do cofre abre com
  um `do $$ ... $$` que levanta exceção se `vault.secrets` não estiver lá, com a
  razão escrita. O par disso é o preâmbulo de
  `testes/auxiliares/banco-de-teste.ts`, que recria o recorte usado — e é lá que
  entra toda suposição nova sobre o que o Supabase provê.
- **Chave estrangeira entre duas filhas da mesma conta não leva `on delete
  restrict`.** Apagar a conta cascateia para as duas no mesmo comando, e a
  ordem entre as cascatas segue a ordem de criação das constraints, não a das
  dependências: o `restrict` derruba a exclusão da conta inteira.
  `leads.stage_id` aponta para `pipeline_stages` com `on delete set null` por
  isso, e a trava da etapa canônica fica para a camada que a apaga.
- **Tabela nova pode acordar um passo de `passos_de_configuracao()`.** O
  catálogo aponta para tabelas de fases futuras, e `onboarding_health` devolve
  `disponivel = false` enquanto elas não existem. Criar a tabela vira o passo
  para medível e muda o que `testes/banco/configuracao-inicial.test.ts` afirma.
  Desde `phone_lines`, **nenhum** passo aponta para tabela ausente, e o teste
  que prova o mecanismo faz o caminho inverso: `drop table ... cascade` dentro
  do `descartando`, que é `begin`/`rollback` — DDL no Postgres é transacional, e
  a tabela volta no fim. Passo novo de fatia futura devolve a prova ao direito.
- **RPC de escrita com deduplicação infere o índice, não lê antes de escrever.**
  `registrar_lead` é o modelo: `on conflict (account_id, phone_e164) where
  merged_into_id is null do nothing returning id`. Voltou id, criou; não voltou,
  há duplicata e o parâmetro decide o que fazer com ela. Ler antes do insert
  deixa uma janela entre a leitura e a escrita, e duas linhas iguais da mesma
  planilha passam por ela. A inferência repete as colunas **e** o `where` do
  índice parcial, senão ela não casa.
- **Mesclar é `coalesce(existente, novo)` coluna a coluna e `novo || existente`
  para jsonb**: o que já está gravado vence o que chegou, nos dois casos. E
  quando a mescla não muda nada, o resultado é `ignorado` e nenhum evento é
  escrito — senão reimportar a mesma planilha vira mil linhas de evento que não
  narram mudança nenhuma.
- **RPC que grava linha-pai escreve o evento chamando o RPC de evento**, nunca
  por `insert` direto em `lead_events`: é o que mantém uma regra só de autoria
  (com sessão o autor é `auth.uid()`; sem sessão, o parâmetro) e faz as duas
  escritas viverem ou morrerem juntas. Sem sessão o padrão de `actor` é
  `system`, não `user`, porque `user` exige `actor_id` e a borda nem sempre tem
  um.
- **A ligação entra em `lead_events` por gatilho em `calls`**
  (`calls_na_linha_do_tempo`), e não pela borda: toda borda que leva `status`
  a `ended`/`failed` narra a ligação sem saber disso, uma vez por chamada
  (`lead_events_uma_ligacao_idx`, único em `call_id` onde `kind = 'call'`).
  Teste de banco que conta `lead_events` de um lead com chamada encerrada vê
  esse evento a mais; filtre por `kind`.
- **RPC que percorre tabelas de fatia futura usa lista declarada e
  `to_regclass`, nunca varredura do catálogo.** `lead_merge` reaponta as seis
  tabelas com `lead_id` que L-11 nomeia; só `lead_events` existe hoje, e as
  outras são puladas porque `to_regclass` devolve nulo. A fatia que criar a
  tabela acrescenta o nome à lista e nada mais. Varrer o catálogo atrás da
  coluna pegaria também tabela que não deve ser reapontada, e o erro seria
  silencioso.- **Regra recorrente é `time`; instante é `timestamptz`.** "Toda terça das 9 às
  12" não é um ponto no calendário: guardado em `timestamptz`, teria que ser
  reescrito a cada mudança de horário de verão. `specialist_availability` usa
  `time` e declara no `comment on table` em que fuso as horas valem — o do
  especialista (T-21), que não é o da conta. `specialist_blocks` usa
  `timestamptz`, porque um bloqueio tem começo e fim no relógio.
- **"Duas linhas destas não podem se sobrepor" é `exclude using gist`**, com a
  igualdade e o intervalo na mesma restrição:
  `exclude using gist (specialist_id with =, tstzrange(starts_at, ends_at, '[)') with &&)`.
  O `btree_gist` da migração da F0 é o que permite misturar as duas, e não
  precisa qualificar a classe de operadores apesar de a extensão morar em
  `extensions`. O `[)` decide o encostado: quem termina às 10h convive com quem
  começa às 10h. A recusa chega como SQLSTATE `23P01`.
- **Idempotência de rotina é chave única, não cuidado da rotina.** O que a
  sincronização periódica grava carrega o identificador do lado de fora
  (`specialist_busy_blocks.external_id`) e uma chave única com o dono da linha,
  para a passagem seguinte fazer `on conflict ... do update` em vez de duplicar
  a janela inteira. Sem a chave, a idempotência vira disciplina de quem escreve
  a rotina, e some no primeiro refatoramento.
- **Soma materializada se recalcula, nunca se acumula por delta.** O gatilho
  que mantém `calls.cost_cents` a partir de `call_costs` refaz
  `sum(amount_cents)` da chamada inteira a cada insert, update e delete: delta
  errado acumula em silêncio e só aparece num número que ninguém reconcilia
  meses depois, enquanto a soma refeita se autocorrige na escrita seguinte. O
  update pode mover a linha de um pai para outro, então os **dois** pais entram
  no recálculo — e `new` e `old` se leem por `tg_op`, porque em gatilho de
  delete ler `new` levanta "record new is not assigned yet".
- **Ocupação lida de fora não ganha restrição de exclusão.** O bloqueio
  declarado por gente da conta (`specialist_blocks`) recusa sobreposição porque
  duas linhas sobrepostas ali são engano; a ocupação vinda do calendário alheio
  convive sobreposta, porque agenda com dois eventos no mesmo horário é estado
  comum — e recusar a segunda faria a rotina falhar por causa da agenda de
  outra pessoa. O efeito no gerador de horários é o mesmo de qualquer jeito.
- **Coluna que a rotina escreve sai da trilha.** `registrar_auditoria` aceita
  quantas colunas de ruído se passar do segundo argumento em diante:
  `registrar_auditoria('account_id', 'synced_at', 'sync_error')` deixa a
  conexão e a troca de agenda na trilha e tira dela as passagens de cinco em
  cinco minutos. Tabela que é só retrato reescrito pela rotina nasce **sem**
  `updated_at`, e é a ausência da coluna que declara a ausência do gatilho para
  a varredura de `registro-de-auditoria.test.ts`.
- **`synced_at` nulo e `sync_error` nulo não são a mesma coisa que "livre".**
  Quando uma coluna guarda o instante da última leitura bem-sucedida, o
  `comment on column` precisa dizer o que o par nulo significa — rotina parada,
  e não agenda vazia — senão quem consultar a ocupação conclui que o horário
  está livre quando o que houve foi a rotina deixar de rodar.
- **Sobreposição de `time` não vira restrição.** Nenhuma expressão imutável
  sobre `time` serve de chave de exclusão, então faixas sobrepostas do mesmo dia
  entram no banco e quem as une é o gerador de horários. Onde a regra ficar com
  o código em vez do banco, o `comment on table` diz isso, senão o próximo a ler
  o esquema supõe que o banco já cuidou.
- **Chave estrangeira entre duas filhas da mesma conta não usa `restrict`.**
  Quando A e B são filhas de `accounts` com `on delete cascade` e B aponta para
  A, apagar a conta dispara as duas cascatas no mesmo comando, e qual roda
  primeiro depende da ordem dos gatilhos internos de integridade — nome gerado,
  não contrato. Se a de A vier primeiro, um `restrict` em B derruba a exclusão
  da conta. A forma que sobrevive às duas ordens é `on delete no action
  deferrable initially deferred`: mesma recusa para quem apaga a linha de A
  sozinha, conferida no fim da transação. Muda também o SQLSTATE da recusa —
  `restrict` levanta `23001`, `no action` levanta `23503`.
- **Configuração tipada nasce só com as colunas que alguém já lê.**
  `account_settings` é uma linha por conta (T-22), criada por gatilho
  `after insert on accounts` mais um `insert ... select` para as contas que já
  existiam, e a fatia que precisa de uma área de configuração acrescenta as
  colunas dela. Coluna que nenhuma leitura honra promete um efeito que não
  existe, e o `comment on table` diz que é assim de propósito.
- **Forma de `jsonb` se valida em gatilho `before`, não em `check`.** Um
  `check` sobre a coluna só sabe dizer "restrição violada", e quem escreveu
  fica adivinhando qual das sete chaves está torta;
  `validar_janela_de_discagem()` levanta `22023` nomeando o dia, a chave e o
  valor que chegou, com `hint` dizendo a forma certa. E aí a coluna **não**
  ganha um `check` de forma junto: gatilho `before` roda antes de todo check da
  tabela, então o check nunca seria quem levanta o erro — restrição que nunca
  dispara é restrição que ninguém mantém.
- **Hora e minuto em texto se escrevem com zero à esquerda**, e a largura fixa
  é o que deixa comparar fim contra início como texto: `'09:00' < '18:00'`
  ordena igual ao relógio, sem `time` no meio. `24:00` é o fim do dia inteiro e
  entra como caso à parte, nunca afrouxando a expressão regular — aceitar
  `24:30` por descuido daria uma janela que nunca fecha.
- **Teto sem número seguro nasce nulo, não chutado.** `daily_spend_cap_cents` e
  `credit_alert_cents` são nulos por padrão, e o comentário diz que nulo é
  "sem teto": preço por minuto só se conhece depois da primeira fatura, e um
  teto adivinhado pararia a conta por engano no primeiro dia. O contrário vale
  para o que é decisão de risco — `speed_to_lead_enabled` nasce falso, porque
  ligar sem ninguém ter pedido é o caminho curto da primeira reclamação.
- **Modo e destino do modo andam juntos num check só.** `(modo = 'fixed') =
  (destino is not null)` cobra os dois lados de uma vez: `fixed` sem destino
  cairia calado no comportamento padrão, e destino apontado num modo que não o
  lê é um campo que a tela mostra e ninguém honra.
- **Número sequencial por linha-pai nasce de gatilho, com o pai travado.**
  `playbook_versions.version` é o modelo: o gatilho `before insert` faz
  `perform 1 from <pai> where id = ... for update`, lê o máximo já com a
  transação anterior gravada, e **sobrescreve** o que o cliente mandou — número
  não é campo de formulário. O único em (pai, número) é a rede embaixo: se um
  dia alguém escapar da trava, a segunda transação cai ali em vez de criar a
  segunda versão 3.
- **Teto de linhas por conta é gatilho com o pai travado, não `check`.** Um
  `check` não conta linhas irmãs. `limitar_numeros_de_teste()` faz
  `perform 1 from public.accounts where id = ... for update`, conta e levanta
  `23514` com a saída escrita na mensagem — quem bate no teto precisa saber que
  apagar um é o caminho. O gatilho é `before insert or update of <coluna da
  conta>`: mudar a conta de uma linha é um insert na conta de destino com outro
  nome, e passaria pelo teto sem ser visto. E o `update` sai cedo quando a
  coluna não mudou de valor, senão a própria linha, já contada, recusa a si
  mesma no update da décima segunda.
- **Autoria de linha que o cliente insere direto vem de gatilho, não de
  `default auth.uid()`.** O padrão da coluna só vale quando o insert a omite, e
  um cliente que mande o id de outra pessoa grava a autoria dela.
  `carimbar_autor_do_numero_de_teste()` escreve `coalesce(auth.uid(),
  new.created_by)` num `before insert`: com sessão, o autor é quem está nela;
  sem sessão — a borda com chave de serviço —, vale o que veio no insert. Vale
  quando o nascimento **não** entra na trilha: `registrar_auditoria` lê `old`, e
  por isso não registra insert nenhum.
- **"Uma linha publicada por pai" é índice único parcial**, e quem arquiva a
  anterior é um gatilho **`before`**: o índice recusa a segunda publicada antes
  de qualquer gatilho `after` rodar, então arquivar em `after` chegaria tarde.
  O `after` fica com o que depende de a linha já existir — mover o ponteiro do
  pai e escrever a trilha.
- **Tabela que é o livro-caixa de um teto não cascateia com o que ela conta.**
  `call_attempts.call_id` é `on delete set null`, e nunca cascata: com cascata,
  apagar chamadas devolveria cota para a conta no dia em que o teto já foi
  atingido. A cascata fica reservada ao que é dado pessoal do lead
  (`lead_id`, por RF-808), onde apagar é a obrigação e não a brecha.
- **Coluna que um passo posterior da guarda preenche nasce nula e assim fica na
  recusa anterior a ele.** `phone_line_id` só existe a partir do passo 8:
  preenchê-la numa tentativa recusada no passo 3 faria o teto da linha contar
  tentativa que ela não fez.
- **Ponteiro do pai para uma filha se restringe com chave composta, não com
  check**: check não consulta outra tabela. A filha ganha `unique (id, pai_id)`
  e o pai aponta com `foreign key (ponteiro, id) references filha (id, pai_id)`,
  que recusa apontar para filha de outro pai. O `on delete set null` nomeia a
  coluna — `on delete set null (ponteiro)` — porque a chave tem duas e a outra é
  a primária do pai, que não pode ser zerada. A forma vale do Postgres 15 em
  diante, e o PGlite 0.5 a aceita.
- **Neta leva `account_id` e chave composta para a filha.** `playbook_versions`
  aponta para `playbooks (id, account_id)`, e não só para `playbooks (id)`: com
  duas chaves simples, uma versão da conta B se penduraria num playbook da conta
  A — a política de escrita de B aceitaria a linha, e ela ficaria invisível para
  quem é dono do playbook. A chave composta é o que fecha isso no banco.
- **Ato que tem linha própria na trilha tira as colunas dele da comparação
  genérica.** Publicar escreve uma linha `publish` com a nota e o número da
  versão arquivada; `registrar_auditoria('account_id', 'status', 'published_at')`
  cala a linha genérica do mesmo ato. Duas linhas para um ato só são ruído, e a
  que sobra sem a outra é a pior das duas — a que diz "status mudou" sem dizer
  por quê.
- **Revogar é `update`, e o único que guarda a regra é parcial na coluna da
  revogação.** `dnc_entries` tem `unique (account_id, phone_e164) where
  removed_at is null`: um bloqueio ativo por número, e reincluir depois de
  remover é linha nova. Sem o `where`, a segunda inclusão colidiria com a
  remoção antiga e a tela diria "já existe" apontando para uma lista onde o
  número não está. `delete` no lugar do `update` é o erro de origem — a linha
  some e ninguém responde quem revogou, quando e por quê.
- **Trio de revogação (`*_at`, `*_by`, `*_reason`) anda por check, e por isso a
  coluna do autor não leva chave estrangeira.** `accounts.dialing_paused_by` e
  `dnc_entries.removed_by` são `uuid` sem `references profiles`: um `on delete
  set null` deixaria a hora preenchida e o autor nulo, que é exatamente o
  estado que o check proíbe, e apagar um perfil passaria a falhar por violação
  de restrição. O check compara o motivo com `btrim(coalesce(...)) <> ''`, senão
  motivo em branco passa por preenchido.
- **Chave estrangeira para tabela de história futura entra na migração da
  tabela referida, não na de quem referencia.** `consent_records.call_id` nasce
  como `uuid` cru porque `calls` é uma migração depois; a restrição entra junto
  com `calls`. A razão fica escrita nos dois lados — comentário da coluna aqui,
  comentário do `alter table` lá —, senão a coluna sem chave vira esquecimento
  em vez de ordem.
- **Coluna gerada que indexa texto vindo de `jsonb` chama função própria, e a
  função é `immutable`.** `calls.transcript_tsv` é
  `to_tsvector('portuguese', public.texto_da_transcricao(transcript))`: o
  Postgres calcula o valor no insert e nunca mais pergunta, então a expressão
  inteira precisa ser imutável — `string_agg` sobre `jsonb_array_elements`
  dentro de uma função `immutable` resolve, e mantém a extração legível e
  testável. Duas armadilhas: a função **não** leva `revoke execute from
  public`, ao contrário das que a interface chama por RPC, porque sem o
  privilégio o insert da própria chamada falha ao avaliar a coluna gerada; e
  ela precisa atravessar forma inesperada sem levantar erro (`case` sobre
  `jsonb_typeof`), senão uma transcrição malformada derruba o insert de uma
  ligação que aconteceu de verdade. A configuração `portuguese` responde no
  PGlite, e o teste da migração confere isso antes de confiar na busca.
- **Alvo de assinatura em tempo real é tabela mantida por gatilho, nunca
  visão.** A assinatura do Supabase lê a replicação lógica, e visão não é
  replicada: uma visão fina resolveria o tamanho da linha e não teria quem a
  emitisse. `call_live` é o modelo (R-08), e traz duas regras junto. O gatilho
  é `after insert or update of <colunas espelhadas>`, e a lista é o que importa
  — com `update` seco, cada pedaço de transcrição que chegasse reescreveria a
  linha com valores idênticos e mandaria um evento por turno de conversa para
  cada navegador aberto. E a entrada na publicação vai em `do` condicional
  (`if exists (select 1 from pg_publication where pubname = 'supabase_realtime')`),
  porque a publicação existe no Supabase e não no PGlite, e criar uma só para o
  teste seria esquema que o produto não tem.
- **Lista fechada ou aberta se decide pelo papel da coluna, não pelo gosto.**
  `call_attempts.source` é rastro e aceita nome de rotina novo sem migração;
  `dial_queue.source` é **metade de uma chave de idempotência**, e aí a lista é
  fechada — fonte inventada pela borda não colide com nada, porque nada mais usa
  aquele prefixo, e a discagem repetida passa pelo freio sem ser vista. Pelo
  mesmo motivo, os valores de fatias futuras entram desde já, com a razão
  escrita: a unicidade só vale se o formato da referência for o mesmo desde o
  começo.
- **Fila com histórico no mesmo lugar indexa por índice parcial no estado
  vivo.** `dial_queue_pronta_para_discar` é `(account_id, status, run_at) where
  status = 'queued'`: `done` e `canceled` ficam na tabela porque é deles que a
  idempotência vive, e um índice que os incluísse cresceria para sempre por
  causa de linhas que a consulta do minuto nunca olha. O estado entra na chave
  mesmo com o predicado que o fixa, para a consulta ser servida só pelo índice.
- **`account_id` nulável é decisão que precisa de teste próprio, não só de
  comentário.** `job_runs` guarda a passagem da instalação, que atravessa
  contas, e a coluna é nula nela. Como a política é
  `(select is_member(account_id))` e `is_member(null)` é falso, a linha some
  para todo cliente — é o efeito desejado, e é a única tabela do esquema em que
  a política não cobre todas as linhas. Sem um teste que afirme "nenhum membro
  de nenhuma conta vê a linha de conta nula", a próxima mão que afrouxar a
  política para `account_id is null or ...` abre a instalação inteira para
  qualquer conta sem nada ficar vermelho. A varredura de
  `travessia-entre-contas.test.ts` não pega: ela procura por `account_id = $1`.
- **Redação de `jsonb` desce por objetos e listas, e mora num gatilho
  `before`.** `redigir_evento_externo` recursiona porque o cabeçalho de
  autorização mora dentro de `headers` — uma versão de primeiro nível deixaria
  em claro o caso mais comum. Em `after` a linha já teria sido gravada em claro
  e o segredo já teria ido para a replicação e para o log de escrita. E o
  gatilho cobre `insert or update of <colunas>`, porque a rotina que grava o
  pedido antes da resposta volta para completar a linha.
- **Comparação de horário é `at time zone` com o fuso da entidade, nunca soma
  de horas** (R-10). `dentro_da_janela_de_discagem` converte o instante pelo
  fuso do lead e compara `v_local::time` contra a faixa; `'24:00'::time` é
  válido no Postgres, e é o que deixa o fim do dia inteiro ser comparação de
  `time` sem caso especial. A sabotagem que prova a regra é trocar a conversão
  por `- interval '3 hours'`: ela só derruba os casos de fuso diferente de
  UTC−3, e é por isso que Manaus e Noronha precisam estar na tabela de casos.
- **Regra que vive no banco e num módulo portável tem tabela de casos única.**
  A janela de discagem decide na guarda (SQL) e fala na borda (`janela.ts`);
  duas verdades sobre a mesma regra é defeito, e a ponte é
  `_shared/discagem/casos-de-janela.ts`, exercitada pelos dois testes.
  Configuração malformada é recusada na escrita pelo gatilho, e a função de
  leitura apenas não disca — separar "sem faixa" de "quebrada" é da tela, e
  quem o faz é o módulo.
- **Guarda que conta e grava é uma função `security definer` com as travas em
  ordem fixa.** `guard_dial` toma `pg_advisory_xact_lock` por conta e depois por
  (conta, número), nessa ordem sempre: duas chamadas que tomassem as mesmas duas
  travas em ordens diferentes se travariam uma na outra. A trava do número vem
  **depois** da normalização, senão `11999998888` e `+5511999998888` esperam em
  filas diferentes pelo mesmo telefone. E verificar e gravar ficam na mesma
  transação — é o ponto de T-05: com leitura e escrita separadas, duas discagens
  simultâneas passam as duas e o teto deixa de ser teto.
- **Teto conta o que saiu, não toda tentativa.** `call_attempts` guarda a recusa
  também (RF-406), mas as contagens dos passos 6, 7 e 8 filtram
  `outcome = 'placed'`. Contar recusa se morde: três recusas por fora da janela
  de manhã queimariam a cota daquele número e a ligação nunca sairia no dia em
  que a janela abrisse.
- **Janela no fuso do lead, tetos no dia da conta.** São dois fusos diferentes na
  mesma função, de propósito: quem é incomodado é o lead, e quem tem a cota é a
  conta. Contar o dia no fuso do lead daria a uma conta com leads em três fusos
  três dias diferentes e um teto que ninguém sabe quando reinicia.
- **Função `returns table` cuja coluna tem nome de coluna de tabela leva
  `#variable_conflict use_column`.** `guard_dial` devolve `reason`, e
  `dnc_entries` tem `reason`: sem a diretiva, `select d.reason ...` levanta
  "column reference is ambiguous". A diretiva faz a coluna vencer, e os valores
  do retorno viajam em variáveis `v_*` até o `return query`.
- **Passo que é o primeiro de uma sequência não leva a guarda dos outros**, e
  isso muda a sabotagem que o prova. O passo 0 de `guard_dial` atribui o motivo
  sem conferir `v_motivo is null`, porque nada o precede. Movê-lo para o meio da
  função **não** derruba o teste de precedência: a atribuição sobrescreve o
  motivo que os passos anteriores tinham posto, e o resultado continua sendo
  `dialing_paused`. A sabotagem honesta move o passo **e** acrescenta a guarda,
  que é como ele estaria escrito naquela posição.
- **`perform` reescreve `found`.** Em plpgsql, `perform set_config(...)` logo
  depois de um `update` troca o `found` do update pelo do `perform`, que é
  sempre verdadeiro. Leia `get diagnostics v_n = row_count` antes de derrubar
  o parâmetro de sessão. `registrar_primeira_chamada_de_teste` é o caso.
- **Só `20260925000000_portao_de_lead_real.sql` liga
  `feature_flags.real_dialing`.** `testes/estatica/portao-da-fatia.test.ts`
  varre o texto das migrações (sem comentários) atrás de `real_dialing` seguido
  de `true` e cobra que o único achado seja ela. A migração abre com um bloco
  de prontidão (`do $$ ... raise exception ... detail $$`) que confere pelo
  catálogo cada objeto da F3 e o passo 2 no `prosrc` de `guard_dial`; ligar a
  bandeira não abre sozinho, porque o passo 2 exige também
  `first_test_call_ok_at`. Migração posterior que redefina `guard_dial` passa
  por fora da prontidão, e o mesmo teste estático reprova a que não repetir o
  passo 2. Portão novo segue o desenho: conferência com a razão escrita no
  `detail`, cada condição sabotada em teste por `criarBancoDeTeste({
  pararAntesDe })` mais `retomarMigracoes()`, e `default` junto do `update`
  para a conta que nasce depois.
- **A tela lê o portão por `estado_do_portao(conta)`, que repete o passo 2 de
  `guard_dial`** (`20260925010000_estado_do_portao.sql`): mesma leitura da
  bandeira com `coalesce(..., false)`, mesma marca, e a lista do que falta em
  código (`real_dialing`, `first_test_call`). É `security invoker`, então quem
  decide a leitura é a RLS de `accounts`. `testes/banco/estado-do-portao.test.ts`
  compara as quatro combinações contra a guarda: mudar o passo 2 sem mudar esta
  função derruba ali, antes de a tela prometer o que a guarda recusa.
- **Renomear valor de lista fechada é contrato, e vai numa transação só.**
  `drop constraint if exists` do check antigo, `update` das linhas, `add
  constraint` com nome estável (`dnc_entries_origem_conhecida`), e o mesmo
  commit troca o valor na interface e nos testes. Quando a recusa precisa de
  frase em português, um gatilho `before insert or update of <coluna>` levanta
  `23514` com a mensagem e o check fica por baixo como rede — mensagem de check
  do Postgres não se escreve. `20260924140000_conformidade_do_bloqueio.sql` é o
  modelo, e ele também mostra o "confere e completa" de tabela que a fase
  anterior criou: `to_regclass` num `do`, `add column if not exists`, e
  `drop ... if exists` antes de reemitir política e gatilho.
- **O Postgres confere os checks de uma tabela em ordem alfabética do nome**, e
  a mensagem de erro nomeia o primeiro que falhar. Check de linha inteira que
  envolve uma coluna de domínio fechado (`status` com a resolução completa)
  se escreve em implicações — `(status <> 'aberto' or ...) and (status <>
  'resolvido' or ...)` — para não opinar sobre valor desconhecido; senão ele
  recusa `status = 'x'` antes do check de domínio, com o nome errado na
  mensagem. `20260924150000_fila_de_excecoes.sql` é o caso.
- **Métrica e listagem de operação leem `chamadas_reais`, nunca `calls`.** A
  visão (`20260924170000_ensaio_fora_das_metricas.sql`) é `calls` sem
  `direction = 'rehearsal'`, com `security_invoker = on` — sem ele a visão roda
  com os privilégios do dono e fura a RLS de `calls`. Função nova que leia
  `calls` precisa citar `direction`, ler da visão ou entrar em `ISENTAS` de
  `testes/banco/ensaio-fora-das-metricas.test.ts` com a razão; a varredura lê
  `pg_proc.prosrc`. Custo real não é métrica: `call_costs` recebe o ensaio.
  Ficha por id continua em `calls`.
- **Métrica que a fatia ainda não entrega volta como código, nunca como
  zero.** `dashboard_summary` (`20260930200000_resumo_do_painel.sql`) devolve
  `{"codigo": "indisponivel_nesta_fase", "fatia": "F5"}` em cada campo de
  reunião e de apuração: zero se lê como "nenhuma reunião". A fatia que ligar o
  número troca o objeto pelo valor e muda a asserção de
  `testes/banco/dashboard-summary.test.ts`. As reuniões foram ligadas por
  `20261013100000_reunioes_no_painel.sql`: realizada e falta só com desfecho
  apurado, a que passou sem desfecho vai em `sem_apuracao` e nunca é somada,
  e o custo por reunião realizada volta por moeda. RPC de leitura agregada é
  `security definer` para atravessar as tabelas numa passada, então **toda**
  subconsulta filtra `account_id = p_account_id` à mão, lê `chamadas_reais` e
  `not is_synthetic`; a porta é `(select is_member(...))` na entrada.
- **O ensaio tem um lead sintético por conta, e a política de leitura o
  esconde.** `lead_de_ensaio(conta)` (`20260924210000_lead_de_ensaio.sql`) cria
  na primeira vez o lead com `is_synthetic = true`, e `abrir_ensaio` pendura a
  chamada nele, para `call-init` e as ferramentas lerem o ensaio pelo mesmo
  caminho da ligação real. `leads_leitura_de_membro` tem `and not
  is_synthetic`: lista, funil e contagem pelo cliente já o deixam de fora.
  Leitura de `leads` com a chave de serviço passa por cima da política e
  precisa filtrar `is_synthetic` quando for listagem ou métrica.
- **Borda cuja chave o adaptador resolve devolve o valor à parte portável.**
  Em `rehearsal-session` a chave da voz é resolvida no `index.ts`, então
  `RespostaDoProvedor.credencial` a traz de volta só para
  `conferirQueNaoVazou`. Sem isso o módulo portável não tem o que procurar, e
  a rede de segurança existe só no nome. Confira o texto que veio do provedor
  antes de criar linha (a recusa não pode deixar chamada pendurada) e o corpo
  inteiro logo antes de responder.
- Enquanto a F0 não subir para ambiente nenhum, corrigir uma migração já
  commitada é preferível a empilhar uma migração de remendo. Depois do primeiro
  deploy, o contrário.

## Políticas

A matriz está em `docs/PRD-implementacao.md` seção 3.9 e vira SQL assim:

- **Toda política é `to authenticated`.** Sessão anônima não casa com nenhuma e
  recebe zero linha. Política sem `to` também valeria para `anon`, que nunca é
  o que se quer.
- **Leitura é `(select is_member(account_id))`; escrita é
  `(select has_role(account_id, '<papel>'))`.** `accounts` é o caso especial:
  o account_id dela é a própria coluna `id`.
- **`update` precisa de `using` e de `with check` com a mesma expressão**, senão
  a linha sai do alcance depois de alterada — ou entra no de outra conta.
- **Sem política de `insert` não há insert nenhum**, nem para owner. Em
  `accounts` isso é proposital: ninguém é admin de conta que ainda não existe, e
  criar conta é trabalho de RPC `security definer`. Onde faltar política, diga
  por quê no comentário.
- **`comment on policy <nome> on <tabela>`** em cada política, com a classe da
  matriz e o motivo. É o que sobra para quem for ler a regra dali a meses.
- **Linha de `owner` só se mexe com `has_role(..., 'owner')`**, tanto no `using`
  quanto no `with check`: admin administra a equipe, mas não rebaixa o dono nem
  fabrica outro.
- **Classe Servidor é uma política só, de `select`.** Tabela que a rotina
  preenche (`specialist_busy_blocks` é o primeiro caso) fica com RLS ligada,
  leitura por `is_member` e **nenhuma** política de escrita — nem para admin,
  nem para owner. Sem política, `insert` é recusado com "row-level security" e
  `update`/`delete` simplesmente não afetam linha; quem escreve é a função de
  borda com a chave de serviço, que passa por cima da RLS. Não adianta revogar
  o privilégio: o Supabase o reconcede por `alter default privileges`. A
  fronteira é a ausência de política, e se prova no catálogo — `pg_policies`
  daquela tabela tem que devolver só `SELECT`.
- **Tabela fechada ao cliente é RLS ligada e zero política.** É a classe Dono
  levada ao limite: `account_secrets` não tem leitura por ninguém, nem pelo
  owner. Quando for esse o caso, três coisas andam juntas — o comentário na
  migração dizendo por onde o dado sai, um RPC `security definer` para cada
  caminho legítimo, e a declaração em `SEM_LEITURA_DE_CLIENTE` no
  `travessia-entre-contas.test.ts`, que troca "vê a própria conta" por "não vê
  nem a própria" e confere no catálogo que a política continua ausente.
- **Grant é a fronteira quando não há política.** Função que devolve valor de
  segredo (`get_account_secret`) leva `revoke ... from public` e grant **só**
  para `service_role`. Provar isso é provar os dois lados: `service_role` lê,
  `authenticated` e `anon` recebem `permission denied`.
- **Tabela de registro (`audit_log`, `lead_events`) é RLS ligada, política só
  de `select` e escrita por gatilho ou RPC.** Política de insert para membro
  devolveria ao cliente a chance de forjar `actor` e `actor_id`, que é
  exatamente o que a trilha existe para impedir. E o RPC não confia no
  argumento: quando `auth.uid()` não é nulo, o autor é ele, e `p_actor` só vale
  para quem chega sem sessão, que é a borda com a chave de serviço.
  `registrar_evento_de_lead` é o modelo — ele também resolve o `account_id`
  pela linha-pai em vez de recebê-lo, para que o evento não possa nascer numa
  conta diferente da do lead que narra.

- **Linha que é o único ponteiro para um recurso lá fora não se apaga direto.**
  `knowledge_entries` tem política de delete com `and provider_doc_id is null`:
  a entrada que nunca chegou ao provedor sai na hora, e a indexada se marca em
  `removed_at`. Quem apaga é `knowledge-sync`, pela chave de serviço, depois do
  2xx da remoção remota — apagada antes, a linha levaria o identificador do
  documento que continuaria no provedor, e a Sarah seguiria lendo o que a conta
  mandou tirar. A mesma função trata a atualização como remover o antigo, voltar
  a pendente (`marcar_conhecimento_desindexado`) e reenviar, nessa ordem: criar
  o novo antes deixaria, na falha da remoção, um documento sem ponteiro.

- **Coluna de classe mais alta numa tabela de classe mais baixa se guarda por
  gatilho, não por política.** Políticas permissivas somam: uma segunda
  política de update só para o dono não impede o admin que a primeira já deixa
  passar. `guardar_privacidade_do_dono` é `before update of <colunas>` e
  levanta `42501` quando a sessão existe e não é dono; sem sessão é o servidor,
  que passa. O RPC da tela confere o papel no corpo também, porque
  `security definer` não desliga gatilho mas desliga a política.

## Auditoria

`audit_log` é escrita por gatilho, nunca pelo cliente. Tabela de configuração
nova entra na trilha com uma linha, e sem código novo:

```sql
create trigger <tabela>_auditoria
  after update or delete on public.<tabela>
  for each row execute function public.registrar_auditoria();
```

O argumento do gatilho é a coluna que aponta para a conta, e só `accounts`
precisa dele (`registrar_auditoria('id')`), porque nela o account_id é o
próprio `id`.

- **O gatilho pula quando a conta já não existe.** Apagar uma conta cascateia
  para as filhas, e o gatilho de cada filha correria para gravar auditoria de
  uma conta morta: a chave estrangeira recusaria a linha e a exclusão inteira
  falharia. A trilha cai junto com a conta de qualquer forma.
- **Coluna sensível entra redigida.** `redigir_auditoria` troca por
  `[redigido]` o valor de toda coluna cujo nome case com
  `token|secret|senha|password|hash|chave|credential`. A regra é sobre o nome
  da coluna, não sobre a tabela, para que coluna de fase futura nasça coberta.
  O preço é o falso positivo: `credentials_mode` guarda de quem é a chave, não
  qual é ela, e redigido vira `[redigido] → [redigido]`, uma linha de trilha
  que não explica nada. A correção é a **lista nominal de exceções** dentro da
  função (`chave <> all (array['credentials_mode'])`), nunca afrouxar a
  expressão: o padrão continua sendo redigir, e o que escapa está escrito com a
  razão. Coluna que guarda o valor de uma credencial não entra na lista.
- **`updated_at` fica fora da comparação**, e update que não mudou mais nada
  não vira registro. Do **segundo argumento em diante** o gatilho declara
  outras colunas de ruído: `registrar_auditoria('account_id', 'health')` tira
  o cache recalculado pelo servidor da trilha. Sem isso, cada recálculo viraria
  uma linha e a auditoria afogaria o fato real no meio delas.
- **Tabela da classe Servidor não leva o gatilho, e a dispensa se declara em
  `SEM_AUDITORIA`** (a varredura de `testes/banco/registro-de-auditoria.test.ts`
  cobra toda tabela com `updated_at`). `calls` é o caso: dezenas de linhas de
  trilha por ligação, nenhuma com autor humano, diriam o que a própria linha já
  diz. O que precisa de autor é a decisão de discar, e ela entra pelo RPC.
- **Motivo entra por parâmetro de sessão**: `set_config('app.audit_reason',
  ...)` antes da escrita. RPC que age em nome do usuário deve declará-lo.
- **Não há `revoke insert ... from authenticated` em `audit_log`**, e é
  deliberado: o Supabase reconcede os privilégios de `public` por `alter
  default privileges`, e o auxiliar de teste faz o mesmo. A fronteira é a
  ausência de política de escrita.
- **Ação sensível que não muda linha nenhuma entra por RPC, não por gatilho.**
  Exportar contatos é leitura, e leitura não tem `after update` onde pendurar a
  trilha — mas RF-008 a nomeia entre as ações a registrar, e é a única que tira
  o dado de dentro do produto. `registrar_exportacao_de_leads` é o modelo: o
  autor é `auth.uid()` e **não há parâmetro de ator** (registro de quem exportou
  assinado por outro é pior que registro nenhum), a função recusa quem não é
  membro e recusa a chave de serviço por falta de sessão, e o payload guarda a
  quantidade **e o recorte usado** — "exportou 1.200 leads" não responde a
  pergunta que se faz meses depois, que é "exportou quais". Existir um RPC de
  escrita não abre a tabela: a fronteira continua sendo a ausência de política,
  e o teste da migração confere isso no catálogo.

## Estado declarado e estado medido

`onboarding_state` guarda o que a pessoa declarou (passo atual, passos
marcados, se dispensou o assistente); `onboarding_health(conta)` mede o que
existe no dado. As duas coisas não se fundem, e é a regra que dá valor ao
checklist: marcar "número" não faz aparecer número, então `pendente` vem
sempre da medição e `marcado` viaja ao lado, para a tela apontar a diferença.

- **Catálogo de passos é dado** (`passos_de_configuracao()`), com a tabela onde
  a evidência mora, a condição que a qualifica e os códigos do que ela bloqueia
  (`ligacao`, `agendamento`, `campanha`). A frase de cada código é da interface.
- **O catálogo aponta para tabelas de fases futuras**, então a medição pergunta
  antes se a tabela existe (`tabela_de_passo_medivel`): passo sem tabela volta
  `pendente` com `disponivel = false` — pendente de verdade, e ainda sem onde
  resolver. Tabela que exista e não tenha `account_id` levanta exceção, em vez
  de virar passo eternamente pendente.
- **O passo tem três estados, não dois.** `onboarding_health` devolve
  `estado` com `pendente`, `aguardando_aprovacao` e `concluido`. O do meio é
  dos passos marcados como `aprovacao_externa` no catálogo (hoje `numero`, que
  espera a operadora, e `agenda`, que espera a verificação do aplicativo OAuth
  do Google): a pessoa marcou o passo, fez a parte dela, e a resposta vem de
  fora. `pendente` continua medido no dado e não se apaga por causa disso —
  quem espera continua bloqueando o que bloqueava. A interface não recombina a
  regra: quem sabe quais passos esperam alguém de fora é o catálogo.
- **Coluna nova em `returns table` é `drop` mais `create`, não `create or
  replace`.** O Postgres recusa trocar o tipo de retorno. Duas consequências:
  os grants morrem com o drop e precisam ser reemitidos na mesma migração, e a
  ordem do drop importa (a função que chama vai antes da chamada). Função de
  corpo literal (`as $x$ ... $x$`) não registra dependência, então o drop não
  arrasta quem a cita — inclusive um `check` de tabela continua de pé.
- **Coluna de cache calculada pelo servidor** (`onboarding_state.health`) fica
  fora do alcance do cliente por gatilho `before update`, liberado por um
  parâmetro de sessão que só o RPC de recálculo levanta — a política de update
  continua sendo de admin, porque o resto da linha é dele. Pelo PostgREST não
  há como chamar `set_config`, que não vive em schema exposto.
- **A fronteira de uma coluna nunca é grant de coluna.** O Supabase reconcede
  privilégio por `alter default privileges`, e trava que o ambiente desfaz
  sozinha é pior que trava nenhuma. Coluna que o cliente não pode escrever sai
  do alcance dele por gatilho `before update` que devolve `old.<coluna>`, mais
  um parâmetro de sessão que o escritor legítimo levanta.
  `proteger_operacao_da_conta` (`accounts.credentials_mode` e
  `accounts.first_test_call_ok_at`) é o segundo caso, e traz a regra que o
  primeiro não tinha: **um parâmetro por escritor**, não um por gatilho. O modo
  de credencial é ato do dono, por RPC; a primeira chamada de teste é medição
  de `call-finalize`, pela chave de serviço. Com um parâmetro só, quem pode uma
  coisa passa a poder a outra.
- **Gatilho de proteção que cobre o insert normaliza em vez de preservar, e aí
  o `check` da coluna deixa de ser alcançável pelo cliente.**
  `proteger_saude_da_linha` (`phone_lines.health`) escreve `'{}'` no insert e
  `old.<coluna>` no update, porque no insert não há retrato anterior a
  preservar. A consequência é que o `check` de forma (`jsonb_typeof(...) =
  'object'`) nunca dispara pelo lado do cliente — gatilho `before` roda antes
  de todo check —, e quem ele protege é o escritor com o parâmetro levantado. É
  contra esse lado que o teste da forma precisa ser escrito; contra o cliente,
  ele passa verde sem provar nada.
- **RPC que levanta o parâmetro o derruba antes de devolver**
  (`set_config(..., '', true)` no fim). Sem isso a trava vale só até a primeira
  chamada legítima da transação: o resto dela escreveria a coluna por update
  direto. `definir_modo_de_credencial` é o modelo, e o teste que mede isso faz
  um update comum logo depois da chamada e cobra que ele não teve efeito.
- **Sinalizador de portão nasce escrito, não ausente.**
  `accounts.feature_flags.real_dialing` nasce `false` pelo default da coluna
  **e** por um `update ... where not (feature_flags ? '<chave>')` na mesma
  migração, que é o que alcança as contas que já existiam. Chave ausente faz
  toda leitura depender de um `coalesce` correto em cada chamador, e basta um
  esquecer para o portão virar `null`, que não é falso.

## Funções de servidor

Uma pasta por função em `functions/`, com o nome que o gateway expõe
(`invite-accept`), e o que for comum entre funções em `functions/_shared/`.
Cada função se parte em dois, e a divisão não é estética:

- **`functions/_shared/` é o que qualquer tela pode importar**, pelo alias
  `@compartilhado/`. Por isso ele não pode citar `Deno` nem import de rede:
  `token-de-convite.ts` é o exemplo, e é o que garante que o hash que a tela
  calcula ao gerar o link seja o mesmo que a borda recalcula ao aceitar. Uma
  função inteira pode ser aberta assim quando a tela desenha o que ela decide —
  `leads-import` tem o alias `@importacao/`, porque a tela de importação mostra
  a prévia e o relatório que ela monta —, e aí a regra vale para a pasta toda:
  módulo portável, sem `Deno`, e o `index.ts` continua de fora.
- **Cenário de teste que os dois lados provam mora em módulo próprio, não
  dentro do `*.test.ts`.** `leads-import/planilha-de-exemplo.ts` gera a planilha
  de mil linhas do critério de aceite da F1, e dela vivem o teste da prévia e o
  da tela de importação. Exportar o gerador do arquivo de teste pareceria mais
  curto e registraria a suíte inteira da borda dentro da suíte da interface.
- **Segredo de portador tem uma receita só**, em `_shared/hash-de-segredo.ts`:
  valor em base64url gerado onde alguém o vai usar, `sha256` em hexadecimal na
  coluna, `check (col ~ '^[0-9a-f]{64}$')` como trava. `token-de-convite.ts` e
  `chave-de-entrada.ts` são os dois nomes que ela tem no produto, e cada um
  delega em vez de reimplementar. Duas cópias de um hash se desencontram no
  primeiro ajuste, e o desencontro só aparece em produção, como segredo já
  entregue que deixou de resolver. Segredo novo entra assim, com o teste que
  fecha o par: o hash que o módulo calcula é o que a coluna guarda.
- **`index.ts` é adaptador Deno e só isso.** `Deno.serve`, `Deno.env`, import
  `npm:`, montagem do cliente do Supabase. Fica **fora** do typecheck e do lint
  da raiz, que são de Node e não resolvem nenhuma dessas três coisas — o
  `exclude` de `tsconfig.ferramentas.json` e o `ignores` de `eslint.config.js`
  o deixam de lado de propósito. Quem o verifica é `npm run check:funcoes`
  (`deno check`), que é degrau do CI.
- **Todo o resto é portável**: TypeScript comum, sem nenhuma referência a Deno
  e sem import de rede. É o que `npm run test:unit` roda, pelo projeto
  `vitest.funcoes.config.ts`. Regra que decide alguma coisa mora aqui, nunca no
  `index.ts`, senão nasce sem teste.
- **A camada de dados entra por interface**, implementada no `index.ts` sobre o
  cliente do Supabase e dublada no teste. `PortaDeConvites`, em
  `functions/invite-accept/aceite.ts`, é o modelo: duas operações, nada de SDK
  atravessando para a lógica.
- **A decisão é do banco; a frase é da borda.** O RPC devolve um código
  (`expirado`, `revogado`, `ja_aceito`), e a função traduz para português e
  para status HTTP. Assim a regra continua valendo para quem chamar o banco por
  outro caminho, e o texto de interface fica num arquivo só.
- **RPC que a interface chama sem sessão** (`previa_do_convite`,
  `email_registrado`) é `security definer`, leva `revoke execute ... from
  public` e depois `grant` para `anon`, `authenticated` e `service_role`. Sem o
  grant a `anon`, quem chega pelo link recebe "permission denied for function"
  em vez de resposta. A chave de busca é o hash do token: só quem tem o link
  consegue calculá-la, e é isso que substitui a política de RLS.
- **Função pública** (`verify_jwt = false` em `config.toml`) confere o
  cabeçalho `Authorization` por conta própria. É o que permite responder "entre
  para aceitar o convite" em vez do 401 cru do gateway.
- **Credencial de provedor se resolve por `_shared/secrets.ts`, nunca à mão.**
  `criarCofreDeCredenciais({ porta, ambiente })` devolve `resolveSecret(conta,
  provedor, chave)` com a cascata dos três degraus — cofre da conta,
  configuração do recurso, variável da plataforma — e cache de 60 s. O degrau
  da plataforma é o perigoso em multiempresa, e por isso em `producao` ele só
  passa com `accounts.credentials_mode = 'platform'`; o resultado é união
  discriminada (`plataforma_bloqueada` não é o mesmo que `ausente`). Escrita
  no cofre feita pela borda chama `invalidar(...)` na mesma passagem, senão a
  chave velha sobrevive um minuto.
- **Credencial de terceiro é da conta, digitada por ela.** Twilio (Account SID
  e Auth Token), ElevenLabs e o modelo (OpenRouter) vêm do cofre da conta,
  preenchidos na configuração inicial (etapas modelo, voz e telefonia) ou em
  /config/integracoes. Nenhuma função depende de conta ou chave de quem opera
  a instalação: não há chave de modelo da instalação, `inbound-twiml` confere
  a assinatura com o token da conta, e `telephony-connect` (OAuth com um
  aplicativo Twilio da instalação) fica desligado sem `TWILIO_CONNECT_APP_SID`
  e nenhuma tela o chama. Variável de ambiente que sobra é configuração
  interna da instalação (`SUPABASE_*`, `SARAH_INTERNAL_SECRET`,
  `SARAH_TOOL_SERVER_KEY`, `SARAH_VOZ_WEBHOOK_SECRET`) ou opcional.

- **Estado de provedor externo tem quatro valores, não dois.** `conectado`,
  `nao_configurado` (falta chave), `erro` (a chave foi recusada, ou a conta lá
  está sem saldo) e `indisponivel` (o provedor não respondeu). Juntar os dois
  últimos joga em quem administra a conta um problema que não é dele: `erro`
  pede ação, `indisponivel` pede só que se teste de novo. `testando` é estado
  da tela enquanto o pedido viaja, e por isso não existe no servidor.
- **Catálogo de provedor é dado, não `switch`.** `integrations-status/provedores.ts`
  lista id, rótulo, fornecedor, chaves exigidas, caminho de configuração e o que
  cada um bloqueia. Provedor novo entra na lista e nasce com cartão, com estado
  e com teste. A resposta carrega o caminho de configuração inclusive quando
  está conectado, para a tela não ter que saber a rota.
- **A resposta carrega as chaves exigidas**, cada uma com nome do cofre, rótulo
  em português e `preenchida` (há valor, nunca qual). É por elas que a tela
  desenha os campos: com catálogo próprio do lado da interface, chave nova de um
  provedor nasceria sem campo onde cadastrá-la.
- **Código de provedor se traduz e morre na borda**, como o código do banco
  (`erros.ts`). `invalid_api_key` não diz nada a quem administra a conta; "a
  chave foi recusada, gere outra e substitua" diz. O par da regra é o teste:
  nenhuma frase pode conter o código que a gerou, e o corpo serializado é
  varrido atrás dele.
- **"O valor nunca sai" vira conferência, não disciplina.** A função resolve a
  credencial, entrega à sonda e, antes de responder, procura cada valor
  resolvido dentro do corpo serializado. Se achar, levanta, e o pedido inteiro
  vira `falha_interna` — é melhor não responder do que vazar. Um rótulo de cota
  ecoado pelo provedor bastaria para furar a regra em silêncio.

- **Telefone se normaliza num lugar só.** `_shared/telefone.ts` é quem decide o
  que vira `+5548999998888` e o que é recusado; `_shared/ddd.ts` é a tabela dos
  67 DDDs, e é dela que saem tanto a recusa por DDD inexistente quanto a
  resolução de cidade, estado e fuso. Toda entrada de lead — planilha, endereço
  público, cadastro manual — passa por lá antes de tocar `leads.phone_e164`, que
  é único por conta: normalização diferente em dois caminhos é duplicata
  gravada. O retorno é união discriminada com `motivo` em código, seguindo "a
  decisão é do banco; a frase é da borda" — aqui a decisão é do módulo portável
  e a frase mora em `app/src/copy/` e na resposta da função.

- **O fuso do lead sai do DDD, e são cinco zonas.** `_shared/ddd.ts` guarda
  cidade de referência, UF e zona IANA dos 67 códigos, e o conjunto de zonas é
  fechado em cinco (`America/Sao_Paulo`, `Manaus`, `Rio_Branco`, `Campo_Grande`,
  `Cuiaba`). O país tem mais identificadores do que fusos — `America/Belem` e
  `America/Fortaleza` são UTC−3 sem horário de verão, iguais a São Paulo —, e
  fechar o conjunto é o que torna a tabela conferível por varredura. DDD que não
  existe devolve `null`, e `null` não é erro: quem chama é que decide cair no
  fuso da conta, e a escolha muda entre planilha, endereço público e cadastro.
  A tabela é `Map`, não objeto literal: busca por chave vinda de fora em objeto
  acha `constructor` na cadeia de protótipos e resolve para lixo.

- **Etapa que não grava tem porta só de leitura, e o dublê é que prova.**
  `PortaDeImportacao`, da prévia de `leads-import`, tem uma operação. O dublê do
  teste é um `Proxy` que registra **todo** membro tocado, e o teste cobra que a
  lista seja exatamente `['telefonesExistentes']` — assim uma escrita futura
  aparece mesmo com nome que a interface ainda não tem. Comentário prometendo
  "aqui não se grava" não impede chamada nenhuma.
- **A porta recebe os candidatos, não devolve a base.** `telefonesExistentes`
  pergunta quais destes mil a conta já tem, em vez de carregar os leads da
  conta: uma consulta por prévia, nenhuma por linha, que é o que mantém mil
  linhas dentro do tempo de CPU da borda (P-05).
- **Classificação de linha é exclusiva.** Válido, inválido e duplicado somam o
  total de linhas, e duplicado ainda se parte em `duplicado_no_arquivo` e
  `duplicado_na_base` — um é erro de quem montou a planilha, o outro é escolha
  entre ignorar, atualizar e criar (RF-103). Número que se sobrepõe não se
  confere de cabeça, e a prévia existe para ser conferida de cabeça.
- **Nome de coluna de planilha se compara normalizado**, nunca literal:
  `normalizarNomeDeColuna` tira acento, caixa e separador, e o catálogo de
  apelidos (`APELIDOS`, em `leads-import/previa.ts`) é dado, escrito uma vez com
  acento e espaço. Coluna que não casa fica sem destino e não é erro; quem
  importa corrige pelo mapeamento, que sempre vence o palpite.
- **O lead que sai da borda usa as chaves de `public.leads`** (`name`,
  `phone_e164`, `city`), não nomes em português. Ele segue direto para
  `registrar_lead(p_lead jsonb)`, e tradutor no meio do caminho é onde nasce
  coluna que se perde em silêncio.

- **Duas etapas no mesmo endereço se separam por `acao`, não por função.**
  `leads-import` atende `previa` e `confirmar` em `atenderImportacao`
  (`confirmacao.ts`), com **uma** porta que já tem as escritas —
  `PortaDeConfirmacao extends PortaDeImportacao`. É o contrário do que a
  intuição pede, e é de propósito: com porta só de leitura na prévia, "a prévia
  não grava" seria verdade por falta de método; com a porta inteira, a prévia
  **tem** onde escrever e o dublê mostra que ela não escreveu.
- **A confirmação recalcula a prévia; ela não a recebe pronta.** O corpo traz a
  planilha e o mapeamento que o operador aprovou, nunca os leads montados.
  Aceitar lead pronto do navegador é aceitar telefone que não passou por
  `_shared/telefone.ts` e decidir duplicata pelo estado da base de minutos
  atrás — quem decide é o índice parcial, na hora da escrita.
- **Gravação em lote é lote de verdade, e o teste conta as ondas.**
  `TAMANHO_DO_LOTE` é 100: os lotes vão um após o outro e as linhas de um lote
  vão juntas. O dublê registra quantas chamadas estavam no ar a cada onda e o
  teste cobra `[100, 100, 50]` para 250 linhas; sem isso, trocar o laço por um
  `Promise.all` sobre mil linhas passaria verde.
- **Erro é da linha, com `try` por linha.** Relatório de importação tem quatro
  desfechos (`criado`, `ignorado`, `atualizado`, `erro`) e eles somam o total de
  linhas, como os três da prévia. Falha que não é de linha nenhuma — o evento de
  trilha que não entrou depois de o lead nascer — viaja em lista à parte
  (`semRegistroDeImportacao`), porque chamá-la de erro mentiria sobre o lead.
- **Frase por código, uma vez por resposta.** Relatório de mil linhas carrega o
  código em cada linha e o dicionário `frases` no corpo, com as frases dos
  motivos que apareceram e só deles (`frasesDosMotivos`, em `respostas.ts`).
  Frase por linha repetiria a mesma sentença mil vezes.
- **Código que o RPC levanta se reconhece por palavra da `message`, nunca do
  `detail`.** `raise exception 'telefone_invalido'` chega à borda como
  `message`; o `detail` é prosa para log e não decide nada. O que não casar vira
  `falha_ao_gravar` — mensagem de Postgres não sai da borda, e o teste varre o
  corpo serializado atrás dela.
- **Borda que grava em nome de quem chamou monta o cliente com o
  `Authorization` da requisição, não com a chave de serviço.** `leads-import`
  recebe `contaId` no corpo, e corpo é do cliente: é `auth.uid()` que
  `registrar_lead` confere para saber se quem chamou é operator da conta. Com a
  chave de serviço, qualquer sessão autenticada gravaria em qualquer conta.
  `invite-accept` usa a chave de serviço porque quem chega ainda não é membro de
  nada — a diferença é essa, e não preferência.
- **`in` do PostgREST tem teto de tamanho de URL.** Mil telefones num filtro só
  viram uma URL recusada; `leads-import/index.ts` fatia em 200 por consulta.### Tempo e fuso em módulo portável

`_shared/agenda/horarios.ts` é o primeiro módulo desta base que faz conta de
calendário, e o que ele resolveu vale para todo o resto da agenda:

- **Relógio de parede não vira instante por soma de minutos.** "Toda terça das
  9 às 12" tem que ser recalculada em cada dia, no fuso do especialista: em dia
  de mudança de horário de verão, o mesmo 09h00 cai uma hora antes ou depois em
  UTC. A conversão é passagem dupla (aplicar o deslocamento do palpite, depois o
  do destino) mais uma conferência lendo o relógio de volta; quando ela não
  bate, o relógio pedido não existiu naquele dia e a regra é **adiantar** até
  ele voltar a existir, nunca recuar para o dia anterior.
- **Contagem por dia se faz no fuso de quem tem o limite.** Teto diário contado
  por dia de UTC erra o dia inteiro em todo fuso negativo: uma reunião das 21h
  em Manaus já é do dia seguinte em UTC. O mesmo vale para qualquer "quantos
  neste dia" que a agenda vier a precisar.
- **Texto que a Sarah fala não sai do `Intl`.** `formatToParts` entra só para os
  números (`year`, `month`, `hour`…, com `hourCycle: 'h23'` e `% 24` porque
  meia-noite sai como 24 em alguns ICU); os nomes de dia e de mês são arrays em
  português no módulo. Frase montada por `dateStyle` muda com a versão do ICU da
  máquina, e o teste que a fixa passa a reprovar por atualização de Node.
- **`[)` no código espelha `[)` no banco.** A comparação é
  `inicio < outro.fim && outro.inicio < fim`. Trocar por `<=` faz o gerador
  recusar o que a restrição de exclusão de `specialist_blocks` aceita, e o
  sintoma é um horário que some sem explicação.
- **Precedência entre motivos mora numa tabela só**, percorrida em ordem, nunca
  espalhada em `if` pelo corpo — espalhada, ela vira ordem de escrita e muda sem
  ninguém decidir nada. A regra de desempate é a mesma de `secrets.ts`: ganha a
  causa que leva a uma resposta diferente de quem lê.
- **Varredura que tem teto de resultado para quando o enche**, e o que vem
  depois não entra como recusa: motivo inventado para candidato não examinado é
  pior do que ausência. O que se prova, então, é que a lista de descartes fica
  vazia no caso feliz.
- **Laço sobre calendário leva teto de voltas.** A saída é sempre pela data, mas
  laço sem teto em código que roda na borda é uma trava de produção esperando um
  fuso que ninguém previu.

### Decisão em módulo portável

`_shared/agenda/roteamento.ts` decide para quem vai a reunião e não escreve
nada. O que ele resolveu vale para todo módulo que escolha alguém:

- **Quem decide não grava.** Avançar `specialists.last_assigned_at` é de
  `agendar_reuniao`, na transação do agendamento. Resolver o rodízio com um
  efeito colateral no módulo faria a marca avançar a cada consulta de horário, e
  a distribuição passaria a depender de quem olhou a agenda. A fronteira se
  declara no teste com a entrada congelada (`Object.freeze`), não em comentário.
- **Ordem determinística não tem sorteio nem `localeCompare`.** O desempate é
  comparação crua de texto (`a.id < b.id`): `localeCompare` depende do ICU da
  máquina, e a mesma conta ordenaria diferente em dois ambientes — o mesmo
  defeito do sorteio, só mais difícil de ver.
- **Conferência de entrada é ansiosa, nunca incidental.** Validar dentro do
  comparador não vale: com um candidato só, `sort` nem o chama, e o dado
  corrompido passa calado até o dia em que aparecer um segundo.
- **Check do banco se espelha no módulo.** `(routing_mode = 'fixed') =
  (fixed_specialist_id is not null)` vira duas exceções no código, para a
  configuração que o banco recusa não passar por outro caminho e cair calada no
  modo errado.
- **Excluir vem antes de aplicar a regra.** Quem está inapto (desligado, sem
  faixa no horizonte) sai da lista antes de o modo ser aplicado, nos três modos.
  Modo que escolhesse gente inapta empurraria a recusa para a camada seguinte,
  onde ela chega sem nome — só como lista vazia.
- **Motivo de recusa e motivo de exclusão são duas listas.** A recusa diz por
  que a conta não roteou ninguém (é o que a Sarah e a fila de exceções leem); a
  exclusão diz, candidato a candidato, por que cada um saiu (é o que a tela de
  quem administra a conta lê). Fundi-las perde uma das duas leituras.

### Calendário externo por porta

`_shared/agenda/calendario.ts` é a `PortaDeCalendario` (ler a ocupação,
conferir um horário, criar e apagar o evento) e `calendario-google.ts` é o
adaptador, portável, com o `fetch` entrando por `buscar`. O `index.ts` de quem
usa (`cron-calendar-sync`, `tool-book-meeting`) só resolve o token por
`resolverTokenDoCalendario` (cascata de `secrets.ts` com a linha de
`specialist_calendars` como recurso; `segredoDoRecurso` lê o Vault por
`refresh_secret_id`), lê o par do aplicativo do ambiente e passa o `fetch`.

- **A porta não levanta, exceto por defeito de quem chama.** Falha do provedor
  volta como `FalhaDoCalendario` com estado, motivo e frase; janela em data
  local ou sem duração levanta, conferida por `protegerPorta` antes da ida,
  para não virar `sem_resposta` falso.
- **`erro` e `indisponivel` se separam por quem age.** Aqui `limite_de_taxa` é
  `indisponivel`, ao contrário da tabela da F0: a conexão do calendário não tem
  plano a trocar. `sem_permissao_de_calendario` é `erro` com frase de espera,
  e é o estado de toda conta enquanto P-04 não sai.
- **O evento tem id derivado da reunião** (`idDoEvento`): o 409 da segunda
  criação é o mesmo evento, e a idempotência da US-172 vem do provedor, sem
  leitura antes.
- **Página sem fim é falha, não meia agenda**: ocupação truncada faria horário
  ocupado parecer livre, e a rotina deve manter o retrato anterior.
- **O par do OAuth é `calendar-connect` (jwt) e `calendar-callback`
  (pública).** A volta se autentica pelo `state` de
  `_shared/agenda/estado-da-conexao.ts`, assinado com `CHAVE_DO_SERVIDOR`, a
  mesma chave da telefonia: por isso a carga leva um **propósito**, e `state`
  de outra borda não confere aqui. Assinatura válida prova origem, não
  situação atual — a volta confere de novo o especialista na conta e o papel de
  quem clicou. Endereços e escopos do Google moram em `calendario-google.ts`
  (`montarEnderecoDeAutorizacao`, `trocarCodigoPorToken`); o endereço de volta
  vem do ambiente, nunca do pedido.
- **Segredo com nome determinístico no Vault sobrevive à linha que aponta para
  ele.** `vault.secrets.name` é único, e apagar `specialist_calendars` não
  apaga o segredo: `conectar_calendario_do_especialista` procura pelo nome antes
  de criar, senão a reconexão depois de uma desconexão colide. RPC novo que
  grave segredo com nome derivado faz o mesmo, e o teste de banco cobre
  desconectar e reconectar.
- **O evento da reunião é `_shared/agenda/evento-da-reuniao.ts`, e as duas
  bordas que o criam passam por ele.** `tool-book-meeting` cria depois do
  insert, na mesma requisição, e nada da etapa muda a resposta;
  `cron-calendar-sync` é a segunda via, a cada passagem pelo calendário do
  especialista. Recuo e teto moram no módulo (`RECUO_EM_MINUTOS`,
  `TETO_DE_TENTATIVAS`), e a tela lê a desistência por `eventoDesistiu`, nunca
  repetindo o número. A leitura da linha é uma só:
  `SELECAO_DA_REUNIAO_PARA_EVENTO` mais `lerReuniaoParaEvento`.
- **O caminho padrão é o endereço iCal** (`_shared/agenda/calendario-ical.ts`),
  e o OAuth do Google é o avançado, desligado sem `SARAH_GOOGLE_CLIENT_*`. O
  endereço secreto vai para o Vault por `conectar_calendario_ical` (sessão do
  administrador, delega a `conectar_calendario_do_especialista` com
  `provider = 'ical'`), e `cron-calendar-sync` o lê por `token_do_calendario`,
  fora da cascata de `secrets.ts`. O parser cobre VEVENT com DTSTART/DTEND ou
  DURATION, UTC, TZID IANA ou do Windows, data inteira, RRULE (FREQ, INTERVAL,
  COUNT, UNTIL, BYDAY, BYMONTHDAY), EXDATE e RECURRENCE-ID, com a série
  andando no relógio de parede do fuso do evento; fixture nova entra em
  `calendario-ical.test.ts`. É só leitura: a rotina pula as etapas do evento
  para `PROVEDORES_SO_DE_LEITURA`, e a reunião chega à agenda pelo `.ics` do
  convite. A tela só mostra o botão do Google quando `calendar-connect`
  responde `autorizar`, e o cartão do calendário em /config/integracoes só
  aparece com alguma chave cadastrada.
- A prova contra o Google é `scripts/sonda-do-calendario.ts`
  (`check:calendario`, dentro de `check:full`), que sai com zero sem
  `SARAH_GOOGLE_CALENDAR_REFRESH_TOKEN`.
- **O convite por e-mail é `_shared/agenda/convite-de-reuniao.ts`**, sobre a
  `PortaDeEmail` de `_shared/email/email.ts` (adaptador em `email-resend.ts`,
  chave e remetente **da conta** pelo cofre em `abrirEmailDaConta`, provedor
  `email`, chaves `api_key` e `remetente`; nada de remetente da instalação).
  Conta sem e-mail configurado (`MOTIVOS_DE_CONFIGURACAO`) não conta
  tentativa: o convite espera uma hora, a tela o lê por `faltaEmailDaConta`
  ("convite não enviado: configure o e-mail em Integrações") e ele sai
  sozinho depois da configuração. Mesmo desenho do evento, com duas
  diferenças: a entrega é **por destinatário** (quarteto `*_invite_*` para
  `lead` e `specialist` em `meetings`, com os nomes vindos de
  `colunasDoConvite`), e a segunda via é rotina própria (`cron-meeting-invite`),
  porque especialista sem calendário nunca passaria por `cron-calendar-sync`.
  Dentro de `tool-book-meeting` evento e convite correm juntos
  (`Promise.all`): o orçamento do esqueleto corre a execução inteira, e
  estourá-lo faz a Sarah dizer a frase de contorno sobre reunião marcada. A
  reivindicação deixa de fora a reunião nascida há menos de dois minutos, que
  ainda é da ferramenta. A tela lê o estado por `situacaoDoConvite`.

### Chave de idempotência

`_shared/chamada/idempotencia.ts` forma e decompõe a chave de discagem, e é a
única receita: `calls.idempotency_key` tem único por conta e
`dial_queue(source, source_ref, attempt)` também, e os dois só valem se as seis
fontes escreverem a chave do mesmo jeito.

- **"Devolve sempre a mesma chave" se prova com o relógio adiantado**, nunca com
  duas chamadas seguidas: `Date.now()` responde igual duas vezes dentro do mesmo
  milissegundo, e o teste ingênuo passa com o gerador já quebrado. `vi.useFakeTimers()`
  mais `vi.setSystemTime()` entre as duas chamadas é o que torna a sabotagem visível.
- **Fonte de fatia futura entra no formato agora.** Mudar o formato depois que a
  rotina já enfileirou perde a unicidade justamente onde ela mais importa — as
  rotinas que repetem o mesmo alvo. A lista fechada aqui é a mesma do `check` de
  `dial_queue.source`.
- **O gerador lança e o leitor devolve código.** Entrada malformada no gerador é
  defeito de quem chama (o uuid vem do banco ou de borda que já validou), e
  seguir com chave torta desliga o único do banco; chave malformada na leitura é
  dado que já está gravado, e quem a lê precisa de motivo, não de exceção.

### Borda de decisão do banco

`_shared/discagem/guarda.ts` normaliza o telefone, chama `guard_dial` por uma
porta e traduz a decisão. É o modelo para toda borda que fala com uma função que
já decide sozinha:

- **A borda não reconta o que a função contou.** Teto, janela e intervalo ficam
  no SQL, na mesma transação em que ele grava (T-05); reimplementá-los aqui
  daria uma segunda verdade que passa a divergir da primeira sem ninguém notar.
  A regra vira teste varrendo o fonte do módulo atrás de comparação
  (`/\s[<>]=?\s/`, que não casa com `=>` nem com genérico) e de contagem
  (`.length`, `.filter(`, `.reduce(`). Comentário prometendo "aqui não se conta"
  não impede conta nenhuma.
- **Falha da consulta é recusa, e nunca liberação.** Porta que levanta, motivo
  que o mapa não conhece e liberação sem o dado que a torna acionável
  (`phone_line_id`) caem todos num motivo próprio de indisponibilidade. Guarda
  que libera quando quebra não é guarda — e o mapa de códigos fechado é o que
  faz motivo novo no SQL aparecer como ruído em vez de virar ligação.
- **Toda recusa tem frase e alternativa** (RF-407), e o código que a gerou não
  sai no corpo: a varredura do teste é sobre o **corpo serializado**, e não só
  sobre a mensagem, porque código vaza por qualquer campo. O par disso é o
  motivo em português ser diferente do código em inglês — com os mesmos nomes
  dos dois lados, a varredura não teria como separar um do outro.
- **Frase que outro módulo já sabe montar se importa, não se reescreve.** A
  janela vem de `janela.ts` inteira, e o horário do intervalo mínimo vem de
  `horaNoFuso`, exportado de lá para isso. Escrever `09:30` na frase seguinte à
  que diz `9h30` é a forma barata de descobrir que havia duas.
- **O portão da fatia tem regra portável própria**, em
  `_shared/discagem/portao.ts` (`faltaParaAbrir`): a borda a usa para dizer na
  recusa o que falta, e o discador (`app/src/chamadas/portao.ts`) para só
  oferecer número de teste. Quem recusa de verdade continua sendo o passo 2 de
  `guard_dial`; o módulo só evita duas versões de "o que falta".
- **`dados` de `jsonb` se lê conferindo.** O tipo dele é promessa de quem o
  montou; cada leitura devolve `null` quando não for texto ou número finito, e a
  frase cai na versão sem número. `undefined` impresso no meio de uma sentença é
  pior do que a sentença genérica.

- **Função nova precisa de bloco em `config.toml`** quando o padrão de JWT não
  serve, com o motivo escrito ali. O conjunto das que chegam sem JWT é fechado e
  tem teste: `testes/estatica/portas-das-funcoes.test.ts` cobra que o conjunto
  seja exatamente o declarado em `PUBLICAS` e que cada bloco traga o motivo.
  Função pública nova passa por lá, e a passagem obriga a escrever quem
  autentica no lugar do gateway. Errar esse bloco não aparece em teste de
  unidade nenhum: sobrando, a função fica aberta; faltando, ela recusa todo
  pedido legítimo com o 401 cru do gateway.

- **Borda que autentica por segredo de portador devolve um 401 só.** Em
  `lead-intake`, chave ausente, malformada e desconhecida têm o mesmo status, o
  mesmo motivo e a mesma frase, e o teste compara os corpos serializados byte a
  byte. Frases diferentes contam a quem tenta chaves que uma delas chegou perto.
  A conferência final do hash é `chaveConfereComOHash`, em tempo constante — e
  ela é também a rede que pega uma porta de dados que troque a igualdade por
  `like` e passe a resolver conta por prefixo de chave.
- **Malformado morre antes do banco.** O formato da chave se confere com regex
  na borda, e só o que passa vira consulta. A diferença de tempo entre isso e
  uma chave bem formada porém desconhecida não conta nada sobre conta nenhuma: o
  que precisa ser indistinguível é conta que existe de conta que não existe.
- **Limite de taxa vem depois da autenticação, e o recusado não conta.** O
  limite é por conta (L-02), então precisa da conta resolvida — e quem chega sem
  chave não consome cota de ninguém. Contar o pedido recusado transformaria o
  limite em bloqueio: um formulário com laço de retentativa renovaria a janela a
  cada tentativa e ficaria fora pelo tempo que insistisse. A prova disso só
  discrimina depois de os aceitos saírem da janela, e com teto pequeno — antes
  disso a espera é ditada pelo mais antigo dos aceitos nos dois desenhos.
- **Tempo em regra de borda entra por parâmetro** (`agora: () => number`), e o
  teste avança o relógio à mão. Sem timer falso e sem espera.
- **Janela de taxa em memória de isolado é aproximação declarada.** A função de
  borda roda em mais de um isolado sob carga, então 60 por minuto é 60 por
  isolado. Está escrito em `limite-de-taxa.ts`, com qual é o teto que segura o
  custo de verdade (RF-010, da F2). Aproximação não escrita vira promessa.
- **Código de outro módulo não sai no corpo da resposta.** `lead-intake` devolve
  `motivo: 'telefone_invalido'` e a frase do defeito; `celular_sem_nono_digito`
  fica dentro da borda. O par da regra é a varredura: **toda** resposta do teste
  passa por um auxiliar que serializa o corpo e procura os seis códigos. A
  varredura é grosseira de propósito, e o preço é a prosa não poder usar a
  palavra `vazio` — daí "os campos em branco foram preenchidos".
- **Corpo que vem de formulário de terceiro se lê por apelido, nunca por chave
  exata.** `APELIDOS`, em `lead-intake/entrada.ts`, aceita `nome` e `name`,
  `telefone` e `phone`; chave que não casa é ignorada e não é erro, porque
  formulário real manda `utm_source`, o token do captcha e o nome do botão
  junto. Valor que não é texto nem número finito conta como ausente.
- **`source` é do produto, não do cliente.** A coluna distingue os caminhos de
  entrada (`import`, `intake`, `manual`), então a borda a escreve e o que o
  formulário chamou de origem vai em `source_ref`. Deixar o cliente escrever em
  `source` faria a coluna deixar de distinguir coisa nenhuma.
- **Orçamento do que é nosso, e não do que é da rede.** O critério de RF-107 é
  de 2 s ponta a ponta, que não se mede em processo: o teste cobra 50 ms do
  caminho portável (hash, normalização, tabela de DDD, montagem do lead) e a
  medição com rede, runtime Deno e Postgres real fica declarada como dívida do
  degrau 3.

- **O que a borda não consegue tornar atômico, ela torna ordenado.** Leitura e
  registro de auditoria são duas chamadas ao PostgREST, e não há transação que
  as envolva a partir de uma função de borda. A garantia que sobra — e que
  `lead-export` implementa — é a ordem: **o registro é gravado antes de a
  resposta sair, e registro que falha cancela a entrega**. Nunca há planilha na
  mão de alguém sem a linha correspondente na trilha. Fundir as duas coisas de
  verdade exigiria mover a leitura para dentro de um RPC `security definer`, e
  aí a leitura deixaria de acontecer sob a RLS de quem pediu, que é a fronteira
  que não se troca por conveniência. Aproximação não escrita vira promessa: o
  motivo fica no cabeçalho do módulo.
- **CSV que vai para planilha tem três armadilhas, e as três são silenciosas.**
  Sem marca de ordem de byte (`\uFEFF`), o Excel em português abre `São Paulo`
  como `S├úo Paulo`. Célula que começa com `=`, `+`, `-` ou `@` é fórmula, e um
  nome vindo de formulário aberto vira código executado na máquina de quem abriu
  o arquivo — o apóstrofo à frente desarma, e o preço (telefone em E.164 sai
  como texto) fica declarado. Aspas, vírgula, quebra de linha e espaço nas
  bordas pedem célula entre aspas, com as aspas do conteúdo dobradas, e a quebra
  de linha é CRLF. `lead-export/exportacao.ts` é o modelo, com as colunas em
  **dado** (`COLUNAS_DA_EXPORTACAO`) para o teste varrer em vez de repetir os
  títulos.
- **Teto de resposta é declarado, nunca aplicado em silêncio.** Recorte maior
  que o teto entrega o teto e diz quantas linhas ficaram de fora, pedindo
  recorte mais estreito — para isso a porta devolve as linhas **e** a contagem
  do recorte inteiro (`count: 'exact'`), que é o único jeito de saber o que não
  coube. Quando o corpo da resposta é um arquivo, o relatório viaja em
  cabeçalho, em ASCII e em código (`x-exportacao-motivo: teto_atingido`), nunca
  em frase: cabeçalho não é lugar de texto para gente.
- **Recorte de lista que duas pontas aplicam mora em `_shared/`.**
  `recorte-de-leads.ts` é lido pela lista (que monta a consulta) e pela
  exportação (que precisa devolver exatamente aquelas linhas); declarado nos
  dois lugares, ele diverge na primeira correção e a divergência aparece como
  planilha que não bate com a tela — o pior jeito de descobrir, porque ninguém
  confere 1.200 linhas. Filtro em formato errado é **recusado**, não descartado:
  `temperatura: 42` ignorado em silêncio exporta a conta inteira para quem pediu
  só os quentes. Chave desconhecida é a exceção e passa, porque barra de
  endereço e formulário carregam bagagem. E o domínio de `etapa`, `origem` e
  `temperatura` **não** se repete em TypeScript: é do banco, e valor que ele não
  conhece devolve zero linha, que é a resposta honesta.
- **Filtro em coluna de tabela embutida exige `!inner`.** No PostgREST,
  `select('..., pipeline_stages(label)')` com `eq('pipeline_stages.key', 'won')`
  filtra **o embutido**, não a linha-mãe: a etapa vem nula e o lead continua na
  resposta. Sem o `!inner`, quem pediu uma etapa recebe a conta inteira — e a
  lista de leads, que monta a consulta com o mesmo recorte, mostraria outra
  coisa. A junção vira `pipeline_stages!inner(label)` quando, e só quando, o
  filtro daquela coluna está presente.

### Fala da Sarah e camada 1 do playbook

`_shared/speech/` guarda as falas, um arquivo por propósito mais
`todos-os-propositos.ts` para as que valem nos quatro. `_shared/playbook/camada-um.ts`
é a camada 1: as regras travadas, como constante versionada, citando aquelas
falas. O que a experiência das duas deixou:

- **Fala é do servidor, e por isso mora aqui.** Quem a emite é a publicação no
  provedor ou a resposta de uma ferramenta, nunca o JSX. O registro é o da
  seção 4 de `docs/padrao-de-interface.md`: a fala nasce falada (frase curta,
  contração, a razão dita em voz alta) e o texto de interface nasce direto. A
  instrução ao modelo, que não é falada, fica em `instrucao`, e a fala em
  `falas` — a separação é o que permite varrer uma sem a outra.
- **Variante de roteiro sai do conjunto de ferramentas, nunca da fatia nem da
  data.** `escolherVariante(ferramentasDoProposito)` devolve `sem_agenda`
  enquanto `tool-availability` não estiver no conjunto. Quando a ferramenta
  entrar na publicação, o fechamento troca sozinho, e ninguém edita texto.
- **Constante de repositório que vira dado de auditoria precisa de versão
  conferida.** `calls.playbook_version_id` recupera a camada 2 do banco; a
  camada 1 só se recupera se o número da versão que valia estiver gravado com
  ela (RF-308). O par é `VERSAO_DA_CAMADA_UM` mais um histórico de hashes por
  versão, e três asserções: a versão corrente é a maior chave, o hash do texto
  canônico bate com o dela, e nenhum par de versões compartilha hash. Mudar o
  corpo sem subir a versão derruba a segunda; subir a versão sem mexer no corpo
  derruba a terceira. A versão viaja **dentro** do texto que o hash cobre.
- **Fala que a interface não deve ler mora em módulo próprio.** As das regras
  travadas da F3 (não perturbe, pedido de humano, pessoa errada) estão em
  `speech/regras-travadas.ts`, e `testes/estatica/falas-fora-da-interface.test.ts`
  reprova import direto dele a partir de `app/`; a tela as vê pelo texto
  compilado da camada 1. `todos-os-propositos.ts` não serve para isso, porque a
  tela de privacidade já o importa pelo aviso de gravação.
- **Regra da camada 1 que manda chamar ferramenta cita o nome exato**, e o
  teste confere cada `tool-*` e `end_call` citado contra
  `CATALOGO_DE_FERRAMENTAS` e `FERRAMENTAS_DE_SISTEMA`. Cada regra travada tem
  critério de avaliação em `CRITERIOS_DE_TODO_PROPOSITO` com requisito em comum.
  Subir `VERSAO_DA_CAMADA_UM` pede linha nova no histórico com o hash de
  `assinaturaDaCamadaUm()` (calcule com `node --input-type=module -e` importando
  o `.ts`), e nenhum teste de tela pode fixar o número da versão.
- **Regra da camada 1 que depende de ferramenta entra só quando a ferramenta
  está no conjunto do propósito**, como a variante de agenda. A qualificação
  antes de encerrar (`REGRA_DA_QUALIFICACAO`) e o critério
  `qualificacao_registrada` entram quando `exigeQualificacao(proposito,
  ferramentas)` responde sim (`_shared/qualificacao/obrigatoriedade.ts`);
  `regrasDoProposito` e `criteriosDoProposito` recebem esse booleano, e o texto
  canônico cobre propósito × variante × qualificação. Instruir a chamar
  ferramenta que a fatia não publica ensina o modelo a prometer o que ninguém
  executa.
- **Varredura por palavra tem buraco, e o buraco se acha sabotando.** O critério
  pedia procurar `/horário|agenda|marcar|agendar|reunião/i` nas falas sem
  agenda; a frase da própria regressão ("te mando um convite para amanhã às
  14h") não contém nenhuma delas. O que caracteriza a promessa é o **instante
  combinado**, então o segundo crivo procura hora de relógio, dia nomeado e as
  palavras com que um compromisso chega depois. Crivo copiado do critério sem
  ser sabotado passa verde e não prova nada.
- **Configuração que vira hash se serializa com as chaves ordenadas em todo
  nível.** `_shared/agente/compilador.ts` é o caso: `agents.voice_settings` é
  `jsonb`, e `jsonb` não promete ordem de chave nenhuma. Serializada na ordem em
  que chegou do banco, a mesma configuração dá dois hashes em duas leituras e a
  tela passa a dizer "alterações pendentes" para uma conta que não mudou nada.
  Lista continua em ordem: a ordem das ferramentas e dos critérios é conteúdo.
  O hash cobre **só campos nossos** — nada do que o provedor devolve entra, ou
  um campo novo do lado dele desatualiza todas as publicações de uma vez (R-06).
- **Crivo de varredura sobre catálogo se escreve pela propriedade do item, nunca
  pelo estado que a sabotagem muda.** A lista de ferramentas de agenda sai de
  `dependeDeAgenda` e não de `entraNa`: com o crivo pela fatia, mover
  `tool-availability` para a F2 a tiraria da lista de agenda no mesmo gesto em
  que a põe na publicação, e a varredura ficaria verde exatamente no caso que
  ela existe para pegar. Rode a sabotagem antes de acreditar na varredura.

### Publicação contra sistema sem transação

`agent-publish` publica quatro agentes, um por propósito, contra um provedor que
não tem transação. O que ela resolveu vale para toda borda que escreva dos dois
lados de uma fronteira:

- **Idempotência por hash, e o teste conta as chamadas.** Propósito cujo
  `published_hash` compilado é igual ao gravado não vai ao provedor e **não é
  gravado de novo** — é a ausência da escrita que mantém `published_at` medindo
  a última mudança em vez do último clique. Asserção sobre o resultado final
  passa verde com uma versão que republica tudo; o que discrimina é o dublê
  contar as idas.
- **A idempotência exige os três pedaços juntos**: hash igual, `status =
  'publicado'` e identificador do provedor presente. Hash igual com status de
  falha é tentativa que nunca foi ao ar, e hash igual sem identificador não dá a
  `call-place` para onde discar — pular a chamada em qualquer um dos dois deixa
  a conta parada achando que está publicada.
- **Falha de republicação não sobrescreve a linha do que está no ar.** A linha
  de `agent_publications` descreve o que o provedor tem **agora**, que continua
  sendo a versão anterior; marcá-la como `falha` a tiraria do índice parcial que
  `call-place` consulta, e republicar viraria parar de discar. A linha de
  `falha` só é escrita quando não havia publicação no ar. A divergência entre
  hash gravado e compilado já é o que faz `estadoDePublicacao` dizer
  `alteracoes_pendentes`.
- **Falha parcial tem desfecho por item, nunca um booleano só.** Três publicados
  e um em falha é o que a resposta diz, e o status HTTP continua 200: o pedido
  foi atendido, e o relatório é o corpo. Desfazer as três que deram certo porque
  a quarta caiu seria tirar do ar uma Sarah que funciona.
- **A tradução para o formato do provedor mora num arquivo só e fica fora do
  hash.** `agent-publish/formato-do-provedor.ts` é o único lugar do produto com
  os nomes do provedor; com eles dentro da configuração compilada, uma troca de
  versão da API dele mudaria o hash de todas as contas e as publicações
  apareceriam desatualizadas sem ninguém ter mudado nada (R-06).
- **Segredo derivado não se sorteia nem se guarda.** O `x-tool-secret` da conta
  é `HMAC(chave_do_servidor, account_id)`, em
  `_shared/segredo-de-ferramenta.ts`: uma chave na instalação, um segredo por
  conta, nenhuma linha nova e nenhuma leitura por invocação de ferramenta
  (T-18). Ele sai por necessidade, dentro da configuração publicada, e a chave
  do cabeçalho se chama `x-tool-secret` justamente porque o gatilho de redação
  de `integration_events` casa pelo **nome da chave**.
- **Quem recebe o `x-tool-secret` confere por `_shared/tools/segredo.ts`.**
  `conferirSegredo` recebe as contas candidatas e recalcula o segredo de cada
  uma (HMAC não se inverte), comparando os 32 bytes em tempo constante e sem
  sair no primeiro acerto. A chave anterior confere por 24 h contadas de
  `rotacionadaEm` (em ms), e a resposta diz `chave: 'vigente' | 'anterior'`
  para a borda registrar quem ainda usa a velha. As recusas são quatro nomes
  (`cabecalho_ausente`, `segredo_malformado`, `tamanho_diferente`,
  `sem_conta`), e nenhum retorno carrega o segredo apresentado.
- **Ferramenta do agente nasce de `criarFerramenta`** (`_shared/tools/esqueleto.ts`),
  e o que ela escreve é só o executor. O tratador confere o segredo contra
  `contasCandidatas()` (o `index.ts` serve de cache), procura a conversa **dentro
  da conta provada** (conversa de outra conta é o mesmo 404 da inexistente),
  confere propósito e campos obrigatórios, executa dentro de
  `ORCAMENTO_PADRAO_MS` (um segundo abaixo dos 5 s da publicação) e grava em
  `call_tool_invocations`. Falha do executor, prazo estourado e fala com uuid
  respondem 200 com `ok: false` e a frase de contorno de
  `_shared/speech/ferramentas.ts`; 401 e 404 não têm linha na tabela (ela exige
  `call_id`) e vão para o `log`. Os propósitos passados precisam bater com
  `CATALOGO_DE_FERRAMENTAS`, senão a criação levanta. Ferramenta implantada
  entra em `CARGAS` de `scripts/contrato-das-ferramentas.ts`, a suíte de
  contrato do degrau 3. No laço, os oito casos da seção 9.2 (carga válida,
  campo faltante, segredo inválido, conversa inexistente, propósito errado,
  oferta expirada, `23P01`, ensaio) moram numa suíte por família de
  ferramentas, com `contrato(ferramenta, caso, ...)` registrando a cobertura e
  toda fala varrida atrás de SQLSTATE, tabela e coluna lidas das migrações e
  código de provedor: `_shared/tools/contrato-da-agenda.test.ts` é o modelo.
  Caso que não se aplica à ferramenta vira o passo dela no mesmo roteiro (o
  `23P01` de `tool-availability` é a consulta seguinte não repetir o horário
  perdido), nunca caso omitido. As falhas provocadas levantam mensagens com
  esses termos, senão a varredura não tem o que achar.
- **O executor é `{ ler, efeitos }`, e o ensaio é decisão do esqueleto.** `ler`
  decide `data` e `speech` inteiros; `efeitos` age no mundo e não roda quando
  `calls.direction` é `rehearsal`. Nenhuma ferramenta escreve `if (ensaio)`:
  o que o ensaio deve pular vai para `efeitos`. `ler` recebe a porta de escrita
  trocada por um Proxy que levanta em qualquer acesso (`escrita_na_leitura` no
  registro), então a escrita chega sempre por `AmbienteDaFerramenta.escrita`,
  nunca por fechamento no módulo da ferramenta — senão o ensaio escreve de
  verdade sem teste nenhum cair.
- **Memória da conversa é `memoria`, não `efeitos`.** O que a ferramenta
  seguinte da mesma chamada lê (as ofertas de `tool-availability`, que
  `tool-book-meeting` resolve por posição) roda nos dois modos: T-16 lista o
  que o ensaio pula (reunião, calendário, e-mail, bloqueio), e sem a oferta o
  ensaio da marcação nunca acharia o horário. Só entra ali o que é lembrança da
  conversa; ato no mundo continua em `efeitos`.
- **Desfecho que só o efeito conhece volta do efeito.** `efeitos` pode devolver
  `ResultadoDoEfeito` (`ok`, `data`, `speech`, `erro`), que troca a resposta de
  `ler` e passa pelas mesmas conferências de fala. `tool-book-meeting` é o
  caso: só o insert sabe se o horário foi tomado no meio (23P01). `ler`
  continua decidindo o caminho feliz, que é o que o ensaio responde.
- **A leitura da ferramenta é fechamento; a escrita é o ambiente.**
  `tool-dnc/bloqueio.ts` é o modelo: `criarToolDnc(leitura)` devolve o tratador
  e `ler` consulta pela porta de leitura capturada; `efeitos` escreve pela
  `escrita` do ambiente. Escrita com idempotência em único parcial vai por RPC
  (`bloquear_numero_pela_ferramenta`), porque o `on_conflict` do PostgREST não
  repete o predicado do índice. Item de fila que nasce de ferramenta vai por
  `criar_excecao`, grant só para `service_role`. Toda ferramenta é
  `verify_jwt = false` e entra em `PUBLICAS` de `portas-das-funcoes.test.ts`.
  A `PortaDeFerramentas` sobre o Supabase é `criarPortaDeFerramentas`, em
  `_shared/tools/porta-do-supabase.ts`, que recebe o cliente por parâmetro
  (`_shared/` não importa `npm:`). O `SupabaseClient` não se compara com o
  recorte tipado pelo compilador (TS2589, genéricos do PostgREST), então o
  `index.ts` o passa `as unknown as ClienteDasFerramentas`, e as consultas se
  provam no teste do módulo com um cliente em memória. `tool-qualify/index.ts`
  ainda tem a sua cópia da porta, anterior ao módulo: trocá-la pelo módulo é
  dívida declarada no cabeçalho dela.
- **Descritor de ferramenta mora em `_shared/ferramentas/`.** Nome, descrição,
  campos, propósitos e prazo numa constante (`tool-qualify.ts` é o primeiro);
  `CATALOGO_DE_FERRAMENTAS`, `DESCRICOES_DAS_FERRAMENTAS` e o `criarFerramenta`
  da ferramenta leem dele, sem segunda lista. O teste do descritor lê a linha da
  tabela da seção 5 de `docs/PRD-implementacao.md` e cobra os propósitos
  exatos. Campo que não é texto declara `tipo` (`number`, `object`), senão o
  provedor manda texto. Provar o conjunto de uma fatia que ainda não subiu é
  `atenderPublicacao(..., { fatia: 'F4' })`, sem mexer em `FATIA_PUBLICADA`.
- **Ferramenta que pode responder vazio responde `ok: true`.** `tool-availability`
  sem horário, ou sem especialista para quem rotear, devolve lista vazia, a fala
  de agenda cheia e o motivo em código em `data.reason`: a assistente precisa de
  uma frase, e o registro precisa do porquê. E o efeito roda também no vazio —
  substituir as ofertas por nenhuma é o que impede "a segunda opção" de
  resolver um horário que ninguém acabou de ouvir.
- **Ferramenta decide, a de sistema age, e a fala diz o que vai acontecer.**
  `tool-transfer` devolve `transfer_number` ou `queued` e nunca afirma a
  transferência feita: quem move a chamada é `transfer_to_number`, depois da
  resposta. Pendência de configuração (destino ausente ou que não é telefone)
  vai como código no `context` do item da fila, e a tela da fila traduz; a
  conversa só ouve que alguém do time retorna. Fala de resposta de ferramenta
  que não é regra da camada 1 mora em arquivo próprio de `_shared/speech/`
  (`transferencia.ts`), para não mudar o hash da camada.
- **O conjunto publicado sai da fatia, e o teste o fixa em dado.**
  `FATIA_PUBLICADA` liga as ferramentas nossas (`CATALOGO_DE_FERRAMENTAS`) e as
  de sistema (`ferramentasDeSistemaDaFatia`); `ESPERADAS_POR_PROPOSITO` e
  `AINDA_FORA_DA_PUBLICACAO`, em `agent-publish/publicacao.test.ts`, são as
  listas exatas, e subir a fatia exige mexer nelas. Ferramenta nossa que entra
  na publicação precisa de linha em `DESCRICOES_DAS_FERRAMENTAS` (descrição e
  campos do corpo, com os mesmos obrigatórios do `criarFerramenta`), senão a
  compilação levanta; o teste de cada ferramenta cobra o par. A descrição entra
  no hash. `transfer_to_number` vai sem número fixo: o destino é a variável
  que a resposta de `tool-transfer` escreve (`DESTINO_DA_TRANSFERENCIA`).
- **Frente paralela não sobe `FATIA_PUBLICADA`; ela prova a fatia dela pela
  opção `fatia` de `atenderPublicacao`.** Subir o valor ligaria também as
  ferramentas de outra frente, que ainda não têm borda nesta branch. A F4 e a
  F5 fazem assim (`publicarNa(banca, 'F5')` em `publicacao.test.ts`), e quem
  sobe a fatia é a integração. Quando o alcance final da seção 5 chega a um
  propósito em fatia posterior à da ferramenta, o catálogo diz com
  `fatiaPorProposito` (`tool-availability` só chega a lembrete e resgate na
  F6); `propositos` continua sendo o alcance final, e é ele que o esqueleto
  confere na segunda linha.
- **Chave que é nossa não desce a cascata de `secrets.ts`.** A cascata existe
  para credencial *da conta*, e o degrau da plataforma nela é bloqueado em
  produção de propósito. A chave do servidor das ferramentas
  (`SARAH_TOOL_SERVER_KEY`) é da instalação inteira, e passá-la pela cascata
  faria uma conta assinar pedidos com uma chave que as ferramentas não
  reconhecem.
- **Segredo interno sem dono se deriva, e a variável continua vencendo.**
  `_shared/segredo-da-instalacao.ts` devolve a variável quando alguém a
  definiu e, sem ela, `HMAC-SHA256(SUPABASE_SERVICE_ROLE_KEY, rótulo)`, com um
  rótulo por uso. `tool-dnc` e `tool-transfer` já resolvem
  `SARAH_TOOL_SERVER_KEY` assim; `agent-publish` precisa passar pelo mesmo
  caminho para os dois lados concordarem (até lá, sem a variável, a publicação
  recusa, como sempre). O risco é a rotação da chave de serviço: o segredo
  derivado muda na hora, sem janela de dois segredos, e os agentes publicados
  param nas ferramentas até a republicação. Quem for rodar a chave de serviço
  define antes a variável com o valor derivado atual. `SARAH_INTERNAL_SECRET`
  não entra nessa regra: quem o manda é o `pg_cron`, lendo o Vault, e o banco
  não conhece a chave de serviço. Ele nasce no Vault, sorteado pela migração
  20261005100000 quando falta, e as funções o leem por
  `segredo_interno_da_instalacao()` (só `service_role`) com
  `leitorDoSegredoInterno` (`_shared/segredo-interno.ts`): a variável definida
  vence, e sem ela vale o Vault, guardado cinco minutos no isolado. Função nova
  que manda ou confere `x-internal-secret` usa o leitor, nunca
  `Deno.env.get('SARAH_INTERNAL_SECRET')` direto.
- **Configuração do workspace do provedor é passo à parte da publicação, e
  idempotente pela leitura.** `agent-publish/webhooks.ts` lê `convai/settings`
  e o webhook guardado no cofre; se os dois já apontam para nós, não escreve
  (o `workspace-dublado.ts` conta as idas). Webhook de fim só se cria quando
  falta, e a ordem é criar, guardar o segredo e só então apontar a
  configuração — segredo perdido com configuração apontada é todo aviso de fim
  no 401. Falha vira `webhooks.estado = 'falha'` com frase, nunca derruba os
  agentes. Credencial da plataforma pula o passo: o workspace é compartilhado
  e `?conta=` de uma conta desligaria as outras.
- **Configuração de instalação se cobra na publicação, não na primeira ligação
  que precisar dela.** Faltando a chave do servidor, a publicação recusa com
  motivo próprio (500, "avise o suporte") em vez de publicar sem o cabeçalho —
  que apareceria meses depois como "a Sarah não consegue transferir".

### Audição de voz e catálogo de provedor

`voice-catalog` lista as vozes em português e sintetiza a **primeira fala real**
da conta. O que ela resolveu vale para toda tela que deixe experimentar antes de
publicar:

- **Amostra é a frase de verdade, não a prévia do provedor.** O provedor devolve
  um `preview_url` pronto por voz, e usá-lo seria uma linha de código; só que
  ouvir uma frase de catálogo não diz nada sobre como a abertura da conta vai
  soar, que é a única coisa que quem escolhe a voz precisa julgar (RF-304). A
  prévia dele vai junto, como atalho, e quem decide é a amostra.
- **Marcador sem valor vira o lead da semente, nunca o nome da variável.**
  `{nome_do_lead}` não pode ser lido em voz alta como "abre chaves nome do
  lead": vira Marcos Ferreira, da Fluxo Cargo — o cenário de demonstração do
  produto inteiro. Marcador que ninguém conhece **some**, e a limpeza de espaço
  e vírgula órfã vem junto, senão "Oi, ! Aqui é a Sarah" é o que se ouve.
- **Os valores da amostra são os mesmos do compilador** (`nome_do_agente`,
  `empresa`, `nunca_afirmar`, com a mesma junção). A amostra existe para soar
  como a publicação; com uma segunda interpretação da abertura, ela viraria uma
  audição de outra coisa.
- **Ajuste fora da faixa é aparado, não recusado**, e o que se aplicou volta na
  resposta. O controle da tela é um cursor, e trocar a audição por uma mensagem
  de erro por causa de um centésimo é pior do que tocar o valor mais próximo —
  desde que a tela mostre qual foi.
- **Cache de catálogo sim, cache de amostra não.** A lista de vozes não muda a
  cada clique e ganha 60 s por conta, pelo mesmo relógio injetável do cofre; a
  amostra muda a cada ajuste, que é justamente o que se está experimentando.
  Falha do provedor **não** entra no cache — catálogo indisponível guardado por
  um minuto transforma "tente de novo" em um minuto de mentira.
- **O que impede a amostra não impede a lista.** Sem primeira fala escrita, voz
  fora do catálogo, provedor recusando a síntese: a lista responde e a pendência
  viaja ao lado, com a frase do que fazer. Recusar o pedido inteiro esconderia
  as vozes de quem abriu a tela para ver as vozes. Com o catálogo fora do ar não
  há pendência de amostra: repetir o motivo em dois campos faz a tela ter que
  escolher qual dos dois mostra.
- **Leitura de catálogo externo é defensiva por item.** Voz sem identificador é
  descartada e as outras continuam; o total recebido viaja na resposta, porque
  lista vazia com quarenta recebidas e lista vazia com zero recebidas são dois
  problemas com dois próximos passos diferentes.
- **Filtro de idioma olha três campos e aceita o rótulo em inglês.** Idiomas
  verificados, idioma do ajuste fino e sotaque; `brazilian` com z é o que o
  provedor escreve, e uma expressão regular só com a forma em português deixa de
  fora exatamente as vozes brasileiras.

### Número que atende, e quem atende por ele

`phone-register` registra o número conforme `phone_lines.inbound_behavior` e
`inbound-twiml` atende os dois comportamentos que o provedor de voz não serve
(T-14, RF-409). O que as duas resolveram:

- **Webhook que autentica por assinatura confere antes de ler o recurso, e
  recusa todos os casos pela mesma porta.** Ausente, malformada, inválida,
  conta inexistente, conta sem token e cofre fora do ar têm o mesmo status, o
  mesmo corpo e o mesmo tipo — `RECUSA_DE_ASSINATURA` é **uma** constante
  congelada, e não várias iguais, para a igualdade ser estrutural em vez de
  coincidência que alguém desfaz ao editar uma frase. E nenhuma delas chega a
  consultar o número chamado: sem isso, pedido forjado vira sonda de quais
  números a instalação atende, medida pelo tempo da resposta. O teste conta as
  leituras do dublê; comentário prometendo "aqui não se lê" não impede leitura
  nenhuma.
- **O token que confere é o da conta, e a conta vem no endereço.** A
  telefonia é a Twilio da própria conta, e o Auth Token está no cofre dela
  (`telefonia`/`auth_token`). `phone-register` cadastra o webhook como
  `inbound-twiml?conta=<account_id>` (`_shared/telefonia/conta-no-endereco.ts`
  escreve e lê o parâmetro), e a Twilio assina a URL **com a consulta**: trocar
  a conta no endereço exige o token da outra conta. A única leitura antes da
  assinatura é a do cofre, por uuid de conta, que não se enumera. Depois dela,
  a linha só atende se `phone_lines.account_id` for a conta do endereço —
  senão quem tem o próprio token assinaria um pedido com o número de outra
  conta e ouviria o destino do encaminhamento dela.
- **Linha registrada antes do `?conta=`** chama o endereço sem a consulta, e é
  conferida com `SARAH_TELEFONIA_AUTH_TOKEN` só se a variável existir; sem
  ela, recusa. Para migrar a linha, registre-a de novo. Como o registro é
  idempotente por destino, limpe antes o identificador gravado (`update
  phone_lines set provider_number_id = null where id = '<linha>'`) e peça o
  registro pela tela de números; o `VoiceUrl` novo já leva a conta. Endereço
  com a conta nunca aceita o token da instalação.
- **A receita da assinatura mora em `_shared/telefonia/assinatura.ts`**, e o
  teste dela usa um vetor calculado **fora** do repositório. Comparar a função
  com ela mesma passa verde com a ordem dos pares trocada, com o separador
  errado e com SHA-256 no lugar de SHA-1 — que são os três jeitos de errar isto.
  O tempo constante delega em `hashesIguais`: a receita tem um dono só, e a
  segunda cópia é a segunda chance de alguém trocar o laço por `===`.
- **Idempotência de registro se decide pelo destino, não pelo comportamento.**
  `forward` e `voicemail` produzem a **mesma** configuração no provedor — os
  dois apontam o mesmo webhook para o mesmo endereço, e quem decide entre
  encaminhar e dar o recado é `inbound-twiml`, lendo a linha a cada ligação. Por
  isso trocar um pelo outro é `inalterado`, e isso é correto. O destino vigente
  se lê do estado já gravado (`provider_voice_id` preenchido é a integração
  nativa; só `provider_number_id` é o webhook), e não de uma coluna que diga o
  destino: essa coluna existiria para ser esquecida num update.
- **Segredo que sai por necessidade se escreve no módulo, não se esconde.**
  Importar o número na integração nativa entrega o identificador e o token da
  telefonia ao provedor de voz, e não há como não entregar. "O valor nunca sai"
  vale para o navegador, e continua valendo por `conferirQueNaoVazou`. O par da
  regra é o teste que confere que o identificador **chegou** ao pedido de
  importação: sem ele, a declaração vira prosa que alguém apaga.
- **Espera de terceiro é estado, nunca erro** (P-04). "Aguardando aprovação da
  operadora" sai com 200 e frase própria, e a linha é gravada do mesmo jeito.
  Tratada como falha, a tela mandaria tentar de novo todo dia e o passo do
  checklist inicial nunca fecharia.
- **O nome da assistente nasce antes da empresa.** `agents.company_name` é
  anulável (nulo ou não em branco, `20261003100000_nome_antes_da_empresa.sql`):
  a primeira pergunta do tutorial grava só `name`. Quem cobra a empresa é
  `agent-publish` (`agente_incompleto`), e o passo `agente` de
  `passos_de_configuracao()` exige `company_name is not null`. Leitura de
  `agents` fora da publicação trata empresa nula como `''`, e a preposição
  órfã sai em `interpolarFala` ("Aqui é a Ana.", sem "da").
- **Nenhuma fala nem frase de recusa diz "Sarah".** A assistente se chama como
  a conta escolheu (`{nome_do_agente}` na publicação, `nomeDoAgente` nas portas
  de `onboarding-suggest` e `onboarding-interview`); sem nome, "a assistente".
  A única exceção é `NOME_SEM_ESCOLHA` da entrevista, para a conta que chegou
  lá sem nome gravado. A marca do produto é `_shared/marca.ts`.
- **Fala com marcador que pode não ter valor vira frase inteira, e não
  remendo.** `{nome_do_agente}` e `{empresa}` são nulos enquanto a conta não
  monta a Sarah; limpar o marcador vazio dentro da frase produz "Oi! Aqui é a,
  da." lido em voz alta numa ligação já no ar. A apresentação é uma frase só, e
  a ausência troca a frase por `apresentacaoSemIdentidade`. Marcador que some
  deixa buraco, e buraco no meio de uma frase não se remenda com expressão
  regular.
- **Quem atende ligação nunca responde 5xx.** Número desconhecido, comportamento
  divergente e banco fora do ar devolvem documento válido com uma frase em
  português e `<Hangup/>`. O erro faz a operadora tocar o aviso dela, que quem
  ligou entende como número errado.
- **Texto que entra em XML se escapa.** `agents.company_name` é escrito pela
  conta, e "Silva & Filhos" produz documento inválido que a operadora recusa
  inteiro — a ligação cai no tom de erro e ninguém liga uma coisa à outra. O
  dialeto da telefonia fica num arquivo só (`inbound-twiml/documento.ts`), como
  o do provedor de voz em `agent-publish/formato-do-provedor.ts`.

`_shared/provedor/` é onde mora o que toda borda que fala com provedor externo
usa: `erros.ts` (código bruto entra, frase em português sai) e `vazamento.ts`
(a conferência de que nenhum valor resolvido aparece no corpo). Os dois nasceram
dentro de `integrations-status` e saíram de lá na terceira cópia — regra de
segurança em três arquivos diverge no primeiro ajuste, e a cópia que divergir
para menos não avisa ninguém.
`resposta.ts` entrou no mesmo diretório pela mesma conta: o envelope de uma ida
ao provedor (`ok`, `codigo`, `status`, `latenciaMs`, `corpo`, `endpoint`) estava
escrito três vezes, e o que cada borda tem de próprio é só o identificador que
ela traz de volta. `EnvelopeDoProvedor` é a base; cada função a estende com o
campo dela.

### Caminho único de discagem

`call-place` é a única porta por onde sai ligação, e isso não é convenção:
`guard_dial` só tem `execute` para `service_role`, `calls` não tem política de
escrita pelo cliente, e o freio de emergência de RF-011 só é verificável porque
existe um lugar só onde ele é lido antes de discar.

- **Duas autenticações, exclusivas entre si** (T-04). O cabeçalho
  `x-internal-secret` decide qual portão vale: com ele é rotina (`actor='system'`,
  `actor_id` nulo, fonte **não** pode ser `manual`); sem ele é sessão de usuário
  (`actor='user'`, papel mínimo `operator`, fonte **tem** que ser `manual`). As
  duas travessias são recusa, e não normalização — `manual` vindo de rotina faria
  uma ligação automática aparecer na auditoria como clique de alguém que não
  estava lá. Com o cabeçalho presente a sessão **nem é lida**, senão a rotina
  herdaria o papel de quem por acaso mandou um JWT junto.
- **Instalação sem o segredo fecha o portão das rotinas, em vez de abrir.**
  Variável vazia comparada com cabeçalho vazio daria passagem a qualquer pedido.
- **A ordem é escrita e testada**: autentica e forma a chave → conta e lead →
  publicação do propósito e versão do roteiro → `guard_dial` → grava `calls`
  (`queued`) → dispara no provedor. Ordem se prova empilhando o nome do passo num
  array dentro do dublê, não por asserção sobre o resultado final.
- **A recusa da guarda não chega ao provedor**, e a prova é o dublê do provedor
  não ter sido chamado nenhuma vez. É a metade de borda do critério "recusa não
  consome crédito" da F2.
- **Falha do provedor depois do insert não é desfeita.** A linha fica `queued`,
  sem `provider_call_sid`, e quem a fecha é `cron-call-recovery`. Apagá-la
  perderia a chave de idempotência junto, e a rotina seguinte discaria de novo
  porque o único do banco não teria contra o que colidir. O corpo da recusa leva
  `chamadaId` justamente por isso.
- **Só `call_id` viaja como variável dinâmica** (T-25). O contexto é de
  `call-init`, que é a única fonte. O teste prova isso com um lead **com nome** no
  cenário e procurando o nome no pedido serializado: sem um nome no dublê, a
  asserção passaria com qualquer coisa.
- **`audit_log` desta borda é insert direto, e o motivo vai na coluna `reason`.**
  `set_config('app.audit_reason')` existe para `registrar_auditoria()` ler dentro
  da mesma transação do gatilho; aqui não há gatilho — `calls` muda o tempo todo
  durante a ligação e cada mudança de `status` viraria uma linha — e cada chamada
  da camada de dados abre a própria transação. A hora vem do `default now()` da
  coluna: escrevê-la daria à trilha o relógio de quem chamou.
- **`integration_events.correlation_id` é o identificador da chamada** (RNF-16), e
  o rastro é gravado inclusive quando o provedor recusa. Falha ao gravar o rastro
  **não** derruba a ligação: o corpo diz `semRegistro: true` e segue.

### Webhook do provedor de voz, e a fonte única de contexto

`call-init` é o webhook de início da conversa, e é a **única** fonte de contexto
da chamada (T-25): `call-place` manda `{ call_id }` e nada além. O que ela
resolveu vale para todo webhook que chegue de provedor externo:

- **A assinatura cobre o corpo cru, e o `JSON.parse` vem depois dela.** O
  `index.ts` lê `requisicao.text()` e passa o texto adiante; quem parseia é o
  módulo portável, já com a assinatura conferida. Reserializar o objeto
  parseado para recalcular o HMAC reordena chave e reescreve escape, e **toda**
  assinatura legítima passa a falhar — defeito que só aparece em produção, como
  provedor cujo webhook "parou de funcionar".
- **A receita mora em `_shared/provedor/assinatura-de-webhook.ts`**, e é
  diferente da da telefonia: HMAC-SHA256 sobre `<t>.<corpo>`, com o instante
  dentro do texto assinado e janela de tolerância. O instante é o que impede
  repetição tardia sem estado nenhum do nosso lado; a janela vale nos **dois**
  sentidos, porque relógio de provedor adiantado é o caso comum e recusá-lo
  derrubaria a finalização de uma ligação que aconteceu. Ausente, malformada,
  fora da janela e inválida saem pelo mesmo `false`, e quem chama responde o
  mesmo 401 para as quatro.
- **Sentido de chamada se descobre pelo que só um dos caminhos produz**, nunca
  por um campo que o remetente declare. Só a saída passou por `call-place`, e só
  `call-place` põe `call_id` nas variáveis dinâmicas: a presença dela é o
  critério. Confiar num `direction` do corpo faria uma ligação recebida se dizer
  de saída e ir procurar uma linha em `calls` que não existe.
- **Na entrada, a chamada nasce aqui** (T-14, RF-108), e a ordem é linha pelo
  número chamado → lead por quem ligou → `calls` gravada, antes de qualquer
  fala. Sem a linha, a primeira ferramenta que a Sarah chamasse devolveria
  "conversa inexistente": as sete resolvem a chamada por
  `provider_conversation_id`. Quem impede a segunda linha é o índice único
  global dessa coluna, e não a chave de idempotência — a chave existe porque
  `calls.idempotency_key` é `not null`, e é derivada da conversa para nunca
  colidir.
- **Resolver-ou-criar lead é `registrar_lead` com `ignorar`, numa ida só.** Ler
  antes de escrever deixa a janela em que duas ligações do mesmo número chegando
  juntas criam dois leads. `ignorar` e não `atualizar`: quem liga não está
  mandando cadastro, e a cidade de referência do DDD não pode sobrescrever a
  cidade que a planilha do cliente trouxe.
- **Marcador que pode não ter valor vira frase inteira, e o número de frases é o
  número de combinações.** A abertura tem quatro em `_shared/speech/`: gravação
  ligada ou desligada, vezes lead com nome ou sem. É a mesma doutrina de
  `speech/atendimento-recebido.ts` levada ao caso em que são duas dimensões — e
  com a gravação desligada a abertura **não** promete gravação nenhuma, porque
  prometer o que não acontece é a única mentira que o produto não pode dizer em
  voz alta.
- **Campo de fatia futura entra no contrato vazio, com a razão escrita.** A
  reunião em jogo é sempre nula na F2 porque `meetings` é da F5; acrescentá-la
  depois faria quem já lê o contexto aprender uma segunda forma da resposta.
- **Webhook de provedor cadastrado por conta leva `?conta=`, e o parâmetro só
  escolhe o segredo.** `_shared/provedor/webhooks-da-conta.ts` monta e lê o
  endereço (uuid ou nulo, antes de qualquer consulta) e deriva o segredo do
  início. O webhook de início da ElevenLabs **não é assinado**: a credencial é
  `x-sarah-webhook-secret`, `HMAC(SARAH_TOOL_SERVER_KEY, 'inicio:' + conta)`,
  que `agent-publish` escreve em `request_headers`; o prefixo o separa do
  `x-tool-secret`. O de fim é HMAC com o segredo que a ElevenLabs devolve na
  criação, guardado em `account_secrets` (`voz` / `webhook_secret`, com
  `webhook_id` e `webhook_url` no metadado). Segredo da conta conferido, o
  pedido só alcança chamada e linha **dela** (a de outra conta é o 404, ou o
  200 de conversa desconhecida, da inexistente); errado, ausente e conta
  inexistente são o mesmo 401. O segredo da instalação continua valendo, sem
  restrição de conta.
- **Segredo que a borda recebe de provedor se grava por
  `gravar_segredo_pelo_servidor`**, só `service_role`: `set_account_secret`
  exige owner por `auth.uid()`, e quem publica pode ser admin. O metadado sem o
  valor sai por `metadado_do_segredo`.

### Webhook de fim, e quem finaliza

`call-events` recebe o aviso de fim do provedor e **aciona** `call-finalize`;
nunca escreve desfecho. O que ele resolveu vale para todo webhook que dispara
trabalho canônico:

- **Idempotência não se verifica na borda que aciona.** Perguntar "já foi
  finalizada?" antes de acionar é verificar-e-agir (T-15): dois avisos do mesmo
  segundo leem "ainda não" juntos. A porta de `call-events` não tem método que
  pergunte isso, e o teste prova que o segundo aviso toca a porta na mesma
  sequência do primeiro. Quem garante uma finalização só é a reivindicação de
  `call-finalize`.
- **Conversa desconhecida é 200, nunca 404.** O provedor reenvia o que não
  recebeu 2xx, e uma conversa que não é desta instalação nunca vai passar a
  existir. Falha nossa (finalização fora do ar, banco caído) é 503, porque aí
  reenviar é o que se quer.
- **Aviso sem chamada vai para o log, não para `integration_events`**: a
  coluna `account_id` é `not null`, e aviso sem chamada não tem conta. Aviso com
  chamada grava o rastro com `correlation_id` igual ao `call_id` e só o resumo
  do corpo — a transcrição não mora em tabela de observabilidade.
- **Rotação do segredo de webhook (R-07)**: `SARAH_VOZ_WEBHOOK_SECRET_ANTERIOR`
  confere por 24 h contadas de `SARAH_VOZ_WEBHOOK_ROTACIONADO_EM` (ISO 8601
  **com** fuso). Sem carimbo, ou com carimbo no futuro, o anterior não vale:
  janela sem começo valeria para sempre. `call-init` e `call-events` leem as
  mesmas variáveis.
- **O contrato de acionamento de `call-finalize`** é `POST` com
  `x-internal-secret` e corpo `{ call_id }`; 409 conta como acionada (outra
  passagem já reivindicou).

### Finalização canônica

`call-finalize` é a única que escreve o desfecho da chamada. O que ela resolveu
vale para toda rotina que processa um item que dois caminhos podem acionar:

- **Reivindicação é um `update` condicionado com `returning`, nunca leitura
  antes.** `finalized_at is null and (finalize_started_at is null or
  finalize_started_at < agora - 5 min)`. O `finalized_at is null` entra na
  mesma condição: sem ele, reenvio do provedor seis minutos depois reivindica
  uma chamada já finalizada e classifica duas vezes. No PostgREST, o filtro vira
  `.is('finalized_at', null).or('finalize_started_at.is.null,finalize_started_at.lt."<iso>"')`
  com o relógio da borda.
- **Falha no meio não desfaz a reivindicação.** Ela fica de pé sem
  `finalized_at`, expira em 5 minutos e a varredura tenta de novo. Por isso toda
  escrita que pode se repetir numa segunda passagem precisa ser idempotente pelo
  banco: `call_costs` e `call_tool_invocations` vão por `upsert` com
  `ignoreDuplicates` sobre o único de cada uma, e o `at` da invocação é
  derivado da conversa (início + segundo do turno), nunca do relógio.
- **Passo acessório não derruba a finalização.** O RPC do portão e o
  acionamento da classificação que falham ficam escritos no corpo
  (`'falhou'`) e a chamada é finalizada mesmo assim. O portão fechado é o lado
  seguro.
- **Aviso de gravação se reconhece pelo maior trecho literal do modelo**,
  normalizado sem acento, caixa e pontuação, e só em turno da Sarah. Não achado
  é `granted: false` com `evidence: { aviso: 'ausente' }`, nunca presumido.
- **Dependências que a frente de borda não criou** estão no cabeçalho de
  `call-finalize/index.ts`: o RPC `registrar_primeira_chamada_de_teste`, o
  balde `recordings` e `call-classify`.
- **Invocação lida da transcrição vira linha por quem a executou.** As três de
  sistema e a desconhecida entram com `system:<nome>` (a desconhecida com o
  nome que veio, e `response.nome_recebido` quando o caractere precisou ser
  trocado); as nossas sete só entram quando voltaram com erro, porque quando
  dão certo quem registra é a própria ferramenta, com a latência. A régua do
  nome (`NOME_DE_SISTEMA`) é a mesma de `call_tool_invocations_tool_check`, e
  um teste de banco compara as duas. Só invocação **sem erro** decide o fim:
  transferência que falhou não é `transferred`.
- **A leitura da transcrição tem adaptador por formato e fixtures que o
  declaram.** `formato-do-provedor.ts` tem `FORMATO_DA_CONVERSA` e
  `ADAPTADORES_DE_CONVERSA`; `leitura-da-transcricao.ts` recebe a conversa já
  lida e decide as linhas e o fim, sem nome de provedor. Cada exemplo de
  `transcricoes-de-exemplo.ts` traz `formato`, e um teste cobra que todo
  formato tenha fixture e toda fixture tenha adaptador. Formato novo do
  provedor é adaptador novo mais fixtures novas. O mesmo módulo de dado
  alimenta `testes/banco/finalizacao-das-ferramentas-de-sistema.test.ts`, que
  roda `finalizarChamada` com uma porta sobre o PGlite.
- **O `at` da invocação é estritamente crescente na ordem da transcrição.** O
  provedor dá o segundo do turno, e duas invocações do mesmo turno cairiam no
  mesmo `at`: ordem indefinida na tela e, sendo da mesma ferramenta, uma
  descartada pelo único. Cada invocação lida (inclusive a nossa que deu certo
  e não vira linha) ocupa o milissegundo do turno ou o seguinte ao da
  anterior. É determinístico, então a idempotência pelo único continua.
- **Reaplicação do que falhou (R-02) é registro por ferramenta**
  (`call-finalize/reaplicacao.ts`, `REAPLICADORES`, vazio na F2). Só se
  reaplica o que `gravarInvocacoes` acabou de inserir (`returning` do
  `on conflict do nothing`), e é o único do banco que impede a segunda vez.
  Ferramenta nova com efeito entra acrescentando a entrada, e o reaplicador
  precisa ser idempotente pelo próprio efeito: queda entre o insert e o
  reaplicador deixa a invocação sem reaplicação, no máximo uma vez.
- **O bloqueio não passa por esse registro** (`reaplicacao-do-bloqueio.ts`,
  US-108). Banco fora do ar durante a ligação chega ao provedor como 200 com
  `ok: false`, não como `is_error`, então o registro nunca o veria: toda
  invocação de `tool-dnc` da transcrição é refeita pelo mesmo RPC da
  ferramenta, e o único parcial de `dnc_entries` decide se falta. O item da
  fila abre só com `criado`. Ao contrário do registro, bloqueio que falha
  derruba a finalização (503, reivindicação de pé, a varredura volta): é a
  promessa dita em voz alta. Ensaio não toca a porta. Ferramenta cuja falha
  também chega como `ok: false` e cujo efeito é refazível segue este desenho.
- **`calls.evaluation` tem dois escritores, e nenhum apaga o outro.**
  `call-classify` grava o juízo do modelo (`criterios`, `modelo`) trocando a
  coluna inteira, e por isso lê `evaluation` e carrega `medicoes` adiante;
  `call-finalize` grava o que mede sem modelo (`medicoes.<critério>`, hoje
  `encerramento_pessoa_errada`, RF-422) pelo RPC `registrar_medicao_da_avaliacao`,
  que mescla no banco. Medição nova entra como chave de `medicoes` por esse
  RPC; nunca por `update` da coluna pelo PostgREST. A conformidade não escreve
  nada: só a divergência vira chave.
- **A avaliação automática é o terceiro escritor de `calls.evaluation`**
  (US-142, `call-finalize/avaliacao-automatica.ts`): `itens` e
  `evaluation_score` por `registrar_avaliacao_automatica`, que mescla e não
  apaga a nota com nula. A lista de critérios sai de uma função só,
  `criteriosDaChamada`/`criteriosDoPropositoGravado` em
  `_shared/agente/compilador.ts` (camada 1 mais `evaluation_criteria` da
  conta), e é ela que `agent-publish`, `call-classify`, `call-finalize` e a
  medição da publicação na tela (`app/src/sarah/servico-supabase.ts`) usam; a
  linha da tabela se lê por `lerLinhaDeCriterio`. `call-classify` calcula a
  mesma nota por `avaliacaoAutomatica` e carrega os itens por trecho e registro
  que a finalização já gravou. `aviso_gravacao` é sempre por trecho (o turno
  prova o aviso e dá `consent_notice_at`), e não se aplica com a gravação
  desligada. Sem juízo do modelo (via da ferramenta) a nota fica nula para a
  recuperação completar. Teste de banco que roda `finalizarChamada` com
  fixture sem aviso apaga `evaluation_criteria` e desliga a gravação, senão
  toda finalização abre `avaliacao_reprovada`.
- **A fila da chamada nasce no fim da finalização, pelos limiares da conta**
  (US-141, `call-finalize/sentimento-e-fila.ts`). Depois da retaguarda, que a
  finalização espera: lê `calls` (classificação, sentimento, avaliação), grava
  `calls.sentiment` com `sentiment_source` (`tool` ou `backfill`) e
  `leads.last_sentiment`, lê `account_settings` e `accounts.timezone`, conta a
  sequência de falhas por `falhas_consecutivas(conta, chamada)` em
  `call_attempts` (sucesso é `answered_by = 'human'`; resolvido o item, só
  contam as posteriores), calcula por `itensDaChamada` e grava por
  `registrar_item_de_fila`. Nenhum limiar é constante: o módulo não compara
  nada. Mudar o limiar não reescreve item aberto (`threshold_snapshot`).
  Corrigida por humano não é reescrita; ensaio não toca a porta. Passo
  acessório. `abrir_item_de_falha_repetida` e `repeated_failure` são da F3 e a
  finalização não os chama mais. A porta sobre o PGlite para testes de banco
  está em `testes/auxiliares/porta-da-finalizacao.ts`.
- **Chamada atendida por máquina não aciona classificação nem portão.** A
  saudação da caixa postal chega como fala do interlocutor, e sem a trava a
  máquina seria classificada como lead.
- **Os motivos que ela não recalcula são os marcados antes do encerramento**
  (`MOTIVOS_MARCADOS`): `canceled`, que `call-cancel` põe, e `max_duration`,
  que o vigia de `cron-call-recovery` põe antes de pedir o fim à telefonia. A
  finalização preserva a marca; o resto do fim (quem atendeu, duração)
  continua lido da conversa. Quem marca um motivo novo antes do fim entra na
  lista, senão a finalização o reescreve com o que leu da conversa.

### Classificação de retaguarda

`call-classify` lê a transcrição com o modelo e grava classificação, sentimento
e avaliação. O que ela resolveu vale para toda borda que grava o que um modelo
concluiu:

- **Resposta de modelo passa por vocabulário, nunca por aproximação.** O parser
  aceita a etapa só se for chave do funil da conta (RF-203) e a temperatura só
  se for da lista do check; o resto sai nulo, com a razão em
  `classification.nao_confirmados`. Número fora da faixa sai nulo, e não
  recortado. A sabotagem que prova a etapa é mapear rótulo para chave.
- **O modelo recebe chave e rótulo, e devolve a chave.** Renomear a coluna do
  funil muda o texto do pedido e não muda a classificação.
- **Falha do modelo é 503, e quem chama segue.** `call-finalize` grava
  `finalized_at` mesmo assim; a chamada fica com `classification_source` nulo
  (a ficha mostra "processando") e a nova tentativa é de `cron-call-recovery`.
  O teste disso mora em `call-finalize/finalizacao.test.ts` e chama o módulo
  de verdade com o modelo recusando.
- **A escrita é `update` condicionado** a `classification_source is null` (ou,
  sob a ferramenta da F4, a `evaluation_score is null`), e 409 para quem
  chegou depois.
- **O modelo é o da conta**, pelo OpenRouter que ela conectou, e o custo vai
  em `call_costs` com `component = 'model'`. Não há chave de modelo da
  instalação: `model_settings.provider = 'platform'` quer dizer "sem modelo
  conectado", e `_shared/modelo/pergunta.ts` devolve `sem_credencial` sem ir à
  rede, que cada borda traduz para `modelo_nao_conectado` (428, frase que
  manda conectar). O teste de `pergunta.ts` conta o `fetch`.
- **A chave do modelo é da instalação** (`SARAH_MODELO_API_KEY`), fora da
  cascata do cofre, e o custo vai em `call_costs` com `component = 'model'`.
- **A retaguarda grava o que a ferramenta grava** (US-139). Etapa por
  `resolverEtapa`, pontuação e temperatura por `calcularPontuacao` (o modelo
  responde os critérios da régua, nunca a temperatura), formato por
  `_shared/qualificacao/resultado.ts`, etapa pelo RPC com `actor='agent'`.
  `call-classify/mesmo-resultado.test.ts` roda os dois caminhos sobre a mesma
  entrada e compara: campo novo num lado só reprova ali. A gravação em `calls`
  é a reivindicação e vem antes do lead; ensaio e chamada sem lead não tocam
  lead nem etapa.
- **Falha do modelo abre `classificacao_pendente`** na fila, chave
  `classificacao:<call_id>`. `human` sai com `ja_corrigida` (409) e
  transcrição vazia com `sem_transcricao` (422, definitiva para
  `cron-call-recovery`).
- **Duas vias, uma reivindicação** (US-140). `call-finalize` aciona a
  retaguarda quando `decidirRetaguarda` (`call-finalize/retaguarda.ts`, sobre
  `faltouQualificar`) diz que faltou; `cron-call-recovery` aciona a finalizada
  sem classificação há mais de um minuto. Quem garante uma só é
  `reivindicar_classificacao`, `update` condicionado em `language sql` sobre
  `classify_started_at` (5 min), antes do modelo; `classified_at` fecha as duas
  vias. Falha do modelo solta a trava. A concorrência de verdade (duas
  conexões) é de `npm run test:retaguarda:postgres`, no degrau 3; no PGlite, o
  que cai com "consulta e depois escreve" é a varredura do corpo da função.

### Rascunho escrito por modelo

`playbook-draft` pede ao modelo a camada 2 de um playbook. O que ela resolveu
vale para toda borda que grave texto de modelo que a Sarah vai falar:

- **Texto mandado ao modelo vai sob a chave `prompt`** no `request` de
  `integration_events`, e o gatilho de redação o troca por `[redigido]`
  (`20260923200000_redacao_do_prompt.sql`). Descrição de negócio e qualquer
  outro dado do cliente em outro nome de chave sairia em claro; o teste da
  borda cobra que o dado só apareça sob `prompt`.
- **Texto de modelo passa por crivo antes do banco, não depois.** O pedido
  proíbe prometer horário (O-06), e `_shared/agente/rascunho-de-roteiro.ts`
  varre a resposta; se o modelo insistir, a função recusa sem gravar. Gravar e
  avisar deixaria no histórico uma versão pronta para ser publicada com a
  promessa dentro.
- **Versão nova carrega o que não é dela.** O rascunho escreve `body_script`
  e copia `body_house` da versão vigente (a publicada, senão a mais nova):
  versão nova com a camada 3 em branco a apagaria na publicação seguinte.
- **`status: 'draft'` está no tipo da linha**, e a porta não tem método de
  publicação. Publicar continua sendo ato de quem administra (RF-307).

### Ação de gente sobre a chamada viva

`call-cancel` e `call-audio` agem sobre uma chamada que outros caminhos estão
escrevendo. O que as duas resolveram:

- **A conta sai do dado, não do pedido.** O corpo traz só o alvo; a conta é a
  da linha, lida com a chave de serviço, e o vínculo de quem pediu é conferido
  contra ela. Não ser membro responde o mesmo 404 do alvo inexistente, com o
  corpo idêntico — o teste compara os dois serializados.
- **Toda escrita é `update ... where <estado esperado> returning`.** Não voltou
  linha, outro caminho chegou antes: lê de novo e responde o que encontrou, sem
  laço de retentativa. Nenhum update casa com `finalized_at` preenchido, e
  nenhum escreve `in_progress`. O dublê do teste implementa a mesma condição e
  roda a finalização entre a leitura e o update para provar a corrida.
- **A chamada viva não é fechada por quem cancela.** Marca-se `end_reason` e
  pede-se o encerramento à telefonia; o `status` continua vivo para a varredura
  de recuperação ainda a enxergar se o aviso de fim se perder.
- **Idempotência é a marca posta só onde não havia** (`end_reason is null`): o
  segundo pedido não toca na telefonia, e o teste conta as idas.
- **Trilha entre a escrita e o efeito externo.** Trilha que falha desfaz a
  escrita; efeito externo que falha desfaz a marca e deixa a trilha, porque a
  decisão foi tomada.
- **URL assinada vale cinco minutos e nunca passa do expurgo.** Prazo vencido é
  410 mesmo com o arquivo ainda no balde; caminho nulo sem data de expurgo é
  gravação que nunca houve, e aí a frase é outra.

### Freio de emergência

`emergency-stop` para a conta inteira. O que ele resolveu vale para toda ação
de segurança que também tenha efeito externo:

- **A escrita que dá o efeito vem primeiro, antes de qualquer leitura.** A
  gravação de `dialing_paused_at` é o que faz o passo 0 de `guard_dial` recusar;
  os encerramentos são limpeza depois. Nada lê o estado antes, porque leitura a
  mais é tempo a mais com a conta discando. A ordem se prova pela sequência de
  membros tocados na porta e pelo estado da conta visto de dentro do dublê da
  telefonia.
- **Trilha que falha não desfaz a ação de segurança**, ao contrário de
  `call-cancel`: soltar o freio por um registro perdido é o pior desfecho. O
  autor sobrevive em `dialing_paused_by` e no gatilho de `accounts`, e o corpo
  diz `semRegistro: true`. Na retomada é o inverso — trilha que falha repuxa o
  freio, porque o lado seguro é continuar parado.
- **A marca fica quando a telefonia recusa**, também ao contrário de
  `call-cancel`: a decisão é da conta inteira, o `status` continua vivo e
  `cron-call-recovery` alcança a chamada pela idade (R-01). O segundo
  acionamento varre de novo e só pega chamada sem marca — é o que o torna
  idempotente e ainda assim alcança a que entrou no ar depois da primeira
  varredura.
- **Ponto de extensão de fase futura é membro opcional da porta**
  (`pausarCampanhas?`), chamado se existir. Implementar o update contra uma
  tabela que não existe seria asserção que passa verde com zero linhas.

### Rotinas agendadas

O pg_cron acorda a rotina e o SQL do job chama a função por `net.http_post`
(T-26). Duas peças fixas, e rotina nova usa as duas em vez de inventar:

- **O job é só `select public.disparar_rotina('<nome>')`.** Endereço base e nome
  do segredo moram em `app_config`, o valor do segredo no Vault, e tudo é lido
  na hora do disparo — `cron.job.command` é legível por quem consulta o
  agendador. `rotinas.url_base` não nasce na migração (seria URL literal):
  a função `saude`, que a conferência da instalação chama logo depois do
  deploy, grava `SUPABASE_URL + /functions/v1` por
  `registrar_url_base_das_rotinas` quando falta, e nunca sobrescreve. Até lá o
  job levanta exceção com a razão. Rotina nova entra acrescentando uma linha à lista de
  `cron.schedule` numa migração nova, com a cadência da seção 4.6;
  `testes/banco/rotinas-agendadas.test.ts` lê a tabela do documento e compara.
- **Toda rotina roda dentro de `executarRotina`**
  (`_shared/rotinas/execucao.ts`): ele grava `job_runs` no início e no fim
  (no erro também), passa o teto de 25 à reivindicação, deduplica por `chave`
  e marca `volume_alert` acima de três vezes a média móvel. A rotina entrega
  `reivindicar(limite, instante)` — SQL com `for update skip locked` que tira o
  item do pendente na mesma transação — e `processar(item)`. A porta de
  `job_runs` no `index.ts` grava o objeto que recebe; as colunas são do
  envelope. `teto` (1 a 25) reduz o lote de uma rotina cujo item é caro;
  acima de 25 o envelope recusa antes de gravar o início.
- **Rotina com núcleo em SQL registra a execução pelas funções, não por
  insert.** `abrir_execucao_de_rotina(conta, rotina, p_agora)` e
  `fechar_execucao_de_rotina(execucao, itens, erro, p_agora)`
  (`20261010100000_registro_de_execucao.sql`) são `security definer`, só
  `service_role`, e recebem o relógio por parâmetro — é o que deixa o teste de
  PGlite avançar o relógio sem `now()`. Fechar duas vezes levanta `55000`, e
  erro em branco vira `'erro sem mensagem'`, nunca sucesso.
- **Toda rotina é `verify_jwt = false` e abre com `_shared/rotinas/portao.ts`.**
  `disparar_rotina` manda só `x-internal-secret`, sem `Authorization`, e o 401
  cru do gateway pararia a rotina sem erro em lugar nenhum além de `net`. O
  bloco vai em `config.toml` com o motivo e o nome em `PUBLICAS` de
  `testes/estatica/portas-das-funcoes.test.ts`; o segredo se confere antes de
  qualquer porta (nem `job_runs` recebe linha), e o teste conta as portas
  tocadas com `Proxy`. `cron-dial/despacho.ts` (`atenderRotina`) é o modelo.
- **Só `cron-dial` chama `call-place`.** As outras rotinas enfileiram em
  `dial_queue` e param ali; `cron-dial/despacho.test.ts` varre o código (sem
  comentário) de todas as outras funções atrás de `call-place` e reprova se
  achar. A reivindicação da fila é `reivindicar_da_fila`, que trava
  `account_settings` da conta e recalcula as vagas contra `max_concurrent`:
  o módulo decide quantos pedir, o SQL é a rede que nunca devolve mais.
- **Rotina produtora cujo pendente é a ausência de linha reivindica por
  leitura, e o único é a trava.** `cron-speed-to-lead` não tem linha pendente
  para travar: o lead está pendente enquanto não há item `stl` na fila nem
  registro em `speed_to_lead_skips`. Duas passagens sobrepostas leem o mesmo
  lead e escrevem a mesma chave, e a segunda é `on conflict do nothing`. O
  candidato que a rotina **não** enfileira (fora da janela, inelegível) ganha
  registro com a razão, senão ele volta à consulta a cada minuto. Produtora nova
  (lembrete, cadência) segue o desenho: a decisão no módulo portável, a consulta
  só recorta, e o que foi examinado deixa rastro.
- **A recuperação consulta o provedor antes de acionar a finalização.**
  `cron-call-recovery` não chama `call-finalize` para conversa ainda no ar: a
  reivindicação de T-15 seguraria a chamada por 5 minutos e o aviso de fim, que
  chegasse nesse meio-tempo, leria 409. A consulta (`lerEstadoDaConversa`) vai
  primeiro; `processing` já é encerrada. E a varredura tem reivindicação própria
  (`calls.recovery_claimed_at`, com volta em 2^tentativas minutos), separada da
  da finalização — as duas não se substituem.
- **Retentativa por resultado é do banco, e a chave de `calls` leva a
  tentativa.** `reprogramar_tentativa(call, resultado, p_agora)`
  (`20261010110000_politica_de_retentativa.sql`) decide pela política da conta
  (`retry_*`) e enfileira `attempt + 1` com a mesma fonte e o mesmo
  `source_ref`; 23505 volta `ja_reprogramada`. `decidir_retentativa` é a
  mesma regra de `_shared/automacao/politica-de-retentativa.ts`, e
  `casos-de-retentativa.ts` cobra os dois. `call-finalize` a chama como passo
  acessório; `cron-dial` manda `tentativa` a `call-place`, que forma a chave
  com `chaveDaTentativa` (`#n` da segunda em diante). Fonte `manual`, `rem` e
  `camp` não entram: gente, prazo da reunião e política da campanha.
- **Nenhum ramo de rotina tenta para sempre (R-01).** Cada um declara teto de
  tentativas ou idade máxima, e quem esgota ganha marca de desistência com a
  razão escrita na linha (`recovery_gave_up_at`, `classify_gave_up_at`,
  `recovery_note`) e sai da reivindicação. Rotina nova que reprocessa item que
  falhou segue o mesmo desenho.
- **Rotina que espera resposta de terceiro gira a fila pela reivindicação.**
  `reivindicar_precos_tardios` ordena por `cost_sync_claimed_at nulls first`:
  com o teto de 25 e ordem só pelo fim da chamada, 25 chamadas sem preço
  ficariam na frente a cada passagem e as outras nunca seriam consultadas.
  Resposta sem valor não é escrita (nem nula, nem zero) — zero é valor que
  chegou, e só ele vira linha. `cron-cost-sync/custos.ts` é o modelo, com
  `ORIGENS_DOS_COMPONENTES` dizendo quem grava cada componente de custo.
- **Retrato de fora se grava reconciliado, numa transação, por item.**
  `gravar_ocupacao_do_calendario` recebe a leitura inteira de um calendário,
  apaga o que sumiu do provedor, faz `on conflict do update` no resto e só
  então avança `synced_at` — lista vazia também grava, senão agenda que
  esvaziou fica bloqueada para sempre. O recorte da remoção é a origem da
  linha (`specialist_busy_blocks.calendar_id`), nunca o dono: um especialista
  pode ter um calendário por provedor. Falha de um item vira frase na linha
  dele (`sync_error`) e a passagem segue; o envelope só vê erro quando nem a
  anotação da falha grava. `cron-calendar-sync/sincronizacao.ts` é o modelo, e
  a coluna de reivindicação nova (`sync_claimed_at`) entra na lista de ruído
  do gatilho de auditoria, recriado na mesma migração.
- **Aviso que a rotina repete a cada passagem é um por queda, e o estado é do
  banco.** `provider_alerts` tem único parcial em (conta, provedor, tipo) onde
  `rearmed_at` é nulo: a rotina lê os abertos antes de decidir, e
  `abrir_aviso_de_provedor` (`on conflict ... where rearmed_at is null do
  nothing`) é a rede da passagem sobreposta. Rearmar é `update`, e só leitura
  que mostra o provedor de volta acima do limiar rearma — `indisponivel` não
  abre nem rearma. `cron-credit-watch/credito.ts` é o modelo. Rotina que
  precisa do estado de provedor chama `medirProvedores`
  (`integrations-status/estado.ts`) com as sondas de
  `integrations-status/sondas.ts`, nunca sonda própria.
- **Efeito em dois lados tem uma confirmação por lado e a marca no fim.**
  `cron-retention` apaga o arquivo no Storage e a conversa no provedor de voz
  (P-10): cada lado que responde 2xx ganha a sua data
  (`purge_storage_at`, `purge_provider_at`), a execução seguinte só pede o lado
  que falta, e `content_purged_at` entra no mesmo update que zera o conteúdo,
  só com os dois confirmados. 404 de provedor não é confirmação — a conversa
  pode estar sob a credencial anterior da conta. `cron-retention/expurgo.ts` é
  o modelo, e a contagem do que a rotina alcançou vai numa linha por conta em
  `job_runs`, escrita depois do envelope (também quando ele termina em erro).
- **Freio puxado por rotina tem autor**: o check de `accounts` exige
  `dialing_paused_by`, e o disjuntor usa o uuid nulo (`AUTOR_DO_DISJUNTOR`),
  com `dialing_paused_reason = 'disjuntor'`. A retomada é manual, pelo caminho
  do freio de emergência.
- **pg_cron e pg_net são de mentira nos testes**: o preâmbulo do auxiliar
  registra cada chamada em `espionagem.chamadas` e mantém `cron.job` como o
  pg_cron (nome repetido atualiza). Asserte o que foi agendado ali.

### Diagnóstico da chamada

`call-diagnose` lê a ligação na ElevenLabs da conta (conversa, agente vivo e
avisos do workspace), roda as regras de `regras.ts` e pede ao modelo a
explicação e as propostas. O que ela resolveu:

- **Regra determinística é linha de tabela**, com código, severidade, título,
  sugestão, alvo e a função que devolve a evidência. Regra nova ganha caso em
  `CASOS` de `regras.test.ts`, que cobra um positivo por código.
- **O motivo de fim do provedor é texto livre** (suposição C3 de
  `formato-do-provedor.ts`) e se lê por expressão (`PADROES_DO_MOTIVO`); o
  texto cru vai na evidência. O que o provedor não disse, a regra não conclui.
- **Sem modelo o diagnóstico sai assim mesmo**, com `model_status` dizendo por
  quê: os achados são o que o dono precisa, e nenhum depende de modelo.
- **Alvo de proposta é lista fechada nos dois lados**: `ALVOS` em
  `propostas.ts` e os ramos de `aplicar_proposta_do_diagnostico`.
  `testes/banco/diagnostico-da-chamada.test.ts` aplica cada alvo da lista, e
  alvo novo sem ramo no banco reprova ali.
- **O antes é do banco e é conferido ao aplicar** (SQLSTATE `SD001`). Aplicar
  grava pelo caminho da tela do nível, com o motivo na trilha e o aprovador na
  proposta; nunca publica.

### Canal de WhatsApp (Z-API)

A mesma assistente por texto, pela instância Z-API da conta
(`whatsapp` / `instance_id`, `token`, `client_token` no cofre). O dialeto da
Z-API mora num arquivo só (`_shared/whatsapp/zapi.ts`, com
`SUPOSICOES_DA_ZAPI` e as fixtures de `zapi-exemplos.ts`).

- **O endereço é a credencial.** O webhook da Z-API não é assinado nem leva
  cabeçalho nosso: `whatsapp-inbound?conta=&chave=`, com a chave
  `HMAC(SARAH_TOOL_SERVER_KEY, 'whatsapp:' + conta)` (`_shared/whatsapp/endereco.ts`),
  conferida antes do corpo e da porta, com o mesmo 401 para tudo errado.
  Rodar a chave do servidor exige chamar `whatsapp-connect` de novo em cada
  conta dentro das 24 h da chave anterior.
- **Receber e responder são duas metades.** O webhook grava e devolve 200; a
  resposta vai para `EdgeRuntime.waitUntil`. Rajada e ordem se resolvem pela
  janela de agrupamento, pela reivindicação no banco
  (`reivindicar_resposta_do_whatsapp`/`soltar_resposta_do_whatsapp`) e por
  descartar a resposta quando chegou mensagem enquanto o modelo pensava
  (`_shared/whatsapp/resposta.ts`). O instante da reivindicação é truncado em
  milissegundos, porque volta à borda como instante de JavaScript.
- **Um prompt só.** O sistema é o prompt compilado do propósito
  (`compilarPublicacao` na fatia `FATIA_DO_WHATSAPP`) com o lead preenchido e
  `INSTRUCAO_DO_CANAL` no fim; nenhum marcador sobra (o motor levanta).
- **As ferramentas são os executores da ligação**, exportados de cada
  `tool-*` (`executorDaQualificacao`, `executorDaDisponibilidade`,
  `executorDoAgendamento`) e rodados por `_shared/tools/execucao-direta.ts`,
  com a conversa no papel da chamada. `tool-dnc` e `tool-transfer` têm efeito
  de voz e ganham versão do canal (`whatsapp-inbound/ferramentas.ts`). A oferta
  de horário é `whatsapp_conversations.slot_offers`.
- **As portas sobre o Supabase são uma só** (`whatsapp-inbound/portas-do-supabase.ts`),
  lidas pelos três adaptadores (`whatsapp-inbound`, `whatsapp-send`,
  `cron-dial`). Consulta nova do canal entra ali.
- **Descadastro por mensagem não depende de modelo** (`_shared/whatsapp/descadastro.ts`),
  e vale com a conversa nas mãos do time e com o canal desligado.
- **Pré-contato só depois da guarda**: `cron-dial` chama `preContato` quando a
  ligação saiu; falha dele não muda o item.
- **A assistente do canal é a publicada, não a em edição.** `agent-publish`
  grava em `agent_publications.channel_snapshot` o retrato do que foi ao ar
  por propósito (`_shared/agente/retrato-da-publicacao.ts`: identidade,
  roteiro, abertura e jeito do WhatsApp), e `portas-do-supabase.ts` lê a
  assistente dali. Sem retrato, `agente()` é nulo, o canal cala e abre item
  com `assistente_nao_publicada`. Tudo o que o retrato carrega está no hash
  (o bloco opcional `whatsapp` da configuração compilada, ausente quando a
  conta não escreveu nada, para não mudar o hash de quem já publicou), então
  propósito inalterado não reescreve o retrato; a exceção é a linha de antes
  dele, que o ganha por `gravarRetrato` sem mexer em `published_at`.
- **Particularidades por canal.** `agents.whatsapp_first_message` é a abertura
  por mensagem (`_shared/whatsapp/abertura.ts`, texto fixo sem modelo, nulo
  vale `FALAS_DO_WHATSAPP.abertura`), usada no `iniciar` e, com o aviso da
  ligação, no pré-contato quando a conta não escreveu um próprio.
  `voice_channel_style` e `whatsapp_channel_style` entram por
  `identidade.jeitoDoCanal` do compilador, depois do jeito da casa, só no
  canal de cada um.
- **Modo de teste** (`account_settings.whatsapp_mode`, `_shared/whatsapp/modo.ts`):
  nasce `teste`, e aí só os números de `account_test_numbers` são contato do
  canal. Número fora da lista é ignorado na entrada antes de qualquer gravação
  (nem lead, nem descadastro), e a resposta, o pré-contato e a ação `iniciar`
  conferem o modo pela porta (`atendeONumero`). Mensagem escrita por gente do
  time não passa pelo modo.
- **Áudio e imagem** (`_shared/whatsapp/midia.ts`): a entrada grava a
  mensagem com `media_status = 'pendente'` (só com o canal ligado e a conversa
  com a assistente), e `depois` baixa pela URL da Z-API (https, 10 MB, 15 s),
  lê pelo modelo das tarefas `audio`/`imagem` (`_shared/modelo/leitura-de-midia.ts`)
  e grava `media_text` antes de responder; a resposta espera leitura pendente
  (`midia_pendente`). A mídia nunca é guardada; `integration_events` leva só a
  instrução sob `prompt`, o tipo e o tamanho. Falha de leitura vira pedido para
  repetir ou escrever, nunca palpite.

## Verificação

`npm run check` da raiz aplica as migrações do zero em PGlite e roda a análise
estática. **Nunca** `supabase start`, `db reset` ou `migration up` — veja o
CLAUDE.md da raiz. Comportamento de tabela e de função se prova em
`testes/banco/`, um arquivo por migração.

**Tabela nova entra sozinha na varredura de isolamento**
(`testes/banco/travessia-entre-contas.test.ts`, atalho `npm run test:rls`), que
lê as tabelas do catálogo. Duas coisas passam a ser exigidas da migração nova:

- se a tabela não tiver `account_id`, declarar em `LIGACOES_DECLARADAS` como
  encontrar as linhas dela — é o par da isenção em
  `scripts/analise-de-migracoes.ts`, do lado do teste;
- o cenário do teste precisa criar pelo menos uma linha da tabela para cada
  conta, porque a varredura também cobra que cada conta veja as próprias
  linhas.

**Restrição de linha inteira não se testa inserindo o estado proibido.** Um
`check (expires_at > created_at)` vale para toda linha, então não existe
convite que nasça vencido: para ter um, recue `created_at` junto. Ver
`semearConvite` em `testes/banco/convites.test.ts`.

### Pacote de instalação

O instalador do painel (StartSe/ai-hub) instala o banco e as funções no
projeto Supabase de cada cliente lendo `instalacao.json` e a pasta
`instalacao/`, gerados por `npm run pacote` (docs/instalacao.md).

- **Mudou migração, função ou `config.toml`: rode `npm run pacote` e commite.**
  `testes/estatica/pacote-de-instalacao.test.ts` regera em memória e reprova o
  pacote que envelheceu. Conflito de merge em `instalacao/` ou em
  `_shared/versao-da-instalacao.ts` se resolve regerando, nunca à mão.
- **Cada função vai empacotada num arquivo só**, porque o passo `funcao` do
  painel publica a pasta sem subpastas e quase toda função importa de
  `../_shared/`. Import externo tem que ser `npm:` (o empacotador o deixa de
  fora); import relativo que o rolldown não resolva quebra o `npm run pacote`.
- **`verify_jwt = false` sem comentário acima do bloco quebra o gerador**: o
  comentário vira o `motivoSemJwt` que a tela do instalador mostra a quem
  instala, e por isso não cita o nome da assistente.
- **Extensão que a migração confere e não cria** entra no preparo do pacote
  (`PREPARO`, em `scripts/pacote-de-instalacao.ts`): num projeto instalado pelo
  painel não há quem a ligue no painel do Supabase.
