// A estimativa de custo antes de ligar (D-14).
//
// O que este arquivo prova:
//
// 1. Sem ligação medida, as listas vêm vazias e a duração é nula: nenhum
//    preço de tabela entra.
// 2. A amostra é das ligações atendidas, encerradas, com duração e com preço.
//    A não atendida, a sem preço ainda e o ensaio (T-16) ficam fora, e a
//    ligação de outra conta também.
// 3. Por moeda, nunca somando dólar com real: custo médio por ligação e por
//    minuto, e a duração média.
// 4. Só as últimas 20 ligações entram.
// 5. Quem não é membro recebe sem_permissao; anon e service_role não executam.
//
// Referência: migração 20261020000000_estimativa_de_custo.sql.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

interface Estimativa {
  ligacoes_medidas: number
  duracao_media_seg: number | null
  por_ligacao: { moeda: string; centavos: number }[]
  por_minuto: { moeda: string; centavos: number }[]
}

let banco: BancoDeTeste
let contaA: string
let donoA: string
let contaB: string
let donoB: string

async function criarConta(nome: string, email: string): Promise<{ id: string; donoId: string }> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id
  const donoId = await banco.criarUsuario(email, nome)
  await banco.sql.query(
    "insert into public.account_members (account_id, user_id, role) values ($1, $2, 'owner')",
    [id, donoId],
  )
  return { id, donoId }
}

interface Chamada {
  conta?: string
  direcao?: 'outbound' | 'inbound' | 'rehearsal'
  iniciada: string
  atendida?: boolean
  duracao?: number | null
  custos?: { componente: string; centavos: number; moeda: string }[]
}

async function chamada(c: Chamada): Promise<string> {
  const conta = c.conta ?? contaA
  const atendida = c.atendida ?? true
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls
       (account_id, purpose, direction, status, idempotency_key,
        started_at, answered_at, duration_sec, end_reason)
     values ($1, 'discovery', $2, 'ended', $3, $4,
             case when $5::boolean then $4::timestamptz else null end,
             $6, case when $5::boolean then 'completed' else 'no_answer' end)
     returning id`,
    [conta, c.direcao ?? 'outbound', crypto.randomUUID(), c.iniciada, atendida, c.duracao ?? null],
  )
  const id = rows[0]!.id
  for (const custo of c.custos ?? []) {
    await banco.sql.query(
      `insert into public.call_costs (account_id, call_id, component, amount_cents, currency, source)
       values ($1, $2, $3, $4, $5, 'provider_webhook')`,
      [conta, id, custo.componente, custo.centavos, custo.moeda],
    )
  }
  return id
}

async function estimativa(dono = donoA, conta = contaA): Promise<Estimativa> {
  await banco.comoUsuario(dono)
  try {
    const { rows } = await banco.sql.query<{ e: Estimativa }>(
      'select public.estimativa_de_custo($1) as e',
      [conta],
    )
    return rows[0]!.e
  } finally {
    await banco.comoServico()
  }
}

let rodada = 0

beforeAll(async () => {
  banco = await criarBancoDeTeste()
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

// Um par de contas novo por teste, no mesmo banco: cada teste começa sem
// ligação nenhuma, sem pagar a aplicação das migrações de novo.
beforeEach(async () => {
  rodada += 1
  await banco.comoServico()
  const a = await criarConta('Aurora Serviços', `dona${rodada}@aurora.test`)
  contaA = a.id
  donoA = a.donoId
  const b = await criarConta('Metalúrgica Sul', `dono${rodada}@metal.test`)
  contaB = b.id
  donoB = b.donoId
})

describe('estimativa de custo', () => {
  test('sem ligação medida, não há estimativa nem preço inventado', async () => {
    expect(await estimativa()).toEqual({
      ligacoes_medidas: 0,
      duracao_media_seg: null,
      por_ligacao: [],
      por_minuto: [],
    })
  })

  test('média por ligação e por minuto, por moeda, só das atendidas com preço', async () => {
    // Duas medidas: 120 s e 60 s, 180 s ao todo.
    await chamada({
      iniciada: '2026-09-10T10:00:00Z',
      duracao: 120,
      custos: [
        { componente: 'telephony', centavos: 40, moeda: 'BRL' },
        { componente: 'voice', centavos: 30, moeda: 'USD' },
      ],
    })
    await chamada({
      iniciada: '2026-09-11T10:00:00Z',
      duracao: 60,
      custos: [
        { componente: 'telephony', centavos: 20, moeda: 'BRL' },
        { componente: 'voice', centavos: 15, moeda: 'USD' },
      ],
    })
    // Fora da amostra: não atendida, sem preço ainda, ensaio e outra conta.
    await chamada({
      iniciada: '2026-09-12T10:00:00Z',
      atendida: false,
      custos: [{ componente: 'telephony', centavos: 5, moeda: 'BRL' }],
    })
    await chamada({ iniciada: '2026-09-13T10:00:00Z', duracao: 300 })
    await chamada({
      direcao: 'rehearsal',
      iniciada: '2026-09-14T10:00:00Z',
      duracao: 600,
      custos: [{ componente: 'voice', centavos: 900, moeda: 'USD' }],
    })
    await chamada({
      conta: contaB,
      iniciada: '2026-09-14T10:00:00Z',
      duracao: 600,
      custos: [{ componente: 'telephony', centavos: 900, moeda: 'BRL' }],
    })

    expect(await estimativa()).toEqual({
      ligacoes_medidas: 2,
      duracao_media_seg: 90,
      // (40 + 20) / 2 e (30 + 15) / 2, arredondados.
      por_ligacao: [
        { moeda: 'BRL', centavos: 30 },
        { moeda: 'USD', centavos: 23 },
      ],
      // (40 + 20) por 3 min e (30 + 15) por 3 min.
      por_minuto: [
        { moeda: 'BRL', centavos: 20 },
        { moeda: 'USD', centavos: 15 },
      ],
    })

    // A outra conta vê só a dela.
    expect((await estimativa(donoB, contaB)).ligacoes_medidas).toBe(1)
  })

  test('só as últimas 20 ligações entram na média', async () => {
    // Uma ligação cara e antiga, e 20 mais novas a R$ 0,10.
    await chamada({
      iniciada: '2026-08-01T10:00:00Z',
      duracao: 60,
      custos: [{ componente: 'telephony', centavos: 10_000, moeda: 'BRL' }],
    })
    for (let dia = 1; dia <= 20; dia += 1) {
      await chamada({
        iniciada: `2026-09-${String(dia).padStart(2, '0')}T10:00:00Z`,
        duracao: 60,
        custos: [{ componente: 'telephony', centavos: 10, moeda: 'BRL' }],
      })
    }

    const resultado = await estimativa()
    expect(resultado.ligacoes_medidas).toBe(20)
    expect(resultado.por_ligacao).toEqual([{ moeda: 'BRL', centavos: 10 }])
  })

  test('quem não é membro da conta recebe sem_permissao', async () => {
    await banco.comoUsuario(donoB)
    try {
      await expect(
        banco.sql.query('select public.estimativa_de_custo($1)', [contaA]),
      ).rejects.toMatchObject({ message: 'sem_permissao', code: '42501' })
    } finally {
      await banco.comoServico()
    }
  })

  test('execução só para authenticated: public, anon e service_role ficam de fora', async () => {
    const { rows } = await banco.sql.query<{ grantee: string }>(
      `select grantee from information_schema.routine_privileges
        where routine_schema = 'public' and routine_name = 'estimativa_de_custo'
          and privilege_type = 'EXECUTE'
        order by grantee`,
    )
    const papeis = rows.map((r) => r.grantee)
    expect(papeis).toContain('authenticated')
    expect(papeis).not.toContain('PUBLIC')
    expect(papeis).not.toContain('anon')
    expect(papeis).not.toContain('service_role')
  })
})
