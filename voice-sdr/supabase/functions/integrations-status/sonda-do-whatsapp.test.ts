// A sonda do WhatsApp (Z-API) nos quatro estados de sempre, com a rede dublada
// pelas fixtures de `_shared/whatsapp/zapi-exemplos.ts`.

import { expect, test } from 'vitest'

import { eFalhaDoProvedor, traduzirErroDoProvedor } from '../_shared/provedor/erros.ts'
import {
  INSTANCIA_CONECTADA,
  INSTANCIA_DESCONECTADA,
  RECUSA_DO_CLIENT_TOKEN,
} from '../_shared/whatsapp/zapi-exemplos.ts'

import { provedorPorId } from './provedores.ts'
import { sondarProvedor, type Buscar } from './sondas.ts'

const CREDENCIAIS = { instance_id: 'INST', token: 'TOK-DA-INSTANCIA', client_token: 'SEGURANCA' }

function responder(status: number, corpo: unknown): { buscar: Buscar; pedidos: { url: string; init: RequestInit }[] } {
  const pedidos: { url: string; init: RequestInit }[] = []
  return {
    pedidos,
    buscar: async (url, init) => {
      pedidos.push({ url, init })
      return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
    },
  }
}

/** O estado que `estado.ts` daria a esta resposta de sonda. */
async function estadoDe(status: number, corpo: unknown): Promise<string> {
  const resposta = await sondarProvedor('whatsapp', CREDENCIAIS, responder(status, corpo).buscar)
  if (resposta.ok) return 'conectado'
  const { motivo } = traduzirErroDoProvedor(resposta.codigo, resposta.status)
  return eFalhaDoProvedor(motivo) ? 'indisponivel' : `erro:${motivo}`
}

test('o catálogo tem o WhatsApp com as três chaves da conta', () => {
  const provedor = provedorPorId('whatsapp')
  expect(provedor?.rotulo).toBe('WhatsApp (Z-API)')
  expect(provedor?.chaves).toEqual(['instance_id', 'token', 'client_token'])
  expect(provedor?.rotulosDeChave).toEqual({
    instance_id: 'ID da instância',
    token: 'Token da instância',
    client_token: 'Token de segurança da conta',
  })
})

test('a sonda lê o status da instância com o token de segurança no cabeçalho', async () => {
  const rede = responder(200, INSTANCIA_CONECTADA)
  await sondarProvedor('whatsapp', CREDENCIAIS, rede.buscar)
  expect(rede.pedidos).toHaveLength(1)
  expect(rede.pedidos[0]!.url).toBe('https://api.z-api.io/instances/INST/token/TOK-DA-INSTANCIA/status')
  expect(rede.pedidos[0]!.init.headers).toMatchObject({ 'client-token': 'SEGURANCA' })
})

test('os quatro estados', async () => {
  expect(await estadoDe(200, INSTANCIA_CONECTADA)).toBe('conectado')
  expect(await estadoDe(200, INSTANCIA_DESCONECTADA)).toBe('erro:sessao_desconectada')
  expect(await estadoDe(400, RECUSA_DO_CLIENT_TOKEN)).toBe('erro:chave_invalida')
  expect(await estadoDe(503, {})).toBe('indisponivel')
})

test('a frase da instância desconectada manda ler o QR code e não cita o código', async () => {
  const resposta = await sondarProvedor('whatsapp', CREDENCIAIS, responder(200, INSTANCIA_DESCONECTADA).buscar)
  const { mensagem } = traduzirErroDoProvedor(resposta.codigo, resposta.status)
  expect(mensagem).toMatch(/QR code/)
  expect(mensagem).not.toContain(String(resposta.codigo))
})
