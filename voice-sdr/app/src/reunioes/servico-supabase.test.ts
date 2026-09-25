// O serviço de reuniões sobre o Supabase (US-179). O que o dublê de tela não
// alcança: a consulta lê da visão que tira o ensaio, e não de `meetings`; o
// teto se mede pedindo uma linha a mais; e "a conta tem reunião?" só se
// pergunta quando o recorte volta vazio.

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { ORIGENS_DA_LISTA, TETO_DA_LISTA } from '@/reunioes/consulta'
import { COLUNAS_DA_FICHA, COLUNAS_DA_LISTA, criarServicoDeReunioes } from '@/reunioes/servico-supabase'
import type { RecorteDeReunioes } from '@/reunioes/tipos'

interface Pedido {
  tabela: string
  metodos: { nome: string; argumentos: unknown[] }[]
}

/** Cadeia que aceita qualquer método, anota e resolve com `resposta` quando aguardada. */
function cadeia(resposta: unknown, pedido: Pedido): unknown {
  return new Proxy(
    {},
    {
      get(_alvo, nome) {
        if (nome === 'then') {
          return (resolver: (valor: unknown) => void) => resolver(resposta)
        }
        return (...argumentos: unknown[]) => {
          pedido.metodos.push({ nome: String(nome), argumentos })
          return cadeia(resposta, pedido)
        }
      },
    },
  )
}

/** `account_members` responde a conta; as demais tabelas, a fila de respostas; `rpc`, a resposta dele. */
function cliente(respostas: unknown[], respostaDoRpc: unknown = { data: 'marcada', error: null }) {
  const pedidos: Pedido[] = []
  const rpcs: { nome: string; argumentos: unknown }[] = []
  const falso = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } } }) },
    rpc(nome: string, argumentos: unknown) {
      rpcs.push({ nome, argumentos })
      return Promise.resolve(respostaDoRpc)
    },
    from(tabela: string) {
      const pedido: Pedido = { tabela, metodos: [] }
      if (tabela === 'account_members') {
        return cadeia(
          { data: { account_id: 'c-1', accounts: { timezone: 'America/Manaus' } }, error: null },
          pedido,
        )
      }
      pedidos.push(pedido)
      return cadeia(respostas.shift() ?? { data: [], error: null }, pedido)
    },
  }
  return { cliente: falso as unknown as SupabaseClient, pedidos, rpcs }
}

const RECORTE: RecorteDeReunioes = {
  desde: '2026-09-28T03:00:00.000Z',
  ate: '2026-10-05T03:00:00.000Z',
  especialistaId: 'e-1',
  estado: 'scheduled',
  modalidade: 'video',
  crescente: true,
  origens: ORIGENS_DA_LISTA,
}

function linha(id: string, extras: Record<string, unknown> = {}) {
  return {
    id,
    starts_at: '2026-10-01T17:00:00Z',
    ends_at: '2026-10-01T17:30:00Z',
    modality: 'video',
    status: 'scheduled',
    booked_call_id: null,
    external_event_id: null,
    event_attempts: 2,
    lead_invite_sent_at: null,
    lead_invite_attempts: 0,
    lead_invite_error: null,
    lead_invite_retry_at: null,
    specialist_invite_sent_at: '2026-09-28T12:00:00Z',
    specialist_invite_attempts: 1,
    specialist_invite_error: null,
    specialist_invite_retry_at: null,
    lead: { id: 'l-1', name: 'Carla Menezes', email: null },
    especialista: { id: 'e-1', name: 'Ana Ribeiro', timezone: 'America/Sao_Paulo' },
    ...extras,
  }
}

describe('listarReunioes', () => {
  it('lê da visão sem o ensaio, com cada filtro do recorte e o teto mais um', async () => {
    const { cliente: falso, pedidos } = cliente([{ data: [linha('r-1')], error: null }])
    await criarServicoDeReunioes(falso).listarReunioes(RECORTE)

    expect(pedidos.map((pedido) => pedido.tabela)).toEqual(['reunioes_reais'])
    const metodos = pedidos[0]!.metodos
    expect(metodos).toEqual(
      expect.arrayContaining([
        { nome: 'select', argumentos: [COLUNAS_DA_LISTA] },
        { nome: 'eq', argumentos: ['account_id', 'c-1'] },
        { nome: 'gte', argumentos: ['starts_at', RECORTE.desde] },
        { nome: 'lt', argumentos: ['starts_at', RECORTE.ate] },
        { nome: 'eq', argumentos: ['specialist_id', 'e-1'] },
        { nome: 'eq', argumentos: ['status', 'scheduled'] },
        { nome: 'eq', argumentos: ['modality', 'video'] },
        { nome: 'order', argumentos: ['starts_at', { ascending: true }] },
        { nome: 'limit', argumentos: [TETO_DA_LISTA + 1] },
      ]),
    )
  })

  it('lê a linha: origem pela ligação, e-mail do lead e as duas entregas', async () => {
    const { cliente: falso } = cliente([
      { data: [linha('r-1'), linha('r-2', { booked_call_id: 'c-9' })], error: null },
    ])
    const carga = await criarServicoDeReunioes(falso).listarReunioes(RECORTE)
    if (!carga.ok) throw new Error('falhou')

    const [manual, daLigacao] = carga.pagina.reunioes
    expect(manual).toMatchObject({
      origem: 'manual',
      chamadaDaMarcacao: null,
      lead: { nome: 'Carla Menezes', temEmail: false },
      evento: { externoId: null, tentativas: 2 },
      conviteDoEspecialista: { enviadoEm: '2026-09-28T12:00:00Z', tentativas: 1 },
    })
    expect(daLigacao).toMatchObject({ origem: 'ligacao', chamadaDaMarcacao: 'c-9' })
    expect(carga.pagina).toMatchObject({ truncada: false, contaTemReuniao: true })
  })

  it('a linha a mais do teto não aparece, e vira o aviso', async () => {
    const linhas = Array.from({ length: TETO_DA_LISTA + 1 }, (_, n) => linha(`r-${n}`))
    const { cliente: falso } = cliente([{ data: linhas, error: null }])
    const carga = await criarServicoDeReunioes(falso).listarReunioes(RECORTE)
    if (!carga.ok) throw new Error('falhou')
    expect(carga.pagina.reunioes).toHaveLength(TETO_DA_LISTA)
    expect(carga.pagina.truncada).toBe(true)
  })

  it.each([
    [[{ id: 'r-fora' }], true],
    [[], false],
  ])('recorte vazio pergunta à visão se a conta tem reunião', async (alguma, esperado) => {
    const { cliente: falso, pedidos } = cliente([
      { data: [], error: null },
      { data: alguma, error: null },
    ])
    const carga = await criarServicoDeReunioes(falso).listarReunioes(RECORTE)
    expect(carga).toEqual({
      ok: true,
      pagina: { reunioes: [], truncada: false, contaTemReuniao: esperado },
    })
    expect(pedidos.map((pedido) => pedido.tabela)).toEqual(['reunioes_reais', 'reunioes_reais'])
    // A segunda pergunta não leva filtro nenhum além da conta.
    expect(pedidos[1]!.metodos.filter((m) => m.nome === 'eq')).toEqual([
      { nome: 'eq', argumentos: ['account_id', 'c-1'] },
    ])
  })

  it('recusa da RLS vira sem-permissao, o resto é falha de comunicação', async () => {
    const recusa = cliente([{ data: null, error: { code: '42501', message: 'x' } }])
    expect(await criarServicoDeReunioes(recusa.cliente).listarReunioes(RECORTE)).toEqual({
      ok: false,
      motivo: 'sem-permissao',
    })
    const queda = cliente([{ data: null, error: { code: '08006', message: 'x' } }])
    expect(await criarServicoDeReunioes(queda.cliente).listarReunioes(RECORTE)).toEqual({
      ok: false,
      motivo: 'falha-de-comunicacao',
    })
  })
})

describe('carregarContexto', () => {
  it('traz o fuso da conta e os especialistas, ativos e desligados', async () => {
    const { cliente: falso } = cliente([
      {
        data: [
          { id: 'e-1', name: 'Ana', timezone: 'America/Sao_Paulo', active: true },
          { id: 'e-2', name: 'Clara', timezone: 'America/Manaus', active: false },
        ],
        error: null,
      },
    ])
    expect(await criarServicoDeReunioes(falso).carregarContexto()).toEqual({
      ok: true,
      fusoDaConta: 'America/Manaus',
      especialistas: [
        { id: 'e-1', nome: 'Ana', fuso: 'America/Sao_Paulo', ativo: true },
        { id: 'e-2', nome: 'Clara', fuso: 'America/Manaus', ativo: false },
      ],
    })
  })
})

describe('carregarFicha', () => {
  function linhaDaFicha(extras: Record<string, unknown> = {}) {
    return linha('r-1', {
      booked_call_id: 'ch-1',
      confirmed_call_id: 'ch-2',
      created_at: '2026-09-28T14:05:00Z',
      confirmed_at: '2026-09-30T13:02:00Z',
      cancel_reason: null,
      notes: 'Prefere de manhã.',
      handoff_summary: { dor: 'Fila de dois dias' },
      event_error: 'O Google recusou o evento.',
      event_retry_at: '2026-09-28T14:10:00Z',
      lead: { id: 'l-1', name: 'Carla', email: 'c@a.com', phone_e164: '+5581999990000', company: 'Aurora', timezone: null },
      especialista: { id: 'e-1', name: 'Ana', timezone: 'America/Sao_Paulo', room_url: 'https://sala' },
      ...extras,
    })
  }

  it('lê da visão sem o ensaio, pela conta e pelo id, e as duas ligações numa consulta só', async () => {
    const { cliente: falso, pedidos } = cliente([
      { data: linhaDaFicha(), error: null },
      { data: [{ id: 'ch-1', started_at: '2026-09-28T14:00:00Z' }], error: null },
    ])
    const carga = await criarServicoDeReunioes(falso).carregarFicha('r-1')

    expect(pedidos.map((pedido) => pedido.tabela)).toEqual(['reunioes_reais', 'calls', 'audit_log'])
    expect(pedidos[0]!.metodos).toEqual(
      expect.arrayContaining([
        { nome: 'select', argumentos: [COLUNAS_DA_FICHA] },
        { nome: 'eq', argumentos: ['account_id', 'c-1'] },
        { nome: 'eq', argumentos: ['id', 'r-1'] },
      ]),
    )
    expect(pedidos[1]!.metodos).toContainEqual({ nome: 'in', argumentos: ['id', ['ch-1', 'ch-2']] })

    if (!carga.ok) throw new Error('falhou')
    expect(carga.ficha).toMatchObject({
      fusoDaConta: 'America/Manaus',
      // Lead sem fuso cai no da conta.
      fusoDoLead: 'America/Manaus',
      lead: { nome: 'Carla', email: 'c@a.com', telefone: '+5581999990000', empresa: 'Aurora', temEmail: true },
      sala: 'https://sala',
      notas: 'Prefere de manhã.',
      resumoDePassagem: { dor: 'Fila de dois dias' },
      marcadaEm: '2026-09-28T14:05:00Z',
      confirmadaEm: '2026-09-30T13:02:00Z',
      chamadaDaMarcacao: 'ch-1',
      chamadaDaConfirmacao: 'ch-2',
      // Só a que a leitura achou.
      chamadas: [{ id: 'ch-1', iniciadaEm: '2026-09-28T14:00:00Z' }],
      evento: { externoId: null, tentativas: 2, erro: 'O Google recusou o evento.' },
    })
  })

  it('reunião sem ligação vinculada não pergunta a calls', async () => {
    const { cliente: falso, pedidos } = cliente([
      { data: linhaDaFicha({ booked_call_id: null, confirmed_call_id: null }), error: null },
    ])
    const carga = await criarServicoDeReunioes(falso).carregarFicha('r-1')
    expect(pedidos.map((pedido) => pedido.tabela)).toEqual(['reunioes_reais', 'audit_log'])
    expect(carga.ok && carga.ficha.chamadas).toEqual([])
  })

  it('as marcações do desfecho vêm da trilha da reunião, pela conta, pelo alvo e em ordem', async () => {
    const { cliente: falso, pedidos } = cliente([
      { data: linhaDaFicha({ booked_call_id: null, confirmed_call_id: null, status: 'attended', attestation_status: 'attested' }), error: null },
      {
        data: [
          {
            actor_id: 'u-2',
            reason: null,
            created_at: '2026-10-01T18:00:00Z',
            payload: {
              campos: ['attestation_status', 'attested_at', 'attested_by', 'attested_source', 'status'],
              antes: { status: 'scheduled', attestation_status: 'pending', attested_at: null },
              depois: { status: 'no_show', attestation_status: 'attested', attested_at: '2026-10-01T18:00:00Z' },
            },
          },
          {
            actor_id: 'u-1',
            reason: 'O lead entrou atrasado.',
            created_at: '2026-10-01T19:00:00Z',
            payload: {
              campos: ['attested_at', 'attested_by', 'status'],
              antes: { status: 'no_show', attestation_status: 'attested', attested_at: '2026-10-01T18:00:00Z' },
              depois: { status: 'attended', attestation_status: 'attested', attested_at: '2026-10-01T19:00:00Z' },
            },
          },
        ],
        error: null,
      },
    ])
    const carga = await criarServicoDeReunioes(falso).carregarFicha('r-1')

    expect(pedidos[1]!.metodos).toEqual(
      expect.arrayContaining([
        { nome: 'eq', argumentos: ['account_id', 'c-1'] },
        { nome: 'eq', argumentos: ['target_type', 'meetings'] },
        { nome: 'eq', argumentos: ['target_id', 'r-1'] },
        { nome: 'order', argumentos: ['created_at', { ascending: true }] },
      ]),
    )
    if (!carga.ok) throw new Error('falhou')
    expect(carga.ficha.apuracao).toBe('attested')
    expect(carga.ficha.marcacoes).toEqual([
      { instante: '2026-10-01T18:00:00Z', autorId: 'u-2', desfecho: 'no_show', motivo: null, sobrescreveu: false },
      {
        instante: '2026-10-01T19:00:00Z',
        autorId: 'u-1',
        desfecho: 'attended',
        motivo: 'O lead entrou atrasado.',
        sobrescreveu: true,
      },
    ])
  })

  it('zero linha e id que nem é uuid dão o mesmo nao-encontrada', async () => {
    const vazia = cliente([{ data: null, error: null }])
    expect(await criarServicoDeReunioes(vazia.cliente).carregarFicha('r-x')).toEqual({
      ok: false,
      motivo: 'nao-encontrada',
    })
    const malformado = cliente([{ data: null, error: { code: '22P02', message: 'x' } }])
    expect(await criarServicoDeReunioes(malformado.cliente).carregarFicha('abc')).toEqual({
      ok: false,
      motivo: 'nao-encontrada',
    })
    const queda = cliente([{ data: null, error: { code: '08006', message: 'x' } }])
    expect(await criarServicoDeReunioes(queda.cliente).carregarFicha('r-1')).toEqual({
      ok: false,
      motivo: 'falha-de-comunicacao',
    })
  })
})

describe('marcarDesfecho', () => {
  it('chama marcar_desfecho_da_reuniao com os quatro parâmetros e traduz o código', async () => {
    const { cliente: falso, rpcs, pedidos } = cliente([])
    const resultado = await criarServicoDeReunioes(falso).marcarDesfecho({
      reuniaoId: 'r-1',
      desfecho: 'canceled',
      motivo: 'O lead pediu.',
      sobrescrever: true,
    })
    expect(resultado).toEqual({ ok: true })
    expect(rpcs).toEqual([
      {
        nome: 'marcar_desfecho_da_reuniao',
        argumentos: { p_meeting_id: 'r-1', p_desfecho: 'canceled', p_motivo: 'O lead pediu.', p_sobrescrever: true },
      },
    ])
    // O desfecho nunca vai por update: o gatilho do banco o recusaria.
    expect(pedidos).toEqual([])
  })

  it.each([
    ['ja_apurada', 'ja-apurada'],
    ['motivo_obrigatorio', 'motivo-obrigatorio'],
    ['sem_papel', 'sem-papel'],
    ['nao_encontrada', 'nao-encontrada'],
    ['desfecho_desconhecido', 'desfecho-desconhecido'],
    ['codigo_novo', 'falha-de-comunicacao'],
  ])('o código %s vira %s', async (codigo, motivo) => {
    const { cliente: falso } = cliente([], { data: codigo, error: null })
    expect(
      await criarServicoDeReunioes(falso).marcarDesfecho({
        reuniaoId: 'r-1',
        desfecho: 'attended',
        motivo: null,
        sobrescrever: false,
      }),
    ).toEqual({ ok: false, motivo })
  })

  it('erro de protocolo vira falha, 42501 vira sem papel e id malformado vira não encontrada', async () => {
    const pedido = { reuniaoId: 'r-1', desfecho: 'attended' as const, motivo: null, sobrescrever: false }
    for (const [code, motivo] of [
      ['08006', 'falha-de-comunicacao'],
      ['42501', 'sem-papel'],
      ['22P02', 'nao-encontrada'],
    ] as const) {
      const { cliente: falso } = cliente([], { data: null, error: { code, message: 'x' } })
      expect(await criarServicoDeReunioes(falso).marcarDesfecho(pedido)).toEqual({ ok: false, motivo })
    }
  })
})
