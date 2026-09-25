import { describe, expect, test, vi } from 'vitest'

import { atenderSaude, enderecoDasFuncoes, type PortaDaSaude } from './saude.ts'

const AMBIENTE = {
  urlDoProjeto: 'https://abcdefghijklmnopqrst.supabase.co',
  chavePublicavel: 'sb_publishable_exemplo',
  versaoDasFuncoes: { migracao: '20261005110000', funcoes: 'f00d' },
}

function porta(sobre: Partial<PortaDaSaude> = {}): PortaDaSaude {
  return {
    registrarUrlBase: vi.fn(async () => true),
    versaoDoBanco: vi.fn(async () => ({ migracao: '20261005110000', funcoes: 'f00d' })),
    ...sobre,
  }
}

describe('enderecoDasFuncoes', () => {
  test('acrescenta o sufixo das funções ao endereço do projeto', () => {
    expect(enderecoDasFuncoes('https://abcdefghijklmnopqrst.supabase.co/')).toBe(
      'https://abcdefghijklmnopqrst.supabase.co/functions/v1',
    )
    expect(enderecoDasFuncoes('http://kong:8000')).toBe('http://kong:8000/functions/v1')
  })

  test('endereço vazio ou com caminho não vira endereço de rotina', () => {
    expect(enderecoDasFuncoes('')).toBeNull()
    expect(enderecoDasFuncoes('https://x.supabase.co/rest/v1')).toBeNull()
  })
})

describe('atenderSaude', () => {
  test('banco respondendo e endereço gravado: ok, com a chave publicável e as duas versões', async () => {
    const p = porta()
    const resposta = await atenderSaude({ metodo: 'GET' }, p, AMBIENTE)
    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({
      ok: true,
      chave: 'sb_publishable_exemplo',
      rotinas: 'registrada',
      versao: {
        banco: { migracao: '20261005110000', funcoes: 'f00d' },
        funcoes: { migracao: '20261005110000', funcoes: 'f00d' },
      },
    })
    expect(p.registrarUrlBase).toHaveBeenCalledWith(
      'https://abcdefghijklmnopqrst.supabase.co/functions/v1',
    )
  })

  test('endereço que já existia continua ok', async () => {
    const resposta = await atenderSaude(
      { metodo: 'GET' },
      porta({ registrarUrlBase: async () => false }),
      AMBIENTE,
    )
    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toMatchObject({ ok: true, rotinas: 'ja_registrada' })
  })

  test('banco sem o esquema da solução reprova a conferência', async () => {
    const falha = async () => {
      throw new Error('function public.versao_da_instalacao() does not exist')
    }
    const resposta = await atenderSaude(
      { metodo: 'GET' },
      porta({ versaoDoBanco: falha, registrarUrlBase: falha }),
      AMBIENTE,
    )
    expect(resposta.status).toBe(503)
    expect(resposta.corpo).toMatchObject({ ok: false, rotinas: 'falhou', versao: { banco: null } })
  })

  test('sem SUPABASE_URL as rotinas não têm para onde ir, e a conferência reprova', async () => {
    const p = porta()
    const resposta = await atenderSaude({ metodo: 'GET' }, p, { ...AMBIENTE, urlDoProjeto: '' })
    expect(resposta.status).toBe(503)
    expect(resposta.corpo).toMatchObject({ ok: false, rotinas: 'sem_endereco' })
    expect(p.registrarUrlBase).not.toHaveBeenCalled()
  })

  test('só GET', async () => {
    const resposta = await atenderSaude({ metodo: 'POST' }, porta(), AMBIENTE)
    expect(resposta.status).toBe(405)
  })

  test('a chave que sai é a publicável do ambiente, e nada mais', async () => {
    const resposta = await atenderSaude({ metodo: 'GET' }, porta(), { ...AMBIENTE, chavePublicavel: ' ' })
    expect(resposta.corpo).toMatchObject({ chave: null })
    expect(JSON.stringify(resposta.corpo)).not.toMatch(/service|secret/i)
  })
})
