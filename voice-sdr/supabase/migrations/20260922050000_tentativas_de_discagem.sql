-- A tentativa de discagem: o registro de toda decisão da guarda, inclusive a
-- recusada (seção 3.5, T-05, T-04, RF-406).
-- Referência: docs/PRD-implementacao.md seções 3.5, 3.9 e 6,
-- docs/revisao-tecnica.md T-04, T-05 e T-06, docs/PRD.md RF-406, RF-802,
-- RF-803, RF-010 e RNF-12.
--
-- Ela chega antes de `guard_dial` (US-058) porque os três índices são parte da
-- correção de T-05 tanto quanto a trava: a guarda conta tentativas do dia em
-- três recortes diferentes dentro de uma transação que segura um advisory lock,
-- e contagem que varre a tabela inteira transforma a trava em fila de espera.
-- Quatro decisões que a tabela carrega:
--
-- 1. **Toda tentativa é gravada, inclusive a recusada** (RF-406, passo 9 da
--    seção 6). É isso que faz o teto diário significar alguma coisa: se só a
--    ligação que saiu virasse linha, uma conta no teto poderia pedir discagem
--    mil vezes sem deixar rastro, e o operador não teria como saber por que a
--    Sarah não ligou. `outcome` guarda o desfecho OU o motivo da recusa, na
--    mesma coluna, porque são a mesma pergunta: o que aconteceu com este
--    pedido.
-- 2. **`actor` e `source` são a correção de T-04.** Cinco rotinas discam sem
--    usuário, e `call-place` aceita as duas autenticações: JWT de gente, que
--    grava `actor='user'` com `auth.uid()`, e segredo interno de serviço, que
--    grava `actor='system'` com `actor_id` nulo e `source` com o nome da
--    rotina. Sem as duas colunas, "quem mandou discar" se perderia justamente
--    nas discagens que ninguém pediu, que são as que alguém vai querer
--    explicar.
-- 3. **Os três índices de T-05, nome por nome.** `(account_id, attempted_at)`
--    é o teto diário da conta (passo 7); `(account_id, phone_e164,
--    attempted_at)` é o intervalo mínimo e o teto por número (passos 5 e 6);
--    `(phone_line_id, attempted_at)` é o teto da linha de origem (passo 8).
--    São os três recortes das contagens, e é por isso que o teste do catálogo
--    cobra as colunas na ordem declarada: índice removido numa migração futura
--    não quebraria consulta nenhuma — a guarda apenas passaria a contar
--    devagar, segurando a trava, e ninguém perceberia até a conta discar em
--    lote.
-- 4. **Classe Servidor da seção 3.9.** Membro lê; ninguém escreve pelo
--    cliente. Quem grava é `guard_dial`, dentro da mesma transação da decisão.
--    Uma política de insert de cliente daria à conta o poder de inventar
--    tentativas — e, como a contagem do teto é a própria tabela, inventar
--    tentativas é desligar o teto por dentro, ou gastar a cota de outro.

create table public.call_attempts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- Para quem se tentou ligar. Nulo quando a discagem é para um número de
  -- teste, que não é lead de ninguém. Cascata pelo motivo de `calls.lead_id`:
  -- RF-808 apaga todos os dados do lead, e `phone_e164` aqui é dado pessoal
  -- dele tanto quanto a transcrição é.
  lead_id uuid references public.leads (id) on delete cascade,
  -- Para qual número, em E.164, com a mesma régua de `leads.phone_e164`, de
  -- `phone_lines.e164` e de `dnc_entries.phone_e164`. Régua diferente faria a
  -- contagem do passo 6 procurar uma forma do telefone que a tabela de leads
  -- nunca escreve, e o teto por número deixaria de encontrar as tentativas que
  -- ele mesmo gravou.
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  -- Por qual linha de origem. Nulo em toda recusa anterior ao passo 8, porque
  -- a linha só é escolhida ali: tentativa recusada por bloqueio não chegou a
  -- ter linha, e inventar uma faria o teto da linha contar tentativa que ela
  -- não fez. `on delete set null` pelo motivo de `calls.phone_line_id`: apagar
  -- uma linha é configuração, e configuração apagada não leva o histórico
  -- junto.
  phone_line_id uuid references public.phone_lines (id) on delete set null,
  -- O desfecho OU o motivo da recusa. `placed` é a discagem que saiu; os nove
  -- motivos são os da seção 6, um por passo que recusa, e `daily_per_account`
  -- e `daily_spend_cap` são os dois do passo 7. Os dois nomes que `bypass`
  -- aceita (`min_interval` e `daily_per_number`) são exatamente os códigos que
  -- a recusa carrega, e a coincidência é de propósito: a campanha pula o passo
  -- pelo mesmo nome com que ele aparece no registro.
  --
  -- `telefone inválido` não está na lista, e a ausência tem razão: o número que
  -- não normaliza para E.164 não caberia na linha — o check de `phone_e164`
  -- recusaria a gravação antes de qualquer motivo. Essa recusa é da borda, e
  -- vive em `guarda.ts` (US-059), que normaliza antes de chamar a guarda.
  outcome text not null check (outcome in (
    'placed',
    'dialing_paused', 'real_dialing_gate', 'dnc_active', 'outside_window',
    'min_interval', 'daily_per_number', 'daily_per_account',
    'daily_spend_cap', 'no_phone_line'
  )),
  -- Quem mandou discar (T-04). `user` é gente com sessão e exige `actor_id`;
  -- `system` é rotina do servidor e exige `actor_id` nulo. Não há `agent` aqui,
  -- ao contrário de `audit_log`: a Sarah conversa, não disca.
  actor text not null check (actor in ('user', 'system')),
  -- Sem chave estrangeira para `profiles` pelo motivo de `audit_log.actor_id`:
  -- o registro precisa sobreviver à saída de quem o gerou.
  actor_id uuid,
  -- De onde veio o pedido: `manual` na discagem de pessoa, e o nome da rotina
  -- na discagem de rotina (`cron-speed-to-lead`, `cron-cadence`, ...). Não é
  -- lista fechada porque as rotinas chegam nas fatias seguintes, e uma lista
  -- que precisasse de migração a cada rotina nova seria uma lista que alguém
  -- contornaria.
  source text not null check (length(btrim(source)) > 0),
  -- De qual campanha veio a discagem. Sem chave estrangeira pela razão
  -- declarada em `calls.campaign_id`: `campaigns` é da F7, e a restrição entra
  -- com a tabela.
  campaign_id uuid,
  -- Qual chamada nasceu desta tentativa. Nulo em toda recusa, e nulo também no
  -- instante entre a decisão e o insert da chamada. `on delete set null` e
  -- nunca cascata: a tentativa é o livro-caixa do teto diário, e apagar
  -- chamadas não pode devolver cota para a conta.
  call_id uuid references public.calls (id) on delete set null,
  attempted_at timestamptz not null default now()
);

comment on table public.call_attempts is
  'Toda tentativa de discagem, inclusive a recusada (RF-406, passo 9 da seção 6). Classe Servidor da seção 3.9: membro lê, ninguém escreve pelo cliente — quem grava é guard_dial, na mesma transação da decisão. É a contagem desta tabela que faz o teto diário significar alguma coisa.';

comment on column public.call_attempts.lead_id is
  'Para quem se tentou ligar. Nulo quando o destino é número de teste, que não é lead de ninguém. Cascata porque RF-808 apaga todos os dados do lead, e phone_e164 aqui é dado pessoal dele.';

comment on column public.call_attempts.phone_e164 is
  'Número de destino, com a mesma régua de leads.phone_e164 e dnc_entries.phone_e164. Régua diferente faria o teto por número não encontrar as tentativas que ele mesmo gravou.';

comment on column public.call_attempts.phone_line_id is
  'Linha de origem escolhida no passo 8. Nulo em toda recusa anterior a ele: tentativa recusada por bloqueio não chegou a ter linha, e inventar uma faria o teto da linha contar tentativa que ela não fez.';

comment on column public.call_attempts.outcome is
  'O desfecho ou o motivo da recusa, na mesma coluna: placed e os nove motivos da seção 6, um por passo que recusa (o passo 7 tem dois, teto de ligações e teto de gasto). Telefone inválido não está na lista porque o check de phone_e164 recusaria a linha antes — essa recusa é da borda, em guarda.ts.';

comment on column public.call_attempts.actor is
  'Quem mandou discar (T-04): user é gente com sessão, system é rotina do servidor. Não há agent, ao contrário de audit_log — a Sarah conversa, não disca.';

comment on column public.call_attempts.actor_id is
  'Usuário que pediu a discagem, de auth.uid(). Nulo quando actor é system. Sem chave estrangeira pelo motivo de audit_log.actor_id: o registro sobrevive a quem o gerou.';

comment on column public.call_attempts.source is
  'De onde veio o pedido: manual, ou o nome da rotina que discou (T-04). Não é lista fechada porque as rotinas chegam nas fatias seguintes.';

comment on column public.call_attempts.campaign_id is
  'De qual campanha veio a discagem. Sem chave estrangeira por ordem de fatia: campaigns é da F7, como em calls.campaign_id.';

comment on column public.call_attempts.call_id is
  'A chamada que nasceu desta tentativa, nula em toda recusa. on delete set null e nunca cascata: a tentativa é o livro-caixa do teto diário, e apagar chamadas não pode devolver cota para a conta.';

-- Gente sem autor identificado não é registro de quem mandou discar, é ruído; e
-- rotina com autor seria autoria inventada. As duas metades da correção de T-04
-- só valem juntas.
alter table public.call_attempts
  add constraint call_attempts_autor_de_pessoa
    check (actor <> 'user' or actor_id is not null),
  add constraint call_attempts_rotina_sem_autor
    check (actor <> 'system' or actor_id is null);

comment on constraint call_attempts_autor_de_pessoa on public.call_attempts is
  'Discagem de pessoa grava auth.uid() (T-04). Tentativa de gente sem autor não explica nada para quem for perguntar por que a Sarah ligou.';

comment on constraint call_attempts_rotina_sem_autor on public.call_attempts is
  'Discagem de rotina grava actor_id nulo e o nome da rotina em source (T-04). Autor numa discagem que ninguém pediu seria autoria inventada.';

-- Os três índices de T-05 ---------------------------------------------------------
-- Passo 7: quantas tentativas esta conta fez hoje.
create index call_attempts_teto_da_conta
  on public.call_attempts (account_id, attempted_at);

comment on index public.call_attempts_teto_da_conta is
  'A contagem do passo 7 da guarda: tentativas da conta no dia, contra daily_calls_cap (T-05, RF-010).';

-- Passos 5 e 6: quando foi a última tentativa a este número, e quantas houve
-- hoje. A mesma ordem de colunas serve às duas perguntas, porque as duas
-- recortam (conta, número) e varrem a faixa de tempo.
create index call_attempts_teto_por_numero
  on public.call_attempts (account_id, phone_e164, attempted_at);

comment on index public.call_attempts_teto_por_numero is
  'As contagens dos passos 5 e 6 da guarda: intervalo mínimo desde a última tentativa ao mesmo número e tentativas do dia a ele (T-05, RF-802, RF-803).';

-- Passo 8: quantas tentativas esta linha de origem fez hoje. Sem `account_id`
-- na frente de propósito: a linha já pertence a uma conta, e o recorte é ela.
create index call_attempts_teto_da_linha
  on public.call_attempts (phone_line_id, attempted_at);

comment on index public.call_attempts_teto_da_linha is
  'A contagem do passo 8 da guarda: tentativas da linha de origem no dia, antes do rodízio entre as in_rotation (T-05). Sem account_id na frente porque a linha já pertence a uma conta.';

-- Isolamento (classe Servidor da seção 3.9) ---------------------------------------
alter table public.call_attempts enable row level security;

create policy call_attempts_leitura_de_membro
  on public.call_attempts for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy call_attempts_leitura_de_membro on public.call_attempts is
  'Classe Servidor: membro lê as tentativas da própria conta, inclusive o viewer — é por elas que a tela explica por que a Sarah não ligou. Não há política de insert, update nem delete, nem para o owner: como a contagem do teto é a própria tabela, inserir tentativa é desligar o teto por dentro, e apagá-la é devolver cota que já foi gasta.';

-- Sem gatilho de auditoria, e sem `updated_at`: a tentativa é um fato do
-- instante em que foi decidida, e ninguém a edita. A trilha do que mudou é de
-- quem muda; esta tabela só cresce.
