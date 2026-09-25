// Prévia do convite: o que a tela /convite/:token lê antes do aceite.
//
// O aceite em si se prova em testes/banco/convites.test.ts. Aqui só a
// leitura: quem convidou, para qual conta, com qual papel, e em que estado o
// convite está. Referência: docs/PRD.md RF-005.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { hashDeToken } from '../../supabase/functions/_shared/token-de-convite.ts'
import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

interface LinhaDePrevia {
  resultado: string
  conta_nome: string | null
  papel: string | null
  email: string | null
  convidado_por: string | null
  expira_em: Date | string | null
}

let banco: BancoDeTeste
let conta: string
let ana: string
let convidado: string

const EMAIL_CONVIDADO = 'ivo@cooperativa.com.br'

beforeAll(async () => {
  banco = await criarBancoDeTeste()

  const { rows } = await banco.sql.query<{ id: string }>(
    "insert into public.accounts (name) values ('Cooperativa Sul') returning id",
  )
  conta = rows[0]?.id ?? ''

  ana = await banco.criarUsuario('ana@cooperativa.com.br', 'Ana Prado')
  await banco.sql.query(
    "insert into public.account_members (account_id, user_id, role) values ($1, $2, 'owner')",
    [conta, ana],
  )

  convidado = await banco.criarUsuario(EMAIL_CONVIDADO, 'Ivo')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
})

/** Convite semeado como serviço, fora do alcance das políticas. */
async function semearConvite(campos: {
  token: string
  papel?: string
  expirado?: boolean
  revogado?: boolean
  aceito?: boolean
}): Promise<void> {
  // `expires_at > created_at` vale para toda linha: um convite vencido é um
  // que nasceu antes, não um que nasce vencido.
  const nascimento = campos.expirado ? '8 days' : '0 days'
  const validade = campos.expirado ? '1 day' : '-7 days'

  await banco.sql.query(
    `insert into public.invitations
       (account_id, email, role, token_hash, created_at, expires_at,
        revoked_at, accepted_at, accepted_by, invited_by)
     values ($1, $2, $3, $4, now() - $5::interval, now() - $6::interval,
             $7, $8, $9, $10)`,
    [
      conta,
      campos.token + '@cooperativa.com.br',
      campos.papel ?? 'operator',
      await hashDeToken(campos.token),
      nascimento,
      validade,
      campos.revogado ? new Date().toISOString() : null,
      campos.aceito ? new Date().toISOString() : null,
      campos.aceito ? convidado : null,
      ana,
    ],
  )
}

async function previa(token: string): Promise<LinhaDePrevia | undefined> {
  const { rows } = await banco.sql.query<LinhaDePrevia>(
    'select * from public.previa_do_convite($1)',
    [await hashDeToken(token)],
  )
  return rows[0]
}

test('convite em pé devolve conta, papel, e-mail e quem convidou', async () => {
  await semearConvite({ token: 'valido', papel: 'admin' })

  const linha = await previa('valido')

  expect(linha?.resultado).toBe('valido')
  expect(linha?.conta_nome).toBe('Cooperativa Sul')
  expect(linha?.papel).toBe('admin')
  expect(linha?.email).toBe('valido@cooperativa.com.br')
  expect(linha?.convidado_por).toBe('Ana Prado')
  expect(linha?.expira_em).not.toBeNull()
})

test('convite vencido se anuncia como expirado, e não some', async () => {
  await semearConvite({ token: 'vencido', expirado: true })

  const linha = await previa('vencido')

  expect(linha?.resultado).toBe('expirado')
  // A conta continua vindo: o convidado precisa saber a quem pedir outro link.
  expect(linha?.conta_nome).toBe('Cooperativa Sul')
  expect(linha?.convidado_por).toBe('Ana Prado')
})

test('convite cancelado se anuncia como revogado', async () => {
  await semearConvite({ token: 'cancelado', revogado: true })

  expect((await previa('cancelado'))?.resultado).toBe('revogado')
})

test('convite já usado se anuncia como ja_aceito', async () => {
  await semearConvite({ token: 'usado', aceito: true })

  expect((await previa('usado'))?.resultado).toBe('ja_aceito')
})

test('token desconhecido não devolve linha nenhuma', async () => {
  expect(await previa('nunca-existiu')).toBeUndefined()
})

test('revogado tem precedência sobre vencido', async () => {
  // Um convite pode ser as duas coisas. A frase que interessa é a que diz que
  // alguém cancelou, porque é a que muda o que o convidado faz em seguida.
  await semearConvite({ token: 'ambos', expirado: true, revogado: true })

  expect((await previa('ambos'))?.resultado).toBe('revogado')
})

test('sessão anônima lê a prévia: quem clica no link ainda não entrou', async () => {
  await semearConvite({ token: 'para-anonimo' })
  await banco.comoAnonimo()

  const { rows } = await banco.sql.query<LinhaDePrevia>(
    'select * from public.previa_do_convite($1)',
    [await hashDeToken('para-anonimo')],
  )

  expect(rows[0]?.resultado).toBe('valido')
  expect(rows[0]?.conta_nome).toBe('Cooperativa Sul')
})

test('anônimo não alcança a tabela de convites por fora da função', async () => {
  await semearConvite({ token: 'fora-da-funcao' })
  await banco.comoAnonimo()

  const { rows } = await banco.sql.query(
    'select id from public.invitations where token_hash = $1',
    [await hashDeToken('fora-da-funcao')],
  )

  expect(rows).toHaveLength(0)
})

test('quem convidou cai no e-mail quando o perfil não tem nome', async () => {
  await banco.sql.query('update public.profiles set display_name = null where id = $1', [
    ana,
  ])
  await semearConvite({ token: 'sem-nome' })

  expect((await previa('sem-nome'))?.convidado_por).toBe('ana@cooperativa.com.br')

  await banco.sql.query(
    "update public.profiles set display_name = 'Ana Prado' where id = $1",
    [ana],
  )
})
