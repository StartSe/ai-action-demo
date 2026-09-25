// cron-cost-sync: o preço tardio atualizando sem duplicar a soma, o preço nulo
// não virando linha, a desistência em 24 h registrada, a distinção entre zero e
// desconhecido e o teto de 25 itens do envelope.
//
// O dublê guarda `calls` e `call_costs` em memória, e `gravarPreco` é o
// `on conflict (call_id, component, source) do update` ao pé da letra, com a
// soma refeita a cada escrita como o gatilho `somar_custo_da_chamada`. A
// idempotência se prova pela soma, que é o número que o teto de gasto lê.
// `reivindicarChamadas` devolve as chamadas sem parcela de telefonia; com
// `ignorarPendente` ela devolve todas, que é a passagem sobreposta (P-09) ou a
// segunda leitura depois de uma correção de preço. A rede do SQL se prova em
// `testes/banco/preco-tardio.test.ts`.

import { describe, expect, test } from 'vitest'

import type { LinhaDeFim, PortaDeExecucao } from '../_shared/rotinas/execucao.ts'

import {
  atenderRotina,
  COMPONENTES_DA_ROTINA,
  decidirPreco,
  FONTE_DO_CUSTO,
  JANELA_DO_PRECO_MS,
  lerPrecoDaTelefonia,
  NOME_DA_ROTINA,
  ORIGENS_DOS_COMPONENTES,
  sincronizarCustos,
  type ChamadaSemPreco,
  type LinhaDaDesistencia,
  type NotaDoPreco,
  type ParcelaTardia,
  type PortaDosCustos,
  type RastroDaConsulta,
  type RespostaDaTelefonia,
} from './custos.ts'

const AGORA = Date.parse('2026-09-23T15:00:00.000Z')
const MINUTO = 60_000
const HORA = 60 * MINUTO

const CONTA = 'abcdef00-0000-4000-8000-00000000c057'
const SEGREDO = 'segredo-interno-da-instalacao'

function em(ms: number): string {
  return new Date(ms).toISOString()
}

function chamadaSemPreco(n: number, ajustes: Partial<ChamadaSemPreco> = {}): ChamadaSemPreco {
  const sufixo = String(n).padStart(4, '0')
  return {
    id: `abcdef00-0000-4000-8000-00000000${sufixo}`,
    account_id: CONTA,
    provider_call_sid: `CA00000000000000000000000000${sufixo}`,
    ended_at: em(AGORA - 20 * MINUTO),
    cost_sync_attempts: 0,
    ...ajustes,
  }
}

interface Parcela {
  call_id: string
  component: string
  amount_cents: number
  currency: string
  source: string
}

/** O que a telefonia responde para cada sid, na ordem das consultas. */
type Roteiro = Map<string, (RespostaDaTelefonia | null | 'lança')[]>

class Duble {
  readonly chamadas = new Map<string, ChamadaSemPreco & { gave_up_at: string | null }>()
  readonly custos: Parcela[] = []
  readonly somas = new Map<string, number>()
  readonly rastros: RastroDaConsulta[] = []
  readonly notas: { id: string; nota: NotaDoPreco }[] = []
  readonly desistencias: LinhaDaDesistencia[] = []
  readonly consultas: string[] = []
  readonly limites: number[] = []
  ignorarPendente = false
  /** Devolve mais do que o limite, para provar a recusa do envelope. */
  excederLimite = false

  readonly roteiro: Roteiro

  constructor(chamadas: readonly ChamadaSemPreco[], roteiro: Roteiro) {
    this.roteiro = roteiro
    for (const chamada of chamadas) this.chamadas.set(chamada.id, { ...chamada, gave_up_at: null })
  }

  soma(chamadaId: string): number {
    return this.somas.get(chamadaId) ?? 0
  }

  parcelasDe(chamadaId: string): Parcela[] {
    return this.custos.filter((parcela) => parcela.call_id === chamadaId)
  }

  readonly porta: PortaDosCustos = {
    reivindicarChamadas: async (limite) => {
      this.limites.push(limite)
      const pendentes = [...this.chamadas.values()].filter(
        (chamada) =>
          this.ignorarPendente ||
          (chamada.gave_up_at === null &&
            !this.custos.some((parcela) => parcela.call_id === chamada.id && parcela.component === 'telephony')),
      )
      const recorte = this.excederLimite ? pendentes : pendentes.slice(0, limite)
      return recorte.map((chamada) => ({
        id: chamada.id,
        account_id: chamada.account_id,
        provider_call_sid: chamada.provider_call_sid,
        ended_at: chamada.ended_at,
        cost_sync_attempts: chamada.cost_sync_attempts,
      }))
    },

    consultarTelefonia: async (_conta, sid) => {
      this.consultas.push(sid)
      const fila = this.roteiro.get(sid) ?? []
      const proxima = fila.length > 1 ? fila.shift() : fila[0]
      if (proxima === 'lança') throw new Error('conexão recusada')
      return proxima === undefined ? precoDaTelefonia(null) : proxima
    },

    rastrear: async (rastro) => {
      this.rastros.push(rastro)
    },

    gravarPreco: async (parcela: ParcelaTardia) => {
      const existente = this.custos.find(
        (linha) =>
          linha.call_id === parcela.call_id && linha.component === parcela.component && linha.source === parcela.source,
      )
      if (existente) {
        existente.amount_cents = parcela.amount_cents
        existente.currency = parcela.currency
      } else {
        this.custos.push({ ...parcela })
      }
      // A soma refeita, como o gatilho: nunca o delta.
      this.somas.set(
        parcela.call_id,
        this.parcelasDe(parcela.call_id).reduce((total, linha) => total + linha.amount_cents, 0),
      )
    },

    anotar: async (id, nota) => {
      this.notas.push({ id, nota })
      const chamada = this.chamadas.get(id)
      if (!chamada) return
      this.chamadas.set(id, {
        ...chamada,
        cost_sync_attempts: nota.cost_sync_attempts ?? chamada.cost_sync_attempts,
        gave_up_at: nota.cost_sync_gave_up_at ?? chamada.gave_up_at,
      })
    },

    registrarDesistencia: async (linha) => {
      this.desistencias.push(linha)
    },
  }
}

function precoDaTelefonia(price: unknown, price_unit: unknown = 'USD'): RespostaDaTelefonia {
  return { status_code: 200, corpo: { sid: 'CA', status: 'completed', price, price_unit }, latency_ms: 120 }
}

function portaDeExecucao() {
  const fins: LinhaDeFim[] = []
  const porta: PortaDeExecucao = {
    inserirExecucao: async () => 'execucao-1',
    concluirExecucao: async (_id, linha) => {
      fins.push(linha)
    },
    itensDasUltimasExecucoes: async () => [],
  }
  return { porta, fins }
}

function rodar(duble: Duble, instante = AGORA) {
  const { porta: execucao, fins } = portaDeExecucao()
  return sincronizarCustos({ porta: duble.porta, execucao, agora: () => instante }).then((resultado) => ({
    resultado,
    fins,
  }))
}

describe('o catálogo de origens', () => {
  test('os quatro componentes do check têm origem com razão escrita', () => {
    expect([...ORIGENS_DOS_COMPONENTES.keys()].toSorted()).toEqual(['infra', 'model', 'telephony', 'voice'])
    for (const [componente, origem] of ORIGENS_DOS_COMPONENTES) {
      expect(origem.razao.length, componente).toBeGreaterThan(60)
    }
  })

  test('esta rotina cobre só a telefonia; voz e modelo têm informante próprio', () => {
    expect(COMPONENTES_DA_ROTINA).toEqual(['telephony'])
    expect(ORIGENS_DOS_COMPONENTES.get('voice')?.informante).toBe('call-finalize')
    expect(ORIGENS_DOS_COMPONENTES.get('model')?.informante).toBe('call-classify')
  })
})

describe('a leitura do preço', () => {
  test.each<[string, unknown, ReturnType<typeof lerPrecoDaTelefonia>]>([
    ['texto negativo', { price: '-0.01500', price_unit: 'USD' }, { estado: 'conhecido', centavos: 2, moeda: 'USD' }],
    ['número', { price: -0.42, price_unit: 'usd' }, { estado: 'conhecido', centavos: 42, moeda: 'USD' }],
    ['zero é preço', { price: '0.00000', price_unit: 'USD' }, { estado: 'conhecido', centavos: 0, moeda: 'USD' }],
    ['moeda ilegível cai no dólar', { price: '-1.10', price_unit: 'dólar' }, { estado: 'conhecido', centavos: 110, moeda: 'USD' }],
    ['moeda da resposta', { price: '-0.30', price_unit: 'BRL' }, { estado: 'conhecido', centavos: 30, moeda: 'BRL' }],
    ['nulo', { price: null, price_unit: 'USD' }, { estado: 'pendente' }],
    ['ausente', { status: 'completed' }, { estado: 'pendente' }],
    ['texto vazio', { price: '' }, { estado: 'pendente' }],
    ['texto torto', { price: '-0.01x' }, { estado: 'pendente' }],
    ['não finito', { price: Number.NaN }, { estado: 'pendente' }],
    ['corpo nulo', null, { estado: 'pendente' }],
  ])('%s', (_caso, corpo, esperado) => {
    expect(lerPrecoDaTelefonia(corpo)).toEqual(esperado)
  })
})

describe('o preço tardio', () => {
  test('nulo na primeira consulta não vira linha; a passagem seguinte grava o que chegou', async () => {
    const chamada = chamadaSemPreco(1)
    const duble = new Duble(
      [chamada],
      new Map([[chamada.provider_call_sid, [precoDaTelefonia(null), precoDaTelefonia('-0.13000')]]]),
    )

    const primeira = await rodar(duble)
    expect(primeira.resultado.ok).toBe(true)
    expect(duble.parcelasDe(chamada.id)).toEqual([])
    expect(duble.soma(chamada.id)).toBe(0)
    expect(duble.notas).toEqual([{ id: chamada.id, nota: { cost_sync_attempts: 1 } }])
    expect(duble.desistencias).toEqual([])

    await rodar(duble, AGORA + 15 * MINUTO)
    expect(duble.parcelasDe(chamada.id)).toEqual([
      { call_id: chamada.id, component: 'telephony', amount_cents: 13, currency: 'USD', source: FONTE_DO_CUSTO },
    ])
    expect(duble.soma(chamada.id)).toBe(13)
  })

  test('rodar duas vezes seguidas não soma duas vezes, e a correção atualiza a parcela', async () => {
    const chamada = chamadaSemPreco(2)
    const duble = new Duble(
      [chamada],
      new Map([
        [chamada.provider_call_sid, [precoDaTelefonia('-0.13000'), precoDaTelefonia('-0.13000'), precoDaTelefonia('-0.21000')]],
      ]),
    )
    // As passagens se sobrepõem: a reivindicação devolve a chamada mesmo com a
    // parcela já gravada, e só o único segura a soma.
    duble.ignorarPendente = true

    await rodar(duble)
    await rodar(duble, AGORA + MINUTO)
    expect(duble.consultas).toHaveLength(2)
    expect(duble.parcelasDe(chamada.id)).toHaveLength(1)
    expect(duble.soma(chamada.id)).toBe(13)

    await rodar(duble, AGORA + 15 * MINUTO)
    expect(duble.parcelasDe(chamada.id)).toHaveLength(1)
    expect(duble.soma(chamada.id)).toBe(21)
  })

  test('com a parcela gravada, a passagem seguinte não consulta de novo', async () => {
    const chamada = chamadaSemPreco(3)
    const duble = new Duble([chamada], new Map([[chamada.provider_call_sid, [precoDaTelefonia('-0.05')]]]))

    await rodar(duble)
    await rodar(duble, AGORA + 15 * MINUTO)
    expect(duble.consultas).toEqual([chamada.provider_call_sid])
  })
})

describe('zero e desconhecido', () => {
  test('preço zero vira linha com zero; preço desconhecido não vira linha nenhuma', async () => {
    const paga = chamadaSemPreco(10)
    const gratis = chamadaSemPreco(11)
    const semPreco = chamadaSemPreco(12)
    const duble = new Duble(
      [paga, gratis, semPreco],
      new Map([
        [paga.provider_call_sid, [precoDaTelefonia('-0.40')]],
        [gratis.provider_call_sid, [precoDaTelefonia('0.00')]],
        [semPreco.provider_call_sid, [precoDaTelefonia(null)]],
      ]),
    )

    await rodar(duble)

    // Zero conhecido: a linha existe, e a ficha escreve "R$ 0,00".
    expect(duble.parcelasDe(gratis.id).map((linha) => linha.amount_cents)).toEqual([0])
    // Desconhecido: nenhuma linha, e a ficha escreve "aguardando preço". Se a
    // rotina gravasse zero aqui, a soma seria a mesma e a ficha mentiria que a
    // ligação saiu de graça — e o teto de gasto contaria esse zero como pago.
    expect(duble.parcelasDe(semPreco.id)).toEqual([])
    expect(duble.parcelasDe(paga.id).map((linha) => linha.amount_cents)).toEqual([40])
  })

  test('falha da telefonia é desconhecido, nunca zero, e não derruba a passagem', async () => {
    const recusada = chamadaSemPreco(20)
    const caida = chamadaSemPreco(21)
    const semCredencial = chamadaSemPreco(22)
    const boa = chamadaSemPreco(23)
    const duble = new Duble(
      [recusada, caida, semCredencial, boa],
      new Map<string, (RespostaDaTelefonia | null | 'lança')[]>([
        [recusada.provider_call_sid, [{ status_code: 503, corpo: { price: '-9.99' }, latency_ms: 30 }]],
        [caida.provider_call_sid, ['lança']],
        [semCredencial.provider_call_sid, [null]],
        [boa.provider_call_sid, [precoDaTelefonia('-0.07')]],
      ]),
    )

    const { resultado } = await rodar(duble)
    expect(resultado).toMatchObject({ ok: true, itens: 4 })
    expect(duble.custos.map((linha) => linha.call_id)).toEqual([boa.id])
    expect(duble.notas.map((nota) => nota.id).toSorted()).toEqual([recusada.id, caida.id, semCredencial.id].toSorted())
  })
})

describe('a desistência', () => {
  test('passadas 24 h do fim sem preço, marca a chamada e registra em job_runs', async () => {
    const velha = chamadaSemPreco(30, { ended_at: em(AGORA - JANELA_DO_PRECO_MS - MINUTO), cost_sync_attempts: 96 })
    const duble = new Duble([velha], new Map([[velha.provider_call_sid, [precoDaTelefonia(null)]]]))

    await rodar(duble)
    expect(duble.parcelasDe(velha.id)).toEqual([])
    expect(duble.notas).toEqual([
      { id: velha.id, nota: { cost_sync_attempts: 97, cost_sync_gave_up_at: em(AGORA) } },
    ])
    expect(duble.desistencias).toHaveLength(1)
    expect(duble.desistencias[0]).toMatchObject({
      routine: NOME_DA_ROTINA,
      account_id: CONTA,
      items: 1,
    })
    expect(duble.desistencias[0]?.error).toContain(velha.id)
    expect(duble.desistencias[0]?.error).toMatch(/24 h/)

    // Desistida, sai da reivindicação.
    await rodar(duble, AGORA + 15 * MINUTO)
    expect(duble.consultas).toEqual([velha.provider_call_sid])
  })

  test('dentro das 24 h, sem preço, tenta de novo e não desiste', () => {
    const quase = chamadaSemPreco(31, { ended_at: em(AGORA - JANELA_DO_PRECO_MS + MINUTO) })
    expect(decidirPreco(quase, precoDaTelefonia(null), AGORA)).toEqual({ decisao: 'tentar_de_novo' })
    expect(decidirPreco(quase, null, AGORA)).toEqual({ decisao: 'tentar_de_novo' })
  })

  test('o preço que chega depois das 24 h ainda é gravado', () => {
    const velha = chamadaSemPreco(32, { ended_at: em(AGORA - 30 * HORA) })
    expect(decidirPreco(velha, precoDaTelefonia('-0.10'), AGORA)).toEqual({ decisao: 'gravar', centavos: 10, moeda: 'USD' })
  })

  test('404 é chamada que a telefonia não conhece: desiste na hora', () => {
    const recente = chamadaSemPreco(33)
    expect(decidirPreco(recente, { status_code: 404, corpo: null, latency_ms: 10 }, AGORA)).toMatchObject({
      decisao: 'desistir',
    })
  })
})

describe('o rastro', () => {
  test('cada consulta grava integration_events com correlation_id igual ao call_id', async () => {
    const paga = chamadaSemPreco(40)
    const pendente = chamadaSemPreco(41)
    const recusada = chamadaSemPreco(42)
    const semCredencial = chamadaSemPreco(43)
    const duble = new Duble(
      [paga, pendente, recusada, semCredencial],
      new Map<string, (RespostaDaTelefonia | null | 'lança')[]>([
        [paga.provider_call_sid, [precoDaTelefonia('-0.40')]],
        [pendente.provider_call_sid, [precoDaTelefonia(null)]],
        [recusada.provider_call_sid, [{ status_code: 500, corpo: null, latency_ms: 50 }]],
        [semCredencial.provider_call_sid, [null]],
      ]),
    )

    await rodar(duble)
    // Sem credencial não houve consulta, e não há rastro dela.
    expect(duble.rastros.map((rastro) => rastro.correlation_id)).toEqual([paga.id, pendente.id, recusada.id])
    for (const rastro of duble.rastros) {
      expect(rastro).toMatchObject({ account_id: CONTA, direction: 'outbound', provider: 'telefonia' })
      expect(rastro.endpoint).toMatch(/^Calls\/CA[0-9]+\.json$/)
    }
    expect(duble.rastros.map((rastro) => rastro.status_code)).toEqual([200, 200, 500])
    expect(duble.rastros.map((rastro) => rastro.response.preco)).toEqual(['conhecido', 'pendente', 'pendente'])
  })
})

describe('o envelope', () => {
  test('pede no máximo 25 e processa 25 de 30 pendentes', async () => {
    const chamadas = Array.from({ length: 30 }, (_, i) => chamadaSemPreco(100 + i))
    const duble = new Duble(
      chamadas,
      new Map(chamadas.map((chamada) => [chamada.provider_call_sid, [precoDaTelefonia('-0.01')]])),
    )

    const { resultado } = await rodar(duble)
    expect(duble.limites).toEqual([25])
    expect(resultado).toMatchObject({ ok: true, itens: 25 })
    expect(duble.consultas).toHaveLength(25)

    await rodar(duble, AGORA + 15 * MINUTO)
    expect(duble.consultas).toHaveLength(30)
  })

  test('reivindicação acima do teto encerra a passagem sem consultar nem gravar', async () => {
    const chamadas = Array.from({ length: 26 }, (_, i) => chamadaSemPreco(200 + i))
    const duble = new Duble(chamadas, new Map())
    duble.excederLimite = true

    const { resultado, fins } = await rodar(duble)
    expect(resultado.ok).toBe(false)
    expect(duble.consultas).toEqual([])
    expect(duble.custos).toEqual([])
    expect(fins[0]?.error).toMatch(/teto de 25/)
  })
})

describe('a borda', () => {
  function portaVigiada() {
    const tocadas: string[] = []
    const vigiar = <T extends object>(nome: string): T =>
      new Proxy({} as T, {
        get(_alvo, membro) {
          tocadas.push(`${nome}.${String(membro)}`)
          return async () => {
            throw new Error('não devia ser chamada')
          }
        },
      })
    return {
      tocadas,
      pedido: { porta: vigiar<PortaDosCustos>('custos'), execucao: vigiar<PortaDeExecucao>('execucao') },
    }
  }

  test.each([
    ['sem segredo', null],
    ['segredo errado', 'outro-segredo'],
  ])('%s: 401 antes de tocar em qualquer porta', async (_caso, segredo) => {
    const { tocadas, pedido } = portaVigiada()
    const resposta = await atenderRotina({ metodo: 'POST', segredo }, pedido, { segredoInterno: SEGREDO })
    expect(resposta.status).toBe(401)
    expect(tocadas).toEqual([])
  })

  test('segredo interno ausente na instalação fecha o portão', async () => {
    const { tocadas, pedido } = portaVigiada()
    const resposta = await atenderRotina({ metodo: 'POST', segredo: '' }, pedido, { segredoInterno: '' })
    expect(resposta.status).toBe(401)
    expect(tocadas).toEqual([])
  })

  test('com o segredo, roda a passagem e responde 200', async () => {
    const chamada = chamadaSemPreco(300)
    const duble = new Duble([chamada], new Map([[chamada.provider_call_sid, [precoDaTelefonia('-0.02')]]]))
    const { porta: execucao } = portaDeExecucao()
    const resposta = await atenderRotina(
      { metodo: 'post', segredo: SEGREDO },
      { porta: duble.porta, execucao, agora: () => AGORA },
      { segredoInterno: SEGREDO },
    )
    expect(resposta.status).toBe(200)
    expect(duble.soma(chamada.id)).toBe(2)
  })
})
