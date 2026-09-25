// Conformidade: a lista de bloqueio e o registro de consentimento (seção 3.6,
// T-02, RF-804, RF-422 e RF-810).
//
// O que este arquivo prova:
//
// 1. A forma do número é conferida pelo banco, com o mesmo check de
//    `leads.phone_e164`: o passo 3 da guarda compara os dois, e régua diferente
//    faria o bloqueio existir na tela e não na comparação.
// 2. O único é parcial em `removed_at is null`: o segundo bloqueio ativo é
//    barrado, e depois da remoção o mesmo número entra de novo, como linha
//    nova.
// 3. `source` fora das quatro origens é recusado, e `wrong_number` — que é o
//    que fecha RF-422 sem tabela nova — está entre elas.
// 4. Remover é `update`, e a remoção pela metade é recusada pelo check: os três
//    campos andam juntos.
// 5. Classe Operação: membro lê, operador escreve, viewer não.
// 6. Classe Servidor em `consent_records`: nenhum papel insere, nem o dono.
// 7. A conta vizinha recebe zero linha nas duas tabelas, e a sessão anônima
//    também.
// 8. Bloquear e desbloquear entram na trilha (RF-008); o consentimento não, e a
//    ausência é decisão escrita na migração.
//
// Referência: migração 20260922030000_bloqueios.sql,
// docs/PRD-implementacao.md seções 3.6, 3.9 e 6 (passo 3 da guarda),
// docs/revisao-tecnica.md T-02, docs/PRD.md RF-008, RF-422, RF-804 e RF-810.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

/** As quatro origens da seção 3.6. `wrong_number` é o que fecha RF-422. */
const ORIGENS = ['manual', 'import', 'lead_request', 'wrong_number'] as const

interface Conta {
  readonly id: string
  readonly donoId: string
  readonly adminId: string
  readonly operadorId: string
  readonly observadorId: string
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
  const observadorId = await banco.criarUsuario(`viewer@${dominio}`, 'Viewer')

  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'admin'),
            ($1, $4, 'operator'), ($1, $5, 'viewer')`,
    [id, donoId, adminId, operadorId, observadorId],
  )

  return { id, donoId, adminId, operadorId, observadorId }
}

/** Insert mínimo: só o que não tem padrão. O resto vem da coluna. */
async function semearBloqueio(
  conta: Conta,
  extras: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const campos: Record<string, unknown> = {
    account_id: conta.id,
    phone_e164: '+5511990000001',
    reason: 'pediu para não ser chamado',
    ...extras,
  }

  const colunas = Object.keys(campos)
  const valores = Object.values(campos)
  const marcadores = colunas.map((_, indice) => `$${indice + 1}`)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.dnc_entries (${colunas.join(', ')})
     values (${marcadores.join(', ')})
     returning id`,
    valores,
  )
  return rows[0]!.id
}

async function semearConsentimento(
  conta: Conta,
  extras: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const campos: Record<string, unknown> = {
    account_id: conta.id,
    kind: 'recording',
    granted: true,
    ...extras,
  }

  const colunas = Object.keys(campos)
  const valores = Object.values(campos)
  const marcadores = colunas.map((_, indice) => `$${indice + 1}`)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.consent_records (${colunas.join(', ')})
     values (${marcadores.join(', ')})
     returning id`,
    valores,
  )
  return rows[0]!.id
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test')
  contaB = await criarConta('Cooperativa Sul', 'sul.test')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

// O único parcial faz o resíduo do teste anterior derrubar o insert seguinte
// pela restrição errada, e a mensagem enganaria quem fosse ler.
beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.consent_records')
  await banco.sql.query('delete from public.dnc_entries')
  await banco.sql.query('delete from public.audit_log')
})

// A forma ----------------------------------------------------------------------

const TELEFONES_RECUSADOS: { caso: string; valor: string }[] = [
  { caso: 'sem o sinal de mais', valor: '5511990000001' },
  { caso: 'com zero à esquerda no país', valor: '+05511990000001' },
  { caso: 'curto demais para ser um número', valor: '+551199' },
  { caso: 'com dígitos demais', valor: `+55${'9'.repeat(14)}` },
  { caso: 'com separador que ninguém normalizou', valor: '+55 11 99000-0001' },
  { caso: 'em branco', valor: '' },
]

test.each(TELEFONES_RECUSADOS)(
  'o número do bloqueio $caso é recusado pelo banco',
  async ({ valor }) => {
    await expect(semearBloqueio(contaA, { phone_e164: valor })).rejects.toThrow(
      /dnc_entries_phone_e164_check/i,
    )
  },
)

test('o check do número é o mesmo de leads, letra por letra', async () => {
  const { rows } = await banco.sql.query<{ tabela: string; expressao: string }>(
    `select rel.relname as tabela, pg_get_constraintdef(c.oid) as expressao
       from pg_constraint as c
       join pg_class as rel on rel.oid = c.conrelid
      where c.conname in ('leads_phone_e164_check', 'dnc_entries_phone_e164_check')
      order by rel.relname`,
  )
  expect(rows).toHaveLength(2)

  // É este número que o passo 3 da guarda compara com o do lead. Régua
  // diferente faria o bloqueio existir na tela e não existir na comparação —
  // a forma mais silenciosa de ligar para quem pediu para não ser chamado.
  const expressoes = rows.map((linha) => linha.expressao.replace(/\s+/g, ''))
  expect(expressoes[0]).toBe(expressoes[1])
})

test('bloqueio sem motivo é recusado: "bloqueado" sozinho não responde nada', async () => {
  await expect(semearBloqueio(contaA, { reason: '   ' })).rejects.toThrow(
    /dnc_entries_reason_check/i,
  )
})

test('observação em branco é recusada, e nula entra', async () => {
  await expect(semearBloqueio(contaA, { notes: '' })).rejects.toThrow(
    /dnc_entries_notes_check/i,
  )

  const id = await semearBloqueio(contaA, { notes: null })
  expect(id).toBeTruthy()
})

// A origem ---------------------------------------------------------------------

test.each(ORIGENS)('a origem %s é aceita', async (origem) => {
  const id = await semearBloqueio(contaA, { source: origem })

  const { rows } = await banco.sql.query<{ source: string }>(
    'select source from public.dnc_entries where id = $1',
    [id],
  )
  expect(rows[0]?.source).toBe(origem)
})

test.each(['sms', 'agente', 'WRONG_NUMBER', '', 'call'])(
  'a origem "%s" é recusada',
  async (valor) => {
    // Origem nova exige migração de propósito: um valor que nenhum caminho de
    // código escreve vira filtro de tela que nunca traz linha.
    // `call` é o nome que a F2 dava ao pedido na ligação, hoje `lead_request`.
    await expect(semearBloqueio(contaA, { source: valor })).rejects.toThrow(
      /origem de bloqueio desconhecida/,
    )
  },
)

test('o bloqueio nasce manual e ativo', async () => {
  const id = await semearBloqueio(contaA)

  const { rows } = await banco.sql.query<{
    source: string
    removed_at: Date | null
  }>('select source, removed_at from public.dnc_entries where id = $1', [id])

  expect(rows[0]?.source).toBe('manual')
  expect(rows[0]?.removed_at).toBeNull()
})

// O único parcial ----------------------------------------------------------------

test('o índice do único é parcial em removed_at', async () => {
  const { rows } = await banco.sql.query<{ definicao: string }>(
    `select indexdef as definicao
       from pg_indexes
      where schemaname = 'public'
        and indexname = 'dnc_entries_ativo_unico_por_conta'`,
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.definicao).toMatch(/unique/i)
  expect(rows[0]?.definicao).toMatch(/where\s+\(removed_at is null\)/i)
})

test('o segundo bloqueio ativo do mesmo número é barrado, e na vizinha entra', async () => {
  await semearBloqueio(contaA, { phone_e164: '+5511990000001' })

  await expect(
    semearBloqueio(contaA, {
      phone_e164: '+5511990000001',
      reason: 'de novo',
    }),
  ).rejects.toThrow(/dnc_entries_ativo_unico_por_conta/i)

  // O mesmo telefone pode estar bloqueado em duas contas: cada uma bloqueia
  // para si, e a lista de uma não é a da outra.
  const naVizinha = await semearBloqueio(contaB, {
    phone_e164: '+5511990000001',
  })
  expect(naVizinha).toBeTruthy()
})

test('depois de remover, o mesmo número entra de novo como linha nova', async () => {
  const primeiro = await semearBloqueio(contaA, {
    phone_e164: '+5511990000001',
  })

  await banco.sql.query(
    `update public.dnc_entries
        set removed_at = now(), removed_by = $2, removal_reason = 'era engano'
      where id = $1`,
    [primeiro, contaA.operadorId],
  )

  // Sem o `where` do índice, esta inclusão colidiria com a remoção antiga e o
  // operador veria "número já bloqueado" olhando para uma lista onde ele não
  // está.
  const segundo = await semearBloqueio(contaA, {
    phone_e164: '+5511990000001',
    source: 'lead_request',
    reason: 'pediu durante a chamada',
  })
  expect(segundo).not.toBe(primeiro)

  const { rows } = await banco.sql.query<{ total: number }>(
    `select count(*)::int as total from public.dnc_entries
      where account_id = $1 and phone_e164 = '+5511990000001'`,
    [contaA.id],
  )
  expect(rows[0]?.total).toBe(2)
})

// A remoção ---------------------------------------------------------------------

const REMOCOES_PELA_METADE: { caso: string; campos: Record<string, unknown> }[] =
  [
    { caso: 'só a hora', campos: { removed_at: 'now()' } },
    {
      caso: 'hora e autor, sem motivo',
      campos: { removed_at: 'now()', removed_by: 'autor' },
    },
    {
      caso: 'hora e motivo, sem autor',
      campos: { removed_at: 'now()', removal_reason: 'tirei' },
    },
    {
      caso: 'hora, autor e motivo em branco',
      campos: {
        removed_at: 'now()',
        removed_by: 'autor',
        removal_reason: '   ',
      },
    },
    { caso: 'só o autor', campos: { removed_by: 'autor' } },
    { caso: 'só o motivo', campos: { removal_reason: 'tirei' } },
  ]

test.each(REMOCOES_PELA_METADE)(
  'a remoção com $caso é recusada pelo check',
  async ({ campos }) => {
    const id = await semearBloqueio(contaA)

    const atribuicoes: string[] = []
    const valores: unknown[] = [id]
    for (const [coluna, valor] of Object.entries(campos)) {
      if (valor === 'now()') {
        atribuicoes.push(`${coluna} = now()`)
        continue
      }
      valores.push(valor === 'autor' ? contaA.operadorId : valor)
      atribuicoes.push(`${coluna} = $${valores.length}`)
    }

    // "Removido por ninguém, sem motivo" é o pior estado possível: o número
    // volta a receber ligação e não há a quem perguntar por quê.
    await expect(
      banco.sql.query(
        `update public.dnc_entries set ${atribuicoes.join(', ')} where id = $1`,
        valores,
      ),
    ).rejects.toThrow(/dnc_entries_remocao_completa/i)
  },
)

test('a remoção com os três campos entra, e o bloqueio some da lista ativa', async () => {
  const id = await semearBloqueio(contaA)

  await banco.sql.query(
    `update public.dnc_entries
        set removed_at = now(), removed_by = $2, removal_reason = 'cliente voltou a autorizar'
      where id = $1`,
    [id, contaA.operadorId],
  )

  const { rows } = await banco.sql.query<{ total: number }>(
    `select count(*)::int as total from public.dnc_entries
      where account_id = $1 and removed_at is null`,
    [contaA.id],
  )
  // A linha continua lá, com autor e motivo: RF-804 pede remoção registrada, e
  // um delete não deixaria rastro nenhum.
  expect(rows[0]?.total).toBe(0)
})

test('apagar o perfil de quem removeu não derruba o bloqueio nem o check', async () => {
  const id = await semearBloqueio(contaA)
  const passageiro = await banco.criarUsuario('passageiro@aurora.test', 'Passageiro')

  await banco.sql.query(
    `update public.dnc_entries
        set removed_at = now(), removed_by = $2, removal_reason = 'era engano'
      where id = $1`,
    [id, passageiro],
  )

  // Sem chave estrangeira em `removed_by` justamente por isto: um `on delete
  // set null` deixaria `removed_at` preenchido e `removed_by` nulo, e a
  // exclusão do perfil passaria a falhar por violação de restrição.
  await banco.sql.query('delete from auth.users where id = $1', [passageiro])

  const { rows } = await banco.sql.query<{ removed_by: string }>(
    'select removed_by from public.dnc_entries where id = $1',
    [id],
  )
  expect(rows[0]?.removed_by).toBe(passageiro)
})

// Isolamento de dnc_entries ------------------------------------------------------

test('o operador bloqueia e o viewer não', async () => {
  await banco.comoUsuario(contaA.observadorId)
  await expect(
    banco.sql.query(
      `insert into public.dnc_entries (account_id, phone_e164, reason)
       values ($1, '+5511990000003', 'do viewer')`,
      [contaA.id],
    ),
  ).rejects.toThrow(/row-level security/i)

  await banco.comoUsuario(contaA.operadorId)
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.dnc_entries (account_id, phone_e164, reason)
     values ($1, '+5511990000003', 'pediu para não ser chamado')
     returning id`,
    [contaA.id],
  )
  expect(rows).toHaveLength(1)
})

test('o viewer lê a lista e não remove', async () => {
  const id = await semearBloqueio(contaA)

  await banco.comoUsuario(contaA.observadorId)

  const { rows: lidos } = await banco.sql.query(
    'select id from public.dnc_entries where id = $1',
    [id],
  )
  // A recusa da guarda por bloqueio só se explica com a lista à vista.
  expect(lidos).toHaveLength(1)

  // RLS que não casa não levanta erro: simplesmente não afeta linha.
  const { rows: alterados } = await banco.sql.query(
    `update public.dnc_entries
        set removed_at = now(), removed_by = $2, removal_reason = 'quis tirar'
      where id = $1 returning id`,
    [id, contaA.observadorId],
  )
  expect(alterados).toEqual([])

  const { rows: apagados } = await banco.sql.query(
    'delete from public.dnc_entries where id = $1 returning id',
    [id],
  )
  expect(apagados).toEqual([])
})

test('o operador remove o bloqueio que ele mesmo pôs', async () => {
  const id = await semearBloqueio(contaA)

  await banco.comoUsuario(contaA.operadorId)
  const { rows } = await banco.sql.query<{ id: string }>(
    `update public.dnc_entries
        set removed_at = now(), removed_by = $2, removal_reason = 'cliente voltou a autorizar'
      where id = $1 returning id`,
    [id, contaA.operadorId],
  )
  expect(rows).toHaveLength(1)
})

test('a conta vizinha recebe zero bloqueio, e o anônimo também', async () => {
  await semearBloqueio(contaA, { phone_e164: '+5511990000001' })
  await semearBloqueio(contaB, { phone_e164: '+5511990000002' })

  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.dnc_entries',
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.account_id).toBe(contaA.id)

  await banco.comoAnonimo()
  const { rows: semNada } = await banco.sql.query(
    'select id from public.dnc_entries',
  )
  expect(semNada).toEqual([])
})

// O consentimento ----------------------------------------------------------------

test.each(['assinatura', 'RECORDING', ''])(
  'a espécie de consentimento "%s" é recusada',
  async (valor) => {
    await expect(
      semearConsentimento(contaA, { kind: valor }),
    ).rejects.toThrow(/consent_records_kind_check/i)
  },
)

test('o consentimento nasce sem prova e com a hora do aviso', async () => {
  const id = await semearConsentimento(contaA)

  const { rows } = await banco.sql.query<{
    evidence: Record<string, unknown>
    at: Date
    lead_id: string | null
    call_id: string | null
  }>('select evidence, at, lead_id, call_id from public.consent_records where id = $1', [
    id,
  ])

  expect(rows[0]?.evidence).toEqual({})
  expect(rows[0]?.at).toBeTruthy()
  // Nulos porque a ligação recebida de um número que ainda não virou lead dá o
  // aviso do mesmo jeito, e perder o registro por falta de cadastro seria
  // perder justamente a prova.
  expect(rows[0]?.lead_id).toBeNull()
  expect(rows[0]?.call_id).toBeNull()
})

test('prova que não é objeto é recusada', async () => {
  await expect(
    semearConsentimento(contaA, { evidence: JSON.stringify([]) }),
  ).rejects.toThrow(/consent_records_evidence_check/i)
})

test('a recusa também se registra: granted falso entra', async () => {
  const id = await semearConsentimento(contaA, { granted: false })
  expect(id).toBeTruthy()
})

test('call_id ganhou a chave estrangeira que esta migração deixou declarada', async () => {
  // A coluna nasceu aqui sem restrição porque `calls` é a migração seguinte
  // (US-050), e a chave entrou lá, junto com a tabela. O teste mudou de lado no
  // mesmo dia em que a tabela chegou: a asserção não se escreve contra o estado
  // provisório, senão ela é que precisa mudar quando a fatia avança.
  const { rows: chaves } = await banco.sql.query<{ colunas: string }>(
    `select a.attname as colunas
       from pg_constraint as c
       join pg_class as rel on rel.oid = c.conrelid
       join pg_attribute as a
         on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where rel.relname = 'consent_records' and c.contype = 'f'
      order by a.attname`,
  )
  expect(chaves.map((linha) => linha.colunas)).toEqual([
    'account_id',
    'call_id',
    'lead_id',
  ])

  // E agora o identificador solto é recusado: era o que faltava para o registro
  // de consentimento apontar sempre para uma chamada que existiu.
  await expect(
    semearConsentimento(contaA, {
      call_id: '00000000-0000-4000-8000-000000000001',
    }),
  ).rejects.toThrow(/consent_records_call_id_fkey/i)
})

test.each(['donoId', 'adminId', 'operadorId', 'observadorId'] as const)(
  'nem o %s insere consentimento: quem escreve é call-finalize',
  async (papel) => {
    await banco.comoUsuario(contaA[papel])
    // Consentimento que a própria conta insere não prova nada: a prova de que
    // o aviso foi dado é justamente não ter vindo de quem se beneficia dela.
    await expect(
      banco.sql.query(
        `insert into public.consent_records (account_id, kind, granted)
         values ($1, 'recording', true)`,
        [contaA.id],
      ),
    ).rejects.toThrow(/row-level security/i)
  },
)

test('ninguém altera nem apaga consentimento pelo cliente', async () => {
  const id = await semearConsentimento(contaA)

  await banco.comoUsuario(contaA.donoId)

  const { rows: alterados } = await banco.sql.query(
    `update public.consent_records set granted = false where id = $1 returning id`,
    [id],
  )
  expect(alterados).toEqual([])

  const { rows: apagados } = await banco.sql.query(
    'delete from public.consent_records where id = $1 returning id',
    [id],
  )
  expect(apagados).toEqual([])
})

test('a conta vizinha recebe zero consentimento, e o anônimo também', async () => {
  await semearConsentimento(contaA)
  await semearConsentimento(contaB)

  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.consent_records',
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.account_id).toBe(contaA.id)

  await banco.comoAnonimo()
  const { rows: semNada } = await banco.sql.query(
    'select id from public.consent_records',
  )
  expect(semNada).toEqual([])
})

// Auditoria ----------------------------------------------------------------------

test('remover e apagar o bloqueio entram na trilha', async () => {
  const id = await semearBloqueio(contaA)

  await banco.sql.query(
    `update public.dnc_entries
        set removed_at = now(), removed_by = $2, removal_reason = 'cliente voltou a autorizar'
      where id = $1`,
    [id, contaA.operadorId],
  )
  await banco.sql.query('delete from public.dnc_entries where id = $1', [id])

  const { rows } = await banco.sql.query<{
    action: string
    target_type: string
    payload: { campos?: string[] }
  }>(
    `select action, target_type, payload from public.audit_log
      where target_id = $1
      order by action`,
    [id],
  )

  // Ordem por `action` e não por `created_at`: as duas escritas podem cair no
  // mesmo instante, e aí a ordem do relógio não é ordem nenhuma.
  expect(rows.map((linha) => linha.action)).toEqual(['delete', 'update'])
  expect(rows.map((linha) => linha.target_type)).toEqual([
    'dnc_entries',
    'dnc_entries',
  ])
  // Devolver um número à discagem é a decisão que mais precisa de autor e hora
  // fora da própria linha.
  expect(rows[1]?.payload.campos).toContain('removed_at')
})

test('o consentimento não vira linha de trilha, e a ausência do gatilho é a razão', async () => {
  const id = await semearConsentimento(contaA)

  await banco.sql.query(
    `update public.consent_records set granted = false where id = $1`,
    [id],
  )

  const { rows } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.audit_log where target_id = $1',
    [id],
  )
  // Registro do servidor, não configuração que alguém edita: não há escrita de
  // cliente para auditar, e uma trilha por consentimento seria uma linha por
  // chamada dizendo o que a própria tabela já diz.
  expect(rows[0]?.total).toBe(0)

  const { rows: gatilhos } = await banco.sql.query<{ total: number }>(
    `select count(*)::int as total
       from pg_trigger as t
       join pg_class as rel on rel.oid = t.tgrelid
      where rel.relname = 'consent_records' and not t.tgisinternal`,
  )
  expect(gatilhos[0]?.total).toBe(0)
})
