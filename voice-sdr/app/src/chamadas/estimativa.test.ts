import { describe, expect, it } from 'vitest'

import { duracaoPorExtenso, juntarValores, lerEstimativa } from '@/chamadas/estimativa'

const SEM_AMOSTRA = { ligacoesMedidas: 0, duracaoMediaSeg: null, porLigacao: [], porMinuto: [] }

describe('leitura da estimativa de custo (D-14)', () => {
  it('lê a resposta do banco, com os números em texto também', () => {
    expect(
      lerEstimativa({
        ligacoes_medidas: '3',
        duracao_media_seg: 75,
        por_ligacao: [
          { moeda: 'BRL', centavos: '30' },
          { moeda: 'USD', centavos: 23 },
        ],
        por_minuto: [{ moeda: 'BRL', centavos: 24 }],
      }),
    ).toEqual({
      ligacoesMedidas: 3,
      duracaoMediaSeg: 75,
      porLigacao: [
        { moeda: 'BRL', centavos: 30 },
        { moeda: 'USD', centavos: 23 },
      ],
      porMinuto: [{ moeda: 'BRL', centavos: 24 }],
    })
  })

  it('descarta o valor torto e trata a forma estranha como sem amostra, sem inventar número', () => {
    expect(lerEstimativa(null)).toEqual(SEM_AMOSTRA)
    expect(lerEstimativa({ ligacoes_medidas: 0, por_ligacao: [], por_minuto: [] })).toEqual(SEM_AMOSTRA)
    // Amostra declarada sem valor legível nenhum também não vira estimativa.
    expect(
      lerEstimativa({ ligacoes_medidas: 2, por_ligacao: [{ moeda: 'real', centavos: 'x' }] }),
    ).toEqual(SEM_AMOSTRA)
    expect(
      lerEstimativa({
        ligacoes_medidas: 2,
        duracao_media_seg: 'muito',
        por_ligacao: [{ moeda: 'BRL', centavos: 10 }, { moeda: 'USD' }],
        por_minuto: 'nada',
      }),
    ).toEqual({
      ligacoesMedidas: 2,
      duracaoMediaSeg: null,
      porLigacao: [{ moeda: 'BRL', centavos: 10 }],
      porMinuto: [],
    })
  })
})

describe('texto da estimativa', () => {
  it('junta as moedas lado a lado, sem somar', () => {
    expect(
      juntarValores([
        { moeda: 'BRL', centavos: 30 },
        { moeda: 'USD', centavos: 23 },
      ]),
    ).toMatch(/^R\$\s0,30 \+ US\$\s0,23$/)
  })

  it('diz a duração em minutos e segundos', () => {
    expect(duracaoPorExtenso(45)).toBe('45 s')
    expect(duracaoPorExtenso(120)).toBe('2 min')
    expect(duracaoPorExtenso(90.4)).toBe('1 min 30 s')
  })
})
