import { describe, expect, it } from 'vitest'

import {
  CARTOES_DE_REUNIAO,
  cartaoDeLigacoes,
  cartaoDeReuniao,
  intervaloDoPeriodo,
  lerCampo,
  linhasDoFunil,
  metricaNorte,
  notaMedia,
  pendenciasDaMetricaNorte,
  periodoVazio,
  custoPorReuniao,
} from '@/painel/cartoes'
import { lerResumo } from '@/painel/leitura'
import type { ResumoDoPainel } from '@/painel/tipos'
import {
  resumoBrutoDeExemplo,
  resumoBrutoVazio,
  reunioesDeInstalacaoAntiga,
} from '@/testes/servico-do-painel-dublado'

function resumo(bruto: unknown): ResumoDoPainel {
  const lido = lerResumo(bruto)
  if (!lido) throw new Error('o resumo de exemplo não passou pela leitura')
  return lido
}

describe('lerCampo', () => {
  it('número vira valor, inclusive zero de contagem real', () => {
    expect(lerCampo(0)).toEqual({ estado: 'valor', valor: 0 })
    expect(lerCampo(12)).toEqual({ estado: 'valor', valor: 12 })
  })

  it('nulo é falta de base, nunca zero', () => {
    expect(lerCampo(null)).toEqual({ estado: 'sem_base' })
  })

  it('indisponivel_nesta_fase vira estado explicado com a fatia', () => {
    expect(lerCampo({ codigo: 'indisponivel_nesta_fase', fatia: 'F6' })).toEqual({
      estado: 'indisponivel',
      fatia: 'F6',
    })
  })
})

describe('as reuniões do período', () => {
  it('a métrica norte é o número de reuniões realizadas com desfecho', () => {
    expect(metricaNorte(resumo(resumoBrutoDeExemplo()))).toEqual({ estado: 'valor', valor: 5 })
  })

  it('a reunião sem desfecho fica ao lado da métrica norte, nunca somada', () => {
    expect(pendenciasDaMetricaNorte(resumo(resumoBrutoDeExemplo()))).toEqual({
      semApuracao: 2,
      degradada: false,
    })
    const bruto = resumoBrutoDeExemplo()
    const degradado = { ...bruto, apuracao: { taxa_de_apuracao: '0.5', degradacao_da_metrica_norte: true } }
    expect(pendenciasDaMetricaNorte(resumo(degradado)).degradada).toBe(true)
  })

  it('cada cartão de reunião lê o número do RPC', () => {
    const lido = resumo(resumoBrutoDeExemplo())
    const leituras = CARTOES_DE_REUNIAO.map((cartao) => [cartao, cartaoDeReuniao(lido, cartao)])
    expect(Object.fromEntries(leituras)).toEqual({
      marcadas: { estado: 'valor', valor: 9 },
      confirmadas: { estado: 'valor', valor: 4 },
      faltas: { estado: 'valor', valor: 1 },
      taxaDeComparecimento: { estado: 'valor', valor: 0.8333 },
      semApuracao: { estado: 'valor', valor: 2 },
      proximasReunioes: { estado: 'valor', valor: 3 },
      taxaDeApuracao: { estado: 'valor', valor: 0.75 },
    })
  })

  it('custo por reunião realizada vem por moeda, e sem realizada fica sem base', () => {
    expect(custoPorReuniao(resumo(resumoBrutoDeExemplo()))).toEqual({
      estado: 'valor',
      valores: [
        { moeda: 'BRL', centavos: 398 },
        { moeda: 'USD', centavos: 229 },
      ],
    })
    expect(custoPorReuniao(resumo(resumoBrutoVazio()))).toEqual({ estado: 'sem_base' })
  })

  it('a instalação sem a atualização que nega o número fica indisponível, nunca zero', () => {
    const lido = resumo({ ...resumoBrutoDeExemplo(), ...reunioesDeInstalacaoAntiga() })
    expect(metricaNorte(lido)).toEqual({ estado: 'indisponivel', fatia: 'F6' })
    expect(cartaoDeReuniao(lido, 'marcadas')).toEqual({ estado: 'indisponivel', fatia: 'F5' })
    expect(custoPorReuniao(lido)).toEqual({ estado: 'indisponivel', fatia: 'F6' })
  })
})

describe('ligações e qualidade', () => {
  it('lê os números do RPC, com numeric em texto', () => {
    const lido = resumo(resumoBrutoDeExemplo())
    expect(cartaoDeLigacoes(lido, 'total')).toEqual({ estado: 'valor', valor: 48 })
    expect(cartaoDeLigacoes(lido, 'taxaDeAtendimento')).toEqual({ estado: 'valor', valor: 0.625 })
    expect(cartaoDeLigacoes(lido, 'duracaoMedia')).toEqual({ estado: 'valor', valor: 142.5 })
    expect(notaMedia(lido)).toEqual({ estado: 'valor', valor: 7.6 })
  })

  it('período vazio: taxa, duração e nota sem base, e a tela vai para o vazio', () => {
    const lido = resumo(resumoBrutoVazio())
    expect(periodoVazio(lido)).toBe(true)
    expect(cartaoDeLigacoes(lido, 'total')).toEqual({ estado: 'valor', valor: 0 })
    expect(cartaoDeLigacoes(lido, 'taxaDeAtendimento')).toEqual({ estado: 'sem_base' })
    expect(cartaoDeLigacoes(lido, 'duracaoMedia')).toEqual({ estado: 'sem_base' })
    expect(notaMedia(lido)).toEqual({ estado: 'sem_base' })
  })
})

describe('o funil do período', () => {
  it('renomear a etapa troca o rótulo e não toca número nenhum', () => {
    const antes = linhasDoFunil(resumo(resumoBrutoDeExemplo()))
    const depois = linhasDoFunil(resumo(resumoBrutoDeExemplo({ qualified: 'Tem fit' })))

    const numeros = (linhas: typeof antes) =>
      linhas.map(({ key, entraram, passagem }) => ({ key, entraram, passagem }))
    expect(numeros(depois)).toEqual(numeros(antes))
    expect(antes.find((linha) => linha.key === 'qualified')?.label).toBe('Qualificado')
    expect(depois.find((linha) => linha.key === 'qualified')?.label).toBe('Tem fit')
  })

  it('a primeira etapa e a de perda não têm taxa de passagem', () => {
    const linhas = linhasDoFunil(resumo(resumoBrutoDeExemplo()))
    expect(linhas.find((linha) => linha.key === 'new')?.passagem).toEqual({ estado: 'sem_base' })
    expect(linhas.find((linha) => linha.key === 'lost')?.passagem).toEqual({ estado: 'sem_base' })
    expect(linhas.find((linha) => linha.key === 'contacted')?.passagem).toEqual({
      estado: 'valor',
      valor: 0.5,
    })
  })
})

describe('lerResumo', () => {
  it('recusa o que não tem o formato do RPC', () => {
    expect(lerResumo(null)).toBeNull()
    expect(lerResumo([])).toBeNull()
    expect(lerResumo({ funil: [] })).toBeNull()
  })

  it('campo ausente fica sem base, nunca zero', () => {
    const semReunioes: Record<string, unknown> = { ...resumoBrutoDeExemplo() }
    delete semReunioes.reunioes
    expect(resumo(semReunioes).reunioes.marcadas).toBeNull()
  })
})

describe('intervaloDoPeriodo', () => {
  // Meio-dia de uma quinta, 24 de setembro de 2026, no fuso de quem roda.
  const agora = new Date(2026, 8, 24, 12, 0, 0).getTime()
  const dia = (d: number, mes = 8) => new Date(2026, mes, d).toISOString()

  it.each([
    ['hoje', dia(24), dia(25)],
    ['sete-dias', dia(18), dia(25)],
    ['trinta-dias', dia(26, 7), dia(25)],
    ['mes', dia(1), dia(25)],
  ] as const)('%s vai de %s até %s, sem incluir o fim', (periodo, de, ate) => {
    expect(intervaloDoPeriodo(periodo, agora)).toEqual({ de, ate })
  })
})
