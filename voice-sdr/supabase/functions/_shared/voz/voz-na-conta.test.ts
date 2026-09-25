// A conferência da voz na conta, com o provedor dublado por um `fetch` que
// registra cada ida. O que se prova: voz da conta não vai à biblioteca; voz da
// biblioteca é achada pelo identificador (nome igual de outra não conta) e
// adicionada; e provedor fora do ar nunca vira "fora da biblioteca".

import { describe, expect, it } from 'vitest'

import { garantirVozNaConta } from './voz-na-conta.ts'

type Resposta = { status: number; corpo?: unknown }

function provedor(respostas: Record<string, Resposta>) {
  const idas: { endereco: string; metodo: string; corpo: string | null }[] = []
  async function buscar(endereco: string, opcoes: RequestInit) {
    idas.push({ endereco, metodo: opcoes.method ?? 'GET', corpo: (opcoes.body as string) ?? null })
    const chave = Object.keys(respostas).find((trecho) => endereco.includes(trecho))
    const resposta = chave ? respostas[chave]! : { status: 500 }
    return new Response(JSON.stringify(resposta.corpo ?? {}), { status: resposta.status })
  }
  return { idas, buscar }
}

const PEDIDO = { chave: 'xi-chave', vozId: 'czvzJwIVS2asEKnthV40', nome: 'Daniel' }

describe('garantirVozNaConta', () => {
  it('voz que a conta já tem não vai à biblioteca', async () => {
    const { idas, buscar } = provedor({ '/voices/czvz': { status: 200 } })
    expect(await garantirVozNaConta(PEDIDO, buscar)).toEqual({ estado: 'na_conta', vozId: PEDIDO.vozId })
    expect(idas).toHaveLength(1)
  })

  it('voz da biblioteca é achada pelo identificador e adicionada com o nome dela', async () => {
    const { idas, buscar } = provedor({
      '/voices/add/dono-1/czvz': { status: 200, corpo: { voice_id: PEDIDO.vozId } },
      '/voices/czvz': { status: 400 },
      '/shared-voices': {
        status: 200,
        corpo: {
          voices: [
            { voice_id: 'outraVozComMesmoNome1', public_owner_id: 'dono-2', name: 'Daniel' },
            { voice_id: PEDIDO.vozId, public_owner_id: 'dono-1', name: 'Daniel - Brazilian' },
          ],
        },
      },
    })
    expect(await garantirVozNaConta(PEDIDO, buscar)).toEqual({ estado: 'adicionada', vozId: PEDIDO.vozId })
    expect(idas[1]?.endereco).toContain('search=Daniel')
    expect(idas[2]).toMatchObject({ metodo: 'POST', corpo: JSON.stringify({ new_name: 'Daniel - Brazilian' }) })
  })

  it('fora da biblioteca, diz isso e não adiciona nada', async () => {
    const { idas, buscar } = provedor({
      '/voices/czvz': { status: 404 },
      '/shared-voices': { status: 200, corpo: { voices: [{ voice_id: 'outra', public_owner_id: 'x' }] } },
    })
    expect(await garantirVozNaConta(PEDIDO, buscar)).toEqual({ estado: 'fora_da_biblioteca' })
    expect(idas.some((ida) => ida.metodo === 'POST')).toBe(false)
  })

  it('provedor fora do ar é indisponível, nunca fora da biblioteca', async () => {
    const { buscar } = provedor({ '/voices/czvz': { status: 503 } })
    expect(await garantirVozNaConta(PEDIDO, buscar)).toEqual({ estado: 'indisponivel' })
    const quebrado = async () => {
      throw new Error('rede')
    }
    expect(await garantirVozNaConta(PEDIDO, quebrado)).toEqual({ estado: 'indisponivel' })
  })
})
