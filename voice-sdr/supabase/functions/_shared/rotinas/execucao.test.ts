// O envelope das rotinas agendadas: job_runs no início e no fim, o fim gravado
// também no erro, o teto de 25 itens, a segunda execução sem duplicar e o
// alarme de volume em três vezes a média móvel.
//
// A porta é um `job_runs` em memória que empilha cada escrita, e a fila é um
// dublê com o comportamento que o contrato de `reivindicar` exige: o item sai
// do estado pendente quando é reivindicado. A contagem das chamadas a
// `processar` é a prova de efeito — asserção sobre o resultado final passaria
// com uma versão que refaz tudo.

import { describe, expect, test } from 'vitest'

import {
  avaliarVolume,
  executarRotina,
  TETO_DE_ITENS,
  type ItemDaRotina,
  type LinhaDeFim,
  type LinhaDeInicio,
  type PortaDeExecucao,
  type TrabalhoDaRotina,
} from './execucao.ts'

interface Linha extends LinhaDeInicio {
  readonly id: string
  fim?: LinhaDeFim
}

/** `job_runs` em memória, com o registro de cada escrita na ordem. */
function criarPorta(historico: readonly number[] = []) {
  const linhas: Linha[] = []
  const escritas: string[] = []
  const porta: PortaDeExecucao = {
    async inserirExecucao(linha) {
      escritas.push('inicio')
      const id = `execucao-${linhas.length + 1}`
      linhas.push({ ...linha, id })
      return id
    },
    async concluirExecucao(id, fim) {
      escritas.push('fim')
      const linha = linhas.find((candidata) => candidata.id === id)
      if (!linha) throw new Error(`execução ${id} não existe`)
      linha.fim = fim
    },
    async itensDasUltimasExecucoes(rotina, quantas) {
      const anteriores = linhas
        .filter((linha) => linha.routine === rotina && linha.fim && linha.fim.error === null)
        .map((linha) => linha.fim!.items)
        .reverse()
      return [...anteriores, ...historico].slice(0, quantas)
    },
  }
  return { porta, linhas, escritas }
}

interface Item extends ItemDaRotina {
  readonly numero: number
}

/** Fila que tira o item do pendente ao reivindicar, como o SQL com skip locked. */
function criarFila(quantos: number) {
  const pendentes: Item[] = Array.from({ length: quantos }, (_, indice) => ({
    chave: `item-${indice + 1}`,
    numero: indice + 1,
  }))
  const processados: string[] = []
  const trabalho: TrabalhoDaRotina<Item> = {
    async reivindicar(limite) {
      return pendentes.splice(0, limite)
    },
    async processar(item) {
      processados.push(item.chave)
    },
  }
  return { trabalho, processados, pendentes }
}

const RELOGIO = Date.parse('2026-09-23T12:00:00.000Z')

function relogioQueAnda() {
  let passo = 0
  return () => RELOGIO + 1_000 * passo++
}

describe('job_runs no início e no fim', () => {
  test('grava o início antes de reivindicar e o fim depois de processar', async () => {
    const { porta, linhas, escritas } = criarPorta()
    const ordem: string[] = []
    const trabalho: TrabalhoDaRotina<Item> = {
      async reivindicar() {
        ordem.push(`reivindicar depois de ${escritas.join(',')}`)
        return [{ chave: 'a', numero: 1 }]
      },
      async processar() {
        ordem.push('processar')
      },
    }

    const resultado = await executarRotina({ nome: 'cron-dial', porta, trabalho, agora: relogioQueAnda() })

    expect(ordem).toEqual(['reivindicar depois de inicio', 'processar'])
    expect(escritas).toEqual(['inicio', 'fim'])
    expect(linhas).toEqual([
      {
        id: 'execucao-1',
        routine: 'cron-dial',
        started_at: '2026-09-23T12:00:00.000Z',
        account_id: null,
        fim: {
          finished_at: '2026-09-23T12:00:01.000Z',
          items: 1,
          error: null,
          volume_alert: false,
          volume_baseline: null,
        },
      },
    ])
    expect(resultado).toEqual({ ok: true, execucaoId: 'execucao-1', itens: 1, alarme: false, media: null })
  })

  test('sem o início gravado nada é processado', async () => {
    const { porta } = criarPorta()
    const { trabalho, processados } = criarFila(3)
    porta.inserirExecucao = async () => {
      throw new Error('banco fora')
    }

    await expect(executarRotina({ nome: 'cron-dial', porta, trabalho })).rejects.toThrow('banco fora')
    expect(processados).toEqual([])
  })
})

describe('o fim gravado no caminho de erro', () => {
  test('erro no meio do processamento grava o fim com a mensagem e os itens já feitos', async () => {
    const { porta, linhas } = criarPorta()
    const { trabalho, processados } = criarFila(5)
    const processar = trabalho.processar
    trabalho.processar = async (item, instante) => {
      if (item.numero === 3) throw new Error('provedor recusou o item 3')
      await processar(item, instante)
    }

    const resultado = await executarRotina({ nome: 'cron-dial', porta, trabalho, agora: relogioQueAnda() })

    expect(processados).toEqual(['item-1', 'item-2'])
    expect(linhas[0]?.fim).toEqual({
      finished_at: '2026-09-23T12:00:01.000Z',
      items: 2,
      error: 'provedor recusou o item 3',
      volume_alert: false,
      volume_baseline: null,
    })
    expect(resultado).toEqual({ ok: false, execucaoId: 'execucao-1', itens: 2, erro: 'provedor recusou o item 3' })
  })

  test('erro na reivindicação também grava o fim', async () => {
    const { porta, linhas } = criarPorta()
    const trabalho: TrabalhoDaRotina<Item> = {
      async reivindicar() {
        throw new Error('lock timeout')
      },
      async processar() {},
    }

    const resultado = await executarRotina({ nome: 'cron-retention', porta, trabalho })

    expect(linhas[0]?.fim?.finished_at).toEqual(expect.any(String))
    expect(linhas[0]?.fim?.error).toBe('lock timeout')
    expect(resultado.ok).toBe(false)
  })

  test('erro ao ler a média móvel também grava o fim', async () => {
    const { porta, linhas } = criarPorta()
    const { trabalho } = criarFila(2)
    porta.itensDasUltimasExecucoes = async () => {
      throw new Error('consulta do histórico caiu')
    }

    await executarRotina({ nome: 'cron-dial', porta, trabalho })

    expect(linhas[0]?.fim).toMatchObject({ items: 2, error: 'consulta do histórico caiu' })
  })

  test('erro sem mensagem não grava error vazio, que a tela leria como sucesso', async () => {
    const { porta, linhas } = criarPorta()
    const trabalho: TrabalhoDaRotina<Item> = {
      async reivindicar() {
        throw new Error('')
      },
      async processar() {},
    }

    await executarRotina({ nome: 'cron-dial', porta, trabalho })

    expect(linhas[0]?.fim?.error).toBe('erro sem mensagem')
  })
})

describe('o teto de 25 itens', () => {
  test('a reivindicação recebe o teto e a execução processa no máximo 25', async () => {
    const { porta, linhas } = criarPorta()
    const { trabalho, processados, pendentes } = criarFila(30)
    const limites: number[] = []
    const reivindicar = trabalho.reivindicar
    trabalho.reivindicar = async (limite, instante) => {
      limites.push(limite)
      return reivindicar(limite, instante)
    }

    await executarRotina({ nome: 'cron-dial', porta, trabalho })

    expect(TETO_DE_ITENS).toBe(25)
    expect(limites).toEqual([25])
    expect(processados).toHaveLength(25)
    expect(pendentes).toHaveLength(5)
    expect(linhas[0]?.fim?.items).toBe(25)
  })

  test('reivindicação que devolve mais que o teto derruba a execução sem processar nenhum', async () => {
    const { porta, linhas } = criarPorta()
    const processados: string[] = []
    const trabalho: TrabalhoDaRotina<Item> = {
      async reivindicar() {
        return Array.from({ length: 26 }, (_, indice) => ({ chave: `x-${indice}`, numero: indice }))
      },
      async processar(item) {
        processados.push(item.chave)
      },
    }

    const resultado = await executarRotina({ nome: 'cron-dial', porta, trabalho })

    expect(processados).toEqual([])
    expect(resultado.ok).toBe(false)
    expect(linhas[0]?.fim?.error).toMatch(/26 itens com teto de 25/)
  })

  test('a rotina pode pedir teto menor, e a reivindicação e o corte o seguem', async () => {
    const { porta, linhas } = criarPorta()
    const { trabalho, processados, pendentes } = criarFila(12)
    const limites: number[] = []
    const reivindicar = trabalho.reivindicar
    trabalho.reivindicar = async (limite, instante) => {
      limites.push(limite)
      return reivindicar(limite, instante)
    }

    await executarRotina({ nome: 'cron-meeting-reminder', porta, trabalho, teto: 5 })

    expect(limites).toEqual([5])
    expect(processados).toHaveLength(5)
    expect(pendentes).toHaveLength(7)
    expect(linhas[0]?.fim?.items).toBe(5)
  })

  test('teto maior que 25, zero ou fracionário é recusado antes do início gravado', async () => {
    for (const teto of [26, 0, 2.5]) {
      const { porta, escritas } = criarPorta()
      const { trabalho, processados } = criarFila(3)

      await expect(executarRotina({ nome: 'cron-dial', porta, trabalho, teto })).rejects.toThrow(
        RangeError,
      )
      expect(escritas).toEqual([])
      expect(processados).toEqual([])
    }
  })

  test('reivindicação que devolve mais que um teto menor também derruba a execução', async () => {
    const { porta, linhas } = criarPorta()
    const processados: string[] = []
    const trabalho: TrabalhoDaRotina<Item> = {
      async reivindicar() {
        return Array.from({ length: 6 }, (_, indice) => ({ chave: `x-${indice}`, numero: indice }))
      },
      async processar(item) {
        processados.push(item.chave)
      },
    }

    const resultado = await executarRotina({ nome: 'cron-dial', porta, trabalho, teto: 5 })

    expect(processados).toEqual([])
    expect(resultado.ok).toBe(false)
    expect(linhas[0]?.fim?.error).toMatch(/6 itens com teto de 5/)
  })

  test('o atraso acumulado sai em ondas de 25', async () => {
    const { porta, linhas } = criarPorta()
    const { trabalho } = criarFila(60)

    for (let vez = 0; vez < 4; vez += 1) {
      await executarRotina({ nome: 'cron-dial', porta, trabalho })
    }

    expect(linhas.map((linha) => linha.fim?.items)).toEqual([25, 25, 10, 0])
  })
})

describe('idempotência', () => {
  test('a segunda execução em sequência não duplica efeito', async () => {
    const { porta, linhas } = criarPorta()
    const { trabalho, processados } = criarFila(7)

    await executarRotina({ nome: 'cron-speed-to-lead', porta, trabalho })
    await executarRotina({ nome: 'cron-speed-to-lead', porta, trabalho })

    expect(processados).toHaveLength(7)
    expect(new Set(processados).size).toBe(7)
    // Duas execuções são duas linhas em job_runs, e a segunda não achou nada.
    expect(linhas.map((linha) => linha.fim?.items)).toEqual([7, 0])
  })

  test('a mesma chave devolvida duas vezes na mesma reivindicação é processada uma vez', async () => {
    const { porta, linhas } = criarPorta()
    const processados: string[] = []
    const trabalho: TrabalhoDaRotina<Item> = {
      async reivindicar() {
        return [
          { chave: 'lead-1', numero: 1 },
          { chave: 'lead-1', numero: 1 },
          { chave: 'lead-2', numero: 2 },
        ]
      },
      async processar(item) {
        processados.push(item.chave)
      },
    }

    await executarRotina({ nome: 'cron-speed-to-lead', porta, trabalho })

    expect(processados).toEqual(['lead-1', 'lead-2'])
    expect(linhas[0]?.fim?.items).toBe(2)
  })
})

describe('alarme de volume (R-09)', () => {
  test('dispara em 3,1 vezes a média e não em 2,9', () => {
    expect(avaliarVolume(31, [10, 10, 10])).toEqual({ alarme: true, media: 10 })
    expect(avaliarVolume(29, [10, 10, 10])).toEqual({ alarme: false, media: 10 })
  })

  test('exatamente três vezes a média não dispara: a regra é passar de três', () => {
    expect(avaliarVolume(30, [10, 10])).toEqual({ alarme: false, media: 10 })
  })

  test('sem histórico não há alarme, e a média sai nula', () => {
    expect(avaliarVolume(25, [])).toEqual({ alarme: false, media: null })
  })

  test('média zero não alarma no primeiro item de uma rotina ociosa', () => {
    expect(avaliarVolume(1, [0, 0, 0])).toEqual({ alarme: false, media: 0 })
  })

  test('a execução acima de três vezes a média sai com a marca e a média em job_runs', async () => {
    const { porta, linhas } = criarPorta([5, 5, 5, 5])
    const { trabalho } = criarFila(16)

    const resultado = await executarRotina({ nome: 'cron-speed-to-lead', porta, trabalho })

    expect(linhas[0]?.fim).toMatchObject({ items: 16, volume_alert: true, volume_baseline: 5 })
    expect(resultado).toMatchObject({ ok: true, alarme: true, media: 5 })
  })

  test('a execução abaixo de três vezes a média sai sem a marca', async () => {
    const { porta, linhas } = criarPorta([5, 5, 5, 5])
    const { trabalho } = criarFila(14)

    await executarRotina({ nome: 'cron-speed-to-lead', porta, trabalho })

    expect(linhas[0]?.fim).toMatchObject({ items: 14, volume_alert: false, volume_baseline: 5 })
  })

  test('a média pede à porta as dez últimas da mesma rotina, anteriores ao início desta', async () => {
    const { porta } = criarPorta()
    const { trabalho } = criarFila(1)
    const pedidos: unknown[] = []
    porta.itensDasUltimasExecucoes = async (...argumentos) => {
      pedidos.push(argumentos)
      return []
    }

    await executarRotina({ nome: 'cron-cost-sync', porta, trabalho, agora: () => RELOGIO })

    expect(pedidos).toEqual([['cron-cost-sync', 10, '2026-09-23T12:00:00.000Z']])
  })
})
