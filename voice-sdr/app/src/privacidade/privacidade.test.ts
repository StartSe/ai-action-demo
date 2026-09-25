import { FALAS_DE_TODO_PROPOSITO } from '@compartilhado/speech/todos-os-propositos.ts'
import { describe, expect, it } from 'vitest'

import {
  estadoDaGravacao,
  mudancasDe,
  previaDoAviso,
  rascunhoDe,
  reduzPrazo,
  validarPrivacidade,
} from '@/privacidade/privacidade'
import type { PrivacidadeDaConta } from '@/privacidade/tipos'

const PADRAO: PrivacidadeDaConta = { gravacaoLigada: true, avisoDeGravacao: null, retencaoDias: 90 }

describe('validarPrivacidade', () => {
  it('aviso em branco vira o nulo da coluna, que é a frase padrão', () => {
    const validacao = validarPrivacidade({ ...rascunhoDe(PADRAO), aviso: '   ' })
    expect(validacao).toEqual({ ok: true, privacidade: PADRAO })
  })

  it.each([
    ['', 'nao-numero'],
    ['30 dias', 'nao-numero'],
    ['-5', 'nao-numero'],
    ['0', 'fora-da-faixa'],
    ['3651', 'fora-da-faixa'],
  ])('prazo %j é recusado por %s', (retencao, motivo) => {
    expect(validarPrivacidade({ ...rascunhoDe(PADRAO), retencao })).toEqual({
      ok: false,
      retencao: motivo,
    })
  })

  it('aceita as pontas da faixa do check', () => {
    expect(validarPrivacidade({ ...rascunhoDe(PADRAO), retencao: '1' }).ok).toBe(true)
    expect(validarPrivacidade({ ...rascunhoDe(PADRAO), retencao: '3650' }).ok).toBe(true)
  })
})

describe('mudancasDe e reduzPrazo', () => {
  it('só o que mudou vai ao RPC', () => {
    expect(mudancasDe(PADRAO, { ...PADRAO, retencaoDias: 30 })).toEqual({ retencaoDias: 30 })
    expect(mudancasDe(PADRAO, PADRAO)).toEqual({})
    expect(mudancasDe({ ...PADRAO, avisoDeGravacao: 'Gravada.' }, PADRAO)).toEqual({
      avisoDeGravacao: null,
    })
  })

  it('reduzir pede contagem, aumentar não', () => {
    expect(reduzPrazo(PADRAO, { ...PADRAO, retencaoDias: 30 })).toBe(true)
    expect(reduzPrazo(PADRAO, { ...PADRAO, retencaoDias: 120 })).toBe(false)
    expect(reduzPrazo(PADRAO, PADRAO)).toBe(false)
  })
})

describe('previaDoAviso', () => {
  const identidade = { nome: 'Sarah', empresa: 'Vexo Tecnologia' }

  it('em branco é a frase da camada 1, com o lead de exemplo', () => {
    const previa = previaDoAviso('', identidade)
    expect(previa).toBe(
      'Oi, Marcos Ferreira? Aqui é a Sarah, da Vexo Tecnologia. Antes da gente começar: essa ligação é gravada, tudo bem?',
    )
    expect(FALAS_DE_TODO_PROPOSITO.avisoDeGravacao).toContain('{nome_do_lead}')
  })

  it('o texto da conta sai com os marcadores resolvidos', () => {
    expect(previaDoAviso('{nome_do_lead}, a {empresa} grava esta ligação.', identidade)).toBe(
      'Marcos Ferreira, a Vexo Tecnologia grava esta ligação.',
    )
  })
})

describe('estadoDaGravacao', () => {
  it('desligada com propósito no ar pela configuração anterior ainda grava no provedor', () => {
    const desligada = { ...PADRAO, gravacaoLigada: false }
    expect(estadoDaGravacao(desligada, { propositosPendentes: ['discovery'] })).toBe(
      'desligada-no-painel',
    )
    expect(estadoDaGravacao(desligada, { propositosPendentes: [] })).toBe('desligada')
    expect(estadoDaGravacao(PADRAO, { propositosPendentes: ['discovery'] })).toBe('ligada')
  })
})
