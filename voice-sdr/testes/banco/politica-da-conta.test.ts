// A política de discagem, os tetos, a privacidade e a operação da conta, em
// colunas tipadas. O que se prova aqui:
//
// 1. A linha nasce com a conta trazendo TODOS os padrões, um por um. O valor
//    que ninguém escolheu é o que vai discar na primeira campanha, então ele é
//    conferido e não presumido.
// 2. `dialing_window` malformada é recusada com mensagem que nomeia o dia, a
//    chave e o valor — e são sete formas de estar torta, cada uma com o seu
//    caso.
// 3. Os checks recusam o que está fora da faixa: `max_concurrent` 11,
//    `retention_days` 0 e 3651, `daily_calls_cap` 0, `speed_to_lead_minutes` 0.
// 4. Classe Configuração: o operador não altera política de discagem nem teto
//    (RF-003), o administrador altera, e a conta vizinha recebe zero linha.
// 5. A trilha de auditoria guarda o antes e o depois SÓ do que mudou, que é a
//    granularidade que o blob único de T-22 não dava.
//
// Referência: migração 20260921230000_politica_da_conta.sql,
// docs/PRD-implementacao.md seções 3.1 e 3.9, docs/PRD.md RF-010, RF-421,
// RF-610, RF-612, RF-801 a RF-803, RF-806, RF-807, RNF-12 e RNF-13,
// docs/revisao-tecnica.md T-22 e R-10.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

/** SQLSTATE de violação de check. */
const CHECK_VIOLADO = '23514'
/** SQLSTATE que o gatilho da janela levanta: invalid_parameter_value. */
const PARAMETRO_INVALIDO = '22023'

/** A janela padrão, de segunda a sexta. Repetida aqui de propósito: o teste
 *  confere o padrão da migração, e lê-lo de lá seria conferir com ele mesmo. */
const JANELA_PADRAO = {
  '1': { start: '09:00', end: '18:00' },
  '2': { start: '09:00', end: '18:00' },
  '3': { start: '09:00', end: '18:00' },
  '4': { start: '09:00', end: '18:00' },
  '5': { start: '09:00', end: '18:00' },
}

/** Todo padrão da tabela, conferido linha a linha no primeiro teste. */
const PADROES = {
  dialing_window: JANELA_PADRAO,
  min_interval_minutes: 60,
  daily_attempts_per_number: 3,
  daily_calls_cap: 200,
  daily_spend_cap_cents: null,
  max_concurrent: 5,
  max_duration_seconds: 600,
  recording_enabled: true,
  recording_notice_text: null,
  retention_days: 90,
  credit_alert_cents: null,
  speed_to_lead_enabled: false,
  speed_to_lead_minutes: 5,
}

interface Conta {
  readonly id: string
  readonly adminId: string
  readonly operadorId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

async function criarConta(nome: string, dominio: string): Promise<Conta> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id

  const adminId = await banco.criarUsuario(`admin@${dominio}`, 'Admin')
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'admin'), ($1, $3, 'operator')`,
    [id, adminId, operadorId],
  )

  return { id, adminId, operadorId }
}

/** Erro que o banco levantou, com o SQLSTATE preservado. */
async function erroDe(manobra: Promise<unknown>): Promise<{
  code?: string
  message: string
}> {
  try {
    await manobra
  } catch (erro) {
    const bruto = erro as { code?: string; message?: string }
    return { code: bruto.code, message: String(bruto.message) }
  }
  throw new Error('a manobra deveria ter sido recusada, e passou')
}

/** Lê a configuração da conta como um objeto solto, para comparar campo a campo. */
async function lerPolitica(
  conta: Conta,
): Promise<Record<string, unknown> | undefined> {
  const { rows } = await banco.sql.query<Record<string, unknown>>(
    `select dialing_window, min_interval_minutes, daily_attempts_per_number,
            daily_calls_cap, daily_spend_cap_cents, max_concurrent,
            max_duration_seconds, recording_enabled, recording_notice_text,
            retention_days, credit_alert_cents, speed_to_lead_enabled,
            speed_to_lead_minutes
       from public.account_settings
      where account_id = $1`,
    [conta.id],
  )
  return rows[0]
}

/** Tenta gravar uma janela e devolve o erro. */
function gravarJanela(conta: Conta, janela: unknown): Promise<unknown> {
  return banco.sql.query(
    `update public.account_settings set dialing_window = $2::jsonb where account_id = $1`,
    [conta.id, JSON.stringify(janela)],
  )
}

/** Devolve a linha ao padrão, para o teste seguinte não herdar o anterior. */
async function restaurarPadrao(conta: Conta): Promise<void> {
  await banco.sql.query(
    `update public.account_settings
        set dialing_window = $2::jsonb,
            min_interval_minutes = default,
            daily_attempts_per_number = default,
            daily_calls_cap = default,
            daily_spend_cap_cents = default,
            max_concurrent = default,
            max_duration_seconds = default,
            recording_enabled = default,
            recording_notice_text = default,
            retention_days = default,
            credit_alert_cents = default,
            speed_to_lead_enabled = default,
            speed_to_lead_minutes = default
      where account_id = $1`,
    [conta.id, JSON.stringify(JANELA_PADRAO)],
  )
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test')
  contaB = await criarConta('Cooperativa Sul', 'sul.test')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await restaurarPadrao(contaA)
  await restaurarPadrao(contaB)
})

// Os padrões -----------------------------------------------------------------

test('a linha nasce com a conta e com todos os padrões', async () => {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Padaria Recém-nascida') returning id`,
  )
  const contaNova = rows[0]!.id

  const { rows: politica } = await banco.sql.query<Record<string, unknown>>(
    `select * from public.account_settings where account_id = $1`,
    [contaNova],
  )
  expect(politica).toHaveLength(1)

  for (const [coluna, esperado] of Object.entries(PADROES)) {
    expect({ coluna, valor: politica[0]?.[coluna] }).toEqual({
      coluna,
      valor: esperado,
    })
  }
})

test('o padrão da janela disca de segunda a sexta, das 9h às 18h, e não no fim de semana', async () => {
  const politica = await lerPolitica(contaA)
  const janela = politica?.dialing_window as Record<string, unknown>
  expect(Object.keys(janela).sort()).toEqual(['1', '2', '3', '4', '5'])
  expect(janela['0']).toBeUndefined()
  expect(janela['6']).toBeUndefined()
})

// A janela: o que o gatilho recusa -------------------------------------------

test('janela que não é objeto é recusada, dizendo o que veio', async () => {
  const erro = await erroDe(gravarJanela(contaA, ['09:00', '18:00']))
  expect(erro.code).toBe(PARAMETRO_INVALIDO)
  expect(erro.message).toMatch(/dialing_window precisa ser um objeto/)
  expect(erro.message).toMatch(/array/)
})

test('dia fora de 0 a 6 é recusado, nomeando o dia', async () => {
  const erro = await erroDe(
    gravarJanela(contaA, { '7': { start: '09:00', end: '18:00' } }),
  )
  expect(erro.code).toBe(PARAMETRO_INVALIDO)
  expect(erro.message).toMatch(/o dia "7"/)
})

test('dia escrito por extenso é recusado: a chave é o número de extract(dow)', async () => {
  const erro = await erroDe(
    gravarJanela(contaA, { segunda: { start: '09:00', end: '18:00' } }),
  )
  expect(erro.code).toBe(PARAMETRO_INVALIDO)
  expect(erro.message).toMatch(/o dia "segunda"/)
})

test('faixa que não é objeto é recusada, nomeando o dia', async () => {
  const erro = await erroDe(gravarJanela(contaA, { '1': '09:00-18:00' }))
  expect(erro.code).toBe(PARAMETRO_INVALIDO)
  expect(erro.message).toMatch(/dialing_window\["1"\] precisa ser um objeto/)
  expect(erro.message).toMatch(/string/)
})

test('faixa com chave a mais é recusada, listando o que veio', async () => {
  const erro = await erroDe(
    gravarJanela(contaA, {
      '1': { start: '09:00', end: '18:00', pausa: '12:00' },
    }),
  )
  expect(erro.code).toBe(PARAMETRO_INVALIDO)
  expect(erro.message).toMatch(/aceita exatamente start e end/)
  expect(erro.message).toMatch(/end, pausa, start/)
})

test('faixa vazia é recusada: dia sem discagem se escreve tirando a chave', async () => {
  const erro = await erroDe(gravarJanela(contaA, { '1': {} }))
  expect(erro.code).toBe(PARAMETRO_INVALIDO)
  expect(erro.message).toMatch(/aceita exatamente start e end/)
})

test('hora sem zero à esquerda é recusada, dizendo o valor que chegou', async () => {
  const erro = await erroDe(
    gravarJanela(contaA, { '1': { start: '9:00', end: '18:00' } }),
  )
  expect(erro.code).toBe(PARAMETRO_INVALIDO)
  expect(erro.message).toMatch(/start precisa ser hora e minuto/)
  expect(erro.message).toMatch(/"9:00"/)
})

test('minuto acima de 59 é recusado', async () => {
  const erro = await erroDe(
    gravarJanela(contaA, { '1': { start: '09:60', end: '18:00' } }),
  )
  expect(erro.code).toBe(PARAMETRO_INVALIDO)
  expect(erro.message).toMatch(/"09:60"/)
})

test('fim em 24:30 é recusado: só 24:00 passa por cima do relógio', async () => {
  const erro = await erroDe(
    gravarJanela(contaA, { '1': { start: '09:00', end: '24:30' } }),
  )
  expect(erro.code).toBe(PARAMETRO_INVALIDO)
  expect(erro.message).toMatch(/end precisa ser hora e minuto/)
})

test('faixa invertida é recusada, dizendo os dois horários', async () => {
  const erro = await erroDe(
    gravarJanela(contaA, { '1': { start: '18:00', end: '09:00' } }),
  )
  expect(erro.code).toBe(PARAMETRO_INVALIDO)
  expect(erro.message).toMatch(/começa às 18:00 e termina às 09:00/)
})

test('faixa de duração zero é recusada', async () => {
  const erro = await erroDe(
    gravarJanela(contaA, { '1': { start: '09:00', end: '09:00' } }),
  )
  expect(erro.code).toBe(PARAMETRO_INVALIDO)
  expect(erro.message).toMatch(/precisa ter duração/)
})

// A janela: o que o gatilho aceita -------------------------------------------

test('janela vazia é aceita: conta que não disca é configuração válida', async () => {
  await gravarJanela(contaA, {})
  expect((await lerPolitica(contaA))?.dialing_window).toEqual({})
})

test('sábado de manhã e fim em 24:00 são aceitos', async () => {
  const janela = {
    '1': { start: '08:30', end: '24:00' },
    '6': { start: '09:00', end: '13:00' },
  }
  await gravarJanela(contaA, janela)
  expect((await lerPolitica(contaA))?.dialing_window).toEqual(janela)
})

test('o gatilho também vale no insert, e não só no update', async () => {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Serralheria Torta') returning id`,
  )
  await banco.sql.query('delete from public.account_settings where account_id = $1', [
    rows[0]!.id,
  ])

  const erro = await erroDe(
    banco.sql.query(
      `insert into public.account_settings (account_id, dialing_window)
       values ($1, '{"9": {"start": "09:00", "end": "18:00"}}'::jsonb)`,
      [rows[0]!.id],
    ),
  )
  expect(erro.code).toBe(PARAMETRO_INVALIDO)
  expect(erro.message).toMatch(/o dia "9"/)
})

// Os checks das colunas numéricas --------------------------------------------

const FORA_DA_FAIXA: { coluna: string; valor: number; restricao: string }[] = [
  { coluna: 'max_concurrent', valor: 11, restricao: 'account_settings_simultaneidade' },
  { coluna: 'max_concurrent', valor: 0, restricao: 'account_settings_simultaneidade' },
  { coluna: 'retention_days', valor: 0, restricao: 'account_settings_retencao' },
  { coluna: 'retention_days', valor: 3651, restricao: 'account_settings_retencao' },
  { coluna: 'daily_calls_cap', valor: 0, restricao: 'account_settings_teto_diario' },
  {
    coluna: 'daily_attempts_per_number',
    valor: 0,
    restricao: 'account_settings_tentativas_por_numero',
  },
  {
    coluna: 'min_interval_minutes',
    valor: -1,
    restricao: 'account_settings_intervalo_minimo',
  },
  {
    coluna: 'max_duration_seconds',
    valor: 29,
    restricao: 'account_settings_duracao_maxima',
  },
  {
    coluna: 'max_duration_seconds',
    valor: 3601,
    restricao: 'account_settings_duracao_maxima',
  },
  {
    coluna: 'daily_spend_cap_cents',
    valor: 0,
    restricao: 'account_settings_teto_de_gasto',
  },
  {
    coluna: 'credit_alert_cents',
    valor: 0,
    restricao: 'account_settings_aviso_de_credito',
  },
  {
    coluna: 'speed_to_lead_minutes',
    valor: 0,
    restricao: 'account_settings_janela_de_resposta',
  },
  {
    coluna: 'speed_to_lead_minutes',
    valor: 1441,
    restricao: 'account_settings_janela_de_resposta',
  },
]

test.each(FORA_DA_FAIXA)(
  '$coluna = $valor é recusado por $restricao',
  async ({ coluna, valor, restricao }) => {
    const erro = await erroDe(
      banco.sql.query(
        `update public.account_settings set ${coluna} = $2 where account_id = $1`,
        [contaA.id, valor],
      ),
    )
    expect(erro.code).toBe(CHECK_VIOLADO)
    expect(erro.message).toMatch(restricao)
  },
)

test('aviso de gravação em branco é recusado, e nulo é aceito', async () => {
  const erro = await erroDe(
    banco.sql.query(
      `update public.account_settings set recording_notice_text = '   ' where account_id = $1`,
      [contaA.id],
    ),
  )
  expect(erro.code).toBe(CHECK_VIOLADO)
  expect(erro.message).toMatch(/account_settings_aviso_de_gravacao/)

  await banco.sql.query(
    `update public.account_settings set recording_notice_text = null where account_id = $1`,
    [contaA.id],
  )
  expect((await lerPolitica(contaA))?.recording_notice_text).toBeNull()
})

test('os limites de dentro da faixa são aceitos', async () => {
  await banco.sql.query(
    `update public.account_settings
        set max_concurrent = 10,
            retention_days = 3650,
            min_interval_minutes = 0,
            max_duration_seconds = 30,
            daily_spend_cap_cents = 50000,
            credit_alert_cents = 1000,
            speed_to_lead_enabled = true,
            speed_to_lead_minutes = 1440,
            recording_enabled = false,
            recording_notice_text = 'Aviso: esta ligação é gravada.'
      where account_id = $1`,
    [contaA.id],
  )
  const politica = await lerPolitica(contaA)
  expect(politica?.max_concurrent).toBe(10)
  expect(politica?.retention_days).toBe(3650)
  expect(politica?.speed_to_lead_enabled).toBe(true)
  expect(politica?.recording_enabled).toBe(false)
})

// Isolamento -----------------------------------------------------------------

test('o operador não mexe na política de discagem nem no teto', async () => {
  await banco.comoUsuario(contaA.operadorId)
  const { rows } = await banco.sql.query<{ id: string }>(
    `update public.account_settings
        set daily_calls_cap = 5000, min_interval_minutes = 0
      where account_id = $1
      returning id`,
    [contaA.id],
  )
  expect(rows).toHaveLength(0)

  await banco.comoServico()
  const politica = await lerPolitica(contaA)
  expect(politica?.daily_calls_cap).toBe(200)
  expect(politica?.min_interval_minutes).toBe(60)
})

test('o administrador muda o teto da própria conta', async () => {
  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query<{ daily_calls_cap: number }>(
    `update public.account_settings set daily_calls_cap = 500 where account_id = $1
     returning daily_calls_cap`,
    [contaA.id],
  )
  expect(rows[0]?.daily_calls_cap).toBe(500)
})

test('o administrador da conta A não alcança a política da conta B', async () => {
  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query<{ id: string }>(
    `update public.account_settings set daily_calls_cap = 1 where account_id = $1
     returning id`,
    [contaB.id],
  )
  expect(rows).toHaveLength(0)

  await banco.comoServico()
  expect((await lerPolitica(contaB))?.daily_calls_cap).toBe(200)
})

test('o membro lê só a linha da própria conta, e o anônimo nenhuma', async () => {
  await banco.comoUsuario(contaA.operadorId)
  const { rows } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.account_settings',
  )
  expect(rows.map((linha) => linha.account_id)).toEqual([contaA.id])

  await banco.comoAnonimo()
  const { rows: anonimas } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.account_settings',
  )
  expect(anonimas[0]?.total).toBe(0)
})

// Trilha ---------------------------------------------------------------------

test('a auditoria guarda o antes e o depois só do que mudou', async () => {
  // Duas colunas da política, e não `retention_days`: desde a migração
  // 20260923120000_privacidade_da_conta.sql a privacidade é do dono, e admin
  // que a mude é recusado (testes/banco/privacidade-da-conta.test.ts).
  await banco.comoUsuario(contaA.adminId)
  await banco.sql.query(
    `update public.account_settings
        set daily_calls_cap = 5000, min_interval_minutes = 30
      where account_id = $1`,
    [contaA.id],
  )

  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    action: string
    actor_id: string | null
    payload: {
      campos: string[]
      antes: Record<string, unknown>
      depois: Record<string, unknown>
    }
  }>(
    `select action, actor_id, payload
       from public.audit_log
      where account_id = $1 and target_type = 'account_settings'
      order by created_at desc
      limit 1`,
    [contaA.id],
  )
  expect(rows[0]?.action).toBe('update')
  expect(rows[0]?.actor_id).toBe(contaA.adminId)
  expect(rows[0]?.payload.campos).toEqual(['daily_calls_cap', 'min_interval_minutes'])
  expect(rows[0]?.payload.antes).toEqual({ daily_calls_cap: 200, min_interval_minutes: 60 })
  expect(rows[0]?.payload.depois).toEqual({ daily_calls_cap: 5000, min_interval_minutes: 30 })
})

test('mudar a janela entra na trilha com o objeto inteiro dos dois lados', async () => {
  const janela = { '1': { start: '10:00', end: '16:00' } }
  await banco.comoUsuario(contaA.adminId)
  await gravarJanela(contaA, janela)

  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    payload: { campos: string[]; depois: { dialing_window: unknown } }
  }>(
    `select payload from public.audit_log
      where account_id = $1 and target_type = 'account_settings'
      order by created_at desc limit 1`,
    [contaA.id],
  )
  expect(rows[0]?.payload.campos).toEqual(['dialing_window'])
  expect(rows[0]?.payload.depois.dialing_window).toEqual(janela)
})
