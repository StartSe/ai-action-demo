import { describe, expect, test } from 'vitest'

import {
  compararItens,
  montarLinhaDoTempo,
  type EventoDoLead,
  type LigacaoDoLead,
} from '@/leads/linha-do-tempo'

function evento(parcial: Partial<EventoDoLead> & Pick<EventoDoLead, 'id' | 'kind' | 'ocorridoEm'>): EventoDoLead {
  return { ator: 'user', autorId: 'u-1', chamadaId: null, payload: {}, ...parcial }
}

const LIGACAO: LigacaoDoLead = {
  id: 'c-1',
  direcao: 'outbound',
  proposito: 'discovery',
  iniciadaEm: '2026-09-10T14:00:00Z',
  duracaoSeg: 184,
  motivoDoFim: 'completed',
  caminhoDaGravacao: 'conta/c-1.mp3',
  gravacaoExpiraEm: null,
}

const NOMES = new Map([['u-1', 'Renata Lima']])

describe('compararItens', () => {
  test('o mais recente vem primeiro, com instantes em fusos de escrita diferentes', () => {
    const antigo = { id: 'a', kind: 'note', em: '2026-09-10T14:00:00+00:00' }
    const novo = { id: 'b', kind: 'note', em: '2026-09-10T11:30:00-03:00' }
    expect([antigo, novo].sort(compararItens).map((item) => item.id)).toEqual(['b', 'a'])
  })

  test('no mesmo instante, desempata por kind e depois por id', () => {
    const em = '2026-09-10T14:00:00Z'
    const itens = [
      { id: 'z', kind: 'note', em },
      { id: 'b', kind: 'blocked', em },
      { id: 'a', kind: 'note', em },
      { id: 'c', kind: 'call', em },
    ]
    expect([...itens].sort(compararItens).map((item) => item.id)).toEqual(['b', 'c', 'a', 'z'])
  })

  test('a ordem não depende da ordem de chegada', () => {
    const em = '2026-09-10T14:00:00Z'
    const itens = [
      { id: '2', kind: 'note', em },
      { id: '1', kind: 'note', em },
      { id: '3', kind: 'blocked', em: '2026-09-11T00:00:00Z' },
      { id: '4', kind: 'call', em },
    ]
    const uma = [...itens].sort(compararItens).map((item) => item.id)
    const outra = [...itens].reverse().sort(compararItens).map((item) => item.id)
    expect(uma).toEqual(outra)
    expect(uma).toEqual(['3', '4', '1', '2'])
  })
})

describe('montarLinhaDoTempo', () => {
  test('mistura ligação, etapa, bloqueio e nota numa lista só, do mais recente ao mais antigo', () => {
    const itens = montarLinhaDoTempo({
      eventos: [
        evento({ id: 'e1', kind: 'call', ocorridoEm: '2026-09-10T14:00:00Z', ator: 'agent', autorId: null, chamadaId: 'c-1' }),
        evento({
          id: 'e2',
          kind: 'stage_change',
          ocorridoEm: '2026-09-10T14:05:00Z',
          payload: { de: { key: 'new', label: 'Novo' }, para: { key: 'qualified', label: 'Qualificado' } },
        }),
        evento({ id: 'e3', kind: 'note', ocorridoEm: '2026-09-12T09:00:00Z', payload: { texto: 'Pediu retorno.' } }),
        evento({ id: 'e4', kind: 'blocked', ocorridoEm: '2026-09-11T09:00:00Z', payload: { motivo: 'Pediu para não ligar' } }),
      ],
      ligacoes: [LIGACAO],
      nomes: NOMES,
    })

    expect(itens.map((item) => item.tipo)).toEqual(['nota', 'bloqueio', 'etapa', 'ligacao'])
    const etapa = itens[2]
    expect(etapa).toMatchObject({ tipo: 'etapa', de: 'Novo', para: 'Qualificado', autor: { ator: 'user', nome: 'Renata Lima' } })
    expect(itens[3]).toMatchObject({ tipo: 'ligacao', ligacao: LIGACAO })
  })

  test('a mudança de etapa diz o rótulo gravado no evento, não o de agora', () => {
    const [item] = montarLinhaDoTempo({
      eventos: [
        evento({
          id: 'e1',
          kind: 'stage_change',
          ocorridoEm: '2026-09-10T14:05:00Z',
          payload: { de: null, para: { key: 'qualified', label: 'Qualificado' } },
        }),
      ],
      ligacoes: [],
      nomes: NOMES,
    })
    expect(item).toMatchObject({ tipo: 'etapa', de: null, para: 'Qualificado' })
  })

  test('ligação sem a linha de calls se desenha pelo retrato do evento', () => {
    const [item] = montarLinhaDoTempo({
      eventos: [
        evento({
          id: 'e1',
          kind: 'call',
          ocorridoEm: '2026-09-10T14:00:00Z',
          ator: 'agent',
          autorId: null,
          chamadaId: 'c-9',
          payload: { direction: 'inbound', purpose: 'rescue', duration_sec: 30, end_reason: 'no_answer' },
        }),
      ],
      ligacoes: [],
      nomes: NOMES,
    })
    expect(item).toMatchObject({
      tipo: 'ligacao',
      ligacao: { id: 'c-9', direcao: 'inbound', proposito: 'rescue', duracaoSeg: 30, motivoDoFim: 'no_answer', caminhoDaGravacao: null },
    })
  })

  test('evento sem o que dizer fica fora, em vez de virar item vazio', () => {
    const itens = montarLinhaDoTempo({
      eventos: [
        evento({ id: 'e1', kind: 'note', ocorridoEm: '2026-09-10T14:00:00Z', payload: { texto: '   ' } }),
        evento({ id: 'e2', kind: 'stage_change', ocorridoEm: '2026-09-10T14:00:00Z', payload: {} }),
        evento({ id: 'e3', kind: 'call', ocorridoEm: '2026-09-10T14:00:00Z' }),
        evento({ id: 'e4', kind: 'lead_updated', ocorridoEm: '2026-09-10T14:00:00Z' }),
        evento({ id: 'e5', kind: 'inventado', ocorridoEm: '2026-09-10T14:00:00Z' }),
      ],
      ligacoes: [],
      nomes: NOMES,
    })
    expect(itens).toEqual([])
  })

  test('autor que saiu da conta fica sem nome, e o item continua', () => {
    const [item] = montarLinhaDoTempo({
      eventos: [evento({ id: 'e1', kind: 'unblocked', ocorridoEm: '2026-09-10T14:00:00Z', autorId: 'u-saiu' })],
      ligacoes: [],
      nomes: NOMES,
    })
    expect(item).toMatchObject({ tipo: 'desbloqueio', autor: { ator: 'user', nome: null } })
  })

  test('a reunião entra na mesma lista e na mesma ordem', () => {
    const itens = montarLinhaDoTempo({
      eventos: [evento({ id: 'e1', kind: 'note', ocorridoEm: '2026-09-10T14:00:00Z', payload: { texto: 'Antes.' } })],
      ligacoes: [],
      nomes: NOMES,
      reunioes: [{ id: 'm-1', em: '2026-09-15T13:00:00Z', estado: 'scheduled' }],
    })
    expect(itens.map((item) => item.tipo)).toEqual(['reuniao', 'nota'])
  })

  test('a conversa de WhatsApp entra como item, com a ação e a conversa que ela aponta', () => {
    const [item] = montarLinhaDoTempo({
      eventos: [
        evento({
          id: 'e1',
          kind: 'whatsapp',
          ocorridoEm: '2026-09-10T14:00:00Z',
          ator: 'agent',
          autorId: null,
          payload: { acao: 'iniciada', conversation_id: 'w-1' },
        }),
      ],
      ligacoes: [],
      nomes: NOMES,
    })
    expect(item).toMatchObject({
      tipo: 'whatsapp',
      acao: 'iniciada',
      conversaId: 'w-1',
      motivo: null,
      autor: { ator: 'agent' },
    })
  })

  test('ação de WhatsApp que a tela ainda não conhece vira item genérico, e não some', () => {
    const [item] = montarLinhaDoTempo({
      eventos: [
        evento({
          id: 'e1',
          kind: 'whatsapp',
          ocorridoEm: '2026-09-10T14:00:00Z',
          payload: { acao: 'transferida_para_outro_canal', conversation_id: 'w-2' },
        }),
      ],
      ligacoes: [],
      nomes: NOMES,
    })
    expect(item).toMatchObject({ tipo: 'whatsapp', acao: null, conversaId: 'w-2' })
  })

  test('o pedido de humano por WhatsApp é uma ação conhecida', () => {
    const [item] = montarLinhaDoTempo({
      eventos: [
        evento({
          id: 'e1',
          kind: 'whatsapp',
          ocorridoEm: '2026-09-10T14:00:00Z',
          ator: 'agent',
          autorId: null,
          payload: { acao: 'pedido_humano', conversation_id: 'w-4', motivo: 'pedido_do_lead' },
        }),
      ],
      ligacoes: [],
      nomes: NOMES,
    })
    expect(item).toMatchObject({ tipo: 'whatsapp', acao: 'pedido_humano', motivo: 'pedido_do_lead' })
  })

  test('o pedido de humano por WhatsApp guarda o motivo', () => {
    const [item] = montarLinhaDoTempo({
      eventos: [
        evento({
          id: 'e1',
          kind: 'whatsapp',
          ocorridoEm: '2026-09-10T14:00:00Z',
          ator: 'system',
          autorId: null,
          payload: { acao: 'iniciada', conversation_id: 'w-3', motivo: 'modelo_nao_conectado' },
        }),
      ],
      ligacoes: [],
      nomes: NOMES,
    })
    expect(item).toMatchObject({ tipo: 'whatsapp', motivo: 'modelo_nao_conectado' })
  })

  test('a decisão da automação entra como item, com a ação e as tentativas (F6)', () => {
    const [esgotado, desconhecido] = montarLinhaDoTempo({
      eventos: [
        evento({
          id: 'e1',
          kind: 'automation',
          ocorridoEm: '2026-09-10T14:00:00Z',
          ator: 'system',
          autorId: null,
          payload: { acao: 'resgates_esgotados', tentativas: 2 },
        }),
        evento({
          id: 'e2',
          kind: 'automation',
          ocorridoEm: '2026-09-09T14:00:00Z',
          payload: { acao: 'algo_novo' },
        }),
      ],
      ligacoes: [],
      nomes: NOMES,
    })
    expect(esgotado).toMatchObject({ tipo: 'automacao', acao: 'resgates_esgotados', tentativas: 2, autor: { ator: 'system' } })
    expect(desconhecido).toMatchObject({ tipo: 'automacao', acao: null, tentativas: null })
  })
})
