import { FUSOS_DO_BRASIL } from '@compartilhado/ddd.ts'
import { describe, expect, it } from 'vitest'

import { campoDeFuso, nomeDoFusoNaTela } from '@/copy/fuso'

describe('o fuso na tela (D-09)', () => {
  it('cada fuso do Brasil tem nome, e nenhum nome é a zona IANA', () => {
    expect(Object.keys(campoDeFuso.nomes).sort()).toEqual([...FUSOS_DO_BRASIL].sort())
    for (const fuso of FUSOS_DO_BRASIL) {
      expect(nomeDoFusoNaTela(fuso)).not.toMatch(/America\/|_/)
    }
  })

  it('fora da lista, o nome sai da cidade do identificador', () => {
    expect(nomeDoFusoNaTela('America/Noronha')).toBe('Fernando de Noronha')
    expect(nomeDoFusoNaTela('Europe/Lisbon')).toBe('Lisbon')
  })
})
