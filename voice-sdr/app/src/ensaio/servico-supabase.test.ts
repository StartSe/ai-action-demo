// O que o serviço do ensaio manda ao Supabase, lido por um cliente que só
// grava a cadeia de chamadas. A asserção que justifica o arquivo: a leitura é
// de `call_tool_invocations` da chamada, ordenada por `at`, e nada escreve.

import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from 'vitest'

import { criarServicoDoEnsaio } from '@/ensaio/servico-supabase'

const CHAMADA = '5f0c6b0e-8a4e-4c55-9d4b-2a7c1e9b3f10'

interface Chamada {
  tabela: string
  metodos: { nome: string; argumentos: unknown[] }[]
}

function clienteGravador(resposta: { data: unknown; error: unknown }) {
  const chamadas: Chamada[] = []

  function cadeia(chamada: Chamada): unknown {
    return new Proxy(
      {},
      {
        get(_alvo, nome) {
          if (nome === 'then') {
            return (resolver: (valor: unknown) => void) => resolver(resposta)
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
    from(tabela: string) {
      const chamada: Chamada = { tabela, metodos: [] }
      chamadas.push(chamada)
      return cadeia(chamada)
    },
  }

  return { cliente: cliente as unknown as SupabaseClient, chamadas }
}

test('lê as invocações da chamada em ordem de at, sem escrever', async () => {
  const { cliente, chamadas } = clienteGravador({
    data: [
      { tool: 'tool-dnc', at: '2026-09-24T13:00:02.000Z', error: 'dnc_indisponivel' },
      { tool: 'system:end_call', at: '2026-09-24T13:00:09.000Z', error: null },
    ],
    error: null,
  })

  const carga = await criarServicoDoEnsaio(cliente).carregarFerramentas(CHAMADA)

  expect(carga).toEqual({
    ok: true,
    ferramentas: [
      { ferramenta: 'tool-dnc', em: '2026-09-24T13:00:02.000Z', erro: 'dnc_indisponivel' },
      { ferramenta: 'system:end_call', em: '2026-09-24T13:00:09.000Z', erro: null },
    ],
  })
  expect(chamadas).toHaveLength(1)
  expect(chamadas[0]?.tabela).toBe('call_tool_invocations')
  expect(chamadas[0]?.metodos).toEqual([
    { nome: 'select', argumentos: ['tool, at, error'] },
    { nome: 'eq', argumentos: ['call_id', CHAMADA] },
    { nome: 'order', argumentos: ['at', { ascending: true }] },
  ])
})

test('erro da leitura vira falha, sem lista inventada', async () => {
  const { cliente } = clienteGravador({ data: null, error: { code: '42501', message: 'x' } })
  expect(await criarServicoDoEnsaio(cliente).carregarFerramentas(CHAMADA)).toEqual({ ok: false })
})

test('identificador malformado não vai ao banco', async () => {
  const { cliente, chamadas } = clienteGravador({ data: [], error: null })
  expect(await criarServicoDoEnsaio(cliente).carregarFerramentas('chamada-1')).toEqual({ ok: false })
  expect(chamadas).toHaveLength(0)
})
