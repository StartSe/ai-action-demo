// O corpo que `gerarRascunho` manda para a borda (`playbook-draft`), com um
// cliente que só grava a cadeia de `.from` e o pedido de `.functions.invoke`.
// A asserção existe porque o nome dos campos já divergiu do que a borda lê
// (US-063: `account_id`, `purpose`, `description`) sem que typecheck nenhum
// acusasse — o Supabase aceita corpo com campo a mais ou a menos, e o desencontro
// só aparecia em produção, como "rascunho não gravado" sem motivo nenhum.

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { criarServicoDaSarah } from '@/sarah/servico-supabase'

interface Chamada {
  tabela: string
  metodos: { nome: string; argumentos: unknown[] }[]
}

/**
 * Cliente que responde a qualquer cadeia de `.from` com a conta de exemplo, e
 * grava o corpo de toda chamada a `.functions.invoke`. Basta para o que
 * `gerarRascunho` faz: resolver a conta e chamar a borda.
 */
function clienteGravador() {
  const chamadas: Chamada[] = []
  const invocacoes: { funcao: string; corpo: unknown }[] = []

  function cadeia(chamada: Chamada): unknown {
    return new Proxy(
      {},
      {
        get(_alvo, nome) {
          if (nome === 'then') {
            return (resolver: (valor: unknown) => void) =>
              resolver(
                chamada.tabela === 'account_members'
                  ? { data: { account_id: 'c-1' }, error: null }
                  : chamada.metodos.some((metodo) => metodo.nome === 'upsert')
                    ? { data: [{ id: 'agente-1' }], error: null }
                    : { data: null, error: null },
              )
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
    functions: {
      invoke(funcao: string, opcoes: { body: unknown }) {
        invocacoes.push({ funcao, corpo: opcoes.body })
        return Promise.resolve({ data: { ok: true, roteiro: 'Pergunte a dor principal.' }, error: null })
      },
    },
  }

  return { cliente: cliente as unknown as SupabaseClient, invocacoes, chamadas }
}

describe('criarServicoDaSarah', () => {
  it('salvarNome grava só o nome, sem tocar na empresa nem no resto da identidade', async () => {
    const { cliente, chamadas } = clienteGravador()

    const resultado = await criarServicoDaSarah(cliente).salvarNome('  Ana ')

    expect(resultado).toEqual({ ok: true, publicacao: 'rascunho' })
    const upsert = chamadas
      .filter((chamada) => chamada.tabela === 'agents')
      .flatMap((chamada) => chamada.metodos)
      .find((metodo) => metodo.nome === 'upsert')
    // Sem `company_name` no corpo: o `upsert` só atualiza o que recebe, e a
    // linha que já tinha empresa continua com ela.
    expect(upsert?.argumentos).toEqual([{ account_id: 'c-1', name: 'Ana' }, { onConflict: 'account_id' }])
  })

  it('gerarRascunho manda conta, propósito e descrição no formato que playbook-draft lê', async () => {
    const { cliente, invocacoes } = clienteGravador()
    const descricao =
      'Vendemos treinamento de vendas para equipes de SDR em empresas de tecnologia B2B.'

    const resultado = await criarServicoDaSarah(cliente).gerarRascunho('discovery', descricao)

    expect(resultado).toEqual({ ok: true, roteiro: 'Pergunte a dor principal.' })
    expect(invocacoes).toEqual([
      {
        funcao: 'playbook-draft',
        corpo: { account_id: 'c-1', purpose: 'discovery', description: descricao },
      },
    ])
  })
})
