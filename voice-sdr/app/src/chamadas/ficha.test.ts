import { describe, expect, it } from 'vitest'

import {
  componentesSemPreco,
  custoPorComponente,
  estadoDaClassificacao,
  estadoDaGravacao,
  faixaDoSentimento,
  formatarSegundos,
  formatarValor,
  leituraDoAviso,
  textoDaClassificacao,
  totalDoCusto,
  turnosDaFicha,
} from '@/chamadas/ficha'
import { COMPONENTES_DE_CUSTO } from '@/chamadas/tipos'
import { fichaDeExemplo } from '@/testes/servico-de-chamadas-dublado'

const AGORA = '2026-09-23T12:00:00.000Z'

describe('formatarSegundos', () => {
  it.each([
    [0, '00:00'],
    [4, '00:04'],
    [125, '02:05'],
    [3725, '1:02:05'],
    [-3, '00:00'],
  ])('%s segundos viram %s', (segundos, esperado) => {
    expect(formatarSegundos(segundos)).toBe(esperado)
  })
})

describe('turnosDaFicha', () => {
  it('conta o instante do atendimento e diz quem falou', () => {
    expect(turnosDaFicha(fichaDeExemplo()).map(({ quem, instante }) => ({ quem, instante }))).toEqual([
      { quem: 'agent', instante: '00:04' },
      { quem: 'lead', instante: '00:09' },
      { quem: 'agent', instante: '02:01' },
    ])
  })

  it('sem atendimento, conta do início da chamada', () => {
    const ficha = fichaDeExemplo({ atendidaEm: null })
    expect(turnosDaFicha(ficha)[0]?.instante).toBe('00:14')
  })

  it('papel desconhecido e instante ilegível não viram Sarah nem 00:00', () => {
    const ficha = fichaDeExemplo({ turnos: [{ quem: 'user', texto: 'Alô?', em: 'ontem' }] })
    expect(turnosDaFicha(ficha)).toEqual([{ quem: 'desconhecido', texto: 'Alô?', instante: null }])
  })
})

describe('custo', () => {
  it('componente sem parcela sai nulo, nunca zero', () => {
    const custos = custoPorComponente([{ componente: 'voice', centavos: 35, moeda: 'USD' }])
    expect(custos.map((custo) => custo.componente)).toEqual([...COMPONENTES_DE_CUSTO])
    expect(custos.find((custo) => custo.componente === 'telephony')?.valores).toBeNull()
    expect(custos.find((custo) => custo.componente === 'voice')?.valores).toEqual([
      { moeda: 'USD', centavos: 35 },
    ])
  })

  it('parcela de preço zero é zero, e não aguardando', () => {
    const custos = custoPorComponente([{ componente: 'infra', centavos: 0, moeda: 'BRL' }])
    expect(custos.find((custo) => custo.componente === 'infra')?.valores).toEqual([
      { moeda: 'BRL', centavos: 0 },
    ])
  })

  it('dois informantes do mesmo componente se somam, como no gatilho', () => {
    const custos = custoPorComponente([
      { componente: 'telephony', centavos: 10, moeda: 'BRL' },
      { componente: 'telephony', centavos: 5, moeda: 'BRL' },
    ])
    expect(custos[0]).toEqual({ componente: 'telephony', valores: [{ moeda: 'BRL', centavos: 15 }] })
  })

  it('o total não soma moedas diferentes num número só', () => {
    expect(
      totalDoCusto([
        { componente: 'telephony', centavos: 20, moeda: 'BRL' },
        { componente: 'voice', centavos: 35, moeda: 'USD' },
        { componente: 'model', centavos: 12, moeda: 'USD' },
      ]),
    ).toEqual([
      { moeda: 'BRL', centavos: 20 },
      { moeda: 'USD', centavos: 47 },
    ])
  })

  it('conta os componentes que ainda esperam preço', () => {
    expect(componentesSemPreco(fichaDeExemplo().parcelas)).toBe(2)
    expect(componentesSemPreco([])).toBe(4)
  })

  it('formata na moeda da parcela', () => {
    expect(formatarValor({ centavos: 120, moeda: 'BRL' })).toMatch(/^R\$\s1,20$/)
    expect(formatarValor({ centavos: 35, moeda: 'USD' })).toMatch(/^US\$\s0,35$/)
  })
})

describe('estadoDaClassificacao', () => {
  it.each([
    ['in_progress', null, 3, 'em_andamento'],
    ['ringing', null, 0, 'em_andamento'],
    ['ended', 'backfill', 3, 'pronta'],
    ['ended', 'tool', 3, 'pronta'],
    ['ended', null, 3, 'processando'],
    ['ended', null, 0, 'sem_conversa'],
    ['failed', null, 0, 'sem_conversa'],
  ] as const)('%s, origem %s, %s turnos: %s', (status, origem, quantos, esperado) => {
    const ficha = fichaDeExemplo({ status, origemDaClassificacao: origem })
    const turnos = ficha.turnos.slice(0, quantos)
    expect(estadoDaClassificacao({ ...ficha, turnos })).toBe(esperado)
  })
})

describe('estadoDaGravacao', () => {
  it('caminho presente dentro do prazo está disponível', () => {
    expect(estadoDaGravacao(fichaDeExemplo(), AGORA)).toEqual({ tipo: 'disponivel' })
  })

  it('caminho zerado com data é expurgo, com a data', () => {
    const ficha = fichaDeExemplo({
      caminhoDaGravacao: null,
      gravacaoExpiraEm: '2026-09-20T17:02:05.000Z',
    })
    expect(estadoDaGravacao(ficha, AGORA)).toEqual({
      tipo: 'expurgada',
      em: '2026-09-20T17:02:05.000Z',
    })
  })

  it('prazo vencido é expurgo mesmo antes de a rotina apagar o arquivo', () => {
    const ficha = fichaDeExemplo({ gravacaoExpiraEm: '2026-09-22T00:00:00.000Z' })
    expect(estadoDaGravacao(ficha, AGORA).tipo).toBe('expurgada')
  })

  it('sem caminho e sem data é gravação que nunca houve, não expurgo', () => {
    const ficha = fichaDeExemplo({ caminhoDaGravacao: null, gravacaoExpiraEm: null })
    expect(estadoDaGravacao(ficha, AGORA)).toEqual({ tipo: 'sem_gravacao' })
  })
})

describe('leituraDoAviso', () => {
  it('lê o instante do aviso na conversa', () => {
    expect(leituraDoAviso(fichaDeExemplo())).toEqual({ tipo: 'localizado', instante: '00:04' })
  })

  it('aviso sem instante não é presumido', () => {
    expect(leituraDoAviso(fichaDeExemplo({ avisoDeGravacaoEm: null }))).toEqual({
      tipo: 'nao_localizado',
    })
  })
})

describe('faixaDoSentimento', () => {
  it.each([
    [-1, 'negativo'],
    [-0.21, 'negativo'],
    [-0.2, 'neutro'],
    [0, 'neutro'],
    [0.2, 'neutro'],
    [0.6, 'positivo'],
  ] as const)('%s é %s', (valor, faixa) => {
    expect(faixaDoSentimento(valor)).toBe(faixa)
  })
})

describe('textoDaClassificacao', () => {
  it('lê só texto, e não vai à cadeia de protótipos', () => {
    const classificacao = { stage_key: 'qualificado', nota: 3, vazio: '  ' }
    expect(textoDaClassificacao(classificacao, 'stage_key')).toBe('qualificado')
    expect(textoDaClassificacao(classificacao, 'nota')).toBeNull()
    expect(textoDaClassificacao(classificacao, 'vazio')).toBeNull()
    expect(textoDaClassificacao(classificacao, 'constructor')).toBeNull()
  })
})
