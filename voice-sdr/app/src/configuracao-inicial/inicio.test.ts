// A regra do assistente sem tela: onde ele abre e quando a assistente conta
// como no ar.

import { describe, expect, it } from 'vitest'

import {
  ETAPAS_DO_INICIO,
  etapaInicial,
  medicaoDaConfiguracao,
  podeSeguir,
  sarahNoAr,
  vizinhaNestaVisita,
} from '@/configuracao-inicial/inicio'
import type { CargaDosPlaybooks } from '@/sarah/tipos'

function carga(publicacao: 'rascunho' | 'publicado' | 'alteracoes_pendentes', noAr: ('discovery' | 'reminder')[]) {
  return { ok: true, playbooks: { playbooks: [], publicacao, foraDaPlataforma: [], noAr } } as CargaDosPlaybooks
}

describe('sarahNoAr', () => {
  it('só a descoberta no ar já basta: o tutorial não escreve os outros três roteiros', () => {
    expect(sarahNoAr(carga('alteracoes_pendentes', ['discovery']))).toBe(true)
  })

  it('roteiro publicado no banco sem agente montado não é no ar', () => {
    expect(sarahNoAr(carga('rascunho', []))).toBe(false)
    expect(sarahNoAr(carga('alteracoes_pendentes', ['reminder']))).toBe(false)
    expect(sarahNoAr(undefined)).toBe(false)
  })
})

describe('etapaInicial', () => {
  const conectado = { modelo: true, voz: true, telefonia: true }
  const nada = { modelo: false, voz: false, telefonia: false }
  const medicao = { nome: true, agente: true, roteiro: true, numero: false, ligacao: false }
  const semNada = { nome: false, agente: false, roteiro: false, numero: false, ligacao: false }

  it('com a assistente no ar e sem número, abre no número', () => {
    expect(etapaInicial(conectado, medicao)).toBe('numero')
  })

  it('sem a assistente no ar, para na publicação', () => {
    expect(etapaInicial(conectado, { ...medicao, roteiro: false })).toBe('publicar')
  })

  it('a conta nova abre nas boas-vindas, e a pergunta seguinte é o nome', () => {
    expect(etapaInicial(nada, semNada)).toBe('boasVindas')
    expect(ETAPAS_DO_INICIO.slice(0, 3)).toEqual(['boasVindas', 'nome', 'plano'])
  })

  it('sem nome gravado, abre no nome antes de qualquer conexão', () => {
    expect(etapaInicial({ ...nada, modelo: true }, semNada)).toBe('nome')
    expect(etapaInicial(conectado, semNada)).toBe('nome')
  })

  it('com o nome gravado, segue para a primeira conexão que falta', () => {
    expect(etapaInicial(nada, { ...semNada, nome: true })).toBe('modelo')
    expect(etapaInicial(conectado, { ...semNada, nome: true })).toBe('negocio')
  })

  it('o WhatsApp é opcional: o assistente nunca para nele sozinho', () => {
    // Com telefonia feita e o resto pendente, o próximo é o negócio, e não o
    // passo opcional que fica entre os dois.
    expect(etapaInicial(conectado, { ...semNada, nome: true })).not.toBe('whatsapp')
  })
})

describe('a etapa do WhatsApp', () => {
  const conectado = { modelo: true, voz: true, telefonia: true }

  it('segue sem exigir a chave, por ser opcional', () => {
    expect(podeSeguir('whatsapp', conectado)).toBe(true)
  })

  it('fica entre a telefonia e o negócio na barra de progresso', () => {
    expect(vizinhaNestaVisita('telefonia', 1, false)).toBe('whatsapp')
    expect(vizinhaNestaVisita('whatsapp', 1, false)).toBe('negocio')
  })
})

describe('a etapa do nome', () => {
  const nada = { modelo: false, voz: false, telefonia: false }

  it('só segue com o nome gravado', () => {
    const semNome = medicaoDaConfiguracao(null, null)
    expect(podeSeguir('nome', nada, false, semNome)).toBe(false)
    expect(podeSeguir('nome', nada, false, medicaoDaConfiguracao(null, 'Ana'))).toBe(true)
  })

  it('nome em branco não conta como gravado', () => {
    expect(medicaoDaConfiguracao(null, '   ').nome).toBe(false)
  })
})
