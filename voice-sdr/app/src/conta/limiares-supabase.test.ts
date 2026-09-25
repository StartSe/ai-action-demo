// O que o serviço dos limiares manda ao Supabase, lido por um cliente que só
// grava a cadeia de chamadas. Três coisas justificam o arquivo: gravar é
// `update` com `.select()` nas quatro colunas (a trilha é do gatilho da
// tabela), a recusa silenciosa da RLS vira `sem-permissao`, e o `check` do
// banco vira `fora-do-dominio`.

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { LIMIARES_PADRAO } from '@/conta/limiares'
import { carregarLimiares, definirLimiares } from '@/conta/limiares-supabase'

interface Chamada {
  tabela: string
  metodos: { nome: string; argumentos: unknown[] }[]
}

type Resposta = { data: unknown; error: unknown }

function clienteGravador(respostas: (chamada: Chamada) => Resposta) {
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

function resposta(linha: Resposta) {
  return (chamada: Chamada): Resposta =>
    chamada.tabela === 'account_members' ? { data: { account_id: 'a-1' }, error: null } : linha
}

const LINHA = {
  sentiment_floor: -0.4,
  consecutive_failures_cap: 3,
  failed_criteria_cap: 1,
  credit_alert_cents: null,
}
const COLUNAS = 'sentiment_floor, consecutive_failures_cap, failed_criteria_cap, credit_alert_cents'

describe('limiares no Supabase', () => {
  it('carregar lê as quatro colunas da conta da sessão', async () => {
    const { cliente, chamadas } = clienteGravador(resposta({ data: LINHA, error: null }))

    expect(await carregarLimiares(cliente)).toEqual({
      ok: true,
      limiares: { ...LIMIARES_PADRAO, pisoDeSentimento: -0.4 },
    })
    expect(chamadas[1]).toEqual({
      tabela: 'account_settings',
      metodos: [
        { nome: 'select', argumentos: [COLUNAS] },
        { nome: 'eq', argumentos: ['account_id', 'a-1'] },
        { nome: 'maybeSingle', argumentos: [] },
      ],
    })
  })

  it('conta sem linha é o estado vazio, não uma falha', async () => {
    const { cliente } = clienteGravador(resposta({ data: null, error: null }))
    expect(await carregarLimiares(cliente)).toEqual({ ok: true, limiares: null })
  })

  it('gravar é update com .select(), crédito em branco indo como nulo', async () => {
    const { cliente, chamadas } = clienteGravador(resposta({ data: [LINHA], error: null }))
    const pedido = { ...LIMIARES_PADRAO, pisoDeSentimento: -0.4 }

    expect(await definirLimiares(cliente, pedido)).toEqual({ ok: true, limiares: pedido })
    expect(chamadas[1]).toEqual({
      tabela: 'account_settings',
      metodos: [
        { nome: 'update', argumentos: [LINHA] },
        { nome: 'eq', argumentos: ['account_id', 'a-1'] },
        { nome: 'select', argumentos: [COLUNAS] },
      ],
    })
  })

  it('a RLS recusando em silêncio vira sem-permissao', async () => {
    const { cliente } = clienteGravador(resposta({ data: [], error: null }))
    expect(await definirLimiares(cliente, LIMIARES_PADRAO)).toEqual({ ok: false, motivo: 'sem-permissao' })
  })

  it.each([
    ['23514', 'fora-do-dominio'],
    ['42501', 'sem-permissao'],
    ['08006', 'falha-de-comunicacao'],
  ])('o erro %s do banco vira %s', async (code, motivo) => {
    const { cliente } = clienteGravador(resposta({ data: null, error: { code } }))
    expect(await definirLimiares(cliente, LIMIARES_PADRAO)).toEqual({ ok: false, motivo })
  })
})
