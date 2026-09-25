import { describe, expect, test } from 'vitest'

import {
  FALAS_DA_AGENDA,
  falarConfirmacao,
  falarHora,
  falarHorario,
  falarOferta,
  type HorarioFalado,
} from './agenda.ts'

const SP = 'America/Sao_Paulo'
const MANAUS = 'America/Manaus'
const BELEM = 'America/Belem'

// Domingo, 4 de outubro de 2026, 9h em São Paulo.
const DOMINGO = '2026-10-04T12:00:00Z'
// Terça, 6 de outubro, 14h em São Paulo (13h em Manaus).
const TERCA_14H = '2026-10-06T17:00:00Z'

function horario(inicio: string, fusoDoLead = SP, fusoDoEspecialista = SP): HorarioFalado {
  return { inicio, fusoDoLead, fusoDoEspecialista }
}

/** Sem acento, sem caixa e sem pontuação: a comparação do texto do PRD. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
}

describe('a hora falada', () => {
  test('hora cheia, meia hora, meio-dia e meia-noite têm uma forma só', () => {
    expect(falarHora(14, 0)).toBe('14h')
    expect(falarHora(14, 30)).toBe('14h30')
    expect(falarHora(9, 5)).toBe('9h05')
    expect(falarHora(12, 0)).toBe('meio-dia')
    expect(falarHora(0, 0)).toBe('meia-noite')
    expect(falarHora(0, 30)).toBe('meia-noite e meia')
  })
})

describe('o horário no fuso do lead', () => {
  test('fusos iguais não falam de fuso', () => {
    expect(falarHorario(horario(TERCA_14H), DOMINGO)).toBe('terça às 14h')
  })

  test('relógios iguais com nomes diferentes também não', () => {
    expect(falarHorario(horario(TERCA_14H, BELEM, SP), DOMINGO)).toBe('terça às 14h')
  })

  test('fusos diferentes dizem os dois, o do lead primeiro', () => {
    expect(falarHorario(horario(TERCA_14H, MANAUS, SP), DOMINGO)).toBe(
      'terça às 13h no seu horário, 14h aqui em São Paulo',
    )
  })

  test('meia hora em fusos diferentes', () => {
    expect(falarHorario(horario('2026-10-06T17:30:00Z', MANAUS, SP), DOMINGO)).toBe(
      'terça às 13h30 no seu horário, 14h30 aqui em São Paulo',
    )
  })

  test('meia-noite do especialista é outro dia para o lead, e a frase diz qual', () => {
    // 03h UTC de quarta: meia-noite de quarta em São Paulo, 23h de terça em Manaus.
    const virada = '2026-10-07T03:00:00Z'
    expect(falarHorario(horario(virada), DOMINGO)).toBe('quarta à meia-noite')
    expect(falarHorario(horario(virada, MANAUS, SP), DOMINGO)).toBe(
      'terça às 23h no seu horário, meia-noite de quarta aqui em São Paulo',
    )
  })

  test('hoje e amanhã se contam no dia do lead, na vizinhança da virada', () => {
    // Domingo 23h30 em São Paulo; segunda 9h é amanhã.
    expect(falarHorario(horario('2026-10-05T12:00:00Z'), '2026-10-05T02:30:00Z')).toBe(
      'amanhã às 9h',
    )
    // Domingo 23h30 em Manaus, já segunda 0h30 em São Paulo: para o lead ainda é
    // domingo, e segunda 9h dele continua sendo amanhã.
    expect(
      falarHorario(horario('2026-10-05T13:00:00Z', MANAUS, SP), '2026-10-05T03:30:00Z'),
    ).toBe('amanhã às 9h no seu horário, 10h aqui em São Paulo')
    expect(falarHorario(horario('2026-10-04T20:00:00Z'), DOMINGO)).toBe('hoje às 17h')
  })

  test('depois de uma semana o dia leva a data', () => {
    expect(falarHorario(horario('2026-10-13T17:00:00Z'), DOMINGO)).toBe('terça, dia 13, às 14h')
  })

  test('meio-dia pede "ao"', () => {
    expect(falarHorario(horario('2026-10-06T15:00:00Z'), DOMINGO)).toBe('terça ao meio-dia')
  })

  test('fuso fora da lista não inventa cidade', () => {
    expect(falarHorario(horario(TERCA_14H, SP, 'Europe/Lisbon'), DOMINGO)).toBe(
      'terça às 14h no seu horário, 18h no horário do especialista',
    )
  })
})

describe('a oferta por posição', () => {
  const horarios = [
    horario(TERCA_14H),
    horario('2026-10-06T19:00:00Z'),
    horario('2026-10-07T13:00:00Z'),
    horario('2026-10-08T17:30:00Z'),
  ]

  test('uma oferta', () => {
    expect(falarOferta(horarios.slice(0, 1), DOMINGO)).toBe(
      'Tenho um horário: terça às 14h. Fica bom pra você?',
    )
  })

  test('duas ofertas, como o exemplo do PRD', () => {
    expect(falarOferta(horarios.slice(0, 2), DOMINGO)).toBe(
      'Tenho estas opções: opção um, terça às 14h; opção dois, terça às 16h. Qual fica melhor pra você?',
    )
  })

  test('três e quatro ofertas', () => {
    expect(falarOferta(horarios.slice(0, 3), DOMINGO)).toContain('opção três, quarta às 10h')
    const quatro = falarOferta(horarios, DOMINGO)
    expect(quatro).toContain('opção quatro, quinta às 14h30')
    expect(quatro.match(/opção /g)).toHaveLength(4)
  })

  test('cinco é defeito de quem chamou, e zero é agenda cheia', () => {
    expect(() => falarOferta([...horarios, horario(TERCA_14H)], DOMINGO)).toThrow(/no máximo 4/)
    expect(falarOferta([], DOMINGO)).toBe(FALAS_DA_AGENDA.agendaCheia)
  })

  test('nenhuma fala carrega identificador nem instante ISO', () => {
    const falas = [
      falarOferta(horarios, DOMINGO),
      falarConfirmacao(horarios[0]!, DOMINGO),
      ...Object.values(FALAS_DA_AGENDA),
    ]
    for (const fala of falas) {
      expect(fala).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)
      expect(fala).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    }
  })
})

describe('as falas fixas', () => {
  test('horário tomado e contorno são as frases do PRD', () => {
    expect(normalizar(FALAS_DA_AGENDA.horarioTomado)).toBe(
      'esse horario acabou de ser preenchido deixa eu ver outro',
    )
    expect(normalizar(FALAS_DA_AGENDA.falha)).toBe(
      'deixa eu confirmar isso com o time e ja te retorno',
    )
  })

  test('a agenda cheia não promete instante nenhum', () => {
    expect(FALAS_DA_AGENDA.agendaCheia).not.toMatch(
      /\d{1,2}h|segunda|terça|quarta|quinta|sexta|sábado|domingo|amanhã|hoje/i,
    )
  })

  test('a confirmação diz o horário no fuso do lead', () => {
    expect(falarConfirmacao(horario(TERCA_14H, MANAUS, SP), DOMINGO)).toBe(
      'Fechado, ficou marcado pra terça às 13h no seu horário, 14h aqui em São Paulo. Vou te mandar o convite por e-mail.',
    )
  })
})
