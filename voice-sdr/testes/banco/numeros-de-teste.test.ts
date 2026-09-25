// Os números de teste da conta: a lista para a qual, e só para a qual, a F2
// libera discagem enquanto o portão da fatia está fechado (L-03, O-02).
//
// O que este arquivo prova:
//
// 1. A forma é conferida pelo banco, com o mesmo check de `leads.phone_e164`:
//    número torto é recusado, número em E.164 entra.
// 2. O único barra o repetido na mesma conta e deixa passar na vizinha — o
//    celular do suporte pode ser teste em duas contas.
// 3. O rótulo é obrigatório e não em branco.
// 4. O décimo terceiro número é recusado, com mensagem que diz o que fazer.
// 5. O autor vem de `auth.uid()`, e o que o cliente mandar em `created_by` é
//    descartado.
// 6. Classe Configuração: membro lê, administrador escreve, operador não.
// 7. A conta vizinha recebe zero linha, e a sessão anônima também.
// 8. Alterar e apagar entram na trilha de auditoria (RF-008).
//
// Referência: migração 20260922010000_numeros_de_teste.sql,
// docs/PRD-implementacao.md seções 3.1, 3.9 e 6, docs/revisao-tecnica.md L-03 e
// O-02, docs/PRD.md RF-008 e RF-912.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

/** O teto da migração. Aqui ele é dado do teste, não leitura do banco. */
const TETO = 12

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
async function semearNumero(
  conta: Conta,
  extras: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const campos: Record<string, unknown> = {
    account_id: conta.id,
    phone_e164: '+5511990000001',
    label: 'meu celular',
    ...extras,
  }

  const colunas = Object.keys(campos)
  const valores = Object.values(campos)
  const marcadores = colunas.map((_, indice) => `$${indice + 1}`)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.account_test_numbers (${colunas.join(', ')})
     values (${marcadores.join(', ')})
     returning id`,
    valores,
  )
  return rows[0]!.id
}

/** Números distintos em E.164, para encher a lista até onde o teste quiser. */
function telefoneDe(indice: number): string {
  return `+5511990${indice.toString().padStart(6, '0')}`
}

async function encher(conta: Conta, quantos: number): Promise<void> {
  for (let indice = 0; indice < quantos; indice += 1) {
    await semearNumero(conta, {
      phone_e164: telefoneDe(indice),
      label: `número ${indice}`,
    })
  }
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test')
  contaB = await criarConta('Cooperativa Sul', 'sul.test')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

// O único por conta e o teto fazem o resíduo do teste anterior derrubar o
// insert seguinte pela restrição errada, e a mensagem enganaria quem fosse ler.
beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.account_test_numbers')
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
  'telefone $caso é recusado pelo banco',
  async ({ valor }) => {
    await expect(semearNumero(contaA, { phone_e164: valor })).rejects.toThrow(
      /account_test_numbers_phone_e164_check/i,
    )
  },
)

test('o check do telefone é o mesmo de leads, letra por letra', async () => {
  const { rows } = await banco.sql.query<{ tabela: string; expressao: string }>(
    `select rel.relname as tabela, pg_get_constraintdef(c.oid) as expressao
       from pg_constraint as c
       join pg_class as rel on rel.oid = c.conrelid
      where c.conname in ('leads_phone_e164_check', 'account_test_numbers_phone_e164_check')`,
  )
  expect(rows).toHaveLength(2)

  // A guarda compara o número do lead com o da lista. Réguas diferentes fariam
  // o portão recusar o próprio número de teste por diferença de forma.
  const expressoes = rows.map((linha) =>
    linha.expressao.replace(linha.tabela === 'leads' ? 'leads' : 'account_test_numbers', ''),
  )
  expect(expressoes[0]).toBe(expressoes[1])
})

test('o telefone em E.164 entra, e a linha nasce com autor e hora', async () => {
  const id = await semearNumero(contaA, { phone_e164: '+5511990000001' })

  const { rows } = await banco.sql.query<{
    phone_e164: string
    created_by: string | null
    created_at: string
  }>(
    `select phone_e164, created_by, created_at
       from public.account_test_numbers where id = $1`,
    [id],
  )
  expect(rows[0]?.phone_e164).toBe('+5511990000001')
  expect(rows[0]?.created_at).toBeTruthy()
  // Sem sessão não há autor: a chave de serviço semeando não tem auth.uid().
  expect(rows[0]?.created_by).toBeNull()
})

const ROTULOS_RECUSADOS: { caso: string; valor: string }[] = [
  { caso: 'em branco', valor: '' },
  { caso: 'só com espaço', valor: '   ' },
]

test.each(ROTULOS_RECUSADOS)('rótulo $caso é recusado', async ({ valor }) => {
  await expect(semearNumero(contaA, { label: valor })).rejects.toThrow(
    /account_test_numbers_label_check/i,
  )
})

test('rótulo é obrigatório: uma lista sem dono não diz para quem se liga', async () => {
  await expect(
    banco.sql.query(
      `insert into public.account_test_numbers (account_id, phone_e164)
       values ($1, '+5511990000001')`,
      [contaA.id],
    ),
  ).rejects.toThrow(/null value in column "label"/i)
})

// O único ----------------------------------------------------------------------

test('o número repetido na conta é recusado, e na vizinha entra', async () => {
  await semearNumero(contaA, { phone_e164: '+5511990000001' })

  await expect(
    semearNumero(contaA, { phone_e164: '+5511990000001', label: 'de novo' }),
  ).rejects.toThrow(/account_test_numbers_unico_por_conta/i)

  // O celular do suporte pode ser teste em duas contas, e é caso comum.
  const naVizinha = await semearNumero(contaB, { phone_e164: '+5511990000001' })
  expect(naVizinha).toBeTruthy()
})

// O teto -----------------------------------------------------------------------

test(`os ${TETO} primeiros entram e o seguinte é recusado com o que fazer`, async () => {
  await encher(contaA, TETO)

  const { rows } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.account_test_numbers where account_id = $1',
    [contaA.id],
  )
  expect(rows[0]?.total).toBe(TETO)

  // A mensagem diz o número e diz a saída: quem bate no teto precisa saber que
  // apagar um é o caminho, e não abrir um chamado.
  await expect(
    semearNumero(contaA, { phone_e164: telefoneDe(TETO), label: 'o décimo terceiro' }),
  ).rejects.toThrow(/apague um antes de acrescentar outro/i)
})

test('o teto é por conta: a vizinha cheia não fecha a porta desta', async () => {
  await encher(contaB, TETO)

  const id = await semearNumero(contaA, { phone_e164: telefoneDe(TETO) })
  expect(id).toBeTruthy()
})

test('apagar um abre a vaga do seguinte', async () => {
  await encher(contaA, TETO)

  await banco.sql.query(
    'delete from public.account_test_numbers where account_id = $1 and phone_e164 = $2',
    [contaA.id, telefoneDe(0)],
  )

  const id = await semearNumero(contaA, { phone_e164: telefoneDe(TETO) })
  expect(id).toBeTruthy()
})

test('trocar o rótulo da décima segunda linha não esbarra no teto', async () => {
  await encher(contaA, TETO)

  const { rows } = await banco.sql.query<{ id: string }>(
    `update public.account_test_numbers
        set label = 'Ana do suporte'
      where account_id = $1 and phone_e164 = $2
      returning id`,
    [contaA.id, telefoneDe(TETO - 1)],
  )
  // Update que não troca de conta sai do gatilho antes de contar: sem essa
  // saída, a própria linha, já contada, recusaria a si mesma.
  expect(rows).toHaveLength(1)
})

test('mover um número para a conta cheia é recusado pelo teto', async () => {
  await encher(contaB, TETO)
  await semearNumero(contaA, { phone_e164: telefoneDe(99) })

  await expect(
    banco.sql.query(
      `update public.account_test_numbers set account_id = $2
        where account_id = $1 and phone_e164 = $3`,
      [contaA.id, contaB.id, telefoneDe(99)],
    ),
  ).rejects.toThrow(/números de teste que a fatia permite/i)
})

// O autor ----------------------------------------------------------------------

test('o autor vem da sessão, e o que o cliente mandar é descartado', async () => {
  await banco.comoUsuario(contaA.adminId)

  const { rows } = await banco.sql.query<{ created_by: string | null }>(
    `insert into public.account_test_numbers
       (account_id, phone_e164, label, created_by)
     values ($1, '+5511990000002', 'meu celular', $2)
     returning created_by`,
    [contaA.id, contaB.adminId],
  )

  // Autor não é campo de formulário: quem acrescentou o número é quem estava na
  // sessão, e é essa a resposta para "quem abriu a discagem para este número?".
  expect(rows[0]?.created_by).toBe(contaA.adminId)
})

// Isolamento -------------------------------------------------------------------

test('o administrador escreve e o operador não', async () => {
  await banco.comoUsuario(contaA.operadorId)
  await expect(
    banco.sql.query(
      `insert into public.account_test_numbers (account_id, phone_e164, label)
       values ($1, '+5511990000003', 'do operador')`,
      [contaA.id],
    ),
  ).rejects.toThrow(/row-level security/i)

  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.account_test_numbers (account_id, phone_e164, label)
     values ($1, '+5511990000003', 'meu celular')
     returning id`,
    [contaA.id],
  )
  expect(rows).toHaveLength(1)
})

test('o operador lê a lista e não muda nem apaga', async () => {
  const id = await semearNumero(contaA)

  await banco.comoUsuario(contaA.operadorId)

  const { rows: lidos } = await banco.sql.query(
    'select id from public.account_test_numbers where id = $1',
    [id],
  )
  // Ler é dele: é a lista que explica por que a discagem recusou um número.
  expect(lidos).toHaveLength(1)

  // RLS que não casa não levanta erro: simplesmente não afeta linha.
  const { rows: alterados } = await banco.sql.query(
    `update public.account_test_numbers set label = 'outro' where id = $1 returning id`,
    [id],
  )
  expect(alterados).toEqual([])

  const { rows: apagados } = await banco.sql.query(
    'delete from public.account_test_numbers where id = $1 returning id',
    [id],
  )
  expect(apagados).toEqual([])
})

test('a conta vizinha recebe zero linha, e o anônimo também', async () => {
  await semearNumero(contaA, { phone_e164: '+5511990000001' })
  await semearNumero(contaB, { phone_e164: '+5511990000002' })

  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.account_test_numbers',
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.account_id).toBe(contaA.id)

  await banco.comoAnonimo()
  const { rows: semNada } = await banco.sql.query(
    'select id from public.account_test_numbers',
  )
  expect(semNada).toEqual([])
})

// Auditoria --------------------------------------------------------------------

test('trocar o número e apagar a linha entram na trilha', async () => {
  const id = await semearNumero(contaA, { phone_e164: '+5511990000001' })

  await banco.sql.query(
    `update public.account_test_numbers set phone_e164 = '+5511990000009' where id = $1`,
    [id],
  )
  await banco.sql.query('delete from public.account_test_numbers where id = $1', [id])

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
    'account_test_numbers',
    'account_test_numbers',
  ])
  // Trocar o número é trocar o destino que a conta liberou: o campo precisa
  // aparecer na trilha com nome, senão a linha só diz que "algo mudou".
  expect(rows[1]?.payload.campos).toContain('phone_e164')
})
