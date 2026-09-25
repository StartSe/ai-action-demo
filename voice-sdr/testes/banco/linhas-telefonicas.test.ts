// As linhas telefônicas da conta: a origem da discagem e o destino da ligação
// recebida (seção 3.5, T-14, R-04).
//
// O que este arquivo prova:
//
// 1. A forma é conferida pelo banco, com o mesmo check de `leads.phone_e164`:
//    número torto é recusado no da linha e no do encaminhamento.
// 2. `forward` sem `forward_to` é recusado — comportamento que aponta para
//    lugar nenhum é configuração morta, pior do que ausência.
// 3. O único barra o número repetido na mesma conta e deixa passar na vizinha.
// 4. `health` é do servidor: o administrador escreve e o gatilho descarta, e
//    quem levanta o parâmetro de sessão consegue gravar.
// 5. O recálculo de `health` não entra na trilha, e o resto entra (RF-008).
// 6. Classe Configuração: membro lê, administrador escreve, operador não.
// 7. A conta vizinha recebe zero linha, e a sessão anônima também.
// 8. O padrão de `daily_cap` é cem, que é o número heurístico do PRD de
//    produto (P-08), e o índice do rodízio existe.
//
// Referência: migração 20260922020000_linhas_telefonicas.sql,
// docs/PRD-implementacao.md seções 3.5, 3.9 e 6 (passo 8 da guarda),
// docs/revisao-tecnica.md T-14, R-04 e P-08, docs/PRD.md RF-008 e RF-409.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

/** O padrão da coluna, que é a heurística de P-08 e não valor de operadora. */
const TETO_DIARIO_PADRAO = 100

interface Conta {
  readonly id: string
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

  const adminId = await banco.criarUsuario(`admin@${dominio}`, 'Admin')
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')

  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'admin'), ($1, $3, 'operator')`,
    [id, adminId, operadorId],
  )

  return { id, adminId, operadorId }
}

/** Insert mínimo: só o que não tem padrão. O resto vem da coluna. */
async function semearLinha(
  conta: Conta,
  extras: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const campos: Record<string, unknown> = {
    account_id: conta.id,
    e164: '+5511990000001',
    label: 'linha comercial',
    ...extras,
  }

  const colunas = Object.keys(campos)
  const valores = Object.values(campos)
  const marcadores = colunas.map((_, indice) => `$${indice + 1}`)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.phone_lines (${colunas.join(', ')})
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

// O único por conta faz o resíduo do teste anterior derrubar o insert seguinte
// pela restrição errada, e a mensagem enganaria quem fosse ler.
beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.phone_lines')
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
  'o número da linha $caso é recusado pelo banco',
  async ({ valor }) => {
    await expect(semearLinha(contaA, { e164: valor })).rejects.toThrow(
      /phone_lines_e164_check/i,
    )
  },
)

test.each(TELEFONES_RECUSADOS)(
  'o destino do encaminhamento $caso é recusado pelo banco',
  async ({ valor }) => {
    await expect(
      semearLinha(contaA, { inbound_behavior: 'forward', forward_to: valor }),
    ).rejects.toThrow(/phone_lines_forward_to_check/i)
  },
)

test('o check do número é o mesmo de leads, letra por letra', async () => {
  const { rows } = await banco.sql.query<{ tabela: string; expressao: string }>(
    `select rel.relname as tabela, pg_get_constraintdef(c.oid) as expressao
       from pg_constraint as c
       join pg_class as rel on rel.oid = c.conrelid
      where c.conname in ('leads_phone_e164_check', 'phone_lines_e164_check')`,
  )
  expect(rows).toHaveLength(2)

  // O número da linha vai no `from` da chamada e é o que `call-init` compara
  // com o `called_number` do provedor. Régua diferente da do lead faria o
  // mesmo telefone ter duas formas válidas no mesmo banco.
  const expressoes = rows.map((linha) =>
    linha.expressao
      .replace(linha.tabela === 'leads' ? 'phone_e164' : 'e164', '')
      .replace(/\s+/g, ''),
  )
  expect(expressoes[0]).toBe(expressoes[1])
})

test('o rótulo em branco é recusado: a lista de origens precisa dizer qual é qual', async () => {
  await expect(semearLinha(contaA, { label: '   ' })).rejects.toThrow(
    /phone_lines_label_check/i,
  )
})

const COMPORTAMENTOS_RECUSADOS = ['sms', 'agente', '']

test.each(COMPORTAMENTOS_RECUSADOS)(
  'o comportamento de entrada "%s" é recusado',
  async (valor) => {
    await expect(
      semearLinha(contaA, { inbound_behavior: valor }),
    ).rejects.toThrow(/phone_lines_inbound_behavior_check/i)
  },
)

// O encaminhamento sem destino ---------------------------------------------------

test('encaminhar sem destino é recusado', async () => {
  // A tela mostraria "encaminha" e quem ligasse cairia no silêncio: é pior do
  // que não ter comportamento nenhum, porque parece decidido.
  await expect(
    semearLinha(contaA, { inbound_behavior: 'forward' }),
  ).rejects.toThrow(/phone_lines_encaminhamento_com_destino/i)
})

test('encaminhar com destino entra', async () => {
  const id = await semearLinha(contaA, {
    inbound_behavior: 'forward',
    forward_to: '+5511988887777',
  })
  expect(id).toBeTruthy()
})

test('tirar o destino de uma linha que encaminha é recusado', async () => {
  const id = await semearLinha(contaA, {
    inbound_behavior: 'forward',
    forward_to: '+5511988887777',
  })

  // O check vale na alteração como vale no nascimento: a configuração morta
  // chegaria pelo mesmo caminho, só que um dia depois.
  await expect(
    banco.sql.query('update public.phone_lines set forward_to = null where id = $1', [
      id,
    ]),
  ).rejects.toThrow(/phone_lines_encaminhamento_com_destino/i)
})

test('agent e voicemail dispensam destino', async () => {
  const comAgente = await semearLinha(contaA, { inbound_behavior: 'agent' })
  const comRecado = await semearLinha(contaA, {
    e164: '+5511990000002',
    inbound_behavior: 'voicemail',
  })
  expect(comAgente).toBeTruthy()
  expect(comRecado).toBeTruthy()
})

// Os padrões ---------------------------------------------------------------------

test('a linha nasce com o teto heurístico, no rodízio e habilitada', async () => {
  const id = await semearLinha(contaA)

  const { rows } = await banco.sql.query<{
    provider: string
    inbound_behavior: string
    daily_cap: number
    outbound_enabled: boolean
    in_rotation: boolean
    enabled: boolean
    health: Record<string, unknown>
  }>(
    `select provider, inbound_behavior, daily_cap, outbound_enabled,
            in_rotation, enabled, health
       from public.phone_lines where id = $1`,
    [id],
  )

  // Cem é o número heurístico do PRD de produto (P-08), a revisar com a taxa
  // de atendimento real na F7. Se alguém mudar o padrão sem mudar a razão no
  // comentário da coluna, este teste é o aviso.
  expect(rows[0]?.daily_cap).toBe(TETO_DIARIO_PADRAO)
  expect(rows[0]?.provider).toBe('twilio')
  expect(rows[0]?.inbound_behavior).toBe('agent')
  expect(rows[0]?.outbound_enabled).toBe(true)
  expect(rows[0]?.in_rotation).toBe(true)
  expect(rows[0]?.enabled).toBe(true)
  // A linha nasce sem medida: medir é o que a rotina ainda não fez.
  expect(rows[0]?.health).toEqual({})
})

test('teto diário zero é recusado: linha que não disca é outbound_enabled', async () => {
  await expect(semearLinha(contaA, { daily_cap: 0 })).rejects.toThrow(
    /phone_lines_daily_cap_check/i,
  )
})

test('o provedor entra normalizado, e a forma com maiúscula é recusada', async () => {
  await expect(semearLinha(contaA, { provider: 'Twilio' })).rejects.toThrow(
    /phone_lines_provider_check/i,
  )
})

test('o índice do rodízio existe, e é parcial em enabled', async () => {
  const { rows } = await banco.sql.query<{ definicao: string }>(
    `select indexdef as definicao
       from pg_indexes
      where schemaname = 'public' and indexname = 'phone_lines_rodizio'`,
  )
  // É a consulta do passo 8 da guarda, e ela roda em toda discagem: sem o
  // índice, cada ligação varre a tabela.
  expect(rows).toHaveLength(1)
  expect(rows[0]?.definicao).toMatch(/account_id/)
  expect(rows[0]?.definicao).toMatch(/in_rotation/)
  expect(rows[0]?.definicao).toMatch(/where enabled/i)
})

// O único --------------------------------------------------------------------

test('o número repetido na conta é recusado, e na vizinha entra', async () => {
  await semearLinha(contaA, { e164: '+5511990000001' })

  await expect(
    semearLinha(contaA, { e164: '+5511990000001', label: 'de novo' }),
  ).rejects.toThrow(/phone_lines_unico_por_conta/i)

  const naVizinha = await semearLinha(contaB, { e164: '+5511990000001' })
  expect(naVizinha).toBeTruthy()
})

// A saúde --------------------------------------------------------------------

test('o administrador não escreve health, e a linha continua com o retrato antigo', async () => {
  const id = await semearLinha(contaA)

  // A rotina mediu, pelo portão que só ela levanta.
  await banco.sql.query(`select set_config('app.linha_saude', 'on', false)`)
  await banco.sql.query(
    `update public.phone_lines set health = '{"answer_rate": 0.42}'::jsonb where id = $1`,
    [id],
  )
  await banco.sql.query(`select set_config('app.linha_saude', '', false)`)

  await banco.comoUsuario(contaA.adminId)
  await banco.sql.query(
    `update public.phone_lines
        set label = 'linha comercial 2', health = '{"answer_rate": 0.99}'::jsonb
      where id = $1`,
    [id],
  )

  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    label: string
    health: { answer_rate?: number }
  }>('select label, health from public.phone_lines where id = $1', [id])

  // O que o administrador pediu no rótulo valeu; o retrato inventado não.
  // Sem a trava, a conta manteria no rodízio o número que a operadora já
  // marcou como spam.
  expect(rows[0]?.label).toBe('linha comercial 2')
  expect(rows[0]?.health.answer_rate).toBe(0.42)
})

test('o insert do cliente nasce sem saúde, mesmo mandando uma', async () => {
  const id = await semearLinha(contaA, { health: { answer_rate: 0.99 } })

  const { rows } = await banco.sql.query<{ health: Record<string, unknown> }>(
    'select health from public.phone_lines where id = $1',
    [id],
  )
  expect(rows[0]?.health).toEqual({})
})

test('retrato que não é objeto é recusado, e quem esbarra nisso é a rotina', async () => {
  const id = await semearLinha(contaA)

  // Pelo lado do cliente o check nunca dispara: o gatilho troca o que veio por
  // `{}` antes de o banco conferir a forma. Quem a restrição protege é quem
  // tem o portão — uma rotina que gravasse um vetor deixaria a tela de números
  // lendo chave de coisa que não tem chave.
  await banco.sql.query(`select set_config('app.linha_saude', 'on', false)`)
  await expect(
    banco.sql.query(`update public.phone_lines set health = '[]'::jsonb where id = $1`, [
      id,
    ]),
  ).rejects.toThrow(/phone_lines_health_check/i)
  await banco.sql.query(`select set_config('app.linha_saude', '', false)`)
})

// Isolamento -------------------------------------------------------------------

test('o administrador escreve e o operador não', async () => {
  await banco.comoUsuario(contaA.operadorId)
  await expect(
    banco.sql.query(
      `insert into public.phone_lines (account_id, e164, label)
       values ($1, '+5511990000003', 'do operador')`,
      [contaA.id],
    ),
  ).rejects.toThrow(/row-level security/i)

  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.phone_lines (account_id, e164, label)
     values ($1, '+5511990000003', 'linha comercial')
     returning id`,
    [contaA.id],
  )
  expect(rows).toHaveLength(1)
})

test('o operador lê a lista e não muda nem apaga', async () => {
  const id = await semearLinha(contaA)

  await banco.comoUsuario(contaA.operadorId)

  const { rows: lidos } = await banco.sql.query(
    'select id from public.phone_lines where id = $1',
    [id],
  )
  // Ler é dele: o discador manual mostra a origem, e a recusa da guarda por
  // teto de linha só se explica com a lista à vista.
  expect(lidos).toHaveLength(1)

  // RLS que não casa não levanta erro: simplesmente não afeta linha.
  const { rows: alterados } = await banco.sql.query(
    `update public.phone_lines set daily_cap = 500 where id = $1 returning id`,
    [id],
  )
  expect(alterados).toEqual([])

  const { rows: apagados } = await banco.sql.query(
    'delete from public.phone_lines where id = $1 returning id',
    [id],
  )
  expect(apagados).toEqual([])
})

test('a conta vizinha recebe zero linha, e o anônimo também', async () => {
  await semearLinha(contaA, { e164: '+5511990000001' })
  await semearLinha(contaB, { e164: '+5511990000002' })

  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.phone_lines',
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.account_id).toBe(contaA.id)

  await banco.comoAnonimo()
  const { rows: semNada } = await banco.sql.query(
    'select id from public.phone_lines',
  )
  expect(semNada).toEqual([])
})

// Auditoria --------------------------------------------------------------------

test('trocar o comportamento e apagar a linha entram na trilha', async () => {
  const id = await semearLinha(contaA)

  await banco.sql.query(
    `update public.phone_lines
        set inbound_behavior = 'forward', forward_to = '+5511988887777'
      where id = $1`,
    [id],
  )
  await banco.sql.query('delete from public.phone_lines where id = $1', [id])

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
    'phone_lines',
    'phone_lines',
  ])
  // Para onde a ligação recebida vai é o fato auditável: o campo precisa
  // aparecer com nome, senão a linha só diz que "algo mudou".
  expect(rows[1]?.payload.campos).toContain('inbound_behavior')
})

test('o recálculo da saúde não vira linha de trilha', async () => {
  const id = await semearLinha(contaA)

  await banco.sql.query(`select set_config('app.linha_saude', 'on', false)`)
  await banco.sql.query(
    `update public.phone_lines set health = '{"answer_rate": 0.31}'::jsonb where id = $1`,
    [id],
  )
  await banco.sql.query(`select set_config('app.linha_saude', '', false)`)

  const { rows } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.audit_log where target_id = $1',
    [id],
  )
  // cron-line-health passa de hora em hora sobre toda linha da instalação:
  // sem tirar `health` da comparação, a trilha viraria o diário da rotina.
  expect(rows[0]?.total).toBe(0)
})

test('a rotina tirando a linha do rodízio entra na trilha, porque muda a discagem', async () => {
  const id = await semearLinha(contaA)

  await banco.sql.query(`select set_config('app.linha_saude', 'on', false)`)
  await banco.sql.query(
    `update public.phone_lines
        set health = '{"answer_rate": 0.05}'::jsonb, in_rotation = false
      where id = $1`,
    [id],
  )
  await banco.sql.query(`select set_config('app.linha_saude', '', false)`)

  const { rows } = await banco.sql.query<{ payload: { campos?: string[] } }>(
    `select payload from public.audit_log where target_id = $1 and action = 'update'`,
    [id],
  )
  // Tirar a linha do rodízio muda de onde a conta disca, e quem for entender
  // por que as ligações mudaram de número precisa achar isso na trilha.
  expect(rows).toHaveLength(1)
  expect(rows[0]?.payload.campos).toEqual(['in_rotation'])
})
