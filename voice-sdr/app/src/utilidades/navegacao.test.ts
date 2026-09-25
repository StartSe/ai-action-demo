import { describe, expect, it } from 'vitest'

import { ehItemAtivo, rotuloDoCaminho } from '@/utilidades/navegacao'

describe('ehItemAtivo', () => {
  it('marca o painel apenas na raiz', () => {
    expect(ehItemAtivo('/', '/')).toBe(true)
    expect(ehItemAtivo('/', '/leads')).toBe(false)
  })

  it('marca o item no caminho dele e nos caminhos filhos', () => {
    expect(ehItemAtivo('/leads', '/leads')).toBe(true)
    expect(ehItemAtivo('/leads', '/leads/importar')).toBe(true)
    expect(ehItemAtivo('/leads', '/leads-antigos')).toBe(false)
  })
})

describe('rotuloDoCaminho', () => {
  it('devolve o rótulo do item aberto', () => {
    expect(rotuloDoCaminho('/')).toBe('Painel')
    expect(rotuloDoCaminho('/config/equipe')).toBe('Equipe')
  })

  it('num caminho filho, devolve o rótulo do item mais específico', () => {
    expect(rotuloDoCaminho('/leads/importar')).toBe('Leads')
    expect(rotuloDoCaminho('/sarah/voz')).toBe('Voz')
  })

  it('caminho fora da trilha não tem rótulo', () => {
    expect(rotuloDoCaminho('/configuracao-inicial')).toBeUndefined()
  })
})
