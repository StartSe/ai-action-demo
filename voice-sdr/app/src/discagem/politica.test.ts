import { describe, expect, it } from 'vitest'

import {
  camposMudados,
  FAIXAS,
  limiteDeSimultaneidade,
  mudancasDe,
  previaDaJanela,
  rascunhoDe,
  validarPolitica,
} from '@/discagem/politica'
import type { PoliticaDeDiscagem } from '@/discagem/tipos'
import type { Integracao } from '@/integracoes/tipos'

function politicaPadrao(): PoliticaDeDiscagem {
  const faixa = { start: '09:00', end: '18:00' }
  return {
    janela: { '1': faixa, '2': faixa, '3': faixa, '4': faixa, '5': faixa },
    intervaloMinimoMinutos: 60,
    tentativasPorNumero: 3,
    tetoDiarioDeLigacoes: 200,
    tetoDeGastoCentavos: null,
    duracaoMaximaSegundos: 600,
    simultaneidade: 5,
  }
}

function comCota(provedor: 'voz' | 'telefonia', limite: number | null): Integracao {
  return {
    provedor,
    rotulo: provedor,
    fornecedor: provedor,
    estado: 'conectado',
    configurado: true,
    conectado: true,
    credito: null,
    cota: limite === null ? null : { rotulo: 'x', emUso: 0, limite, esgotada: false },
    erro: null,
    chaves: [],
    bloqueia: '',
  }
}

describe('limite de simultaneidade', () => {
  it('o menor dos dois provedores manda, e a tela sabe qual', () => {
    expect(limiteDeSimultaneidade([comCota('voz', 8), comCota('telefonia', 3)])).toEqual({
      teto: 3,
      manda: 'telefonia',
      voz: 8,
      telefonia: 3,
    })
    expect(limiteDeSimultaneidade([comCota('voz', 2), comCota('telefonia', 6)]).manda).toBe('voz')
  })

  it('empate entre os dois é dito como empate', () => {
    expect(limiteDeSimultaneidade([comCota('voz', 4), comCota('telefonia', 4)]).manda).toBe('ambos')
  })

  it('provedor que permite mais do que a coluna não passa por cima dela', () => {
    expect(limiteDeSimultaneidade([comCota('voz', 50), comCota('telefonia', 30)])).toMatchObject({
      teto: FAIXAS.simultaneidade.maximo,
      manda: 'coluna',
    })
  })

  it('sem nenhum limite lido, vale o check da coluna e nada trava', () => {
    expect(limiteDeSimultaneidade(null)).toEqual({
      teto: FAIXAS.simultaneidade.maximo,
      manda: 'coluna',
      voz: null,
      telefonia: null,
    })
    expect(limiteDeSimultaneidade([comCota('voz', null), comCota('telefonia', null)]).manda).toBe(
      'coluna',
    )
  })

  it('com um lido e o outro não, o lido manda', () => {
    expect(limiteDeSimultaneidade([comCota('voz', 4), comCota('telefonia', null)])).toEqual({
      teto: 4,
      manda: 'voz',
      voz: 4,
      telefonia: null,
    })
  })
})

describe('validação do rascunho', () => {
  it('o rascunho da política gravada volta à mesma política', () => {
    const politica = { ...politicaPadrao(), tetoDeGastoCentavos: 15050 }
    expect(validarPolitica(rascunhoDe(politica), 10)).toEqual({ ok: true, politica })
  })

  it('simultaneidade acima do provedor é recusada com motivo próprio', () => {
    const rascunho = { ...rascunhoDe(politicaPadrao()), simultaneidade: '5' }
    const resultado = validarPolitica(rascunho, 3)
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.erros.simultaneidade).toBe('acima-do-provedor')
  })

  it('no teto exato do provedor, passa', () => {
    const rascunho = { ...rascunhoDe(politicaPadrao()), simultaneidade: '3' }
    expect(validarPolitica(rascunho, 3).ok).toBe(true)
  })

  it.each([
    ['intervaloMinimoMinutos', '10081', 'fora-da-faixa'],
    ['tentativasPorNumero', '0', 'fora-da-faixa'],
    ['tetoDiarioDeLigacoes', 'duzentos', 'nao-e-numero'],
    ['duracaoMaximaSegundos', '29', 'fora-da-faixa'],
    ['simultaneidade', '11', 'fora-da-faixa'],
  ] as const)('%s = "%s" é %s', (campo, valor, motivo) => {
    const rascunho = { ...rascunhoDe(politicaPadrao()), [campo]: valor }
    const resultado = validarPolitica(rascunho, 10)
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.erros[campo]).toBe(motivo)
  })

  it('teto de gasto em branco é sem teto; zero e texto são recusados', () => {
    const base = rascunhoDe(politicaPadrao())
    const semTeto = validarPolitica({ ...base, tetoDeGastoReais: '  ' }, 10)
    expect(semTeto.ok && semTeto.politica.tetoDeGastoCentavos).toBeNull()

    const comVirgula = validarPolitica({ ...base, tetoDeGastoReais: '150,5' }, 10)
    expect(comVirgula.ok && comVirgula.politica.tetoDeGastoCentavos).toBe(15050)

    const zero = validarPolitica({ ...base, tetoDeGastoReais: '0' }, 10)
    expect(!zero.ok && zero.erros.tetoDeGastoCentavos).toBe('fora-da-faixa')
    const texto = validarPolitica({ ...base, tetoDeGastoReais: 'R$ 10' }, 10)
    expect(!texto.ok && texto.erros.tetoDeGastoCentavos).toBe('nao-e-numero')
  })

  it('faixa sem duração e hora torta nomeiam o dia', () => {
    const base = rascunhoDe(politicaPadrao())
    const invertida = validarPolitica(
      { ...base, janela: { ...base.janela, '2': { ligado: true, inicio: '18:00', fim: '09:00' } } },
      10,
    )
    expect(invertida).toMatchObject({
      ok: false,
      erros: { janela: 'faixa-sem-duracao' },
      diasComErro: ['2'],
    })

    const torta = validarPolitica(
      { ...base, janela: { ...base.janela, '6': { ligado: true, inicio: '9h', fim: '12:00' } } },
      10,
    )
    expect(torta).toMatchObject({ ok: false, erros: { janela: 'hora-invalida' }, diasComErro: ['6'] })
  })

  it('dia desligado some da janela, e fim do dia é 24:00', () => {
    const base = rascunhoDe(politicaPadrao())
    const resultado = validarPolitica(
      {
        ...base,
        janela: {
          ...base.janela,
          '1': { ligado: false, inicio: '09:00', fim: '18:00' },
          '6': { ligado: true, inicio: '08:00', fim: '24:00' },
        },
      },
      10,
    )
    expect(resultado.ok && Object.keys(resultado.politica.janela).sort()).toEqual([
      '2',
      '3',
      '4',
      '5',
      '6',
    ])
    expect(resultado.ok && resultado.politica.janela['6']).toEqual({ start: '08:00', end: '24:00' })
  })
})

describe('o que mudou', () => {
  it('só os campos diferentes, na ordem da tela', () => {
    const antes = politicaPadrao()
    const depois = { ...antes, simultaneidade: 3, tetoDiarioDeLigacoes: 500 }
    expect(camposMudados(antes, depois)).toEqual(['tetoDiarioDeLigacoes', 'simultaneidade'])
    expect(mudancasDe(antes, depois)).toEqual({ tetoDiarioDeLigacoes: 500, simultaneidade: 3 })
  })

  it('a mesma janela com as chaves em outra ordem não é mudança', () => {
    const antes = politicaPadrao()
    const faixa = { end: '18:00', start: '09:00' }
    const depois = { ...antes, janela: { '5': faixa, '4': faixa, '3': faixa, '2': faixa, '1': faixa } }
    expect(camposMudados(antes, depois)).toEqual([])
  })
})

describe('prévia da janela', () => {
  // 2026-09-23 é uma quarta-feira.
  const AGORA = Date.parse('2026-09-23T15:00:00Z')

  it('São Paulo e Manaus, lidos do relógio da conta em São Paulo', () => {
    const previa = previaDaJanela(politicaPadrao().janela, 'America/Sao_Paulo', AGORA)
    expect(previa.map((dia) => dia.dia)).toEqual(['1', '2', '3', '4', '5'])
    expect(previa[0]?.frases).toEqual([
      { fuso: 'America/Sao_Paulo', frase: 'das 9h às 18h' },
      {
        fuso: 'America/Manaus',
        frase: 'das 9h às 18h no horário de Manaus, que é 10h às 19h aqui',
      },
    ])
  })

  it('cada dia usa a própria faixa', () => {
    const previa = previaDaJanela(
      { '6': { start: '08:00', end: '12:00' }, '0': { start: '10:00', end: '14:30' } },
      'America/Sao_Paulo',
      AGORA,
    )
    expect(previa.map((dia) => [dia.dia, dia.frases[0]?.frase])).toEqual([
      ['6', 'das 8h às 12h'],
      ['0', 'das 10h às 14h30'],
    ])
  })
})
