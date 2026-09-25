import { describe, expect, it } from 'vitest'

import {
  classificacaoCorrigida,
  diaEHora,
  fonteDaClassificacao,
  fraseDaFonte,
  porcentagem,
  rotuloDaEtapa,
} from '@/chamadas/classificacao'
import { fonte } from '@/copy/chamada'

const FUSO = 'America/Sao_Paulo'

const SEM_FONTE = {
  origemDaClassificacao: null,
  confiancaDaClassificacao: null,
  corrigidaPor: null,
  corrigidaEm: null,
}

describe('fraseDaFonte: classification_source vira frase, nunca código', () => {
  it('tool é registrada na conversa', () => {
    expect(fraseDaFonte({ ...SEM_FONTE, origemDaClassificacao: 'tool' })).toBe(
      'Registrada na conversa.',
    )
  })

  it('backfill diz a confiança em porcentagem inteira', () => {
    expect(
      fraseDaFonte({ ...SEM_FONTE, origemDaClassificacao: 'backfill', confiancaDaClassificacao: 0.72 }),
    ).toBe('Classificada depois da conversa, com confiança de 72%.')
  })

  it('backfill sem confiança (a F2 não a gravava) diz isso, e não 0%', () => {
    expect(fraseDaFonte({ ...SEM_FONTE, origemDaClassificacao: 'backfill' })).toBe(
      'Classificada depois da conversa, sem confiança registrada.',
    )
  })

  it('human diz quem corrigiu, o dia e a hora no fuso pedido', () => {
    expect(
      fraseDaFonte(
        {
          ...SEM_FONTE,
          origemDaClassificacao: 'human',
          corrigidaPor: 'Ana',
          corrigidaEm: '2026-09-21T17:12:00.000Z',
        },
        FUSO,
      ),
    ).toBe('Corrigida por Ana em 21/09 às 14h12.')
  })

  it('human sem nome nem hora ainda diz que foi gente', () => {
    expect(fraseDaFonte({ ...SEM_FONTE, origemDaClassificacao: 'human' })).toBe(
      fonte.correcaoSemHora(null),
    )
  })

  it('sem classificação, ou fonte desconhecida, não há frase', () => {
    expect(fraseDaFonte(SEM_FONTE)).toBeNull()
    expect(fraseDaFonte({ ...SEM_FONTE, origemDaClassificacao: 'outra' })).toBeNull()
  })

  it('nenhuma frase mostra o código da fonte', () => {
    for (const origem of ['tool', 'backfill', 'human']) {
      const frase = fraseDaFonte({ ...SEM_FONTE, origemDaClassificacao: origem }) ?? ''
      expect(frase).not.toMatch(/tool|backfill|human/)
    }
  })

  it('fonteDaClassificacao separa as três fontes', () => {
    expect(fonteDaClassificacao({ ...SEM_FONTE, origemDaClassificacao: 'tool' })).toEqual({
      tipo: 'conversa',
    })
    expect(
      fonteDaClassificacao({ ...SEM_FONTE, origemDaClassificacao: 'backfill', confiancaDaClassificacao: 0.5 }),
    ).toEqual({ tipo: 'retaguarda', confianca: 0.5 })
  })
})

describe('porcentagem e diaEHora', () => {
  it('arredonda e recusa fora da faixa', () => {
    expect(porcentagem(0.726)).toBe(73)
    expect(porcentagem(1)).toBe(100)
    expect(porcentagem(1.2)).toBeNull()
    expect(porcentagem(-0.1)).toBeNull()
    expect(porcentagem(null)).toBeNull()
  })

  it('hora com dois dígitos e sem AM/PM', () => {
    expect(diaEHora('2026-09-01T11:05:00.000Z', FUSO)).toEqual({ dia: '01/09', hora: '08h05' })
    expect(diaEHora('2026-09-01T23:30:00.000Z', FUSO)).toEqual({ dia: '01/09', hora: '20h30' })
  })

  it('instante ilegível é nulo', () => {
    expect(diaEHora('ontem', FUSO)).toBeNull()
    expect(diaEHora(null, FUSO)).toBeNull()
  })
})

describe('a etapa viaja pela chave', () => {
  const etapas = [
    { chave: 'contacted', rotulo: 'Contatado' },
    { chave: 'qualified', rotulo: 'Tem fit' },
  ]

  it('o rótulo é o de hoje; chave que saiu do funil é nula', () => {
    expect(rotuloDaEtapa(etapas, 'qualified')).toBe('Tem fit')
    expect(rotuloDaEtapa(etapas, 'lost')).toBeNull()
  })

  it('a classificação corrigida troca só stage_key, pela chave', () => {
    const atual = { stage_key: 'contacted', summary: 'Pediu retorno.', temperatura: 'morno' }
    expect(classificacaoCorrigida(atual, 'qualified')).toEqual({
      stage_key: 'qualified',
      summary: 'Pediu retorno.',
      temperatura: 'morno',
    })
    expect(atual.stage_key).toBe('contacted')
  })
})
