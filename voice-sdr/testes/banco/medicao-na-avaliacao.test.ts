// A medição que a finalização grava na avaliação da chamada (US-109, RF-422).
//
// O que este arquivo prova:
//
// 1. `registrar_medicao_da_avaliacao` mescla em `evaluation.medicoes` e deixa o
//    resto da avaliação (o juízo do modelo, outra medição) como estava.
// 2. A mesma medição gravada de novo substitui a anterior, sem acumular: é o
//    que a segunda passagem da finalização faz.
// 3. `medicoes` com forma inesperada é trocado por objeto, em vez de derrubar a
//    escrita.
// 4. Chamada de outra conta não é tocada, e a função devolve falso.
// 5. Critério e medição malformados são recusados.
// 6. Só `service_role` executa.
//
// Referência: migração 20260924190000_medicao_na_avaliacao.sql.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

const CRITERIO = 'encerramento_pessoa_errada'
const DIVERGENCIA = { conforme: false, falas: 3, limite: 2, encerrou_com_end_call: true, requisito: 'RF-422' }

let banco: BancoDeTeste
let contaA: { id: string; operadorId: string; chamadaId: string }
let contaB: { id: string; operadorId: string; chamadaId: string }

async function criarConta(nome: string, dominio: string) {
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
  const { rows: chamadas } = await banco.sql.query<{ id: string }>(
    `insert into public.calls (account_id, purpose, direction, idempotency_key)
     values ($1, 'discovery', 'outbound', $2) returning id`,
    [id, `medicao-${dominio}`],
  )
  return { id, operadorId, chamadaId: chamadas[0]!.id }
}

async function medir(contaId: string, chamadaId: string, criterio: string, medicao: unknown): Promise<boolean> {
  const { rows } = await banco.sql.query<{ gravou: boolean }>(
    'select public.registrar_medicao_da_avaliacao($1, $2, $3, $4::jsonb) as gravou',
    [contaId, chamadaId, criterio, JSON.stringify(medicao)],
  )
  return rows[0]!.gravou
}

async function avaliacao(chamadaId: string): Promise<Record<string, unknown>> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ evaluation: Record<string, unknown> }>(
    'select evaluation from public.calls where id = $1',
    [chamadaId],
  )
  return rows[0]!.evaluation
}

async function definirAvaliacao(chamadaId: string, valor: unknown): Promise<void> {
  await banco.comoServico()
  await banco.sql.query('update public.calls set evaluation = $2::jsonb where id = $1', [
    chamadaId,
    JSON.stringify(valor),
  ])
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
  await definirAvaliacao(contaA.chamadaId, {})
  await definirAvaliacao(contaB.chamadaId, {})
})

test('mescla em medicoes e deixa o juízo do modelo e outra medição como estavam', async () => {
  const juizo = { criterios: { pessoa_errada: { aprovado: false, justificativa: 'explicou o produto' } }, modelo: 'm' }
  await definirAvaliacao(contaA.chamadaId, { ...juizo, medicoes: { outra: { x: 1 } } })

  expect(await medir(contaA.id, contaA.chamadaId, CRITERIO, DIVERGENCIA)).toBe(true)

  expect(await avaliacao(contaA.chamadaId)).toEqual({
    ...juizo,
    medicoes: { outra: { x: 1 }, [CRITERIO]: DIVERGENCIA },
  })
})

test('a mesma medição de novo substitui a anterior', async () => {
  await medir(contaA.id, contaA.chamadaId, CRITERIO, { ...DIVERGENCIA, falas: 4 })
  await medir(contaA.id, contaA.chamadaId, CRITERIO, DIVERGENCIA)
  expect(await avaliacao(contaA.chamadaId)).toEqual({ medicoes: { [CRITERIO]: DIVERGENCIA } })
})

test('medicoes com forma inesperada vira objeto', async () => {
  await definirAvaliacao(contaA.chamadaId, { medicoes: [1, 2] })
  await medir(contaA.id, contaA.chamadaId, CRITERIO, DIVERGENCIA)
  expect(await avaliacao(contaA.chamadaId)).toEqual({ medicoes: { [CRITERIO]: DIVERGENCIA } })
})

test('chamada de outra conta não é tocada', async () => {
  expect(await medir(contaA.id, contaB.chamadaId, CRITERIO, DIVERGENCIA)).toBe(false)
  expect(await avaliacao(contaB.chamadaId)).toEqual({})
})

test('critério e medição malformados são recusados', async () => {
  await expect(medir(contaA.id, contaA.chamadaId, 'Encerramento Errado', DIVERGENCIA)).rejects.toThrow(/criterio_invalido/)
  await expect(medir(contaA.id, contaA.chamadaId, CRITERIO, [3])).rejects.toThrow(/medicao_invalida/)
  expect(await avaliacao(contaA.chamadaId)).toEqual({})
})

test('só service_role executa', async () => {
  const { rows } = await banco.sql.query<{ papel: string }>(
    `select grantee as papel
       from information_schema.routine_privileges
      where specific_schema = 'public'
        and routine_name = 'registrar_medicao_da_avaliacao'
        and privilege_type = 'EXECUTE'`,
  )
  const papeis = rows.map((linha) => linha.papel)
  expect(papeis).toContain('service_role')
  expect(papeis).not.toContain('PUBLIC')
  expect(papeis).not.toContain('authenticated')
  expect(papeis).not.toContain('anon')

  await banco.comoUsuario(contaA.operadorId)
  await expect(medir(contaA.id, contaA.chamadaId, CRITERIO, DIVERGENCIA)).rejects.toThrow(/permission denied/)
  expect(await avaliacao(contaA.chamadaId)).toEqual({})
})
