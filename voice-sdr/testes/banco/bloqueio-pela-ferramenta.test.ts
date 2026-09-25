// As duas escritas das ferramentas do agente: o bloqueio de `tool-dnc` e o item
// de fila que nasce de ferramenta.
//
// O que este arquivo prova:
//
// 1. `bloquear_numero_pela_ferramenta` grava o bloqueio com o instante pedido e
//    devolve `criado = true`; o pedido repetido devolve o instante do bloqueio
//    vigente com `criado = false`, sem segunda linha e sem mexer na primeira.
// 2. Bloqueio removido não absorve: o número pode ser bloqueado de novo.
// 3. Só `lead_request` e `wrong_number` entram por aqui.
// 4. `criar_excecao` grava o item com gênero, severidade, chamada e contexto, e
//    a chave composta recusa chamada de outra conta.
// 5. As duas só executam como `service_role`: `authenticated` e `anon` recebem
//    permission denied, e `public` não está entre os que têm o privilégio.
//
// Referência: migração 20260924180000_bloqueio_pela_ferramenta.sql,
// docs/PRD-implementacao.md seções 3.6, 3.8 e 5, docs/revisao-tecnica.md L-24.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly operadorId: string
  readonly leadId: string
  readonly chamadaId: string
}

const TELEFONE_A = '+5511988880101'
const TELEFONE_B = '+5511988880102'
const INSTANTE = '2026-09-24T14:00:00.000Z'
const DEPOIS = '2026-09-24T14:03:00.000Z'

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

async function criarConta(nome: string, dominio: string, telefone: string): Promise<Conta> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role) values ($1, $2, 'operator')`,
    [id, operadorId],
  )
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Lead do bloqueio', $2, 'cenario') returning id`,
    [id, telefone],
  )
  const leadId = leads[0]!.id
  const { rows: chamadas } = await banco.sql.query<{ id: string }>(
    `insert into public.calls (account_id, lead_id, purpose, direction, idempotency_key)
     values ($1, $2, 'discovery', 'outbound', $3) returning id`,
    [id, leadId, `bloqueio-${dominio}`],
  )
  return { id, operadorId, leadId, chamadaId: chamadas[0]!.id }
}

async function bloquear(
  conta: Conta,
  campos: { telefone?: string; origem?: string; notas?: string | null; instante?: string } = {},
): Promise<{ blocked_at: Date; criado: boolean }> {
  const { rows } = await banco.sql.query<{ blocked_at: Date; criado: boolean }>(
    `select * from public.bloquear_numero_pela_ferramenta($1, $2, $3, $4, $5, $6)`,
    [
      conta.id,
      campos.telefone ?? TELEFONE_A,
      campos.origem ?? 'lead_request',
      'Pediu para não ser chamado durante a ligação',
      campos.notas === undefined ? 'disse que já tem fornecedor' : campos.notas,
      campos.instante ?? INSTANTE,
    ],
  )
  return rows[0]!
}

async function bloqueiosDe(conta: Conta) {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    phone_e164: string
    source: string
    notes: string | null
    created_at: Date
    removed_at: Date | null
  }>(
    `select phone_e164, source, notes, created_at, removed_at
       from public.dnc_entries where account_id = $1 order by created_at`,
    [conta.id],
  )
  return rows
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test', TELEFONE_A)
  contaB = await criarConta('Cooperativa Sul', 'sul.test', TELEFONE_B)
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.exception_items')
  await banco.sql.query('delete from public.dnc_entries')
})

// O bloqueio -----------------------------------------------------------------------

test('grava o bloqueio com o instante pedido e diz que criou', async () => {
  const resultado = await bloquear(contaA)

  expect(resultado.criado).toBe(true)
  expect(resultado.blocked_at.toISOString()).toBe(INSTANTE)
  const linhas = await bloqueiosDe(contaA)
  expect(linhas).toHaveLength(1)
  expect(linhas[0]).toMatchObject({
    phone_e164: TELEFONE_A,
    source: 'lead_request',
    notes: 'disse que já tem fornecedor',
    removed_at: null,
  })
})

test('o pedido repetido devolve o instante do bloqueio vigente, sem segunda linha', async () => {
  await bloquear(contaA)
  const repetido = await bloquear(contaA, { instante: DEPOIS, notas: 'pediu de novo' })

  expect(repetido.criado).toBe(false)
  expect(repetido.blocked_at.toISOString()).toBe(INSTANTE)
  const linhas = await bloqueiosDe(contaA)
  expect(linhas).toHaveLength(1)
  expect(linhas[0]!.notes).toBe('disse que já tem fornecedor')
})

test('bloqueio removido não absorve: o número volta a ser bloqueado em linha nova', async () => {
  await bloquear(contaA)
  await banco.sql.query(
    `update public.dnc_entries
        set removed_at = now(), removed_by = $2, removal_reason = 'pediu para voltar'
      where account_id = $1`,
    [contaA.id, contaA.operadorId],
  )
  const deNovo = await bloquear(contaA, { instante: DEPOIS })

  expect(deNovo.criado).toBe(true)
  expect(deNovo.blocked_at.toISOString()).toBe(DEPOIS)
  expect(await bloqueiosDe(contaA)).toHaveLength(2)
})

test('o bloqueio de uma conta não absorve o mesmo número na outra', async () => {
  await bloquear(contaA)
  const naOutra = await bloquear(contaB)

  expect(naOutra.criado).toBe(true)
  expect(await bloqueiosDe(contaB)).toHaveLength(1)
})

test('wrong_number entra com a origem própria', async () => {
  await bloquear(contaA, { origem: 'wrong_number', notas: null })

  const linhas = await bloqueiosDe(contaA)
  expect(linhas[0]).toMatchObject({ source: 'wrong_number', notes: null })
})

test('notas em branco viram nulo, e não vazio', async () => {
  await bloquear(contaA, { notas: '   ' })

  expect((await bloqueiosDe(contaA))[0]!.notes).toBeNull()
})

test.each(['manual', 'import', 'call', null])('a origem %s não entra pela ferramenta', async (origem) => {
  await expect(
    banco.sql.query(`select * from public.bloquear_numero_pela_ferramenta($1, $2, $3, 'motivo', null, $4)`, [
      contaA.id,
      TELEFONE_A,
      origem,
      INSTANTE,
    ]),
  ).rejects.toThrow(/origem_invalida/)
  expect(await bloqueiosDe(contaA)).toHaveLength(0)
})

// O item de fila -------------------------------------------------------------------

test('criar_excecao grava o item aberto com gênero, severidade, chamada e contexto', async () => {
  const { rows } = await banco.sql.query<{ id: string }>(
    `select public.criar_excecao($1, 'dnc_requested', 'baixa', $2, $3, $4) as id`,
    [contaA.id, contaA.chamadaId, contaA.leadId, JSON.stringify({ call_id: contaA.chamadaId, relato: 'não liga mais' })],
  )

  const { rows: itens } = await banco.sql.query<{
    kind: string
    severity: string
    status: string
    call_id: string
    lead_id: string
    context: Record<string, unknown>
  }>('select kind, severity, status, call_id, lead_id, context from public.exception_items where id = $1', [
    rows[0]!.id,
  ])
  expect(itens[0]).toEqual({
    kind: 'dnc_requested',
    severity: 'baixa',
    status: 'aberto',
    call_id: contaA.chamadaId,
    lead_id: contaA.leadId,
    context: { call_id: contaA.chamadaId, relato: 'não liga mais' },
  })
})

test('criar_excecao recusa chamada de outra conta pela chave composta', async () => {
  await expect(
    banco.sql.query(`select public.criar_excecao($1, 'dnc_requested', 'baixa', $2, null, '{}')`, [
      contaA.id,
      contaB.chamadaId,
    ]),
  ).rejects.toThrow(/exception_items_chamada_da_conta/)
})

test('criar_excecao recusa gênero fora da lista pelo check da tabela', async () => {
  await expect(
    banco.sql.query(`select public.criar_excecao($1, 'negative_sentiment', 'baixa', null, null, '{}')`, [
      contaA.id,
    ]),
  ).rejects.toThrow(/exception_items_genero_conhecido/)
})

// Quem executa ---------------------------------------------------------------------

const FUNCOES = ['bloquear_numero_pela_ferramenta', 'criar_excecao'] as const

test.each(FUNCOES)('%s: só service_role tem o privilégio, e public não', async (funcao) => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ papel: string }>(
    `select grantee as papel
       from information_schema.routine_privileges
      where specific_schema = 'public'
        and routine_name = $1
        and privilege_type = 'EXECUTE'`,
    [funcao],
  )
  const papeis = rows.map((linha) => linha.papel)

  expect(papeis).toContain('service_role')
  expect(papeis).not.toContain('PUBLIC')
  expect(papeis).not.toContain('authenticated')
  expect(papeis).not.toContain('anon')
})

test('service_role executa as duas', async () => {
  await banco.sql.exec('set role service_role')
  try {
    await bloquear(contaA)
    await banco.sql.query(`select public.criar_excecao($1, 'dnc_requested', 'baixa', null, null, '{}')`, [
      contaA.id,
    ])
  } finally {
    await banco.comoServico()
  }
  expect(await bloqueiosDe(contaA)).toHaveLength(1)
})

test('o operador da conta recebe permission denied nas duas', async () => {
  await banco.comoUsuario(contaA.operadorId)
  await expect(bloquear(contaA)).rejects.toThrow(/permission denied/)
  await expect(
    banco.sql.query(`select public.criar_excecao($1, 'dnc_requested', 'baixa', null, null, '{}')`, [contaA.id]),
  ).rejects.toThrow(/permission denied/)
  expect(await bloqueiosDe(contaA)).toHaveLength(0)
})

test('a sessão anônima recebe permission denied', async () => {
  await banco.comoAnonimo()
  await expect(bloquear(contaA)).rejects.toThrow(/permission denied/)
  await banco.comoServico()
})
