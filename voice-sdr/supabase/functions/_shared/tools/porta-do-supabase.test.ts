// A porta das ferramentas sobre um cliente em memória que registra cada
// consulta: tabela, colunas e filtros. É a prova das consultas que as três
// ferramentas passaram a compartilhar, já que o `index.ts` não tem teste.

import { describe, expect, test } from 'vitest'

import type { InvocacaoParaRegistro } from './esqueleto.ts'
import {
  VALIDADE_DAS_CONTAS_MS,
  criarPortaDeFerramentas,
  type ClienteDasFerramentas,
  type ConsultaDoCliente,
  type RespostaDoCliente,
} from './porta-do-supabase.ts'

interface Consulta {
  tabela: string
  colunas?: string
  filtros: [string, string][]
  inserido?: object
}

function clienteEmMemoria(linhas: Record<string, Record<string, unknown>[]>, erro: string | null = null) {
  const consultas: Consulta[] = []

  const cliente: ClienteDasFerramentas = {
    from(tabela) {
      return {
        select(colunas) {
          const consulta: Consulta = { tabela, colunas, filtros: [] }
          consultas.push(consulta)
          const resolver = (): RespostaDoCliente<unknown[]> => {
            if (erro !== null) return { data: null, error: { message: erro } }
            const achadas = (linhas[tabela] ?? []).filter((linha) =>
              consulta.filtros.every(([coluna, valor]) => linha[coluna] === valor),
            )
            return { data: achadas, error: null }
          }
          const encadeada: ConsultaDoCliente<unknown[]> = {
            eq(coluna, valor) {
              consulta.filtros.push([coluna, valor])
              return encadeada
            },
            maybeSingle() {
              const resposta = resolver()
              return Promise.resolve({ data: resposta.data?.[0] ?? null, error: resposta.error })
            },
            then(cumprir, rejeitar) {
              return Promise.resolve(resolver()).then(cumprir, rejeitar)
            },
          }
          return encadeada
        },
        insert(linha) {
          consultas.push({ tabela, filtros: [], inserido: linha })
          return Promise.resolve({ data: null, error: erro === null ? null : { message: erro } })
        },
      }
    },
  }
  return { cliente, consultas }
}

const CONTA_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const CONTA_B = 'bbbbbbbb-0000-4000-8000-000000000002'

const CHAMADA_DE_B = {
  id: 'cccccccc-0000-4000-8000-000000000003',
  account_id: CONTA_B,
  purpose: 'discovery',
  direction: 'outbound',
  lead_id: null,
  provider_conversation_id: 'conv_compartilhada',
}

describe('chamadaDaConversa', () => {
  test('filtra pela conta provada, e a conversa de outra conta volta nula', async () => {
    const { cliente, consultas } = clienteEmMemoria({ calls: [CHAMADA_DE_B] })
    const porta = criarPortaDeFerramentas(cliente)

    expect(await porta.chamadaDaConversa(CONTA_A, 'conv_compartilhada')).toBeNull()
    expect(await porta.chamadaDaConversa(CONTA_B, 'conv_compartilhada')).toMatchObject({ id: CHAMADA_DE_B.id })
    expect(consultas[0]).toEqual({
      tabela: 'calls',
      colunas: 'id, account_id, purpose, direction, lead_id',
      filtros: [
        ['account_id', CONTA_A],
        ['provider_conversation_id', 'conv_compartilhada'],
      ],
    })
  })

  test('erro do banco levanta, e não vira conversa inexistente', async () => {
    const { cliente } = clienteEmMemoria({}, 'conexão recusada')
    await expect(criarPortaDeFerramentas(cliente).chamadaDaConversa(CONTA_A, 'x')).rejects.toThrow('conexão recusada')
  })
})

describe('contasCandidatas', () => {
  test('lê as contas uma vez por janela de cache', async () => {
    let agora = 1_000_000
    const { cliente, consultas } = clienteEmMemoria({ accounts: [{ id: CONTA_A }, { id: CONTA_B }] })
    const porta = criarPortaDeFerramentas(cliente, () => agora)

    expect(await porta.contasCandidatas()).toEqual([CONTA_A, CONTA_B])
    agora += VALIDADE_DAS_CONTAS_MS - 1
    await porta.contasCandidatas()
    expect(consultas).toHaveLength(1)

    agora += 1
    await porta.contasCandidatas()
    expect(consultas).toHaveLength(2)
  })
})

describe('registrarInvocacao', () => {
  test('insere a linha como veio, em call_tool_invocations', async () => {
    const { cliente, consultas } = clienteEmMemoria({})
    const invocacao: InvocacaoParaRegistro = {
      account_id: CONTA_A,
      call_id: CHAMADA_DE_B.id,
      tool: 'tool-availability',
      request: {},
      response: { ok: true },
      latency_ms: 12,
      error: null,
      at: '2026-10-05T13:00:00.000Z',
    }

    await criarPortaDeFerramentas(cliente).registrarInvocacao(invocacao)

    expect(consultas).toEqual([{ tabela: 'call_tool_invocations', filtros: [], inserido: invocacao }])
  })
})
