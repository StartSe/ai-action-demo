import { describe, expect, it } from 'vitest'

import {
  LEAD_DE_EXEMPLO,
  MARCADORES_DA_PRIMEIRA_FALA,
  interpolarPrimeiraFala,
  marcadoresDe,
  marcadoresDesconhecidos,
  valoresDaConta,
} from './primeira-fala.ts'

const IDENTIDADE = {
  nome: 'Sarah',
  empresa: 'Vexo Tecnologia',
  nuncaAfirmar: ['garantia de resultado', 'preço fechado'],
}

describe('os marcadores da primeira fala', () => {
  it('lê os marcadores escritos, sem repetir', () => {
    const marcadores = marcadoresDe(
      'Oi, {nome_do_lead}? Aqui é a {nome_do_agente}, {nome_do_agente}.',
    )

    expect(marcadores).toEqual(['nome_do_lead', 'nome_do_agente'])
  })

  it('a lista conhecida cobre o que a conta preenche, o que a ligação preenche e o lead da semente', () => {
    expect(MARCADORES_DA_PRIMEIRA_FALA).toContain('nome_do_agente')
    expect(MARCADORES_DA_PRIMEIRA_FALA).toContain('nome_do_lead')
    expect(MARCADORES_DA_PRIMEIRA_FALA).toContain('empresa_do_lead')
  })

  it('a lista não repete o marcador que está nas duas origens', () => {
    // `nome_do_lead` é da chamada e é também chave do lead da semente.
    // Repetido, ele apareceria duas vezes na lista que a tela desenha e duas
    // vezes na frase que a recusa monta.
    expect(MARCADORES_DA_PRIMEIRA_FALA).toHaveLength(
      new Set(MARCADORES_DA_PRIMEIRA_FALA).size,
    )
  })

  it('marcador que ninguém preenche é denunciado pelo nome', () => {
    const desconhecidos = marcadoresDesconhecidos(
      'Oi, {nome_do_lead}, tudo bem no {cargo}? Aqui é a {nome_do_agente} do {setor}.',
    )

    expect(desconhecidos).toEqual(['cargo', 'setor'])
  })

  it('texto só com marcadores conhecidos não tem o que denunciar', () => {
    expect(
      marcadoresDesconhecidos('Oi, {nome_do_lead}! Aqui é a {nome_do_agente}, da {empresa}.'),
    ).toEqual([])
  })
})

describe('a interpolação da primeira fala', () => {
  it('o que a conta preenche vem da identidade e o que a ligação preencheria vem da semente', () => {
    const falado = interpolarPrimeiraFala(
      'Oi, {nome_do_lead}, da {empresa_do_lead}? Aqui é a {nome_do_agente}, da {empresa}.',
      IDENTIDADE,
    )

    expect(falado).toBe(
      'Oi, Marcos Ferreira, da Fluxo Cargo? Aqui é a Sarah, da Vexo Tecnologia.',
    )
    expect(falado).toContain(LEAD_DE_EXEMPLO.nome_do_lead)
  })

  it('marcador desconhecido some, sem deixar espaço nem vírgula órfã', () => {
    expect(interpolarPrimeiraFala('Oi, {cargo}! Aqui é a {nome_do_agente}.', IDENTIDADE)).toBe(
      'Oi! Aqui é a Sarah.',
    )
  })

  it('a conta sem lista de restrições não fala "undefined"', () => {
    const valores = valoresDaConta({ ...IDENTIDADE, nuncaAfirmar: [] })

    expect(valores.nunca_afirmar).toBe('a conta não listou nada')
  })
})
