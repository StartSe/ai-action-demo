import { describe, expect, it } from 'vitest'

import { estadoDasReunioes } from '@/utilidades/vazio-das-reunioes'

describe('estadoDasReunioes', () => {
  it('com reunião no recorte, a lista', () => {
    expect(estadoDasReunioes(3, true)).toBe('reunioes')
  })

  it('conta sem reunião nenhuma: nenhuma reunião marcada', () => {
    expect(estadoDasReunioes(0, false)).toBe('nenhuma-reuniao')
  })

  it('conta com reunião fora do recorte: o recorte não achou nada', () => {
    expect(estadoDasReunioes(0, true)).toBe('recorte-vazio')
  })
})
