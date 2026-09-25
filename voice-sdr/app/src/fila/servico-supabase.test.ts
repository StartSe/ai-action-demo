// O que o serviço da fila manda ao Supabase, lido por um cliente que só grava a
// cadeia de chamadas. Três asserções justificam o arquivo: resolver vai pelo
// RPC `resolver_item_de_fila` (autor e auditoria são do banco), a inclusão do
// bloqueio que a RLS recusa em silêncio vira `sem_permissao` e não resolve o
// item, e a carga separa a fila nunca preenchida do recorte vazio.

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { criarServicoDaFila } from '@/fila/servico-supabase'

interface Chamada {
  tabela: string
  metodos: { nome: string; argumentos: unknown[] }[]
}

type Resposta = { data: unknown; error: unknown }

function clienteGravador(
  respostas: (chamada: Chamada) => Resposta,
  rpc: (nome: string, argumentos: unknown) => Resposta = () => ({ data: 'resolvido', error: null }),
) {
  const chamadas: Chamada[] = []
  const rpcs: { nome: string; argumentos: unknown }[] = []

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
    rpc(nome: string, argumentos: unknown) {
      rpcs.push({ nome, argumentos })
      return Promise.resolve(rpc(nome, argumentos))
    },
  }

  return { cliente: cliente as unknown as SupabaseClient, chamadas, rpcs }
}

function conta(chamada: Chamada): Resposta | null {
  return chamada.tabela === 'account_members' ? { data: { account_id: 'a-1' }, error: null } : null
}

describe('criarServicoDaFila', () => {
  it('resolver vai pelo RPC resolver_item_de_fila, com o id e o texto', async () => {
    const { cliente, rpcs } = clienteGravador(() => ({ data: null, error: null }))

    expect(await criarServicoDaFila(cliente).resolver('e-1', 'Liguei de volta.')).toEqual({
      codigo: 'resolvido',
    })
    expect(rpcs).toEqual([
      { nome: 'resolver_item_de_fila', argumentos: { p_item_id: 'e-1', p_resolucao: 'Liguei de volta.' } },
    ])
  })

  it.each([
    ['sem_permissao', 'sem_permissao'],
    ['item_de_outra_conta', 'inexistente'],
    ['resolucao_vazia', 'resolucao_vazia'],
    ['outra_coisa', 'falha-de-comunicacao'],
  ])('o código %s do RPC vira %s', async (doBanco, esperado) => {
    const { cliente } = clienteGravador(
      () => ({ data: null, error: null }),
      () => ({ data: doBanco, error: null }),
    )
    expect(await criarServicoDaFila(cliente).resolver('e-1', 'x')).toEqual({ codigo: esperado })
  })

  it('confirmar o bloqueio inclui o número com .select() e então resolve', async () => {
    const { cliente, chamadas, rpcs } = clienteGravador(
      (chamada) => conta(chamada) ?? { data: [{ id: 'b-1' }], error: null },
    )

    const resultado = await criarServicoDaFila(cliente).confirmarBloqueio(
      'e-1',
      '+5511988887777',
      'Bloqueio confirmado na fila.',
    )

    expect(resultado).toEqual({ codigo: 'resolvido' })
    const inclusao = chamadas.find((chamada) => chamada.tabela === 'dnc_entries')!
    expect(inclusao.metodos.map((metodo) => metodo.nome)).toEqual(['insert', 'select'])
    expect(inclusao.metodos[0]!.argumentos[0]).toEqual({
      account_id: 'a-1',
      phone_e164: '+5511988887777',
      reason: 'Bloqueio confirmado na fila.',
      source: 'manual',
    })
    expect(rpcs.map((chamada) => chamada.nome)).toEqual(['resolver_item_de_fila'])
  })

  it('o bloqueio ativo que já existe conta como feito', async () => {
    const { cliente, rpcs } = clienteGravador(
      (chamada) => conta(chamada) ?? { data: null, error: { code: '23505', message: 'único' } },
    )

    expect(
      await criarServicoDaFila(cliente).confirmarBloqueio('e-1', '+5511988887777', 'x'),
    ).toEqual({ codigo: 'resolvido' })
    expect(rpcs).toHaveLength(1)
  })

  it('inclusão que a RLS recusa em silêncio vira sem_permissao, e o item não é resolvido', async () => {
    const { cliente, rpcs } = clienteGravador(
      (chamada) => conta(chamada) ?? { data: [], error: null },
    )

    expect(
      await criarServicoDaFila(cliente).confirmarBloqueio('e-1', '+5511988887777', 'x'),
    ).toEqual({ codigo: 'sem_permissao' })
    expect(rpcs).toEqual([])
  })

  it('a carga separa a fila nunca preenchida do recorte vazio', async () => {
    let existe = false
    const { cliente } = clienteGravador((chamada) => {
      const daConta = conta(chamada)
      if (daConta) return daConta
      const soOId = chamada.metodos[0]?.argumentos[0] === 'id'
      return { data: soOId && existe ? [{ id: 'e-9' }] : [], error: null }
    })
    const servico = criarServicoDaFila(cliente)

    expect(await servico.carregar('aberto')).toEqual({ ok: true, itens: [], haItens: false })
    existe = true
    expect(await servico.carregar('aberto')).toEqual({ ok: true, itens: [], haItens: true })
  })

  it('a carga pede o limiar e o lead do item', async () => {
    const { cliente, chamadas } = clienteGravador(
      (chamada) => conta(chamada) ?? { data: [], error: null },
    )
    await criarServicoDaFila(cliente).carregar('aberto')

    const colunas = String(
      chamadas.find((chamada) => chamada.tabela === 'exception_items')!.metodos[0]!.argumentos[0],
    )
    expect(colunas).toContain('threshold_snapshot')
    expect(colunas).toContain('lead_id')
  })
})
