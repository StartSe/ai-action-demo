// O que o serviço manda ao Supabase e às bordas, lido por um cliente que só
// grava a cadeia de chamadas (o mesmo desenho de `bloqueios/servico-supabase.test.ts`):
// o canal se grava por `update`, nunca por `insert`, e `agir`/`conectar` mandam
// o corpo exato que `whatsapp-send` e `whatsapp-connect` esperam.

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { criarServicoDeWhatsapp } from '@/whatsapp/servico-supabase'

interface Chamada {
  tabela: string
  metodos: { nome: string; argumentos: unknown[] }[]
}

function clienteGravador(
  respostas: (chamada: Chamada) => { data: unknown; error: unknown },
  funcoes: (nome: string, opcoes: { body: unknown }) => { data: unknown; error: unknown } = () => ({
    data: null,
    error: null,
  }),
) {
  const chamadas: Chamada[] = []
  const invocacoes: { nome: string; corpo: unknown }[] = []

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
    functions: {
      invoke(nome: string, opcoes: { body: unknown }) {
        invocacoes.push({ nome, corpo: opcoes.body })
        return Promise.resolve(funcoes(nome, opcoes))
      },
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => Promise.resolve(),
  }

  return { cliente: cliente as unknown as SupabaseClient, chamadas, invocacoes }
}

function nomes(chamada: Chamada | undefined): string[] {
  return (chamada?.metodos ?? []).map((metodo) => metodo.nome)
}

function respostaDeConta(chamada: Chamada) {
  if (chamada.tabela === 'account_members') {
    return { data: { account_id: 'c-1' }, error: null }
  }
  return { data: [], error: null }
}

describe('criarServicoDeWhatsapp', () => {
  it('definirCanal grava só os quatro campos por update, nunca insert', async () => {
    const { cliente, chamadas } = clienteGravador((chamada) => {
      if (chamada.tabela === 'account_settings') {
        return {
          data: [
            {
              whatsapp_enabled: true,
              whatsapp_mode: 'todos',
              whatsapp_pre_contact: false,
              whatsapp_pre_contact_text: null,
            },
          ],
          error: null,
        }
      }
      return respostaDeConta(chamada)
    })

    const resultado = await criarServicoDeWhatsapp(cliente).definirCanal({
      habilitado: true,
      modo: 'todos',
      preContato: false,
      textoDoPreContato: null,
    })

    expect(resultado).toEqual({
      ok: true,
      canal: { habilitado: true, modo: 'todos', preContato: false, textoDoPreContato: null },
    })

    const escrita = chamadas.find((chamada) => chamada.tabela === 'account_settings')
    expect(nomes(escrita)).not.toContain('insert')
    expect(nomes(escrita)[0]).toBe('update')
    expect(escrita?.metodos[0]?.argumentos[0]).toEqual({
      whatsapp_enabled: true,
      whatsapp_mode: 'todos',
      whatsapp_pre_contact: false,
      whatsapp_pre_contact_text: null,
    })
  })

  it('definirCanal recusado pela RLS (zero linha) é sem-permissao', async () => {
    const { cliente } = clienteGravador((chamada) => {
      if (chamada.tabela === 'account_settings') return { data: [], error: null }
      return respostaDeConta(chamada)
    })

    const resultado = await criarServicoDeWhatsapp(cliente).definirCanal({
      habilitado: true,
      modo: 'todos',
      preContato: false,
      textoDoPreContato: null,
    })

    expect(resultado).toEqual({ ok: false, motivo: 'sem-permissao' })
  })

  it('agir manda o corpo exato de whatsapp-send, com a conta resolvida', async () => {
    const { cliente, invocacoes } = clienteGravador(respostaDeConta, (nome) => {
      expect(nome).toBe('whatsapp-send')
      return {
        data: { ok: true, conversa: { id: 'w-1', status: 'humano' } },
        error: null,
      }
    })

    const resultado = await criarServicoDeWhatsapp(cliente).agir({
      conversaId: 'w-1',
      acao: 'assumir',
    })

    expect(resultado).toEqual({ ok: true, conversaId: 'w-1', status: 'humano' })
    expect(invocacoes).toEqual([
      {
        nome: 'whatsapp-send',
        corpo: {
          account_id: 'c-1',
          conversation_id: 'w-1',
          lead_id: undefined,
          text: undefined,
          acao: 'assumir',
        },
      },
    ])
  })

  it('conectar chama whatsapp-connect só com o account_id', async () => {
    const { cliente, invocacoes } = clienteGravador(respostaDeConta, (nome) => {
      expect(nome).toBe('whatsapp-connect')
      return {
        data: { ok: true, estado: 'conectado', webhooks: 'registrados', mensagem: 'Conectado.' },
        error: null,
      }
    })

    const resultado = await criarServicoDeWhatsapp(cliente).conectar()

    expect(resultado).toEqual({ ok: true, estado: 'conectado', mensagem: 'Conectado.' })
    expect(invocacoes).toEqual([{ nome: 'whatsapp-connect', corpo: { account_id: 'c-1' } }])
  })

  it('conversa de outra conta ou inexistente é o mesmo silêncio da RLS', async () => {
    const { cliente } = clienteGravador((chamada) => {
      if (chamada.tabela === 'whatsapp_conversations') return { data: null, error: null }
      return respostaDeConta(chamada)
    })

    expect(await criarServicoDeWhatsapp(cliente).carregarConversa('w-9')).toEqual({
      ok: false,
      motivo: 'nao-encontrada',
    })
  })

  it('sem sessão, agir recusa sem chamar a borda', async () => {
    const cliente = {
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
      functions: { invoke: () => Promise.reject(new Error('não deveria chamar')) },
    } as unknown as SupabaseClient

    const resultado = await criarServicoDeWhatsapp(cliente).agir({ acao: 'iniciar', leadId: 'l-1' })
    expect(resultado.ok).toBe(false)
  })
})
