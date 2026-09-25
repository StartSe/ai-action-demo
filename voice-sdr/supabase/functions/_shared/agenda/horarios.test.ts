// Geração de horários, à exaustão. Nenhum banco, nenhuma rede e nenhum relógio:
// `agora` é sempre um instante escrito no caso.
//
// As datas são fixas de propósito. 2026-10-05 é uma segunda-feira e 2026-10-06
// é uma terça; 2026-08-30, 2026-09-06, 2026-10-18 e 2026-10-25 são domingos, e
// os dois últimos pares foram escolhidos por caírem em volta de uma mudança de
// horário de verão.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  MAXIMO_DE_OFERTAS,
  diasDaSemanaNoHorizonte,
  gerarHorarios,
  rotularInstante,
  type EntradaDeHorarios,
  type FaixaDeDisponibilidade,
  type MotivoDeDescarte,
} from './horarios.ts'

const SAO_PAULO = 'America/Sao_Paulo'
const MANAUS = 'America/Manaus'
const SANTIAGO = 'America/Santiago'
const LISBOA = 'Europe/Lisbon'

const SEGUNDA = 1
const TERCA = 2
const DOMINGO = 0

/** Entrada mínima: um especialista que atende segunda das 9 às 12, sem nada no caminho. */
function entrada(ajustes: Partial<EntradaDeHorarios> = {}): EntradaDeHorarios {
  return {
    especialista: {
      fuso: SAO_PAULO,
      duracaoPadraoMin: 30,
      tetoDiario: 6,
      antecedenciaMinimaMin: 0,
      antecedenciaMaximaDias: 30,
      ...ajustes.especialista,
    },
    disponibilidade: [{ diaDaSemana: SEGUNDA, inicio: '09:00', fim: '12:00' }],
    bloqueios: [],
    ocupacaoExterna: [],
    reunioesMarcadas: [],
    fusoDoLead: SAO_PAULO,
    // Segunda-feira, 08h00 em São Paulo: antes da faixa abrir.
    agora: '2026-10-05T11:00:00Z',
    ...ajustes,
  }
}

/**
 * A mesma entrada com horizonte de um dia: quando o caso é sobre uma faixa
 * curta, sem o horizonte curto a varredura atravessa para a segunda-feira
 * seguinte e completa as quatro ofertas com horários de outra semana.
 */
function entradaDeUmDia(ajustes: Partial<EntradaDeHorarios> = {}): EntradaDeHorarios {
  const base = entrada(ajustes)
  return { ...base, especialista: { ...base.especialista, antecedenciaMaximaDias: 1 } }
}

function inicios(saida: ReturnType<typeof gerarHorarios>): string[] {
  return saida.ofertas.map((oferta) => oferta.inicio)
}

function motivosDe(saida: ReturnType<typeof gerarHorarios>, inicio: string): MotivoDeDescarte[] {
  return saida.descartes.filter((d) => d.inicio === inicio).map((d) => d.motivo)
}

describe('gerarHorarios', () => {
  it('oferece no máximo quatro horários, em ordem crescente', () => {
    const saida = gerarHorarios(entrada())

    expect(saida.ofertas).toHaveLength(MAXIMO_DE_OFERTAS)
    expect(inicios(saida)).toEqual([
      '2026-10-05T12:00:00Z',
      '2026-10-05T12:30:00Z',
      '2026-10-05T13:00:00Z',
      '2026-10-05T13:30:00Z',
    ])
    const crescente = [...inicios(saida)].sort()
    expect(inicios(saida)).toEqual(crescente)
  })

  it('devolve o fuso do especialista e o rótulo no fuso do lead em cada oferta', () => {
    const [primeira] = gerarHorarios(entrada()).ofertas

    expect(primeira).toEqual({
      inicio: '2026-10-05T12:00:00Z',
      fim: '2026-10-05T12:30:00Z',
      fusoDoEspecialista: SAO_PAULO,
      rotuloNoFusoDoLead: 'segunda-feira, 5 de outubro de 2026, 09h00',
    })
  })

  it('para de varrer quando completa as quatro ofertas, sem inventar motivo para o resto', () => {
    const saida = gerarHorarios(entrada())

    // A faixa tem seis candidatos; os dois últimos não foram examinados, e não
    // aparecem como recusa nenhuma.
    expect(saida.descartes).toHaveLength(0)
    expect(motivosDe(saida, '2026-10-05T14:00:00Z')).toEqual([])
  })

  describe('determinismo', () => {
    it('a mesma entrada devolve a mesma saída', () => {
      const dado = entrada({
        especialista: {
          fuso: SAO_PAULO,
          duracaoPadraoMin: 30,
          tetoDiario: 6,
          antecedenciaMinimaMin: 120,
          antecedenciaMaximaDias: 7,
        },
        bloqueios: [{ inicio: '2026-10-05T13:00:00Z', fim: '2026-10-05T13:30:00Z' }],
        ocupacaoExterna: [{ inicio: '2026-10-05T14:00:00Z', fim: '2026-10-05T14:30:00Z' }],
      })

      expect(gerarHorarios(dado)).toEqual(gerarHorarios(dado))
    })

    it('o módulo não lê relógio nem sorteia', () => {
      const fonte = readFileSync(new URL('./horarios.ts', import.meta.url), 'utf8')

      expect(fonte).not.toMatch(/Date\.now/)
      expect(fonte).not.toMatch(/Math\.random/)
      expect(fonte).not.toMatch(/new Date/)
    })
  })

  describe('faixa', () => {
    it('recusa com fora_da_faixa a sobra que não comporta a duração', () => {
      const saida = gerarHorarios(
        entradaDeUmDia({ disponibilidade: [{ diaDaSemana: SEGUNDA, inicio: '09:00', fim: '10:20' }] }),
      )

      expect(inicios(saida)).toEqual(['2026-10-05T12:00:00Z', '2026-10-05T12:30:00Z'])
      expect(motivosDe(saida, '2026-10-05T13:00:00Z')).toEqual(['fora_da_faixa'])
    })

    it('une faixas sobrepostas do mesmo dia em vez de oferecer o horário duas vezes', () => {
      const sobrepostas: FaixaDeDisponibilidade[] = [
        { diaDaSemana: SEGUNDA, inicio: '09:00', fim: '10:00' },
        { diaDaSemana: SEGUNDA, inicio: '09:30', fim: '10:30' },
      ]

      const saida = gerarHorarios(entradaDeUmDia({ disponibilidade: sobrepostas }))

      expect(inicios(saida)).toEqual([
        '2026-10-05T12:00:00Z',
        '2026-10-05T12:30:00Z',
        '2026-10-05T13:00:00Z',
      ])
      expect(new Set(inicios(saida)).size).toBe(inicios(saida).length)
    })

    it('une também as faixas encostadas, porque lacuna de zero minuto não é lacuna', () => {
      const encostadas: FaixaDeDisponibilidade[] = [
        { diaDaSemana: SEGUNDA, inicio: '09:00', fim: '10:20' },
        { diaDaSemana: SEGUNDA, inicio: '10:20', fim: '11:00' },
      ]

      const saida = gerarHorarios(entradaDeUmDia({ disponibilidade: encostadas }))

      // Sem a união, 10h00 cairia como fora_da_faixa e 10h20 abriria uma grade
      // nova — 13h20 em UTC, que é o horário que não pode existir aqui.
      expect(inicios(saida)).toEqual([
        '2026-10-05T12:00:00Z',
        '2026-10-05T12:30:00Z',
        '2026-10-05T13:00:00Z',
        '2026-10-05T13:30:00Z',
      ])
      expect(inicios(saida)).not.toContain('2026-10-05T13:20:00Z')
    })

    it('aceita faixa que fecha às 24:00', () => {
      const saida = gerarHorarios(
        entradaDeUmDia({
          disponibilidade: [{ diaDaSemana: SEGUNDA, inicio: '23:00', fim: '24:00' }],
          agora: '2026-10-06T01:00:00Z',
        }),
      )

      expect(inicios(saida)).toEqual(['2026-10-06T02:00:00Z', '2026-10-06T02:30:00Z'])
    })

    it('ignora faixa de outro dia da semana', () => {
      const saida = gerarHorarios(
        entrada({ disponibilidade: [{ diaDaSemana: TERCA, inicio: '09:00', fim: '12:00' }] }),
      )

      expect(inicios(saida)[0]).toBe('2026-10-06T12:00:00Z')
    })
  })

  describe('intervalo meio aberto', () => {
    it('bloqueio que termina às 14h30 convive com o horário que começa às 14h30', () => {
      const saida = gerarHorarios(
        entradaDeUmDia({
          disponibilidade: [{ diaDaSemana: SEGUNDA, inicio: '14:00', fim: '15:00' }],
          // 14h00 às 14h30 em São Paulo.
          bloqueios: [{ inicio: '2026-10-05T17:00:00Z', fim: '2026-10-05T17:30:00Z' }],
        }),
      )

      expect(motivosDe(saida, '2026-10-05T17:00:00Z')).toEqual(['bloqueado'])
      expect(inicios(saida)).toEqual(['2026-10-05T17:30:00Z'])
    })

    it('reunião que termina às 14h30 convive com o horário que começa às 14h30', () => {
      const saida = gerarHorarios(
        entradaDeUmDia({
          disponibilidade: [{ diaDaSemana: SEGUNDA, inicio: '14:00', fim: '15:00' }],
          reunioesMarcadas: [{ inicio: '2026-10-05T17:00:00Z', fim: '2026-10-05T17:30:00Z' }],
        }),
      )

      expect(inicios(saida)).toEqual(['2026-10-05T17:30:00Z'])
    })

    it('ocupação externa que termina às 14h30 convive com o horário que começa às 14h30', () => {
      const saida = gerarHorarios(
        entradaDeUmDia({
          disponibilidade: [{ diaDaSemana: SEGUNDA, inicio: '14:00', fim: '15:00' }],
          ocupacaoExterna: [{ inicio: '2026-10-05T17:00:00Z', fim: '2026-10-05T17:30:00Z' }],
        }),
      )

      expect(inicios(saida)).toEqual(['2026-10-05T17:30:00Z'])
    })

    it('a sobreposição de um minuto continua sendo conflito', () => {
      const saida = gerarHorarios(
        entradaDeUmDia({
          disponibilidade: [{ diaDaSemana: SEGUNDA, inicio: '14:00', fim: '15:00' }],
          bloqueios: [{ inicio: '2026-10-05T17:29:00Z', fim: '2026-10-05T17:31:00Z' }],
        }),
      )

      expect(motivosDe(saida, '2026-10-05T17:30:00Z')).toEqual(['bloqueado'])
      expect(inicios(saida)).toEqual([])
    })
  })

  describe('antecedência', () => {
    it('com 120 minutos de antecedência e agora às 10h00, as 10h30 não saem e as 12h00 saem', () => {
      const saida = gerarHorarios(
        entrada({
          especialista: {
            fuso: SAO_PAULO,
            duracaoPadraoMin: 30,
            tetoDiario: 6,
            antecedenciaMinimaMin: 120,
            antecedenciaMaximaDias: 30,
          },
          disponibilidade: [{ diaDaSemana: SEGUNDA, inicio: '10:00', fim: '13:00' }],
          // Segunda-feira, 10h00 em São Paulo.
          agora: '2026-10-05T13:00:00Z',
        }),
      )

      // 10h30 em São Paulo.
      expect(motivosDe(saida, '2026-10-05T13:30:00Z')).toEqual(['antecedencia_minima'])
      // 12h00 em São Paulo.
      expect(inicios(saida)[0]).toBe('2026-10-05T15:00:00Z')
      expect(saida.descartes.map((d) => d.motivo)).toEqual([
        'antecedencia_minima',
        'antecedencia_minima',
        'antecedencia_minima',
        'antecedencia_minima',
      ])
    })

    it('recusa com antecedencia_maxima o horário além do horizonte', () => {
      const saida = gerarHorarios(
        entrada({
          especialista: {
            fuso: SAO_PAULO,
            duracaoPadraoMin: 30,
            tetoDiario: 6,
            antecedenciaMinimaMin: 0,
            antecedenciaMaximaDias: 1,
          },
          disponibilidade: [{ diaDaSemana: TERCA, inicio: '09:00', fim: '12:00' }],
          // Segunda-feira, 08h00 em São Paulo: o horizonte fecha terça às 08h00.
          agora: '2026-10-05T11:00:00Z',
        }),
      )

      expect(saida.ofertas).toEqual([])
      expect(motivosDe(saida, '2026-10-06T12:00:00Z')).toEqual(['antecedencia_maxima'])
    })

    it('o último instante do horizonte é exclusivo', () => {
      const comHorizonte = (antecedenciaMaximaDias: number) =>
        gerarHorarios(
          entrada({
            especialista: {
              fuso: SAO_PAULO,
              duracaoPadraoMin: 30,
              tetoDiario: 6,
              antecedenciaMinimaMin: 0,
              antecedenciaMaximaDias,
            },
            disponibilidade: [{ diaDaSemana: TERCA, inicio: '09:00', fim: '12:00' }],
            // Segunda-feira, 09h00 em São Paulo: com um dia de horizonte, o
            // limite cai exatamente sobre o candidato de terça às 09h00.
            agora: '2026-10-05T12:00:00Z',
          }),
        )

      expect(motivosDe(comHorizonte(1), '2026-10-06T12:00:00Z')).toEqual(['antecedencia_maxima'])
      expect(inicios(comHorizonte(2))[0]).toBe('2026-10-06T12:00:00Z')
    })
  })

  describe('teto diário', () => {
    it('seis reuniões no dia fecham o dia e deixam o seguinte aberto', () => {
      const seisReunioes = [0, 1, 2, 3, 4, 5].map((i) => ({
        // Segunda-feira, das 14h em diante em São Paulo: fora da faixa da manhã,
        // para o teto ser a única razão de a manhã sumir.
        inicio: `2026-10-05T${String(17 + i).padStart(2, '0')}:00:00Z`,
        fim: `2026-10-05T${String(17 + i).padStart(2, '0')}:30:00Z`,
      }))

      const saida = gerarHorarios(
        entrada({
          disponibilidade: [
            { diaDaSemana: SEGUNDA, inicio: '09:00', fim: '12:00' },
            { diaDaSemana: TERCA, inicio: '09:00', fim: '12:00' },
          ],
          reunioesMarcadas: seisReunioes,
        }),
      )

      expect(motivosDe(saida, '2026-10-05T12:00:00Z')).toEqual(['teto_diario'])
      expect(saida.descartes.every((d) => d.motivo === 'teto_diario')).toBe(true)
      expect(inicios(saida)[0]).toBe('2026-10-06T12:00:00Z')
    })

    it('cinco reuniões não fecham o dia', () => {
      const cincoReunioes = [0, 1, 2, 3, 4].map((i) => ({
        inicio: `2026-10-05T${String(17 + i).padStart(2, '0')}:00:00Z`,
        fim: `2026-10-05T${String(17 + i).padStart(2, '0')}:30:00Z`,
      }))

      const saida = gerarHorarios(entrada({ reunioesMarcadas: cincoReunioes }))

      expect(inicios(saida)[0]).toBe('2026-10-05T12:00:00Z')
    })

    it('conta o dia no calendário do especialista, não no de UTC', () => {
      // Manaus é UTC-4: estas seis reuniões são de segunda à noite lá, e já
      // caem na terça em UTC. Contar por dia de UTC inverteria os dois dias.
      const seisNaSegundaDeManaus = [0, 1, 2, 3, 4, 5].map((i) => ({
        inicio: `2026-10-06T0${Math.floor(i / 2)}:${i % 2 === 0 ? '00' : '30'}:00Z`,
        fim: `2026-10-06T0${Math.floor(i / 2)}:${i % 2 === 0 ? '30' : '59'}:00Z`,
      }))

      const saida = gerarHorarios(
        entrada({
          especialista: {
            fuso: MANAUS,
            duracaoPadraoMin: 30,
            tetoDiario: 6,
            antecedenciaMinimaMin: 0,
            antecedenciaMaximaDias: 30,
          },
          disponibilidade: [
            { diaDaSemana: SEGUNDA, inicio: '09:00', fim: '12:00' },
            { diaDaSemana: TERCA, inicio: '09:00', fim: '12:00' },
          ],
          reunioesMarcadas: seisNaSegundaDeManaus,
          fusoDoLead: MANAUS,
          // Segunda-feira, 08h00 em Manaus.
          agora: '2026-10-05T12:00:00Z',
        }),
      )

      // Segunda fechada (09h00 em Manaus é 13h00 em UTC), terça aberta.
      expect(motivosDe(saida, '2026-10-05T13:00:00Z')).toEqual(['teto_diario'])
      expect(inicios(saida)[0]).toBe('2026-10-06T13:00:00Z')
    })
  })

  describe('bloqueio e ocupação externa', () => {
    it('a ocupação externa corta o horário mesmo com a faixa semanal aberta', () => {
      const saida = gerarHorarios(
        entrada({
          // 09h00 às 10h00 em São Paulo.
          ocupacaoExterna: [{ inicio: '2026-10-05T12:00:00Z', fim: '2026-10-05T13:00:00Z' }],
        }),
      )

      expect(motivosDe(saida, '2026-10-05T12:00:00Z')).toEqual(['ocupado_externo'])
      expect(motivosDe(saida, '2026-10-05T12:30:00Z')).toEqual(['ocupado_externo'])
      expect(inicios(saida)[0]).toBe('2026-10-05T13:00:00Z')
    })

    it('o bloqueio pontual corta independentemente do calendário externo', () => {
      const saida = gerarHorarios(
        entrada({
          bloqueios: [{ inicio: '2026-10-05T12:00:00Z', fim: '2026-10-05T13:00:00Z' }],
          ocupacaoExterna: [],
        }),
      )

      expect(motivosDe(saida, '2026-10-05T12:00:00Z')).toEqual(['bloqueado'])
      expect(inicios(saida)[0]).toBe('2026-10-05T13:00:00Z')
    })

    it('ocupação externa sobreposta entre si não conta duas vezes nem muda o resultado', () => {
      const saida = gerarHorarios(
        entrada({
          // Duas leituras do mesmo calendário podem se sobrepor: o banco as
          // aceita de propósito (US-159), e aqui o efeito é o de uma só.
          ocupacaoExterna: [
            { inicio: '2026-10-05T12:00:00Z', fim: '2026-10-05T13:00:00Z' },
            { inicio: '2026-10-05T12:30:00Z', fim: '2026-10-05T12:45:00Z' },
          ],
        }),
      )

      expect(saida.descartes).toHaveLength(2)
      expect(inicios(saida)[0]).toBe('2026-10-05T13:00:00Z')
    })
  })

  describe('precedência entre motivos', () => {
    it('o teto do dia ganha do bloqueio, porque a resposta é outro dia e não outro horário', () => {
      const seisReunioes = [0, 1, 2, 3, 4, 5].map((i) => ({
        inicio: `2026-10-05T${String(17 + i).padStart(2, '0')}:00:00Z`,
        fim: `2026-10-05T${String(17 + i).padStart(2, '0')}:30:00Z`,
      }))

      const saida = gerarHorarios(
        entrada({
          reunioesMarcadas: seisReunioes,
          bloqueios: [{ inicio: '2026-10-05T12:00:00Z', fim: '2026-10-05T12:30:00Z' }],
        }),
      )

      expect(motivosDe(saida, '2026-10-05T12:00:00Z')).toEqual(['teto_diario'])
    })

    it('a antecedência mínima ganha do bloqueio', () => {
      const saida = gerarHorarios(
        entrada({
          especialista: {
            fuso: SAO_PAULO,
            duracaoPadraoMin: 30,
            tetoDiario: 6,
            antecedenciaMinimaMin: 120,
            antecedenciaMaximaDias: 30,
          },
          bloqueios: [{ inicio: '2026-10-05T12:00:00Z', fim: '2026-10-05T12:30:00Z' }],
        }),
      )

      expect(motivosDe(saida, '2026-10-05T12:00:00Z')).toEqual(['antecedencia_minima'])
    })

    it('a reunião já marcada ganha da ocupação externa no mesmo horário', () => {
      const saida = gerarHorarios(
        entrada({
          reunioesMarcadas: [{ inicio: '2026-10-05T12:00:00Z', fim: '2026-10-05T12:30:00Z' }],
          ocupacaoExterna: [{ inicio: '2026-10-05T12:00:00Z', fim: '2026-10-05T12:30:00Z' }],
        }),
      )

      expect(motivosDe(saida, '2026-10-05T12:00:00Z')).toEqual(['reuniao_existente'])
    })
  })

  describe('dois fusos', () => {
    it('o mesmo instante recebe rótulos diferentes para leads em fusos diferentes', () => {
      const emSaoPaulo = gerarHorarios(entrada({ fusoDoLead: SAO_PAULO }))
      const emManaus = gerarHorarios(entrada({ fusoDoLead: MANAUS }))

      expect(inicios(emManaus)).toEqual(inicios(emSaoPaulo))
      expect(emSaoPaulo.ofertas[0]?.rotuloNoFusoDoLead).toBe(
        'segunda-feira, 5 de outubro de 2026, 09h00',
      )
      expect(emManaus.ofertas[0]?.rotuloNoFusoDoLead).toBe(
        'segunda-feira, 5 de outubro de 2026, 08h00',
      )
      // O fuso do especialista não muda com o do lead: quem se desloca é a fala.
      expect(emManaus.ofertas[0]?.fusoDoEspecialista).toBe(SAO_PAULO)
    })

    it('especialista em Manaus com faixa das 9 às 12 não oferece nada às 08h de São Paulo', () => {
      const saida = gerarHorarios(
        entrada({
          especialista: {
            fuso: MANAUS,
            duracaoPadraoMin: 30,
            tetoDiario: 6,
            antecedenciaMinimaMin: 0,
            antecedenciaMaximaDias: 30,
          },
          fusoDoLead: SAO_PAULO,
          // Segunda-feira, 08h00 em Manaus e 09h00 em São Paulo.
          agora: '2026-10-05T12:00:00Z',
        }),
      )

      // 08h00 em São Paulo é 07h00 em Manaus, antes de a faixa abrir.
      expect(inicios(saida)).not.toContain('2026-10-05T11:00:00Z')
      expect(inicios(saida)[0]).toBe('2026-10-05T13:00:00Z')
      expect(saida.ofertas[0]?.rotuloNoFusoDoLead).toBe(
        'segunda-feira, 5 de outubro de 2026, 10h00',
      )
      expect(saida.ofertas.every((o) => !o.rotuloNoFusoDoLead.includes('08h'))).toBe(true)
    })
  })

  describe('horário de verão', () => {
    const aosDomingos = (fuso: string, agora: string) =>
      gerarHorarios(
        entrada({
          especialista: {
            fuso,
            duracaoPadraoMin: 30,
            tetoDiario: 6,
            antecedenciaMinimaMin: 0,
            antecedenciaMaximaDias: 30,
          },
          disponibilidade: [{ diaDaSemana: DOMINGO, inicio: '09:00', fim: '12:00' }],
          fusoDoLead: fuso,
          agora,
        }),
      )

      it('no dia de 23 horas de Santiago a faixa continua às 09h locais', () => {
      // 2026-09-06 é o domingo em que o Chile adianta o relógio à meia-noite:
      // o dia tem 23 horas. A véspera dele, 2026-08-30, é domingo comum.
      const comum = aosDomingos(SANTIAGO, '2026-08-29T12:00:00Z')
      const encurtado = aosDomingos(SANTIAGO, '2026-09-05T12:00:00Z')

      expect(inicios(comum)[0]).toBe('2026-08-30T13:00:00Z')
      expect(inicios(encurtado)[0]).toBe('2026-09-06T12:00:00Z')
      // Somar minutos em UTC a partir do domingo anterior devolveria 13h00 nos
      // dois; a faixa é lida no fuso do especialista, e por isso o instante anda.
      expect(comum.ofertas[0]?.rotuloNoFusoDoLead).toBe(
        'domingo, 30 de agosto de 2026, 09h00',
      )
      expect(encurtado.ofertas[0]?.rotuloNoFusoDoLead).toBe(
        'domingo, 6 de setembro de 2026, 09h00',
      )
    })

    it('no dia de 25 horas de Lisboa a faixa continua às 09h locais', () => {
      // 2026-10-25 é o domingo em que Portugal atrasa o relógio: o dia tem 25
      // horas. 2026-10-18 é o domingo anterior, ainda em horário de verão.
      const comum = aosDomingos(LISBOA, '2026-10-17T12:00:00Z')
      const alongado = aosDomingos(LISBOA, '2026-10-24T12:00:00Z')

      expect(inicios(comum)[0]).toBe('2026-10-18T08:00:00Z')
      expect(inicios(alongado)[0]).toBe('2026-10-25T09:00:00Z')
      expect(comum.ofertas[0]?.rotuloNoFusoDoLead).toBe(
        'domingo, 18 de outubro de 2026, 09h00',
      )
      expect(alongado.ofertas[0]?.rotuloNoFusoDoLead).toBe(
        'domingo, 25 de outubro de 2026, 09h00',
      )
    })

    it('a duração de cada oferta continua sendo a do especialista nos dois dias', () => {
      for (const saida of [
        aosDomingos(SANTIAGO, '2026-09-05T12:00:00Z'),
        aosDomingos(LISBOA, '2026-10-24T12:00:00Z'),
      ]) {
        for (const oferta of saida.ofertas) {
          expect(Date.parse(oferta.fim) - Date.parse(oferta.inicio)).toBe(30 * 60_000)
        }
      }
    })
  })

  describe('entrada que não se aceita calada', () => {
    it('recusa fuso que não existe', () => {
      expect(() => gerarHorarios(entrada({ fusoDoLead: 'America/Nao_Existe' }))).toThrow()
    })

    it('recusa duração zero, que nunca terminaria a varredura', () => {
      expect(() =>
        gerarHorarios(
          entrada({
            especialista: {
              fuso: SAO_PAULO,
              duracaoPadraoMin: 0,
              tetoDiario: 6,
              antecedenciaMinimaMin: 0,
              antecedenciaMaximaDias: 30,
            },
          }),
        ),
      ).toThrow(/duracaoPadraoMin/)
    })

    it('recusa instante que não é ISO-8601', () => {
      expect(() => gerarHorarios(entrada({ agora: 'ontem de manhã' }))).toThrow(/agora/)
    })

    it('recusa faixa invertida e faixa de duração zero', () => {
      for (const faixa of [
        { diaDaSemana: SEGUNDA, inicio: '12:00', fim: '09:00' },
        { diaDaSemana: SEGUNDA, inicio: '09:00', fim: '09:00' },
      ]) {
        expect(() => gerarHorarios(entrada({ disponibilidade: [faixa] }))).toThrow(/sem duração/)
      }
    })

    it('recusa faixa com segundo, em vez de arredondar calada', () => {
      expect(() =>
        gerarHorarios(
          entrada({ disponibilidade: [{ diaDaSemana: SEGUNDA, inicio: '09:00:30', fim: '12:00' }] }),
        ),
      ).toThrow(/segundo/)
    })

    it('recusa dia da semana fora de 0..6', () => {
      expect(() =>
        gerarHorarios(entrada({ disponibilidade: [{ diaDaSemana: 7, inicio: '09:00', fim: '12:00' }] })),
      ).toThrow(/dia da semana/)
    })

    it('recusa intervalo ocupado sem duração', () => {
      expect(() =>
        gerarHorarios(
          entrada({ bloqueios: [{ inicio: '2026-10-05T12:00:00Z', fim: '2026-10-05T12:00:00Z' }] }),
        ),
      ).toThrow(/bloqueios/)
    })
  })

  it('devolve lista vazia quando o especialista não tem disponibilidade nenhuma', () => {
    const saida = gerarHorarios(entrada({ disponibilidade: [] }))

    expect(saida).toEqual({ ofertas: [], descartes: [] })
  })
})

describe('rotularInstante', () => {
  it('escreve a frase em português, com o dia da semana e o mês por extenso', () => {
    expect(rotularInstante('2026-10-05T12:00:00Z', SAO_PAULO)).toBe(
      'segunda-feira, 5 de outubro de 2026, 09h00',
    )
    expect(rotularInstante('2026-03-01T03:05:00Z', SAO_PAULO)).toBe(
      'domingo, 1 de março de 2026, 00h05',
    )
  })

  it('aceita o instante em milissegundos, que é o que o gerador tem em mãos', () => {
    expect(rotularInstante(Date.parse('2026-10-05T12:00:00Z'), MANAUS)).toBe(
      'segunda-feira, 5 de outubro de 2026, 08h00',
    )
  })

  it('recusa fuso que não existe', () => {
    expect(() => rotularInstante('2026-10-05T12:00:00Z', 'Marte/Olympus')).toThrow()
  })
})

describe('diasDaSemanaNoHorizonte', () => {
  // 2026-10-05T11:00:00Z é segunda-feira, 08h00 em São Paulo.
  const SEGUNDA_DE_MANHA = '2026-10-05T11:00:00Z'

  it('com horizonte de zero dias devolve só o dia de hoje', () => {
    expect([...diasDaSemanaNoHorizonte(SAO_PAULO, SEGUNDA_DE_MANHA, 0)]).toEqual([SEGUNDA])
  })

  it('conta o dia de hoje e o último dia, os dois inclusive', () => {
    expect([...diasDaSemanaNoHorizonte(SAO_PAULO, SEGUNDA_DE_MANHA, 2)].sort()).toEqual([1, 2, 3])
  })

  it('de seis dias para cima o conjunto é a semana inteira', () => {
    expect([...diasDaSemanaNoHorizonte(SAO_PAULO, SEGUNDA_DE_MANHA, 6)].sort()).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ])
    expect(diasDaSemanaNoHorizonte(SAO_PAULO, SEGUNDA_DE_MANHA, 30).size).toBe(7)
  })

  it('lê o dia no fuso pedido, não em UTC', () => {
    // 23h de segunda em São Paulo já é terça em Lisboa.
    const noite = '2026-10-06T02:00:00Z'

    expect([...diasDaSemanaNoHorizonte(SAO_PAULO, noite, 0)]).toEqual([SEGUNDA])
    expect([...diasDaSemanaNoHorizonte(LISBOA, noite, 0)]).toEqual([TERCA])
  })

  it('atravessa a mudança de horário de verão sem pular nem repetir dia', () => {
    // 2026-10-25 é o domingo de 25 horas em Portugal.
    const sabado = '2026-10-24T10:00:00Z'

    expect([...diasDaSemanaNoHorizonte(LISBOA, sabado, 2)].sort()).toEqual([0, 1, 6])
  })

  it('recusa fuso que não existe e horizonte negativo', () => {
    expect(() => diasDaSemanaNoHorizonte('Marte/Olympus', SEGUNDA_DE_MANHA, 30)).toThrow()
    expect(() => diasDaSemanaNoHorizonte('Marte/Olympus', SEGUNDA_DE_MANHA, 1)).toThrow()
    expect(() => diasDaSemanaNoHorizonte(SAO_PAULO, SEGUNDA_DE_MANHA, -1)).toThrow(/não negativo/)
  })
})
