// Provas da reaplicação do bloqueio na finalização (US-108, R-02). Sem rede e
// sem banco: a leitura roda sobre as fixtures de `transcricoes-de-exemplo.ts`,
// e a escrita sobre uma porta em memória que implementa o único parcial de
// `dnc_entries` (um bloqueio ativo por número). O efeito no banco de verdade é
// de `testes/banco/reaplicacao-do-bloqueio.test.ts`.
//
// O que este arquivo segura:
//
// 1. **Toda invocação de `tool-dnc` vira pedido**, com erro ou sem: a falha do
//    banco durante a ligação chega como `ok: false`, não como `is_error`.
// 2. **Sem bloqueio, cria**, com a origem vinda do `reason`, as notas dizendo
//    que veio da reaplicação e o instante da promessa; e abre o item da fila.
// 3. **Com bloqueio, não escreve nada**: nem segunda linha, nem instante novo,
//    nem item.
// 4. **Ensaio não toca a porta.**
// 5. **Bloqueio que falha levanta**; item que falha depois do bloqueio fica
//    contado.

import { describe, expect, test } from 'vitest'

import { MOTIVO_GRAVADO, type ItemDeBloqueioNaFila, type PedidoDeBloqueio } from '../tool-dnc/bloqueio.ts'

import { lerConversa } from './formato-do-provedor.ts'
import {
  NOTA_DA_REAPLICACAO,
  notasDaReaplicacao,
  pedidosDeBloqueio,
  reaplicarBloqueios,
  type ChamadaDoBloqueio,
  type PedidoLido,
  type PortaDoBloqueio,
} from './reaplicacao-do-bloqueio.ts'
import { INICIO_DAS_TRANSCRICOES_EM_SEGUNDOS, TRANSCRICOES_DE_EXEMPLO } from './transcricoes-de-exemplo.ts'

const INICIO_MS = INICIO_DAS_TRANSCRICOES_EM_SEGUNDOS * 1000
const CONTA = '11111111-1111-4111-8111-111111111111'
const CHAMADA: ChamadaDoBloqueio = {
  id: '22222222-2222-4222-8222-222222222222',
  account_id: CONTA,
  lead_id: '33333333-3333-4333-8333-333333333333',
  direction: 'outbound',
}
const PARA = '+5511990000001'
const DE = '+5511980000002'

interface Bloqueio {
  telefone: string
  created_at: string
  notes: string | null
  source: string
}

interface AjustesDaPorta {
  existentes?: Bloqueio[]
  numeros?: { de: string | null; para: string | null; doLead: string | null }
  bloqueioFalha?: boolean
  itemFalha?: boolean
}

function portaEmMemoria(ajustes: AjustesDaPorta = {}) {
  const tocados: string[] = []
  const bloqueios: Bloqueio[] = [...(ajustes.existentes ?? [])]
  const pedidos: PedidoDeBloqueio[] = []
  const itens: ItemDeBloqueioNaFila[] = []
  const real: PortaDoBloqueio = {
    async numerosDaChamada() {
      return ajustes.numeros ?? { de: DE, para: PARA, doLead: null }
    },
    // O único parcial: um bloqueio ativo por número, e o existente não muda.
    async bloquearNumero(pedido) {
      pedidos.push(pedido)
      if (ajustes.bloqueioFalha) throw new Error('banco fora do ar')
      const existente = bloqueios.find((b) => b.telefone === pedido.telefone)
      if (existente) return { blockedAt: existente.created_at, criado: false }
      bloqueios.push({ telefone: pedido.telefone, created_at: pedido.instante, notes: pedido.notas, source: pedido.origem })
      return { blockedAt: pedido.instante, criado: true }
    },
    async abrirItemDeBloqueio(item) {
      if (ajustes.itemFalha) throw new Error('fila fora do ar')
      itens.push(item)
    },
  }
  const porta = new Proxy(real, {
    get(alvo, membro, receptor) {
      tocados.push(String(membro))
      return Reflect.get(alvo, membro, receptor) as unknown
    },
  })
  return { porta, tocados, bloqueios, pedidos, itens }
}

function pedidosDa(nome: string): PedidoLido[] {
  const fixture = TRANSCRICOES_DE_EXEMPLO.find((f) => f.nome === nome)!
  return pedidosDeBloqueio(lerConversa(fixture.corpo, fixture.formato)!.invocacoes, INICIO_MS)
}

const NAO_PERTURBE = 'não perturbe com o banco fora do ar'
const PESSOA_ERRADA = 'pessoa errada, fora de ordem e no mesmo segundo'

describe('a leitura dos pedidos', () => {
  test.each(TRANSCRICOES_DE_EXEMPLO.map((fixture) => [fixture.nome, fixture] as const))(
    'a fixture "%s" dá os pedidos esperados',
    (_nome, fixture) => {
      const pedidos = pedidosDeBloqueio(lerConversa(fixture.corpo, fixture.formato)!.invocacoes, INICIO_MS)
      expect(
        pedidos.map((p) => ({ origem: p.origem, ms: Date.parse(p.instante) - INICIO_MS, notas: p.notas })),
      ).toEqual(fixture.esperado.bloqueios)
    },
  )

  test('a invocação que o provedor registrou como bem-sucedida também é lida', () => {
    const fixture = TRANSCRICOES_DE_EXEMPLO.find((f) => f.nome === NAO_PERTURBE)!
    const conversa = lerConversa(fixture.corpo, fixture.formato)!
    expect(conversa.invocacoes.find((i) => i.nome === 'tool-dnc')?.erro).toBeNull()
    expect(pedidosDa(NAO_PERTURBE)).toHaveLength(1)
  })

  test('o instante do pedido é o mesmo `at` que a linha da invocação recebe', () => {
    const fixture = TRANSCRICOES_DE_EXEMPLO.find((f) => f.nome === PESSOA_ERRADA)!
    const linhasDoDnc = fixture.esperado.linhas.filter((l) => l.tool === 'tool-dnc').map((l) => l.ms)
    expect(pedidosDa(PESSOA_ERRADA).map((p) => Date.parse(p.instante) - INICIO_MS)).toEqual(linhasDoDnc)
  })

  test('as notas abrem com a marca da reaplicação e guardam o motivo dito', () => {
    expect(notasDaReaplicacao(null)).toBe(NOTA_DA_REAPLICACAO)
    expect(notasDaReaplicacao('pediu para não ligar mais')).toBe(`${NOTA_DA_REAPLICACAO} | pediu para não ligar mais`)
  })
})

describe('a escrita', () => {
  test('sem bloqueio, cria com a origem do reason, as notas da reaplicação e o instante da promessa', async () => {
    const b = portaEmMemoria()
    const resultado = await reaplicarBloqueios(CHAMADA, pedidosDa(NAO_PERTURBE), b.porta)

    expect(b.pedidos).toEqual([
      {
        contaId: CONTA,
        telefone: PARA,
        origem: 'lead_request',
        motivo: MOTIVO_GRAVADO.lead_request,
        notas: `${NOTA_DA_REAPLICACAO} | pediu para não ligar mais`,
        instante: new Date(INICIO_MS + 7_000).toISOString(),
      },
    ])
    expect(b.itens).toEqual([
      {
        contaId: CONTA,
        chamadaId: CHAMADA.id,
        leadId: CHAMADA.lead_id,
        contexto: {
          call_id: CHAMADA.id,
          origem: 'lead_request',
          recorte: 'pediu para não ligar mais',
          blocked_at: new Date(INICIO_MS + 7_000).toISOString(),
          reaplicado: true,
        },
      },
    ])
    expect(resultado).toEqual({
      ensaio: false,
      pedidos: 1,
      criados: 1,
      existentes: 0,
      semNumero: 0,
      itensQueFalharam: 0,
    })
  })

  test('a pessoa errada grava wrong_number', async () => {
    const b = portaEmMemoria()
    await reaplicarBloqueios(CHAMADA, pedidosDa(PESSOA_ERRADA), b.porta)
    expect(b.bloqueios).toMatchObject([{ source: 'wrong_number', telefone: PARA }])
  })

  test('com bloqueio ativo, o existente não muda e nenhum item abre', async () => {
    const existente = { telefone: PARA, created_at: '2026-03-01T12:00:00.000Z', notes: 'da ligação', source: 'lead_request' }
    const b = portaEmMemoria({ existentes: [{ ...existente }] })
    const resultado = await reaplicarBloqueios(CHAMADA, pedidosDa(NAO_PERTURBE), b.porta)

    expect(b.bloqueios).toEqual([existente])
    expect(b.itens).toEqual([])
    expect(resultado).toMatchObject({ criados: 0, existentes: 1 })
  })

  test('dois pedidos na mesma chamada: um bloqueio e um item', async () => {
    const b = portaEmMemoria()
    const resultado = await reaplicarBloqueios(CHAMADA, pedidosDa(PESSOA_ERRADA), b.porta)
    expect(b.bloqueios).toHaveLength(1)
    expect(b.itens).toHaveLength(1)
    expect(resultado).toMatchObject({ pedidos: 2, criados: 1, existentes: 1 })
  })

  test('rodar duas vezes não cria o segundo bloqueio nem o segundo item', async () => {
    const b = portaEmMemoria()
    await reaplicarBloqueios(CHAMADA, pedidosDa(NAO_PERTURBE), b.porta)
    const segunda = await reaplicarBloqueios(CHAMADA, pedidosDa(NAO_PERTURBE), b.porta)
    expect(b.bloqueios).toHaveLength(1)
    expect(b.itens).toHaveLength(1)
    expect(segunda).toMatchObject({ criados: 0, existentes: 1 })
  })

  test('na recebida, o número bloqueado é o de quem ligou', async () => {
    const b = portaEmMemoria()
    await reaplicarBloqueios({ ...CHAMADA, direction: 'inbound' }, pedidosDa(NAO_PERTURBE), b.porta)
    expect(b.pedidos[0]?.telefone).toBe(DE)
  })

  test('sem número conhecido, nada é escrito e o pedido fica contado', async () => {
    const b = portaEmMemoria({ numeros: { de: null, para: null, doLead: null } })
    const resultado = await reaplicarBloqueios(CHAMADA, pedidosDa(NAO_PERTURBE), b.porta)
    expect(b.tocados).toEqual(['numerosDaChamada'])
    expect(resultado).toMatchObject({ semNumero: 1, criados: 0 })
  })

  test('sem pedido, a porta não é tocada', async () => {
    const b = portaEmMemoria()
    const resultado = await reaplicarBloqueios(CHAMADA, [], b.porta)
    expect(b.tocados).toEqual([])
    expect(resultado.pedidos).toBe(0)
  })

  test('ensaio não reaplica: a porta não é tocada', async () => {
    const b = portaEmMemoria()
    const resultado = await reaplicarBloqueios({ ...CHAMADA, direction: 'rehearsal' }, pedidosDa(NAO_PERTURBE), b.porta)
    expect(b.tocados).toEqual([])
    expect(resultado).toMatchObject({ ensaio: true, pedidos: 1, criados: 0 })
  })

  test('bloqueio que falha levanta, para a finalização cair e a varredura voltar', async () => {
    const b = portaEmMemoria({ bloqueioFalha: true })
    await expect(reaplicarBloqueios(CHAMADA, pedidosDa(NAO_PERTURBE), b.porta)).rejects.toThrow(/fora do ar/)
  })

  test('item que falha depois do bloqueio criado fica contado e não levanta', async () => {
    const b = portaEmMemoria({ itemFalha: true })
    const resultado = await reaplicarBloqueios(CHAMADA, pedidosDa(NAO_PERTURBE), b.porta)
    expect(b.bloqueios).toHaveLength(1)
    expect(resultado).toMatchObject({ criados: 1, itensQueFalharam: 1 })
  })
})
