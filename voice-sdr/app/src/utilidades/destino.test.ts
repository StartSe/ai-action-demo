import { describe, expect, it } from 'vitest'

import { destinoSeguro } from '@/utilidades/destino'

describe('destinoSeguro', () => {
  it('aceita caminho da própria aplicação, com busca e âncora', () => {
    expect(destinoSeguro('/leads')).toBe('/leads')
    expect(destinoSeguro('/leads/42?aba=chamadas')).toBe('/leads/42?aba=chamadas')
  })

  it('recusa endereço externo', () => {
    expect(destinoSeguro('https://outro.site/roubo')).toBeUndefined()
    expect(destinoSeguro('//outro.site/roubo')).toBeUndefined()
    expect(destinoSeguro('/\\outro.site')).toBeUndefined()
  })

  it('recusa as próprias rotas de autenticação, que dariam laço', () => {
    expect(destinoSeguro('/entrar')).toBeUndefined()
    expect(destinoSeguro('/entrar?destino=/leads')).toBeUndefined()
    expect(destinoSeguro('/recuperar-senha')).toBeUndefined()
  })

  it('recusa o que não é caminho', () => {
    expect(destinoSeguro(undefined)).toBeUndefined()
    expect(destinoSeguro(42)).toBeUndefined()
    expect(destinoSeguro('leads')).toBeUndefined()
  })
})
