// A escolha das seis vozes de exemplo: três de cada gênero, as mais naturais,
// sem voz de locução, e completadas pelas prontas quando faltar.

import { describe, expect, it } from 'vitest'

import type { VozDoProvedor } from './formato-do-provedor.ts'
import {
  VOZES_PRONTAS,
  VOZES_POR_GENERO,
  escolherVozesDeExemplo,
  naturalidade,
} from './vozes-de-exemplo.ts'

function voz(
  id: string,
  genero: VozDoProvedor['genero'],
  descricao: string,
  sotaque = 'brazilian',
  idiomas: string[] = ['pt'],
): VozDoProvedor {
  return { id, nome: id, genero, sotaque, descricao, previa: null, ajustesGravados: {}, idiomas }
}

describe('naturalidade', () => {
  it('conversacional pontua, locução afunda', () => {
    expect(naturalidade(voz('a', 'feminina', 'Warm conversational voice'))).toBeGreaterThan(0)
    expect(naturalidade(voz('b', 'feminina', 'Deep narration for audiobooks'))).toBeLessThan(0)
  })

  it('o sotaque brasileiro desempata', () => {
    expect(naturalidade(voz('a', 'masculina', 'Casual', 'brazilian'))).toBeGreaterThan(
      naturalidade(voz('a', 'masculina', 'Casual', 'american')),
    )
  })
})

describe('escolherVozesDeExemplo', () => {
  it('três de cada gênero, da mais natural para a menos', () => {
    const escolhidas = escolherVozesDeExemplo([
      voz('f1', 'feminina', 'Calm'),
      voz('f2', 'feminina', 'Warm conversational friendly'),
      voz('f3', 'feminina', 'Casual'),
      voz('f4', 'feminina', 'Social conversational'),
      voz('m1', 'masculina', 'Friendly conversational'),
      voz('m2', 'masculina', 'Casual'),
      voz('m3', 'masculina', 'Warm'),
    ])
    expect(escolhidas.map((item) => item.id)).toEqual(['f2', 'f4', 'f1', 'm1', 'm2', 'm3'])
  })

  it('voz de locução nunca entra, mesmo faltando voz', () => {
    const escolhidas = escolherVozesDeExemplo([
      voz('narradora', 'feminina', 'News announcer'),
      voz('m1', 'masculina', 'Friendly conversational'),
    ])
    expect(escolhidas.map((item) => item.id)).not.toContain('narradora')
  })

  it('o que faltar vem das vozes prontas, sem repetir', () => {
    const escolhidas = escolherVozesDeExemplo([voz('m1', 'masculina', 'Casual')])
    expect(escolhidas).toHaveLength(VOZES_POR_GENERO * 2)
    expect(escolhidas.filter((item) => item.genero === 'feminina')).toHaveLength(3)
    expect(escolhidas.filter((item) => item.genero === 'masculina')).toHaveLength(3)
    expect(new Set(escolhidas.map((item) => item.id)).size).toBe(6)
  })

  it('as preferidas entram primeiro, na ordem, mesmo de narração ou de outro idioma; as evitadas saem', () => {
    const escolhidas = escolherVozesDeExemplo([
      voz('r1KmysJdVYZjJCm4mL3b', 'feminina', 'Playful warm conversational'),
      voz('GDzHdQOi6jjf8zaXhCYD', 'feminina', 'Brazilian conversational friendly'),
      voz('f2', 'feminina', 'Friendly conversational'),
      voz('EST9Ui6982FZPSi7gCHi', 'feminina', 'Warm natural', 'american', ['en']),
      voz('lWq4KDY8znfkV0DrK8Vb', 'feminina', 'Narrative story, calm'),
      voz('inglesa', 'feminina', 'Friendly conversational', 'british', ['en']),
    ])
    expect(escolhidas.filter((item) => item.genero === 'feminina').map((item) => item.id)).toEqual([
      'lWq4KDY8znfkV0DrK8Vb',
      'EST9Ui6982FZPSi7gCHi',
      'f2',
    ])
  })

  it('voz de outro idioma que não é preferida não entra', () => {
    const escolhidas = escolherVozesDeExemplo([
      voz('inglesa', 'feminina', 'Friendly conversational', 'british', ['en']),
    ])
    expect(escolhidas.map((item) => item.id)).not.toContain('inglesa')
  })

  it('sem catálogo, são as seis prontas', () => {
    expect(escolherVozesDeExemplo([]).map((item) => item.id)).toEqual(VOZES_PRONTAS.map((item) => item.id))
  })
})
