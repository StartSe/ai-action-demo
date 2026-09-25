import { describe, expect, it } from 'vitest'

import { formatarData, formatarInstante } from '@/utilidades/datas'

describe('datas', () => {
  it('instante sai no formato brasileiro, com hora', () => {
    expect(formatarInstante('2026-09-20T13:40:00.000Z')).toMatch(
      /^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}$/,
    )
  })

  it('prazo sai só com a data', () => {
    expect(formatarData('2026-09-28T13:40:00.000Z')).toMatch(
      /^\d{2}\/\d{2}\/\d{4}$/,
    )
  })

  it('ausência de instante vira string vazia, e não "Invalid Date"', () => {
    expect(formatarInstante(null)).toBe('')
    expect(formatarInstante('')).toBe('')
    expect(formatarData('nem data')).toBe('')
  })
})
