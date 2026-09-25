// cron-meeting-reminder com a camada de dados dublada. O dublê de
// `enfileirarLembretes` é `enfileirar_lembretes_de_reuniao` ao pé da letra: a
// regra de janela do módulo portável, a marca como reivindicação e o teto. A
// rede do SQL (skip locked, único da fila) se prova em
// `testes/banco/lembrete-de-reuniao.test.ts`.

import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'vitest'

import { motivoDoLembrete, type ReuniaoParaLembrete } from '../_shared/automacao/lembrete-de-reuniao.ts'
import { JANELA_DO_LEMBRETE_PADRAO } from '../_shared/automacao/padroes.ts'
import type { LinhaDeFim, LinhaDeInicio, PortaDeExecucao } from '../_shared/rotinas/execucao.ts'

import { NOME_DA_ROTINA, atenderRotina, lembrarReunioes, type LembreteEnfileirado, type PortaDoLembrete } from './rotina.ts'

const AGORA = Date.parse('2026-10-05T13:00:00.000Z')
const CONTA = 'abcdef00-0000-4000-8000-00000000c0a1'
const SEGREDO = 'segredo-interno-da-instalacao'

class Duble implements PortaDoLembrete {
  readonly reunioes = new Map<string, ReuniaoParaLembrete>()
  readonly fila: string[] = []
  readonly chamadas: Array<{ instante: string; limite: number }> = []
  falha: Error | null = null

  adicionar(id: string, minutos: number): void {
    this.reunioes.set(id, {
      id,
      status: 'scheduled',
      startsAt: new Date(AGORA + minutos * 60_000).toISOString(),
      reminderSentAt: null,
      telefoneDoLead: '+5511990000001',
      fusoDoLead: null,
    })
  }

  async enfileirarLembretes(instante: string, limite: number): Promise<readonly LembreteEnfileirado[]> {
    this.chamadas.push({ instante, limite })
    if (this.falha) throw this.falha
    const agora = Date.parse(instante)
    const entraram: LembreteEnfileirado[] = []
    for (const reuniao of this.reunioes.values()) {
      if (entraram.length >= limite) break
      if (motivoDoLembrete(reuniao, agora, JANELA_DO_LEMBRETE_PADRAO) !== 'na_janela') continue
      this.reunioes.set(reuniao.id, { ...reuniao, reminderSentAt: instante })
      if (!this.fila.includes(reuniao.id)) {
        this.fila.push(reuniao.id)
        entraram.push({ meeting_id: reuniao.id, account_id: CONTA })
      }
    }
    return entraram
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
    const linha = this.linhas.find((l) => l.id === id)!
    Object.assign(linha, fim)
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

describe('lembrarReunioes', () => {
  test('chama o RPC uma vez, grava job_runs no começo e no fim e propaga a contagem', async () => {
    const { porta, execucao, pedido } = montar()
    porta.adicionar('r-20', 20)
    porta.adicionar('r-120', 120)
    const resultado = await lembrarReunioes(pedido)

    expect(resultado).toMatchObject({ ok: true, itens: 1 })
    expect(porta.chamadas).toEqual([{ instante: new Date(AGORA).toISOString(), limite: 25 }])
    expect(execucao.linhas).toHaveLength(1)
    expect(execucao.linhas[0]).toMatchObject({ routine: NOME_DA_ROTINA, items: 1, error: null })
    expect(execucao.linhas[0]!.finished_at).toBeDefined()
    expect(porta.fila).toEqual(['r-20'])
  })

  test('duas execuções em sequência: duas linhas em job_runs e um item só na fila', async () => {
    const { porta, execucao, pedido } = montar()
    porta.adicionar('r-15', 15)
    await lembrarReunioes(pedido)
    const segunda = await lembrarReunioes(pedido)
    expect(segunda).toMatchObject({ ok: true, itens: 0 })
    expect(execucao.linhas.map((l) => l.items)).toEqual([1, 0])
    expect(porta.fila).toEqual(['r-15'])
  })

  test('a falha do RPC vira job_runs com error, sem exceção', async () => {
    const { porta, execucao, pedido } = montar()
    porta.falha = new Error('banco fora do ar')
    const resultado = await lembrarReunioes(pedido)
    expect(resultado).toMatchObject({ ok: false, erro: 'banco fora do ar' })
    expect(execucao.linhas[0]).toMatchObject({ error: 'banco fora do ar', items: 0 })
    expect(execucao.linhas[0]!.finished_at).toBeDefined()
  })

  test('volume acima de três vezes a média acende o alarme da execução (R-09)', async () => {
    const { porta, execucao, pedido } = montar()
    execucao.historico = [1, 1, 1]
    for (let i = 0; i < 10; i += 1) porta.adicionar(`r-${i}`, 10 + i)
    const resultado = await lembrarReunioes(pedido)
    expect(resultado).toMatchObject({ ok: true, itens: 10, alarme: true, media: 1 })
    expect(execucao.linhas[0]).toMatchObject({ volume_alert: true, volume_baseline: 1 })
  })
})

describe('a borda', () => {
  test('sem o segredo, 401 e nenhuma porta tocada', async () => {
    const { porta, execucao, pedido } = montar()
    const resposta = await atenderRotina({ metodo: 'POST', segredo: null }, pedido, { segredoInterno: SEGREDO })
    expect(resposta.status).toBe(401)
    expect(porta.chamadas).toEqual([])
    expect(execucao.linhas).toEqual([])
  })

  test('instalação sem segredo fecha o portão, mesmo com cabeçalho', async () => {
    const { porta, pedido } = montar()
    const resposta = await atenderRotina({ metodo: 'POST', segredo: 'qualquer' }, pedido, { segredoInterno: '' })
    expect(resposta.status).toBe(401)
    expect(porta.chamadas).toEqual([])
  })

  test('com o segredo, 200 e o resultado no corpo; erro da função é 500', async () => {
    const { porta, pedido } = montar()
    porta.adicionar('r', 10)
    const ok = await atenderRotina({ metodo: 'POST', segredo: SEGREDO }, pedido, { segredoInterno: SEGREDO })
    expect(ok).toMatchObject({ status: 200, corpo: { ok: true, itens: 1 } })
    porta.falha = new Error('caiu')
    const erro = await atenderRotina({ metodo: 'POST', segredo: SEGREDO }, pedido, { segredoInterno: SEGREDO })
    expect(erro.status).toBe(500)
  })

  test('método diferente de POST é 405', async () => {
    const { pedido } = montar()
    expect((await atenderRotina({ metodo: 'GET', segredo: SEGREDO }, pedido, { segredoInterno: SEGREDO })).status).toBe(405)
  })

  test('a rotina nunca disca: nenhum caminho para call-place', async () => {
    for (const arquivo of ['rotina.ts', 'index.ts']) {
      const codigo = await readFile(new URL(`./${arquivo}`, import.meta.url), 'utf8')
      const semComentario = codigo.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(semComentario, arquivo).not.toMatch(/call-place/)
    }
  })
})
