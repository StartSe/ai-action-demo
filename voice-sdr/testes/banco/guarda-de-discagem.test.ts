// A guarda de discagem: os nove passos da seção 6 numa transação só (T-05,
// T-06).
//
// O que este arquivo prova, um teste por passo:
//
// 1. **A precedência do passo 0**, que é a parte da ordem que não se vê de
//    outro jeito: com a conta pausada E o número bloqueado E fora da janela, o
//    motivo é `dialing_paused`. Mover o passo 0 para depois do passo 4 derruba
//    só este teste — nenhum outro notaria.
// 2. Os oito passos seguintes, cada um com o número que a recusa carrega: o
//    portão de lead real, a lista de bloqueio, a janela no fuso do LEAD, o
//    intervalo mínimo (59 minutos recusa, 61 aceita), o teto por número (a
//    quarta tentativa do dia), o teto da conta (a chamada 201), o teto de gasto
//    somando `call_costs` e o rodízio entre as linhas em rotação.
// 3. **Toda decisão vira linha em `call_attempts`, inclusive a recusa** (passo
//    9, RF-406), com o motivo na coluna `outcome`.
// 4. **`bypass` não pula os passos 0, 2, 3 e 4**: o teste passa os nove motivos
//    dentro do array e os quatro continuam recusando.
// 5. Só `service_role` executa: `authenticated` e `anon` recebem 42501.
//
// O QUE ESTE ARQUIVO NÃO ALCANÇA, e por isso existe `guarda-concorrencia.test.ts`:
// duas discagens simultâneas disputando o mesmo teto. PGlite atende uma conexão
// só e nunca disputa o advisory lock.
//
// Referência: migração 20260922110000_guarda_de_discagem.sql,
// docs/PRD-implementacao.md seção 6, docs/revisao-tecnica.md T-05, T-06, T-21,
// R-10, L-03 e O-02, docs/PRD.md RF-010, RF-406, RF-801 a RF-804 e RNF-12.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  UUID,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

/** Quarta-feira, 14h em São Paulo: dentro da janela padrão de 09h às 18h. */
const QUARTA_14H = '2026-09-23T17:00:00Z'
/** A mesma quarta, 22h em São Paulo: fora da janela, e depois do fim do dia útil. */
const QUARTA_22H = '2026-09-24T01:00:00Z'
/** 18h30 em São Paulo e 17h30 em Manaus: fora de uma janela e dentro da outra. */
const QUARTA_18H30_SP = '2026-09-23T21:30:00Z'
/** Quinta, 9h em São Paulo: a próxima abertura depois das 22h de quarta. */
const QUINTA_9H = '2026-09-24T12:00:00Z'

const SAO_PAULO = 'America/Sao_Paulo'
const MANAUS = 'America/Manaus'

/** O número do lead, e o mesmo que entra na lista de teste. */
const DESTINO = '+5511999990001'
/** O mesmo número escrito como a planilha do cliente costuma escrever. */
const DESTINO_NACIONAL = '11999990001'

/** Os nove motivos da seção 6, que o teste do bypass passa inteiros. */
const TODOS_OS_MOTIVOS = [
  'dialing_paused',
  'real_dialing_gate',
  'dnc_active',
  'outside_window',
  'min_interval',
  'daily_per_number',
  'daily_per_account',
  'daily_spend_cap',
  'no_phone_line',
]

interface Decisao {
  allowed: boolean
  reason: string
  dados: Record<string, unknown>
  phone_line_id: string | null
}

interface Pedido {
  telefone?: string
  leadId?: string | null
  bypass?: string[]
  instante?: string
  source?: string
}

let banco: BancoDeTeste
let contaId: string
let leadId: string
let linhaId: string
/** Quem puxa o freio e quem remove o bloqueio: os dois campos exigem autor. */
let operadorId: string

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  await banco.comoServico()

  const { rows: contas } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name, timezone) values ($1, $2) returning id`,
    ['Guarda', SAO_PAULO],
  )
  contaId = contas[0]!.id

  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Lead da guarda', $2, 'cenario') returning id`,
    [contaId, DESTINO],
  )
  leadId = leads[0]!.id

  const { rows: linhas } = await banco.sql.query<{ id: string }>(
    `insert into public.phone_lines (account_id, e164, label)
     values ($1, '+5511400000001', 'Linha da guarda') returning id`,
    [contaId],
  )
  linhaId = linhas[0]!.id

  operadorId = await banco.criarUsuario('operador@guarda.test', 'Operadora')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'operator')`,
    [contaId, operadorId],
  )
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

/**
 * O cenário de partida, refeito a cada teste: conta não pausada, portão fechado
 * com o destino na lista de teste (que é o estado real da F2), sem bloqueio,
 * sem tentativa, sem custo e com uma linha só em rotação.
 */
beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.call_costs where account_id = $1', [contaId])
  await banco.sql.query('delete from public.call_attempts where account_id = $1', [contaId])
  await banco.sql.query('delete from public.calls where account_id = $1', [contaId])
  await banco.sql.query('delete from public.dnc_entries where account_id = $1', [contaId])
  await banco.sql.query('delete from public.account_test_numbers where account_id = $1', [contaId])
  await banco.sql.query(
    `delete from public.phone_lines where account_id = $1 and id <> $2`,
    [contaId, linhaId],
  )

  await banco.sql.query(
    `update public.accounts
        set dialing_paused_at = null,
            dialing_paused_by = null,
            dialing_paused_reason = null,
            timezone = $2
      where id = $1`,
    [contaId, SAO_PAULO],
  )
  // A bandeira e a marca da primeira chamada voltam ao estado da F2: portão
  // fechado. A marca só se escreve com o parâmetro de sessão de `call-finalize`.
  await banco.sql.exec(`
    begin;
    select set_config('app.primeira_chamada_de_teste', 'on', true);
    update public.accounts
       set first_test_call_ok_at = null,
           feature_flags = jsonb_set(feature_flags, '{real_dialing}', 'false'::jsonb)
     where id = '${contaId}';
    commit;
  `)
  await banco.sql.query(`update public.leads set timezone = null where id = $1`, [leadId])
  await banco.sql.query(
    `update public.account_settings
        set min_interval_minutes = 60,
            daily_attempts_per_number = 3,
            daily_calls_cap = 200,
            daily_spend_cap_cents = null
      where account_id = $1`,
    [contaId],
  )
  await banco.sql.query(
    `update public.phone_lines
        set enabled = true, in_rotation = true, outbound_enabled = true, daily_cap = 100
      where id = $1`,
    [linhaId],
  )
  await banco.sql.query(
    `insert into public.account_test_numbers (account_id, phone_e164, label)
     values ($1, $2, 'Número de teste')`,
    [contaId, DESTINO],
  )
})

/** Chama a guarda com o cenário padrão, e o que o teste quiser trocar. */
async function guarda(pedido: Pedido = {}): Promise<Decisao> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<Decisao>(
    `select allowed, reason, dados, phone_line_id
       from public.guard_dial(
         p_account_id => $1::uuid,
         p_phone_e164 => $2::text,
         p_lead_id => $3::uuid,
         p_actor => 'system',
         p_actor_id => null,
         p_source => $4::text,
         p_campaign_id => null,
         p_bypass => $5::text[],
         p_instante => $6::timestamptz
       )`,
    [
      contaId,
      pedido.telefone ?? DESTINO,
      pedido.leadId === undefined ? leadId : pedido.leadId,
      pedido.source ?? 'manual',
      pedido.bypass ?? [],
      pedido.instante ?? QUARTA_14H,
    ],
  )
  return rows[0]!
}

/** Escreve uma tentagem já concluída, para as contagens dos passos 5, 6, 7 e 8. */
async function tentativaAntiga(opcoes: {
  telefone?: string
  minutosAtras: number
  linha?: string | null
  quantas?: number
}): Promise<void> {
  await banco.comoServico()
  await banco.sql.query(
    `insert into public.call_attempts
       (account_id, phone_e164, phone_line_id, outcome, actor, source, attempted_at)
     select $1, $2, $3, 'placed', 'system', 'cenario',
            $4::timestamptz - make_interval(mins => $5::integer)
       from generate_series(1, $6::integer)`,
    [
      contaId,
      opcoes.telefone ?? DESTINO,
      opcoes.linha === undefined ? linhaId : opcoes.linha,
      QUARTA_14H,
      opcoes.minutosAtras,
      opcoes.quantas ?? 1,
    ],
  )
}

/** Bloqueia o número na lista de não perturbe. */
async function bloquear(telefone = DESTINO): Promise<void> {
  await banco.comoServico()
  await banco.sql.query(
    `insert into public.dnc_entries (account_id, phone_e164, reason, source)
     values ($1, $2, 'Pediu para não ligar', 'lead_request')`,
    [contaId, telefone],
  )
}

/** Puxa o freio de emergência da conta. */
async function pausar(): Promise<void> {
  await banco.comoServico()
  await banco.sql.query(
    `update public.accounts
        set dialing_paused_at = now(),
            dialing_paused_by = $2,
            dialing_paused_reason = 'Freio do teste'
      where id = $1`,
    [contaId, operadorId],
  )
}

// Passo 0: a precedência ------------------------------------------------------

test('passo 0: conta pausada recusa antes do bloqueio e da janela', async () => {
  await pausar()
  await bloquear()

  // Os três motivos verdadeiros ao mesmo tempo: pausada, bloqueada e às 22h.
  // O que volta é o passo 0, e é isso que prova a ordem.
  const decisao = await guarda({ instante: QUARTA_22H })

  expect(decisao.allowed).toBe(false)
  expect(decisao.reason).toBe('dialing_paused')
  expect(decisao.dados['paused_at']).toBeTruthy()
})

// Passo 1: a normalização -----------------------------------------------------

test('passo 1: número em forma nacional trava e bloqueia no mesmo lugar do E.164', async () => {
  await bloquear(DESTINO)

  const decisao = await guarda({ telefone: DESTINO_NACIONAL })

  expect(decisao.reason).toBe('dnc_active')
  expect(decisao.dados['phone_e164']).toBe(DESTINO)

  // E a tentativa é gravada na forma normalizada, senão o teto por número
  // contaria duas séries para o mesmo telefone.
  const { rows } = await banco.sql.query<{ phone_e164: string }>(
    'select phone_e164 from public.call_attempts where account_id = $1',
    [contaId],
  )
  expect(rows.map((linha) => linha.phone_e164)).toEqual([DESTINO])
})

test('passo 1: número que não normaliza é erro de quem chamou, não recusa', async () => {
  await banco.comoServico()
  const erro = await guarda({ telefone: '12345' }).then(
    () => null,
    (erro: { code?: string }) => erro,
  )

  expect(erro?.code).toBe('22023')
})

// Passo 2: o portão de lead real ----------------------------------------------

test('passo 2: com o portão fechado, só número da lista de teste sai', async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.account_test_numbers where account_id = $1', [contaId])

  const recusada = await guarda()
  expect(recusada.reason).toBe('real_dialing_gate')
  expect(recusada.dados['real_dialing']).toBe(false)

  await banco.sql.query(
    `insert into public.account_test_numbers (account_id, phone_e164, label)
     values ($1, $2, 'Número de teste')`,
    [contaId, DESTINO],
  )
  const aceita = await guarda()
  expect(aceita.allowed).toBe(true)
  expect(aceita.reason).toBe('placed')
})

test('passo 2: portão aberto exige as duas metades, a bandeira e a primeira chamada', async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.account_test_numbers where account_id = $1', [contaId])
  await banco.sql.query(
    `update public.accounts
        set feature_flags = jsonb_set(feature_flags, '{real_dialing}', 'true'::jsonb)
      where id = $1`,
    [contaId],
  )

  // Bandeira ligada e `first_test_call_ok_at` nulo: o portão continua fechado.
  expect((await guarda()).reason).toBe('real_dialing_gate')

  // A marca da primeira chamada de teste só se escreve com o parâmetro de
  // sessão que `call-finalize` levanta — é o gatilho de `operacao_da_conta`.
  await banco.sql.exec(`
    begin;
    select set_config('app.primeira_chamada_de_teste', 'on', true);
    update public.accounts set first_test_call_ok_at = now()
     where id = '${contaId}';
    commit;
  `)

  // Com as duas metades, o portão abre para número que não é de teste.
  expect((await guarda()).allowed).toBe(true)
})

// Passo 3: a lista de bloqueio ------------------------------------------------

test('passo 3: número em dnc_entries ativa é recusado com o motivo do bloqueio', async () => {
  await bloquear()

  const decisao = await guarda()

  expect(decisao.allowed).toBe(false)
  expect(decisao.reason).toBe('dnc_active')
  expect(decisao.dados['dnc_reason']).toBe('Pediu para não ligar')
  expect(decisao.dados['dnc_source']).toBe('lead_request')
})

test('passo 3: bloqueio removido deixa de recusar', async () => {
  await bloquear()
  await banco.sql.query(
    `update public.dnc_entries
        set removed_at = now(), removed_by = $2, removal_reason = 'Engano'
      where account_id = $1`,
    [contaId, operadorId],
  )

  expect((await guarda()).allowed).toBe(true)
})

/**
 * Tira o destino da lista de teste e abre o portão da fatia. É o cenário de um
 * lead de verdade, e é o único em que a janela do passo 4 vale: número de
 * teste não tem lead do outro lado para proteger (US-248).
 */
async function comoLeadReal(): Promise<void> {
  await banco.comoServico()
  await banco.sql.query('delete from public.account_test_numbers where account_id = $1', [contaId])
  await banco.sql.query(
    `update public.accounts
        set feature_flags = jsonb_set(feature_flags, '{real_dialing}', 'true'::jsonb)
      where id = $1`,
    [contaId],
  )
  await banco.sql.exec(`
    begin;
    select set_config('app.primeira_chamada_de_teste', 'on', true);
    update public.accounts set first_test_call_ok_at = now()
     where id = '${contaId}';
    commit;
  `)
}

// Passo 4: a janela, no fuso do lead ------------------------------------------

test('passo 4: 22h é recusada citando a janela e a próxima abertura', async () => {
  await comoLeadReal()
  const decisao = await guarda({ instante: QUARTA_22H })

  expect(decisao.allowed).toBe(false)
  expect(decisao.reason).toBe('outside_window')
  expect(decisao.dados['timezone']).toBe(SAO_PAULO)
  expect(new Date(String(decisao.dados['next_open_at'])).toISOString()).toBe(
    new Date(QUINTA_9H).toISOString(),
  )
})

test('passo 4: a janela é lida no fuso do LEAD, e não no da conta', async () => {
  await comoLeadReal()
  await banco.sql.query('update public.leads set timezone = $2 where id = $1', [leadId, MANAUS])

  // 18h30 em São Paulo (fora) é 17h30 em Manaus (dentro). Somar horas em vez de
  // `at time zone` recusaria esta ligação.
  const decisao = await guarda({ instante: QUARTA_18H30_SP })

  expect(decisao.allowed).toBe(true)

  await banco.sql.query('update public.leads set timezone = null where id = $1', [leadId])
  expect((await guarda({ instante: QUARTA_18H30_SP })).reason).toBe('outside_window')
})

test('passo 4: número da lista de teste liga fora da janela (US-248)', async () => {
  // A janela protege o lead de ser incomodado fora de hora. No número de teste
  // não há lead do outro lado: ele é da própria empresa, e barrá-lo às 22h só
  // impede a conta de conferir a Sarah fora do horário comercial.
  //
  // Sabotagem conferida: tirar `not v_e_numero_de_teste` do passo 4 derruba
  // este teste e deixa os dois de cima passando.
  const decisao = await guarda({ instante: QUARTA_22H })

  expect(decisao.allowed).toBe(true)
  expect(decisao.reason).toBe('placed')
})

test('passo 4: a exceção é do número, e não de quem pede', async () => {
  await comoLeadReal()

  // `p_bypass` não alcança a janela, e não alcança de propósito: um passo
  // pulável deixaria uma campanha ligar para lead real de madrugada, que é
  // exatamente o que a regra existe para impedir.
  const comBypass = await guarda({
    instante: QUARTA_22H,
    bypass: ['outside_window', 'min_interval', 'daily_per_number'],
  })

  expect(comBypass.allowed).toBe(false)
  expect(comBypass.reason).toBe('outside_window')
})

test('passo 4: o portão continua valendo para quem não é número de teste', async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.account_test_numbers where account_id = $1', [contaId])

  // Sem a lista de teste e com o portão fechado, a recusa é do passo 2 e não
  // do 4: a exceção da janela não abre caminho nenhum antes dela.
  const decisao = await guarda({ instante: QUARTA_22H })

  expect(decisao.allowed).toBe(false)
  expect(decisao.reason).toBe('real_dialing_gate')
})

// Passo 5: o intervalo mínimo -------------------------------------------------

test('passo 5: 59 minutos recusa e 61 aceita', async () => {
  await tentativaAntiga({ minutosAtras: 59 })

  const recusada = await guarda()
  expect(recusada.reason).toBe('min_interval')
  expect(recusada.dados['min_interval_minutes']).toBe(60)
  expect(recusada.dados['next_allowed_at']).toBeTruthy()

  await banco.comoServico()
  await banco.sql.query('delete from public.call_attempts where account_id = $1', [contaId])
  await tentativaAntiga({ minutosAtras: 61 })

  expect((await guarda()).allowed).toBe(true)
})

// Passo 6: o teto por número --------------------------------------------------

test('passo 6: a quarta tentativa ao mesmo número no dia é recusada com o teto 3', async () => {
  await tentativaAntiga({ minutosAtras: 120, quantas: 3 })

  const decisao = await guarda()

  expect(decisao.allowed).toBe(false)
  expect(decisao.reason).toBe('daily_per_number')
  expect(decisao.dados['cap']).toBe(3)
  expect(decisao.dados['count']).toBe(3)
})

test('passo 6: recusa não consome cota — o teto conta o que saiu', async () => {
  // Três recusas por fora da janela de manhã não podem queimar o número: se
  // consumissem cota, a ligação nunca sairia no dia em que a janela abrisse.
  await banco.comoServico()
  await banco.sql.query(
    `insert into public.call_attempts
       (account_id, phone_e164, outcome, actor, source, attempted_at)
     select $1, $2, 'outside_window', 'system', 'cenario',
            $3::timestamptz - make_interval(mins => 300)
       from generate_series(1, 5)`,
    [contaId, DESTINO, QUARTA_14H],
  )

  expect((await guarda()).allowed).toBe(true)
})

// Passo 7: o teto da conta e o teto de gasto ----------------------------------

test('passo 7: a chamada 201 da conta é recusada com o teto 200', async () => {
  await banco.comoServico()
  await banco.sql.query(
    `insert into public.call_attempts
       (account_id, phone_e164, outcome, actor, source, attempted_at)
     select $1, '+5511' || lpad(g::text, 9, '0'), 'placed', 'system', 'cenario',
            $2::timestamptz - make_interval(mins => 120)
       from generate_series(1, 200) as g`,
    [contaId, QUARTA_14H],
  )

  const decisao = await guarda()

  expect(decisao.allowed).toBe(false)
  expect(decisao.reason).toBe('daily_per_account')
  expect(decisao.dados['cap']).toBe(200)
  expect(decisao.dados['count']).toBe(200)
})

test('passo 7: o teto de gasto soma call_costs do dia (RNF-12)', async () => {
  await banco.comoServico()
  await banco.sql.query(
    'update public.account_settings set daily_spend_cap_cents = 500 where account_id = $1',
    [contaId],
  )

  const { rows: chamadas } = await banco.sql.query<{ id: string }>(
    `insert into public.calls
       (account_id, purpose, direction, started_at, idempotency_key)
     values ($1, 'discovery', 'outbound', $2::timestamptz, 'manual:cenario-do-gasto')
     returning id`,
    [contaId, QUARTA_14H],
  )
  await banco.sql.query(
    `insert into public.call_costs
       (account_id, call_id, component, amount_cents, source, recorded_at)
     values ($1, $2, 'telephony', 300, 'cenario', $3::timestamptz),
            ($1, $2, 'voice', 200, 'cenario', $3::timestamptz)`,
    [contaId, chamadas[0]!.id, QUARTA_14H],
  )

  const decisao = await guarda()

  expect(decisao.allowed).toBe(false)
  expect(decisao.reason).toBe('daily_spend_cap')
  expect(decisao.dados['cap_cents']).toBe(500)
  expect(Number(decisao.dados['spent_cents'])).toBe(500)
})

// Passo 8: a linha e o rodízio ------------------------------------------------

test('passo 8: sem linha em rotação a recusa é própria, e não erro', async () => {
  await banco.comoServico()
  await banco.sql.query('update public.phone_lines set in_rotation = false where id = $1', [linhaId])

  const decisao = await guarda()

  expect(decisao.allowed).toBe(false)
  expect(decisao.reason).toBe('no_phone_line')
  expect(decisao.phone_line_id).toBeNull()
  expect(decisao.dados['lines_in_rotation']).toBe(0)
})

test('passo 8: a linha no teto do dia sai do rodízio', async () => {
  await banco.comoServico()
  await banco.sql.query('update public.phone_lines set daily_cap = 2 where id = $1', [linhaId])
  await tentativaAntiga({ minutosAtras: 300, quantas: 2, telefone: '+5511999990002' })

  expect((await guarda()).reason).toBe('no_phone_line')
})

test('passo 8: o rodízio é determinístico entre as linhas em rotação', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.phone_lines (account_id, e164, label)
     values ($1, '+5511400000002', 'Segunda linha') returning id`,
    [contaId],
  )
  const segunda = rows[0]!.id
  const esperada = [linhaId, segunda].sort()

  // Sem bypass a segunda discagem esbarraria no intervalo mínimo: o que está em
  // prova aqui é a escolha da linha, e não o passo 5.
  const bypass = ['min_interval', 'daily_per_number']

  const primeira = await guarda({ bypass })
  const seguinte = await guarda({ bypass })
  const terceira = await guarda({ bypass })

  expect(primeira.phone_line_id).toBe(esperada[0])
  expect(seguinte.phone_line_id).toBe(esperada[1])
  // Empatadas em uma discagem cada, volta a mais antiga: o rodízio dá a volta.
  expect(terceira.phone_line_id).toBe(esperada[0])
})

// Passo 9: o registro ---------------------------------------------------------

test('passo 9: a recusa é gravada em call_attempts com o motivo', async () => {
  await bloquear()
  await guarda()

  const { rows } = await banco.sql.query<{
    outcome: string
    phone_line_id: string | null
    source: string
  }>(
    'select outcome, phone_line_id, source from public.call_attempts where account_id = $1',
    [contaId],
  )

  expect(rows).toHaveLength(1)
  expect(rows[0]!.outcome).toBe('dnc_active')
  // Recusa anterior ao passo 8 não tem linha: inventar uma faria o teto da
  // linha contar tentativa que ela não fez.
  expect(rows[0]!.phone_line_id).toBeNull()
  expect(rows[0]!.source).toBe('manual')
})

test('passo 9: a discagem que sai grava placed com a linha escolhida', async () => {
  const decisao = await guarda()

  expect(decisao.allowed).toBe(true)
  expect(decisao.phone_line_id).toMatch(UUID)

  const { rows } = await banco.sql.query<{ outcome: string; phone_line_id: string }>(
    'select outcome, phone_line_id from public.call_attempts where account_id = $1',
    [contaId],
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]!.outcome).toBe('placed')
  expect(rows[0]!.phone_line_id).toBe(decisao.phone_line_id)
})

// O bypass --------------------------------------------------------------------

test('bypass pula o intervalo mínimo e o teto por número, e só eles', async () => {
  await tentativaAntiga({ minutosAtras: 10, quantas: 3 })

  // Sem bypass, o passo 5 recusa.
  expect((await guarda()).reason).toBe('min_interval')

  // Com os NOVE motivos dentro do array, os dois que a lista aceita são
  // pulados e a ligação sai.
  const comBypass = await guarda({ bypass: TODOS_OS_MOTIVOS })
  expect(comBypass.allowed).toBe(true)
})

test('bypass nunca pula os passos 0, 2, 3 e 4', async () => {
  const bypass = TODOS_OS_MOTIVOS

  // Passo 0.
  await pausar()
  expect((await guarda({ bypass })).reason).toBe('dialing_paused')

  await banco.comoServico()
  await banco.sql.query(
    `update public.accounts
        set dialing_paused_at = null, dialing_paused_by = null, dialing_paused_reason = null
      where id = $1`,
    [contaId],
  )

  // Passo 2.
  await banco.sql.query('delete from public.account_test_numbers where account_id = $1', [contaId])
  expect((await guarda({ bypass })).reason).toBe('real_dialing_gate')

  await banco.sql.query(
    `insert into public.account_test_numbers (account_id, phone_e164, label)
     values ($1, $2, 'Número de teste')`,
    [contaId, DESTINO],
  )

  // Passo 3.
  await bloquear()
  expect((await guarda({ bypass })).reason).toBe('dnc_active')

  await banco.sql.query('delete from public.dnc_entries where account_id = $1', [contaId])

  // Passo 4. Sobre lead real: a janela não se aplica a número da lista de
  // teste (US-248), e é por isso que o destino sai dela aqui. A exceção é do
  // número, não do bypass — que é justamente o que este teste cobra.
  await comoLeadReal()
  expect((await guarda({ bypass, instante: QUARTA_22H })).reason).toBe('outside_window')
})

// Quem pode chamar ------------------------------------------------------------

test('a guarda é da borda de serviço: authenticated e anon não executam', async () => {
  await banco.comoServico()
  const chamada = `select * from public.guard_dial($1::uuid, $2::text)`

  await banco.comoUsuario(operadorId)
  const doMembro = await banco.sql.query(chamada, [contaId, DESTINO]).then(
    () => null,
    (erro: { code?: string }) => erro,
  )
  expect(doMembro?.code).toBe('42501')

  await banco.comoAnonimo()
  const doAnonimo = await banco.sql.query(chamada, [contaId, DESTINO]).then(
    () => null,
    (erro: { code?: string }) => erro,
  )
  expect(doAnonimo?.code).toBe('42501')

  await banco.comoServico()
})
