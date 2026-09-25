// Comportamento da função invite-accept, com a camada de dados dublada.
// Nenhum banco sobe aqui: o que se prova é a tradução do pedido em resposta,
// e a garantia de que um convite recusado nunca chega a criar vínculo.
//
// O que o banco decide (expirado, revogado, já aceito) se prova em
// `testes/banco/convites.test.ts`, contra o RPC de verdade.

import { beforeEach, expect, test } from 'vitest'

import { hashDeToken } from '../_shared/token-de-convite.ts'

import {
  aceitarConvite,
  extrairJwt,
  type CodigoDoBanco,
  type PedidoDeAceite,
  type PortaDeConvites,
  type ResultadoDoBanco,
} from './aceite.ts'
import { MENSAGENS } from './respostas.ts'

const TOKEN = 'k9Qd2wZp_3yTn1Vx-4rUeLbAsHjMcNgF7iO0pQ8tRvY'
const JWT = 'Bearer jwt-de-teste'
const USUARIO = { id: '11111111-1111-4111-8111-111111111111', email: 'ana@transportes.com.br' }
const CONTA = {
  conta_id: '22222222-2222-4222-8222-222222222222',
  conta_nome: 'Transportes Andrade',
  papel: 'operator',
}

interface Chamada {
  readonly tokenHash: string
  readonly usuarioId: string
}

/** Dublê da camada de dados. Guarda o que foi chamado, para provar o que não foi. */
function dublar(opcoes: {
  usuario?: typeof USUARIO | null
  resultado?: Partial<ResultadoDoBanco> & { resultado: CodigoDoBanco }
  erroAoAceitar?: Error
  erroNaSessao?: Error
}): { porta: PortaDeConvites; chamadas: Chamada[] } {
  const chamadas: Chamada[] = []

  const porta: PortaDeConvites = {
    async usuarioDaSessao() {
      if (opcoes.erroNaSessao) throw opcoes.erroNaSessao
      return opcoes.usuario === undefined ? USUARIO : opcoes.usuario
    },
    async aceitar(tokenHash, usuarioId) {
      chamadas.push({ tokenHash, usuarioId })
      if (opcoes.erroAoAceitar) throw opcoes.erroAoAceitar
      return {
        conta_id: null,
        conta_nome: null,
        papel: null,
        ...(opcoes.resultado ?? { resultado: 'aceito' as const, ...CONTA }),
      }
    },
  }

  return { porta, chamadas }
}

function pedido(ajustes: Partial<PedidoDeAceite> = {}): PedidoDeAceite {
  return { metodo: 'POST', token: TOKEN, autorizacao: JWT, ...ajustes }
}

let porta: PortaDeConvites
let chamadas: Chamada[]

beforeEach(() => {
  ;({ porta, chamadas } = dublar({ resultado: { resultado: 'aceito', ...CONTA } }))
})

// Caminho feliz --------------------------------------------------------------

test('convite válido devolve 200, a conta e o papel', async () => {
  const resposta = await aceitarConvite(pedido(), porta)

  expect(resposta.status).toBe(200)
  expect(resposta.corpo.ok).toBe(true)
  expect(resposta.corpo.motivo).toBe('aceito')
  expect(resposta.corpo.conta).toEqual({
    id: CONTA.conta_id,
    nome: CONTA.conta_nome,
    papel: CONTA.papel,
  })
})

test('o banco recebe o hash do token, nunca o token em claro', async () => {
  await aceitarConvite(pedido(), porta)

  expect(chamadas).toHaveLength(1)
  expect(chamadas[0]?.tokenHash).toBe(await hashDeToken(TOKEN))
  expect(chamadas[0]?.tokenHash).not.toBe(TOKEN)
  expect(chamadas[0]?.usuarioId).toBe(USUARIO.id)
})

test('espaço em volta do token não muda o hash enviado', async () => {
  await aceitarConvite(pedido({ token: `  ${TOKEN}\n` }), porta)

  expect(chamadas[0]?.tokenHash).toBe(await hashDeToken(TOKEN))
})

test('quem já era membro recebe 200 e o papel que já tinha', async () => {
  const dublê = dublar({
    resultado: { resultado: 'ja_membro', ...CONTA, papel: 'admin' },
  })

  const resposta = await aceitarConvite(pedido(), dublê.porta)

  expect(resposta.status).toBe(200)
  expect(resposta.corpo.ok).toBe(true)
  expect(resposta.corpo.conta?.papel).toBe('admin')
})

// Recusa antes do banco ------------------------------------------------------

test('sem cabeçalho Authorization, a resposta é 401 e o banco não é chamado', async () => {
  const resposta = await aceitarConvite(pedido({ autorizacao: null }), porta)

  expect(resposta.status).toBe(401)
  expect(resposta.corpo.motivo).toBe('sem_sessao')
  expect(chamadas, 'convite sem sessão não pode alcançar o banco').toEqual([])
})

test('token ausente ou vazio devolve 400 sem chamar o banco', async () => {
  for (const vazio of [null, '', '   ', 42]) {
    const resposta = await aceitarConvite(pedido({ token: vazio }), porta)
    expect(resposta.status, `token ${JSON.stringify(vazio)}`).toBe(400)
    expect(resposta.corpo.motivo).toBe('token_ausente')
  }
  expect(chamadas).toEqual([])
})

test('GET devolve 405 e não toca no banco', async () => {
  const resposta = await aceitarConvite(pedido({ metodo: 'GET' }), porta)

  expect(resposta.status).toBe(405)
  expect(resposta.corpo.motivo).toBe('metodo_invalido')
  expect(chamadas).toEqual([])
})

test('sessão que o servidor não reconhece devolve 401 sem chamar o banco', async () => {
  const dublê = dublar({ usuario: null })

  const resposta = await aceitarConvite(pedido(), dublê.porta)

  expect(resposta.status).toBe(401)
  expect(resposta.corpo.motivo).toBe('sessao_invalida')
  expect(dublê.chamadas).toEqual([])
})

// Recusa vinda do banco ------------------------------------------------------

const RECUSAS: { codigo: CodigoDoBanco; status: number }[] = [
  { codigo: 'ja_aceito', status: 409 },
  { codigo: 'expirado', status: 410 },
  { codigo: 'revogado', status: 410 },
  { codigo: 'nao_encontrado', status: 404 },
  { codigo: 'email_divergente', status: 403 },
  { codigo: 'usuario_desconhecido', status: 401 },
]

for (const { codigo, status } of RECUSAS) {
  test(`${codigo} devolve ${status}, em português, e sem conta no corpo`, async () => {
    const dublê = dublar({ resultado: { resultado: codigo } })

    const resposta = await aceitarConvite(pedido(), dublê.porta)

    expect(resposta.status).toBe(status)
    expect(resposta.corpo.ok).toBe(false)
    expect(resposta.corpo.motivo).toBe(codigo)
    expect(resposta.corpo.mensagem).toBe(MENSAGENS[codigo])
    expect(resposta.corpo.conta).toBeUndefined()
  })
}

test('toda mensagem é uma frase em português, sem código cru vazando', () => {
  for (const [motivo, mensagem] of Object.entries(MENSAGENS)) {
    expect(mensagem.length, motivo).toBeGreaterThan(20)
    expect(mensagem, motivo).toMatch(/[.!?]$/)
    expect(mensagem, `${motivo} vaza o código na frase`).not.toContain('_')
  }
})

// Falha ----------------------------------------------------------------------

test('erro da camada de dados vira 500 com frase, não exceção', async () => {
  const dublê = dublar({ erroAoAceitar: new Error('conexão recusada') })

  const resposta = await aceitarConvite(pedido(), dublê.porta)

  expect(resposta.status).toBe(500)
  expect(resposta.corpo.motivo).toBe('falha_interna')
  expect(resposta.corpo.mensagem, 'detalhe interno não vai para o convidado').not.toContain(
    'conexão recusada',
  )
})

test('erro ao conferir a sessão também vira 500 com frase', async () => {
  const dublê = dublar({ erroNaSessao: new Error('gotrue fora do ar') })

  const resposta = await aceitarConvite(pedido(), dublê.porta)

  expect(resposta.status).toBe(500)
  expect(resposta.corpo.motivo).toBe('falha_interna')
})

test('sucesso sem conta no retorno é falha, não sucesso vazio', async () => {
  const dublê = dublar({ resultado: { resultado: 'aceito' } })

  const resposta = await aceitarConvite(pedido(), dublê.porta)

  expect(resposta.status).toBe(500)
  expect(resposta.corpo.ok).toBe(false)
  expect(resposta.corpo.motivo).toBe('falha_interna')
})

// Cabeçalho ------------------------------------------------------------------

test('extrairJwt aceita Bearer em qualquer caixa e recusa o resto', () => {
  expect(extrairJwt('Bearer abc.def.ghi')).toBe('abc.def.ghi')
  expect(extrairJwt('bearer abc.def.ghi')).toBe('abc.def.ghi')
  expect(extrairJwt('  BEARER   abc.def.ghi  ')).toBe('abc.def.ghi')
  expect(extrairJwt('abc.def.ghi')).toBeNull()
  expect(extrairJwt('Basic abc')).toBeNull()
  expect(extrairJwt('Bearer   ')).toBeNull()
  expect(extrairJwt(null)).toBeNull()
})
