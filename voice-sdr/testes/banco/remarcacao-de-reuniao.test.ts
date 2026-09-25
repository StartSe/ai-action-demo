// Remarcar e cancelar na mesma ligação, em PGlite (US-196, RF-603, segundo
// critério de aceite da F6 pelo lado do banco).
//
// O que este arquivo prova:
//
// 1. **A remarcação fecha a antiga e abre a nova na mesma transação**, pelo
//    horário oferecido nesta chamada: a antiga vira `rescheduled` com o motivo,
//    a nova aponta `rescheduled_from_id` para ela e `booked_call_id` para a
//    chamada, e as ofertas se consomem.
// 2. **Recusa de `agendar_reuniao` desfaz tudo** (23P01 vira `horario_ocupado`):
//    a antiga continua marcada e o único por lead não é violado.
// 3. **Idempotente**: a segunda chamada devolve a mesma reunião.
// 4. **Oferta de outra chamada, oferta vencida e posição sem oferta** não
//    remarcam nada. A reunião do resgate (`no_show`) não muda de status.
// 5. **Cancelar** grava o motivo, e a segunda vez é `ja_cancelada`.
// 6. **A conta vizinha não remarca reunião alheia**, e só `service_role` executa.
//
// Referência: migração 20261010160000_remarcacao_de_reuniao.sql.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaA: string
let contaB: string
let dono: string
let especialista: string
let sequencia = 0

async function um(sql: string, parametros: unknown[] = []): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(sql, parametros)
  return rows[0]!.id
}

interface Cenario {
  readonly lead: string
  readonly reuniao: string
  readonly chamada: string
}

/** Uma reunião daqui a `dias`, uma chamada de lembrete saída da fila e duas ofertas para depois de amanhã. */
async function cenario(status = 'scheduled', proposito = 'reminder'): Promise<Cenario> {
  sequencia += 1
  const lead = await um(
    `insert into public.leads (account_id, name, phone_e164, source) values ($1, $2, $3, 'teste') returning id`,
    [contaA, `Lead ${sequencia}`, `+55119500${String(sequencia).padStart(5, '0')}`],
  )
  const reuniao = await um(
    `insert into public.meetings (account_id, lead_id, specialist_id, starts_at, ends_at, modality, status, notes)
     values ($1, $2, $3, date_trunc('hour', now()) + interval '1 day' + $4 * interval '1 hour',
             date_trunc('hour', now()) + interval '1 day' + $4 * interval '1 hour' + interval '30 minutes',
             'video', $5, 'quer ver a integração') returning id`,
    [contaA, lead, especialista, sequencia, status],
  )
  const chamada = await chamadaDe(lead, proposito)
  await banco.sql.query(
    `insert into public.dial_queue (account_id, lead_id, purpose, source, source_ref, attempt, status, call_id)
     values ($1, $2, $3, $4, $5, 1, 'done', $6)`,
    [contaA, lead, proposito, proposito === 'rescue' ? 'rescue' : 'rem', proposito === 'rescue' ? `${reuniao}:1` : reuniao, chamada],
  )
  await ofertar(chamada, sequencia)
  return { lead, reuniao, chamada }
}

async function chamadaDe(lead: string, proposito = 'reminder'): Promise<string> {
  sequencia += 1
  return um(
    `insert into public.calls (account_id, lead_id, purpose, direction, idempotency_key)
     values ($1, $2, $3, 'outbound', $4) returning id`,
    [contaA, lead, proposito, `teste:${sequencia}`],
  )
}

/** Duas ofertas, daqui a três dias, em horas que só este cenário usa. */
async function ofertar(chamada: string, n: number): Promise<void> {
  for (const posicao of [1, 2]) {
    await banco.sql.query(
      `insert into public.call_slot_offers (account_id, call_id, position, specialist_id, starts_at, ends_at, expires_at)
       values ($1, $2, $3::smallint, $4,
               date_trunc('hour', now()) + interval '3 days' + ($5::int * 2 + $3::int) * interval '1 hour',
               date_trunc('hour', now()) + interval '3 days' + ($5::int * 2 + $3::int) * interval '1 hour' + interval '30 minutes',
               now() + interval '1 hour')`,
      [contaA, chamada, posicao, especialista, n],
    )
  }
}

async function remarcar(conta: string, chamada: string, posicao = 1, agora: string | null = null): Promise<Record<string, unknown>> {
  const { rows } = await banco.sql.query<{ r: Record<string, unknown> }>(
    `select public.remarcar_reuniao($1, $2, $3, 'não posso nesse dia', coalesce($4::timestamptz, now())) as r`,
    [conta, chamada, posicao, agora],
  )
  return rows[0]!.r
}

async function reunioesDoLead(lead: string) {
  const { rows } = await banco.sql.query<{
    id: string
    status: string
    cancel_reason: string | null
    rescheduled_from_id: string | null
    booked_call_id: string | null
    notes: string | null
  }>(
    `select id, status, cancel_reason, rescheduled_from_id, booked_call_id, notes
       from public.meetings where lead_id = $1 order by created_at, id`,
    [lead],
  )
  return rows
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await um(`insert into public.accounts (name) values ('Remarca A') returning id`)
  contaB = await um(`insert into public.accounts (name) values ('Remarca B') returning id`)
  dono = await banco.criarUsuario('dono@remarca.test', 'Dono')
  await banco.sql.query(`insert into public.account_members (account_id, user_id, role) values ($1, $2, 'owner')`, [
    contaA,
    dono,
  ])
  especialista = await um(
    `insert into public.specialists (account_id, name, email, modalities, daily_cap, min_notice_min, max_notice_days)
     values ($1, 'Ana', 'ana@remarca.test', array['video']::text[], 20, 60, 30) returning id`,
    [contaA],
  )
  await banco.sql.query(
    `insert into public.specialist_availability (account_id, specialist_id, weekday, start_time, end_time)
     select $1, $2, d, '00:00', '24:00' from generate_series(0, 6) d`,
    [contaA, especialista],
  )
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
})

describe('remarcar_reuniao', () => {
  test('fecha a antiga e abre a nova na mesma transação, encadeadas, e consome as ofertas', async () => {
    const c = await cenario()
    const resposta = await remarcar(contaA, c.chamada, 2)
    expect(resposta).toMatchObject({ resultado: 'remarcada' })
    const [antiga, nova] = await reunioesDoLead(c.lead)
    expect(antiga).toMatchObject({ id: c.reuniao, status: 'rescheduled', cancel_reason: 'não posso nesse dia' })
    expect(nova).toMatchObject({
      id: resposta.meeting_id,
      status: 'scheduled',
      rescheduled_from_id: c.reuniao,
      booked_call_id: c.chamada,
      notes: 'quer ver a integração',
    })
    const { rows: ofertas } = await banco.sql.query('select 1 from public.call_slot_offers where call_id = $1', [c.chamada])
    expect(ofertas).toEqual([])
    const { rows: eventos } = await banco.sql.query<{ payload: Record<string, unknown> }>(
      `select payload from public.lead_events where lead_id = $1 and kind = 'automation'`,
      [c.lead],
    )
    expect(eventos.map((e) => e.payload)).toEqual([
      { acao: 'reuniao_remarcada', de: c.reuniao, para: resposta.meeting_id, call_id: c.chamada, motivo: 'não posso nesse dia' },
    ])
  })

  test('duas vezes com a mesma posição: a mesma reunião, e não duas', async () => {
    const c = await cenario()
    const primeira = await remarcar(contaA, c.chamada, 1)
    const segunda = await remarcar(contaA, c.chamada, 1)
    expect(segunda).toMatchObject({ resultado: 'ja_remarcada', meeting_id: primeira.meeting_id })
    expect(await reunioesDoLead(c.lead)).toHaveLength(2)
  })

  test('horário tomado no meio (23P01): volta atrás inteira, e o lead continua com a reunião que tinha', async () => {
    const c = await cenario()
    // Outro lead pega o horário da posição 1 com a mesma especialista.
    const outro = await um(
      `insert into public.leads (account_id, name, phone_e164, source) values ($1, 'Outro', '+5511940000999', 'teste') returning id`,
      [contaA],
    )
    await banco.sql.query(
      `insert into public.meetings (account_id, lead_id, specialist_id, starts_at, ends_at, modality)
       select account_id, $2, specialist_id, starts_at, ends_at, 'video' from public.call_slot_offers
        where call_id = $1 and position = 1`,
      [c.chamada, outro],
    )
    expect(await remarcar(contaA, c.chamada, 1)).toEqual({ resultado: 'horario_ocupado' })
    const reunioes = await reunioesDoLead(c.lead)
    expect(reunioes).toHaveLength(1)
    expect(reunioes[0]).toMatchObject({ id: c.reuniao, status: 'scheduled', cancel_reason: null })
    const { rows: ofertas } = await banco.sql.query('select 1 from public.call_slot_offers where call_id = $1', [c.chamada])
    expect(ofertas).toHaveLength(2)
    await banco.sql.query('delete from public.meetings where lead_id = $1', [outro])
  })

  test('oferta de outra chamada não serve', async () => {
    const c = await cenario()
    const outraChamada = await chamadaDe(c.lead)
    await banco.sql.query('delete from public.call_slot_offers where call_id = $1', [c.chamada])
    await ofertar(outraChamada, 90)
    expect(await remarcar(contaA, c.chamada, 1)).toEqual({ resultado: 'posicao_nao_oferecida' })
    expect((await reunioesDoLead(c.lead))[0]).toMatchObject({ status: 'scheduled' })
  })

  test('oferta vencida e posição sem oferta não remarcam', async () => {
    const c = await cenario()
    const depois = new Date(Date.now() + 2 * 3_600_000).toISOString()
    expect(await remarcar(contaA, c.chamada, 1, depois)).toEqual({ resultado: 'oferta_expirada' })
    expect(await remarcar(contaA, c.chamada, 4)).toEqual({ resultado: 'posicao_nao_oferecida' })
    expect(await reunioesDoLead(c.lead)).toHaveLength(1)
  })

  test('no resgate, a reunião da falta atestada não muda de status, e a nova aponta para ela', async () => {
    const c = await cenario('no_show', 'rescue')
    const resposta = await remarcar(contaA, c.chamada, 1)
    expect(resposta).toMatchObject({ resultado: 'remarcada' })
    const [antiga, nova] = await reunioesDoLead(c.lead)
    expect(antiga).toMatchObject({ status: 'no_show', cancel_reason: null })
    expect(nova).toMatchObject({ status: 'scheduled', rescheduled_from_id: c.reuniao })
  })

  test('reunião cancelada não se remarca', async () => {
    const c = await cenario('canceled')
    expect(await remarcar(contaA, c.chamada, 1)).toEqual({ resultado: 'status_nao_elegivel', status: 'canceled' })
  })

  test('a conta vizinha não remarca reunião alheia', async () => {
    const c = await cenario()
    expect(await remarcar(contaB, c.chamada, 1)).toEqual({ resultado: 'sem_reuniao' })
    expect(await reunioesDoLead(c.lead)).toHaveLength(1)
  })
})

describe('cancelar_reuniao_na_ligacao', () => {
  async function cancelar(conta: string, chamada: string): Promise<Record<string, unknown>> {
    const { rows } = await banco.sql.query<{ r: Record<string, unknown> }>(
      `select public.cancelar_reuniao_na_ligacao($1, $2, 'mudou de ideia') as r`,
      [conta, chamada],
    )
    return rows[0]!.r
  }

  test('cancela com o motivo, e a segunda vez é ja_cancelada', async () => {
    const c = await cenario('confirmed')
    expect(await cancelar(contaA, c.chamada)).toMatchObject({ resultado: 'cancelada', meeting_id: c.reuniao })
    expect((await reunioesDoLead(c.lead))[0]).toMatchObject({ status: 'canceled', cancel_reason: 'mudou de ideia' })
    expect(await cancelar(contaA, c.chamada)).toMatchObject({ resultado: 'ja_cancelada' })
  })

  test('a conta vizinha não cancela', async () => {
    const c = await cenario()
    expect(await cancelar(contaB, c.chamada)).toEqual({ resultado: 'sem_reuniao' })
    expect((await reunioesDoLead(c.lead))[0]).toMatchObject({ status: 'scheduled' })
  })
})

test('authenticated recebe permission denied nas duas', async () => {
  const c = await cenario()
  await banco.comoUsuario(dono)
  await expect(banco.sql.query(`select public.remarcar_reuniao($1, $2, 1, 'x', now())`, [contaA, c.chamada])).rejects.toThrow(
    /permission denied/i,
  )
  await banco.comoServico()
  await banco.comoUsuario(dono)
  await expect(banco.sql.query(`select public.cancelar_reuniao_na_ligacao($1, $2, 'x')`, [contaA, c.chamada])).rejects.toThrow(
    /permission denied/i,
  )
  await banco.comoServico()
})
