import { describe, expect, it } from 'vitest'

import {
  acaoDoItem,
  acaoEscreve,
  estadoDaLista,
  fatiaQueEntrega,
  filtrarPorTipo,
  INTERVALO_DA_RECARGA_MS,
  intervaloDaRecarga,
  ordenarItens,
} from '@/fila/consulta'
import { lerContexto } from '@/fila/leitura'
import type { ItemDaFila } from '@/fila/tipos'

function item(extras: Partial<ItemDaFila> = {}): ItemDaFila {
  return {
    id: 'e-1',
    tipo: 'pedido_humano',
    severidade: 'alta',
    criadoEm: '2026-09-24T11:00:00.000Z',
    lead: { id: 'l-1', nome: 'Marcos Ferreira', telefone: '+5548999998888' },
    chamadaId: 'c-1',
    gravacao: 'disponivel',
    contexto: lerContexto({}),
    limiares: [],
    resolucao: null,
    ...extras,
  }
}

describe('ordenarItens', () => {
  it('severidade primeiro, depois o mais recente', () => {
    const itens = [
      item({ id: 'baixa-nova', severidade: 'baixa', criadoEm: '2026-09-24T12:00:00.000Z' }),
      item({ id: 'alta-velha', severidade: 'alta', criadoEm: '2026-09-24T08:00:00.000Z' }),
      item({ id: 'media', severidade: 'media', criadoEm: '2026-09-24T10:00:00.000Z' }),
      item({ id: 'alta-nova', severidade: 'alta', criadoEm: '2026-09-24T11:00:00.000Z' }),
    ]
    expect(ordenarItens(itens).map((cada) => cada.id)).toEqual([
      'alta-nova',
      'alta-velha',
      'media',
      'baixa-nova',
    ])
  })

  it('nos resolvidos, o instante é o da resolução', () => {
    const itens = [
      item({ id: 'a', criadoEm: '2026-09-24T12:00:00.000Z', resolucao: { autor: 'u', em: '2026-09-24T12:05:00.000Z', texto: 'x' } }),
      item({ id: 'b', criadoEm: '2026-09-24T09:00:00.000Z', resolucao: { autor: 'u', em: '2026-09-24T13:00:00.000Z', texto: 'x' } }),
    ]
    expect(ordenarItens(itens).map((cada) => cada.id)).toEqual(['b', 'a'])
  })

  it('não muda a lista recebida', () => {
    const itens = [item({ id: 'b', severidade: 'baixa' }), item({ id: 'a' })]
    ordenarItens(itens)
    expect(itens.map((cada) => cada.id)).toEqual(['b', 'a'])
  })
})

describe('filtrarPorTipo', () => {
  const itens = [item({ id: 'h' }), item({ id: 's', tipo: 'sentimento_negativo' })]

  it('todos devolve a lista inteira', () => {
    expect(filtrarPorTipo(itens, 'todos')).toHaveLength(2)
  })

  it('um tipo devolve só ele', () => {
    expect(filtrarPorTipo(itens, 'sentimento_negativo').map((cada) => cada.id)).toEqual(['s'])
  })
})

describe('estadoDaLista', () => {
  it('conta sem item nenhum é a fila nunca preenchida', () => {
    expect(estadoDaLista(false, 0)).toBe('nunca_preenchida')
  })

  it('conta com itens e recorte vazio é o recorte sem resultado', () => {
    expect(estadoDaLista(true, 0)).toBe('recorte_vazio')
  })

  it('com itens no recorte, a lista aparece', () => {
    expect(estadoDaLista(true, 2)).toBe('com_itens')
  })
})

describe('intervaloDaRecarga', () => {
  it('assinatura de pé dispensa a recarga', () => {
    expect(intervaloDaRecarga('ativa')).toBe(false)
    expect(intervaloDaRecarga('conectando')).toBe(false)
  })

  it('assinatura indisponível liga a recarga por intervalo', () => {
    expect(intervaloDaRecarga('indisponivel')).toBe(INTERVALO_DA_RECARGA_MS)
  })
})

describe('fatiaQueEntrega', () => {
  it('reunião sem especialista chega com a F5', () => {
    expect(fatiaQueEntrega('reuniao_sem_especialista')).toBe('F5')
  })

  it('os outros tipos já têm produtor', () => {
    expect(fatiaQueEntrega('sentimento_negativo')).toBeNull()
  })
})

describe('acaoDoItem', () => {
  it.each([
    ['pedido_humano', { tipo: 'ligar', telefone: '+5548999998888' }],
    ['pedido_bloqueio', { tipo: 'confirmar_bloqueio', telefone: '+5548999998888' }],
    ['sentimento_negativo', { tipo: 'abrir_chamada', chamadaId: 'c-1' }],
    ['classificacao_pendente', { tipo: 'abrir_chamada', chamadaId: 'c-1' }],
    ['avaliacao_reprovada', { tipo: 'abrir_avaliacao', chamadaId: 'c-1' }],
    ['falha_repetida', { tipo: 'abrir_lead', leadId: 'l-1' }],
    ['credito_baixo', { tipo: 'abrir_integracoes' }],
  ] as const)('%s tem ação própria', (tipo, esperado) => {
    expect(acaoDoItem(item({ tipo }))).toEqual(esperado)
  })

  it('reunião sem especialista não tem ação nesta fase', () => {
    expect(acaoDoItem(item({ tipo: 'reuniao_sem_especialista' }))).toBeNull()
  })

  it('sem o dado que a ação pede, não há ação', () => {
    expect(acaoDoItem(item({ tipo: 'falha_repetida', lead: null }))).toBeNull()
    expect(acaoDoItem(item({ tipo: 'sentimento_negativo', chamadaId: null }))).toBeNull()
    expect(acaoDoItem(item({ tipo: 'pedido_bloqueio', lead: null }))).toBeNull()
  })

  it('lead removido ainda deixa o telefone do contexto', () => {
    expect(
      acaoDoItem(
        item({ tipo: 'pedido_bloqueio', lead: null, contexto: lerContexto({ phone_e164: '+5511988887777' }) }),
      ),
    ).toEqual({ tipo: 'confirmar_bloqueio', telefone: '+5511988887777' })
  })

  it('só confirmar o bloqueio escreve', () => {
    expect(acaoEscreve({ tipo: 'confirmar_bloqueio', telefone: 'x' })).toBe(true)
    expect(acaoEscreve({ tipo: 'abrir_integracoes' })).toBe(false)
  })
})
