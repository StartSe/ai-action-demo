// O serviço de especialistas sobre o Supabase (US-175). O que o dublê de tela
// não alcança: a escrita que a RLS filtra volta sem erro e sem linha, e só o
// `.select()` na cadeia deixa ver isso. Sem ele, a tela diria "salvo".

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { criarServicoDeEspecialistas, lerPreparoDaConexao } from '@/especialistas/servico-supabase'
import type { PedidoDeEspecialista } from '@/especialistas/tipos'

/** Cadeia que aceita qualquer método e resolve com `resposta` quando aguardada. */
function cadeia(resposta: unknown, metodos: string[]): unknown {
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

/** A primeira tabela é sempre `account_members`; a segunda, `specialists`. */
function cliente(respostaDaTabela: unknown) {
  const metodos: string[] = []
  const falso = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } } }) },
    from(tabela: string) {
      if (tabela === 'account_members') {
        return cadeia(
          { data: { account_id: 'c-1', accounts: { timezone: 'America/Manaus' } }, error: null },
          [],
        )
      }
      return cadeia(respostaDaTabela, metodos)
    },
  }
  return { cliente: falso as unknown as SupabaseClient, metodos }
}

const PEDIDO: PedidoDeEspecialista = {
  id: 'e-1',
  nome: 'Marina Duarte',
  area: null,
  fuso: 'America/Sao_Paulo',
  modalidades: ['video'],
  duracaoPadraoMin: 30,
  tetoDiario: 6,
  antecedenciaMinimaMin: 120,
  antecedenciaMaximaDias: 30,
  sala: null,
  email: 'marina@empresa.com.br',
  ativo: true,
}

describe('escrita', () => {
  it.each([
    ['salvar (update)', (s: ReturnType<typeof criarServicoDeEspecialistas>) => s.salvar(PEDIDO)],
    [
      'salvar (insert)',
      (s: ReturnType<typeof criarServicoDeEspecialistas>) => s.salvar({ ...PEDIDO, id: null }),
    ],
    [
      'alternarAtivo',
      (s: ReturnType<typeof criarServicoDeEspecialistas>) => s.alternarAtivo('e-1', false),
    ],
  ])('%s sem linha de volta é recusa, e não sucesso', async (_nome, agir) => {
    const { cliente: falso, metodos } = cliente({ data: [], error: null })

    expect(await agir(criarServicoDeEspecialistas(falso))).toEqual({
      ok: false,
      motivo: 'recusada',
    })
    expect(metodos.at(-1)).toBe('select')
  })

  it('com a linha de volta, a gravação vale', async () => {
    const { cliente: falso } = cliente({ data: [{ id: 'e-1' }], error: null })

    expect(await criarServicoDeEspecialistas(falso).alternarAtivo('e-1', false)).toEqual({
      ok: true,
    })
  })

  it('42501 é falta de permissão', async () => {
    const { cliente: falso } = cliente({ data: null, error: { code: '42501', message: 'rls' } })

    expect(await criarServicoDeEspecialistas(falso).salvar({ ...PEDIDO, id: null })).toEqual({
      ok: false,
      motivo: 'sem-permissao',
    })
  })
})

describe('carregar', () => {
  const linha = {
    id: 'e-1',
    name: 'Marina Duarte',
    area: null,
    timezone: 'America/Sao_Paulo',
    modalities: ['video'],
    default_duration_min: 30,
    daily_cap: 6,
    min_notice_min: 120,
    max_notice_days: 30,
    room_url: null,
    email: 'marina@empresa.com.br',
    active: true,
    last_assigned_at: null,
  }

  it('traz o fuso da conta e o estado de cada calendário', async () => {
    const { cliente: falso } = cliente({
      data: [
        { ...linha, id: 'sem', specialist_calendars: [] },
        {
          ...linha,
          id: 'ok',
          specialist_calendars: [
            { provider: 'google', synced_at: '2026-09-24T12:00:00Z', sync_error: null },
          ],
        },
        {
          ...linha,
          id: 'falha',
          specialist_calendars: [
            { provider: 'google', synced_at: null, sync_error: 'O Google recusou o acesso.' },
          ],
        },
      ],
      error: null,
    })

    const carga = await criarServicoDeEspecialistas(falso).carregar()

    if (!carga.ok) throw new Error('a carga devia passar')
    expect(carga.fusoDaConta).toBe('America/Manaus')
    expect(carga.especialistas.map((especialista) => especialista.calendario)).toEqual([
      { estado: 'desconectado' },
      { estado: 'conectado', provedor: 'google', sincronizadoEm: '2026-09-24T12:00:00Z' },
      {
        estado: 'com-falha',
        provedor: 'google',
        falha: 'O Google recusou o acesso.',
        sincronizadoEm: null,
      },
    ])
  })
})

describe('agenda', () => {
  /** Como `cliente`, mas cada `from` fora de `account_members` responde o próximo da fila. */
  function clienteEmFila(respostas: unknown[]) {
    const metodos: string[][] = []
    const falso = {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } } }) },
      from(tabela: string) {
        if (tabela === 'account_members') {
          return cadeia({ data: { account_id: 'c-1', accounts: { timezone: 'America/Sao_Paulo' } }, error: null }, [])
        }
        const chamada: string[] = [tabela]
        metodos.push(chamada)
        return cadeia(respostas.shift(), chamada)
      },
    }
    return { cliente: falso as unknown as SupabaseClient, metodos }
  }

  const BLOQUEIO = {
    especialistaId: 'e-1',
    inicio: '2026-10-07T13:00:00.000Z',
    fim: '2026-10-07T15:00:00.000Z',
    motivo: null,
  }

  it('23P01 relê o bloqueio que já cobre o intervalo, para a frase nomeá-lo', async () => {
    const { cliente: falso, metodos } = clienteEmFila([
      { data: null, error: { code: '23P01', message: 'conflicting key value violates exclusion constraint' } },
      {
        data: [{ id: 'b-9', starts_at: '2026-10-07T12:00:00Z', ends_at: '2026-10-07T14:00:00Z', reason: 'Férias' }],
        error: null,
      },
    ])

    expect(await criarServicoDeEspecialistas(falso).acrescentarBloqueio(BLOQUEIO)).toEqual({
      ok: false,
      motivo: 'bloqueio-sobreposto',
      conflito: { id: 'b-9', inicio: '2026-10-07T12:00:00Z', fim: '2026-10-07T14:00:00Z', motivo: 'Férias' },
    })
    // A releitura usa a regra `[)` da restrição: começa antes do fim, termina depois do início.
    expect(metodos[1]).toEqual(expect.arrayContaining(['specialist_blocks', 'lt', 'gt']))
  })

  it.each([
    ['23505', 'faixa-repetida'],
    ['23514', 'ordem-invertida'],
    ['42501', 'sem-permissao'],
  ])('%s na faixa vira %s', async (codigo, motivo) => {
    const { cliente: falso } = clienteEmFila([{ data: null, error: { code: codigo, message: 'x' } }])

    expect(
      await criarServicoDeEspecialistas(falso).acrescentarFaixa({
        especialistaId: 'e-1',
        diaDaSemana: 1,
        inicio: '09:00',
        fim: '12:00',
      }),
    ).toEqual({ ok: false, motivo })
  })

  it.each([
    ['removerFaixa', (s: ReturnType<typeof criarServicoDeEspecialistas>) => s.removerFaixa('f-1')],
    ['removerBloqueio', (s: ReturnType<typeof criarServicoDeEspecialistas>) => s.removerBloqueio('b-1')],
    ['acrescentarBloqueio', (s: ReturnType<typeof criarServicoDeEspecialistas>) => s.acrescentarBloqueio(BLOQUEIO)],
  ])('%s sem linha de volta é recusa, e não sucesso', async (_nome, agir) => {
    const { cliente: falso, metodos } = clienteEmFila([{ data: [], error: null }])

    expect(await agir(criarServicoDeEspecialistas(falso))).toEqual({ ok: false, motivo: 'recusada' })
    expect(metodos[0]?.at(-1)).toBe('select')
  })

  it('a carga devolve a hora do banco na forma que a tela edita', async () => {
    const { cliente: falso } = clienteEmFila([
      { data: [{ id: 'f-1', weekday: 2, start_time: '09:00:00', end_time: '24:00:00' }], error: null },
      { data: [], error: null },
    ])

    expect(await criarServicoDeEspecialistas(falso).carregarAgenda('e-1')).toEqual({
      ok: true,
      faixas: [{ id: 'f-1', diaDaSemana: 2, inicio: '09:00', fim: '24:00' }],
      bloqueios: [],
    })
  })
})

describe('calendário (US-177)', () => {
  it('desconectar apaga o vínculo pela conta, e sem linha de volta é recusa', async () => {
    const { cliente: falso, metodos } = cliente({ data: [], error: null })

    expect(await criarServicoDeEspecialistas(falso).desconectarCalendario('e-1')).toEqual({
      ok: false,
      motivo: 'recusada',
    })
    expect(metodos).toEqual(['delete', 'eq', 'eq', 'select'])
  })

  it('preparar a conexão manda conta e especialista à borda', async () => {
    const { cliente: falso } = cliente({ data: [], error: null })
    const pedidos: unknown[] = []
    const comFuncoes = Object.assign(falso, {
      functions: {
        invoke: (nome: string, opcoes: unknown) => {
          pedidos.push({ nome, opcoes })
          return Promise.resolve({
            data: { ok: true, estado: 'autorizar', url: 'https://accounts.google.com/o?x=1' },
            error: null,
          })
        },
      },
    })

    expect(await criarServicoDeEspecialistas(comFuncoes).prepararConexaoDoCalendario('e-1')).toEqual({
      resultado: 'autorizar',
      url: 'https://accounts.google.com/o?x=1',
    })
    expect(pedidos).toEqual([
      { nome: 'calendar-connect', opcoes: { body: { account_id: 'c-1', specialist_id: 'e-1' } } },
    ])
  })

  it.each([
    [
      'a espera do Google chega com 200 e vira estado, não recusa',
      { ok: false, motivo: 'aguardando_google', mensagem: 'O aplicativo ainda não tem permissão.' },
      { resultado: 'aguardando-google', mensagem: 'O aplicativo ainda não tem permissão.' },
    ],
    [
      'a recusa por papel leva a frase da borda',
      { ok: false, motivo: 'sem_permissao', mensagem: 'Só quem administra conecta.' },
      { resultado: 'recusada', mensagem: 'Só quem administra conecta.' },
    ],
    ['a falha interna é indisponível', { ok: false, motivo: 'falha_interna', mensagem: 'x' }, { resultado: 'indisponivel' }],
    ['corpo ilegível é indisponível', null, { resultado: 'indisponivel' }],
    ['recusa sem frase é indisponível', { ok: false, motivo: 'sem_permissao' }, { resultado: 'indisponivel' }],
  ])('%s', (_nome, corpo, esperado) => {
    expect(lerPreparoDaConexao(corpo)).toEqual(esperado)
  })
})
