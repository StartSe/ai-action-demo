// As regras do cadastro de especialista (US-251).
//
// Elas repetem os checks da tabela de propósito: a tela precisa dizer o que
// está errado **antes** de mandar, porque `specialists_teto_util` não é frase
// para ninguém ler. O banco continua sendo quem recusa de verdade.

import { describe, expect, test } from 'vitest'

import {
  alternarModalidade,
  areasCadastradas,
  especialistaVazio,
  LIMITES,
  problemasDoCadastro,
  quantosAtivos,
} from '@/especialistas/regras'
import type { PedidoDeEspecialista } from '@/especialistas/tipos'

function pedido(mudanca: Partial<PedidoDeEspecialista> = {}): PedidoDeEspecialista {
  return {
    ...especialistaVazio('America/Sao_Paulo'),
    nome: 'Marina Duarte',
    email: 'marina@empresa.com.br',
    modalidades: ['video'],
    ...mudanca,
  }
}

describe('o cadastro novo', () => {
  test('nasce sem modalidade nenhuma', () => {
    // Adivinhar `video` para todo mundo agendaria presencial como vídeo.
    expect(especialistaVazio('America/Sao_Paulo').modalidades).toEqual([])
  })

  test('herda o fuso que a conta passou', () => {
    expect(especialistaVazio('America/Manaus').fuso).toBe('America/Manaus')
  })

  test('nasce com os mesmos padrões da tabela', () => {
    const novo = especialistaVazio('America/Sao_Paulo')
    expect(novo.duracaoPadraoMin).toBe(30)
    expect(novo.tetoDiario).toBe(6)
    expect(novo.antecedenciaMinimaMin).toBe(120)
    expect(novo.antecedenciaMaximaDias).toBe(30)
    expect(novo.ativo).toBe(true)
  })
})

describe('problemasDoCadastro', () => {
  test('o cadastro completo não tem problema nenhum', () => {
    expect(problemasDoCadastro(pedido())).toEqual([])
  })

  test('o nome em branco é problema', () => {
    expect(problemasDoCadastro(pedido({ nome: '   ' }))).toContain('nome')
  })

  test('o e-mail segue a mesma régua do check da tabela', () => {
    // Arroba que não seja o primeiro caractere.
    expect(problemasDoCadastro(pedido({ email: 'marina' }))).toContain('email')
    expect(problemasDoCadastro(pedido({ email: '@empresa.com' }))).toContain('email')
    expect(problemasDoCadastro(pedido({ email: 'm@e' }))).not.toContain('email')
  })

  test('sem modalidade não é cadastro', () => {
    // Quem não atende de jeito nenhum não recebe reunião.
    expect(problemasDoCadastro(pedido({ modalidades: [] }))).toContain('modalidades')
  })

  test('os intervalos são os dos checks da tabela', () => {
    expect(problemasDoCadastro(pedido({ duracaoPadraoMin: 14 }))).toContain('duracao')
    expect(problemasDoCadastro(pedido({ duracaoPadraoMin: 241 }))).toContain('duracao')
    expect(problemasDoCadastro(pedido({ duracaoPadraoMin: LIMITES.duracao.minimo }))).toEqual([])

    expect(problemasDoCadastro(pedido({ tetoDiario: 0 }))).toContain('teto')
    expect(problemasDoCadastro(pedido({ tetoDiario: 21 }))).toContain('teto')

    // Zero é antecedência válida: marcar para agora mesmo.
    expect(problemasDoCadastro(pedido({ antecedenciaMinimaMin: 0 }))).toEqual([])
    expect(problemasDoCadastro(pedido({ antecedenciaMinimaMin: 10_081 }))).toContain(
      'antecedencia_minima',
    )

    expect(problemasDoCadastro(pedido({ antecedenciaMaximaDias: 0 }))).toContain(
      'antecedencia_maxima',
    )
    expect(problemasDoCadastro(pedido({ antecedenciaMaximaDias: 91 }))).toContain(
      'antecedencia_maxima',
    )
  })

  test('campo numérico vazio vira problema, e não zero', () => {
    // O campo devolve NaN quando apagado: sem esta guarda, apagar a duração
    // viraria zero, que é número e passaria despercebido em alguns limites.
    expect(problemasDoCadastro(pedido({ tetoDiario: Number.NaN }))).toContain('teto')
    expect(problemasDoCadastro(pedido({ duracaoPadraoMin: 30.5 }))).toContain('duracao')
  })

  test('lista todos de uma vez, na ordem dos campos', () => {
    // Descobrir um erro por tentativa é o pior formulário possível.
    const problemas = problemasDoCadastro(
      pedido({ nome: '', email: 'x', modalidades: [], tetoDiario: 99 }),
    )
    expect(problemas).toEqual(['nome', 'email', 'modalidades', 'teto'])
  })
})

describe('alternarModalidade', () => {
  test('liga e desliga, mantendo a ordem canônica', () => {
    expect(alternarModalidade([], 'telefone')).toEqual(['telefone'])
    expect(alternarModalidade(['telefone'], 'video')).toEqual(['video', 'telefone'])
    expect(alternarModalidade(['video', 'telefone'], 'telefone')).toEqual(['video'])
  })

  test('a ordem não depende da ordem dos cliques', () => {
    const daEsquerda = alternarModalidade(alternarModalidade([], 'presencial'), 'video')
    const daDireita = alternarModalidade(alternarModalidade([], 'video'), 'presencial')
    expect(daEsquerda).toEqual(daDireita)
  })
})

describe('quantosAtivos', () => {
  test('conta só quem pode receber reunião hoje', () => {
    // O número que responde "a Sarah tem para quem encaminhar?".
    expect(quantosAtivos([{ ativo: true }, { ativo: false }, { ativo: true }])).toBe(2)
    expect(quantosAtivos([{ ativo: false }])).toBe(0)
    expect(quantosAtivos([])).toBe(0)
  })
})

describe('as áreas já cadastradas (D-16)', () => {
  test('uma por grafia, só dos ativos, em ordem alfabética', () => {
    expect(
      areasCadastradas([
        { area: 'Seguros', ativo: true },
        { area: ' Comercial e agro ', ativo: true },
        { area: 'comercial E AGRO', ativo: true },
        { area: 'Agronegócio', ativo: false },
        { area: null, ativo: true },
        { area: '   ', ativo: true },
      ]),
    ).toEqual(['Comercial e agro', 'Seguros'])
  })
})
