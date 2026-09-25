// O que o serviço manda ao Supabase, lido por um cliente que só grava a cadeia
// de chamadas. Duas asserções justificam o arquivo: remover é `update` com as
// colunas da remoção e nunca `delete` (RF-804), e a confirmação da importação
// grava com `source='import'` o que ela mesma recalculou.

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { criarServicoDeBloqueios } from '@/bloqueios/servico-supabase'

interface Chamada {
  tabela: string
  metodos: { nome: string; argumentos: unknown[] }[]
}

/**
 * Cliente que responde a qualquer cadeia e registra cada método. `respostas`
 * decide o que a cadeia devolve quando é aguardada, pela tabela e pelo método
 * que a abriu.
 */
function clienteGravador(
  respostas: (chamada: Chamada) => { data: unknown; error: unknown },
) {
  const chamadas: Chamada[] = []

  function cadeia(chamada: Chamada): unknown {
    return new Proxy(
      {},
      {
        get(_alvo, nome) {
          if (nome === 'then') {
            return (resolver: (valor: unknown) => void) => resolver(respostas(chamada))
          }
          return (...argumentos: unknown[]) => {
            chamada.metodos.push({ nome: String(nome), argumentos })
            return cadeia(chamada)
          }
        },
      },
    )
  }

  const cliente = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } } }) },
    from(tabela: string) {
      const chamada: Chamada = { tabela, metodos: [] }
      chamadas.push(chamada)
      return cadeia(chamada)
    },
  }

  return { cliente: cliente as unknown as SupabaseClient, chamadas }
}

function nomes(chamada: Chamada | undefined): string[] {
  return (chamada?.metodos ?? []).map((metodo) => metodo.nome)
}

function responderPadrao(chamada: Chamada) {
  if (chamada.tabela === 'account_members') {
    return { data: { account_id: 'c-1' }, error: null }
  }
  const aberta = chamada.metodos[0]?.nome
  if (aberta === 'select') {
    return { data: [{ phone_e164: '+5511988887777' }], error: null }
  }
  return { data: [{ id: 'b-1' }], error: null }
}

describe('criarServicoDeBloqueios', () => {
  it('remover é update com instante e motivo, filtrado pelo bloqueio ativo, e nunca delete', async () => {
    const { cliente, chamadas } = clienteGravador(responderPadrao)

    const resultado = await criarServicoDeBloqueios(cliente).remover('b-1', ' era engano ')

    expect(resultado).toEqual({ ok: true })
    const escrita = chamadas.find((chamada) => chamada.tabela === 'dnc_entries')
    expect(nomes(escrita)).not.toContain('delete')
    expect(nomes(escrita)[0]).toBe('update')

    const colunas = escrita?.metodos[0]?.argumentos[0] as Record<string, unknown>
    expect(Object.keys(colunas).sort()).toEqual(['removal_reason', 'removed_at'])
    expect(colunas.removal_reason).toBe('era engano')
    expect(escrita?.metodos).toContainEqual({ nome: 'is', argumentos: ['removed_at', null] })
  })

  it('remoção que a RLS recusou em silêncio é sem-permissao', async () => {
    const { cliente } = clienteGravador((chamada) =>
      chamada.tabela === 'dnc_entries' ? { data: [], error: null } : responderPadrao(chamada),
    )

    expect(await criarServicoDeBloqueios(cliente).remover('b-1', 'era engano')).toEqual({
      ok: false,
      motivo: 'sem-permissao',
    })
  })

  it('o segundo bloqueio ativo do mesmo número vira ja-bloqueado', async () => {
    const { cliente } = clienteGravador((chamada) =>
      chamada.tabela === 'dnc_entries'
        ? { data: null, error: { code: '23505', message: 'duplicate key' } }
        : responderPadrao(chamada),
    )

    expect(
      await criarServicoDeBloqueios(cliente).incluir({
        e164: '+5548999998888',
        motivo: 'pediu',
      }),
    ).toEqual({ ok: false, motivo: 'ja-bloqueado' })
  })

  it('a importação recalcula a prévia e grava só os válidos, com source import', async () => {
    const { cliente, chamadas } = clienteGravador(responderPadrao)

    const resultado = await criarServicoDeBloqueios(cliente).importar(
      '(48) 99999-8888\n11 98888-7777\n1234',
      ' lista do jurídico ',
    )

    expect(resultado.ok && resultado.previa.jaBloqueados).toEqual(['+5511988887777'])
    const insercao = chamadas.find((chamada) => nomes(chamada)[0] === 'insert')
    expect(insercao?.metodos[0]?.argumentos[0]).toEqual([
      {
        account_id: 'c-1',
        phone_e164: '+5548999998888',
        reason: 'lista do jurídico',
        source: 'import',
      },
    ])
  })
})
