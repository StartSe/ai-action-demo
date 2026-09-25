# Revisão técnica: PRD de implementação do Sarah Voice SDR

**Alvo:** `PRD-implementacao.md` v1.0
**Base de comparação:** `PRD.md` v1.1 (135 RF, 16 RNF), `padrao-de-interface.md`, `briefing-design.md`
**Data:** 21/09/2026
**Método:** leitura integral dos quatro documentos, cruzamento de cada RF contra tabelas, colunas, funções e rotinas declaradas, e verificação de viabilidade das afirmações sobre o provedor de voz e a telefonia contra código que resolve o mesmo problema.

Cada achado tem número, severidade e proposta. Severidade:

- **BLOQUEADOR**: construir como está produz retrabalho de modelo ou de arquitetura.
- **GRAVE**: funciona no caminho feliz e quebra em produção, ou deixa um requisito sem implementação.
- **MENOR**: inconsistência, lacuna de definição ou custo evitável.

Contagem: 80 achados, sendo 2 BLOQUEADOR, 43 GRAVE e 35 MENOR. Achados das seções 2 a 5 que derivam de um achado da seção 1 apontam para ele; a contagem os mantém separados porque cada um pede uma ação própria.

O que está certo e fica como está, em uma linha cada: o caminho único de discagem com a guarda como módulo compartilhado; a finalização como fonte canônica em via dupla; `calls` gravada antes de tocar no provedor; frase pronta devolvida pela ferramenta; etapa referenciada por `key`; camada 1 do playbook como constante versionada no repositório; falas da Sarah no servidor; migrações desde o primeiro commit; semente com o cenário Vexo.

---

## 1. Erros técnicos que vão custar caro

### 1.1 Modelo do agente e ferramentas por propósito

**T-01. BLOQUEADOR. Um agente publicado por conta não sustenta a restrição de ferramentas por propósito (RF-309).**
Trecho: `agents.provider_agent_id` é coluna única; `agent-publish` "injeta ... ferramentas do propósito"; `call-init` "devolve ... o conjunto de ferramentas do propósito".
O que quebra: a publicação define o conjunto de ferramentas do agente no provedor. O webhook de início de conversa permite sobrescrever prompt, primeira fala, idioma e voz, e recebe variáveis dinâmicas. Ele não substitui o conjunto de ferramentas. Com um agente por conta, as sete ferramentas ficam disponíveis em toda chamada, e a restrição volta a ser instrução de texto, que é exatamente o que RF-309 proíbe. A verificação em tempo de execução descrita na seção 5 (409 fora do propósito) segura o dano, mas a garantia estrutural que o PRD exige deixa de existir.
Correção: publicar um agente no provedor por par (conta, propósito). Substituir `agents.provider_agent_id`, `published_at`, `published_hash` por tabela `agent_publications(agent_id, purpose, provider_agent_id, published_hash, published_at, status)`. `agent-publish` compila e publica os quatro. `call-place` escolhe o agente pelo propósito no momento da discagem, o que a API de saída nativa do provedor já permite, porque o identificador do agente é parâmetro da chamada. Antes de fechar, um teste de meia hora: tentar devolver ferramentas na resposta do webhook de início e ver se o provedor aceita. Se aceitar, o modelo de um agente se mantém e este achado cai para MENOR.

**T-02. GRAVE. `tool-transfer`, `tool-dnc` e o encerramento de pessoa errada (RF-422) não fecham como webhooks.**
Trecho: "Sete funções, todas sem JWT ... `tool-transfer` ... devolve `transferred` ou `queued`". F3: "encerramento de pessoa errada".
O que quebra: um webhook devolve JSON. Ele não transfere a chamada nem a encerra. Transferir exige a ferramenta de sistema do provedor (transferência para número) ou um redirecionamento na telefonia com o SID da chamada e as credenciais de telefonia. Encerrar em até duas falas exige a ferramenta de sistema de encerramento. Nenhuma das duas aparece no documento. Sem elas, a Sarah diz "vou te transferir" e continua na linha.
Correção: adicionar à seção 5 um bloco "ferramentas de sistema do provedor" com `end_call`, `transfer_to_number` e `voicemail_detection`, dizendo em qual propósito cada uma entra na publicação e como a invocação é capturada: no fim da chamada, `call-finalize` lê as chamadas de ferramenta da transcrição e grava em `call_tool_invocations` com `tool='system:end_call'` etc. `tool-transfer` passa a ser a função que decide (há alguém disponível? devolve o número de destino ou `queued`), e a transferência em si é a ferramenta de sistema encadeada na instrução do roteiro. `tool-dnc` grava o bloqueio e devolve a fala de despedida; o encerramento é `end_call`. Pessoa errada: `tool-dnc` recebe `reason='wrong_number'` e o número entra em `dnc_entries` com `source='wrong_number'`, o que satisfaz "o sistema recusa rediscagem" sem tabela nova.

**T-03. GRAVE. Detecção de secretária eletrônica está atribuída à telefonia, mas o caminho de discagem passa pela saída nativa do provedor de voz (RF-418).**
Trecho: tabela de stack, linha Telefonia: "detecção de secretária eletrônica".
O que quebra: quando a chamada é criada pela API de saída do provedor de voz, o parâmetro de detecção de máquina da telefonia não está disponível; a chamada é criada pelo provedor, com a conta de telefonia vinculada a ele. Ou a detecção vem da ferramenta de sistema de caixa postal do provedor de voz, ou a discagem sai pela API da telefonia com TwiML conectando ao provedor, o que muda `call-place`, `phone-register` e a forma de passar contexto.
Correção: decidir antes da F2. Recomendo a ferramenta de sistema do provedor de voz: entra na publicação de todos os propósitos, e `call-finalize` grava `answered_by='machine'` e `end_reason='voicemail'` a partir da invocação registrada na transcrição. RF-417 (caixa postal reprogramada para outro turno) depende dela, e por isso ela sai da F7 e vai para a F2 (ver O-04).

### 1.2 Discagem e guarda

**T-04. BLOQUEADOR. `call-place` exige JWT e cinco rotinas discam sem usuário.**
Trecho: `call-place | sim | Caminho único de discagem`; rotinas `cron-speed-to-lead`, `cron-meeting-reminder`, `cron-meeting-noshow`, `cron-cadence`, `cron-campaign-dispatch`.
O que quebra: ou as rotinas discam por outro caminho, e o "caminho único" deixa de existir junto com a garantia da guarda, ou o documento está errado quanto à autenticação. Nenhuma das duas está escrita.
Correção: `call-place` aceita duas autenticações: JWT de usuário, ou segredo interno de serviço com `actor='system'` e `source` (nome da rotina). A guarda recebe `source` e aplica os `bypass` permitidos por fonte, e `call_attempts` e `audit_log` gravam `actor_id` nulo com `actor='system'` e `source`. O critério de aceite de RF-011 (parar tudo em 10 s) só é verificável se toda discagem passar por aqui.

**T-05. GRAVE. A guarda não é atômica; os tetos são verificados e depois gravados.**
Trecho: passos 4 a 8 da seção 6.
O que quebra: duas execuções simultâneas de `call-place` (campanha com `max_concurrent` maior que 1, duas rotinas sobrepostas, operador e rotina ao mesmo tempo) leem o mesmo contador, passam as duas e gravam as duas. O teto diário por número, por conta e por linha deixa de ser teto. O mesmo vale para o intervalo mínimo entre tentativas.
Correção: a guarda vira uma função SQL `security definer` que, na mesma transação, toma `pg_advisory_xact_lock(hashtext(account_id::text || phone_e164))` e um segundo lock por conta, faz as contagens, grava `call_attempts` e devolve a decisão. O módulo `guard.ts` normaliza e chama essa função. Índices: `call_attempts(account_id, attempted_at)`, `call_attempts(account_id, phone_e164, attempted_at)`, `call_attempts(phone_line_id, attempted_at)`.

**T-06. GRAVE. A parada de emergência e o teto de gasto não estão na ordem certa da guarda, e o teto de gasto não está em lugar nenhum.**
Trecho: passo 6 "Verifica teto diário da conta e a parada de emergência"; RNF-12 "Conta para de discar ao atingir o teto configurado" (gasto).
O que quebra: a parada de emergência é a verificação mais barata e mais importante e está em sexto lugar, depois de consultas ao banco. O teto de gasto (RNF-12) exige custo acumulado do dia, que o modelo não tem (ver T-20).
Correção: passo 0 da guarda lê `accounts.dialing_paused_at` (coluna nova, com `paused_by`) e recusa antes de qualquer outra consulta. Passo 6 passa a incluir soma de `call_costs` do dia contra `settings.daily_spend_cap_cents`.

**T-07. GRAVE. `calls.idempotency_key` não tem unicidade nem regra de formação, e a linha `queued` órfã não tem dono.**
Trecho: "Idempotente por `idempotency_key`"; "grava `calls` antes de tocar no provedor".
O que quebra: sem `unique (account_id, idempotency_key)` a idempotência depende de leitura antes de escrita, que é a mesma corrida de T-05. Sem regra de formação, cada chamador inventa a sua e as rotinas duplicam. Se a função cai entre o insert e a chamada ao provedor, fica uma linha `queued` sem SID para sempre, e `cron-call-recovery`, como descrita, só cuida de chamadas que terminaram sem finalizar.
Correção: restrição única; chaves por fonte: `manual:{uuid gerado no cliente}`, `stl:{lead_id}`, `rem:{meeting_id}`, `rescue:{meeting_id}:{n}`, `cad:{enrollment_id}:{step}`, `camp:{target_id}:{attempt}`. `cron-call-recovery` ganha um segundo ramo: `queued` ou `ringing` há mais de 3 min sem `provider_call_sid` vira `failed` com `end_reason='dial_lost'` e reprograma pela política de RF-417.

### 1.3 Agenda

**T-08. GRAVE. A restrição de exclusão em `meetings` cobre as duas ligações simultâneas. O que falta está em volta dela.**
Veredito sobre a pergunta central: sim. Uma restrição `exclude using gist (specialist_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (status in ('scheduled','confirmed'))` é verificada no índice com bloqueio de linha; a segunda inserção concorrente espera o commit da primeira e falha com SQLSTATE 23P01. Funciona em READ COMMITTED e não depende de leitura prévia. `btree_gist` cobre `uuid`.
O que falta:
1. Escrever os limites `'[)'` explicitamente. Sem isso, dois horários encostados (14h00 às 14h30 e 14h30 às 15h00) podem ser lidos como conflito por quem mantiver o código, e o texto atual não diz.
2. Listar o predicado exato de status. "status ativos" precisa virar `('scheduled','confirmed')`. `rescheduled` e `canceled` ficam de fora, e a remarcação marca a antiga antes de inserir a nova na mesma transação.
3. `tool-book-meeting` precisa tratar 23P01 como resultado esperado: devolve `ok:false` com `speech` "esse horário acabou de ser preenchido, deixa eu ver outro" e o roteiro chama `tool-availability` de novo. A suíte de contrato já lista "horário já ocupado"; o documento precisa dizer que o caso vem da restrição do banco, sem leitura prévia de conflito.
4. O teto diário do especialista (RF-504) e a antecedência (RF-505) não estão cobertos pela restrição. Duas ligações simultâneas podem levar um especialista de 5 para 7 reuniões no dia. Solução: `tool-book-meeting` faz o insert dentro de uma função SQL que toma `pg_advisory_xact_lock` por (specialist_id, dia) e conta antes de inserir.
5. Um lead com reunião ativa pode ser agendado de novo com outro especialista. Índice único parcial em `(lead_id) where status in ('scheduled','confirmed')`, a menos que o produto queira permitir duas reuniões ativas por lead, o que o PRD não diz.
6. O calendário externo não entra na restrição. Entre a consulta e o agendamento, o especialista pode ter criado um evento. Ver T-10.

**T-09. GRAVE. O `slot_token` contradiz a regra do próprio PRD e está mal amarrado.**
Trecho: "O `slot_token` é assinado e tem validade de 10 minutos. Carrega `specialist_id`, `starts_at` e `duration`." Seção 8: "`slot_token` assinados com chave de servidor, uso único".
O que quebra:
1. PRD seção 9, contrato comum, item 2: identificadores viajam por cabeçalho técnico, nunca pela conversa, porque pedir a um modelo que reproduza um identificador longo é garantir defeito. Um token assinado é uma sequência opaca de dezenas de caracteres que o modelo precisa devolver ao pé da letra. É o mesmo defeito com outro nome.
2. O token não está amarrado à chamada nem à conta. Um token emitido para a chamada A serve na chamada B.
3. "Uso único" (seção 8) não aparece na seção 5, não tem tabela que guarde tokens usados, e é desnecessário: a restrição de exclusão já impede o duplo agendamento. Uma remarcação na mesma ligação pode legitimamente reutilizar um horário oferecido.
4. Dez minutos é curto para uma ligação de descoberta. Horários oferecidos no minuto 3 e escolhidos no minuto 14 expiram, e a Sarah precisa consultar de novo no meio da confirmação.
Correção: guardar as ofertas no servidor. `tool-availability` grava em `call_slot_offers(call_id, position smallint 1..4, specialist_id, starts_at, ends_at, expires_at)` e devolve na fala "opção um, terça às 14h; opção dois...". `tool-book-meeting` recebe `slot_position` e resolve pela chamada identificada no cabeçalho. O modelo lida com "a segunda". A oferta expira no fim da chamada. Isso atende à regra do PRD e à garantia contra horário inventado com mais força que o token. Se o token for mantido mesmo assim: incluir `call_id` e `account_id` na carga, validar igualdade, validade igual à duração máxima da chamada (RF-421), e apagar "uso único" da seção 8.

**T-10. GRAVE. Leitura do calendário externo em tempo de ferramenta estoura o prazo, e não existe rotina de sincronização.**
Trecho: `specialist_calendars` com `synced_at`; RF-507 "lendo ocupação real"; RNF-03 2 s no p95.
O que quebra: função fria (200 a 800 ms) mais consulta de ocupação no Google (300 a 900 ms) mais geração de horários mais formatação estoura 2 s com frequência. Se a leitura for periódica, falta a rotina que a faz e a tabela que guarda o resultado.
Correção: `cron-calendar-sync` a cada 5 min grava a ocupação dos próximos 30 dias em `specialist_busy_blocks(specialist_id, starts_at, ends_at, external_id, synced_at)`. `tool-availability` lê só do banco. `tool-book-meeting` faz uma checagem ao vivo do horário escolhido antes de inserir (uma consulta pontual, menor que a de ocupação inteira) e trata conflito como 23P01. Falta também o par `calendar-connect` e `calendar-callback` para o fluxo OAuth (ver L-06).

### 1.4 Isolamento e segurança

**T-11. GRAVE. O "único formato de política" abre quatro brechas.**
Trecho: seção 3, "Política de isolamento".
O que quebra:
1. `ins ... with check (is_member(account_id))`: o papel `viewer` insere em toda tabela. Observador cadastra lead, bloqueia número, grava nota.
2. `upd ... has_role(account_id,'operator')` em toda tabela: Operador altera `agents`, `playbooks`, `phone_lines`, `cadences`, `campaigns` e `accounts.settings`, onde mora a política de discagem. RF-003 proíbe. A frase "Tabelas de configuração exigem admin também no update" não diz quais são.
3. `audit_log` e `lead_events` "só inserção" com política de insert para membros: o cliente forja `actor_id` e `actor='agent'`. E "gravado na mesma transação da ação" é impossível quando a ação é um update direto na tabela vindo do navegador e a auditoria é um segundo insert.
4. `accounts` não tem `account_id` (usa `id`), `profiles` não tem `account_id`, e `meeting_attestations`, `outbound_deliveries`, `integration_events`, `call_tool_invocations` e `account_secrets` são tabelas de servidor sem motivo para política de cliente nenhuma. O formato único é falso para pelo menos sete tabelas.
Correção: matriz por tabela com quatro classes: operação (`leads`, `lead_events` via RPC, `meetings`, `exception_items`, `dnc_entries`: insert e update exigem `operator`), configuração (`agents`, `playbooks*`, `phone_lines`, `specialists*`, `cadences`, `campaigns`, `pipelines*`, `outbound_webhooks`, `accounts`: qualquer escrita exige `admin`), dono (`account_secrets`, exclusão de `accounts`: `owner`), servidor (sem política de cliente). Auditoria por gatilho `after update/delete` nas tabelas sensíveis, escrevendo `auth.uid()`, ou toda mutação sensível via RPC `security definer` que grava ação e auditoria na mesma transação. `is_member` e `has_role` declaradas `stable security definer`, usadas como `(select is_member(account_id))` para o planejador cachear por consulta, e índice `account_members(user_id, account_id)`.

**T-12. GRAVE. A cascata de credencial (RF-007) não está definida e o degrau global é perigoso em multiempresa.**
Trecho: seção 8: "Segredos de plataforma em variáveis de ambiente. Segredos de cliente no Vault." RF-007: "cofre da conta, depois configuração do recurso, depois variável global".
O que quebra: o degrau "configuração do recurso" não existe no modelo (nenhuma coluna de credencial em `phone_lines` ou similar), e não há módulo nomeado que resolva a cascata. Em produção multiempresa, cair na variável global significa que uma conta sem chave gasta o crédito da plataforma e liga com a identidade da plataforma, em silêncio. Há ainda dois fatos que o documento afirma ao contrário: registrar o número na integração nativa exige entregar SID e token de telefonia ao provedor de voz, e o `x-tool-secret` da conta fica gravado na configuração do agente no provedor. "O valor nunca sai" vale para o navegador; para o provedor, ele sai por necessidade.
Correção: `_shared/secrets.ts` com `resolveSecret(account_id, provider, key_name)` e cache de 60 s invalidado na escrita. Em `producao`, chave da conta obrigatória, com exceção explícita `accounts.settings.credentials_mode='platform'` gravada pelo Dono e auditada. Em `local` e `homologacao`, cascata completa. Documentar na seção 8 quais segredos são compartilhados com qual provedor e por quê.

**T-13. GRAVE. `meeting-attest` por link em um clique vai ser acionado por robôs de e-mail.**
Trecho: "Resolve o token do e-mail do especialista em um clique, sem login".
O que quebra: filtros corporativos (Safe Links, prefetch de Gmail e de clientes móveis) abrem todo link do e-mail antes do humano. Um GET que grava resposta produz apuração falsa, na fonte primária da métrica norte, na direção do primeiro botão do e-mail.
Correção: o link abre uma página mínima que mostra a reunião e dois botões; a resposta é um POST com o token. GET nunca muda estado. Isso mantém "um clique, sem login" do ponto de vista de quem responde, com um carregamento de página a mais.

**T-14. GRAVE. Ligação recebida não tem quem crie a linha em `calls` (RF-108, RF-409).**
Trecho: seção 5, "A função resolve `calls.provider_conversation_id` e daí a conta".
O que quebra: em chamada de saída, `call-place` grava `calls` antes de discar. Em chamada de entrada, ninguém grava. A primeira ferramenta que a Sarah chamar devolve "conversa inexistente". E `inbound_behavior` `forward` e `voicemail` não são servidos pelo número registrado na integração nativa, que encaminha tudo ao agente.
Correção: `call-init` identifica a linha por `called_number`, o lead por `caller_id` (cria com `source='inbound'` se não existir, RF-108), grava `calls` com `direction='inbound'` e `provider_conversation_id`, e devolve o contexto. `phone-register` configura o número conforme `inbound_behavior`: `agent` vai para o provedor de voz; `forward` e `voicemail` apontam o webhook de voz da telefonia para uma função `inbound-twiml` que não está na lista de 26.

**T-15. GRAVE. A finalização tem corrida entre webhook e varredura.**
Trecho: `call-events` "agenda `call-finalize`"; `cron-call-recovery` a cada 2 min; `call-finalize` "Idempotente".
O que quebra: idempotência por "já está finalizada? então sai" é verificação seguida de ação. Webhook e varredura dentro do mesmo segundo passam os dois pela verificação e rodam a classificação duas vezes: custo duplo de modelo, `lead_events` duplicados, webhook de saída disparado duas vezes.
Correção: `update calls set finalize_started_at = now() where id = $1 and (finalize_started_at is null or finalize_started_at < now() - interval '5 minutes') returning id`. Só quem recebe a linha continua. Marcar `finalized_at` no fim. A mesma técnica vale para toda rotina que processa itens: `select ... for update skip locked`.

**T-16. GRAVE. O ensaio (RF-312) implica um segundo tempo de execução que diverge do agente publicado.**
Trecho: `rehearsal-turn` "Executa um turno do ensaio: aplica o playbook, chama as ferramentas de verdade em modo simulado".
O que quebra: no modo texto, "executa um turno" só é possível se nós rodarmos o modelo com o prompt compilado e as definições de ferramenta. Aí existem dois agentes: o do provedor, que liga, e o nosso, que ensaia. Toda diferença de modelo, temperatura e comportamento de chamada de ferramenta faz o ensaio aprovar o que a ligação vai errar. No modo voz, o provedor chama as ferramentas de verdade com um `conversation_id` real, e as ferramentas, como especificadas, não sabem que é ensaio: `tool-book-meeting` grava reunião, cria evento no calendário e envia e-mail. E "modo simulado" não existe no contrato da seção 5.
Correção: os dois modos passam pelo agente publicado no provedor. Uma função `rehearsal-session` cria uma linha em `calls` com `direction='rehearsal'` e devolve a URL assinada de sessão; o cliente conversa por texto (`text_only`) ou voz no navegador. As ferramentas resolvem a chamada pelo cabeçalho e, quando `direction='rehearsal'`, executam a leitura de verdade e pulam os efeitos: sem insert em `meetings`, sem calendário, sem e-mail, sem `dnc_entries`. Toda métrica e listagem exclui `direction='rehearsal'`. `rehearsal-turn` deixa de existir; `rehearsals` guarda a transcrição capturada por `call-finalize` do mesmo jeito que uma chamada.

**T-17. GRAVE. RF-604 e RF-516 se contradizem, e a rotina de falta segue a leitura errada.**
Trecho: `cron-meeting-noshow` a cada 5 min; RF-604 "Detectar falta após o horário e disparar ligação de resgate"; RF-516 "nunca tem o desfecho inferido".
O que quebra: se a rotina dispara resgate quando `ends_at` passou e `attestation_status='pending'`, ela está inferindo falta. Entre 20% e 40% dos especialistas não respondem ao e-mail na primeira hora. A Sarah liga para quem acabou de sair da reunião dizendo "vi que você não conseguiu comparecer". É a ligação mais destrutiva do produto.
Correção: resgate só dispara em `status='no_show'` atestado (e-mail, painel ou ligação). `pending` depois de 24 h vai para a fila do dia anterior (RF-515) e para a ligação de acompanhamento (RF-517), que pergunta em vez de afirmar. `cron-meeting-noshow` passa a se chamar `cron-meeting-rescue` e lê o estado atestado. Registrar a decisão no PRD de produto, porque o critério de aceite da F6 ("Reunião sem presença marcada gera ligação de resgate") precisa mudar para "reunião atestada como falta".

### 1.5 Lacunas de definição

**T-18. MENOR. `x-tool-secret` da conta é comparado antes de a conta ser conhecida.**
A função só sabe a conta depois de resolver `x-conversation-id`. Definir a ordem: resolve a conversa (entrada não confiável), obtém conta, obtém segredo, compara em tempo constante; sem linha em `calls`, compara contra um segredo de instalação e devolve 404. Alternativa que dispensa a consulta: segredo da conta derivado, `HMAC(chave_servidor, account_id)`.

**T-19. MENOR. Colunas citadas e ausentes em `leads`.**
O índice único parcial cita `merged_into_id`, que não está na lista de colunas. `phone_e164` precisa ser `not null` num produto que só fala por telefone. Falta `last_activity_at` para o filtro "última atividade" (RF-111), que sobre `lead_events` é caro.

**T-20. GRAVE. Não existe modelo de custo, e o custo é metade da métrica norte.**
Trecho: `calls.cost_cents`; RF-901 "telefonia + voz + processamento"; RF-703 estimativa; RF-706 custo por reunião da campanha; RNF-11, RNF-12.
O que quebra: um número só não separa os três componentes, não aceita chegada tardia (o preço da telefonia aparece minutos depois do fim da chamada, e às vezes nulo na primeira consulta), e não permite atribuir custo de lembrete e resgate à reunião. Sem regra de atribuição, "custo por reunião realizada" tem dez respostas possíveis.
Correção: `call_costs(call_id, component ('telephony'|'voice'|'model'|'infra'), amount_cents, currency, source, recorded_at)`, com `calls.cost_cents` como soma materializada por gatilho. `cron-cost-sync` a cada 15 min busca preços que chegaram tarde. Regra de atribuição escrita no PRD de produto: custo da reunião = soma das chamadas do lead entre a criação do lead e a reunião realizada, mais lembrete e resgate ligados a ela por `meeting_id`. Estimativa da prévia (RF-703) = média de custo por chamada atendida da conta nos últimos 30 dias, com valor padrão quando não há histórico.

**T-21. MENOR. `specialist_availability` não tem fuso, e a fala do horário precisa estar no fuso do lead.**
Adicionar `specialists.timezone` (padrão fuso da conta). Gerar horários no fuso do especialista e formatar `speech` no `leads.timezone`, dizendo o fuso quando diferir ("14h no seu horário, 15h aqui em São Paulo"). Princípio 3 do PRD.

**T-22. MENOR. `accounts.settings jsonb` concentra política de discagem, retenção, tetos, limiares e política de retentativa.**
Sem restrição de tipo, sem valor padrão verificável, escrita do blob inteiro em qualquer alteração, auditoria sem granularidade. Preferir `account_settings` com colunas tipadas e `check`, ou ao menos um `jsonb` por área com validação em gatilho.

**T-23. MENOR. `meetings` não aponta para a chamada que a marcou nem para a que a confirmou.**
RF-511 pede "marcada na ligação X, confirmada na ligação Y"; RF-706 pede custo por reunião da campanha. Adicionar `meetings.booked_call_id` e `confirmed_call_id`, ou garantir que `lead_events` de `kind='meeting'` carreguem `call_id` no `payload` e sejam a fonte.

**T-24. MENOR. As contagens do documento não fecham.**
Tabelas listadas: 35; texto diz 28. Funções listadas: 24; texto diz 26. Rotinas listadas: 9; diagrama diz 8. Sinal de que o documento não foi reconciliado consigo mesmo antes da revisão.

**T-25. MENOR. Duas fontes de contexto para a mesma chamada.**
`call-place` "injeta variáveis do propósito" e `call-init` "devolve contexto do lead, do propósito e da reunião". O webhook de início dispara em saída e em entrada. Duas fontes divergem com o tempo. `call-place` passa só `call_id` como variável dinâmica; `call-init` é a única fonte de contexto e resolve tudo pelo `call_id`.

**T-26. MENOR. Rotinas por pg_cron precisam de pg_net, e a chave de serviço não pode ir para a migração.**
pg_cron executa SQL; chamar uma função de servidor exige `net.http_post`. O documento não cita pg_net. A definição do job precisa de URL e segredo, que variam por ambiente: guardar em `app_config` e no Vault, lidos dentro do SQL do job, e nunca em texto na migração. pg_net é assíncrono e não devolve resultado ao job; a função grava o próprio início e fim (ver L-13).

---

## 2. O que falta

### 2.1 Tabelas, colunas e funções ausentes

| # | Sev. | Falta | Requisito | Proposta |
|---|---|---|---|---|
| L-01 | GRAVE | Tabela de convites | RF-005, F0 | `invitations(account_id, email, role, token_hash, expires_at, accepted_at, invited_by)` e função `invite-accept` (sem JWT, resolve token e cria `account_members`) |
| L-02 | GRAVE | Onde vive a chave do endereço público | RF-107 | `accounts.intake_key_hash`, com rotação registrada em auditoria. Limite de taxa por conta no `lead-intake` (o endereço dispara ligação; chave vazada vira custo) |
| L-03 | GRAVE | Números de teste e liberação de lead real | Portão F2/F3, RF-912 | `account_test_numbers(account_id, phone_e164, label)`; `accounts.feature_flags.real_dialing` gravado por migração quando a F3 entra; `accounts.first_test_call_ok_at` preenchido por `call-finalize` quando a chamada de teste termina com transcrição. Guarda: passo 0 recusa lead real sem os dois |
| L-04 | GRAVE | Parada de emergência como estado | RF-011 | `accounts.dialing_paused_at`, `dialing_paused_by`, `dialing_paused_reason`; `emergency-stop` grava, encerra chamadas em curso pela telefonia (precisa de `provider_call_sid` e credencial de telefonia) e `cron-campaign-dispatch` pausa campanhas ativas |
| L-05 | GRAVE | Modelo de custo | RF-901, RF-703, RF-706, RNF-11, RNF-12 | Ver T-20 |
| L-06 | GRAVE | Fluxo OAuth do calendário e sincronização | RF-507, RF-508 | `calendar-connect` (URL de autorização), `calendar-callback` (troca de código, grava `refresh_secret_id` no Vault), `cron-calendar-sync`, `specialist_busy_blocks`. Ver T-10 |
| L-07 | GRAVE | Ferramenta ou campo que apure comparecimento pelo lado do lead | RF-517 | `tool-qualify` ganha `meeting_outcome ('attended'|'no_show'|'unknown')`, válido quando o contexto da chamada traz `meeting_id`; grava `meetings.attestation_status='attested'`, `attested_source='call'`. O propósito da ligação pós-reunião precisa existir: hoje há `discovery`, `reminder`, `rescue`, `followup`, e a interface mostra Descoberta, Lembrete, Resgate, Retomada. Retomada reabre assunto com quem esfriou. Ligação pós-reunião realizada é outra conversa. Ou `followup` ganha roteiro que ramifica por "tem reunião recente", ou entra um quinto propósito, e a decisão é do PRD de produto |
| L-08 | GRAVE | Rascunho de roteiro | RF-305, onboarding passo 6 | `playbook-draft` (JWT, `claude-opus-5`), grava `playbook_versions` em `draft` |
| L-09 | GRAVE | Envio da base de conhecimento ao provedor | RF-310 | Nada cria `knowledge_entries.provider_doc_id`. `knowledge-sync` (ou ramo de `agent-publish`) envia e remove documentos e anexa ao agente publicado |
| L-10 | GRAVE | Exclusão e exportação de lead sob solicitação | RF-808, RF-809, RNF-10 | `deletion_requests(lead_id, requested_at, due_at, fulfilled_at, requested_by)`, `lead-erase` (apaga Storage, transcrição, e a conversa no provedor de voz, que também guarda áudio e texto), `lead-export` (zip com JSON e áudios por URL assinada) |
| L-11 | GRAVE | Mesclagem de leads | RF-114 | RPC `lead_merge(source, target)` que reaponta `calls`, `meetings`, `lead_events`, `cadence_enrollments`, `campaign_targets`, `consent_records`, grava `merged_into_id` e evento nos dois |
| L-12 | GRAVE | Duração máxima por conta | RF-421 | `agent-publish` grava `max_duration_seconds` da conta na configuração do agente; `cron-call-recovery` como vigia: chamada em curso além de `max + 60 s` é encerrada pela telefonia e recebe `end_reason='max_duration'`. Sem o vigia, a regra depende só do provedor |
| L-13 | MENOR | Registro de execução de rotinas | RF-613 | `job_runs(routine, started_at, finished_at, items, error)`. `integration_events` é para chamada externa; misturar os dois confunde a consulta do painel de saúde |
| L-14 | MENOR | Fila unificada de discagem | RF-417, RF-601, RF-604, RF-606, RF-610, RF-707 | Cinco rotinas produzem discagens com cinco formatos de idempotência e cinco leituras do `max_concurrent`. `dial_queue(account_id, lead_id, purpose, run_at, source, source_ref, attempt, status)` com `unique (account_id, source, source_ref, attempt)`, alimentada pelas cinco, consumida por uma única `cron-dial` que respeita simultaneidade por conta com `for update skip locked` e chama `call-place`. Simplifica T-04, T-05 e T-07 de uma vez |
| L-15 | MENOR | Busca em transcrições | RF-419 | Coluna gerada `transcript_tsv tsvector` com configuração `portuguese` e índice GIN; ou `pg_trgm` para trecho exato. Sem isso a busca varre `jsonb` |
| L-16 | MENOR | Roteamento de especialista | RF-506 | `routing_weight` sozinho não faz rodízio. `specialists.last_assigned_at` e `accounts.settings.routing_mode ('area'|'round_robin'|'fixed')` com `fixed_specialist_id` |
| L-17 | MENOR | Inscrição dupla em cadência e quem inscreve | RF-606, RF-607 | Índice único parcial em `cadence_enrollments(cadence_id, lead_id) where status='active'`; gatilho em `leads.stage_id` (ou no `lead_events` de `stage_change`) que inscreve em cadências com `trigger='stage_entered'`. "Humano assumiu" precisa de definição: `lead_events` com `actor='user'` nos últimos N dias |
| L-18 | MENOR | Gravação desligada precisa chegar ao provedor | RF-806 | `agent-publish` desliga retenção de áudio na configuração de privacidade do agente quando a conta desliga gravação; `call-finalize` pula o áudio. Sem isso o provedor grava mesmo com o controle desligado, e o cliente acredita o contrário |
| L-19 | MENOR | Saúde da linha | RF-709 | Quem calcula `phone_lines.health`? `cron-line-health` diário (ou a cada hora) com volume, taxa de atendimento por dia e tendência |
| L-20 | MENOR | Validação do teto de simultaneidade | RNF-13 | `integrations-status` devolve o limite de sessões do provedor e de canais da telefonia; a gravação de `max_concurrent` recusa valor acima do menor deles |
| L-21 | MENOR | Painel | RF-901 a RF-907, RF-518 | Nenhuma função ou visão. Agregações sobre `calls` e `meetings` com RLS no cliente ficam lentas com volume. Visões materializadas por conta e período, ou RPC `dashboard_summary(period)` |
| L-22 | MENOR | Assistente de configuração inicial | RF-911 | `onboarding_state` existe; a lógica que calcula `health` e "o que cada pendência impede" não tem dono. Definir como RPC lida do painel |
| L-23 | MENOR | Consentimento e aviso de gravação | RF-420, RF-810 | Quem preenche `consent_notice_at`? `call-finalize`, a partir do critério de avaliação `aviso_gravacao` aprovado, com o instante do turno em que a frase aparece na transcrição |
| L-24 | MENOR | Fila de exceções: quem cria os itens | RF-909, RF-915 | Definir por gatilho: `tool-transfer` com `queued` e `tool-dnc` criam na hora; `call-finalize` cria por sentimento, avaliação reprovada e falha repetida; `tool-availability` vazio cria "reunião sem especialista"; `cron-credit-watch` cria crédito baixo. Limiares em `account_settings` |

### 2.2 Requisitos órfãos

Órfão: nenhuma tabela, coluna, função, rotina ou rota do `PRD-implementacao.md` o implementa. Parcial: existe um pedaço e falta o resto.

| RF | Estado | O que falta |
|---|---|---|
| RF-005 | órfão de dado | tabela de convites e função de aceite (L-01) |
| RF-114 | órfão | função de mesclagem (L-11) |
| RF-115 | órfão | exportação de leads filtrados; nenhuma função |
| RF-305 | órfão | `playbook-draft` (L-08) |
| RF-409 | parcial | `forward` e `voicemail` sem função de TwiML (T-14) |
| RF-418 | órfão de mecanismo | detecção atribuída a componente que não a fornece no caminho escolhido (T-03) |
| RF-421 | órfão | nenhuma coluna, função ou rotina impõe a duração máxima (L-12) |
| RF-422 | parcial | encerramento exige ferramenta de sistema; marcação do número sem regra (T-02) |
| RF-506 | parcial | só `routing_weight` (L-16) |
| RF-507 | órfão | OAuth e sincronização (L-06) |
| RF-508 | órfão | criação do evento depende do OAuth ausente (L-06) |
| RF-517 | órfão | nenhuma ferramenta apura pelo lado do lead (L-07) |
| RF-703 | parcial | estimativa de custo sem modelo de custo (T-20) |
| RF-706 | parcial | idem, mais falta de vínculo reunião e chamada (T-23) |
| RF-709 | parcial | `health jsonb` sem quem o calcule (L-19) |
| RF-806 | parcial | controle não chega ao provedor (L-18) |
| RF-808 | órfão | função de exclusão (L-10) |
| RF-809 | órfão | função de exportação (L-10) |
| RF-901 | órfão de dado | custo por reunião sem modelo de custo (T-20) |
| RF-912 | órfão | nenhuma coluna registra a ligação de teste (L-03) |
| RF-915 | parcial | limiares citados como "tetos" em `settings jsonb`, sem estrutura |
| RNF-10 | órfão | prazo de 15 dias sem registro de pedido (L-10) |
| RNF-12 | órfão | teto de gasto fora da guarda e sem custo acumulado (T-06, T-20) |
| RNF-13 | órfão | nenhuma validação do teto de simultaneidade (L-20) |

Vinte e quatro requisitos, sendo dezesseis órfãos e oito parciais. Concentração: agenda externa, custo, privacidade e os controles de RF-4xx que o PRD de produto marcou como `[aposta]` ou `[parcial]` justamente por serem os que a referência deixou mortos.

---

## 3. Premissas frágeis

| # | Sev. | Premissa | Por que é frágil | Como checar, antes de qual fatia |
|---|---|---|---|---|
| P-01 | GRAVE | "Acima do teto de 3 s o provedor corta a conexão" (seção 5, RNF-04) | O tempo limite de ferramenta no provedor é configurável por ferramenta e o padrão é maior que 3 s. O corte em 3 s é uma escolha nossa, e o texto a apresenta como fato externo. A meta de 2 s continua correta como experiência, porque silêncio de 2 s na linha já é perceptível | Definir `response_timeout_secs` explicitamente em cada ferramenta na publicação (5 s) e medir p95 e p99 em 20 chamadas de teste com função fria. F2 |
| P-02 | GRAVE | Latência de turno abaixo de 1,2 s (RNF-01) | Depende do modelo de linguagem dentro da chamada, que o documento não escolhe. A tabela de stack só define o modelo fora da chamada. A escolha move latência, custo por minuto e qualidade de chamada de ferramenta | Decidir o modelo na publicação (o mais rápido do catálogo do provedor que sustente chamada de ferramenta em português) e medir em 20 chamadas. F2 |
| P-03 | GRAVE | "Toca em até 8 s" e "ficha em até 60 s" (F2) | A ficha em 60 s inclui: aviso do provedor (10 a 60 s após o fim), download do áudio, classificação e sentimento. `claude-opus-5` sobre transcrição de 10 min leva 15 a 40 s. Somado, passa de 60 s com frequência | Usar `claude-sonnet-5` para classificação, sentimento e avaliação (mais rápido e mais barato), reservando `claude-opus-5` para rascunho de roteiro. Mostrar a ficha em estado "processando" assim que o webhook chega, sem esperar a classificação. Medir em 20 chamadas. F2 |
| P-04 | GRAVE | Configuração autosserviço em menos de uma hora (O4, RF-911) | Comprar número no Brasil exige pacote regulatório na telefonia (CNPJ, endereço, documento), com aprovação em dias. Importar número existente exige credenciais de telefonia e registro no provedor de voz. Conectar calendário Google exige aplicativo OAuth verificado para escopo sensível, com verificação que leva semanas | Abrir o pacote regulatório e o pedido de verificação OAuth em F0, com a conta da plataforma, e medir o prazo real. O checklist da configuração inicial precisa mostrar "aguardando aprovação da operadora" como estado normal do passo. F0 |
| P-05 | GRAVE | Limites das funções de servidor | Função de servidor tem limite de CPU por requisição na ordem de segundos e teto de tempo de parede e memória. `leads-import` com 1.000 linhas e detecção de duplicados em uma requisição, e `call-finalize` baixando e subindo áudio de 10 min, podem bater no limite | Ler os limites do plano contratado; medir importação de 5.000 linhas e finalização de chamada de 15 min. Se estourar: leitura e prévia da planilha no navegador, confirmação envia só as linhas válidas; áudio por transferência direta do provedor ao Storage quando o provedor oferecer URL. F1 e F2 |
| P-06 | MENOR | 10 simultâneas por conta e 25 por instalação (RNF-13) | Com credenciais próprias por cliente, o limite de sessões é do plano de cada cliente no provedor de voz, e o de canais é da conta de telefonia de cada cliente. O número da instalação deixa de ser nosso para controlar | `integrations-status` lê e mostra os limites da conta do cliente; a validação de RNF-13 usa esses valores. Antes da F7 |
| P-07 | MENOR | Preço da chamada disponível no fim | O preço da telefonia chega minutos depois e pode vir nulo na primeira consulta; "o custo para de correr" ao atingir a duração máxima é cobrança do provedor, e só é verificável na fatura | `cron-cost-sync` (T-20); testar uma chamada encerrada por duração máxima e conferir o preço 30 min depois. F2 |
| P-08 | MENOR | 100 discagens por dia por número como teto de reputação | Número heurístico do PRD de produto. Nenhuma operadora publica esse valor | Instrumentar `phone_lines.health` desde a primeira campanha e revisar o teto com a taxa de atendimento por número após quatro semanas. F7 |
| P-09 | MENOR | pg_cron a cada minuto | pg_cron tem granularidade mínima de um minuto e depende de pg_net para chamar funções; um job que demora mais que o intervalo se sobrepõe ao seguinte | Confirmar disponibilidade das duas extensões no plano; todo job usa `for update skip locked` ou lock consultivo (T-15). F2 |
| P-10 | MENOR | Retenção e expurgo resolvidos no nosso lado (RNF-09) | O provedor de voz guarda áudio e transcrição de cada conversa por padrão. Expurgar só no Storage deixa o dado no provedor | `cron-retention` e `lead-erase` apagam a conversa no provedor também; verificar na configuração de privacidade do agente. F2 |
| P-11 | MENOR | `x-conversation-id` preenchido por variável de sistema em cabeçalho | Sustenta-se: variável dinâmica em cabeçalho de ferramenta é padrão suportado. Registro só para constar que foi checado | Confirmar na primeira publicação de F2 |
| P-12 | MENOR | Região do projeto de dados | O provedor de voz chama nossas ferramentas a partir de servidores fora do Brasil. Projeto em região distante do provedor soma ida e volta a cada ferramenta; região distante do usuário soma latência à interface | Medir latência das ferramentas com o projeto em São Paulo e em Virgínia antes de fixar. F0 |

---

## 4. Ordem de construção

**O-01. GRAVE. Seis funções e cinco áreas de interface não estão em fatia nenhuma.**
Sem fatia: `call-audio`, `call-cancel`, `cron-speed-to-lead`, `cron-retention`, `cron-credit-watch`, `integrations-status`. Sem fatia: painel (RF-901 a RF-907), configuração inicial (RF-911), auditoria consultável (RF-009), telas de configuração (conta, integrações, discagem, bloqueios, privacidade, equipe, webhooks), tela de números. Proposta: `integrations-status` e configuração inicial em F0 (a F2 depende de credenciais salvas e testadas); `call-audio`, `call-cancel` e tela de números em F2; `cron-speed-to-lead` em F2 (a F1 só enfileira); `cron-retention` e privacidade em F2 (o primeiro áudio gravado já está sob RNF-09); `cron-credit-watch` em F2; painel em F4 com custo desde F2; auditoria consultável em F0.

**O-02. GRAVE. O portão entre F2 e F3 é aplicável, mas não com o que está escrito.**
"F3 completa" é propriedade da versão implantada, e "quem aplica o portão é a guarda" exige estado. Precisa de três coisas que não existem: conjunto de números de teste por conta, sinalizador de liberação gravado por migração quando a F3 entra, e a ligação de teste bem-sucedida por conta (RF-912). Com L-03, o portão fica assim: guarda recusa `phone_e164` fora de `account_test_numbers` enquanto `feature_flags.real_dialing` for falso ou `first_test_call_ok_at` for nulo. Campanha exige ainda as 50 ligações manuais medidas (regra da F7), que precisa de um contador consultável em `accounts` ou em visão sobre `calls`.

**O-03. GRAVE. F0 precisa começar duas esperas externas.**
Pacote regulatório de telefonia e verificação do aplicativo OAuth (P-04) levam dias e semanas. Se começarem na F5, a F5 espera. Também o domínio de envio de e-mail (Resend) precisa de DNS verificado antes do primeiro convite de equipe em F0.

**O-04. GRAVE. F6 depende de um item de F7.**
Critério da F6: "caixa postal é reprogramada para outro turno". Detecção de secretária eletrônica está em F7. Ou o critério sai da F6, ou a detecção entra em F2, onde pertence: ela é configuração de publicação e de `call-place` (T-03), e F2 já disca. Recomendo F2.

**O-05. GRAVE. A decisão de T-01 precisa ser tomada antes de F2, e a de T-16 antes de F3.**
Um agente por propósito muda tabela e `call-place`; ensaiar pelo agente publicado muda `rehearsal-turn` e o contrato das ferramentas. Tomadas depois, as duas refazem a F2 e a F3.

**O-06. MENOR. F2 sem ferramenta nenhuma é aceitável, e o documento deveria dizer isso.**
Em F2 a Sarah liga para número de teste com o playbook de descoberta e nenhuma ferramenta (as primeiras entram em F3 e F4). O roteiro de descoberta, tal como escrito, propõe reunião e não consegue marcar. A camada 2 de descoberta precisa de variante "sem agenda" para F2 a F4, ou o critério de aceite da F2 deve dizer que a Sarah não oferece horário. Sem isso a chamada de teste termina em promessa vazia.

**O-07. MENOR. Custo "medido desde F2" (tabela de riscos do PRD) sem modelo de custo em F2.**
`call_costs` e `cron-cost-sync` (T-20) entram em F2.

**O-08. MENOR. Interface de F0 e F1 não tem cobertura de teste declarada.**
Seção 9: "Interface | Fluxos de F2 e F3 | Playwright". Convite, papéis e importação com prévia são fluxos de F0 e F1 e têm critérios de aceite ponta a ponta no PRD de produto.

Fora desses pontos a sequência fecha: F1 não depende de voz; F3 depende só de F2; F4 depende de F2; F5 depende de F0 e F4 (o roteiro precisa qualificar antes de agendar); F6 depende de F5; F7 depende de tudo. Nenhuma fatia depende de fatia posterior depois das correções O-01 a O-04.

---

## 5. Riscos de operação não endereçados

**R-01. GRAVE. Provedor de voz cai no meio de uma chamada.**
A chamada telefônica cai; `calls` fica `in_progress`; `cron-call-recovery` consulta o provedor, que está fora, e tenta de novo a cada 2 min para sempre. Em campanha, o despachante continua discando, cada chamada falha, e a campanha consome a lista inteira marcando tentativa em todos os alvos.
Proposta: recuperação com idade máxima: `in_progress` há mais de `max_duration + 10 min` sem resposta do provedor vira `ended` com `end_reason='provider_lost'`, item na fila "chamada caiu" e reprogramação pela política de RF-417; a transcrição fica pendente e a rotina tenta buscá-la por 24 h. Disjuntor por conta e por campanha: N falhas consecutivas de provedor em M minutos pausam a campanha e as rotinas de discagem, criam item na fila com severidade alta e gravam em `job_runs`. Retomada manual.

**R-02. GRAVE. Banco indisponível durante uma campanha.**
As chamadas em curso continuam no provedor. Toda ferramenta falha, e a Sarah diz "deixa eu confirmar com o time" para tudo, inclusive para "não me liga mais". O pedido de bloqueio se perde, e é o único caso com exposição jurídica. Os webhooks de fim falham. pg_cron está no banco e para junto; ao voltar, todos os jobs disparam no mesmo minuto.
Proposta: `call-finalize` relê as invocações de ferramenta da transcrição e reaplica as que falharam: `tool-dnc` com erro vira `dnc_entries` na finalização, `tool-transfer` com erro vira item na fila. O roteiro da camada 1 instrui: quando o bloqueio falhar, a Sarah promete o bloqueio em voz alta e encerra, sem insistir. Após volta do banco, as rotinas usam `skip locked` e limite por execução (25 itens), o que espalha a retomada. O provedor guarda as conversas, então a finalização tardia recupera transcrição e áudio.

**R-03. GRAVE. Migração falha em produção.**
O documento diz "aplicadas por CI" e para aí. Uma migração que falha no meio deixa schema e código em versões diferentes.
Proposta: padrão expandir e contrair (nenhuma migração remove ou renomeia coluna que o código em produção lê; remoção só na versão seguinte); ponto de restauração antes de cada implantação; `create index concurrently` fora de transação e em migração própria; correção sempre para a frente, sem migração de reversão; verificação pós-implantação que executa a suíte de isolamento e um `select` por tabela contra o banco de produção; nenhum segredo, URL ou chave em arquivo de migração (T-26). Simulação no CI: aplicar todas as migrações sobre um dump anonimizado de homologação, além do banco vazio que RNF-14 já exige.

**R-04. GRAVE. Telefonia recusa ou o número é marcado como spam no meio de uma campanha.**
Taxa de atendimento cai por número e a campanha segue queimando a base. RF-709 mostra; nada age.
Proposta: `cron-line-health` calcula taxa de atendimento por linha em janela deslizante de 50 tentativas; abaixo do limiar da conta, a linha sai do rodízio automaticamente com item na fila. Campanha com todas as linhas fora pausa sozinha.

**R-05. GRAVE. E-mail transacional falha e a métrica norte perde a fonte primária.**
`cron-attestation` a cada 30 min; se o envio falha, o que acontece? Sem marca de envio, reenvia a cada 30 min; com marca gravada antes do envio, nunca envia.
Proposta: `meeting_attestations.sent_at`, `send_attempts`, `last_send_error`; marca só após 2xx do provedor de e-mail; até 5 tentativas com recuo; esgotadas, item na fila para apuração manual. O mesmo padrão para `outbound_deliveries`.

**R-06. MENOR. Alguém edita o agente no painel do provedor.**
`published_hash` detecta divergência do nosso lado e não do lado do provedor.
Proposta: `integrations-status` busca a configuração do agente publicado e compara o hash dos campos que controlamos; divergência vira estado "alterado fora da plataforma" no indicador de publicação, com botão de republicar.

**R-07. MENOR. Rotação de segredos.**
Trocar o `x-tool-secret` da conta exige republicar os quatro agentes, e durante a janela as chamadas em curso falham em toda ferramenta.
Proposta: aceitar dois segredos por conta (`current`, `previous`) por 24 h após a rotação.

**R-08. MENOR. Assinatura em tempo real sobre `calls` transmite a transcrição inteira.**
`calls.transcript jsonb` cresce a dezenas de KB. Cada atualização emitida para o navegador carrega a linha inteira.
Proposta: visão ou tabela fina `call_live(call_id, status, started_at, duration_sec, purpose, lead_id)` como alvo da assinatura; a ficha carrega a transcrição por consulta.

**R-09. MENOR. Custo fora de controle por laço de automação.**
Cadência que inscreve o lead de novo na saída, lead com dois telefones que gera duas linhas, intake duplicado que dispara duas ligações imediatas. RF-010 (teto diário) cobre o dano, mas o dano do dia inteiro.
Proposta: `dial_queue` com unicidade por fonte (L-14), e alarme de RF-613 quando o volume de uma rotina passa de 3 vezes a média móvel.

**R-10. MENOR. Horário de verão e fuso em rotina.**
pg_cron roda em UTC; janela por dia da semana no fuso do lead; especialista em outro fuso. O Brasil não tem horário de verão hoje, e a regra pode voltar.
Proposta: toda comparação de janela usa `at time zone` com o fuso da entidade, nunca aritmética de horas; teste da guarda com leads em `America/Manaus` e `America/Noronha`.

---

## Resumo por severidade

| Severidade | Quantidade | Números |
|---|---|---|
| BLOQUEADOR | 2 | T-01, T-04 |
| GRAVE | 43 | T-02, T-03, T-05 a T-17, T-20, L-01 a L-12, P-01 a P-05, O-01 a O-05, R-01 a R-05 |
| MENOR | 35 | T-18, T-19, T-21 a T-26, L-13 a L-24, P-06 a P-12, O-06 a O-08, R-06 a R-10 |

Os cinco que decidem se a F2 e a F3 precisam ser refeitas: T-01 (agente por propósito), T-04 (rotinas sem caminho para discar), T-09 (token na boca do modelo), T-16 (ensaio com outro agente) e T-17 (resgate por inferência). Os dois que decidem se a métrica norte é confiável: T-13 (apuração por robô de e-mail) e T-20 (custo sem modelo).
