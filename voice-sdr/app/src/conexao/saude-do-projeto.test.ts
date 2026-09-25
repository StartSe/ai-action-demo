import { describe, expect, test, vi } from 'vitest'

import { VERSAO_DA_INSTALACAO } from '@compartilhado/versao-da-instalacao.ts'

import { conferirProjeto, situacaoDaVersao } from '@/conexao/saude-do-projeto'

const URL_DO_PROJETO = 'https://abcdefghijklmnopqrst.supabase.co'

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
}

const CORPO_PRONTO = {
  ok: true,
  chave: 'sb_publishable_AbCdEf123456',
  rotinas: 'ja_registrada',
  versao: { banco: { ...VERSAO_DA_INSTALACAO }, funcoes: { ...VERSAO_DA_INSTALACAO } },
}

describe('conferirProjeto', () => {
  test('pergunta à função saude do projeto e devolve a chave e a versão', async () => {
    const buscar = vi.fn(async () => resposta(200, CORPO_PRONTO))
    const resultado = await conferirProjeto(URL_DO_PROJETO, buscar as unknown as typeof fetch)
    expect(buscar).toHaveBeenCalledWith(`${URL_DO_PROJETO}/functions/v1/saude`, expect.objectContaining({ method: 'GET' }))
    expect(resultado).toEqual({ estado: 'pronto', chave: CORPO_PRONTO.chave, versao: CORPO_PRONTO.versao })
  })

  test('404 é projeto sem a instalação', async () => {
    const buscar = async () => resposta(404, { message: 'Function not found' })
    expect(await conferirProjeto(URL_DO_PROJETO, buscar as typeof fetch)).toEqual({ estado: 'sem_instalacao' })
  })

  test('a função respondendo que o banco não está pronto é instalação incompleta', async () => {
    const buscar = async () => resposta(503, { ...CORPO_PRONTO, ok: false, versao: { banco: null, funcoes: VERSAO_DA_INSTALACAO } })
    expect(await conferirProjeto(URL_DO_PROJETO, buscar as typeof fetch)).toEqual({ estado: 'instalacao_incompleta' })
  })

  test('sem resposta, o projeto é inalcançável', async () => {
    const buscar = async () => {
      throw new TypeError('Failed to fetch')
    }
    expect(await conferirProjeto(URL_DO_PROJETO, buscar as typeof fetch)).toEqual({ estado: 'inalcancavel' })
  })
})

describe('situacaoDaVersao', () => {
  const esperada = { migracao: '20261005110000', funcoes: 'aaaa' }
  const projeto = (migracao: string | null, funcoes: string | null = 'aaaa') => ({
    banco: migracao === null ? null : { migracao, funcoes },
    funcoes: { migracao: migracao ?? '', funcoes },
  })

  test('mesma migração e mesmas funções: em dia', () => {
    expect(situacaoDaVersao(projeto('20261005110000'), esperada)).toBe('em_dia')
  })

  test('banco com migração mais antiga pede atualizar a instalação', () => {
    expect(situacaoDaVersao(projeto('20261001100000'), esperada)).toBe('banco_atrasado')
  })

  test('banco com migração mais nova diz que a cópia é mais antiga', () => {
    expect(situacaoDaVersao(projeto('20261101100000'), esperada)).toBe('copia_atrasada')
  })

  test('mesma migração com funções de outra geração', () => {
    expect(situacaoDaVersao(projeto('20261005110000', 'bbbb'), esperada)).toBe('funcoes_diferentes')
  })

  test('projeto sem registro de versão não afirma nada', () => {
    expect(situacaoDaVersao(projeto(null), esperada)).toBe('desconhecida')
  })

  test('a versão esperada por padrão é a que o pacote gerou', () => {
    expect(situacaoDaVersao(projeto(VERSAO_DA_INSTALACAO.migracao, VERSAO_DA_INSTALACAO.funcoes))).toBe('em_dia')
  })
})
