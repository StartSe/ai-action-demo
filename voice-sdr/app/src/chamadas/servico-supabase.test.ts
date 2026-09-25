// O que só o serviço sobre o Supabase decide, e o dublê de tela não roda: o
// pedido que vai a `corrigir_classificacao`, a tradução do que ele devolve e a
// leitura da ficha com a avaliação, a confiança e o nome de quem corrigiu.

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { criarServicoDeChamadas } from '@/chamadas/servico-supabase'

const CHAMADA = '4f1c2a3b-0000-4000-8000-00000000c001'

interface Chamada {
  tabela: string
  metodos: { nome: string; argumentos: unknown[] }[]
}

type Resposta = { data: unknown; error: unknown }

/** Cliente de `Proxy` que aceita qualquer cadeia e responde pela tabela. */
function clienteGravador(porTabela: Record<string, Resposta>, rpc: Resposta = { data: null, error: null }) {
  const chamadas: Chamada[] = []
  const pedidosDeRpc: { funcao: string; argumentos: unknown }[] = []

  function cadeia(chamada: Chamada): unknown {
    return new Proxy(
      {},
      {
        get(_alvo, nome) {
          if (nome === 'then') {
            const resposta = porTabela[chamada.tabela] ?? { data: [], error: null }
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
    async rpc(funcao: string, argumentos: unknown) {
      pedidosDeRpc.push({ funcao, argumentos })
      return rpc
    },
  }

  return { cliente: cliente as unknown as SupabaseClient, chamadas, pedidosDeRpc }
}

describe('corrigirClassificacao', () => {
  it('manda a classificação, o id e o motivo ao RPC, com os nomes dele', async () => {
    const { cliente, pedidosDeRpc } = clienteGravador({}, { data: 'corrigida', error: null })
    const resultado = await criarServicoDeChamadas(cliente).corrigirClassificacao({
      chamadaId: CHAMADA,
      classificacao: { stage_key: 'won' },
      motivo: 'Fechou na ligação.',
    })
    expect(resultado).toEqual({ ok: true })
    expect(pedidosDeRpc).toEqual([
      {
        funcao: 'corrigir_classificacao',
        argumentos: {
          p_call_id: CHAMADA,
          p_classificacao: { stage_key: 'won' },
          p_motivo: 'Fechou na ligação.',
        },
      },
    ])
  })

  it.each([
    ['chamada_inexistente', 'nao-encontrada'],
    ['chamada_de_outra_conta', 'nao-encontrada'],
    ['sem_permissao', 'sem-permissao'],
    ['classificacao_invalida', 'classificacao-invalida'],
    ['resposta_nova', 'falha-de-comunicacao'],
  ])('%s vira %s', async (codigo, motivo) => {
    const { cliente } = clienteGravador({}, { data: codigo, error: null })
    const resultado = await criarServicoDeChamadas(cliente).corrigirClassificacao({
      chamadaId: CHAMADA,
      classificacao: {},
      motivo: 'x',
    })
    expect(resultado).toEqual({ ok: false, motivo })
  })

  it('42501 do PostgREST é sem permissão; outro erro é falha de comunicação', async () => {
    for (const [erro, motivo] of [
      [{ code: '42501', message: 'permission denied' }, 'sem-permissao'],
      [{ code: '08006', message: 'x' }, 'falha-de-comunicacao'],
    ] as const) {
      const { cliente } = clienteGravador({}, { data: null, error: erro })
      expect(
        await criarServicoDeChamadas(cliente).corrigirClassificacao({
          chamadaId: CHAMADA,
          classificacao: {},
          motivo: 'x',
        }),
      ).toEqual({ ok: false, motivo })
    }
  })
})

describe('carregarFicha: a parte da F4', () => {
  const linha = {
    id: CHAMADA,
    account_id: 'c-1',
    purpose: 'discovery',
    direction: 'outbound',
    status: 'ended',
    started_at: '2026-09-22T16:59:50.000Z',
    classification: { stage_key: 'won' },
    classification_source: 'human',
    classification_confidence: null,
    classification_corrected_by: 'u-9',
    classification_corrected_at: '2026-09-22T17:12:00.000Z',
    evaluation: {
      criterios: { nada_fora_da_base: { aprovado: true, justificativa: 'ok' } },
      itens: [
        { criterio: 'aviso_gravacao', aprovado: true, evidencia: 'é gravada' },
        { criterio: 'nada_fora_da_base', aprovado: 'talvez', evidencia: '' },
        { aprovado: true },
      ],
    },
    evaluation_score: 7.5,
  }

  it('lê itens, critérios, etapas e o nome de quem corrigiu, na conta da chamada', async () => {
    const { cliente, chamadas } = clienteGravador({
      calls: { data: linha, error: null },
      pipeline_stages: { data: [{ key: 'won', label: 'Ganho', position: 4 }], error: null },
      evaluation_criteria: { data: [{ key: 'aviso_gravacao', label: 'Avisou', position: 0 }], error: null },
      profiles: { data: { display_name: 'Ana Lima' }, error: null },
    })

    const carga = await criarServicoDeChamadas(cliente).carregarFicha(CHAMADA)
    if (!carga.ok) throw new Error('a ficha deveria carregar')

    expect(carga.ficha).toMatchObject({
      origemDaClassificacao: 'human',
      confiancaDaClassificacao: null,
      corrigidaPor: 'Ana Lima',
      corrigidaEm: '2026-09-22T17:12:00.000Z',
      notaDaAvaliacao: 7.5,
      itensDaAvaliacao: [
        { criterio: 'aviso_gravacao', aprovado: true, evidencia: 'é gravada' },
        { criterio: 'nada_fora_da_base', aprovado: null, evidencia: null },
      ],
      criteriosDaConta: [{ chave: 'aviso_gravacao', rotulo: 'Avisou' }],
      etapas: [{ chave: 'won', rotulo: 'Ganho' }],
    })

    const daConta = (tabela: string) => chamadas.find((chamada) => chamada.tabela === tabela)
    expect(daConta('pipeline_stages')?.metodos).toContainEqual({ nome: 'eq', argumentos: ['account_id', 'c-1'] })
    expect(daConta('pipeline_stages')?.metodos).toContainEqual({
      nome: 'eq',
      argumentos: ['pipelines.is_default', true],
    })
    expect(daConta('evaluation_criteria')?.metodos).toContainEqual({ nome: 'eq', argumentos: ['account_id', 'c-1'] })
    expect(daConta('profiles')?.metodos).toContainEqual({ nome: 'eq', argumentos: ['id', 'u-9'] })
  })

  it('sem correção, o perfil não é lido', async () => {
    const { cliente, chamadas } = clienteGravador({
      calls: {
        data: { ...linha, classification_source: 'backfill', classification_confidence: '0.72', classification_corrected_by: null },
        error: null,
      },
    })
    const carga = await criarServicoDeChamadas(cliente).carregarFicha(CHAMADA)
    if (!carga.ok) throw new Error('a ficha deveria carregar')
    expect(carga.ficha.confiancaDaClassificacao).toBe(0.72)
    expect(carga.ficha.corrigidaPor).toBeNull()
    expect(chamadas.map((chamada) => chamada.tabela)).not.toContain('profiles')
  })

  it('falha ao ler as etapas é falha da ficha, e não correção sem opção', async () => {
    const { cliente } = clienteGravador({
      calls: { data: linha, error: null },
      pipeline_stages: { data: null, error: { code: '08006', message: 'x' } },
    })
    expect(await criarServicoDeChamadas(cliente).carregarFicha(CHAMADA)).toEqual({
      ok: false,
      motivo: 'falha-de-comunicacao',
    })
  })
})

describe('estimarCusto (D-14)', () => {
  function comSessao(rpc: Resposta) {
    const gravador = clienteGravador(
      { account_members: { data: { account_id: 'conta-1' }, error: null } },
      rpc,
    )
    Object.assign(gravador.cliente, {
      auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
    })
    return gravador
  }

  it('pede estimativa_de_custo da conta de quem está na sessão e lê a resposta', async () => {
    const { cliente, pedidosDeRpc } = comSessao({
      data: {
        ligacoes_medidas: 2,
        duracao_media_seg: 90,
        por_ligacao: [{ moeda: 'BRL', centavos: 30 }],
        por_minuto: [{ moeda: 'BRL', centavos: 20 }],
      },
      error: null,
    })
    expect(await criarServicoDeChamadas(cliente).estimarCusto()).toEqual({
      ok: true,
      estimativa: {
        ligacoesMedidas: 2,
        duracaoMediaSeg: 90,
        porLigacao: [{ moeda: 'BRL', centavos: 30 }],
        porMinuto: [{ moeda: 'BRL', centavos: 20 }],
      },
    })
    expect(pedidosDeRpc).toEqual([
      { funcao: 'estimativa_de_custo', argumentos: { p_account_id: 'conta-1' } },
    ])
  })

  it('42501 é sem permissão', async () => {
    const { cliente } = comSessao({ data: null, error: { code: '42501', message: 'sem_permissao' } })
    expect(await criarServicoDeChamadas(cliente).estimarCusto()).toEqual({
      ok: false,
      motivo: 'sem-permissao',
    })
  })
})
