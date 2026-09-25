import { describe, expect, test } from 'vitest'

import { derivarSegredoDeFerramenta } from '../segredo-de-ferramenta.ts'

import {
  contaDoEndereco,
  derivarSegredoDoInicio,
  enderecoDoWebhook,
  segredoDoInicioConfere,
} from './webhooks-da-conta.ts'

const CONTA = '11111111-1111-4111-8111-111111111111'
const OUTRA = '22222222-2222-4222-8222-222222222222'
const CHAVE = 'chave-do-servidor-desta-instalacao'
const ANTERIOR = 'chave-do-servidor-de-antes'
const AGORA = Date.parse('2026-10-01T12:00:00Z')

describe('segredo do início', () => {
  test('é derivado por conta e não é o x-tool-secret da conta', async () => {
    const doInicio = await derivarSegredoDoInicio(CHAVE, CONTA)
    expect(doInicio).toMatch(/^[0-9a-f]{64}$/)
    expect(doInicio).not.toBe(await derivarSegredoDeFerramenta(CHAVE, CONTA))
    expect(doInicio).not.toBe(await derivarSegredoDoInicio(CHAVE, OUTRA))
  })

  test('confere com o segredo da conta indicada, e só com ele', async () => {
    const segredo = await derivarSegredoDoInicio(CHAVE, CONTA)
    const chaves = { vigente: CHAVE }
    await expect(segredoDoInicioConfere({ cabecalho: segredo, contaId: CONTA, chaves })).resolves.toBe(true)
    await expect(segredoDoInicioConfere({ cabecalho: segredo, contaId: OUTRA, chaves })).resolves.toBe(false)
    await expect(segredoDoInicioConfere({ cabecalho: null, contaId: CONTA, chaves })).resolves.toBe(false)
    await expect(
      segredoDoInicioConfere({ cabecalho: await derivarSegredoDeFerramenta(CHAVE, CONTA), contaId: CONTA, chaves }),
    ).resolves.toBe(false)
  })

  test('sem chave do servidor, nada confere', async () => {
    const segredo = await derivarSegredoDoInicio(CHAVE, CONTA)
    await expect(
      segredoDoInicioConfere({ cabecalho: segredo, contaId: CONTA, chaves: { vigente: '' } }),
    ).resolves.toBe(false)
  })

  test('a chave anterior confere dentro das 24 h da rotação, e não depois', async () => {
    const velho = await derivarSegredoDoInicio(ANTERIOR, CONTA)
    const chaves = { vigente: CHAVE, anterior: ANTERIOR, rotacionadaEm: AGORA - 60_000 }
    await expect(
      segredoDoInicioConfere({ cabecalho: velho, contaId: CONTA, chaves, agora: () => AGORA }),
    ).resolves.toBe(true)
    await expect(
      segredoDoInicioConfere({
        cabecalho: velho,
        contaId: CONTA,
        chaves,
        agora: () => AGORA + 25 * 60 * 60 * 1000,
      }),
    ).resolves.toBe(false)
  })
})

describe('endereço por conta', () => {
  test('o endereço leva a conta, e a leitura devolve a mesma conta', () => {
    const endereco = enderecoDoWebhook('https://projeto.supabase.co/functions/v1/', 'call-events', CONTA)
    expect(endereco).toBe(`https://projeto.supabase.co/functions/v1/call-events?conta=${CONTA}`)
    expect(contaDoEndereco(endereco)).toBe(CONTA)
  })

  test('conta ausente ou sem forma de uuid é nula', () => {
    expect(contaDoEndereco('https://projeto.supabase.co/functions/v1/call-init')).toBeNull()
    expect(contaDoEndereco('https://projeto.supabase.co/functions/v1/call-init?conta=abc')).toBeNull()
    expect(contaDoEndereco("https://x.co/call-init?conta=1' or '1'='1")).toBeNull()
    expect(contaDoEndereco('não é endereço')).toBeNull()
  })
})
