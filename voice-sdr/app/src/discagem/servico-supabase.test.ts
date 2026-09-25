// O estado do portão pelo serviço do Supabase (US-119). O que o dublê de tela
// não alcança: o RPC chamado, a tradução dos códigos do banco para o
// vocabulário de `_shared/discagem/portao.ts` e a recusa de código
// desconhecido — descartá-lo faria a tela dizer "liberado" com uma condição
// faltando.

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { criarServicoDeDiscagem } from '@/discagem/servico-supabase'

/** Cadeia que aceita qualquer método e resolve com `resposta` quando aguardada. */
function cadeia(resposta: unknown, metodos: string[] = []): unknown {
  return new Proxy(
    {},
    {
      get(_alvo, nome) {
        if (nome === 'then') {
          return (resolver: (valor: unknown) => void) => resolver(resposta)
        }
        return () => {
          metodos.push(String(nome))
          return cadeia(resposta, metodos)
        }
      },
    },
  )
}

function clienteComPortao(linha: unknown, error: unknown = null) {
  const pedidos: { nome: string; argumentos: unknown }[] = []
  const cliente = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } } }) },
    from: () =>
      cadeia({
        data: { account_id: 'c-1', accounts: { timezone: 'America/Sao_Paulo' } },
        error: null,
      }),
    rpc(nome: string, argumentos: unknown) {
      pedidos.push({ nome, argumentos })
      return cadeia({ data: linha, error })
    },
  }
  return { cliente: cliente as unknown as SupabaseClient, pedidos }
}

describe('criarServicoDeDiscagem().portao', () => {
  it('pede estado_do_portao da conta e traduz os códigos, na ordem do servidor', async () => {
    const { cliente, pedidos } = clienteComPortao({
      real_dialing: false,
      first_test_call_ok_at: null,
      falta: ['real_dialing', 'first_test_call'],
    })

    const carga = await criarServicoDeDiscagem(cliente).portao()

    expect(pedidos).toEqual([{ nome: 'estado_do_portao', argumentos: { p_account_id: 'c-1' } }])
    expect(carga).toEqual({
      ok: true,
      portao: {
        falta: ['liberacao_da_fase', 'primeira_chamada_de_teste'],
        primeiraChamadaDeTesteEm: null,
      },
    })
  })

  it('liberado traz a data da ligação de teste', async () => {
    const { cliente } = clienteComPortao({
      real_dialing: true,
      first_test_call_ok_at: '2026-09-22T15:00:00+00:00',
      falta: [],
    })

    expect(await criarServicoDeDiscagem(cliente).portao()).toEqual({
      ok: true,
      portao: { falta: [], primeiraChamadaDeTesteEm: '2026-09-22T15:00:00+00:00' },
    })
  })

  it.each([
    ['código desconhecido', { falta: ['real_dialing', 'nova_condicao'] }],
    ['falta que não é lista', { falta: null }],
  ])('%s vira falha, nunca liberado', async (_nome, linha) => {
    const { cliente } = clienteComPortao(linha)

    expect(await criarServicoDeDiscagem(cliente).portao()).toEqual({
      ok: false,
      motivo: 'falha-de-comunicacao',
    })
  })

  it('zero linha é sem-conta, e erro do RPC é falha', async () => {
    expect(await criarServicoDeDiscagem(clienteComPortao(null).cliente).portao()).toEqual({
      ok: false,
      motivo: 'sem-conta',
    })
    expect(
      await criarServicoDeDiscagem(
        clienteComPortao(null, { code: '08006', message: 'x' }).cliente,
      ).portao(),
    ).toEqual({ ok: false, motivo: 'falha-de-comunicacao' })
  })
})
