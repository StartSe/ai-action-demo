import { expect, test } from 'vitest'

import { contaDoEnderecoDoWhatsapp } from '../_shared/whatsapp/endereco.ts'
import { INSTANCIA_CONECTADA, INSTANCIA_DESCONECTADA } from '../_shared/whatsapp/zapi-exemplos.ts'

import { atenderConexao, FRASES_DO_ESTADO, type PortaDaConexao } from './conexao.ts'

const CONTA = '11111111-2222-4333-8444-555555555555'
const CREDENCIAIS = { instance_id: 'INSTANCIA-123', token: 'TOKEN-DA-INSTANCIA', client_token: 'TOKEN-DE-SEGURANCA' }
const CHAVE = 'chave-do-servidor'

function porta(papel: string | null = 'admin', credenciais: typeof CREDENCIAIS | null = CREDENCIAIS): PortaDaConexao {
  return {
    usuarioDaSessao: async (jwt) => (jwt === 'jwt' ? { id: 'u' } : null),
    papelNaConta: async () => papel,
    credenciais: async () => credenciais,
  }
}

function rede(estado: unknown, statusDosWebhooks = 200) {
  const pedidos: { url: string; init: RequestInit }[] = []
  return {
    pedidos,
    buscar: async (url: string, init: RequestInit) => {
      pedidos.push({ url, init })
      if (url.endsWith('/status')) return Response.json(estado)
      return Response.json({ value: true }, { status: statusDosWebhooks })
    },
  }
}

const pedido = { metodo: 'POST', autorizacao: 'Bearer jwt', corpo: { account_id: CONTA } }

test('cadastra os dois webhooks com o endereço que prova a conta e diz conectado', async () => {
  const { buscar, pedidos } = rede(INSTANCIA_CONECTADA)
  const resposta = await atenderConexao(pedido, porta(), { base: 'https://p.supabase.co/functions/v1', chaveDoServidor: CHAVE, buscar })
  expect(resposta).toEqual({
    status: 200,
    corpo: { ok: true, estado: 'conectado', webhooks: 'registrados', mensagem: FRASES_DO_ESTADO.conectado },
  })
  const cadastros = pedidos.filter((p) => p.init.method === 'PUT')
  expect(cadastros.map((p) => p.url.split('/').at(-1))).toEqual(['update-webhook-received', 'update-webhook-message-status'])
  const endereco = JSON.parse(String(cadastros[0]!.init.body)).value as string
  expect(await contaDoEnderecoDoWhatsapp(endereco, { vigente: CHAVE })).toBe(CONTA)
  expect(JSON.stringify(resposta.corpo)).not.toContain('TOKEN')
})

test('chamar de novo faz a mesma coisa', async () => {
  const primeira = rede(INSTANCIA_CONECTADA)
  const segunda = rede(INSTANCIA_CONECTADA)
  const ambiente = { base: 'https://p.supabase.co/functions/v1', chaveDoServidor: CHAVE }
  const a = await atenderConexao(pedido, porta(), { ...ambiente, buscar: primeira.buscar })
  const b = await atenderConexao(pedido, porta(), { ...ambiente, buscar: segunda.buscar })
  expect(b).toEqual(a)
  expect(segunda.pedidos.map((p) => [p.url, p.init.body])).toEqual(primeira.pedidos.map((p) => [p.url, p.init.body]))
})

test('instância sem sessão é erro com a frase do QR code, e webhook recusado é dito', async () => {
  const ambiente = { base: 'https://p.supabase.co/functions/v1', chaveDoServidor: CHAVE }
  const desconectada = await atenderConexao(pedido, porta(), { ...ambiente, buscar: rede(INSTANCIA_DESCONECTADA).buscar })
  expect(desconectada.corpo).toMatchObject({ estado: 'erro', mensagem: expect.stringMatching(/QR code/) })
  const recusado = await atenderConexao(pedido, porta(), { ...ambiente, buscar: rede(INSTANCIA_CONECTADA, 401).buscar })
  expect(recusado.corpo).toMatchObject({ estado: 'conectado', webhooks: 'nao_registrados', mensagem: FRASES_DO_ESTADO.webhooksFalharam })
})

test('sem chaves não vai à rede, e só admin conecta', async () => {
  const { buscar, pedidos } = rede(INSTANCIA_CONECTADA)
  const ambiente = { base: 'x', chaveDoServidor: CHAVE, buscar }
  expect((await atenderConexao(pedido, porta('admin', null), ambiente)).corpo).toMatchObject({ estado: 'nao_configurado' })
  expect((await atenderConexao(pedido, porta('operator'), ambiente)).status).toBe(403)
  expect((await atenderConexao({ ...pedido, autorizacao: null }, porta(), ambiente)).status).toBe(401)
  expect(pedidos).toEqual([])
})
