import { describe, expect, test, vi } from 'vitest'

import {
  lerSegredoDoCofre,
  leitorDoSegredoInterno,
  RPC_DO_SEGREDO_INTERNO,
  VALIDADE_DO_SEGREDO_MS,
} from './segredo-interno.ts'

describe('leitorDoSegredoInterno', () => {
  test('a variável definida vence, e o cofre nem é lido', async () => {
    const lerDoCofre = vi.fn(async () => 'do-cofre')
    const ler = leitorDoSegredoInterno({ definido: '  da-variavel ', lerDoCofre })
    expect(await ler()).toBe('da-variavel')
    expect(lerDoCofre).not.toHaveBeenCalled()
  })

  test('sem variável, lê o cofre uma vez e guarda pelo prazo', async () => {
    let agora = 1_000
    const lerDoCofre = vi.fn(async () => 'do-cofre')
    const ler = leitorDoSegredoInterno({ definido: undefined, lerDoCofre, agora: () => agora })

    expect(await ler()).toBe('do-cofre')
    agora += VALIDADE_DO_SEGREDO_MS - 1
    expect(await ler()).toBe('do-cofre')
    expect(lerDoCofre).toHaveBeenCalledTimes(1)

    agora += 1
    await ler()
    expect(lerDoCofre).toHaveBeenCalledTimes(2)
  })

  test('pedidos simultâneos dividem a mesma leitura', async () => {
    const lerDoCofre = vi.fn(async () => 'do-cofre')
    const ler = leitorDoSegredoInterno({ definido: '', lerDoCofre })
    const valores = await Promise.all([ler(), ler(), ler()])
    expect(valores).toEqual(['do-cofre', 'do-cofre', 'do-cofre'])
    expect(lerDoCofre).toHaveBeenCalledTimes(1)
  })

  test('cofre que falha devolve vazio, que fecha o portão, e a falha não fica guardada', async () => {
    const lerDoCofre = vi
      .fn<() => Promise<string | null>>()
      .mockRejectedValueOnce(new Error('sem rede'))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('enfim')
    const ler = leitorDoSegredoInterno({ definido: null, lerDoCofre })
    expect(await ler()).toBe('')
    expect(await ler()).toBe('')
    expect(await ler()).toBe('enfim')
  })
})

describe('lerSegredoDoCofre', () => {
  test('chama o RPC do segredo e devolve o texto', async () => {
    const rpc = vi.fn(async () => ({ data: 'valor', error: null }))
    expect(await lerSegredoDoCofre({ rpc })).toBe('valor')
    expect(rpc).toHaveBeenCalledWith(RPC_DO_SEGREDO_INTERNO)
  })

  test('erro do RPC estoura, e o leitor o transforma em vazio', async () => {
    const rpc = async () => ({ data: null, error: { message: 'permission denied' } })
    await expect(lerSegredoDoCofre({ rpc })).rejects.toThrow('permission denied')
    const ler = leitorDoSegredoInterno({ definido: '', lerDoCofre: () => lerSegredoDoCofre({ rpc }) })
    expect(await ler()).toBe('')
  })
})
