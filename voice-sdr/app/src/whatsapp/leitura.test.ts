import { describe, expect, test } from 'vitest'

import {
  filtrarPorStatus,
  identificacaoDaConversa,
  ordenarConversas,
  paraConversaDaLista,
  paraConversaDetalhe,
  paraMensagem,
  ultimaMensagemPorConversa,
  type LinhaDaConversa,
  type LinhaDaMensagem,
} from '@/whatsapp/leitura'

const LINHA: LinhaDaConversa = {
  id: 'w-1',
  lead_id: 'l-1',
  phone_e164: '+5548999998888',
  status: 'assistente',
  purpose: 'discovery',
  started_by: 'lead',
  last_message_at: '2026-09-10T14:00:00Z',
  created_at: '2026-09-10T13:00:00Z',
  leads: { name: 'Marcos Ferreira' },
}

describe('paraConversaDaLista', () => {
  test('lê o lead embutido como objeto ou como lista de um', () => {
    expect(paraConversaDaLista(LINHA)?.leadNome).toBe('Marcos Ferreira')
    expect(paraConversaDaLista({ ...LINHA, leads: [{ name: 'Marcos Ferreira' }] })?.leadNome).toBe(
      'Marcos Ferreira',
    )
    expect(paraConversaDaLista({ ...LINHA, leads: null })?.leadNome).toBeNull()
  })

  test('status fora do domínio devolve null, e não uma linha pela metade', () => {
    expect(paraConversaDaLista({ ...LINHA, status: 'invalido' })).toBeNull()
  })
})

describe('paraMensagem', () => {
  const BASE: LinhaDaMensagem = {
    id: 'm-1',
    direction: 'in',
    author: 'lead',
    body: 'Oi',
    media_kind: null,
    status: 'recebida',
    error: null,
    created_at: '2026-09-10T14:00:00Z',
  }

  test('lê direção, autor, status e mídia', () => {
    expect(paraMensagem(BASE)).toEqual({
      id: 'm-1',
      direcao: 'in',
      autor: 'lead',
      corpo: 'Oi',
      midia: null,
      leituraDaMidia: null,
      estadoDaLeitura: null,
      status: 'recebida',
      erro: null,
      criadaEm: '2026-09-10T14:00:00Z',
    })
  })

  test('corpo vazio de mensagem de mídia não vira undefined', () => {
    const mensagem = paraMensagem({ ...BASE, body: null, media_kind: 'audio' })
    expect(mensagem?.corpo).toBe('')
    expect(mensagem?.midia).toBe('audio')
  })

  test('direção, autor ou status fora do domínio devolve null', () => {
    expect(paraMensagem({ ...BASE, direction: 'lateral' })).toBeNull()
    expect(paraMensagem({ ...BASE, author: 'robo' })).toBeNull()
    expect(paraMensagem({ ...BASE, status: 'sumiu' })).toBeNull()
  })
})

describe('ultimaMensagemPorConversa', () => {
  test('a primeira ocorrência de cada conversa é a mais nova, quando a lista já vem decrescente', () => {
    const mapa = ultimaMensagemPorConversa([
      { conversation_id: 'w-1', body: 'mais nova', media_kind: null, created_at: '2026-09-10T14:00:00Z' },
      { conversation_id: 'w-1', body: 'mais velha', media_kind: null, created_at: '2026-09-10T13:00:00Z' },
      { conversation_id: 'w-2', body: 'outra conversa', media_kind: null, created_at: '2026-09-10T12:00:00Z' },
    ])
    expect(mapa.get('w-1')?.corpo).toBe('mais nova')
    expect(mapa.get('w-2')?.corpo).toBe('outra conversa')
    expect(mapa.size).toBe(2)
  })
})

describe('paraConversaDetalhe', () => {
  test('junta a conversa com as mensagens já lidas', () => {
    const detalhe = paraConversaDetalhe(LINHA, [
      {
        id: 'm-1',
        direcao: 'in',
        autor: 'lead',
        corpo: 'Oi',
        midia: null,
        leituraDaMidia: null,
        estadoDaLeitura: null,
        status: 'recebida',
        erro: null,
        criadaEm: '2026-09-10T14:00:00Z',
      },
    ])
    expect(detalhe?.mensagens).toHaveLength(1)
    expect(detalhe?.iniciadaPor).toBe('lead')
  })
})

describe('ordenarConversas e filtrarPorStatus', () => {
  test('ordena da mais recente para a mais antiga por atualizadaEm', () => {
    const antiga = { ...paraConversaDaLista(LINHA)!, id: 'a', atualizadaEm: '2026-09-10T10:00:00Z' }
    const nova = { ...paraConversaDaLista(LINHA)!, id: 'b', atualizadaEm: '2026-09-10T15:00:00Z' }
    expect(ordenarConversas([antiga, nova]).map((item) => item.id)).toEqual(['b', 'a'])
  })

  test('filtra por status, e "todas" devolve tudo', () => {
    const emAssistente = { ...paraConversaDaLista(LINHA)!, status: 'assistente' as const }
    const encerrada = { ...paraConversaDaLista(LINHA)!, status: 'encerrada' as const }
    expect(filtrarPorStatus([emAssistente, encerrada], 'encerrada')).toEqual([encerrada])
    expect(filtrarPorStatus([emAssistente, encerrada], 'todas')).toHaveLength(2)
  })
})

describe('identificacaoDaConversa', () => {
  test('usa o nome do lead, e o telefone quando não há nome', () => {
    expect(identificacaoDaConversa({ leadNome: 'Marcos Ferreira', telefone: '+5548999998888' })).toBe(
      'Marcos Ferreira',
    )
    expect(identificacaoDaConversa({ leadNome: null, telefone: '+5548999998888' })).toBe(
      '+5548999998888',
    )
    expect(identificacaoDaConversa({ leadNome: '   ', telefone: '+5548999998888' })).toBe(
      '+5548999998888',
    )
  })
})
