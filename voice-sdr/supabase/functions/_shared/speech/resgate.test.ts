import { describe, expect, test } from 'vitest'

import type { ReuniaoFalada } from './lembrete.ts'
import { FALAS_DO_RESGATE, montarFalaDeResgate } from './resgate.ts'

const SP = 'America/Sao_Paulo'
const MANAUS = 'America/Manaus'
// Terça, 6 de outubro de 2026, 10h em São Paulo.
const AGORA = '2026-10-06T13:00:00Z'
// Segunda, 5 de outubro, 15h em São Paulo: ontem.
const ONTEM_15H = '2026-10-05T18:00:00Z'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/**
 * O que a fala de resgate não pode dizer (T-17): toda forma de afirmar que a
 * pessoa faltou. Sem acento e em caixa baixa, para "Você não compareceu" cair
 * junto com "voce nao compareceu".
 */
const PROIBIDAS = [
  'faltou',
  'falta',
  'nao compareceu',
  'nao apareceu',
  'nao veio',
  'nao participou',
  'nao entrou',
  'ausencia',
  'ausente',
  'no-show',
  'no show',
  'perdeu a reuniao',
  'perdeu a conversa',
  'esqueceu',
  'furou',
  'deu bolo',
]

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function reuniao(extra: Partial<ReuniaoFalada> = {}): ReuniaoFalada {
  return {
    inicio: ONTEM_15H,
    fusoDoLead: SP,
    fusoDoEspecialista: SP,
    nomeDoEspecialista: 'Ana',
    modalidade: 'video',
    ...extra,
  }
}

describe('a fala do resgate', () => {
  test('lembra a conversa que estava marcada e pergunta como ficou', () => {
    expect(montarFalaDeResgate(reuniao(), AGORA)).toBe(
      'A gente tinha uma conversa marcada com Ana segunda, dia 5, às 15h, e eu queria saber como ficou pra você. Se ainda fizer sentido, eu já vejo um horário novo, pode ser?',
    )
  })

  test('o horário sai no fuso do lead, com o do especialista quando difere', () => {
    expect(montarFalaDeResgate(reuniao({ fusoDoLead: MANAUS }), AGORA)).toContain(
      'segunda, dia 5, às 14h no seu horário, 15h aqui em São Paulo',
    )
  })

  test('nenhuma fala afirma falta: a varredura por expressões proibidas', () => {
    const falas = [
      montarFalaDeResgate(reuniao(), AGORA),
      montarFalaDeResgate(reuniao({ nomeDoEspecialista: null }), AGORA),
      ...Object.values(FALAS_DO_RESGATE),
    ]
    for (const fala of falas) {
      const normalizada = normalizar(fala)
      for (const proibida of PROIBIDAS) expect(normalizada, proibida).not.toContain(proibida)
    }
  })

  test('a varredura tem dente: uma fala acusadora é pega', () => {
    const acusadora = normalizar('Vi que você não compareceu à reunião de ontem.')
    expect(PROIBIDAS.some((proibida) => acusadora.includes(proibida))).toBe(true)
  })

  test('a fala pergunta', () => {
    expect(montarFalaDeResgate(reuniao(), AGORA)).toMatch(/\?$/)
  })

  test('nenhuma fala carrega identificador técnico', () => {
    for (const fala of [montarFalaDeResgate(reuniao(), AGORA), ...Object.values(FALAS_DO_RESGATE)]) {
      expect(fala).not.toMatch(UUID)
      expect(fala).not.toMatch(/meeting_id|call_id|lead_id|\{/)
    }
  })
})
