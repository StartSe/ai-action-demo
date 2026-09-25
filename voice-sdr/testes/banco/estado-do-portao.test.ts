// O estado do portão que a tela de discagem lê (US-119, RF-912, L-03).
//
// `estado_do_portao` repete o passo 2 de `guard_dial` para a tela dizer o que
// falta sem calcular nada. O que este arquivo prova:
//
// 1. **Paridade com a guarda.** Nas quatro combinações da bandeira e da
//    ligação de teste, a lista do que falta é vazia exatamente quando a guarda
//    deixa passar um número fora da lista de teste. Uma função que dissesse
//    "liberado" com a guarda fechada mandaria a pessoa discar para ser recusada.
// 2. **Cada condição separada**, na ordem da guarda: a bandeira, depois a
//    ligação de teste.
// 3. **Leitura de membro.** Qualquer papel da conta lê; quem é de outra conta
//    recebe zero linha, e a sessão anônima não executa.

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

/** Quarta-feira, 14h em São Paulo: dentro da janela padrão. */
const QUARTA_14H = '2026-09-23T17:00:00Z'
/** Número de lead real: fora da lista de teste. */
const LEAD_REAL = '+5511988887777'
const LIGACAO = '2026-09-22T15:00:00Z'

interface Estado {
  real_dialing: boolean
  first_test_call_ok_at: Date | null
  falta: string[]
}

let banco: BancoDeTeste
let contaId: string
let outraContaId: string
let operadorId: string
let observadorId: string
let vizinhoId: string

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  await banco.comoServico()

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name, timezone)
     values ('Portão', 'America/Sao_Paulo'), ('Vizinha', 'America/Sao_Paulo')
     returning id`,
  )
  contaId = rows[0]!.id
  outraContaId = rows[1]!.id

  await banco.sql.query(
    `insert into public.phone_lines (account_id, e164, label)
     values ($1, '+5511400000001', 'Linha do portão')`,
    [contaId],
  )

  operadorId = await banco.criarUsuario('operador@portao.test', 'Operador')
  observadorId = await banco.criarUsuario('observador@portao.test', 'Observador')
  vizinhoId = await banco.criarUsuario('dono@vizinha.test', 'Vizinho')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'operator'), ($1, $3, 'viewer'), ($4, $5, 'owner')`,
    [contaId, operadorId, observadorId, outraContaId, vizinhoId],
  )
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

/** A marca da primeira ligação só se escreve com o parâmetro de `call-finalize`. */
async function definirPortao(bandeira: boolean, primeiraLigacao: string | null) {
  await banco.comoServico()
  await banco.sql.exec(`
    begin;
    select set_config('app.primeira_chamada_de_teste', 'on', true);
    update public.accounts
       set first_test_call_ok_at = ${primeiraLigacao ? `'${primeiraLigacao}'` : 'null'},
           feature_flags = jsonb_set(feature_flags, '{real_dialing}', '${bandeira}'::jsonb)
     where id = '${contaId}';
    commit;
  `)
}

async function estado(conta = contaId): Promise<Estado[]> {
  const { rows } = await banco.sql.query<Estado>(
    'select real_dialing, first_test_call_ok_at, falta from public.estado_do_portao($1)',
    [conta],
  )
  return rows
}

async function guardaDeixaPassarLeadReal(): Promise<boolean> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ allowed: boolean; reason: string }>(
    `select allowed, reason
       from public.guard_dial(
         p_account_id => $1::uuid,
         p_phone_e164 => $2::text,
         p_instante => $3::timestamptz
       )`,
    [contaId, LEAD_REAL, QUARTA_14H],
  )
  // A tentativa entra no livro-caixa; limpar mantém os casos independentes.
  await banco.sql.query('delete from public.call_attempts where account_id = $1', [contaId])
  expect(rows[0]!.reason).toMatch(/^(placed|real_dialing_gate)$/)
  return rows[0]!.allowed
}

describe('a lista do que falta acompanha o passo 2 da guarda', () => {
  const casos = [
    ['sem bandeira e sem ligação de teste', false, null, ['real_dialing', 'first_test_call']],
    ['com bandeira e sem ligação de teste', true, null, ['first_test_call']],
    ['sem bandeira e com ligação de teste', false, LIGACAO, ['real_dialing']],
    ['com as duas', true, LIGACAO, []],
  ] as const

  test.each(casos)('%s', async (_nome, bandeira, primeiraLigacao, falta) => {
    await definirPortao(bandeira, primeiraLigacao)

    await banco.comoUsuario(operadorId)
    const [linha] = await estado()
    expect(linha?.falta).toEqual(falta)
    expect(linha?.real_dialing).toBe(bandeira)
    expect(linha?.first_test_call_ok_at?.toISOString() ?? null).toBe(
      primeiraLigacao ? new Date(primeiraLigacao).toISOString() : null,
    )

    expect(await guardaDeixaPassarLeadReal()).toBe(falta.length === 0)
  })

  test('bandeira ausente do jsonb conta como desligada, como na guarda', async () => {
    await definirPortao(true, LIGACAO)
    await banco.comoServico()
    await banco.sql.query(
      `update public.accounts set feature_flags = feature_flags - 'real_dialing' where id = $1`,
      [contaId],
    )

    await banco.comoUsuario(operadorId)
    expect((await estado())[0]?.falta).toEqual(['real_dialing'])
    expect(await guardaDeixaPassarLeadReal()).toBe(false)
  })
})

describe('quem lê', () => {
  test('o observador da conta lê o mesmo estado', async () => {
    await definirPortao(true, null)

    await banco.comoUsuario(observadorId)
    expect((await estado())[0]?.falta).toEqual(['first_test_call'])
  })

  test('quem é de outra conta recebe zero linha, e lê a própria', async () => {
    await banco.comoUsuario(vizinhoId)
    expect(await estado(contaId)).toEqual([])
    expect(await estado(outraContaId)).toHaveLength(1)
  })

  test('a sessão anônima não executa', async () => {
    await banco.comoAnonimo()
    await expect(estado()).rejects.toThrow(/permission denied/)
  })

  test('execute só para authenticated e service_role', async () => {
    await banco.comoServico()
    const { rows } = await banco.sql.query<{ grantee: string }>(
      `select grantee from information_schema.routine_privileges
        where routine_schema = 'public' and routine_name = 'estado_do_portao'
          and privilege_type = 'EXECUTE' and grantee <> 'postgres'
        order by grantee`,
    )
    expect(rows.map((r) => r.grantee)).toEqual(['authenticated', 'service_role'])
  })
})
