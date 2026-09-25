import { describe, expect, it } from 'vitest'

import { linhasDaAvaliacao } from '@/chamadas/avaliacao'
import { motivoDaFalha } from '@/copy/ferramentas'

describe('linhasDaAvaliacao', () => {
  const criterios = [
    { chave: 'aviso_gravacao', rotulo: 'Avisou da gravação' },
    { chave: 'orcamento', rotulo: 'Perguntou o orçamento' },
  ]

  it('segue a ordem dos critérios da conta, com o rótulo dela', () => {
    const linhas = linhasDaAvaliacao(
      [
        { criterio: 'orcamento', aprovado: false, evidencia: null },
        { criterio: 'aviso_gravacao', aprovado: true, evidencia: 'essa ligação é gravada' },
      ],
      criterios,
    )
    expect(linhas).toEqual([
      { chave: 'aviso_gravacao', rotulo: 'Avisou da gravação', aprovado: true, evidencia: 'essa ligação é gravada' },
      { chave: 'orcamento', rotulo: 'Perguntou o orçamento', aprovado: false, evidencia: null },
    ])
  })

  it('critério que saiu da conta continua, no fim, com o rótulo da semente ou a chave', () => {
    const linhas = linhasDaAvaliacao(
      [
        { criterio: 'criterio_apagado', aprovado: null, evidencia: null },
        { criterio: 'identificacao_honesta', aprovado: true, evidencia: 'aqui é a Sarah' },
        { criterio: 'orcamento', aprovado: true, evidencia: null },
      ],
      criterios,
    )
    expect(linhas.map((linha) => [linha.chave, linha.rotulo])).toEqual([
      ['orcamento', 'Perguntou o orçamento'],
      ['criterio_apagado', 'criterio_apagado'],
      ['identificacao_honesta', 'Disse quem é e de onde fala na abertura'],
    ])
  })

  it('sem itens, nenhuma linha', () => {
    expect(linhasDaAvaliacao([], criterios)).toEqual([])
  })
})

describe('motivoDaFalha: o erro da ferramenta em português', () => {
  it.each([
    ['falha_do_efeito: insert failed', 'A ferramenta decidiu, mas não conseguiu gravar o resultado.'],
    ['prazo_estourado: 4000 ms', 'A ferramenta demorou demais e a assistente seguiu sem a resposta.'],
    ['etapa_desconhecida', 'A etapa informada não existe no funil da conta.'],
  ])('%s', (erro, frase) => {
    expect(motivoDaFalha(erro)).toBe(frase)
  })

  it('texto livre do provedor vira a frase genérica, sem o texto cru', () => {
    const frase = motivoDaFalha('Error: upstream 502 Bad Gateway')
    expect(frase).toBe('O provedor registrou uma falha que esta ficha não sabe descrever.')
    expect(motivoDaFalha('constructor')).toBe(frase)
  })
})
