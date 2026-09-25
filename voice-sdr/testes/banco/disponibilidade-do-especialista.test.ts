// A disponibilidade semanal e os bloqueios pontuais: o que a agenda abre e o
// que ela fecha. O que se prova aqui:
//
// 1. Duas faixas no mesmo dia convivem — manhã e tarde, com almoço no meio é o
//    caso comum, e uma chave que as impedisse quebraria o cadastro normal.
// 2. A faixa sobreposta também entra, de propósito: unir 9–12 com 11–13 é do
//    gerador de horários da US-164, porque nenhuma expressão imutável sobre
//    `time` serve de chave de exclusão. O que a chave impede é a linha repetida.
// 3. Cada check recusa o valor proibido, um a um: fim antes do início, fim igual
//    ao início, dia da semana fora de 0 a 6, motivo em branco.
// 4. O bloqueio sobreposto do mesmo especialista é recusado com SQLSTATE 23P01,
//    e o encostado convive — o intervalo é `[)`, então o que termina às 10h não
//    conflita com o que começa às 10h.
// 5. Classe Configuração: membro lê, administrador escreve, operador não.
// 6. A conta vizinha recebe zero linha, e a sessão anônima também.
//
// Referência: migração 20260921180000_disponibilidade_do_especialista.sql,
// docs/PRD-implementacao.md seções 3.3 e 3.9, docs/PRD.md RF-502 e RF-503,
// docs/revisao-tecnica.md T-21.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

/** SQLSTATE da restrição de exclusão. */
const CONFLITO_DE_EXCLUSAO = '23P01'

interface Conta {
  readonly id: string
  readonly adminId: string
  readonly operadorId: string
  readonly especialistaId: string
  readonly outroEspecialistaId: string
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

  const especialistaId = await criarEspecialista(id, `Ana de ${nome}`, dominio)
  const outroEspecialistaId = await criarEspecialista(
    id,
    `Bruno de ${nome}`,
    dominio,
  )

  return { id, adminId, operadorId, especialistaId, outroEspecialistaId }
}

async function criarEspecialista(
  contaId: string,
  nome: string,
  dominio: string,
): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.specialists (account_id, name, email, modalities)
     values ($1, $2, $3, array['video']::text[])
     returning id`,
    [contaId, nome, `${nome.replace(/\s+/g, '.').toLowerCase()}@${dominio}`],
  )
  return rows[0]!.id
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

async function abrirFaixa(
  conta: Conta,
  campos: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  return inserir('specialist_availability', {
    account_id: conta.id,
    specialist_id: conta.especialistaId,
    weekday: 2,
    start_time: '09:00',
    end_time: '12:00',
    ...campos,
  })
}

async function bloquear(
  conta: Conta,
  campos: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  return inserir('specialist_blocks', {
    account_id: conta.id,
    specialist_id: conta.especialistaId,
    starts_at: '2026-10-01T09:00:00Z',
    ends_at: '2026-10-01T11:00:00Z',
    ...campos,
  })
}

async function inserir(
  tabela: string,
  campos: Readonly<Record<string, unknown>>,
): Promise<string> {
  const colunas = Object.keys(campos)
  const valores = Object.values(campos)
  const marcadores = colunas.map((_, indice) => `$${indice + 1}`)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.${tabela} (${colunas.join(', ')})
     values (${marcadores.join(', ')})
     returning id`,
    valores,
  )
  return rows[0]!.id
}

/** Limpa as duas tabelas entre testes: a restrição de exclusão é entre linhas. */
async function limpar(): Promise<void> {
  await banco.sql.query('delete from public.specialist_blocks')
  await banco.sql.query('delete from public.specialist_availability')
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test')
  contaB = await criarConta('Cooperativa Sul', 'sul.test')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

// Papel deixado por um teste anterior não contamina o próximo.
beforeEach(async () => {
  await banco.comoServico()
  await limpar()
})

// Disponibilidade semanal ----------------------------------------------------

test('duas faixas no mesmo dia convivem, e a repetida não', async () => {
  const manha = await abrirFaixa(contaA, { start_time: '09:00', end_time: '12:00' })
  const tarde = await abrirFaixa(contaA, { start_time: '14:00', end_time: '18:00' })
  expect(manha).not.toBe(tarde)

  // Sobreposta entra: unir 9–12 com 11–13 é trabalho do gerador de horários,
  // e não do banco. Se um dia virar restrição, este teste cai e a decisão
  // reaparece em vez de sumir.
  const sobreposta = await abrirFaixa(contaA, {
    start_time: '11:00',
    end_time: '13:00',
  })
  expect(sobreposta).toBeTruthy()

  const repetida = await erroDe(
    abrirFaixa(contaA, { start_time: '09:00', end_time: '10:00' }),
  )
  expect(repetida.message).toMatch(
    /specialist_availability_specialist_id_weekday_start_time_key/i,
  )
})

test('a mesma faixa em outro dia da semana entra, e o domingo é 0', async () => {
  const terca = await abrirFaixa(contaA, { weekday: 2 })
  const domingo = await abrirFaixa(contaA, { weekday: 0 })
  const sabado = await abrirFaixa(contaA, { weekday: 6 })
  expect(new Set([terca, domingo, sabado]).size).toBe(3)

  const oitavoDia = await erroDe(abrirFaixa(contaA, { weekday: 7 }))
  expect(oitavoDia.message).toMatch(/weekday/i)

  const antesDoDomingo = await erroDe(abrirFaixa(contaA, { weekday: -1 }))
  expect(antesDoDomingo.message).toMatch(/weekday/i)
})

test('o banco recusa faixa que termina antes de começar, ou no mesmo instante', async () => {
  const invertida = await erroDe(
    abrirFaixa(contaA, { start_time: '18:00', end_time: '09:00' }),
  )
  expect(invertida.message).toMatch(/specialist_availability_faixa_util/i)

  const vazia = await erroDe(
    abrirFaixa(contaA, { start_time: '09:00', end_time: '09:00' }),
  )
  expect(vazia.message).toMatch(/specialist_availability_faixa_util/i)
})

test('a faixa fecha o dia inteiro com 24:00, que é hora válida', async () => {
  const id = await abrirFaixa(contaA, {
    start_time: '00:00',
    end_time: '24:00',
  })
  const { rows } = await banco.sql.query<{ end_time: string }>(
    'select end_time from public.specialist_availability where id = $1',
    [id],
  )
  expect(rows[0]?.end_time).toBe('24:00:00')
})

test('a faixa diz em que fuso as horas valem, e o dia 0 é domingo', async () => {
  const { rows } = await banco.sql.query<{
    tabela: string | null
    dia: string | null
  }>(
    `select obj_description('public.specialist_availability'::regclass, 'pg_class') as tabela,
            col_description('public.specialist_availability'::regclass, a.attnum) as dia
       from pg_attribute as a
      where a.attrelid = 'public.specialist_availability'::regclass
        and a.attname = 'weekday'`,
  )

  // T-21: sem esta frase, quem escrever o gerador de horários cai no fuso da
  // conta, que é o de quem contratou e não o de quem atende.
  expect(rows[0]?.tabela).toMatch(/fuso do especialista/i)
  expect(rows[0]?.dia).toMatch(/domingo/i)
})

// Bloqueios pontuais ---------------------------------------------------------

test('dois bloqueios sobrepostos do mesmo especialista não convivem', async () => {
  await bloquear(contaA, {
    starts_at: '2026-10-01T09:00:00Z',
    ends_at: '2026-10-01T11:00:00Z',
  })

  const sobreposto = await erroDe(
    bloquear(contaA, {
      starts_at: '2026-10-01T10:00:00Z',
      ends_at: '2026-10-01T12:00:00Z',
    }),
  )
  expect(sobreposto.code).toBe(CONFLITO_DE_EXCLUSAO)
  expect(sobreposto.message).toMatch(/specialist_blocks_sem_sobreposicao/i)

  // Contido por inteiro também é sobreposição.
  const contido = await erroDe(
    bloquear(contaA, {
      starts_at: '2026-10-01T09:30:00Z',
      ends_at: '2026-10-01T10:00:00Z',
    }),
  )
  expect(contido.code).toBe(CONFLITO_DE_EXCLUSAO)
})

test('bloqueios encostados convivem, porque o intervalo é aberto no fim', async () => {
  const manha = await bloquear(contaA, {
    starts_at: '2026-10-01T09:00:00Z',
    ends_at: '2026-10-01T11:00:00Z',
  })
  const logoDepois = await bloquear(contaA, {
    starts_at: '2026-10-01T11:00:00Z',
    ends_at: '2026-10-01T13:00:00Z',
  })
  expect(manha).not.toBe(logoDepois)
})

test('o bloqueio de outro especialista no mesmo horário entra', async () => {
  await bloquear(contaA)
  const doOutro = await bloquear(contaA, {
    specialist_id: contaA.outroEspecialistaId,
  })
  expect(doOutro).toBeTruthy()

  // E o da conta vizinha também: a restrição é por especialista.
  const daVizinha = await bloquear(contaB)
  expect(daVizinha).toBeTruthy()
})

test('o banco recusa bloqueio que termina antes de começar, e motivo em branco', async () => {
  const invertido = await erroDe(
    bloquear(contaA, {
      starts_at: '2026-10-01T11:00:00Z',
      ends_at: '2026-10-01T09:00:00Z',
    }),
  )
  expect(invertido.message).toMatch(/specialist_blocks_intervalo_util/i)

  const semDuracao = await erroDe(
    bloquear(contaA, {
      starts_at: '2026-10-01T09:00:00Z',
      ends_at: '2026-10-01T09:00:00Z',
    }),
  )
  expect(semDuracao.message).toMatch(/specialist_blocks_intervalo_util/i)

  const emBranco = await erroDe(bloquear(contaA, { reason: '  ' }))
  expect(emBranco.message).toMatch(/reason/i)
})

test('o bloqueio sem motivo é cadastro normal', async () => {
  const id = await bloquear(contaA)
  const { rows } = await banco.sql.query<{ reason: string | null }>(
    'select reason from public.specialist_blocks where id = $1',
    [id],
  )
  expect(rows[0]?.reason).toBeNull()
})

// Isolamento -----------------------------------------------------------------

test('o administrador abre faixa e bloqueia agenda; o operador não', async () => {
  await banco.comoUsuario(contaA.operadorId)
  const faixaDoOperador = await erroDe(abrirFaixa(contaA))
  expect(faixaDoOperador.message).toMatch(/row-level security/i)

  const bloqueioDoOperador = await erroDe(bloquear(contaA))
  expect(bloqueioDoOperador.message).toMatch(/row-level security/i)

  await banco.comoUsuario(contaA.adminId)
  expect(await abrirFaixa(contaA)).toBeTruthy()
  expect(await bloquear(contaA)).toBeTruthy()
})

test('o operador lê a agenda e não altera nem apaga o que está nela', async () => {
  const faixa = await abrirFaixa(contaA)
  const bloqueio = await bloquear(contaA)

  await banco.comoUsuario(contaA.operadorId)

  const { rows: faixas } = await banco.sql.query(
    'select id from public.specialist_availability where id = $1',
    [faixa],
  )
  expect(faixas).toHaveLength(1)
  const { rows: bloqueios } = await banco.sql.query(
    'select id from public.specialist_blocks where id = $1',
    [bloqueio],
  )
  expect(bloqueios).toHaveLength(1)

  // RLS que não casa não levanta erro: simplesmente não afeta linha.
  const { rows: alteradas } = await banco.sql.query(
    `update public.specialist_availability set end_time = '23:00'
      where id = $1 returning id`,
    [faixa],
  )
  expect(alteradas).toEqual([])

  const { rows: apagadas } = await banco.sql.query(
    'delete from public.specialist_blocks where id = $1 returning id',
    [bloqueio],
  )
  expect(apagadas).toEqual([])
})

test('a conta vizinha não aparece na agenda, e o anônimo não lê nada', async () => {
  await abrirFaixa(contaA)
  await bloquear(contaA)
  await abrirFaixa(contaB)
  await bloquear(contaB)

  await banco.comoUsuario(contaA.adminId)
  for (const tabela of ['specialist_availability', 'specialist_blocks']) {
    const { rows } = await banco.sql.query<{ account_id: string }>(
      `select account_id from public.${tabela}`,
    )
    expect(rows.length, `${tabela} ficou vazia para quem é da conta`).toBe(1)
    expect(rows[0]?.account_id, `${tabela} atravessou para a conta vizinha`).toBe(
      contaA.id,
    )
  }

  await banco.comoAnonimo()
  for (const tabela of ['specialist_availability', 'specialist_blocks']) {
    const { rows } = await banco.sql.query(`select id from public.${tabela}`)
    expect(rows, `${tabela} respondeu à sessão anônima`).toEqual([])
  }
})

test('o administrador da conta vizinha não escreve na agenda daqui', async () => {
  await banco.comoUsuario(contaB.adminId)

  const faixa = await erroDe(
    inserir('specialist_availability', {
      account_id: contaA.id,
      specialist_id: contaA.especialistaId,
      weekday: 3,
      start_time: '09:00',
      end_time: '12:00',
    }),
  )
  expect(faixa.message).toMatch(/row-level security/i)
})

// Trilha ---------------------------------------------------------------------

test('mudar a agenda entra na trilha de auditoria', async () => {
  const faixa = await abrirFaixa(contaA)

  await banco.sql.query(
    `update public.specialist_availability set end_time = '13:00' where id = $1`,
    [faixa],
  )

  const { rows } = await banco.sql.query<{ payload: { campos: string[] } }>(
    `select payload from public.audit_log
      where target_type = 'specialist_availability' and target_id = $1`,
    [faixa],
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.payload.campos).toEqual(['end_time'])
})

test('updated_at não aceita data vinda de fora', async () => {
  const bloqueio = await bloquear(contaA)

  const { rows } = await banco.sql.query<{
    updated_at: string
    created_at: string
  }>(
    `update public.specialist_blocks
        set reason = 'férias', updated_at = '2001-01-01T00:00:00Z'
      where id = $1
      returning updated_at, created_at`,
    [bloqueio],
  )

  expect(rows[0]!.updated_at >= rows[0]!.created_at).toBe(true)
})
