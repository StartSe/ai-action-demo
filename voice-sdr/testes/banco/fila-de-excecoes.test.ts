// A fila de exceções mínima da F3: pedido de humano, pedido de bloqueio e
// falha repetida, cada um com lugar definido.
//
// O que este arquivo prova:
//
// 1. Os três gêneros da fatia entram, e gênero fora da lista reprova pelo
//    check `exception_items_genero_conhecido`. Severidade e status fora do
//    domínio também reprovam.
// 2. Resolver exige autor, hora e texto juntos; aberto não carrega nenhum.
// 3. Lead e chamada se prendem à mesma conta: item da conta B não se pendura
//    em lead da conta A.
// 4. Classe Operação: cada conta vê as próprias linhas e zero da vizinha,
//    operator escreve e resolve, viewer não escreve.
// 5. `meeting_id` nasce sem chave enquanto `meetings` não existe (F5).
// 6. Falha repetida (`abrir_item_de_falha_repetida`): três tentativas que
//    saíram ao mesmo número sem ninguém atender abrem um item, e só um. Recusa
//    da guarda não conta, ensaio não conta, e depois de resolvido só contam as
//    tentativas novas. As tentativas se semeiam como serviço, e o item se
//    confere como usuário.
// 7. `resolver_excecao` grava autor e hora de quem chamou, com a trilha na
//    mesma transação, e devolve código: `ja_resolvido` sem sobrescrever o
//    primeiro, `sem_permissao` para o viewer, `inexistente` para item de outra
//    conta. Só `authenticated` a executa; `criar_excecao`, só `service_role`.
//
// Referência: migrações 20260924150000_fila_de_excecoes.sql,
// 20260924200000_falha_repetida.sql e 20260924220000_resolucao_da_excecao.sql,
// docs/PRD-implementacao.md seções 3.8 e 3.9, docs/revisao-tecnica.md L-24.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

const GENEROS = ['human_requested', 'dnc_requested', 'repeated_failure'] as const

interface Conta {
  readonly id: string
  readonly operadorId: string
  readonly observadorId: string
  readonly leadId: string
  readonly telefone: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

async function criarConta(nome: string, dominio: string, telefone: string): Promise<Conta> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')
  const observadorId = await banco.criarUsuario(`viewer@${dominio}`, 'Viewer')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'operator'), ($1, $3, 'viewer')`,
    [id, operadorId, observadorId],
  )
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Lead da fila', $2, 'cenario') returning id`,
    [id, telefone],
  )
  return { id, operadorId, observadorId, leadId: leads[0]!.id, telefone }
}

async function abrirItem(
  conta: Conta,
  campos: { kind?: string; severity?: string; status?: string; leadId?: string } = {},
): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.exception_items (account_id, kind, severity, status, lead_id, context)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [
      conta.id,
      campos.kind ?? 'human_requested',
      campos.severity ?? 'media',
      campos.status ?? 'aberto',
      campos.leadId ?? conta.leadId,
      JSON.stringify({ recorte: 'Quero falar com uma pessoa.' }),
    ],
  )
  return rows[0]!.id
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test', '+5511988880001')
  contaB = await criarConta('Cooperativa Sul', 'sul.test', '+5511988880002')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.exception_items')
})

// O domínio -------------------------------------------------------------------------

test.each(GENEROS)('o gênero %s entra', async (genero) => {
  await abrirItem(contaA, { kind: genero })
})

test('gênero desconhecido reprova pelo check', async () => {
  await expect(abrirItem(contaA, { kind: 'negative_sentiment' })).rejects.toThrow(
    /exception_items_genero_conhecido/,
  )
})

test('severidade fora de baixa, media e alta reprova', async () => {
  await expect(abrirItem(contaA, { severity: 'critica' })).rejects.toThrow(
    /exception_items_severidade_conhecida/,
  )
})

test('status fora de aberto e resolvido reprova', async () => {
  await expect(abrirItem(contaA, { status: 'em_andamento' })).rejects.toThrow(
    /exception_items_status_conhecido/,
  )
})

test('o comentário do gênero diz que os outros quatro são da F4', async () => {
  const { rows } = await banco.sql.query<{ comentario: string }>(
    `select col_description('public.exception_items'::regclass, a.attnum) as comentario
       from pg_attribute a
      where a.attrelid = 'public.exception_items'::regclass and a.attname = 'kind'`,
  )
  expect(rows[0]?.comentario).toMatch(/F4/)
})

// A resolução ------------------------------------------------------------------------

test('resolvido sem autor, hora e texto reprova', async () => {
  const id = await abrirItem(contaA)
  await expect(
    banco.sql.query(
      `update public.exception_items set status = 'resolvido', resolved_at = now()
        where id = $1`,
      [id],
    ),
  ).rejects.toThrow(/exception_items_resolucao_completa/)
})

test('o operator resolve com autor e hora, e a trilha registra', async () => {
  const id = await abrirItem(contaA)

  await banco.comoUsuario(contaA.operadorId)
  const { rows } = await banco.sql.query(
    `update public.exception_items
        set status = 'resolvido', resolved_by = $2, resolved_at = now(),
            resolution = 'Liguei de volta e agendei.'
      where id = $1 returning id`,
    [id, contaA.operadorId],
  )
  expect(rows).toHaveLength(1)

  await banco.comoServico()
  const { rows: trilha } = await banco.sql.query<{ actor_id: string }>(
    `select actor_id from public.audit_log
      where target_type = 'exception_items' and target_id = $1`,
    [id],
  )
  expect(trilha.map((linha) => linha.actor_id)).toEqual([contaA.operadorId])
})

// A conta do lead ----------------------------------------------------------------------

test('item da conta B não se pendura em lead da conta A', async () => {
  await expect(abrirItem(contaB, { leadId: contaA.leadId })).rejects.toThrow(
    /exception_items_lead_da_conta/,
  )
})

test('meeting_id nasce sem chave enquanto meetings não existe', async () => {
  const { rows } = await banco.sql.query<{ reuniao: string | null; chave: string | null }>(
    `select to_regclass('public.meetings')::text as reuniao,
            (select conname::text from pg_constraint
              where conrelid = 'public.exception_items'::regclass
                and conname = 'exception_items_reuniao') as chave`,
  )
  expect(rows[0]?.chave === null).toBe(rows[0]?.reuniao === null)
})

// Isolamento ------------------------------------------------------------------------

test('cada conta vê as próprias linhas e zero da vizinha', async () => {
  const deA = await abrirItem(contaA)
  const deB = await abrirItem(contaB)

  for (const [conta, propria] of [
    [contaA, deA],
    [contaB, deB],
  ] as const) {
    await banco.comoUsuario(conta.observadorId)
    const { rows } = await banco.sql.query<{ id: string }>(
      'select id from public.exception_items',
    )
    expect(rows.map((linha) => linha.id)).toEqual([propria])
  }
})

test('o operator inclui à mão; o viewer não inclui nem resolve', async () => {
  await banco.comoUsuario(contaA.operadorId)
  const id = await abrirItem(contaA)

  await banco.comoUsuario(contaA.observadorId)
  await expect(abrirItem(contaA)).rejects.toThrow(/row-level security/)
  const { rows } = await banco.sql.query(
    `update public.exception_items
        set status = 'resolvido', resolved_by = $2, resolved_at = now(),
            resolution = 'Tentei resolver.'
      where id = $1 returning id`,
    [id, contaA.observadorId],
  )
  expect(rows).toEqual([])
})

test('o operator não inclui item na conta vizinha', async () => {
  await banco.comoUsuario(contaA.operadorId)
  await expect(abrirItem(contaB)).rejects.toThrow(/row-level security/)
})

test('nem o operator apaga o item pelo cliente', async () => {
  const id = await abrirItem(contaA)

  await banco.comoUsuario(contaA.operadorId)
  const { rows } = await banco.sql.query(
    'delete from public.exception_items where id = $1 returning id',
    [id],
  )
  expect(rows).toEqual([])
})

// Falha repetida -------------------------------------------------------------------

describe('falha repetida (L-24, RF-909, RF-915)', () => {
  const LIMIAR = 3
  const INICIO_MS = Date.parse('2026-09-20T12:00:00.000Z')
  let sequencia = 0

  interface Tentativa {
    /** `placed` ou um motivo de recusa da guarda. */
    readonly outcome?: string
    /** O `answered_by` da chamada que nasceu, quando saiu. */
    readonly atendidaPor?: 'human' | 'machine' | 'unknown' | null
    readonly telefone?: string
  }

  /** Semeia, como serviço, a tentativa e a chamada que nasceu dela. Devolve a chamada. */
  async function tentar(conta: Conta, tentativa: Tentativa = {}): Promise<string | null> {
    await banco.comoServico()
    sequencia += 1
    const instante = new Date(INICIO_MS + sequencia * 60_000).toISOString()
    const outcome = tentativa.outcome ?? 'placed'
    const telefone = tentativa.telefone ?? conta.telefone
    let chamadaId: string | null = null
    if (outcome === 'placed') {
      const { rows } = await banco.sql.query<{ id: string }>(
        `insert into public.calls
           (account_id, lead_id, purpose, direction, status, to_number, answered_by, idempotency_key, started_at)
         values ($1, $2, 'discovery', 'outbound', 'ended', $3, $4, $5, $6)
         returning id`,
        [conta.id, conta.leadId, telefone, tentativa.atendidaPor ?? null, `falha-repetida-${sequencia}`, instante],
      )
      chamadaId = rows[0]!.id
    }
    await banco.sql.query(
      `insert into public.call_attempts
         (account_id, lead_id, phone_e164, outcome, actor, source, call_id, attempted_at)
       values ($1, $2, $3, $4, 'system', 'cron-dial', $5, $6)`,
      [conta.id, conta.leadId, telefone, outcome, chamadaId, instante],
    )
    return chamadaId
  }

  async function conferir(conta: Conta, chamadaId: string): Promise<{ situacao: string; item_id: string | null }> {
    await banco.comoServico()
    const { rows } = await banco.sql.query<{ situacao: string; item_id: string | null }>(
      'select situacao, item_id from public.abrir_item_de_falha_repetida($1, $2, $3)',
      [conta.id, chamadaId, LIMIAR],
    )
    return rows[0]!
  }

  /** Os itens de falha repetida, lidos pelo operador da conta. */
  async function itensVistos(conta: Conta) {
    await banco.comoUsuario(conta.operadorId)
    const { rows } = await banco.sql.query<{
      id: string
      status: string
      call_id: string | null
      lead_id: string | null
      context: { phone_e164: string; limiar: number; tentativas: string[] }
    }>(
      `select id, status, call_id, lead_id, context from public.exception_items
        where kind = 'repeated_failure' order by created_at, id`,
    )
    return rows
  }

  /** Resolve meio minuto depois da última tentativa semeada, no relógio do cenário. */
  async function resolver(conta: Conta, itemId: string) {
    await banco.comoUsuario(conta.operadorId)
    await banco.sql.query(
      `update public.exception_items
          set status = 'resolvido', resolved_by = $2, resolved_at = $3,
              resolution = 'Conferi o número com o cliente.'
        where id = $1`,
      [itemId, conta.operadorId, new Date(INICIO_MS + sequencia * 60_000 + 30_000).toISOString()],
    )
  }

  /** Três tentativas que saíram e ninguém atendeu. Devolve a última chamada. */
  async function tresFalhas(conta: Conta): Promise<string> {
    await tentar(conta, { atendidaPor: 'machine' })
    await tentar(conta, { atendidaPor: 'unknown' })
    return (await tentar(conta, { atendidaPor: null }))!
  }

  beforeEach(async () => {
    await banco.comoServico()
    await banco.sql.query('delete from public.call_attempts')
    await banco.sql.query('delete from public.calls')
  })

  test('três tentativas sem atendimento abrem o item, e o operador o vê', async () => {
    const tentativas = [
      await tentar(contaA, { atendidaPor: 'machine' }),
      await tentar(contaA, { atendidaPor: 'unknown' }),
      await tentar(contaA, { atendidaPor: null }),
    ]
    const ultima = tentativas[2]!

    expect((await conferir(contaA, ultima)).situacao).toBe('criado')

    const itens = await itensVistos(contaA)
    expect(itens).toHaveLength(1)
    expect(itens[0]).toMatchObject({ status: 'aberto', call_id: ultima, lead_id: contaA.leadId })
    expect(itens[0]!.context).toMatchObject({ phone_e164: contaA.telefone, limiar: LIMIAR, tentativas })
  })

  test('duas falhas ficam abaixo do limiar', async () => {
    await tentar(contaA, { atendidaPor: 'machine' })
    const ultima = (await tentar(contaA, { atendidaPor: null }))!
    expect((await conferir(contaA, ultima)).situacao).toBe('abaixo_do_limiar')
    expect(await itensVistos(contaA)).toEqual([])
  })

  test('uma atendida por gente entre as três últimas não abre item', async () => {
    await tentar(contaA, { atendidaPor: 'machine' })
    await tentar(contaA, { atendidaPor: 'human' })
    const ultima = (await tentar(contaA, { atendidaPor: null }))!
    expect((await conferir(contaA, ultima)).situacao).toBe('abaixo_do_limiar')
  })

  test('três recusas da guarda não criam item', async () => {
    await tentar(contaA, { outcome: 'outside_window' })
    await tentar(contaA, { outcome: 'min_interval' })
    await tentar(contaA, { outcome: 'daily_per_number' })
    const ultima = (await tentar(contaA, { atendidaPor: null }))!
    expect((await conferir(contaA, ultima)).situacao).toBe('abaixo_do_limiar')
    expect(await itensVistos(contaA)).toEqual([])
  })

  test('recusa no meio não conta nem interrompe a sequência das que saíram', async () => {
    await tentar(contaA, { atendidaPor: 'machine' })
    await tentar(contaA, { outcome: 'outside_window' })
    await tentar(contaA, { atendidaPor: 'machine' })
    await tentar(contaA, { outcome: 'dnc_active' })
    const ultima = (await tentar(contaA, { atendidaPor: null }))!
    expect((await conferir(contaA, ultima)).situacao).toBe('criado')
    expect((await itensVistos(contaA))[0]!.context.tentativas).toHaveLength(LIMIAR)
  })

  test('havendo item aberto para o número, não nasce um segundo', async () => {
    const ultima = await tresFalhas(contaA)
    const primeiro = await conferir(contaA, ultima)
    expect(await conferir(contaA, ultima)).toEqual({ situacao: 'ja_aberto', item_id: primeiro.item_id })

    const quarta = (await tentar(contaA, { atendidaPor: null }))!
    expect((await conferir(contaA, quarta)).situacao).toBe('ja_aberto')
    expect(await itensVistos(contaA)).toHaveLength(1)
  })

  test('o único parcial recusa o segundo item aberto do mesmo número', async () => {
    const ultima = await tresFalhas(contaA)
    await conferir(contaA, ultima)
    await banco.comoServico()
    await expect(
      banco.sql.query(
        `select public.criar_excecao($1, 'repeated_failure', 'media', null, null, $2::jsonb)`,
        [contaA.id, JSON.stringify({ phone_e164: contaA.telefone })],
      ),
    ).rejects.toThrow(/exception_items_falha_repetida_aberta/)
  })

  test('resolvido o item, só três falhas novas criam outro', async () => {
    const ultima = await tresFalhas(contaA)
    const primeiro = await conferir(contaA, ultima)
    await resolver(contaA, primeiro.item_id!)

    // A finalização seguinte com uma falha nova não reabre com as duas velhas.
    const quarta = (await tentar(contaA, { atendidaPor: null }))!
    expect((await conferir(contaA, quarta)).situacao).toBe('abaixo_do_limiar')
    await tentar(contaA, { atendidaPor: 'machine' })
    const sexta = (await tentar(contaA, { atendidaPor: null }))!
    const segundo = await conferir(contaA, sexta)
    expect(segundo.situacao).toBe('criado')

    const itens = await itensVistos(contaA)
    expect(itens.map((item) => item.status)).toEqual(['resolvido', 'aberto'])
    expect(itens[1]!.id).toBe(segundo.item_id)
  })

  test('o ensaio não conta, porque não grava tentativa', async () => {
    await tresFalhas(contaA)
    await banco.comoServico()
    const { rows } = await banco.sql.query<{ id: string }>(
      `insert into public.calls (account_id, purpose, direction, status, idempotency_key)
       values ($1, 'discovery', 'rehearsal', 'ended', 'ensaio-falha-repetida')
       returning id`,
      [contaA.id],
    )
    expect(await conferir(contaA, rows[0]!.id)).toEqual({ situacao: 'sem_tentativa', item_id: null })
    expect(await itensVistos(contaA)).toEqual([])
  })

  test('tentativa de outra conta ao mesmo número não soma', async () => {
    // Intercaladas: sem o recorte por conta, as três últimas ao número seriam
    // duas de A e uma de B.
    await tentar(contaA, { atendidaPor: null })
    await tentar(contaB, { atendidaPor: null, telefone: contaA.telefone })
    const deA = (await tentar(contaA, { atendidaPor: null }))!
    expect((await conferir(contaA, deA)).situacao).toBe('abaixo_do_limiar')

    await tentar(contaB, { atendidaPor: null, telefone: contaA.telefone })
    const deB = (await tentar(contaB, { atendidaPor: null, telefone: contaA.telefone }))!
    expect((await conferir(contaB, deB)).situacao).toBe('criado')
    expect(await itensVistos(contaA)).toEqual([])
    expect(await itensVistos(contaB)).toHaveLength(1)
  })

  test('outro número da conta não soma', async () => {
    await tentar(contaA, { atendidaPor: null, telefone: '+5511977770001' })
    await tentar(contaA, { atendidaPor: null })
    const ultima = (await tentar(contaA, { atendidaPor: null }))!
    expect((await conferir(contaA, ultima)).situacao).toBe('abaixo_do_limiar')
  })

  test('só a chave de serviço executa o RPC', async () => {
    const ultima = await tresFalhas(contaA)
    await banco.comoUsuario(contaA.operadorId)
    await expect(
      banco.sql.query('select * from public.abrir_item_de_falha_repetida($1, $2, 3)', [contaA.id, ultima]),
    ).rejects.toThrow(/permission denied/)

    await banco.comoServico()
    const { rows } = await banco.sql.query<{ papel: string }>(
      `select grantee as papel from information_schema.routine_privileges
        where routine_schema = 'public' and routine_name = 'abrir_item_de_falha_repetida'
        order by grantee`,
    )
    expect(rows.map((linha) => linha.papel).filter((papel) => papel !== 'postgres')).toEqual(['service_role'])
  })

  test('limiar que não é inteiro positivo levanta', async () => {
    const ultima = await tresFalhas(contaA)
    await banco.comoServico()
    await expect(
      banco.sql.query('select * from public.abrir_item_de_falha_repetida($1, $2, 0)', [contaA.id, ultima]),
    ).rejects.toThrow(/limiar_invalido/)
  })
})

// O RPC de resolução ----------------------------------------------------------------

describe('resolver_excecao (RF-909, seção 3.9)', () => {
  async function resolverPeloRpc(usuarioId: string, itemId: string, resolucao = 'Liguei de volta.') {
    await banco.comoUsuario(usuarioId)
    const { rows } = await banco.sql.query<{ codigo: string }>(
      'select public.resolver_excecao($1, $2) as codigo',
      [itemId, resolucao],
    )
    return rows[0]!.codigo
  }

  async function lerItem(itemId: string) {
    await banco.comoServico()
    const { rows } = await banco.sql.query<{
      status: string
      resolved_by: string | null
      resolved_at: Date | null
      resolution: string | null
    }>('select status, resolved_by, resolved_at, resolution from public.exception_items where id = $1', [itemId])
    return rows[0]!
  }

  async function privilegiados(rotina: string): Promise<string[]> {
    await banco.comoServico()
    const { rows } = await banco.sql.query<{ papel: string }>(
      `select grantee as papel from information_schema.routine_privileges
        where routine_schema = 'public' and routine_name = $1
        order by grantee`,
      [rotina],
    )
    return rows.map((linha) => linha.papel).filter((papel) => papel !== 'postgres')
  }

  test('o operator resolve: autor é auth.uid(), hora é agora, e a trilha registra', async () => {
    const id = await abrirItem(contaA)

    expect(await resolverPeloRpc(contaA.operadorId, id, '  Agendei com o cliente.  ')).toBe('resolvido')

    const item = await lerItem(id)
    expect(item).toMatchObject({
      status: 'resolvido',
      resolved_by: contaA.operadorId,
      resolution: 'Agendei com o cliente.',
    })
    expect(item.resolved_at).toBeInstanceOf(Date)

    const { rows: trilha } = await banco.sql.query<{ actor_id: string }>(
      `select actor_id from public.audit_log
        where target_type = 'exception_items' and target_id = $1`,
      [id],
    )
    expect(trilha.map((linha) => linha.actor_id)).toEqual([contaA.operadorId])
  })

  test('item já resolvido devolve ja_resolvido e não sobrescreve autor nem hora', async () => {
    const id = await abrirItem(contaA)
    const segundoOperador = await banco.criarUsuario('segundo@aurora.test', 'Segundo')
    await banco.sql.query(
      `insert into public.account_members (account_id, user_id, role) values ($1, $2, 'admin')`,
      [contaA.id, segundoOperador],
    )

    expect(await resolverPeloRpc(contaA.operadorId, id, 'Primeira resolução.')).toBe('resolvido')
    const primeira = await lerItem(id)

    expect(await resolverPeloRpc(segundoOperador, id, 'Segunda resolução.')).toBe('ja_resolvido')
    expect(await lerItem(id)).toEqual(primeira)
  })

  test('o viewer recebe sem_permissao e o item fica aberto', async () => {
    const id = await abrirItem(contaA)
    expect(await resolverPeloRpc(contaA.observadorId, id)).toBe('sem_permissao')
    expect((await lerItem(id)).status).toBe('aberto')
  })

  test('item de outra conta devolve inexistente, igual a item que não existe', async () => {
    const deB = await abrirItem(contaB)
    // Nem o viewer vizinho descobre pelo sem_permissao que o id existe.
    expect(await resolverPeloRpc(contaA.operadorId, deB)).toBe('inexistente')
    expect(await resolverPeloRpc(contaA.observadorId, deB)).toBe('inexistente')
    expect(await resolverPeloRpc(contaA.operadorId, '00000000-0000-4000-8000-000000000000')).toBe('inexistente')
    expect((await lerItem(deB)).status).toBe('aberto')
  })

  test('resolução em branco devolve resolucao_vazia', async () => {
    const id = await abrirItem(contaA)
    expect(await resolverPeloRpc(contaA.operadorId, id, '   ')).toBe('resolucao_vazia')
    expect((await lerItem(id)).status).toBe('aberto')
  })

  test('a chave de serviço não resolve: sem sessão não há autor', async () => {
    const id = await abrirItem(contaA)
    await banco.comoServico()
    await banco.sql.exec('set role service_role')
    await expect(
      banco.sql.query('select public.resolver_excecao($1, $2)', [id, 'Pela borda.']),
    ).rejects.toThrow(/permission denied/)
  })

  test('resolver_excecao executa só para authenticated; anon recebe permission denied', async () => {
    const id = await abrirItem(contaA)
    expect(await privilegiados('resolver_excecao')).toEqual(['authenticated'])

    await banco.comoAnonimo()
    await expect(
      banco.sql.query('select public.resolver_excecao($1, $2)', [id, 'Sem sessão.']),
    ).rejects.toThrow(/permission denied/)
  })

  test('criar_excecao executa só para service_role; o cliente não fabrica item', async () => {
    expect(await privilegiados('criar_excecao')).toEqual(['service_role'])

    await banco.comoServico()
    const { rows } = await banco.sql.query<{ id: string }>(
      `select public.criar_excecao($1, 'human_requested', 'alta', null, $2, '{}') as id`,
      [contaA.id, contaA.leadId],
    )
    expect(rows[0]!.id).toBeTruthy()

    for (const trocar of [() => banco.comoUsuario(contaA.operadorId), () => banco.comoAnonimo()]) {
      await trocar()
      await expect(
        banco.sql.query(`select public.criar_excecao($1, 'human_requested', 'alta', null, null, '{}')`, [contaA.id]),
      ).rejects.toThrow(/permission denied/)
    }
  })
})

// A fila completa da F4 (US-131, 20260929150000_fila_completa.sql) -------------

const GENEROS_DA_F4 = [
  'pedido_humano',
  'pedido_bloqueio',
  'sentimento_negativo',
  'falha_repetida',
  'reuniao_sem_especialista',
  'avaliacao_reprovada',
  'credito_baixo',
] as const

describe('a fila completa (RF-909, RNF-06)', () => {
  async function registrar(
    conta: Conta,
    chave: string,
    extras: { kind?: string; limiar?: Record<string, unknown> } = {},
  ): Promise<string> {
    const { rows } = await banco.sql.query<{ r: string }>(
      `select public.registrar_item_de_fila($1, $2, 'alta', $3, $4::jsonb, $5::jsonb, $6, null) as r`,
      [
        conta.id,
        extras.kind ?? 'sentimento_negativo',
        chave,
        JSON.stringify({ trecho: 'Não gostei nada disso.' }),
        JSON.stringify(extras.limiar ?? { sentiment_floor: -0.5 }),
        conta.leadId,
      ],
    )
    return rows[0]!.r
  }

  async function comoBorda(): Promise<void> {
    await banco.comoServico()
    await banco.sql.query('set role service_role')
  }

  async function resolver(usuario: string, item: string, texto = 'Liguei de volta.'): Promise<string> {
    await banco.comoUsuario(usuario)
    const { rows } = await banco.sql.query<{ r: string }>(
      'select public.resolver_item_de_fila($1, $2) as r',
      [item, texto],
    )
    return rows[0]!.r
  }

  async function itens(conta: Conta): Promise<{ id: string; status: string; threshold_snapshot: unknown }[]> {
    await banco.comoServico()
    const { rows } = await banco.sql.query<{ id: string; status: string; threshold_snapshot: unknown }>(
      `select id, status, threshold_snapshot from public.exception_items where account_id = $1 order by created_at`,
      [conta.id],
    )
    return rows
  }

  test.each(GENEROS_DA_F4)('o gênero %s entra', async (genero) => {
    await abrirItem(contaA, { kind: genero })
  })

  test('a mesma chave duas vezes cria um item só', async () => {
    await comoBorda()
    expect(await registrar(contaA, 'sentimento:chamada-1')).toBe('criado')
    await comoBorda()
    expect(await registrar(contaA, 'sentimento:chamada-1')).toBe('ja_aberto')
    const lista = await itens(contaA)
    expect(lista).toHaveLength(1)
    expect(lista[0]!.threshold_snapshot).toEqual({ sentiment_floor: -0.5 })
  })

  test('a mesma chave em contas diferentes são dois itens', async () => {
    await comoBorda()
    expect(await registrar(contaA, 'sentimento:x')).toBe('criado')
    await comoBorda()
    expect(await registrar(contaB, 'sentimento:x')).toBe('criado')
  })

  test('item resolvido libera a chave para um item novo', async () => {
    await comoBorda()
    await registrar(contaA, 'avaliacao:chamada-2', { kind: 'avaliacao_reprovada' })
    const [item] = await itens(contaA)
    expect(await resolver(contaA.operadorId, item!.id)).toBe('resolvido')
    await comoBorda()
    expect(await registrar(contaA, 'avaliacao:chamada-2', { kind: 'avaliacao_reprovada' })).toBe('criado')
    expect((await itens(contaA)).map((i) => i.status)).toEqual(['resolvido', 'aberto'])
  })

  test('resolver grava autor, hora e trilha, e a segunda vez é ja_resolvido', async () => {
    await comoBorda()
    await registrar(contaA, 'credito:voz:2026-09-24', { kind: 'credito_baixo' })
    const [item] = await itens(contaA)
    expect(await resolver(contaA.operadorId, item!.id, 'Recarreguei')).toBe('resolvido')
    expect(await resolver(contaA.operadorId, item!.id, 'De novo')).toBe('ja_resolvido')

    await banco.comoServico()
    const { rows } = await banco.sql.query<{ resolved_by: string; resolution: string; resolved_at: string | null }>(
      'select resolved_by, resolution, resolved_at from public.exception_items where id = $1',
      [item!.id],
    )
    expect(rows[0]).toMatchObject({ resolved_by: contaA.operadorId, resolution: 'Recarreguei' })
    expect(rows[0]!.resolved_at).not.toBeNull()
    const { rows: trilha } = await banco.sql.query<{ actor_id: string }>(
      `select actor_id from public.audit_log where target_id = $1 and target_type = 'exception_items'`,
      [item!.id],
    )
    expect(trilha.map((t) => t.actor_id)).toEqual([contaA.operadorId])
  })

  test('viewer não resolve, e item da outra conta é recusado', async () => {
    await comoBorda()
    await registrar(contaA, 'sentimento:chamada-3')
    const [item] = await itens(contaA)
    expect(await resolver(contaA.observadorId, item!.id)).toBe('sem_permissao')
    expect(await resolver(contaB.operadorId, item!.id)).toBe('item_de_outra_conta')
    expect(await resolver(contaA.operadorId, item!.id, '  ')).toBe('resolucao_vazia')
    expect((await itens(contaA))[0]!.status).toBe('aberto')
  })

  test('com sessão, registrar exige operator da conta', async () => {
    await banco.comoUsuario(contaA.observadorId)
    expect(await registrar(contaA, 'sentimento:manual')).toBe('sem_permissao')
    await banco.comoUsuario(contaB.operadorId)
    expect(await registrar(contaA, 'sentimento:manual')).toBe('sem_permissao')
    expect(await itens(contaA)).toHaveLength(0)
  })

  test('item sem chave informada ganha kind:id e não colide', async () => {
    const primeiro = await abrirItem(contaA)
    const segundo = await abrirItem(contaA)
    const { rows } = await banco.sql.query<{ deduplicacao_key: string }>(
      'select deduplicacao_key from public.exception_items where id = any($1) order by created_at',
      [[primeiro, segundo]],
    )
    expect(rows.map((r) => r.deduplicacao_key).toSorted()).toEqual(
      [`human_requested:${primeiro}`, `human_requested:${segundo}`].toSorted(),
    )
  })

  test('cada conta vê só a própria fila', async () => {
    await comoBorda()
    await registrar(contaA, 'sentimento:a')
    await comoBorda()
    await registrar(contaB, 'sentimento:b')
    await banco.comoUsuario(contaA.operadorId)
    const { rows } = await banco.sql.query<{ deduplicacao_key: string }>(
      'select deduplicacao_key from public.exception_items',
    )
    expect(rows.map((r) => r.deduplicacao_key)).toEqual(['sentimento:a'])
  })
})
