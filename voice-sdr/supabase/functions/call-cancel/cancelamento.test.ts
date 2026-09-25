// Provas de call-cancel. Ambiente node, sem rede e sem banco: a porta é um
// `Proxy` que registra todo membro tocado, sobre uma fila e uma chamada em
// memória que implementam ao pé da letra as condições de cada update.
//
// O que este arquivo segura:
//
// 1. **Fila**: item `queued` sai como `canceled` e nada é discado.
// 2. **Em curso**: a chamada é marcada `canceled`, a telefonia recebe um
//    encerramento, e o `status` não é tocado — quem fecha é a finalização.
// 3. **Idempotência**: o segundo pedido conta zero idas à telefonia, zero
//    escritas e zero linhas de trilha.
// 4. **A corrida com a finalização termina finalizada**, nas duas ordens.
// 5. **Trilha** com autor, alvo e motivo; trilha que falha desfaz a escrita.
// 6. **A credencial da telefonia não sai** no corpo.

import { describe, expect, test } from 'vitest'

import {
  cancelar,
  type ChamadaDoCancelamento,
  type ItemDaFila,
  type LinhaDeAuditoria,
  type PedidoDaBorda,
  type PedidoDeEncerramento,
  type PortaDoCancelamento,
  type RespostaDoCancelamento,
} from './cancelamento.ts'

const CONTA_A = '11111111-1111-4111-8111-111111111111'
const CONTA_B = '44444444-4444-4444-8444-444444444444'
const CHAMADA = '22222222-2222-4222-8222-222222222222'
const ITEM = '33333333-3333-4333-8333-333333333333'
const OPERADOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const JWT = 'jwt-do-operador'
const SID = 'CA0123456789abcdef0123456789abcdef'
const IDENTIFICADOR = 'AC-identificador-da-conta-0001'
const TOKEN = 'token-da-telefonia-da-conta-0001'
const AGORA = '2026-03-20T10:00:00.000Z'

interface Bancada {
  readonly porta: PortaDoCancelamento
  readonly tocados: string[]
  readonly chamada: { -readonly [K in keyof ChamadaDoCancelamento]: ChamadaDoCancelamento[K] } & {
    ended_at: string | null
  }
  readonly item: { -readonly [K in keyof ItemDaFila]: ItemDaFila[K] }
  readonly encerramentos: PedidoDeEncerramento[]
  readonly trilha: LinhaDeAuditoria[]
  /** Todo `status` que alguma escrita desta função deixou na chamada. */
  readonly statusEscritos: string[]
  /** A finalização, com a regra de `call-finalize`: preserva `canceled`. */
  finalizar(): void
}

interface AjustesDaBancada {
  chamada?: Partial<ChamadaDoCancelamento>
  item?: Partial<ItemDaFila>
  papel?: string | null
  semCredencial?: boolean
  provedorRecusa?: boolean
  trilhaFalha?: boolean
  /** A finalização roda entre a leitura e o update condicionado. */
  finalizaNoMeio?: boolean
}

function bancada(ajustes: AjustesDaBancada = {}): Bancada {
  const tocados: string[] = []
  const encerramentos: PedidoDeEncerramento[] = []
  const trilha: LinhaDeAuditoria[] = []
  const statusEscritos: string[] = []

  const chamada: Bancada['chamada'] = {
    id: CHAMADA,
    account_id: CONTA_A,
    status: 'in_progress',
    end_reason: null,
    provider_call_sid: SID,
    finalized_at: null,
    ended_at: null,
    ...ajustes.chamada,
  }
  const item: Bancada['item'] = {
    id: ITEM,
    account_id: CONTA_A,
    status: 'queued',
    call_id: null,
    ...ajustes.item,
  }

  function finalizar(): void {
    chamada.status = 'ended'
    chamada.end_reason = chamada.end_reason === 'canceled' ? 'canceled' : 'completed'
    chamada.finalized_at = AGORA
    chamada.ended_at = AGORA
  }

  function talvezFinalizeNoMeio(): void {
    if (ajustes.finalizaNoMeio && chamada.finalized_at === null) finalizar()
  }

  const real: PortaDoCancelamento = {
    async usuarioDaSessao(jwt) {
      return jwt === JWT ? { id: OPERADOR } : null
    },
    async papelNaConta(contaId, usuarioId) {
      if (contaId !== CONTA_A || usuarioId !== OPERADOR) return null
      return ajustes.papel === undefined ? 'operator' : ajustes.papel
    },
    async itemDaFila(itemId) {
      return itemId === item.id ? { ...item } : null
    },
    async chamada(chamadaId) {
      if (chamadaId !== chamada.id) return null
      return {
        id: chamada.id,
        account_id: chamada.account_id,
        status: chamada.status,
        end_reason: chamada.end_reason,
        provider_call_sid: chamada.provider_call_sid,
        finalized_at: chamada.finalized_at,
      }
    },
    async retirarDaFila(itemId) {
      if (itemId !== item.id || item.status !== 'queued') return false
      item.status = 'canceled'
      return true
    },
    async devolverAFila(itemId) {
      if (itemId === item.id && item.status === 'canceled') item.status = 'queued'
    },
    async fecharAntesDeDiscar(chamadaId, agora) {
      talvezFinalizeNoMeio()
      const casa =
        chamadaId === chamada.id &&
        chamada.status === 'queued' &&
        chamada.provider_call_sid === null &&
        chamada.finalized_at === null
      if (!casa) return false
      chamada.status = 'failed'
      chamada.end_reason = 'canceled'
      chamada.ended_at = agora
      statusEscritos.push('failed')
      return true
    },
    async reabrirAntesDeDiscar(chamadaId) {
      const casa =
        chamadaId === chamada.id &&
        chamada.status === 'failed' &&
        chamada.end_reason === 'canceled' &&
        chamada.finalized_at === null
      if (!casa) return
      chamada.status = 'queued'
      chamada.end_reason = null
      chamada.ended_at = null
      statusEscritos.push('queued')
    },
    async marcarCancelamento(chamadaId) {
      talvezFinalizeNoMeio()
      const casa =
        chamadaId === chamada.id &&
        (chamada.status === 'ringing' || chamada.status === 'in_progress') &&
        chamada.finalized_at === null &&
        chamada.end_reason === null
      if (!casa) return false
      chamada.end_reason = 'canceled'
      return true
    },
    async desmarcarCancelamento(chamadaId) {
      if (chamadaId === chamada.id && chamada.end_reason === 'canceled' && chamada.finalized_at === null) {
        chamada.end_reason = null
      }
    },
    async registrarAuditoria(linha) {
      if (ajustes.trilhaFalha) throw new Error('audit_log fora do ar')
      trilha.push(linha)
    },
    async credencial(_conta, _provedor, chave) {
      if (ajustes.semCredencial) return { ok: false, motivo: 'ausente' }
      return { ok: true, valor: chave === 'account_sid' ? IDENTIFICADOR : TOKEN, origem: 'conta' }
    },
    async encerrarNoProvedor(pedido) {
      encerramentos.push(pedido)
      if (ajustes.provedorRecusa) {
        // O eco do provedor traz o identificador: a conferência tem que segurá-lo.
        return { ok: false, status: 404, codigo: 'not_found', corpo: { account: IDENTIFICADOR } }
      }
      return { ok: true, status: 200, endpoint: `Accounts/${IDENTIFICADOR}/Calls/${pedido.providerCallSid}.json` }
    },
    async registrarEventoDeIntegracao() {},
  }

  const porta = new Proxy(real, {
    get(alvo, membro, receptor) {
      tocados.push(String(membro))
      return Reflect.get(alvo, membro, receptor) as unknown
    },
  })

  return { porta, tocados, chamada, item, encerramentos, trilha, statusEscritos, finalizar }
}

function pedido(ajustes: Partial<PedidoDaBorda> = {}): PedidoDaBorda {
  return {
    metodo: 'POST',
    chamadaId: CHAMADA,
    itemDaFilaId: null,
    motivo: 'lead pediu para não ligar agora',
    autorizacao: `Bearer ${JWT}`,
    ...ajustes,
  }
}

function pedir(b: Bancada, ajustes: Partial<PedidoDaBorda> = {}): Promise<RespostaDoCancelamento> {
  return cancelar(pedido(ajustes), b.porta, { agora: AGORA })
}

const ESCRITAS = [
  'retirarDaFila',
  'devolverAFila',
  'fecharAntesDeDiscar',
  'reabrirAntesDeDiscar',
  'marcarCancelamento',
  'desmarcarCancelamento',
  'registrarAuditoria',
  'encerrarNoProvedor',
]

function escritas(b: Bancada): string[] {
  return b.tocados.filter((membro) => ESCRITAS.includes(membro))
}

describe('na fila', () => {
  test('item queued sai como canceled, sem discar e sem tocar em chamada nenhuma', async () => {
    const b = bancada()
    const resposta = await pedir(b, { chamadaId: null, itemDaFilaId: ITEM })

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toMatchObject({ ok: true, alvo: 'fila', estado: 'retirado_da_fila', status: 'canceled' })
    expect(b.item.status).toBe('canceled')
    expect(b.encerramentos).toEqual([])
    expect(b.tocados).not.toContain('chamada')
    expect(b.tocados).not.toContain('credencial')
  })

  test('item já retirado devolve o estado atual, sem escrita', async () => {
    const b = bancada({ item: { status: 'canceled' } })
    const resposta = await pedir(b, { chamadaId: null, itemDaFilaId: ITEM })

    expect(resposta.corpo).toMatchObject({ ok: true, estado: 'ja_retirado', status: 'canceled' })
    expect(escritas(b)).toEqual([])
  })

  test('item tomado pelo discador sem chamada ainda é 409, e a fila não é tocada', async () => {
    const b = bancada({ item: { status: 'claimed' } })
    const resposta = await pedir(b, { chamadaId: null, itemDaFilaId: ITEM })

    expect(resposta.status).toBe(409)
    expect(resposta.corpo).toMatchObject({ ok: false, motivo: 'em_discagem' })
    expect(escritas(b)).toEqual([])
  })

  test('item que já virou chamada cancela a chamada que ele abriu', async () => {
    const b = bancada({ item: { status: 'done', call_id: CHAMADA } })
    const resposta = await pedir(b, { chamadaId: null, itemDaFilaId: ITEM })

    expect(resposta.corpo).toMatchObject({ ok: true, alvo: 'chamada', id: CHAMADA, estado: 'encerrando' })
    expect(b.encerramentos).toHaveLength(1)
    expect(b.item.status).toBe('done')
  })
})

describe('em curso', () => {
  test('marca canceled, registra, pede o encerramento à telefonia e não mexe no status', async () => {
    const b = bancada()
    const resposta = await pedir(b)

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toMatchObject({ ok: true, alvo: 'chamada', estado: 'encerrando', status: 'in_progress' })
    expect(b.encerramentos).toEqual([{ providerCallSid: SID, identificador: IDENTIFICADOR, token: TOKEN }])
    expect(b.chamada.end_reason).toBe('canceled')
    expect(b.chamada.status).toBe('in_progress')
    expect(b.statusEscritos).toEqual([])
    expect(escritas(b)).toEqual(['marcarCancelamento', 'registrarAuditoria', 'encerrarNoProvedor'])
  })

  test('chamada que ainda não discou é fechada aqui: failed com canceled, sem telefonia', async () => {
    const b = bancada({ chamada: { status: 'queued', provider_call_sid: null } })
    const resposta = await pedir(b)

    expect(resposta.corpo).toMatchObject({ ok: true, estado: 'cancelada_antes_de_discar', status: 'failed' })
    expect(b.chamada).toMatchObject({ status: 'failed', end_reason: 'canceled', ended_at: AGORA })
    expect(b.encerramentos).toEqual([])
    expect(b.tocados).not.toContain('credencial')
  })

  test('chamada tocando sem identificador na telefonia é 422, e nada é marcado', async () => {
    const b = bancada({ chamada: { status: 'ringing', provider_call_sid: null } })
    const resposta = await pedir(b)

    expect(resposta.status).toBe(422)
    expect(escritas(b)).toEqual([])
  })

  test('telefonia que recusa desfaz a marca, e o pedido seguinte pode tentar de novo', async () => {
    const b = bancada({ provedorRecusa: true })
    const resposta = await pedir(b)

    expect(resposta.status).toBe(502)
    expect(resposta.corpo).toMatchObject({ ok: false, motivo: 'provedor_nao_encerrou' })
    expect(b.chamada.end_reason).toBeNull()
    // A decisão foi tomada e fica na trilha.
    expect(b.trilha).toHaveLength(1)
  })

  test('sem a credencial da telefonia é 503, antes de qualquer marca', async () => {
    const b = bancada({ semCredencial: true })
    const resposta = await pedir(b)

    expect(resposta.status).toBe(503)
    expect(escritas(b)).toEqual([])
    expect(b.chamada.end_reason).toBeNull()
  })
})

describe('idempotência', () => {
  test('segundo pedido sobre a chamada em curso: zero idas à telefonia, zero escritas', async () => {
    const b = bancada()
    await pedir(b)
    expect(b.encerramentos).toHaveLength(1)

    b.tocados.length = 0
    const segunda = await pedir(b)

    expect(segunda.corpo).toMatchObject({ ok: true, estado: 'ja_cancelada' })
    expect(b.encerramentos).toHaveLength(1)
    expect(escritas(b)).toEqual([])
  })

  test('chamada já encerrada devolve o estado atual sem tocar na telefonia', async () => {
    const b = bancada({
      chamada: { status: 'ended', end_reason: 'completed', finalized_at: '2026-03-20T09:59:00.000Z' },
    })
    const resposta = await pedir(b)

    expect(resposta).toEqual({
      status: 200,
      corpo: {
        ok: true,
        alvo: 'chamada',
        id: CHAMADA,
        estado: 'ja_encerrada',
        mensagem: 'Esta chamada já tinha terminado.',
        status: 'ended',
      },
    })
    expect(b.encerramentos).toEqual([])
    expect(b.tocados).not.toContain('credencial')
    expect(escritas(b)).toEqual([])
  })

  test('cancelada e finalizada: o segundo pedido diz ja_cancelada, sem nada tocar', async () => {
    const b = bancada()
    await pedir(b)
    b.finalizar()
    b.tocados.length = 0

    const segunda = await pedir(b)
    expect(segunda.corpo).toMatchObject({ ok: true, estado: 'ja_cancelada', status: 'ended' })
    expect(escritas(b)).toEqual([])
  })
})

describe('a corrida com a finalização', () => {
  test('finalização entre a leitura e a marca: o update não casa, e a chamada termina finalizada', async () => {
    const b = bancada({ finalizaNoMeio: true })
    const resposta = await pedir(b)

    expect(resposta.corpo).toMatchObject({ ok: true, estado: 'ja_encerrada', status: 'ended' })
    expect(b.chamada).toMatchObject({ status: 'ended', end_reason: 'completed', finalized_at: AGORA })
    expect(b.encerramentos).toEqual([])
    expect(b.trilha).toEqual([])
  })

  test('finalização entre a leitura e o fechamento da que não discou: continua finalizada', async () => {
    const b = bancada({ chamada: { status: 'queued', provider_call_sid: null }, finalizaNoMeio: true })
    const resposta = await pedir(b)

    expect(resposta.corpo).toMatchObject({ ok: true, estado: 'ja_encerrada', status: 'ended' })
    expect(b.chamada.status).toBe('ended')
    expect(b.statusEscritos).toEqual([])
  })

  test('cancelar primeiro e finalizar depois termina ended com canceled, nunca in_progress', async () => {
    const b = bancada()
    await pedir(b)
    b.finalizar()

    expect(b.chamada).toMatchObject({ status: 'ended', end_reason: 'canceled', finalized_at: AGORA })
    const depois = await pedir(b)
    expect(b.chamada.status).toBe('ended')
    expect(depois.corpo).toMatchObject({ estado: 'ja_cancelada' })
    expect(b.statusEscritos).not.toContain('in_progress')
  })
})

describe('a trilha (RF-008)', () => {
  test('autor, alvo, motivo e estado anterior', async () => {
    const b = bancada()
    await pedir(b)

    expect(b.trilha).toEqual([
      {
        account_id: CONTA_A,
        actor: 'user',
        actor_id: OPERADOR,
        source: 'edge:call-cancel',
        action: 'call_canceled',
        target_type: 'calls',
        target_id: CHAMADA,
        reason: 'lead pediu para não ligar agora',
        payload: { estado_anterior: 'in_progress', efeito: 'encerramento_pedido' },
      },
    ])
  })

  test('na fila, a linha aponta para o item', async () => {
    const b = bancada()
    await pedir(b, { chamadaId: null, itemDaFilaId: ITEM })
    expect(b.trilha).toMatchObject([
      { action: 'dial_queue_canceled', target_type: 'dial_queue', target_id: ITEM, actor_id: OPERADOR },
    ])
  })

  test('trilha que falha desfaz a escrita e não chega à telefonia', async () => {
    const emCurso = bancada({ trilhaFalha: true })
    expect((await pedir(emCurso)).status).toBe(500)
    expect(emCurso.chamada.end_reason).toBeNull()
    expect(emCurso.encerramentos).toEqual([])

    const naFila = bancada({ trilhaFalha: true })
    expect((await pedir(naFila, { chamadaId: null, itemDaFilaId: ITEM })).status).toBe(500)
    expect(naFila.item.status).toBe('queued')

    const antes = bancada({ trilhaFalha: true, chamada: { status: 'queued', provider_call_sid: null } })
    expect((await pedir(antes)).status).toBe(500)
    expect(antes.chamada).toMatchObject({ status: 'queued', end_reason: null, ended_at: null })
  })
})

describe('quem pode cancelar', () => {
  test('viewer é 403; quem não é membro da conta do alvo recebe o 404 do alvo inexistente', async () => {
    const viewer = bancada({ papel: 'viewer' })
    expect((await pedir(viewer)).status).toBe(403)
    expect(escritas(viewer)).toEqual([])

    const vizinho = bancada({ chamada: { account_id: CONTA_B } })
    const resposta = await pedir(vizinho)
    const inexistente = await pedir(bancada(), { chamadaId: '66666666-6666-4666-8666-666666666666' })
    expect(resposta.status).toBe(404)
    expect(JSON.stringify(resposta.corpo)).toBe(JSON.stringify(inexistente.corpo))
    expect(escritas(vizinho)).toEqual([])
  })

  test('sem sessão, sessão inválida, os dois alvos juntos, nenhum alvo e método errado', async () => {
    const casos: [Partial<PedidoDaBorda>, number][] = [
      [{ autorizacao: null }, 401],
      [{ autorizacao: 'Bearer outro' }, 401],
      [{ itemDaFilaId: ITEM }, 400],
      [{ chamadaId: null }, 400],
      [{ chamadaId: 'nao-e-uuid' }, 400],
      [{ metodo: 'GET' }, 405],
    ]
    for (const [ajuste, status] of casos) {
      const b = bancada()
      const resposta = await pedir(b, ajuste)
      expect({ ajuste, status: resposta.status }).toEqual({ ajuste, status })
      expect(escritas(b)).toEqual([])
    }
  })
})

describe('a credencial nunca sai', () => {
  test('nem no caminho feliz, nem no eco da recusa da telefonia', async () => {
    for (const ajustes of [{}, { provedorRecusa: true }]) {
      const resposta = await pedir(bancada(ajustes))
      const serializado = JSON.stringify(resposta.corpo)
      expect(serializado).not.toContain(IDENTIFICADOR)
      expect(serializado).not.toContain(TOKEN)
    }
  })
})
