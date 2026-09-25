// Duas ligações marcando reunião ao mesmo tempo (F5, segundo critério de aceite).
//
// DÍVIDA DE DEGRAU 3. ESTE ARQUIVO NÃO RODA NO LAÇO LOCAL, E A RAZÃO É
// ESTRUTURAL: PGlite é uma conexão em um processo, e nele uma transação nunca
// espera o commit de outra. Duas transações abertas ao mesmo tempo são o
// próprio objeto da prova. O arquivo fica escrito aqui, sob `runIf`, e roda no
// degrau 3, contra o Postgres real que o CI levanta com `supabase db reset`
// (`npm run test:agenda:postgres`, dentro de `check:full`). Sem
// `SUPABASE_DB_URL`, todos os casos são pulados, a razão de cada um é impressa
// e nenhuma conexão é aberta: o adaptador de Postgres (e o cliente `pg`) só é
// importado quando a variável existe. A declaração da dívida está na tabela de
// docs/PRD-implementacao.md seção 9.1, e `testes/estatica/dividas-de-concorrencia.test.ts`
// cobra que ela continue lá e alcançada por `check:full`.
//
// O que já está provado em processo, e não se repete aqui: `btree_gist` existe
// no PGlite desta versão, a restrição de exclusão recusa o sobreposto com 23P01,
// aceita o encostado e libera o horário quando o status sai do predicado
// (`testes/banco/reunioes.test.ts`), e `agendar_reuniao` devolve `teto_diario`
// na sétima reunião do dia (`testes/banco/agendamento-de-reuniao.test.ts`).
// O que falta, e só este arquivo alcança, é o paralelismo:
//
// 1. **Mesmo horário, mesmo especialista, duas transações.** A segunda inserção
//    espera o commit da primeira e então recebe 23P01; fica uma reunião só.
//    Uma restrição verificada só contra linhas já confirmadas passaria no
//    PGlite e deixaria as duas gravarem aqui.
// 2. **A sexta vaga disputada.** Com teto 6 e cinco reuniões no dia, duas
//    chamadas simultâneas de `agendar_reuniao` em horários diferentes (a
//    exclusão não as separa) não levam o dia a 7: a trava por especialista e
//    dia local (US-161) faz a segunda esperar, contar a sexta e responder
//    `teto_diario`. Sem a trava, as duas contariam cinco.
// 3. **A segunda espera mesmo.** Com a primeira aberta, a segunda esbarra na
//    trava (55P03 sob `lock_timeout`). Sem esta metade, o caso 2 passaria numa
//    implementação sem trava sempre que a segunda chegasse depois do commit.
//
// Referência: migrações 20260930100000_reunioes.sql e
// 20260930120000_agendar_reuniao.sql, docs/revisao-tecnica.md T-08,
// docs/PRD.md critérios de aceite da F5.

import { afterAll, beforeAll, expect, test } from 'vitest'

import type { BancoDeTeste } from '../auxiliares/banco-de-teste.ts'
import {
  abrirBancoParaRls,
  VARIAVEL_DE_CONEXAO,
} from '../auxiliares/banco-para-rls.ts'

/**
 * A decisão é de coleta, e por isso lê a variável em vez de `banco.efemero`:
 * o `runIf` é avaliado antes do `beforeAll`.
 */
const EFEMERO = process.env[VARIAVEL_DE_CONEXAO] === undefined

/** Os casos deste arquivo e a razão de cada um ficar para o degrau 3. */
const CASOS = {
  mesmoHorario:
    'duas transações no mesmo horário do mesmo especialista: uma grava, a outra recebe 23P01',
  sextaVaga:
    'duas chamadas simultâneas na sexta vaga de teto 6 não levam o dia a 7',
  esperaATrava:
    'a segunda chamada de agendar_reuniao espera a trava da primeira',
} as const

const RAZAO_DO_PULO = `sem ${VARIAVEL_DE_CONEXAO}: PGlite é uma conexão em um processo e não faz uma transação esperar o commit da outra. Roda no degrau 3 (npm run test:agenda:postgres).`

if (EFEMERO) {
  for (const nome of Object.values(CASOS)) {
    console.info(`[degrau 3] pulado: ${nome}. Razão: ${RAZAO_DO_PULO}`)
  }
}

/** Marca desta execução: o que ela criar, ela apaga. */
const MARCA = `a${Date.now().toString(36)}`

let primeira: BancoDeTeste | undefined
let segunda: BancoDeTeste | undefined
let contaId: string
/** Especialista do caso 1. */
let anaId: string
/** Especialista dos casos 2 e 3, com as cinco reuniões do dia já marcadas. */
let brunoId: string
let leadsCriados = 0

async function um(sql: string, parametros: unknown[]): Promise<string> {
  const { rows } = await primeira!.sql.query<{ id: string }>(sql, parametros)
  return rows[0]!.id
}

async function especialista(nome: string): Promise<string> {
  const id = await um(
    `insert into public.specialists
       (account_id, name, email, modalities, timezone, daily_cap, min_notice_min, max_notice_days)
     values ($1, $2, $3, array['video']::text[], 'America/Sao_Paulo', 6, 120, 30) returning id`,
    [contaId, `${MARCA} ${nome}`, `${nome.toLowerCase()}.${MARCA}@agenda.test`],
  )
  await primeira!.sql.query(
    `insert into public.specialist_availability (account_id, specialist_id, weekday, start_time, end_time)
     select $1, $2, d, '00:00', '24:00' from generate_series(0, 6) d`,
    [contaId, id],
  )
  return id
}

async function novoLead(): Promise<string> {
  leadsCriados += 1
  return um(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, $2, $3, 'teste') returning id`,
    [contaId, `${MARCA} lead ${leadsCriados}`, `+551197${String(leadsCriados).padStart(7, '0')}`],
  )
}

/** "Daqui a N dias, às HH:MM" em São Paulo, longe da antecedência mínima. */
async function instante(dias: number, hora: string): Promise<string> {
  const { rows } = await primeira!.sql.query<{ iso: string }>(
    `select to_char(
       ((date_trunc('day', now() at time zone 'America/Sao_Paulo') + make_interval(days => $1) + $2::time)
          at time zone 'America/Sao_Paulo') at time zone 'UTC',
       'YYYY-MM-DD"T"HH24:MI:SS"Z"') as iso`,
    [dias, hora],
  )
  return rows[0]!.iso
}

function mais(iso: string, minutos: number): string {
  return new Date(Date.parse(iso) + minutos * 60_000).toISOString()
}

const INSERCAO_DIRETA = `
  insert into public.meetings (account_id, lead_id, specialist_id, starts_at, ends_at, modality)
  values ($1, $2, $3, $4, $5, 'video')`

const CHAMADA_DO_RPC = `
  select resultado from public.agendar_reuniao($1, $2, $3, $4, $5, 'video', null, null)`

async function desfazerAsDuas(): Promise<void> {
  await primeira?.sql.exec('rollback').catch(() => undefined)
  await segunda?.sql.exec('rollback').catch(() => undefined)
}

beforeAll(async () => {
  if (EFEMERO) return

  primeira = await abrirBancoParaRls()
  segunda = await abrirBancoParaRls()
  await primeira.comoServico()
  await segunda.comoServico()

  contaId = await um(
    `insert into public.accounts (name, timezone) values ($1, 'America/Sao_Paulo') returning id`,
    [`${MARCA} Concorrência da agenda`],
  )
  anaId = await especialista('Ana')
  brunoId = await especialista('Bruno')

  // As cinco primeiras reuniões do dia do Bruno, daqui a três dias.
  for (const hora of ['08:00', '09:00', '10:00', '11:00', '12:00']) {
    const inicio = await instante(3, hora)
    await primeira.sql.query(INSERCAO_DIRETA, [contaId, await novoLead(), brunoId, inicio, mais(inicio, 30)])
  }
}, 60_000)

afterAll(async () => {
  await desfazerAsDuas()
  if (primeira) {
    await primeira.comoServico()
    await primeira.sql.query('delete from public.accounts where id = $1', [contaId])
    await primeira.encerrar()
  }
  await segunda?.encerrar()
})

test.runIf(!EFEMERO)(CASOS.mesmoHorario, async () => {
  expect(primeira!.efemero, 'concorrência só contra Postgres real').toBe(false)

  const inicio = await instante(2, '14:00')
  const fim = mais(inicio, 30)
  const [leadA, leadB] = [await novoLead(), await novoLead()]

  try {
    await primeira!.sql.exec('begin')
    await primeira!.sql.query(INSERCAO_DIRETA, [contaId, leadA, anaId, inicio, fim])

    // A segunda começa com a primeira aberta: a exclusão a faz esperar o
    // desfecho da primeira em vez de gravar por cima dela.
    await segunda!.sql.exec('begin')
    const daSegunda = segunda!.sql.query(INSERCAO_DIRETA, [contaId, leadB, anaId, inicio, fim])
    const recusa = expect(daSegunda).rejects.toMatchObject({ code: '23P01' })

    await primeira!.sql.exec('commit')
    await recusa
    await segunda!.sql.exec('rollback')
  } finally {
    await desfazerAsDuas()
  }

  const { rows } = await primeira!.sql.query<{ lead_id: string }>(
    `select lead_id from public.meetings where specialist_id = $1 and starts_at = $2`,
    [anaId, inicio],
  )
  expect(rows.map((linha) => linha.lead_id)).toEqual([leadA])
})

test.runIf(!EFEMERO)(CASOS.esperaATrava, async () => {
  const inicioA = await instante(3, '14:00')
  const inicioB = await instante(3, '15:00')
  // Os leads nascem antes do `begin`: criados dentro da primeira transação,
  // seriam invisíveis para a segunda conexão.
  const [leadA, leadB] = [await novoLead(), await novoLead()]

  try {
    await primeira!.sql.exec('begin')
    const { rows } = await primeira!.sql.query<{ resultado: string }>(CHAMADA_DO_RPC, [
      contaId, leadA, brunoId, inicioA, mais(inicioA, 30),
    ])
    expect(rows[0]!.resultado).toBe('agendada')

    await segunda!.sql.exec('begin')
    // Sem o tempo limite a espera seria indefinida e o teste travaria em vez
    // de reprovar. Com ele, a trava vira erro observável.
    await segunda!.sql.exec("set local lock_timeout = '250ms'")
    await expect(
      segunda!.sql.query(CHAMADA_DO_RPC, [contaId, leadB, brunoId, inicioB, mais(inicioB, 30)]),
    ).rejects.toMatchObject({ code: '55P03' })
  } finally {
    // As duas desfeitas: o dia do Bruno volta a cinco para o caso seguinte.
    await desfazerAsDuas()
  }
})

test.runIf(!EFEMERO)(CASOS.sextaVaga, async () => {
  const inicioA = await instante(3, '14:00')
  const inicioB = await instante(3, '15:00')
  const [leadA, leadB] = [await novoLead(), await novoLead()]

  let daPrimeira: string | undefined
  let daSegunda: string | undefined
  try {
    await primeira!.sql.exec('begin')
    const { rows } = await primeira!.sql.query<{ resultado: string }>(CHAMADA_DO_RPC, [
      contaId, leadA, brunoId, inicioA, mais(inicioA, 30),
    ])
    daPrimeira = rows[0]!.resultado

    // Horário diferente: a exclusão não separa as duas, só a trava do teto.
    const promessa = segunda!.sql
      .exec('begin')
      .then(() =>
        segunda!.sql.query<{ resultado: string }>(CHAMADA_DO_RPC, [
          contaId, leadB, brunoId, inicioB, mais(inicioB, 30),
        ]),
      )

    await primeira!.sql.exec('commit')
    daSegunda = (await promessa).rows[0]!.resultado
    await segunda!.sql.exec('commit')
  } finally {
    await desfazerAsDuas()
  }

  expect(daPrimeira).toBe('agendada')
  // Sem a trava, esta seria a sétima reunião de um dia de teto 6.
  expect(daSegunda).toBe('teto_diario')

  const { rows } = await primeira!.sql.query<{ total: number }>(
    `select count(*)::int as total from public.meetings
      where specialist_id = $1 and status in ('scheduled', 'confirmed')
        and (starts_at at time zone 'America/Sao_Paulo')::date
          = ($2::timestamptz at time zone 'America/Sao_Paulo')::date`,
    [brunoId, inicioA],
  )
  expect(rows[0]!.total).toBe(6)
})
