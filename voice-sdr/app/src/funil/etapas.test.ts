import { describe, expect, it } from 'vitest'

import {
  chaveDoRotulo,
  corDaEtapa,
  CORES_DA_ETAPA,
  ehCanonica,
  listaReordenada,
  paraCor,
  proximaPosicao,
} from '@/funil/etapas'
import type { EtapaConfigurada } from '@/leads/tipos'

function etapa(chave: string, posicao: number): EtapaConfigurada {
  return {
    id: `e-${chave}`,
    chave,
    rotulo: chave,
    posicao,
    cor: null,
    canonica: ehCanonica(chave),
    leads: 0,
  }
}

describe('chaveDoRotulo', () => {
  it('tira acento, baixa a caixa e troca o que não é letra por sublinhado', () => {
    expect(chaveDoRotulo('Proposta enviada')).toBe('proposta_enviada')
    expect(chaveDoRotulo('  Negociação — rodada 2! ')).toBe('negociacao_rodada_2')
  })

  it('recusa o que o check do banco recusaria', () => {
    expect(chaveDoRotulo('Ok')).toBeNull()
    expect(chaveDoRotulo('2026 leads')).toBeNull()
    expect(chaveDoRotulo('!!!')).toBeNull()
  })

  it('corta em 32 sem terminar em sublinhado', () => {
    const chave = chaveDoRotulo('a'.repeat(31) + ' b')
    expect(chave).toBe('a'.repeat(31))
  })
})

describe('cor da etapa', () => {
  it('só aceita token da paleta; hexadecimal gravado por fora vira nulo', () => {
    expect(paraCor('carmim')).toBe('carmim')
    expect(paraCor('#ff00ff')).toBeNull()
    expect(paraCor(null)).toBeNull()
  })

  it('sem cor escolhida, a canônica tem a do design system e a própria fica no neutro', () => {
    expect(corDaEtapa('qualified', null)).toBe('menta-2')
    expect(corDaEtapa('proposta', null)).toBe('texto-desativado')
    expect(corDaEtapa('qualified', 'carmim')).toBe('carmim')
  })

  it('a paleta não repete cor com dois nomes', () => {
    expect(new Set(CORES_DA_ETAPA).size).toBe(CORES_DA_ETAPA.length)
    expect(CORES_DA_ETAPA).not.toContain('positivo')
  })
})

describe('listaReordenada', () => {
  const etapas = [etapa('new', 0), etapa('contacted', 1), etapa('qualified', 2)]

  it('manda todas as etapas, com a posição da ordem nova', () => {
    expect(listaReordenada(etapas, 'e-qualified', -1)).toEqual([
      { id: 'e-new', rotulo: 'new', posicao: 0, cor: null },
      { id: 'e-qualified', rotulo: 'qualified', posicao: 1, cor: null },
      { id: 'e-contacted', rotulo: 'contacted', posicao: 2, cor: null },
    ])
  })

  it('não passa da ponta', () => {
    expect(listaReordenada(etapas, 'e-new', -1)).toBeNull()
    expect(listaReordenada(etapas, 'e-qualified', 1)).toBeNull()
  })

  it('etapa nova vai depois da maior posição, e não do tamanho da lista', () => {
    expect(proximaPosicao([etapa('new', 0), etapa('won', 7)])).toBe(8)
    expect(proximaPosicao([])).toBe(0)
  })
})
