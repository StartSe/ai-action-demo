import { expect, test } from 'vitest'

import { derivarSegredoDoInicio } from '../provedor/webhooks-da-conta.ts'
import { derivarSegredo } from '../tools/segredo.ts'

import { contaDoEnderecoDoWhatsapp, derivarChaveDoWhatsapp, enderecoDoWebhookDoWhatsapp } from './endereco.ts'

const CHAVE = 'chave-do-servidor-de-teste'
const CONTA = '11111111-2222-4333-8444-555555555555'
const OUTRA = '99999999-2222-4333-8444-555555555555'
const BASE = 'https://projeto.supabase.co/functions/v1/'

test('o endereço cadastrado prova a conta dele', async () => {
  const endereco = await enderecoDoWebhookDoWhatsapp(BASE, CHAVE, CONTA)
  expect(endereco).toMatch(/^https:\/\/projeto\.supabase\.co\/functions\/v1\/whatsapp-inbound\?conta=/)
  expect(await contaDoEnderecoDoWhatsapp(endereco, { vigente: CHAVE })).toBe(CONTA)
})

test('o segredo não é o x-tool-secret nem o do início da voz', async () => {
  const doWhatsapp = await derivarChaveDoWhatsapp(CHAVE, CONTA)
  expect(doWhatsapp).not.toBe(await derivarSegredo(CHAVE, CONTA))
  expect(doWhatsapp).not.toBe(await derivarSegredoDoInicio(CHAVE, CONTA))
})

test('tudo errado é a mesma recusa', async () => {
  const valido = new URL(await enderecoDoWebhookDoWhatsapp(BASE, CHAVE, CONTA))
  const chave = valido.searchParams.get('chave')!
  const casos = [
    `${BASE}whatsapp-inbound`,
    `${BASE}whatsapp-inbound?conta=${CONTA}`,
    `${BASE}whatsapp-inbound?conta=nao-uuid&chave=${chave}`,
    `${BASE}whatsapp-inbound?conta=${CONTA}&chave=abc`,
    `${BASE}whatsapp-inbound?conta=${OUTRA}&chave=${chave}`,
    `${BASE}whatsapp-inbound?conta=${CONTA}&chave=${'0'.repeat(64)}`,
    'nem-url',
  ]
  for (const caso of casos) expect(await contaDoEnderecoDoWhatsapp(caso, { vigente: CHAVE }), caso).toBeNull()
})

test('a instalação sem chave fecha o webhook', async () => {
  const endereco = await enderecoDoWebhookDoWhatsapp(BASE, CHAVE, CONTA)
  expect(await contaDoEnderecoDoWhatsapp(endereco, { vigente: '' })).toBeNull()
})

test('a chave anterior confere por 24 h depois da rotação', async () => {
  const endereco = await enderecoDoWebhookDoWhatsapp(BASE, 'chave-velha', CONTA)
  const rotacionadaEm = Date.parse('2026-10-01T12:00:00Z')
  const chaves = { vigente: CHAVE, anterior: 'chave-velha', rotacionadaEm }
  expect(await contaDoEnderecoDoWhatsapp(endereco, chaves, () => rotacionadaEm + 3_600_000)).toBe(CONTA)
  expect(await contaDoEnderecoDoWhatsapp(endereco, chaves, () => rotacionadaEm + 25 * 3_600_000)).toBeNull()
})
