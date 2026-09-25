// Um caso por fonte, os dois casos de recusa e o caso de estabilidade.
//
// O teste de estabilidade é o que vale mais: ele é a única coisa que impede
// alguém de acrescentar `Date.now()` ou `crypto.randomUUID()` ao gerador. Uma
// chave que muda a cada chamada continua compilando, continua passando em todos
// os outros casos e desliga o único de `calls` em silêncio.

import { afterEach, describe, expect, it, vi } from 'vitest'

import { chaveDaTentativa, chaveDeDiscagem, ehFonte, FONTES_DE_DISCAGEM, lerChave } from './idempotencia.ts'

const LEAD = '11111111-1111-4111-8111-111111111111'
const REUNIAO = '22222222-2222-4222-8222-222222222222'
const INSCRICAO = '33333333-3333-4333-8333-333333333333'
const ALVO = '44444444-4444-4444-8444-444444444444'
const DO_CLIENTE = '55555555-5555-4555-8555-555555555555'
/** Com letras de propósito: só assim o caso da maiúscula tem o que mudar. */
const COM_LETRAS = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

describe('chaveDeDiscagem', () => {
  it('forma a chave manual com o uuid que veio do cliente', () => {
    expect(chaveDeDiscagem({ fonte: 'manual', uuidDoCliente: DO_CLIENTE })).toBe(
      `manual:${DO_CLIENTE}`,
    )
  })

  it('forma a chave do fala-rápido com o lead', () => {
    expect(chaveDeDiscagem({ fonte: 'stl', leadId: LEAD })).toBe(`stl:${LEAD}`)
  })

  it('forma a chave do lembrete com a reunião', () => {
    expect(chaveDeDiscagem({ fonte: 'rem', meetingId: REUNIAO })).toBe(`rem:${REUNIAO}`)
  })

  it('forma a chave do resgate com a reunião e o ordinal', () => {
    expect(chaveDeDiscagem({ fonte: 'rescue', meetingId: REUNIAO, ordinal: 2 })).toBe(
      `rescue:${REUNIAO}:2`,
    )
  })

  it('forma a chave da cadência com a inscrição e o passo', () => {
    expect(chaveDeDiscagem({ fonte: 'cad', enrollmentId: INSCRICAO, passo: 3 })).toBe(
      `cad:${INSCRICAO}:3`,
    )
  })

  it('forma a chave da campanha com o alvo e a tentativa', () => {
    expect(chaveDeDiscagem({ fonte: 'camp', targetId: ALVO, tentativa: 1 })).toBe(`camp:${ALVO}:1`)
  })

  it('recusa uuid fora da forma canônica, porque a chave torta não é protegida pelo único', () => {
    expect(() => chaveDeDiscagem({ fonte: 'stl', leadId: 'lead-42' })).toThrow(/uuid/)
  })

  it('recusa ordinal zero, porque dial_queue.attempt começa em 1', () => {
    expect(() => chaveDeDiscagem({ fonte: 'rescue', meetingId: REUNIAO, ordinal: 0 })).toThrow(
      /a partir de 1/,
    )
  })
})

describe('estabilidade', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('devolve a mesma chave para a mesma entrada com o relógio adiantado entre as duas', () => {
    // O relógio anda de propósito, e um dia inteiro. Comparar duas chamadas
    // seguidas não bastaria: `Date.now()` devolve o mesmo valor duas vezes
    // dentro do mesmo milissegundo, e o teste passaria com o gerador já
    // quebrado — que é exatamente o defeito que ele existe para pegar.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T09:00:00Z'))
    const primeira = chaveDeDiscagem({ fonte: 'manual', uuidDoCliente: DO_CLIENTE })
    vi.setSystemTime(new Date('2026-09-23T18:30:00Z'))
    const segunda = chaveDeDiscagem({ fonte: 'manual', uuidDoCliente: DO_CLIENTE })
    expect(segunda).toBe(primeira)
  })

  it('devolve a mesma chave para a mesma entrada em todas as seis fontes', () => {
    const pedidos = [
      { fonte: 'manual', uuidDoCliente: DO_CLIENTE },
      { fonte: 'stl', leadId: LEAD },
      { fonte: 'rem', meetingId: REUNIAO },
      { fonte: 'rescue', meetingId: REUNIAO, ordinal: 2 },
      { fonte: 'cad', enrollmentId: INSCRICAO, passo: 3 },
      { fonte: 'camp', targetId: ALVO, tentativa: 1 },
    ] as const

    vi.useFakeTimers()
    for (const pedido of pedidos) {
      vi.setSystemTime(new Date('2026-09-22T09:00:00Z'))
      const primeira = chaveDeDiscagem(pedido)
      vi.setSystemTime(new Date('2026-09-23T18:30:00Z'))
      expect(chaveDeDiscagem(pedido)).toBe(primeira)
    }
  })
})

describe('lerChave', () => {
  it('decompõe as seis chaves de volta no pedido que as formou', () => {
    const pedidos = [
      { fonte: 'manual', uuidDoCliente: DO_CLIENTE },
      { fonte: 'stl', leadId: LEAD },
      { fonte: 'rem', meetingId: REUNIAO },
      { fonte: 'rescue', meetingId: REUNIAO, ordinal: 2 },
      { fonte: 'cad', enrollmentId: INSCRICAO, passo: 3 },
      { fonte: 'camp', targetId: ALVO, tentativa: 7 },
    ] as const

    for (const pedido of pedidos) {
      expect(lerChave(chaveDeDiscagem(pedido))).toEqual({ ok: true, pedido })
    }
  })

  it('recusa chave de fonte desconhecida, devolvendo código e não frase', () => {
    expect(lerChave(`sms:${LEAD}`)).toEqual({ ok: false, motivo: 'fonte_desconhecida' })
  })

  it('recusa chave com uuid malformado', () => {
    expect(lerChave('stl:lead-42')).toEqual({ ok: false, motivo: 'uuid_invalido' })
    expect(lerChave(`rescue:${REUNIAO.slice(0, -1)}:2`)).toEqual({
      ok: false,
      motivo: 'uuid_invalido',
    })
  })

  it('recusa chave vazia', () => {
    expect(lerChave('')).toEqual({ ok: false, motivo: 'vazia' })
  })

  it('separa partes de menos e de mais de fonte desconhecida', () => {
    expect(lerChave('stl')).toEqual({ ok: false, motivo: 'formato_invalido' })
    expect(lerChave(`stl:${LEAD}:2`)).toEqual({ ok: false, motivo: 'formato_invalido' })
    expect(lerChave(`rescue:${REUNIAO}`)).toEqual({ ok: false, motivo: 'formato_invalido' })
  })

  it('recusa ordinal que não é inteiro a partir de 1', () => {
    expect(lerChave(`cad:${INSCRICAO}:0`)).toEqual({ ok: false, motivo: 'ordinal_invalido' })
    expect(lerChave(`cad:${INSCRICAO}:2x`)).toEqual({ ok: false, motivo: 'ordinal_invalido' })
    expect(lerChave(`cad:${INSCRICAO}:`)).toEqual({ ok: false, motivo: 'ordinal_invalido' })
  })

  it('recusa maiúscula em vez de normalizar, porque o único do banco compara texto', () => {
    expect(lerChave(`STL:${LEAD}`)).toEqual({ ok: false, motivo: 'fonte_desconhecida' })
    expect(lerChave(`stl:${COM_LETRAS.toUpperCase()}`)).toEqual({ ok: false, motivo: 'uuid_invalido' })
  })
})

describe('ehFonte', () => {
  it('reconhece as seis fontes do check de dial_queue.source e nada além', () => {
    for (const fonte of FONTES_DE_DISCAGEM) expect(ehFonte(fonte)).toBe(true)
    expect(ehFonte('sms')).toBe(false)
    expect(ehFonte('')).toBe(false)
  })
})

describe('a chave da tentativa (US-189)', () => {
  const base = 'stl:0f8e2c1a-8a4b-4c55-9d7e-2b1f3a4c5d6e'

  it('a primeira é a chave da fonte, as seguintes ganham #n', () => {
    expect(chaveDaTentativa(base, 1)).toBe(base)
    expect(chaveDaTentativa(base, 2)).toBe(`${base}#2`)
    expect(chaveDaTentativa(base, 10)).toBe(`${base}#10`)
  })

  it('tentativa zero ou fracionária é exceção', () => {
    expect(() => chaveDaTentativa(base, 0)).toThrow()
    expect(() => chaveDaTentativa(base, 1.5)).toThrow()
  })
})
