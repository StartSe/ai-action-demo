import { describe, expect, test } from 'vitest'

import {
  FALAS_DO_LEMBRETE,
  falarPresencaConfirmada,
  falarRemarcacao,
  montarFalaDeLembrete,
  type ReuniaoFalada,
} from './lembrete.ts'

const SP = 'America/Sao_Paulo'
const MANAUS = 'America/Manaus'
// Segunda, 5 de outubro de 2026, 10h em São Paulo.
const AGORA = '2026-10-05T13:00:00Z'
// Segunda, 5 de outubro, 15h em São Paulo (14h em Manaus).
const HOJE_15H = '2026-10-05T18:00:00Z'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function reuniao(extra: Partial<ReuniaoFalada> = {}): ReuniaoFalada {
  return {
    inicio: HOJE_15H,
    fusoDoLead: SP,
    fusoDoEspecialista: SP,
    nomeDoEspecialista: 'Ana',
    modalidade: 'video',
    ...extra,
  }
}

describe('a fala do lembrete', () => {
  test('diz com quem, quando e como, e oferece confirmar ou outro horário', () => {
    expect(montarFalaDeLembrete(reuniao(), AGORA)).toBe(
      'Tô ligando pra lembrar da sua conversa com Ana hoje às 15h, por vídeo. Tá tudo certo pra você participar, ou prefere que eu veja outro horário?',
    )
  })

  test('o horário sai no fuso do lead, e o do especialista é dito quando difere', () => {
    const fala = montarFalaDeLembrete(reuniao({ fusoDoLead: MANAUS }), AGORA)
    expect(fala).toContain('hoje às 14h no seu horário, 15h aqui em São Paulo')
  })

  test('mesmo relógio não fala de fuso', () => {
    expect(montarFalaDeLembrete(reuniao(), AGORA)).not.toMatch(/no seu horário/)
  })

  test('sem o nome do especialista, a frase é outra frase inteira', () => {
    const fala = montarFalaDeLembrete(reuniao({ nomeDoEspecialista: '  ' }), AGORA)
    expect(fala).toContain('com o nosso especialista hoje')
    expect(fala).not.toMatch(/com\s+hoje|com\s+,/)
  })

  test('modalidade desconhecida some sem deixar vírgula sobrando', () => {
    const fala = montarFalaDeLembrete(reuniao({ modalidade: 'holograma' }), AGORA)
    expect(fala).toContain('hoje às 15h. Tá tudo certo')
  })

  test('confirmação e remarcação usam o mesmo formatador de horário', () => {
    expect(falarPresencaConfirmada(reuniao(), AGORA)).toBe('Perfeito, tá confirmado: hoje às 15h. Até lá!')
    expect(falarRemarcacao({ inicio: '2026-10-06T17:00:00Z', fusoDoLead: SP, fusoDoEspecialista: SP }, AGORA)).toBe(
      'Pronto, remarquei pra amanhã às 14h. Vou te mandar o convite novo por e-mail.',
    )
  })

  test('nenhuma fala carrega identificador técnico', () => {
    const falas = [
      montarFalaDeLembrete(reuniao(), AGORA),
      falarPresencaConfirmada(reuniao(), AGORA),
      falarRemarcacao(reuniao(), AGORA),
      ...Object.values(FALAS_DO_LEMBRETE),
    ]
    for (const fala of falas) {
      expect(fala).not.toMatch(UUID)
      expect(fala).not.toMatch(/meeting_id|call_id|lead_id|account_id|\{/)
    }
  })
})
