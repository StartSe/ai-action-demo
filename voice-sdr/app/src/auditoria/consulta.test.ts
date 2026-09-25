import { describe, expect, it } from 'vitest'

import {
  inicioDoPeriodo,
  paraAcao,
  paraPeriodo,
  temFiltro,
} from '@/auditoria/consulta'

/** 2026-09-21T12:00:00Z, para a conta do recuo ficar legível. */
const AGORA = () => Date.parse('2026-09-21T12:00:00.000Z')

describe('início do período', () => {
  it('não recorta nada quando o período é tudo', () => {
    expect(inicioDoPeriodo('tudo', AGORA)).toBeUndefined()
    expect(inicioDoPeriodo(undefined, AGORA)).toBeUndefined()
  })

  it('recua o relógio pela janela escolhida', () => {
    expect(inicioDoPeriodo('24h', AGORA)).toBe('2026-09-20T12:00:00.000Z')
    expect(inicioDoPeriodo('7d', AGORA)).toBe('2026-09-14T12:00:00.000Z')
    expect(inicioDoPeriodo('30d', AGORA)).toBe('2026-08-22T12:00:00.000Z')
  })
})

describe('tem filtro', () => {
  it('é falso na consulta vazia e no período tudo', () => {
    expect(temFiltro({})).toBe(false)
    expect(temFiltro({ periodo: 'tudo' })).toBe(false)
  })

  it('é verdadeiro para cada recorte, um a um', () => {
    expect(temFiltro({ autor: 'u-1' })).toBe(true)
    expect(temFiltro({ acao: 'delete' })).toBe(true)
    expect(temFiltro({ periodo: '7d' })).toBe(true)
  })
})

describe('leitura do seletor', () => {
  it('devolve indefinido para ação fora da lista', () => {
    expect(paraAcao('update')).toBe('update')
    expect(paraAcao('')).toBeUndefined()
    expect(paraAcao('truncate')).toBeUndefined()
  })

  it('cai em tudo para período fora da lista', () => {
    expect(paraPeriodo('30d')).toBe('30d')
    expect(paraPeriodo('desde-ontem')).toBe('tudo')
  })
})
