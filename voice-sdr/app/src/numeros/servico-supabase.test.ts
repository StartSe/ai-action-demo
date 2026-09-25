// O que `registrarDeNovo` faz com o `estado` que `phone-register` devolve. A
// borda fala o vocabulário de `EstadoDoRegistro`
// (`registrado` | `inalterado` | `aguardando_aprovacao`, em
// supabase/functions/phone-register/respostas.ts), e a tela fala o dela
// (`registrada` | `aguardando_operadora`). Comparar um `estado` da borda com
// a palavra `'registrada'` da tela nunca casa: toda chamada bem-sucedida caía
// em `aguardando_operadora`, inclusive um registro imediato.

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { criarServicoDeNumeros } from '@/numeros/servico-supabase'

/**
 * Cliente que responde a `.from('account_members')` com a conta de exemplo e
 * devolve, em `.functions.invoke`, o corpo combinado para o teste.
 */
function clienteComResposta(corpo: unknown) {
  const cadeia = new Proxy(
    {},
    {
      get(_alvo, nome) {
        if (nome === 'then') {
          return (resolver: (valor: unknown) => void) =>
            resolver({ data: { account_id: 'c-1' }, error: null })
        }
        return () => cadeia
      },
    },
  )

  const cliente = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } } }) },
    from: () => cadeia,
    functions: {
      invoke: () => Promise.resolve({ data: corpo, error: null }),
    },
  }

  return cliente as unknown as SupabaseClient
}

describe('registrarDeNovo: o estado que phone-register devolve', () => {
  it.each([
    ['registrado', 'registrada'],
    ['inalterado', 'registrada'],
    ['aguardando_aprovacao', 'aguardando_operadora'],
  ] as const)('%s da borda vira %s na tela', async (estadoDaBorda, esperado) => {
    const cliente = clienteComResposta({ ok: true, estado: estadoDaBorda })

    const resultado = await criarServicoDeNumeros(cliente).registrarDeNovo('linha-1')

    expect(resultado).toEqual({ estado: esperado })
  })
})
