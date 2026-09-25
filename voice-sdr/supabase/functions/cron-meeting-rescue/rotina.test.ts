// cron-meeting-rescue com a camada de dados dublada. O dublê de
// `enfileirarResgates` segue `enfileirar_resgates`: só falta atestada, a marca
// como reivindicação e o teto da passagem. A regra de verdade (T-17, teto,
// recuo, esgotamento) se prova em testes/banco/resgate-de-falta.test.ts e
// testes/banco/teto-de-resgate.test.ts.

import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'vitest'

import type { LinhaDeFim, LinhaDeInicio, PortaDeExecucao } from '../_shared/rotinas/execucao.ts'

import { NOME_DA_ROTINA, atenderRotina, resgatarFaltas, type PortaDoResgate, type ResgateDaPassagem } from './rotina.ts'

const AGORA = Date.parse('2026-10-06T13:00:00.000Z')
const CONTA = 'abcdef00-0000-4000-8000-00000000c0a1'
const SEGREDO = 'segredo-interno-da-instalacao'

interface Falta {
  readonly id: string
  atestada: boolean
  resgates: number
}

class Duble implements PortaDoResgate {
  readonly faltas: Falta[] = []
  readonly fila: string[] = []
  readonly chamadas: Array<{ instante: string; limite: number }> = []
  falha: Error | null = null

  async enfileirarResgates(instante: string, limite: number): Promise<readonly ResgateDaPassagem[]> {
    this.chamadas.push({ instante, limite })
    if (this.falha) throw this.falha
    const saida: ResgateDaPassagem[] = []
    for (const falta of this.faltas) {
      if (saida.length >= limite) break
      // T-17 e a marca: só atestada, e uma vez por passagem.
      if (!falta.atestada || falta.resgates > 0) continue
      falta.resgates += 1
      this.fila.push(`${falta.id}:${falta.resgates}`)
      saida.push({ meeting_id: falta.id, account_id: CONTA, acao: 'enfileirado' })
    }
    return saida
  }
}

class Execucoes implements PortaDeExecucao {
  readonly linhas: Array<LinhaDeInicio & Partial<LinhaDeFim> & { id: string }> = []
  historico: number[] = []

  async inserirExecucao(linha: LinhaDeInicio): Promise<string> {
    const id = `exec-${this.linhas.length + 1}`
    this.linhas.push({ ...linha, id })
    return id
  }

  async concluirExecucao(id: string, fim: LinhaDeFim): Promise<void> {
    Object.assign(this.linhas.find((l) => l.id === id)!, fim)
  }

  async itensDasUltimasExecucoes(): Promise<readonly number[]> {
    return this.historico
  }
}

function montar() {
  const porta = new Duble()
  const execucao = new Execucoes()
  return { porta, execucao, pedido: { porta, execucao, agora: () => AGORA } }
}

describe('resgatarFaltas', () => {
  test('uma chamada de RPC por execução, job_runs no começo e no fim, e a contagem', async () => {
    const { porta, execucao, pedido } = montar()
    porta.faltas.push({ id: 'atestada', atestada: true, resgates: 0 }, { id: 'pendente', atestada: false, resgates: 0 })
    const resultado = await resgatarFaltas(pedido)
    expect(resultado).toMatchObject({ ok: true, itens: 1 })
    expect(porta.chamadas).toEqual([{ instante: new Date(AGORA).toISOString(), limite: 25 }])
    expect(execucao.linhas[0]).toMatchObject({ routine: NOME_DA_ROTINA, items: 1, error: null })
    expect(execucao.linhas[0]!.finished_at).toBeDefined()
    expect(porta.fila).toEqual(['atestada:1'])
  })

  test('duas execuções em sequência não duplicam a discagem', async () => {
    const { porta, execucao, pedido } = montar()
    porta.faltas.push({ id: 'f', atestada: true, resgates: 0 })
    await resgatarFaltas(pedido)
    await resgatarFaltas(pedido)
    expect(execucao.linhas.map((l) => l.items)).toEqual([1, 0])
    expect(porta.fila).toEqual(['f:1'])
  })

  test('o enfileirado e o esgotado da mesma reunião contam como dois itens', async () => {
    const { execucao, pedido } = montar()
    const porta: PortaDoResgate = {
      async enfileirarResgates() {
        return [
          { meeting_id: 'r', account_id: CONTA, acao: 'enfileirado' },
          { meeting_id: 'r', account_id: CONTA, acao: 'esgotado' },
        ]
      },
    }
    expect(await resgatarFaltas({ ...pedido, porta })).toMatchObject({ ok: true, itens: 2 })
    expect(execucao.linhas[0]?.items).toBe(2)
  })

  test('a falha do RPC vira job_runs com error, sem exceção', async () => {
    const { porta, execucao, pedido } = montar()
    porta.falha = new Error('banco fora do ar')
    expect(await resgatarFaltas(pedido)).toMatchObject({ ok: false, erro: 'banco fora do ar' })
    expect(execucao.linhas[0]).toMatchObject({ error: 'banco fora do ar' })
    expect(execucao.linhas[0]!.finished_at).toBeDefined()
  })

  test('o alarme de volume é consultado no fechamento (R-09)', async () => {
    const { porta, execucao, pedido } = montar()
    execucao.historico = [1, 1]
    for (let i = 0; i < 5; i += 1) porta.faltas.push({ id: `f${i}`, atestada: true, resgates: 0 })
    expect(await resgatarFaltas(pedido)).toMatchObject({ ok: true, itens: 5, alarme: true, media: 1 })
    expect(execucao.linhas[0]).toMatchObject({ volume_alert: true, volume_baseline: 1 })
  })
})

describe('a borda', () => {
  test('sem o segredo, 401 e nenhuma porta tocada', async () => {
    const { porta, execucao, pedido } = montar()
    expect((await atenderRotina({ metodo: 'POST', segredo: null }, pedido, { segredoInterno: SEGREDO })).status).toBe(401)
    expect(porta.chamadas).toEqual([])
    expect(execucao.linhas).toEqual([])
  })

  test('com o segredo, 200; erro da função, 500', async () => {
    const { porta, pedido } = montar()
    expect((await atenderRotina({ metodo: 'POST', segredo: SEGREDO }, pedido, { segredoInterno: SEGREDO })).status).toBe(200)
    porta.falha = new Error('caiu')
    expect((await atenderRotina({ metodo: 'POST', segredo: SEGREDO }, pedido, { segredoInterno: SEGREDO })).status).toBe(500)
  })

  test('a rotina nunca disca: nenhum caminho para call-place', async () => {
    for (const arquivo of ['rotina.ts', 'index.ts']) {
      const codigo = await readFile(new URL(`./${arquivo}`, import.meta.url), 'utf8')
      const semComentario = codigo.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(semComentario, arquivo).not.toMatch(/call-place/)
    }
  })
})
