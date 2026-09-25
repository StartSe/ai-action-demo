// O que só o serviço do Supabase decide sobre a mudança de etapa (US-145): a
// chamada a `mover_lead_de_etapa` com a chave e o ator `user`, e a leitura da
// resposta. O dublê de tela não roda este arquivo, e por isso a prova é aqui,
// com um cliente que só conhece `auth.getUser` e `rpc`.

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { criarServicoDeLeads } from '@/leads/servico-supabase'

interface Chamada {
  nome: string
  argumentos: unknown
}

function clienteDoRpc(resposta: { data: unknown; error: unknown }, usuarioId: string | null = 'u-1') {
  const chamadas: Chamada[] = []
  const cliente = {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: usuarioId ? { id: usuarioId } : null } }),
    },
    rpc: (nome: string, argumentos: unknown) => {
      chamadas.push({ nome, argumentos })
      return Promise.resolve(resposta)
    },
  }
  return { chamadas, servico: criarServicoDeLeads(cliente as unknown as SupabaseClient) }
}

describe('moverDeEtapa sobre o Supabase', () => {
  it('chama mover_lead_de_etapa com a chave da etapa e o ator user', async () => {
    const { chamadas, servico } = clienteDoRpc({
      data: [{ resultado: 'movido', stage_id: 's-3' }],
      error: null,
    })

    expect(await servico.moverDeEtapa('lead-1', 'qualified')).toEqual({
      ok: true,
      resultado: 'movido',
    })
    expect(chamadas).toEqual([
      {
        nome: 'mover_lead_de_etapa',
        argumentos: {
          p_lead_id: 'lead-1',
          p_stage_key: 'qualified',
          p_actor: 'user',
          p_actor_id: 'u-1',
        },
      },
    ])
  })

  it('mesma_etapa é resultado, não erro', async () => {
    const { servico } = clienteDoRpc({ data: [{ resultado: 'mesma_etapa' }], error: null })
    expect(await servico.moverDeEtapa('lead-1', 'new')).toEqual({
      ok: true,
      resultado: 'mesma_etapa',
    })
  })

  it('resposta sem linha é a recusa silenciosa, e vira sem-permissao', async () => {
    const { servico } = clienteDoRpc({ data: [], error: null })
    expect(await servico.moverDeEtapa('lead-1', 'won')).toEqual({
      ok: false,
      motivo: 'sem-permissao',
    })
  })

  it('traduz os códigos do RPC, e lead de outra conta é lead que não existe aqui', async () => {
    const casos = [
      ['sem_permissao', 'sem-permissao'],
      ['lead_inexistente', 'lead-inexistente'],
      ['lead_de_outra_conta', 'lead-inexistente'],
      ['etapa_inexistente', 'etapa-inexistente'],
      ['codigo_novo', 'falha-de-comunicacao'],
    ] as const

    for (const [codigo, motivo] of casos) {
      const { servico } = clienteDoRpc({ data: [{ resultado: codigo }], error: null })
      expect(await servico.moverDeEtapa('lead-1', 'won')).toEqual({ ok: false, motivo })
    }
  })

  it('sem sessão não chama o RPC', async () => {
    const { chamadas, servico } = clienteDoRpc({ data: [], error: null }, null)
    expect(await servico.moverDeEtapa('lead-1', 'won')).toEqual({
      ok: false,
      motivo: 'sem-permissao',
    })
    expect(chamadas).toEqual([])
  })
})

// A configuração das etapas (US-146): a lista inteira numa chamada, a chave só
// para etapa nova, e os códigos do RPC e do gatilho da exclusão traduzidos.

describe('configurarEtapas sobre o Supabase', () => {
  it('manda a lista inteira numa chamada, e a chave só viaja para etapa nova', async () => {
    const { chamadas, servico } = clienteDoRpc({ data: 'posicao_duplicada', error: null })

    await servico.configurarEtapas('f-1', [
      { id: 'e-qualified', chave: 'qualified', rotulo: 'Tem fit', posicao: 0, cor: 'menta-2' },
      { id: 'e-new', rotulo: 'Novo', posicao: 1, cor: null },
      { chave: 'proposta', rotulo: 'Proposta', posicao: 6, cor: 'carmim' },
    ])

    expect(chamadas).toEqual([
      {
        nome: 'configurar_etapas',
        argumentos: {
          p_pipeline_id: 'f-1',
          p_etapas: [
            { id: 'e-qualified', label: 'Tem fit', position: 0, color: 'menta-2' },
            { id: 'e-new', label: 'Novo', position: 1, color: null },
            { key: 'proposta', label: 'Proposta', position: 6, color: 'carmim' },
          ],
        },
      },
    ])
  })

  it('traduz os códigos do RPC, e recusa não relê nada', async () => {
    const casos = [
      ['sem_permissao', 'sem-permissao'],
      ['etapa_de_outra_conta', 'etapa-de-outra-conta'],
      ['chave_invalida', 'chave-invalida'],
      ['posicao_duplicada', 'posicao-duplicada'],
      ['etapa_canonica', 'etapa-canonica'],
      ['codigo_novo', 'falha-de-comunicacao'],
    ] as const

    for (const [codigo, motivo] of casos) {
      // O cliente não tem `from`: uma releitura depois da recusa quebraria aqui.
      const { servico } = clienteDoRpc({ data: codigo, error: null })
      expect(await servico.configurarEtapas('f-1', [])).toEqual({ ok: false, motivo })
    }
  })
})

/** Um cliente que só sabe `from(...).delete().eq(...).select(...)`. */
function clienteDaExclusao(resposta: { data: unknown; error: unknown }) {
  const pedidos: { tabela: string; id: unknown }[] = []
  const cliente = {
    from: (tabela: string) => ({
      delete: () => ({
        eq: (_coluna: string, id: unknown) => {
          pedidos.push({ tabela, id })
          return { select: () => Promise.resolve(resposta) }
        },
      }),
    }),
  }
  return { pedidos, servico: criarServicoDeLeads(cliente as unknown as SupabaseClient) }
}

describe('apagarEtapa sobre o Supabase', () => {
  it('apaga a linha de pipeline_stages pelo id', async () => {
    const { pedidos, servico } = clienteDaExclusao({ data: [{ id: 'e-proposta' }], error: null })
    expect(await servico.apagarEtapa('e-proposta')).toEqual({ ok: true })
    expect(pedidos).toEqual([{ tabela: 'pipeline_stages', id: 'e-proposta' }])
  })

  it('nenhuma linha de volta é a recusa silenciosa da política', async () => {
    const { servico } = clienteDaExclusao({ data: [], error: null })
    expect(await servico.apagarEtapa('e-proposta')).toEqual({ ok: false, motivo: 'sem-permissao' })
  })

  it('lê a mensagem do gatilho antes do código: etapa canônica também sai com 42501', async () => {
    const casos = [
      [{ code: '42501', message: 'etapa_canonica' }, 'etapa-canonica'],
      [{ code: '23503', message: 'etapa_com_leads' }, 'etapa-com-leads'],
      [{ code: '42501', message: 'permission denied for table pipeline_stages' }, 'sem-permissao'],
      [{ code: '08006', message: 'connection failure' }, 'falha-de-comunicacao'],
    ] as const

    for (const [erro, motivo] of casos) {
      const { servico } = clienteDaExclusao({ data: null, error: erro })
      expect(await servico.apagarEtapa('e-x')).toEqual({ ok: false, motivo })
    }
  })
})

// A ficha do lead (US-147) -------------------------------------------------------

interface Cadeia {
  tabela: string
  metodos: [string, unknown[]][]
}

/**
 * Um cliente que aceita qualquer cadeia de `from(...)`, registra cada método
 * com os argumentos e responde pela tabela que abriu a cadeia.
 */
function clienteDaFicha(respostas: Record<string, { data: unknown; error: unknown }>) {
  const cadeias: Cadeia[] = []
  const rpcs: Chamada[] = []
  function abrir(tabela: string) {
    const registro: Cadeia = { tabela, metodos: [] }
    cadeias.push(registro)
    const cadeia: unknown = new Proxy(
      {},
      {
        get(_alvo, propriedade) {
          if (propriedade === 'then') {
            const resposta = respostas[tabela] ?? { data: [], error: null }
            return (aceitar: (valor: unknown) => unknown) => Promise.resolve(resposta).then(aceitar)
          }
          return (...argumentos: unknown[]) => {
            registro.metodos.push([String(propriedade), argumentos])
            return cadeia
          }
        },
      },
    )
    return cadeia
  }
  const cliente = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } } }) },
    from: abrir,
    rpc: (nome: string, argumentos: unknown) => {
      rpcs.push({ nome, argumentos })
      return Promise.resolve(respostas[`rpc:${nome}`] ?? { data: 'ev-1', error: null })
    },
  }
  return { cadeias, rpcs, servico: criarServicoDeLeads(cliente as unknown as SupabaseClient) }
}

const LINHA_DO_LEAD = {
  id: 'l-1',
  account_id: 'c-1',
  name: 'Marina',
  phone_e164: '+5548999998888',
  company: 'Aurora',
  city: 'Florianópolis',
  state: 'SC',
  timezone: 'America/Sao_Paulo',
  temperature: 'quente',
  score: 78,
  blocked_at: null,
  blocked_reason: null,
  briefing: { pain: 'Rotas à mão', fit: '  ', objections: 'Preço', next_action: 'Reunião' },
  pipeline_stages: { key: 'qualified', label: 'Qualificado' },
}

describe('carregarFichaDoLead sobre o Supabase', () => {
  it('lê o lead, os eventos da conta dele e só as chamadas que os eventos call apontam', async () => {
    const { cadeias, servico } = clienteDaFicha({
      leads: { data: LINHA_DO_LEAD, error: null },
      lead_events: {
        data: [
          { id: 'e-1', kind: 'note', actor: 'user', actor_id: 'u-1', call_id: null, payload: { texto: 'Oi' }, occurred_at: '2026-09-12T09:00:00Z' },
          { id: 'e-2', kind: 'call', actor: 'agent', actor_id: null, call_id: 'c-9', payload: {}, occurred_at: '2026-09-10T14:00:00Z' },
          // Evento de etapa com call_id não é a ligação: a chamada entra pelo evento call.
          { id: 'e-3', kind: 'stage_change', actor: 'agent', actor_id: null, call_id: 'c-7', payload: {}, occurred_at: '2026-09-10T14:05:00Z' },
        ],
        error: null,
      },
      account_members: {
        data: [{ user_id: 'u-1', profiles: { display_name: ' Renata ', email: 'r@a.com' } }],
        error: null,
      },
      calls: {
        data: [
          {
            id: 'c-9',
            direction: 'outbound',
            purpose: 'discovery',
            started_at: '2026-09-10T14:00:00Z',
            duration_sec: 90,
            end_reason: 'completed',
            recording_path: null,
            recording_expires_at: '2026-09-01T00:00:00Z',
          },
        ],
        error: null,
      },
    })

    const carga = await servico.carregarFichaDoLead('l-1')
    if (!carga.ok) throw new Error(carga.motivo)
    const { ficha } = carga
    expect(ficha.briefing).toEqual({ dor: 'Rotas à mão', fit: null, objecoes: 'Preço', proximaAcao: 'Reunião' })
    expect(ficha.fuso).toBe('America/Sao_Paulo')
    expect(ficha.etapa).toEqual({ chave: 'qualified', rotulo: 'Qualificado' })
    expect(ficha.nomes.get('u-1')).toBe('Renata')
    expect(ficha.eventos.map((evento) => evento.id)).toEqual(['e-1', 'e-2', 'e-3'])
    expect(ficha.ligacoes).toEqual([
      {
        id: 'c-9',
        direcao: 'outbound',
        proposito: 'discovery',
        iniciadaEm: '2026-09-10T14:00:00Z',
        duracaoSeg: 90,
        motivoDoFim: 'completed',
        caminhoDaGravacao: null,
        gravacaoExpiraEm: '2026-09-01T00:00:00Z',
      },
    ])
    expect(ficha.truncada).toBe(false)

    const eventos = cadeias.find((cadeia) => cadeia.tabela === 'lead_events')!
    expect(eventos.metodos).toContainEqual(['eq', ['account_id', 'c-1']])
    expect(eventos.metodos).toContainEqual(['eq', ['lead_id', 'l-1']])
    expect(eventos.metodos).toContainEqual(['order', ['occurred_at', { ascending: false }]])
    const chamadas = cadeias.find((cadeia) => cadeia.tabela === 'calls')!
    expect(chamadas.metodos).toContainEqual(['in', ['id', ['c-9']]])
  })

  it('lead que a RLS não devolve é nao-encontrado, e sem evento call não consulta calls', async () => {
    const semLead = clienteDaFicha({ leads: { data: null, error: null } })
    expect(await semLead.servico.carregarFichaDoLead('l-x')).toEqual({ ok: false, motivo: 'nao-encontrado' })

    const semLigacao = clienteDaFicha({ leads: { data: LINHA_DO_LEAD, error: null } })
    const carga = await semLigacao.servico.carregarFichaDoLead('l-1')
    expect(carga.ok).toBe(true)
    expect(semLigacao.cadeias.some((cadeia) => cadeia.tabela === 'calls')).toBe(false)
  })

  it('passa do teto e diz que truncou', async () => {
    const muitos = Array.from({ length: 201 }, (_, indice) => ({
      id: `e-${String(indice)}`,
      kind: 'note',
      actor: 'user',
      actor_id: 'u-1',
      call_id: null,
      payload: { texto: 'x' },
      occurred_at: '2026-09-12T09:00:00Z',
    }))
    const { servico } = clienteDaFicha({
      leads: { data: LINHA_DO_LEAD, error: null },
      lead_events: { data: muitos, error: null },
    })
    const carga = await servico.carregarFichaDoLead('l-1')
    if (!carga.ok) throw new Error(carga.motivo)
    expect(carga.ficha.eventos).toHaveLength(200)
    expect(carga.ficha.truncada).toBe(true)
  })
})

describe('registrarNota sobre o Supabase', () => {
  it('chama registrar_evento_de_lead com kind note e o texto no payload', async () => {
    const { rpcs, servico } = clienteDaFicha({})
    expect(await servico.registrarNota('l-1', '  Ligar na segunda.  ')).toEqual({ ok: true })
    expect(rpcs).toEqual([
      {
        nome: 'registrar_evento_de_lead',
        argumentos: { p_lead_id: 'l-1', p_kind: 'note', p_payload: { texto: 'Ligar na segunda.' } },
      },
    ])
  })

  it('traduz as recusas do RPC', async () => {
    const casos = [
      [{ code: '23503', message: 'lead_inexistente' }, 'lead-inexistente'],
      [{ code: '42501', message: 'sem_permissao' }, 'sem-permissao'],
      [{ code: '42501', message: 'permission denied for function' }, 'sem-permissao'],
      [{ code: '08006', message: 'connection failure' }, 'falha-de-comunicacao'],
    ] as const
    for (const [erro, motivo] of casos) {
      const { servico } = clienteDaFicha({ 'rpc:registrar_evento_de_lead': { data: null, error: erro } })
      expect(await servico.registrarNota('l-1', 'x')).toEqual({ ok: false, motivo })
    }
  })
})
