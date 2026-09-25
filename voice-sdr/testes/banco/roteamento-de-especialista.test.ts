// O modo de roteamento da conta: por área, por rodízio ou para um especialista
// fixo. O que se prova aqui:
//
// 1. A linha nasce com a conta, e nasce em `area`. Configuração que a primeira
//    leitura tivesse que criar transformaria a tela em escrita.
// 2. O check cobra os dois lados do modo fixo: `fixed` sem especialista é
//    recusado, e especialista apontado em `area` ou `round_robin` também. Modo
//    que não aponta para ninguém é configuração que não é lida.
// 3. Apagar o especialista que a conta roteia é recusado; apagar a conta
//    inteira, que cascateia para as duas tabelas no mesmo comando, passa.
// 4. Classe Configuração: membro lê, administrador escreve, operador não. Sem
//    política de insert nem de delete, porque a linha nasce e morre com a conta.
// 5. A troca de modo entra na trilha de auditoria.
// 6. A conta vizinha recebe zero linha, e a sessão anônima também.
//
// Referência: migração 20260921200000_roteamento_de_especialista.sql,
// docs/PRD-implementacao.md seções 3.1 e 3.9, docs/PRD.md RF-506,
// docs/revisao-tecnica.md L-16 e T-22.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

/** SQLSTATE de violação de check. */
const CHECK_VIOLADO = '23514'
/** SQLSTATE de violação de chave estrangeira. */
const CHAVE_ESTRANGEIRA = '23503'

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

/** O roteamento da conta, como o banco o guarda. */
async function lerRoteamento(conta: Conta): Promise<{
  routing_mode: string
  fixed_specialist_id: string | null
} | null> {
  const { rows } = await banco.sql.query<{
    routing_mode: string
    fixed_specialist_id: string | null
  }>(
    `select routing_mode, fixed_specialist_id
       from public.account_settings
      where account_id = $1`,
    [conta.id],
  )
  return rows[0] ?? null
}

/** Devolve o modo ao padrão, para o teste seguinte não herdar o anterior. */
async function restaurarPadrao(conta: Conta): Promise<void> {
  await banco.sql.query(
    `update public.account_settings
        set routing_mode = 'area', fixed_specialist_id = null
      where account_id = $1`,
    [conta.id],
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

// Papel deixado por um teste anterior não contamina o próximo.
beforeEach(async () => {
  await banco.comoServico()
  await restaurarPadrao(contaA)
  await restaurarPadrao(contaB)
})

// A linha e o padrão ---------------------------------------------------------

test('a conta nasce com uma linha de configuração em modo area', async () => {
  for (const conta of [contaA, contaB]) {
    const roteamento = await lerRoteamento(conta)
    expect(roteamento?.routing_mode).toBe('area')
    expect(roteamento?.fixed_specialist_id).toBeNull()
  }
})

test('há exatamente uma linha por conta', async () => {
  const { rows } = await banco.sql.query<{ total: number }>(
    `select count(*)::int as total
       from public.account_settings
      where account_id = $1`,
    [contaA.id],
  )
  expect(rows[0]?.total).toBe(1)
})

test('a conta não aceita uma segunda linha de configuração', async () => {
  const erro = await erroDe(
    banco.sql.query(
      'insert into public.account_settings (account_id) values ($1)',
      [contaA.id],
    ),
  )
  expect(erro.code).toBe('23505')
})

// O check do modo ------------------------------------------------------------

test('modo desconhecido é recusado', async () => {
  const erro = await erroDe(
    banco.sql.query(
      `update public.account_settings set routing_mode = 'sorteio' where account_id = $1`,
      [contaA.id],
    ),
  )
  expect(erro.code).toBe(CHECK_VIOLADO)
})

test('fixed sem especialista é recusado', async () => {
  const erro = await erroDe(
    banco.sql.query(
      `update public.account_settings set routing_mode = 'fixed' where account_id = $1`,
      [contaA.id],
    ),
  )
  expect(erro.code).toBe(CHECK_VIOLADO)
  expect(erro.message).toMatch(/account_settings_destino_do_modo/)
})

test('area com especialista apontado é recusado', async () => {
  const erro = await erroDe(
    banco.sql.query(
      `update public.account_settings
          set routing_mode = 'area', fixed_specialist_id = $2
        where account_id = $1`,
      [contaA.id, contaA.especialistaId],
    ),
  )
  expect(erro.code).toBe(CHECK_VIOLADO)
})

test('round_robin com especialista apontado é recusado', async () => {
  const erro = await erroDe(
    banco.sql.query(
      `update public.account_settings
          set routing_mode = 'round_robin', fixed_specialist_id = $2
        where account_id = $1`,
      [contaA.id, contaA.especialistaId],
    ),
  )
  expect(erro.code).toBe(CHECK_VIOLADO)
})

test('fixed com especialista é aceito, e round_robin sem ele também', async () => {
  await banco.sql.query(
    `update public.account_settings
        set routing_mode = 'fixed', fixed_specialist_id = $2
      where account_id = $1`,
    [contaA.id, contaA.especialistaId],
  )
  expect(await lerRoteamento(contaA)).toEqual({
    routing_mode: 'fixed',
    fixed_specialist_id: contaA.especialistaId,
  })

  await banco.sql.query(
    `update public.account_settings
        set routing_mode = 'round_robin', fixed_specialist_id = null
      where account_id = $1`,
    [contaA.id],
  )
  expect(await lerRoteamento(contaA)).toEqual({
    routing_mode: 'round_robin',
    fixed_specialist_id: null,
  })
})

// O destino do modo fixo (20260930170000) ------------------------------------

test('fixed para especialista inativo é recusado com o código da razão', async () => {
  await banco.sql.query('update public.specialists set active = false where id = $1', [
    contaA.outroEspecialistaId,
  ])
  try {
    const erro = await erroDe(
      banco.sql.query(
        `update public.account_settings
            set routing_mode = 'fixed', fixed_specialist_id = $2
          where account_id = $1`,
        [contaA.id, contaA.outroEspecialistaId],
      ),
    )
    expect(erro.code).toBe(CHECK_VIOLADO)
    expect(erro.message).toMatch(/^especialista_inativo\b/)
    expect(await lerRoteamento(contaA)).toEqual({ routing_mode: 'area', fixed_specialist_id: null })
  } finally {
    await banco.sql.query('update public.specialists set active = true where id = $1', [
      contaA.outroEspecialistaId,
    ])
  }
})

test('fixed para especialista de outra conta é recusado', async () => {
  const erro = await erroDe(
    banco.sql.query(
      `update public.account_settings
          set routing_mode = 'fixed', fixed_specialist_id = $2
        where account_id = $1`,
      [contaA.id, contaB.especialistaId],
    ),
  )
  expect(erro.code).toBe(CHECK_VIOLADO)
  expect(erro.message).toMatch(/^especialista_de_outra_conta\b/)
})

test('o destino desativado depois não trava a troca de modo', async () => {
  await banco.sql.query(
    `update public.account_settings
        set routing_mode = 'fixed', fixed_specialist_id = $2
      where account_id = $1`,
    [contaA.id, contaA.especialistaId],
  )
  await banco.sql.query('update public.specialists set active = false where id = $1', [
    contaA.especialistaId,
  ])
  try {
    // Reescrever o mesmo destino não muda nada e passa.
    await banco.sql.query(
      `update public.account_settings
          set routing_mode = 'fixed', fixed_specialist_id = $2
        where account_id = $1`,
      [contaA.id, contaA.especialistaId],
    )
    await banco.sql.query(
      `update public.account_settings
          set routing_mode = 'round_robin', fixed_specialist_id = null
        where account_id = $1`,
      [contaA.id],
    )
    expect(await lerRoteamento(contaA)).toEqual({
      routing_mode: 'round_robin',
      fixed_specialist_id: null,
    })
  } finally {
    await banco.sql.query('update public.specialists set active = true where id = $1', [
      contaA.especialistaId,
    ])
  }
})

// A chave estrangeira --------------------------------------------------------

test('apagar o especialista fixo é recusado', async () => {
  await banco.sql.query(
    `update public.account_settings
        set routing_mode = 'fixed', fixed_specialist_id = $2
      where account_id = $1`,
    [contaA.id, contaA.especialistaId],
  )

  const erro = await erroDe(
    banco.sql.query('delete from public.specialists where id = $1', [
      contaA.especialistaId,
    ]),
  )
  expect(erro.code).toBe(CHAVE_ESTRANGEIRA)

  // A conta continua roteando para quem sempre roteou.
  expect((await lerRoteamento(contaA))?.fixed_specialist_id).toBe(
    contaA.especialistaId,
  )
})

test('apagar um especialista que ninguém aponta segue permitido', async () => {
  const descartavel = await criarEspecialista(
    contaA.id,
    'Carla de passagem',
    'aurora.test',
  )
  const { rows } = await banco.sql.query<{ id: string }>(
    'delete from public.specialists where id = $1 returning id',
    [descartavel],
  )
  expect(rows).toHaveLength(1)
})

test('apagar a conta inteira não trava na configuração de roteamento', async () => {
  const conta = await criarConta('Metalúrgica Efêmera', 'efemera.test')
  await banco.sql.query(
    `update public.account_settings
        set routing_mode = 'fixed', fixed_specialist_id = $2
      where account_id = $1`,
    [conta.id, conta.especialistaId],
  )

  const { rows } = await banco.sql.query<{ id: string }>(
    'delete from public.accounts where id = $1 returning id',
    [conta.id],
  )
  expect(rows).toHaveLength(1)

  const { rows: restantes } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.account_settings where account_id = $1',
    [conta.id],
  )
  expect(restantes[0]?.total).toBe(0)
})

// Isolamento -----------------------------------------------------------------

test('membro lê a configuração da própria conta e nenhuma da vizinha', async () => {
  await banco.comoUsuario(contaA.operadorId)
  const { rows } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.account_settings',
  )
  expect(rows.map((linha) => linha.account_id)).toEqual([contaA.id])
})

test('sessão anônima não lê configuração nenhuma', async () => {
  await banco.comoAnonimo()
  const { rows } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.account_settings',
  )
  expect(rows[0]?.total).toBe(0)
})

test('o operador não troca o modo de roteamento', async () => {
  await banco.comoUsuario(contaA.operadorId)
  const { rows } = await banco.sql.query<{ id: string }>(
    `update public.account_settings
        set routing_mode = 'round_robin'
      where account_id = $1
      returning id`,
    [contaA.id],
  )
  expect(rows).toHaveLength(0)

  await banco.comoServico()
  expect((await lerRoteamento(contaA))?.routing_mode).toBe('area')
})

test('o admin troca o modo de roteamento da própria conta', async () => {
  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query<{ routing_mode: string }>(
    `update public.account_settings
        set routing_mode = 'round_robin'
      where account_id = $1
      returning routing_mode`,
    [contaA.id],
  )
  expect(rows[0]?.routing_mode).toBe('round_robin')
})

test('o admin da conta A não alcança a configuração da conta B', async () => {
  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query<{ id: string }>(
    `update public.account_settings
        set routing_mode = 'round_robin'
      where account_id = $1
      returning id`,
    [contaB.id],
  )
  expect(rows).toHaveLength(0)

  await banco.comoServico()
  expect((await lerRoteamento(contaB))?.routing_mode).toBe('area')
})

test('a tabela não tem política de insert nem de delete', async () => {
  const { rows } = await banco.sql.query<{ cmd: string }>(
    `select cmd
       from pg_policies
      where schemaname = 'public'
        and tablename = 'account_settings'
      order by cmd`,
  )
  expect(rows.map((linha) => linha.cmd)).toEqual(['SELECT', 'UPDATE'])
})

// Trilha ---------------------------------------------------------------------

test('trocar o modo de roteamento entra na trilha de auditoria', async () => {
  await banco.comoUsuario(contaA.adminId)
  await banco.sql.query(
    `update public.account_settings
        set routing_mode = 'fixed', fixed_specialist_id = $2
      where account_id = $1`,
    [contaA.id, contaA.especialistaId],
  )

  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    action: string
    actor: string
    actor_id: string | null
    payload: { campos: string[] }
  }>(
    `select action, actor, actor_id, payload
       from public.audit_log
      where account_id = $1
        and target_type = 'account_settings'
      order by created_at desc
      limit 1`,
    [contaA.id],
  )
  expect(rows[0]?.action).toBe('update')
  expect(rows[0]?.actor).toBe('user')
  expect(rows[0]?.actor_id).toBe(contaA.adminId)
  expect(rows[0]?.payload.campos).toEqual(['fixed_specialist_id', 'routing_mode'])
})

test('o gatilho de updated_at descarta a data que o cliente mandar', async () => {
  await banco.sql.query(
    `update public.account_settings
        set routing_mode = 'round_robin',
            updated_at = '2020-01-01T00:00:00Z'
      where account_id = $1`,
    [contaA.id],
  )
  const { rows } = await banco.sql.query<{ recente: boolean }>(
    `select updated_at >= created_at as recente
       from public.account_settings
      where account_id = $1`,
    [contaA.id],
  )
  expect(rows[0]?.recente).toBe(true)
})
