// O estado de uma entrada da base, lido das colunas (US-085).
//
// A tabela não tem campo `status`, e é deliberado: um campo assim seria uma
// segunda verdade ao lado de `provider_doc_id`, `indexed_at`, `sync_error` e
// `removed_at`, e as duas divergiriam na primeira falha de sincronização.
// Quem traduz as quatro colunas em uma palavra é `estadoDaEntrada`, e a ordem
// das perguntas dela é o que este arquivo guarda.

import { describe, expect, test } from 'vitest'

import {
  escreverEtiquetas,
  esperaSincronizacao,
  estadoDaEntrada,
  lerEtiquetas,
  mudouDesdeAIndexacao,
  podeGravar,
  quantasEsperam,
} from '@/sarah/conhecimento'
import type { EntradaDeConhecimento } from '@/sarah/tipos'

function entrada(mudanca: Partial<EntradaDeConhecimento> = {}): EntradaDeConhecimento {
  return {
    id: 'entrada-1',
    pergunta: 'Quanto custa a manutenção?',
    resposta: 'Entre R$ 800 e R$ 2.000 por mês.',
    etiquetas: ['preço'],
    origem: 'manual',
    documento: null,
    indexadaEm: null,
    erro: null,
    removidaEm: null,
    alteradaDepoisDeIndexada: false,
    atualizadaEm: '2026-09-24T12:00:00.000Z',
    ...mudanca,
  }
}

describe('estadoDaEntrada', () => {
  test('escrita e nunca enviada é pendente', () => {
    expect(estadoDaEntrada(entrada())).toBe('pendente')
  })

  test('com documento e data de indexação está no ar', () => {
    expect(
      estadoDaEntrada(entrada({ documento: 'doc-1', indexadaEm: '2026-09-24T12:05:00.000Z' })),
    ).toBe('indexada')
  })

  test('no ar com texto mudado é alterada, e não indexada', () => {
    // É o caso em que alguém acha que corrigiu a Sarah e não corrigiu: ela
    // ainda responde o texto anterior.
    expect(
      estadoDaEntrada(
        entrada({
          documento: 'doc-1',
          indexadaEm: '2026-09-24T12:05:00.000Z',
          alteradaDepoisDeIndexada: true,
        }),
      ),
    ).toBe('alterada')
  })

  test('marcada para sair vence tudo', () => {
    // A entrada que está saindo não é mais nenhuma das outras coisas, nem
    // mesmo quando a última sincronização falhou.
    expect(
      estadoDaEntrada(
        entrada({
          documento: 'doc-1',
          indexadaEm: '2026-09-24T12:05:00.000Z',
          erro: 'anexo_recusado',
          removidaEm: '2026-09-24T13:00:00.000Z',
        }),
      ),
    ).toBe('removendo')
  })

  test('erro vence indexada: o que precisa ser visto é a falha', () => {
    // Uma entrada pode estar no ar **e** ter falhado ao atualizar.
    expect(
      estadoDaEntrada(
        entrada({
          documento: 'doc-1',
          indexadaEm: '2026-09-24T12:05:00.000Z',
          erro: 'envio_recusado',
        }),
      ),
    ).toBe('erro')
  })

  test('documento sem data de indexação continua pendente', () => {
    // O provedor aceitou o documento e a confirmação não voltou: dizer "no ar"
    // aqui afirmaria que a Sarah já sabe.
    expect(estadoDaEntrada(entrada({ documento: 'doc-1' }))).toBe('pendente')
  })
})

describe('esperaSincronizacao', () => {
  test('só a indexada em dia não espera nada', () => {
    const emDia = entrada({ documento: 'doc-1', indexadaEm: '2026-09-24T12:05:00.000Z' })
    expect(esperaSincronizacao(emDia)).toBe(false)

    expect(esperaSincronizacao(entrada())).toBe(true)
    expect(esperaSincronizacao(entrada({ erro: 'envio_recusado' }))).toBe(true)
    expect(esperaSincronizacao(entrada({ removidaEm: '2026-09-24T13:00:00.000Z' }))).toBe(true)
    expect(
      esperaSincronizacao(
        entrada({ documento: 'doc-1', indexadaEm: 'x', alteradaDepoisDeIndexada: true }),
      ),
    ).toBe(true)
  })

  test('a contagem é o que o botão mostra', () => {
    const lista = [
      entrada({ id: 'a' }),
      entrada({ id: 'b', documento: 'doc-b', indexadaEm: 'x' }),
      entrada({ id: 'c', erro: 'envio_recusado' }),
    ]
    expect(quantasEsperam(lista)).toBe(2)
  })
})

describe('mudouDesdeAIndexacao', () => {
  test('entrada nunca indexada não está alterada', () => {
    // Sem hash não há com o que comparar, e dizer "alterada" aqui poria a
    // entrada pendente num estado que ela não tem.
    return expect(
      mudouDesdeAIndexacao({ pergunta: 'p', resposta: 'r' }, null),
    ).resolves.toBe(false)
  })

  test('o mesmo texto dá o mesmo hash', async () => {
    const { hashDoDocumento, documentoDaEntrada } = await import('@conhecimento/sincronizacao.ts')
    const hash = await hashDoDocumento(documentoDaEntrada({ question: 'p', answer: 'r' }))

    expect(await mudouDesdeAIndexacao({ pergunta: 'p', resposta: 'r' }, hash)).toBe(false)
    // Trocar a resposta muda o hash; trocar a etiqueta não passa por aqui, e é
    // por isso que a comparação é de hash e não de `updated_at`.
    expect(await mudouDesdeAIndexacao({ pergunta: 'p', resposta: 'outra' }, hash)).toBe(true)
  })
})

describe('as etiquetas', () => {
  test('separadas por vírgula, aparadas, sem repetição e em minúscula', () => {
    expect(lerEtiquetas(' Preço , manutenção,  preço ,, ')).toEqual(['preço', 'manutenção'])
  })

  test('o caminho de volta é o do campo de edição', () => {
    expect(escreverEtiquetas(['preço', 'manutenção'])).toBe('preço, manutenção')
    expect(lerEtiquetas(escreverEtiquetas(['preço', 'manutenção']))).toEqual([
      'preço',
      'manutenção',
    ])
  })
})

describe('podeGravar', () => {
  test('exige pergunta e resposta com conteúdo', () => {
    expect(podeGravar('Quanto custa?', 'Entre 800 e 2000.')).toBe(true)
    expect(podeGravar('   ', 'Entre 800 e 2000.')).toBe(false)
    expect(podeGravar('Quanto custa?', 'ok')).toBe(false)
  })

  test('recusa o que passa do teto', () => {
    expect(podeGravar('a'.repeat(501), 'resposta boa')).toBe(false)
    expect(podeGravar('pergunta boa', 'a'.repeat(4_001))).toBe(false)
  })
})
