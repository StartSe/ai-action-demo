import { describe, expect, it } from 'vitest'

import { blocosDoResumo, campoDaChave, escreverChave } from '@/reunioes/resumo-de-passagem'

const PALAVRAS = { sim: 'Sim', nao: 'Não' }

describe('blocosDoResumo', () => {
  it('texto solto vira um bloco só, o resumo', () => {
    expect(blocosDoResumo('  Quer reduzir o custo de atendimento.  ', PALAVRAS)).toEqual([
      { campo: 'resumo', chave: 'resumo', conteudo: { tipo: 'texto', texto: 'Quer reduzir o custo de atendimento.' } },
    ])
  })

  it('nulo, vazio e objeto sem nada legível voltam sem bloco', () => {
    expect(blocosDoResumo(null, PALAVRAS)).toEqual([])
    expect(blocosDoResumo('   ', PALAVRAS)).toEqual([])
    expect(blocosDoResumo({}, PALAVRAS)).toEqual([])
    expect(blocosDoResumo({ dor: '', prazo: null, objecoes: [] }, PALAVRAS)).toEqual([])
  })

  it('campos conhecidos vêm primeiro, na ordem da passagem, e os desconhecidos depois, na ordem de chegada', () => {
    const blocos = blocosDoResumo(
      {
        canal_preferido: 'WhatsApp',
        budget: 'R$ 20 mil',
        pain: 'Fila de atendimento de dois dias',
        resumo: 'Diretora de operações, quer piloto.',
        ultimaCompra: 2024,
      },
      PALAVRAS,
    )
    expect(blocos.map((bloco) => [bloco.campo, bloco.chave])).toEqual([
      ['resumo', 'resumo'],
      ['dor', 'pain'],
      ['orcamento', 'budget'],
      [null, 'canal_preferido'],
      [null, 'ultimaCompra'],
    ])
    expect(blocos[4]?.conteudo).toEqual({ tipo: 'texto', texto: '2024' })
  })

  it('lista vira itens, objeto dentro de lista vira um item com os valores lado a lado', () => {
    const [bloco] = blocosDoResumo(
      { objecoes: ['Preço', { tema: 'Integração', detalhe: 'usa CRM próprio' }, '', null] },
      PALAVRAS,
    )
    expect(bloco?.conteudo).toEqual({
      tipo: 'lista',
      itens: [
        { chave: null, texto: 'Preço' },
        { chave: null, texto: 'Integração · usa CRM próprio' },
      ],
    })
  })

  it('objeto dentro de bloco vira um item por chave, e valor lógico sai em palavra', () => {
    const [bloco] = blocosDoResumo(
      { contexto: { empresa: 'Aurora', funcionarios: 120, usa_concorrente: false, areas: ['vendas', 'suporte'] } },
      PALAVRAS,
    )
    expect(bloco?.conteudo).toEqual({
      tipo: 'lista',
      itens: [
        { chave: 'empresa', texto: 'Aurora' },
        { chave: 'funcionarios', texto: '120' },
        { chave: 'usa_concorrente', texto: 'Não' },
        { chave: 'areas', texto: 'vendas, suporte' },
      ],
    })
  })

  it('lista no topo é o resumo em itens', () => {
    expect(blocosDoResumo(['Quer piloto', 'Decide com o CFO'], PALAVRAS)).toEqual([
      {
        campo: 'resumo',
        chave: 'resumo',
        conteudo: {
          tipo: 'lista',
          itens: [
            { chave: null, texto: 'Quer piloto' },
            { chave: null, texto: 'Decide com o CFO' },
          ],
        },
      },
    ])
  })
})

describe('campoDaChave e escreverChave', () => {
  it('reconhece a chave com acento, em inglês e em qualquer grafia', () => {
    expect(campoDaChave('Orçamento')).toBe('orcamento')
    expect(campoDaChave('next_steps')).toBe('proximosPassos')
    expect(campoDaChave('próximos-passos')).toBe('proximosPassos')
    expect(campoDaChave('decisionMaker')).toBe('decisor')
    expect(campoDaChave('canal')).toBeNull()
  })

  it('escreve a chave desconhecida como gente', () => {
    expect(escreverChave('canal_preferido')).toBe('Canal preferido')
    expect(escreverChave('ultimaCompra')).toBe('Ultima compra')
    expect(escreverChave('tamanho-do-time')).toBe('Tamanho do time')
  })
})
