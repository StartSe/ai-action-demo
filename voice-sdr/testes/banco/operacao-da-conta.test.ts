// O freio de emergência, o portão de lead real e o modo de credencial. O que
// se prova aqui:
//
// 1. Os padrões: conta nova nasce operando, sem chamada de teste, com a chave
//    própria e com a bandeira do portão de lead real escrita. E conta que já
//    existia quando a migração chegou também. Desde a US-118 a bandeira termina
//    ligada (migração do portão da F3), e o portão fica fechado pela ligação de
//    teste ausente.
// 2. Os três campos do freio andam juntos. Pausa sem autor, sem motivo ou com
//    motivo em branco é recusada; despausar é apagar os três.
// 3. `credentials_mode` e `first_test_call_ok_at` não têm caminho direto: o
//    gatilho devolve o valor antigo ao admin e ao próprio dono, sem erro e sem
//    efeito. A troca do modo só acontece pelo RPC, e o RPC exige owner.
// 4. A trilha registra a pausa com o autor da sessão, e registra a troca de
//    modo com o motivo escrito. O gatilho de auditoria de `accounts` continua
//    com um argumento só — a prova é pelo catálogo, porque acrescentar uma
//    coluna à lista de ignoradas é a forma silenciosa de tirar um ato da
//    trilha.
//
// Referência: migração 20260922000000_operacao_da_conta.sql,
// docs/PRD-implementacao.md seções 3.1, 3.9 e 8, docs/PRD.md RF-011 e RF-912,
// docs/revisao-tecnica.md L-03, L-04, T-12 e O-02.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

/** A migração desta história, pelo nome de arquivo. */
const MIGRACAO = '20260922000000_operacao_da_conta.sql'

/** SQLSTATE de violação de check. */
const CHECK_VIOLADO = '23514'
/** SQLSTATE que o RPC levanta quem não é dono: insufficient_privilege. */
const SEM_PRIVILEGIO = '42501'
/** SQLSTATE de argumento fora do domínio: invalid_parameter_value. */
const PARAMETRO_INVALIDO = '22023'

interface Conta {
  readonly id: string
  readonly donoId: string
  readonly adminId: string
  readonly operadorId: string
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

  const donoId = await banco.criarUsuario(`dono@${dominio}`, 'Dono')
  const adminId = await banco.criarUsuario(`admin@${dominio}`, 'Admin')
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')

  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'admin'), ($1, $4, 'operator')`,
    [id, donoId, adminId, operadorId],
  )

  return { id, donoId, adminId, operadorId }
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

interface Operacao {
  dialing_paused_at: Date | null
  dialing_paused_by: string | null
  dialing_paused_reason: string | null
  first_test_call_ok_at: Date | null
  credentials_mode: string
  feature_flags: Record<string, unknown>
}

async function lerOperacao(contaId: string): Promise<Operacao | undefined> {
  const { rows } = await banco.sql.query<Operacao>(
    `select dialing_paused_at, dialing_paused_by, dialing_paused_reason,
            first_test_call_ok_at, credentials_mode, feature_flags
       from public.accounts
      where id = $1`,
    [contaId],
  )
  return rows[0]
}

/**
 * Levanta o parâmetro de sessão do escritor legítimo, roda a manobra e o
 * derruba. O terceiro argumento de `set_config` é `false` de propósito: `true`
 * vale só até o fim da transação, e cada consulta do teste é uma transação
 * sua — a trava pareceria inquebrável e o teste provaria o contrário do que diz.
 */
async function comoServidor(
  parametro: 'app.modo_de_credencial' | 'app.primeira_chamada_de_teste',
  manobra: () => Promise<void>,
): Promise<void> {
  await banco.sql.query('select set_config($1, $2, false)', [parametro, 'on'])
  try {
    await manobra()
  } finally {
    await banco.sql.query('select set_config($1, $2, false)', [parametro, ''])
  }
}

/** Devolve a conta ao estado de nascença, para o teste seguinte não herdar. */
async function restaurarOperacao(conta: Conta): Promise<void> {
  await banco.sql.query(
    `update public.accounts
        set dialing_paused_at = default,
            dialing_paused_by = default,
            dialing_paused_reason = default,
            feature_flags = default
      where id = $1`,
    [conta.id],
  )
  // As duas colunas protegidas não voltam por update comum: o gatilho as
  // devolveria ao valor antigo. Quem as restaura é o mesmo parâmetro de sessão
  // que o escritor legítimo levanta — e precisar dele aqui já é meia prova de
  // que ele é a única porta.
  await comoServidor('app.modo_de_credencial', async () => {
    await comoServidor('app.primeira_chamada_de_teste', async () => {
      await banco.sql.query(
        `update public.accounts
            set credentials_mode = default, first_test_call_ok_at = default
          where id = $1`,
        [conta.id],
      )
    })
  })
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
  await banco.comoServico()
  await restaurarOperacao(contaA)
  await restaurarOperacao(contaB)
})

// Os padrões ------------------------------------------------------------------

test('conta nova nasce operando, sem chamada de teste e com a chave própria', async () => {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Padaria Recém-nascida') returning id`,
  )
  const operacao = await lerOperacao(rows[0]!.id)

  expect(operacao?.dialing_paused_at).toBeNull()
  expect(operacao?.dialing_paused_by).toBeNull()
  expect(operacao?.dialing_paused_reason).toBeNull()
  expect(operacao?.first_test_call_ok_at).toBeNull()
  expect(operacao?.credentials_mode).toBe('account')
})

test('a bandeira do portão nasce escrita na conta nova, e o portão fechado', async () => {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Serralheria Nova') returning id`,
  )
  const operacao = await lerOperacao(rows[0]!.id)
  // Escrita, não ausente: chave ausente obriga todo chamador a acertar o
  // coalesce, e basta um esquecer para o portão virar null. Esta migração a
  // escreveu falsa; desde a US-118 a migração do portão da F3
  // (20260925000000) a escreve verdadeira, e o portão da conta nova continua
  // fechado pela metade que é dela: a ligação de teste que ainda não houve.
  // Quem prova as quatro combinações é testes/banco/portao-de-lead-real.test.ts.
  expect(operacao?.feature_flags).toEqual({ real_dialing: true })
  expect(operacao?.first_test_call_ok_at).toBeNull()
})

test('a conta que já existia quando a migração chegou termina com a bandeira escrita', async () => {
  // As contas do cenário nasceram DEPOIS da migração, então elas recebem o
  // padrão da coluna e não provam nada sobre a retroação. Quem prova é uma
  // conta criada com a migração ainda por aplicar — que é a situação de toda
  // conta em produção no dia em que ela subir.
  //
  // A retomada aplica também a migração do portão da F3, que liga a bandeira
  // em toda conta: o valor final é o dela, e o `false` que esta migração
  // escreveu nas antigas deixou de ser observável no fim da cadeia. A
  // retroação da F3 se prova em portao-de-lead-real.test.ts, parando antes
  // daquela migração; aqui fica a chave escrita e a ligação de teste nula.
  const anterior = await criarBancoDeTeste({ pararAntesDe: MIGRACAO })
  try {
    await anterior.sql.query(
      `insert into public.accounts (name) values ('Metalúrgica Antiga')`,
    )
    const { rows: antes } = await anterior.sql.query<{ feature_flags: unknown }>(
      `select feature_flags from public.accounts`,
    )
    expect(antes[0]?.feature_flags).toEqual({})

    expect(await anterior.retomarMigracoes()).toContain(MIGRACAO)

    const { rows: depois } = await anterior.sql.query<{
      feature_flags: { real_dialing?: unknown }
      first_test_call_ok_at: Date | null
    }>(`select feature_flags, first_test_call_ok_at from public.accounts`)
    expect(depois[0]?.feature_flags.real_dialing).toBe(true)
    expect(depois[0]?.first_test_call_ok_at).toBeNull()
  } finally {
    await anterior.encerrar()
  }
})

test('nenhuma migração abre o portão: sem ligação de teste, nenhuma conta disca para lead real', async () => {
  const { rows } = await banco.sql.query<{ abertas: number }>(
    `select count(*)::int as abertas from public.accounts
      where coalesce((feature_flags ->> 'real_dialing')::boolean, false)
        and first_test_call_ok_at is not null`,
  )
  expect(rows[0]?.abertas).toBe(0)
})

// O check dos três campos do freio --------------------------------------------

const FREIO_INCOMPLETO: { caso: string; sql: string }[] = [
  {
    caso: 'instante sem autor e sem motivo',
    sql: 'dialing_paused_at = now()',
  },
  {
    caso: 'instante e autor, sem motivo',
    sql: 'dialing_paused_at = now(), dialing_paused_by = $2',
  },
  {
    caso: 'instante e motivo, sem autor',
    sql: `dialing_paused_at = now(), dialing_paused_reason = 'teste'`,
  },
  {
    caso: 'motivo em branco, que é o mesmo nada com outro nome',
    sql: `dialing_paused_at = now(), dialing_paused_by = $2, dialing_paused_reason = '   '`,
  },
  {
    caso: 'autor e motivo sem instante',
    sql: `dialing_paused_by = $2, dialing_paused_reason = 'teste'`,
  },
]

test.each(FREIO_INCOMPLETO)('freio com $caso é recusado', async ({ sql }) => {
  // O segundo parâmetro só viaja quando o comando o cita: mandar um parâmetro
  // que o SQL não usa é erro de protocolo, e ele chegaria como 08P01 no lugar
  // da violação de check que o teste quer medir.
  const parametros = sql.includes('$2')
    ? [contaA.id, contaA.adminId]
    : [contaA.id]
  const erro = await erroDe(
    banco.sql.query(`update public.accounts set ${sql} where id = $1`, parametros),
  )
  expect(erro.code).toBe(CHECK_VIOLADO)
  expect(erro.message).toMatch(/accounts_freio_completo/)
})

test('os três juntos passam, e despausar é apagar os três', async () => {
  await banco.sql.query(
    `update public.accounts
        set dialing_paused_at = now(),
            dialing_paused_by = $2,
            dialing_paused_reason = 'crédito do provedor acabou'
      where id = $1`,
    [contaA.id, contaA.adminId],
  )
  const pausada = await lerOperacao(contaA.id)
  expect(pausada?.dialing_paused_at).not.toBeNull()
  expect(pausada?.dialing_paused_by).toBe(contaA.adminId)
  expect(pausada?.dialing_paused_reason).toBe('crédito do provedor acabou')

  await banco.sql.query(
    `update public.accounts
        set dialing_paused_at = null,
            dialing_paused_by = null,
            dialing_paused_reason = null
      where id = $1`,
    [contaA.id],
  )
  const operando = await lerOperacao(contaA.id)
  expect(operando?.dialing_paused_at).toBeNull()
  expect(operando?.dialing_paused_by).toBeNull()
  expect(operando?.dialing_paused_reason).toBeNull()
})

test('apagar só o instante e deixar o autor é recusado: meio despausado não existe', async () => {
  await banco.sql.query(
    `update public.accounts
        set dialing_paused_at = now(),
            dialing_paused_by = $2,
            dialing_paused_reason = 'manutenção'
      where id = $1`,
    [contaA.id, contaA.adminId],
  )

  const erro = await erroDe(
    banco.sql.query(
      'update public.accounts set dialing_paused_at = null where id = $1',
      [contaA.id],
    ),
  )
  expect(erro.code).toBe(CHECK_VIOLADO)
  expect(erro.message).toMatch(/accounts_freio_completo/)
})

// O modo de credencial: o check e o gatilho -----------------------------------

test('modo fora de account e platform é recusado pelo check', async () => {
  await comoServidor('app.modo_de_credencial', async () => {
    const erro = await erroDe(
      banco.sql.query(
        `update public.accounts set credentials_mode = 'plataforma' where id = $1`,
        [contaA.id],
      ),
    )
    expect(erro.code).toBe(CHECK_VIOLADO)
    expect(erro.message).toMatch(/accounts_modo_de_credencial/)
  })
})

test('o administrador não muda o modo pelo caminho direto: o gatilho devolve o antigo', async () => {
  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query<{ credentials_mode: string }>(
    `update public.accounts set credentials_mode = 'platform' where id = $1
     returning credentials_mode`,
    [contaA.id],
  )
  // A linha é alcançada — accounts é classe Configuração e admin escreve — mas
  // a coluna volta ao que era. A recusa é silenciosa de propósito: o gatilho é
  // rede, e a porta é o RPC.
  expect(rows[0]?.credentials_mode).toBe('account')

  await banco.comoServico()
  expect((await lerOperacao(contaA.id))?.credentials_mode).toBe('account')
})

test('nem o dono muda o modo pelo caminho direto: a porta é o RPC', async () => {
  await banco.comoUsuario(contaA.donoId)
  await banco.sql.query(
    `update public.accounts set credentials_mode = 'platform' where id = $1`,
    [contaA.id],
  )

  await banco.comoServico()
  expect((await lerOperacao(contaA.id))?.credentials_mode).toBe('account')
})

test('o dono troca o modo pelo RPC, e o valor fica', async () => {
  await banco.comoUsuario(contaA.donoId)
  const { rows } = await banco.sql.query<{ definir_modo_de_credencial: string }>(
    'select public.definir_modo_de_credencial($1, $2)',
    [contaA.id, 'platform'],
  )
  expect(rows[0]?.definir_modo_de_credencial).toBe('platform')

  await banco.comoServico()
  expect((await lerOperacao(contaA.id))?.credentials_mode).toBe('platform')
})

test('o RPC derruba o parâmetro antes de devolver: a trava não fica aberta depois', async () => {
  await banco.comoUsuario(contaA.donoId)
  await banco.sql.query('select public.definir_modo_de_credencial($1, $2)', [
    contaA.id,
    'platform',
  ])
  // Na mesma sessão, logo depois da chamada legítima, o caminho direto continua
  // sem efeito. Sem o set_config final, o resto da transação escreveria a
  // coluna à vontade.
  await banco.sql.query(
    `update public.accounts set credentials_mode = 'account' where id = $1`,
    [contaA.id],
  )

  await banco.comoServico()
  expect((await lerOperacao(contaA.id))?.credentials_mode).toBe('platform')
})

test('o administrador é recusado pelo RPC, com a razão escrita', async () => {
  await banco.comoUsuario(contaA.adminId)
  const erro = await erroDe(
    banco.sql.query('select public.definir_modo_de_credencial($1, $2)', [
      contaA.id,
      'platform',
    ]),
  )
  expect(erro.code).toBe(SEM_PRIVILEGIO)
  expect(erro.message).toMatch(/dono/)
})

test('o dono da conta A é recusado na conta B', async () => {
  await banco.comoUsuario(contaA.donoId)
  const erro = await erroDe(
    banco.sql.query('select public.definir_modo_de_credencial($1, $2)', [
      contaB.id,
      'platform',
    ]),
  )
  expect(erro.code).toBe(SEM_PRIVILEGIO)
})

test('modo desconhecido chega ao dono como erro de argumento, não como violação de check', async () => {
  await banco.comoUsuario(contaA.donoId)
  const erro = await erroDe(
    banco.sql.query('select public.definir_modo_de_credencial($1, $2)', [
      contaA.id,
      'plataforma',
    ]),
  )
  expect(erro.code).toBe(PARAMETRO_INVALIDO)
  expect(erro.message).toMatch(/account ou platform/)
  expect(erro.message).toMatch(/"plataforma"/)
})

test('o RPC não é executável por sessão anônima', async () => {
  await banco.comoAnonimo()
  const erro = await erroDe(
    banco.sql.query('select public.definir_modo_de_credencial($1, $2)', [
      contaA.id,
      'platform',
    ]),
  )
  expect(erro.message).toMatch(/permission denied/i)
})

// O portão de teste: medição do servidor --------------------------------------

test('o administrador não preenche first_test_call_ok_at: o gatilho devolve o nulo', async () => {
  await banco.comoUsuario(contaA.adminId)
  await banco.sql.query(
    'update public.accounts set first_test_call_ok_at = now() where id = $1',
    [contaA.id],
  )

  await banco.comoServico()
  expect((await lerOperacao(contaA.id))?.first_test_call_ok_at).toBeNull()
})

test('nem o dono preenche first_test_call_ok_at: é medição, não decisão', async () => {
  await banco.comoUsuario(contaA.donoId)
  await banco.sql.query(
    'update public.accounts set first_test_call_ok_at = now() where id = $1',
    [contaA.id],
  )

  await banco.comoServico()
  expect((await lerOperacao(contaA.id))?.first_test_call_ok_at).toBeNull()
})

test('com o parâmetro do servidor de pé, a medição entra', async () => {
  await comoServidor('app.primeira_chamada_de_teste', async () => {
    await banco.sql.query(
      'update public.accounts set first_test_call_ok_at = now() where id = $1',
      [contaA.id],
    )
  })

  expect((await lerOperacao(contaA.id))?.first_test_call_ok_at).not.toBeNull()
})

test('o parâmetro de um não abre a porta do outro', async () => {
  await comoServidor('app.modo_de_credencial', async () => {
    await banco.sql.query(
      `update public.accounts
          set credentials_mode = 'platform', first_test_call_ok_at = now()
        where id = $1`,
      [contaA.id],
    )
  })

  const operacao = await lerOperacao(contaA.id)
  expect(operacao?.credentials_mode).toBe('platform')
  expect(operacao?.first_test_call_ok_at).toBeNull()
})

// A trilha ---------------------------------------------------------------------

test('a pausa entra na trilha com o autor da sessão', async () => {
  await banco.comoUsuario(contaA.adminId)
  await banco.sql.query(
    `update public.accounts
        set dialing_paused_at = now(),
            dialing_paused_by = $2,
            dialing_paused_reason = 'número errado na base'
      where id = $1`,
    [contaA.id, contaA.adminId],
  )

  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    actor: string
    actor_id: string | null
    payload: { campos: string[]; depois: Record<string, unknown> }
  }>(
    `select actor, actor_id, payload from public.audit_log
      where account_id = $1 and target_type = 'accounts'
      order by created_at desc limit 1`,
    [contaA.id],
  )
  expect(rows[0]?.actor).toBe('user')
  expect(rows[0]?.actor_id).toBe(contaA.adminId)
  expect(rows[0]?.payload.campos).toEqual([
    'dialing_paused_at',
    'dialing_paused_by',
    'dialing_paused_reason',
  ])
  expect(rows[0]?.payload.depois.dialing_paused_reason).toBe('número errado na base')
})

test('a troca de modo entra na trilha com o motivo escrito pelo RPC', async () => {
  await banco.comoUsuario(contaA.donoId)
  await banco.sql.query('select public.definir_modo_de_credencial($1, $2)', [
    contaA.id,
    'platform',
  ])

  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    actor_id: string | null
    reason: string | null
    payload: { campos: string[]; antes: Record<string, unknown> }
  }>(
    `select actor_id, reason, payload from public.audit_log
      where account_id = $1 and target_type = 'accounts'
      order by created_at desc limit 1`,
    [contaA.id],
  )
  expect(rows[0]?.actor_id).toBe(contaA.donoId)
  expect(rows[0]?.reason).toBe('a conta passou a usar a chave da plataforma')
  expect(rows[0]?.payload.campos).toEqual(['credentials_mode'])
  // O valor vai na trilha em claro. `credentials_mode` casa com `credential` na
  // expressão de `redigir_auditoria`, e sem a exceção nominal a linha diria
  // "[redigido] virou [redigido]" — auditoria que não explica nada.
  expect(rows[0]?.payload.antes.credentials_mode).toBe('account')
})

test('a exceção da redação é nominal: intake_key_hash continua redigido', async () => {
  await banco.sql.query(
    `update public.accounts set intake_key_hash = $2 where id = $1`,
    [contaA.id, 'b'.repeat(64)],
  )

  const { rows } = await banco.sql.query<{
    payload: { depois: Record<string, unknown> }
  }>(
    `select payload from public.audit_log
      where account_id = $1 and target_type = 'accounts'
      order by created_at desc limit 1`,
    [contaA.id],
  )
  expect(rows[0]?.payload.depois.intake_key_hash).toBe('[redigido]')
})

test('a medição do portão também entra na trilha', async () => {
  await comoServidor('app.primeira_chamada_de_teste', async () => {
    await banco.sql.query(
      'update public.accounts set first_test_call_ok_at = now() where id = $1',
      [contaA.id],
    )
  })

  const { rows } = await banco.sql.query<{
    actor: string
    payload: { campos: string[] }
  }>(
    `select actor, payload from public.audit_log
      where account_id = $1 and target_type = 'accounts'
      order by created_at desc limit 1`,
    [contaA.id],
  )
  // Sem sessão, o autor é `system`: a medição é do servidor, e é assim que ela
  // se distingue de um ato de gente na mesma tabela.
  expect(rows[0]?.actor).toBe('system')
  expect(rows[0]?.payload.campos).toEqual(['first_test_call_ok_at'])
})

test('o gatilho de auditoria de accounts continua com um argumento só', async () => {
  // Coluna que entra na lista de ignoradas sai da trilha em silêncio. As três
  // colunas desta migração são exatamente as que alguém vai querer explicar
  // depois, e é por isso que a lista é cobrada pelo catálogo e não pela prosa.
  const { rows } = await banco.sql.query<{ argumentos: string[] }>(
    `select string_to_array(
              encode(t.tgargs, 'escape'), '\\000'
            ) as argumentos
       from pg_trigger as t
       join pg_class as c on c.oid = t.tgrelid
      where c.relname = 'accounts' and t.tgname = 'accounts_auditoria'`,
  )
  // O Postgres termina cada argumento com um nulo, então o split deixa uma
  // sobra vazia no fim.
  expect(rows[0]?.argumentos.filter((a) => a !== '')).toEqual(['id'])
})
