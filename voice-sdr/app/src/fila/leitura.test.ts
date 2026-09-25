import { describe, expect, it } from 'vitest'

import { lerContexto, lerLimiares, paraItemDaFila, textoDaResolucao, tipoDoGenero } from '@/fila/leitura'
import { fila as copyDaFila } from '@/copy/fila'

const AGORA = '2026-09-24T12:00:00.000Z'

function linha(extras: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'e-1',
    kind: 'human_requested',
    severity: 'alta',
    status: 'aberto',
    call_id: 'c-1',
    lead_id: 'l-1',
    threshold_snapshot: null,
    context: { call_id: 'c-1', recorte: 'Quero falar com uma pessoa.' },
    created_at: '2026-09-24T11:00:00.000Z',
    resolved_by: null,
    resolved_at: null,
    resolution: null,
    leads: { name: 'Marcos Ferreira', phone_e164: '+5548999998888' },
    calls: { recording_path: 'conta/c-1.mp3', recording_expires_at: '2026-12-24T00:00:00.000Z' },
    ...extras,
  }
}

describe('lerContexto', () => {
  it('lê o que cada ferramenta escreve', () => {
    expect(
      lerContexto({
        recorte: '  Pode me ligar outra hora?  ',
        urgencia: 'alta',
        pendencia: 'destino_ausente',
        origem: 'wrong_number',
        tentativas: ['c-1', 'c-2', 'c-3'],
        phone_e164: '+5548999998888',
      }),
    ).toEqual({
      recorte: 'Pode me ligar outra hora?',
      urgencia: 'alta',
      pendencia: 'destino_ausente',
      origem: 'wrong_number',
      tentativas: 3,
      telefone: '+5548999998888',
      sentimento: null,
      criterios: [],
      provedor: null,
      saldoCents: null,
      motivo: null,
    })
  })

  it('lê o que os gatilhos da F4 e call-classify escrevem', () => {
    expect(
      lerContexto({
        trecho: 'Vocês me ligam toda semana.',
        sentimento: -0.62,
        criterios: ['aviso_de_gravacao', 7, 'proximo_passo'],
        falhas: 4,
        provedor: 'elevenlabs',
        saldo_cents: 1250,
        motivo: 'resposta_ilegivel',
      }),
    ).toEqual(
      expect.objectContaining({
        recorte: 'Vocês me ligam toda semana.',
        sentimento: -0.62,
        criterios: ['aviso_de_gravacao', 'proximo_passo'],
        tentativas: 4,
        provedor: 'elevenlabs',
        saldoCents: 1250,
        motivo: 'resposta_ilegivel',
      }),
    )
  })

  it('lê o motivo da conversa de WhatsApp em que a assistente calou, com a frase de publicar', () => {
    const contexto = lerContexto({ canal: 'whatsapp', motivo: 'assistente_nao_publicada', recorte: 'Oi?' })
    expect(contexto).toEqual(expect.objectContaining({ motivo: 'assistente_nao_publicada', recorte: 'Oi?' }))
    expect(copyDaFila.item.pendenciaDaClassificacao('assistente_nao_publicada')).toMatch(/Publique a assistente/)
  })

  it.each([
    ['nulo', null],
    ['lista', ['recorte']],
    ['texto', 'recorte'],
    ['valores fora do domínio', { urgencia: 'muita', pendencia: 'x', origem: 1, tentativas: 3, recorte: '   ' }],
  ])('contexto %s sai com todos os campos nulos', (_nome, bruto) => {
    expect(lerContexto(bruto)).toEqual({
      recorte: null,
      urgencia: null,
      pendencia: null,
      origem: null,
      tentativas: null,
      telefone: null,
      sentimento: null,
      criterios: [],
      provedor: null,
      saldoCents: null,
      motivo: null,
    })
  })
})

describe('lerLimiares', () => {
  it('lê o retrato do limiar que criou o item', () => {
    expect(lerLimiares({ sentiment_floor: -0.5 }, {})).toEqual([
      { chave: 'sentiment_floor', valor: -0.5 },
    ])
  })

  it('chave desconhecida e valor que não é número ficam de fora', () => {
    expect(lerLimiares({ outro: 3, failed_criteria_cap: '2' }, {})).toEqual([])
  })

  it('a falha repetida da F3 guardava o limiar no contexto', () => {
    expect(lerLimiares(null, { limiar: 3 })).toEqual([
      { chave: 'consecutive_failures_cap', valor: 3 },
    ])
  })
})

describe('tipoDoGenero', () => {
  it.each([
    ['human_requested', 'pedido_humano'],
    ['dnc_requested', 'pedido_bloqueio'],
    ['repeated_failure', 'falha_repetida'],
    ['sentimento_negativo', 'sentimento_negativo'],
    ['classificacao_pendente', 'classificacao_pendente'],
  ])('%s é lido como %s', (kind, tipo) => {
    expect(tipoDoGenero(kind)).toBe(tipo)
  })
})

describe('paraItemDaFila', () => {
  it('monta o item aberto com lead e gravação disponível', () => {
    expect(paraItemDaFila(linha(), AGORA)).toEqual({
      id: 'e-1',
      tipo: 'pedido_humano',
      severidade: 'alta',
      criadoEm: '2026-09-24T11:00:00.000Z',
      lead: { id: 'l-1', nome: 'Marcos Ferreira', telefone: '+5548999998888' },
      chamadaId: 'c-1',
      gravacao: 'disponivel',
      contexto: expect.objectContaining({ recorte: 'Quero falar com uma pessoa.' }),
      limiares: [],
      resolucao: null,
    })
  })

  it('aceita o embutido em lista, como o PostgREST às vezes entrega', () => {
    const item = paraItemDaFila(
      linha({ leads: [{ name: null, phone_e164: '+5511988887777' }], calls: [] }),
      AGORA,
    )
    expect(item?.lead).toEqual({ id: 'l-1', nome: null, telefone: '+5511988887777' })
    expect(item?.gravacao).toBe('sem_gravacao')
  })

  it.each([
    ['sem chamada', { call_id: null, calls: null }, 'sem_gravacao'],
    ['sem caminho nem expurgo', { calls: { recording_path: null, recording_expires_at: null } }, 'sem_gravacao'],
    [
      'com prazo vencido',
      { calls: { recording_path: 'conta/c-1.mp3', recording_expires_at: '2026-09-01T00:00:00.000Z' } },
      'expurgada',
    ],
    [
      'expurgada, sem caminho',
      { calls: { recording_path: null, recording_expires_at: '2026-09-01T00:00:00.000Z' } },
      'expurgada',
    ],
  ])('gravação %s', (_nome, extras, esperado) => {
    expect(paraItemDaFila(linha(extras), AGORA)?.gravacao).toBe(esperado)
  })

  it('lead apagado vira nulo, e o item continua', () => {
    expect(paraItemDaFila(linha({ leads: null, lead_id: null }), AGORA)?.lead).toBeNull()
  })

  it('o item da F4 traz o limiar do retrato', () => {
    const item = paraItemDaFila(
      linha({ kind: 'avaliacao_reprovada', threshold_snapshot: { failed_criteria_cap: 2 } }),
      AGORA,
    )
    expect(item?.tipo).toBe('avaliacao_reprovada')
    expect(item?.limiares).toEqual([{ chave: 'failed_criteria_cap', valor: 2 }])
  })

  it('item resolvido traz autor, hora e texto', () => {
    expect(
      paraItemDaFila(
        linha({
          status: 'resolvido',
          resolved_by: 'u-9',
          resolved_at: '2026-09-24T11:30:00.000Z',
          resolution: 'Liguei de volta.',
        }),
        AGORA,
      )?.resolucao,
    ).toEqual({ autor: 'u-9', em: '2026-09-24T11:30:00.000Z', texto: 'Liguei de volta.' })
  })

  it.each([
    ['gênero', { kind: 'negative_sentiment' }],
    ['severidade', { severity: 'critica' }],
  ])('%s fora do domínio não vira item', (_nome, extras) => {
    expect(paraItemDaFila(linha(extras), AGORA)).toBeNull()
  })
})

describe('textoDaResolucao', () => {
  it('em branco vai a frase padrão, porque o banco exige texto', () => {
    expect(textoDaResolucao('   ', 'Padrão.')).toBe('Padrão.')
  })

  it('o que foi escrito vai aparado', () => {
    expect(textoDaResolucao('  Liguei de volta. ', 'Padrão.')).toBe('Liguei de volta.')
  })
})
