// O enfileiramento do lembrete de reunião em PGlite (US-192, RF-601, primeiro
// critério de aceite da F6 pelo lado do banco).
//
// O que este arquivo prova:
//
// 1. **A regra é a do módulo.** Cada caso de `casos-de-lembrete.ts` vira uma
//    reunião, e entra na fila exatamente a que o módulo diz `na_janela`. O caso
//    `sem_telefone` não se monta aqui: `leads.phone_e164` é not null, e o banco
//    não tem lead sem telefone para lembrar.
// 2. **Duas execuções seguidas com o mesmo relógio deixam um item e uma marca.**
// 3. **O teto de 25 corta**, e o que sobrou entra na passagem seguinte.
// 4. **Cada conta recebe o próprio lembrete**, e o item leva a conta da reunião.
// 5. **Só service_role executa**, e o padrão da janela é o de `padroes.ts`.
//
// Referência: migração 20261010120000_lembrete_de_reuniao.sql.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { CASOS_DE_LEMBRETE } from '../../supabase/functions/_shared/automacao/casos-de-lembrete.ts'
import { JANELA_DO_LEMBRETE_PADRAO } from '../../supabase/functions/_shared/automacao/padroes.ts'
import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaA: string
let contaB: string
let donoA: string

const AGORA = Date.parse('2026-10-05T13:00:00.000Z')
const INSTANTE = new Date(AGORA).toISOString()
let sequencia = 0

async function um(sql: string, parametros: unknown[] = []): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(sql, parametros)
  return rows[0]!.id
}

async function reuniao(
  conta: string,
  segundos: number,
  extra: { status?: string; lembrada?: boolean } = {},
): Promise<string> {
  sequencia += 1
  const lead = await um(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, $2, $3, 'teste') returning id`,
    [conta, `Lead ${sequencia}`, `+55119800${String(sequencia).padStart(5, '0')}`],
  )
  // Um especialista por reunião: a restrição de exclusão não é assunto aqui.
  const especialista = await um(
    `insert into public.specialists (account_id, name, email, modalities)
     values ($1, $2, $3, array['video']::text[]) returning id`,
    [conta, `Especialista ${sequencia}`, `e${sequencia}@teste.test`],
  )
  const inicio = new Date(AGORA + segundos * 1000).toISOString()
  return um(
    `insert into public.meetings
       (account_id, lead_id, specialist_id, starts_at, ends_at, modality, status, reminder_sent_at)
     values ($1, $2, $3, $4::timestamptz, $4::timestamptz + interval '30 minutes', 'video', $5, $6)
     returning id`,
    [conta, lead, especialista, inicio, extra.status ?? 'scheduled', extra.lembrada ? new Date(AGORA - 60_000).toISOString() : null],
  )
}

async function enfileirar(instante = INSTANTE, limite = 25): Promise<Array<{ meeting_id: string; account_id: string }>> {
  const { rows } = await banco.sql.query<{ meeting_id: string; account_id: string }>(
    'select * from public.enfileirar_lembretes_de_reuniao($1, $2)',
    [instante, limite],
  )
  return rows
}

async function itens(): Promise<Array<{ account_id: string; source: string; source_ref: string; attempt: number; purpose: string; run_at: Date; lead_id: string }>> {
  const { rows } = await banco.sql.query<{ account_id: string; source: string; source_ref: string; attempt: number; purpose: string; run_at: Date; lead_id: string }>(
    'select account_id, source, source_ref, attempt, purpose, run_at, lead_id from public.dial_queue order by source_ref',
  )
  return rows
}

async function janela(conta: string, inicio: number, fim: number): Promise<void> {
  await banco.sql.query(
    `update public.account_settings
        set reminder_window_start_minutes = $2, reminder_window_end_minutes = $3
      where account_id = $1`,
    [conta, inicio, fim],
  )
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await um(`insert into public.accounts (name) values ('Lembrete A') returning id`)
  contaB = await um(`insert into public.accounts (name) values ('Lembrete B') returning id`)
  donoA = await banco.criarUsuario('dono@lembrete.test', 'Dono')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role) values ($1, $2, 'owner')`,
    [contaA, donoA],
  )
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.dial_queue')
  await banco.sql.query('delete from public.meetings')
  await janela(contaA, JANELA_DO_LEMBRETE_PADRAO.inicioEmMinutos, JANELA_DO_LEMBRETE_PADRAO.fimEmMinutos)
})

describe('a mesma regra do módulo', () => {
  for (const caso of CASOS_DE_LEMBRETE.filter((c) => c.comTelefone)) {
    test(caso.nome, async () => {
      await janela(contaA, caso.janela.inicioEmMinutos, caso.janela.fimEmMinutos)
      const id = await reuniao(contaA, caso.segundosAteComecar, { status: caso.status, lembrada: caso.lembrada })
      const entrou = (await enfileirar()).map((linha) => linha.meeting_id)
      expect(entrou).toEqual(caso.esperado === 'na_janela' ? [id] : [])
    })
  }

  test('o padrão da janela é o de padroes.ts', async () => {
    const { rows } = await banco.sql.query<{ inicio: number; fim: number }>(
      `select reminder_window_start_minutes as inicio, reminder_window_end_minutes as fim
         from public.account_settings where account_id = $1`,
      [contaB],
    )
    expect(rows[0]).toEqual({ inicio: JANELA_DO_LEMBRETE_PADRAO.inicioEmMinutos, fim: JANELA_DO_LEMBRETE_PADRAO.fimEmMinutos })
  })
})

describe('enfileirar_lembretes_de_reuniao', () => {
  test('a reunião a 20 minutos entra com o formato de T-07, e a de 2 horas não', async () => {
    const perto = await reuniao(contaA, 20 * 60)
    await reuniao(contaA, 120 * 60)
    expect(await enfileirar()).toEqual([{ meeting_id: perto, account_id: contaA }])
    const [item] = await itens()
    expect(item).toMatchObject({ account_id: contaA, source: 'rem', source_ref: perto, attempt: 1, purpose: 'reminder' })
    expect(item!.run_at.toISOString()).toBe(INSTANTE)
  })

  test('duas execuções em seguida com o mesmo relógio: um item na fila e uma marca só', async () => {
    const id = await reuniao(contaA, 15 * 60)
    expect(await enfileirar()).toHaveLength(1)
    expect(await enfileirar()).toHaveLength(0)
    expect(await itens()).toHaveLength(1)
    const { rows } = await banco.sql.query<{ reminder_sent_at: Date }>(
      'select reminder_sent_at from public.meetings where id = $1',
      [id],
    )
    expect(rows[0]!.reminder_sent_at.toISOString()).toBe(INSTANTE)
  })

  test('um minuto depois, a mesma reunião não volta à fila', async () => {
    await reuniao(contaA, 15 * 60)
    await enfileirar()
    expect(await enfileirar(new Date(AGORA + 60_000).toISOString())).toHaveLength(0)
    expect(await itens()).toHaveLength(1)
  })

  test('item já na fila (a marca apagada à mão) não vira segunda discagem', async () => {
    const id = await reuniao(contaA, 15 * 60)
    await enfileirar()
    await banco.sql.query('update public.meetings set reminder_sent_at = null where id = $1', [id])
    expect(await enfileirar()).toHaveLength(0)
    expect(await itens()).toHaveLength(1)
  })

  test('o teto de 25 corta, e o resto entra na passagem seguinte', async () => {
    for (let i = 0; i < 27; i += 1) await reuniao(contaA, 10 * 60 + i)
    expect(await enfileirar()).toHaveLength(25)
    expect(await enfileirar()).toHaveLength(2)
    expect(await itens()).toHaveLength(27)
  })

  test('limite fora de 1 a 25 é recusado', async () => {
    await expect(enfileirar(INSTANTE, 26)).rejects.toMatchObject({ code: '22023' })
    await expect(enfileirar(INSTANTE, 0)).rejects.toMatchObject({ code: '22023' })
  })

  test('cada conta recebe o próprio lembrete, e nenhuma o da vizinha', async () => {
    const deA = await reuniao(contaA, 15 * 60)
    const deB = await reuniao(contaB, 15 * 60)
    const entrou = await enfileirar()
    expect(entrou.toSorted((x, y) => (x.meeting_id < y.meeting_id ? -1 : 1))).toEqual(
      [
        { meeting_id: deA, account_id: contaA },
        { meeting_id: deB, account_id: contaB },
      ].toSorted((x, y) => (x.meeting_id < y.meeting_id ? -1 : 1)),
    )
    const porConta = new Map((await itens()).map((item) => [item.source_ref, item.account_id]))
    expect(porConta.get(deA)).toBe(contaA)
    expect(porConta.get(deB)).toBe(contaB)
  })

  test('a janela de uma conta não vale para a outra', async () => {
    await janela(contaA, 30, 60)
    const deA = await reuniao(contaA, 15 * 60)
    const deB = await reuniao(contaB, 15 * 60)
    expect((await enfileirar()).map((linha) => linha.meeting_id)).toEqual([deB])
    expect(deA).not.toBe(deB)
  })

  test('a janela torta é recusada pelo check', async () => {
    await expect(janela(contaA, 20, 5)).rejects.toMatchObject({ code: '23514' })
    await expect(janela(contaA, -1, 5)).rejects.toMatchObject({ code: '23514' })
  })

  test('authenticated recebe permission denied', async () => {
    await banco.comoUsuario(donoA)
    await expect(banco.sql.query('select * from public.enfileirar_lembretes_de_reuniao(now(), 25)')).rejects.toThrow(
      /permission denied/i,
    )
    await banco.comoServico()
  })
})
