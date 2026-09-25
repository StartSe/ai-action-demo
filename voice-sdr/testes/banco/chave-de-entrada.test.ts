// Chave do endereço público: a promessa é "a chave não está guardada em lugar
// nenhum, e só quem administra a troca". Ela se parte em quatro perguntas, e
// cada uma tem teste aqui:
//
// 1. A coluna aceita outra coisa além de um sha-256 em hexadecimal?
// 2. Duas contas conseguem ficar com a mesma chave?
// 3. Quem não administra a conta consegue girar a chave dela?
// 4. A rotação deixa o hash visível em algum lugar — no retorno do RPC ou na
//    trilha de auditoria?
//
// Referência: docs/PRD.md RF-107, docs/PRD-implementacao.md seções 3.9 e 4.5,
// docs/revisao-tecnica.md L-02.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  gerarChaveDeEntrada,
  hashDaChaveDeEntrada,
} from '../../supabase/functions/_shared/chave-de-entrada.ts'
import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

/** Hash bem formado, para exercitar unique e auditoria sem gerar chave. */
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

interface Conta {
  readonly id: string
  readonly donoId: string
  readonly adminId: string
  readonly operatorId: string
  readonly viewerId: string
}

interface Registro {
  action: string
  reason: string | null
  payload: {
    campos?: string[]
    antes?: Record<string, unknown>
    depois?: Record<string, unknown>
  }
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await montarConta('A')
  contaB = await montarConta('B')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query(
    `update public.accounts
        set intake_key_hash = null,
            intake_key_rotated_at = null,
            intake_key_rotated_by = null`,
  )
  await banco.sql.query('delete from public.audit_log')
})

async function montarConta(rotulo: string): Promise<Conta> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [`Conta ${rotulo}`],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`Não foi possível criar a conta ${rotulo}`)

  const sufixo = rotulo.toLowerCase()
  const donoId = await banco.criarUsuario(`dono.${sufixo}@entrada.test`, `Dono ${rotulo}`)
  const adminId = await banco.criarUsuario(`admin.${sufixo}@entrada.test`, `Admin ${rotulo}`)
  const operatorId = await banco.criarUsuario(
    `operator.${sufixo}@entrada.test`,
    `Operator ${rotulo}`,
  )
  const viewerId = await banco.criarUsuario(
    `viewer.${sufixo}@entrada.test`,
    `Viewer ${rotulo}`,
  )
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'admin'), ($1, $4, 'operator'), ($1, $5, 'viewer')`,
    [id, donoId, adminId, operatorId, viewerId],
  )

  return { id, donoId, adminId, operatorId, viewerId }
}

async function girar(usuarioId: string, contaId: string, hash: string): Promise<string> {
  await banco.comoUsuario(usuarioId)
  const { rows } = await banco.sql.query<{ instante: string }>(
    'select public.girar_chave_de_entrada($1, $2) as instante',
    [contaId, hash],
  )
  const instante = rows[0]?.instante
  if (!instante) throw new Error('girar_chave_de_entrada não devolveu instante')
  return instante
}

async function lerConta(contaId: string) {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    intake_key_hash: string | null
    intake_key_rotated_at: string | null
    intake_key_rotated_by: string | null
  }>(
    `select intake_key_hash, intake_key_rotated_at, intake_key_rotated_by
       from public.accounts where id = $1`,
    [contaId],
  )
  const linha = rows[0]
  if (!linha) throw new Error('conta não encontrada')
  return linha
}

// A coluna -------------------------------------------------------------------

test('a coluna recusa o que não seja sha-256 em hexadecimal minúsculo', async () => {
  await banco.comoServico()
  // A chave em claro é o caso que importa: é ela que não pode acabar aqui por
  // um caminho que esqueceu de calcular o hash.
  const recusados = [
    gerarChaveDeEntrada(),
    'a'.repeat(63),
    'a'.repeat(65),
    'A'.repeat(64),
    'z'.repeat(64),
    '',
  ]

  for (const valor of recusados) {
    await expect(
      banco.sql.query('update public.accounts set intake_key_hash = $1 where id = $2', [
        valor,
        contaA.id,
      ]),
      `a coluna aceitou ${JSON.stringify(valor)}`,
    ).rejects.toThrow(/check constraint|violates/i)
  }
})

test('conta que ainda não girou chave fica com as três colunas nulas', async () => {
  const linha = await lerConta(contaA.id)

  expect(linha.intake_key_hash).toBeNull()
  expect(linha.intake_key_rotated_at).toBeNull()
  expect(linha.intake_key_rotated_by).toBeNull()
})

test('duas contas não ficam com a mesma chave', async () => {
  await banco.comoServico()
  await banco.sql.query('update public.accounts set intake_key_hash = $1 where id = $2', [
    HASH_A,
    contaA.id,
  ])

  await expect(
    banco.sql.query('update public.accounts set intake_key_hash = $1 where id = $2', [
      HASH_A,
      contaB.id,
    ]),
    'duas contas com a mesma chave: o endereço público resolveria para a conta errada',
  ).rejects.toThrow(/unique|duplicate/i)
})

test('mais de uma conta pode estar sem chave ao mesmo tempo', async () => {
  // O índice único é parcial justamente por isto: enquanto ninguém girou,
  // todas as contas têm null, e null não é colisão de ninguém.
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ sem_chave: string }>(
    'select count(*)::text as sem_chave from public.accounts where intake_key_hash is null',
  )

  expect(Number(rows[0]?.sem_chave)).toBeGreaterThanOrEqual(2)
})

test('a chave resolve a conta numa consulta por igualdade', async () => {
  const chave = gerarChaveDeEntrada()
  await girar(contaA.adminId, contaA.id, await hashDaChaveDeEntrada(chave))

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string }>(
    'select id from public.accounts where intake_key_hash = $1',
    [await hashDaChaveDeEntrada(chave)],
  )

  expect(rows.map((linha) => linha.id)).toEqual([contaA.id])
})

// O par módulo/coluna --------------------------------------------------------

test('o hash que o módulo portável calcula é o que a coluna guarda', async () => {
  // Este é o teste que fecha o par. Se o módulo e o banco se desencontrarem,
  // toda chave já entregue a um cliente deixa de resolver a conta, e o endereço
  // público recusa lead legítimo sem ninguém ter mexido em nada.
  const chave = gerarChaveDeEntrada()
  const hash = await hashDaChaveDeEntrada(chave)

  await girar(contaA.adminId, contaA.id, hash)
  const linha = await lerConta(contaA.id)

  expect(linha.intake_key_hash).toBe(hash)
  expect(linha.intake_key_hash).not.toBe(chave)
  expect(linha.intake_key_hash).toMatch(/^[0-9a-f]{64}$/)
})

// Papel ----------------------------------------------------------------------

test('admin gira a chave e recebe só o instante', async () => {
  const antes = await lerConta(contaA.id)
  expect(antes.intake_key_rotated_at).toBeNull()

  const instante = await girar(contaA.adminId, contaA.id, HASH_A)
  const depois = await lerConta(contaA.id)

  expect(depois.intake_key_hash).toBe(HASH_A)
  expect(depois.intake_key_rotated_by).toBe(contaA.adminId)
  expect(new Date(instante).getTime()).toBe(
    new Date(depois.intake_key_rotated_at ?? 0).getTime(),
  )
})

test('owner também gira, porque a hierarquia de papel o contém', async () => {
  await girar(contaA.donoId, contaA.id, HASH_B)

  expect((await lerConta(contaA.id)).intake_key_hash).toBe(HASH_B)
})

test('operator e viewer recebem recusa', async () => {
  for (const usuarioId of [contaA.operatorId, contaA.viewerId]) {
    await banco.comoUsuario(usuarioId)
    await expect(
      banco.sql.query('select public.girar_chave_de_entrada($1, $2)', [contaA.id, HASH_A]),
      'quem não administra a conta girou a chave dela',
    ).rejects.toThrow(/administra/i)
  }

  expect((await lerConta(contaA.id)).intake_key_hash).toBeNull()
})

test('o admin da conta A não gira a chave da conta B', async () => {
  // Este teste mede a conta, não o papel: baixar a exigência de `has_role(...,
  // 'admin')` para `is_member(...)` o deixa passar, porque quem não é membro
  // continua de fora. Quem mede o papel é o teste de operator e viewer, acima.
  await banco.comoUsuario(contaA.adminId)
  await expect(
    banco.sql.query('select public.girar_chave_de_entrada($1, $2)', [contaB.id, HASH_A]),
  ).rejects.toThrow(/administra/i)

  expect((await lerConta(contaB.id)).intake_key_hash).toBeNull()
})

test('sessão anônima não gira chave nenhuma', async () => {
  await banco.comoAnonimo()
  await expect(
    banco.sql.query('select public.girar_chave_de_entrada($1, $2)', [contaA.id, HASH_A]),
  ).rejects.toThrow(/permission denied/i)
})

test('o RPC recusa hash malformado como erro de argumento', async () => {
  await banco.comoUsuario(contaA.adminId)
  await expect(
    banco.sql.query('select public.girar_chave_de_entrada($1, $2)', [
      contaA.id,
      gerarChaveDeEntrada(),
    ]),
    'a chave em claro entrou pelo RPC',
  ).rejects.toThrow(/hexadecimal/i)
})

// Grant ----------------------------------------------------------------------

test('girar_chave_de_entrada é de cliente autenticado e não do papel public', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ papel: string }>(
    `select grantee as papel
       from information_schema.routine_privileges
      where specific_schema = 'public'
        and routine_name = 'girar_chave_de_entrada'
        and privilege_type = 'EXECUTE'`,
  )
  const papeis = rows.map((linha) => linha.papel)

  expect(papeis).toContain('authenticated')
  expect(
    papeis,
    'sem o revoke, public alcança qualquer papel presente ou futuro',
  ).not.toContain('PUBLIC')
  expect(papeis).not.toContain('anon')
})

test('a assinatura do RPC não devolve hash nem chave', async () => {
  // Garantia estrutural, não disciplina de quem escreve a consulta: um
  // `update ... returning` pelo PostgREST devolveria a linha inteira, com o
  // hash dentro. Aqui não há o que esquecer de tirar.
  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    retorno: string
    argumentos: string[] | null
  }>(
    `select pg_catalog.format_type(p.prorettype, null) as retorno,
            p.proargnames as argumentos
       from pg_proc as p
       join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'girar_chave_de_entrada'`,
  )

  expect(rows[0]?.retorno).toBe('timestamp with time zone')
  expect(
    (rows[0]?.argumentos ?? []).filter((nome) => /hash|chave|key|secret/i.test(nome)),
  ).toEqual(['p_hash'])
})

test('a função roda com search_path fechado', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ config: string[] | null }>(
    `select p.proconfig as config
       from pg_proc as p
       join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'girar_chave_de_entrada'`,
  )

  expect(rows[0]?.config ?? []).toContain('search_path=""')
})

// Auditoria ------------------------------------------------------------------

test('a rotação entra na trilha com o hash redigido', async () => {
  await girar(contaA.adminId, contaA.id, HASH_A)

  await banco.comoServico()
  const { rows } = await banco.sql.query<Registro>(
    `select action, reason, payload
       from public.audit_log
      where account_id = $1 and target_type = 'accounts'`,
    [contaA.id],
  )

  expect(rows).toHaveLength(1)
  const registro = rows[0]
  if (!registro) throw new Error('a rotação não entrou na trilha')

  expect(registro.action).toBe('update')
  expect(registro.reason).toMatch(/endereço público/i)
  expect(registro.payload.campos).toContain('intake_key_hash')
  expect(registro.payload.depois?.intake_key_hash).toBe('[redigido]')
  expect(registro.payload.antes?.intake_key_hash).toBe('[redigido]')
  expect(
    JSON.stringify(registro.payload),
    'o hash da chave apareceu em claro na trilha de auditoria',
  ).not.toContain(HASH_A)
})

test('a segunda rotação não deixa o hash anterior na trilha', async () => {
  // O `antes` do update é o hash que acabou de ser aposentado, e aposentado não
  // é o mesmo que inofensivo: enquanto a integração antiga não for atualizada,
  // ele ainda abre a porta.
  await girar(contaA.adminId, contaA.id, HASH_A)
  await girar(contaA.donoId, contaA.id, HASH_B)

  await banco.comoServico()
  const { rows } = await banco.sql.query<Registro>(
    `select action, reason, payload from public.audit_log where account_id = $1`,
    [contaA.id],
  )

  expect(rows).toHaveLength(2)
  const serializado = JSON.stringify(rows)
  expect(serializado).not.toContain(HASH_A)
  expect(serializado).not.toContain(HASH_B)
})

test('quem girou fica registrado como autor da mudança', async () => {
  await girar(contaA.adminId, contaA.id, HASH_A)

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ actor: string; actor_id: string | null }>(
    `select actor, actor_id from public.audit_log where account_id = $1`,
    [contaA.id],
  )

  expect(rows[0]?.actor).toBe('user')
  expect(rows[0]?.actor_id).toBe(contaA.adminId)
})
