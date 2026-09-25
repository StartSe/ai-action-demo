import { describe, expect, it } from 'vitest'

import {
  aplicarRecorte,
  BUSCA_LIMPA,
  chaveDaBusca,
  DIRECOES_DA_LISTA,
  estaEmCurso,
  estadoDaLista,
  numeroDaConsulta,
  recorteDaBusca,
  RESULTADOS,
  temRecorte,
} from '@/chamadas/consulta'
import type { ChamadaDaLista, RecorteDeChamadas } from '@/chamadas/tipos'
import { MOTIVO_DO_FIM } from '@/copy/chamadas'

const AGORA = Date.parse('2026-09-23T15:00:00.000Z')
const relogio = () => AGORA

function chamada(id: string, mudanca: Partial<ChamadaDaLista> = {}): ChamadaDaLista {
  return {
    id,
    proposito: 'discovery',
    direcao: 'outbound',
    status: 'ended',
    leadId: null,
    leadNome: null,
    numero: '+5511988887777',
    iniciadaEm: '2026-09-23T14:00:00.000Z',
    duracaoSeg: 60,
    parcelas: [],
    motivoDoFim: 'completed',
    nota: null,
    ...mudanca,
  }
}

function recorte(mudanca: Partial<RecorteDeChamadas> = {}): RecorteDeChamadas {
  return { ordenacao: 'instante', direcoes: DIRECOES_DA_LISTA, ...mudanca }
}

describe('recorteDaBusca', () => {
  it('sem filtro, ordena por instante e já tira o ensaio', () => {
    const leitura = recorteDaBusca(BUSCA_LIMPA, relogio)
    expect(leitura).toEqual({
      ok: true,
      recorte: { ordenacao: 'instante', direcoes: ['outbound', 'inbound'] },
    })
  })

  // T-16: o ensaio da F3 grava em `calls` como qualquer chamada. O filtro nasce
  // no recorte para a F3 não precisar caçar consulta por consulta.
  it('nunca pede a direção do ensaio, com filtro ou sem', () => {
    for (const busca of [BUSCA_LIMPA, { periodo: '7d', proposito: 'rescue', numero: '11 9' }]) {
      const leitura = recorteDaBusca(busca, relogio)
      if (!leitura.ok) throw new Error('recorte recusado')
      expect(leitura.recorte.direcoes).not.toContain('rehearsal')
    }
  })

  it('o período vira instante, contado do relógio', () => {
    const leitura = recorteDaBusca({ periodo: '24h' }, relogio)
    expect(leitura.ok && leitura.recorte.desde).toBe('2026-09-22T15:00:00.000Z')
    const semana = recorteDaBusca({ periodo: '7d' }, relogio)
    expect(semana.ok && semana.recorte.desde).toBe('2026-09-16T15:00:00.000Z')
  })

  it('leva propósito, resultado e ordenação reconhecidos', () => {
    const leitura = recorteDaBusca(
      { proposito: 'reminder', resultado: 'voicemail', ordenacao: 'custo' },
      relogio,
    )
    expect(leitura).toEqual({
      ok: true,
      recorte: {
        proposito: 'reminder',
        resultado: 'voicemail',
        ordenacao: 'custo',
        direcoes: DIRECOES_DA_LISTA,
      },
    })
  })

  it.each([
    ['periodo', { periodo: '90d' }],
    ['proposito', { proposito: 'venda' }],
    ['resultado', { resultado: 'hangup' }],
    ['ordenacao', { ordenacao: 'nota' }],
  ] as const)('recusa %s que a tela não reconhece', (campo, busca) => {
    expect(recorteDaBusca(busca, relogio)).toEqual({ ok: false, campo })
  })
})

describe('numeroDaConsulta', () => {
  it('número válido vira E.164', () => {
    expect(numeroDaConsulta('(11) 98888-7777')).toBe('+5511988887777')
  })

  it('número incompleto segue só com os dígitos', () => {
    expect(numeroDaConsulta(' 11 9888 ')).toBe('119888')
  })

  it('sem dígito não há filtro', () => {
    expect(numeroDaConsulta('   ')).toBeUndefined()
    expect(numeroDaConsulta('abc')).toBeUndefined()
    expect(numeroDaConsulta(undefined)).toBeUndefined()
  })
})

describe('estados da lista', () => {
  it('lista com linhas é lista, com filtro ou sem', () => {
    expect(estadoDaLista(3, BUSCA_LIMPA)).toBe('lista')
    expect(estadoDaLista(3, { proposito: 'rescue' })).toBe('lista')
  })

  it('vazia sem recorte é a conta que nunca ligou', () => {
    expect(estadoDaLista(0, BUSCA_LIMPA)).toBe('conta-sem-chamada')
    expect(estadoDaLista(0, { periodo: 'tudo' })).toBe('conta-sem-chamada')
  })

  it('a ordenação não conta como recorte', () => {
    expect(temRecorte({ ordenacao: 'custo' })).toBe(false)
    expect(estadoDaLista(0, { ordenacao: 'custo' })).toBe('conta-sem-chamada')
  })

  it.each([{ periodo: '7d' }, { proposito: 'rescue' }, { resultado: 'busy' }, { numero: '11' }])(
    'vazia com %o é o recorte sem resultado',
    (busca) => {
      expect(estadoDaLista(0, busca)).toBe('recorte-sem-resultado')
    },
  )
})

describe('chaveDaBusca', () => {
  it('sai da busca, e não do relógio', () => {
    expect(chaveDaBusca({ periodo: '7d' })).toEqual(chaveDaBusca({ periodo: '7d' }))
    expect(chaveDaBusca({ periodo: '7d' })).not.toEqual(chaveDaBusca({ periodo: '24h' }))
  })
})

describe('aplicarRecorte', () => {
  it('tira o ensaio', () => {
    const lista = [chamada('a'), chamada('b', { direcao: 'rehearsal' }), chamada('c', { direcao: 'inbound' })]
    expect(aplicarRecorte(lista, recorte()).chamadas.map((cada) => cada.id)).toEqual(['a', 'c'])
  })

  it('filtra por período, propósito, resultado e número', () => {
    const lista = [
      chamada('velha', { iniciadaEm: '2026-09-01T00:00:00.000Z' }),
      chamada('lembrete', { proposito: 'reminder' }),
      chamada('caixa', { motivoDoFim: 'voicemail' }),
      chamada('outro-numero', { numero: '+5521977776666' }),
      chamada('alvo', { proposito: 'reminder', motivoDoFim: 'voicemail' }),
    ]
    const ids = (mudanca: Partial<RecorteDeChamadas>) =>
      aplicarRecorte(lista, recorte(mudanca)).chamadas.map((cada) => cada.id).sort()

    expect(ids({ desde: '2026-09-20T00:00:00.000Z' })).not.toContain('velha')
    expect(ids({ proposito: 'reminder' })).toEqual(['alvo', 'lembrete'])
    expect(ids({ resultado: 'voicemail' })).toEqual(['alvo', 'caixa'])
    expect(ids({ numero: '2197777' })).toEqual(['outro-numero'])
  })

  it('ordena por instante, duração e custo, do maior para o menor', () => {
    const lista = [
      chamada('curta-cara', {
        iniciadaEm: '2026-09-23T10:00:00.000Z',
        duracaoSeg: 10,
        parcelas: [{ componente: 'voice', centavos: 90, moeda: 'USD' }],
      }),
      chamada('longa-barata', {
        iniciadaEm: '2026-09-23T11:00:00.000Z',
        duracaoSeg: 300,
        parcelas: [{ componente: 'voice', centavos: 5, moeda: 'USD' }],
      }),
      chamada('sem-duracao', { iniciadaEm: '2026-09-23T12:00:00.000Z', duracaoSeg: null }),
    ]
    const ordem = (ordenacao: RecorteDeChamadas['ordenacao']) =>
      aplicarRecorte(lista, recorte({ ordenacao })).chamadas.map((cada) => cada.id)

    expect(ordem('instante')).toEqual(['sem-duracao', 'longa-barata', 'curta-cara'])
    expect(ordem('duracao')).toEqual(['longa-barata', 'curta-cara', 'sem-duracao'])
    expect(ordem('custo')).toEqual(['curta-cara', 'longa-barata', 'sem-duracao'])
  })

  it('corta no teto e diz que cortou', () => {
    const lista = ['a', 'b', 'c'].map((id) => chamada(id))
    expect(aplicarRecorte(lista, recorte(), 3).truncada).toBe(false)
    const cortada = aplicarRecorte(lista, recorte(), 2)
    expect(cortada.chamadas).toHaveLength(2)
    expect(cortada.truncada).toBe(true)
  })
})

describe('estaEmCurso', () => {
  it.each(['queued', 'ringing', 'in_progress'])('%s está em curso', (status) => {
    expect(estaEmCurso({ status })).toBe(true)
  })

  it.each(['ended', 'failed'])('%s terminou', (status) => {
    expect(estaEmCurso({ status })).toBe(false)
  })
})

describe('resultados', () => {
  it('o seletor oferece exatamente a lista fechada de end_reason, toda traduzida', () => {
    expect([...RESULTADOS].sort()).toEqual(Object.keys(MOTIVO_DO_FIM).sort())
  })
})
