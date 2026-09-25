// A janela de discagem lida pelo módulo. O outro lado da mesma tabela de casos
// está em `testes/banco/janela-de-discagem.test.ts`, contra o SQL da guarda.
//
// O que este arquivo prova:
//
// 1. Os casos de `casos-de-janela.ts`, um por um: dentro, motivo e próxima
//    abertura. É a metade em processo da ponte entre o módulo e o banco.
// 2. A tabela cobre o que R-10 pede — Manaus e Noronha com um lead em cada — e
//    os três motivos de recusa. Caso apagado por descuido reprova aqui.
// 3. A frase em português, no fuso do lead, dizendo os dois fusos quando eles
//    diferem (T-21).
// 4. Lead sem fuso cai no fuso da conta, e nunca em UTC.
// 5. O módulo não lê relógio nem soma deslocamento de fuso à mão.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  CASOS_DE_JANELA,
  JANELA_COMERCIAL,
  MANAUS,
  NORONHA,
  SAO_PAULO,
} from './casos-de-janela.ts'
import {
  dentroDaJanela,
  fraseDaJanela,
  fraseDaProximaAbertura,
  proximaAbertura,
  resolverFuso,
} from './janela.ts'

describe('a tabela de casos', () => {
  it.each(CASOS_DE_JANELA.map((caso) => [caso.nome, caso] as const))(
    'decide o caso: %s',
    (_nome, caso) => {
      const situacao = dentroDaJanela(caso.janela, caso.instante, caso.fuso)

      expect(situacao.dentro).toBe(caso.dentro)
      if (!situacao.dentro) expect(situacao.motivo).toBe(caso.motivo)
      expect(proximaAbertura(caso.janela, caso.instante, caso.fuso)).toBe(caso.proximaAbertura)
    },
  )

  it('cobre os fusos que separam a decisão (R-10)', () => {
    const fusos = new Set(CASOS_DE_JANELA.map((caso) => caso.fuso))

    expect(fusos).toContain(SAO_PAULO)
    expect(fusos).toContain(MANAUS)
    expect(fusos).toContain(NORONHA)
  })

  it('cobre os três motivos de recusa', () => {
    const motivos = new Set(CASOS_DE_JANELA.map((caso) => caso.motivo))

    expect(motivos).toContain('fora_da_faixa')
    expect(motivos).toContain('dia_sem_faixa')
    expect(motivos).toContain('janela_invalida')
  })

  it('tem o mesmo instante decidido de dois jeitos por dois fusos', () => {
    const mesmoInstante = CASOS_DE_JANELA.filter(
      (caso) => caso.instante === '2026-10-06T22:00:00Z',
    )

    expect(mesmoInstante.map((caso) => [caso.fuso, caso.dentro])).toEqual([
      [SAO_PAULO, false],
      [MANAUS, true],
      [NORONHA, false],
    ])
  })
})

describe('a recusa por configuração', () => {
  it('não é a mesma de dia sem faixa', () => {
    const quebrada = dentroDaJanela({ '1': {} }, '2026-10-05T12:00:00Z', SAO_PAULO)
    const vazia = dentroDaJanela({}, '2026-10-05T12:00:00Z', SAO_PAULO)

    expect(quebrada).toMatchObject({ dentro: false, motivo: 'janela_invalida' })
    expect(vazia).toMatchObject({ dentro: false, motivo: 'dia_sem_faixa' })
  })

  it('diz o que veio, sem prometer qual tela conserta', () => {
    const situacao = dentroDaJanela('09:00-18:00', '2026-10-05T12:00:00Z', SAO_PAULO)

    expect(situacao.dentro).toBe(false)
    if (situacao.dentro || situacao.motivo !== 'janela_invalida') throw new Error('era para recusar')
    expect(situacao.erro).toMatch(/precisa ser um objeto/)
  })
})

describe('a frase da janela', () => {
  const terca = '2026-10-06T22:00:00Z'

  it('diz só a faixa quando o lead e a conta estão no mesmo fuso', () => {
    const frase = fraseDaJanela({
      janela: JANELA_COMERCIAL,
      instante: terca,
      fusoDoLead: SAO_PAULO,
      fusoDaConta: SAO_PAULO,
    })

    expect(frase).toBe('das 9h às 18h')
  })

  it('diz os dois fusos quando eles diferem (T-21)', () => {
    const frase = fraseDaJanela({
      janela: JANELA_COMERCIAL,
      instante: terca,
      fusoDoLead: MANAUS,
      fusoDaConta: SAO_PAULO,
    })

    expect(frase).toBe('das 9h às 18h no horário de Manaus, que é 10h às 19h aqui')
  })

  it('fala a meia hora sem virar decimal', () => {
    const frase = fraseDaJanela({
      janela: { '2': { start: '09:30', end: '18:00' } },
      instante: terca,
      fusoDoLead: SAO_PAULO,
      fusoDaConta: SAO_PAULO,
    })

    expect(frase).toBe('das 9h30 às 18h')
  })

  it('diz que a conta não disca no dia sem faixa', () => {
    const frase = fraseDaJanela({
      janela: JANELA_COMERCIAL,
      instante: '2026-10-11T15:00:00Z',
      fusoDoLead: SAO_PAULO,
      fusoDaConta: SAO_PAULO,
    })

    expect(frase).toBe('esta conta não disca aos domingos')
  })

  it('não inventa faixa quando a configuração está quebrada', () => {
    const frase = fraseDaJanela({
      janela: { '1': { start: '18:00', end: '09:00' } },
      instante: terca,
      fusoDoLead: SAO_PAULO,
      fusoDaConta: SAO_PAULO,
    })

    expect(frase).toBe('a janela de discagem desta conta está com a configuração inválida')
  })
})

describe('a frase da próxima abertura', () => {
  it('diz o dia da semana e a hora no fuso do lead', () => {
    const frase = fraseDaProximaAbertura({
      janela: JANELA_COMERCIAL,
      instante: '2026-10-11T15:00:00Z',
      fusoDoLead: SAO_PAULO,
      fusoDaConta: SAO_PAULO,
    })

    expect(frase).toBe('segunda-feira às 9h')
  })

  it('diz os dois fusos quando eles diferem', () => {
    const frase = fraseDaProximaAbertura({
      janela: JANELA_COMERCIAL,
      instante: '2026-10-11T15:00:00Z',
      fusoDoLead: NORONHA,
      fusoDaConta: SAO_PAULO,
    })

    expect(frase).toBe(
      'segunda-feira às 9h no horário de Fernando de Noronha, que é 8h aqui',
    )
  })

  it('não promete abertura quando a janela nunca abre', () => {
    const frase = fraseDaProximaAbertura({
      janela: {},
      instante: '2026-10-11T15:00:00Z',
      fusoDoLead: SAO_PAULO,
      fusoDaConta: SAO_PAULO,
    })

    expect(frase).toBeNull()
  })
})

describe('o fuso do lead', () => {
  it('cai no fuso da conta quando o lead não tem, e nunca em UTC', () => {
    expect(resolverFuso(null, SAO_PAULO)).toBe(SAO_PAULO)
    expect(resolverFuso(undefined, MANAUS)).toBe(MANAUS)
    expect(resolverFuso('   ', SAO_PAULO)).toBe(SAO_PAULO)
  })

  it('é o do lead quando ele tem', () => {
    expect(resolverFuso(NORONHA, SAO_PAULO)).toBe(NORONHA)
  })

  it('recusa conta sem fuso em vez de escolher um', () => {
    expect(() => resolverFuso(null, '')).toThrow(/fuso/)
  })

  it('recusa fuso que não existe na tabela de zonas', () => {
    expect(() => dentroDaJanela(JANELA_COMERCIAL, '2026-10-06T12:00:00Z', 'America/Atlantida'))
      .toThrow()
  })
})

describe('determinismo', () => {
  it('o módulo não lê relógio nem soma deslocamento à mão', () => {
    const fonte = readFileSync(new URL('./janela.ts', import.meta.url), 'utf8')

    expect(fonte).not.toMatch(/Date\.now/)
    expect(fonte).not.toMatch(/new Date\(/)
    expect(fonte).not.toMatch(/Math\.random/)
    expect(fonte).not.toMatch(/getTimezoneOffset/)
  })
})
