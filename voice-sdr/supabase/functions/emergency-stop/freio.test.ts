// Provas de emergency-stop. Ambiente node, sem rede e sem banco: a porta é um
// `Proxy` que empilha o nome de todo membro tocado, sobre uma conta e uma lista
// de chamadas em memória que implementam ao pé da letra as condições de cada
// update.
//
// O que este arquivo segura:
//
// 1. **A gravação vem antes de qualquer encerramento**, provado pela sequência
//    de membros tocados e pelo estado da conta visto de dentro do dublê da
//    telefonia.
// 2. **Chamadas em curso marcadas e encerradas**, com teto de concorrência
//    medido no ar.
// 3. **A que a telefonia recusou fica registrada**, marcada, com o erro no
//    corpo, na trilha e no rastro de integração.
// 4. **Idempotência** contando as idas: o segundo acionamento não move o
//    carimbo, não escreve trilha de freio e não encerra ninguém de novo.
// 5. **Retomar exige admin**, limpa os três campos e grava trilha.
// 6. **Auditoria das duas ações**, com autor, alvo e motivo.
// 7. **O orçamento do que é nosso**: pausa gravada em até 200 ms e disparo dos
//    encerramentos de 10 chamadas em até 2 s. Com tráfego real é do degrau 3.

import { describe, expect, test } from 'vitest'

import {
  atenderFreio,
  CONCORRENCIA_DOS_ENCERRAMENTOS,
  type EventoDeIntegracao,
  type FreioDaConta,
  type LinhaDeAuditoria,
  type PedidoDaBorda,
  type PedidoDeEncerramento,
  type PortaDoFreio,
  type RespostaDoFreio,
} from './freio.ts'

const CONTA = '11111111-1111-4111-8111-111111111111'
const CONTA_VIZINHA = '44444444-4444-4444-8444-444444444444'
const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const JWT = 'jwt-da-administradora'
const IDENTIFICADOR = 'AC-identificador-da-conta-0001'
const TOKEN = 'token-da-telefonia-da-conta-0001'
const AGORA = '2026-03-20T10:00:00.000Z'
const DEPOIS = '2026-03-20T10:05:00.000Z'
const MOTIVO = 'Sarah repetindo a mesma frase em todas as ligações'

interface ChamadaDoDuble {
  id: string
  status: 'queued' | 'ringing' | 'in_progress' | 'ended' | 'failed'
  provider_call_sid: string | null
  finalized_at: string | null
  end_reason: string | null
}

interface AjustesDaBancada {
  papel?: string | null
  freio?: Partial<FreioDaConta>
  chamadas?: ChamadaDoDuble[]
  semCredencial?: boolean
  /** Identificadores na telefonia que ela se recusa a encerrar. */
  recusados?: string[]
  trilhaFalha?: boolean
  comCampanhas?: boolean
}

interface Bancada {
  readonly porta: PortaDoFreio
  readonly tocados: string[]
  readonly conta: { -readonly [K in keyof FreioDaConta]: FreioDaConta[K] }
  readonly chamadas: ChamadaDoDuble[]
  readonly encerramentos: PedidoDeEncerramento[]
  readonly trilha: LinhaDeAuditoria[]
  readonly eventos: EventoDeIntegracao[]
  /** `dialing_paused_at` visto de dentro da telefonia, a cada encerramento. */
  readonly freioVistoPelaTelefonia: (string | null)[]
  /** Quantos encerramentos estavam no ar a cada nova ida. */
  readonly noAr: number[]
  /** Instantes (performance.now) das escritas que o orçamento mede. */
  readonly instantes: { puxarFreio?: number; encerramentos: number[] }
  ajustes: AjustesDaBancada
}

function chamada(n: number, ajustes: Partial<ChamadaDoDuble> = {}): ChamadaDoDuble {
  const sufixo = String(n).padStart(12, '0')
  return {
    id: `22222222-2222-4222-8222-${sufixo}`,
    status: 'in_progress',
    provider_call_sid: `CA${sufixo}`,
    finalized_at: null,
    end_reason: null,
    ...ajustes,
  }
}

function bancada(ajustes: AjustesDaBancada = {}): Bancada {
  const tocados: string[] = []
  const encerramentos: PedidoDeEncerramento[] = []
  const trilha: LinhaDeAuditoria[] = []
  const eventos: EventoDeIntegracao[] = []
  const freioVistoPelaTelefonia: (string | null)[] = []
  const noAr: number[] = []
  const instantes: Bancada['instantes'] = { encerramentos: [] }
  let emVoo = 0

  const conta: Bancada['conta'] = {
    dialing_paused_at: null,
    dialing_paused_by: null,
    dialing_paused_reason: null,
    ...ajustes.freio,
  }
  const chamadas = ajustes.chamadas ?? [
    chamada(1, { status: 'ringing' }),
    chamada(2),
    chamada(3, { status: 'queued' }),
  ]

  const b: Bancada = {
    porta: undefined as unknown as PortaDoFreio,
    tocados,
    conta,
    chamadas,
    encerramentos,
    trilha,
    eventos,
    freioVistoPelaTelefonia,
    noAr,
    instantes,
    ajustes,
  }

  const real: PortaDoFreio = {
    async usuarioDaSessao(jwt) {
      return jwt === JWT ? { id: ADMIN } : null
    },
    async papelNaConta(contaId, usuarioId) {
      if (contaId !== CONTA || usuarioId !== ADMIN) return null
      return b.ajustes.papel === undefined ? 'admin' : b.ajustes.papel
    },
    async puxarFreio(contaId, freio) {
      if (contaId !== CONTA || conta.dialing_paused_at !== null) return null
      instantes.puxarFreio = performance.now()
      conta.dialing_paused_at = freio.em
      conta.dialing_paused_by = freio.por
      conta.dialing_paused_reason = freio.motivo
      return freio.em
    },
    async estadoDoFreio(contaId) {
      return contaId === CONTA ? { ...conta } : null
    },
    async soltarFreio(contaId) {
      if (contaId !== CONTA || conta.dialing_paused_at === null) return false
      conta.dialing_paused_at = null
      conta.dialing_paused_by = null
      conta.dialing_paused_reason = null
      return true
    },
    async repuxarFreio(contaId, anterior) {
      if (contaId !== CONTA || conta.dialing_paused_at !== null) return
      Object.assign(conta, anterior)
    },
    async chamadasEmCurso(contaId) {
      if (contaId !== CONTA) return []
      return chamadas
        .filter(
          (c) =>
            ['queued', 'ringing', 'in_progress'].includes(c.status) &&
            c.provider_call_sid !== null &&
            c.finalized_at === null &&
            c.end_reason === null,
        )
        .map((c) => ({
          id: c.id,
          status: c.status as 'queued' | 'ringing' | 'in_progress',
          provider_call_sid: c.provider_call_sid ?? '',
        }))
    },
    async marcarCancelamento(chamadaId) {
      const alvo = chamadas.find((c) => c.id === chamadaId)
      const casa =
        alvo !== undefined &&
        ['queued', 'ringing', 'in_progress'].includes(alvo.status) &&
        alvo.finalized_at === null &&
        alvo.end_reason === null
      if (!casa) return false
      alvo.end_reason = 'canceled'
      return true
    },
    async registrarAuditoria(linha) {
      if (b.ajustes.trilhaFalha) throw new Error('audit_log fora do ar')
      trilha.push(linha)
    },
    async credencial(_conta, _provedor, chave) {
      if (b.ajustes.semCredencial) return { ok: false, motivo: 'ausente' }
      return { ok: true, valor: chave === 'account_sid' ? IDENTIFICADOR : TOKEN, origem: 'conta' }
    },
    async encerrarNoProvedor(pedido) {
      instantes.encerramentos.push(performance.now())
      freioVistoPelaTelefonia.push(conta.dialing_paused_at)
      encerramentos.push(pedido)
      emVoo += 1
      noAr.push(emVoo)
      // Macrotarefa, e não microtarefa: é o que deixa a onda se formar.
      await new Promise((resolver) => setTimeout(resolver, 0))
      emVoo -= 1
      if (b.ajustes.recusados?.includes(pedido.providerCallSid)) {
        return { ok: false, status: 404, codigo: 'not_found', corpo: { account: IDENTIFICADOR } }
      }
      return { ok: true, status: 200, endpoint: `Calls/${pedido.providerCallSid}.json` }
    },
    async registrarEventoDeIntegracao(evento) {
      eventos.push(evento)
    },
  }

  if (ajustes.comCampanhas) {
    real.pausarCampanhas = async () => {}
  }

  const porta = new Proxy(real, {
    get(alvo, membro, receptor) {
      tocados.push(String(membro))
      return Reflect.get(alvo, membro, receptor) as unknown
    },
  })

  return Object.assign(b, { porta })
}

function pedido(ajustes: Partial<PedidoDaBorda> = {}): PedidoDaBorda {
  return {
    metodo: 'POST',
    acao: 'parar',
    contaId: CONTA,
    motivo: MOTIVO,
    autorizacao: `Bearer ${JWT}`,
    ...ajustes,
  }
}

function pedir(b: Bancada, ajustes: Partial<PedidoDaBorda> = {}, agora = AGORA): Promise<RespostaDoFreio> {
  return atenderFreio(pedido(ajustes), b.porta, { agora })
}

/** Os membros da porta que escrevem ou saem para fora. */
const ESCRITAS = new Set([
  'puxarFreio',
  'soltarFreio',
  'repuxarFreio',
  'marcarCancelamento',
  'registrarAuditoria',
  'encerrarNoProvedor',
  'registrarEventoDeIntegracao',
])

function escritas(b: Bancada): string[] {
  return b.tocados.filter((membro) => ESCRITAS.has(membro))
}

describe('a ordem', () => {
  test('a pausa é a primeira escrita, e nenhuma leitura de chamada vem antes dela', async () => {
    const b = bancada()
    await pedir(b)

    // Antes da gravação, só a sessão e o papel: nada que atrase a parada.
    const ateAGravacao = b.tocados.slice(0, b.tocados.indexOf('puxarFreio') + 1)
    expect(ateAGravacao).toEqual(['usuarioDaSessao', 'papelNaConta', 'puxarFreio'])
    expect(escritas(b)[0]).toBe('puxarFreio')

    const gravacao = b.tocados.indexOf('puxarFreio')
    for (const depois of ['chamadasEmCurso', 'marcarCancelamento', 'encerrarNoProvedor']) {
      expect({ depois, antes: b.tocados.indexOf(depois) > gravacao }).toEqual({ depois, antes: true })
    }
  })

  test('a telefonia só é chamada com a conta já parada', async () => {
    const b = bancada()
    await pedir(b)

    expect(b.freioVistoPelaTelefonia).toHaveLength(3)
    expect(b.freioVistoPelaTelefonia.every((instante) => instante === AGORA)).toBe(true)
  })

  test('a trilha do freio vem logo depois da gravação, antes das chamadas', async () => {
    const b = bancada({ comCampanhas: true })
    await pedir(b)

    // `pausarCampanhas` aparece duas vezes: a pergunta se a porta o tem, e a chamada.
    const inicio = b.tocados.indexOf('puxarFreio')
    expect(b.tocados.slice(inicio, inicio + 5)).toEqual([
      'puxarFreio',
      'registrarAuditoria',
      'pausarCampanhas',
      'pausarCampanhas',
      'chamadasEmCurso',
    ])
  })
})

describe('as chamadas em curso', () => {
  test('cada uma é marcada canceled e encerrada pela telefonia, sem mexer no status', async () => {
    const b = bancada({
      chamadas: [
        chamada(1, { status: 'ringing' }),
        chamada(2),
        chamada(3, { status: 'queued' }),
        // Sem identificador na telefonia: não há o que encerrar lá.
        chamada(4, { status: 'queued', provider_call_sid: null }),
        chamada(5, { status: 'ended', finalized_at: AGORA, end_reason: 'completed' }),
      ],
    })
    const resposta = await pedir(b)

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toMatchObject({
      ok: true,
      estado: 'parada',
      pausadaEm: AGORA,
      encerramentos: { pedidos: 3, jaEmEncerramento: 0, falhas: [] },
    })
    expect(b.encerramentos.map((e) => e.providerCallSid).sort()).toEqual([
      'CA000000000001',
      'CA000000000002',
      'CA000000000003',
    ])
    expect(b.chamadas.map((c) => [c.status, c.end_reason])).toEqual([
      ['ringing', 'canceled'],
      ['in_progress', 'canceled'],
      ['queued', 'canceled'],
      ['queued', null],
      ['ended', 'completed'],
    ])
  })

  test('cada chamada encerrada ganha trilha com o motivo da parada e o rastro de integração', async () => {
    const b = bancada()
    await pedir(b)

    const daChamada = b.trilha.filter((linha) => linha.action === 'call_canceled')
    expect(daChamada).toHaveLength(3)
    for (const linha of daChamada) {
      expect(linha).toMatchObject({
        actor: 'user',
        actor_id: ADMIN,
        target_type: 'calls',
        reason: MOTIVO,
        payload: { origem: 'freio_de_emergencia', efeito: 'encerramento_pedido' },
      })
    }
    expect(b.eventos.map((e) => e.correlation_id).sort()).toEqual(b.chamadas.map((c) => c.id).sort())
  })

  test(`no máximo ${CONCORRENCIA_DOS_ENCERRAMENTOS} encerramentos no ar, e em paralelo de verdade`, async () => {
    const b = bancada({ chamadas: Array.from({ length: 12 }, (_, i) => chamada(i + 1)) })
    await pedir(b)

    expect(b.encerramentos).toHaveLength(12)
    expect(Math.max(...b.noAr)).toBe(CONCORRENCIA_DOS_ENCERRAMENTOS)
  })

  test('a que a telefonia recusou fica marcada, com o erro no corpo, na trilha e no rastro', async () => {
    const b = bancada({ recusados: ['CA000000000002'] })
    const resposta = await pedir(b)

    expect(resposta.corpo).toMatchObject({
      ok: true,
      estado: 'parada',
      encerramentos: {
        pedidos: 2,
        falhas: [{ chamadaId: b.chamadas[1]?.id, motivo: 'provedor_nao_encerrou' }],
      },
    })
    // A marca fica: a recuperação a alcança pela idade e a finalização preserva canceled.
    expect(b.chamadas[1]).toMatchObject({ status: 'in_progress', end_reason: 'canceled' })

    const linha = b.trilha.find((l) => l.target_id === b.chamadas[1]?.id)
    expect(linha?.payload).toMatchObject({ efeito: 'encerramento_falhou', falha: 'provedor_nao_encerrou' })
    const evento = b.eventos.find((e) => e.correlation_id === b.chamadas[1]?.id)
    expect(evento).toMatchObject({ status_code: 404, response: { ok: false } })
  })

  test('sem credencial da telefonia a conta para do mesmo jeito, e as chamadas ficam registradas', async () => {
    const b = bancada({ semCredencial: true })
    const resposta = await pedir(b)

    expect(b.conta.dialing_paused_at).toBe(AGORA)
    expect(b.encerramentos).toEqual([])
    expect(resposta.corpo).toMatchObject({ ok: true, estado: 'parada', encerramentos: { pedidos: 0 } })
    const falhas = (resposta.corpo as unknown as { encerramentos: { falhas: { motivo: string }[] } }).encerramentos.falhas
    expect(falhas.map((f) => f.motivo)).toEqual([
      'credencial_indisponivel',
      'credencial_indisponivel',
      'credencial_indisponivel',
    ])
    expect(b.chamadas.every((c) => c.end_reason === 'canceled')).toBe(true)
  })

  test('a credencial da telefonia não sai no corpo, nem no caso da recusa com eco', async () => {
    const b = bancada({ recusados: ['CA000000000001', 'CA000000000002', 'CA000000000003'] })
    const resposta = await pedir(b)

    const serializado = JSON.stringify(resposta.corpo)
    expect(serializado).not.toContain(IDENTIFICADOR)
    expect(serializado).not.toContain(TOKEN)
  })
})

describe('idempotência', () => {
  test('acionar duas vezes não move o carimbo nem encerra a mesma chamada de novo', async () => {
    const b = bancada()
    await pedir(b)
    expect(b.encerramentos).toHaveLength(3)
    const trilhaDepoisDaPrimeira = b.trilha.length

    b.tocados.length = 0
    const segunda = await pedir(b, {}, DEPOIS)

    expect(segunda.corpo).toMatchObject({
      ok: true,
      estado: 'ja_parada',
      pausadaEm: AGORA,
      encerramentos: { pedidos: 0, jaEmEncerramento: 0, falhas: [] },
    })
    expect(b.conta.dialing_paused_at).toBe(AGORA)
    expect(b.encerramentos).toHaveLength(3)
    expect(b.trilha).toHaveLength(trilhaDepoisDaPrimeira)
    // A tentativa de gravar existe, e não casou: é a condição que segura o carimbo.
    expect(escritas(b)).toEqual(['puxarFreio'])
  })

  test('o segundo acionamento alcança a chamada que entrou no ar depois do primeiro', async () => {
    const b = bancada()
    await pedir(b)

    b.chamadas.push(chamada(9))
    await pedir(b, {}, DEPOIS)

    expect(b.encerramentos.map((e) => e.providerCallSid)).toHaveLength(4)
    expect(b.encerramentos.at(-1)?.providerCallSid).toBe('CA000000000009')
  })

  test('chamada finalizada entre a leitura e a marca não é encerrada', async () => {
    const b = bancada({ chamadas: [chamada(1)] })
    const marcar = b.porta.marcarCancelamento.bind(b.porta)
    b.porta.marcarCancelamento = async (id) => {
      const alvo = b.chamadas.find((c) => c.id === id)
      if (alvo) Object.assign(alvo, { status: 'ended', finalized_at: AGORA, end_reason: 'completed' })
      return marcar(id)
    }
    const resposta = await pedir(b)

    expect(resposta.corpo).toMatchObject({ encerramentos: { pedidos: 0, jaEmEncerramento: 1 } })
    expect(b.encerramentos).toEqual([])
    expect(b.chamadas[0]).toMatchObject({ status: 'ended', end_reason: 'completed' })
  })
})

describe('auditoria', () => {
  test('parar grava audit_log com autor, alvo e motivo', async () => {
    const b = bancada({ chamadas: [] })
    await pedir(b)

    expect(b.trilha).toEqual([
      {
        account_id: CONTA,
        actor: 'user',
        actor_id: ADMIN,
        source: 'edge:emergency-stop',
        action: 'dialing_paused',
        target_type: 'accounts',
        target_id: CONTA,
        reason: MOTIVO,
        payload: { pausada_em: AGORA },
      },
    ])
    expect(b.conta).toEqual({ dialing_paused_at: AGORA, dialing_paused_by: ADMIN, dialing_paused_reason: MOTIVO })
  })

  test('trilha que falha não solta o freio, e o corpo diz que ficou sem registro', async () => {
    const b = bancada({ trilhaFalha: true })
    const resposta = await pedir(b)

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toMatchObject({ ok: true, estado: 'parada', semRegistro: true })
    expect(b.conta.dialing_paused_at).toBe(AGORA)
    expect(b.tocados).not.toContain('soltarFreio')
    expect(b.encerramentos).toHaveLength(3)
  })

  test('retomar grava audit_log com autor, motivo e o freio que foi solto', async () => {
    const b = bancada({
      freio: { dialing_paused_at: AGORA, dialing_paused_by: ADMIN, dialing_paused_reason: MOTIVO },
    })
    const resposta = await pedir(b, { acao: 'retomar', motivo: 'Roteiro corrigido e ouvido' }, DEPOIS)

    expect(resposta.corpo).toMatchObject({ ok: true, estado: 'retomada' })
    expect(b.conta).toEqual({ dialing_paused_at: null, dialing_paused_by: null, dialing_paused_reason: null })
    expect(b.trilha).toEqual([
      {
        account_id: CONTA,
        actor: 'user',
        actor_id: ADMIN,
        source: 'edge:emergency-stop',
        action: 'dialing_resumed',
        target_type: 'accounts',
        target_id: CONTA,
        reason: 'Roteiro corrigido e ouvido',
        payload: { pausada_em: AGORA, pausada_por: ADMIN, motivo_da_parada: MOTIVO },
      },
    ])
  })

  test('retomada cuja trilha falha devolve o freio', async () => {
    const b = bancada({
      freio: { dialing_paused_at: AGORA, dialing_paused_by: ADMIN, dialing_paused_reason: MOTIVO },
      trilhaFalha: true,
    })
    const resposta = await pedir(b, { acao: 'retomar' }, DEPOIS)

    expect(resposta.status).toBe(500)
    expect(b.conta).toEqual({ dialing_paused_at: AGORA, dialing_paused_by: ADMIN, dialing_paused_reason: MOTIVO })
  })
})

describe('retomar', () => {
  const PARADA = { dialing_paused_at: AGORA, dialing_paused_by: ADMIN, dialing_paused_reason: MOTIVO }

  test.each(['operator', 'viewer'])('%s não retoma, e a conta não é tocada', async (papel) => {
    const b = bancada({ freio: PARADA, papel })
    const resposta = await pedir(b, { acao: 'retomar' })

    expect(resposta.status).toBe(403)
    expect(resposta.corpo).toMatchObject({ ok: false, motivo: 'papel_insuficiente' })
    expect(escritas(b)).toEqual([])
    expect(b.conta.dialing_paused_at).toBe(AGORA)
  })

  test('dono retoma', async () => {
    const b = bancada({ freio: PARADA, papel: 'owner' })
    const resposta = await pedir(b, { acao: 'retomar' })

    expect(resposta.corpo).toMatchObject({ ok: true, estado: 'retomada' })
  })

  test('retomar conta que já opera devolve o estado, sem escrita', async () => {
    const b = bancada()
    const resposta = await pedir(b, { acao: 'retomar' })

    expect(resposta.corpo).toMatchObject({ ok: true, estado: 'ja_operando' })
    expect(escritas(b)).toEqual([])
  })

  test('retomar não toca em chamada nem na telefonia', async () => {
    const b = bancada({ freio: PARADA })
    await pedir(b, { acao: 'retomar' })

    expect(b.tocados).not.toContain('chamadasEmCurso')
    expect(b.tocados).not.toContain('encerrarNoProvedor')
  })
})

describe('o portão do pedido', () => {
  test.each(['operator', 'viewer'])('%s não para a conta, e a gravação nem é tentada', async (papel) => {
    const b = bancada({ papel })
    const resposta = await pedir(b)

    expect(resposta.status).toBe(403)
    expect(escritas(b)).toEqual([])
    expect(b.conta.dialing_paused_at).toBeNull()
  })

  test('quem não é membro recebe o mesmo 404 da conta que não existe', async () => {
    const naoMembro = await pedir(bancada({ papel: null }))
    const inexistente = await pedir(bancada(), { contaId: CONTA_VIZINHA })

    expect(naoMembro.status).toBe(404)
    expect(JSON.stringify(naoMembro)).toBe(JSON.stringify(inexistente))
  })

  test.each([
    ['sem motivo', { motivo: null }, 'motivo_obrigatorio'],
    ['motivo em branco', { motivo: '   ' }, 'motivo_obrigatorio'],
    ['sem ação', { acao: null }, 'acao_invalida'],
    ['ação desconhecida', { acao: 'pausar_um_pouco' }, 'acao_invalida'],
    ['conta torta', { contaId: 'conta-1' }, 'conta_invalida'],
    ['sem sessão', { autorizacao: null }, 'sem_sessao'],
    ['sessão desconhecida', { autorizacao: 'Bearer outro' }, 'sessao_invalida'],
    ['GET', { metodo: 'GET' }, 'metodo_invalido'],
  ] as const)('%s é recusado sem escrita', async (_caso, ajuste, motivo) => {
    const b = bancada()
    const resposta = await pedir(b, ajuste)

    expect(resposta.corpo).toMatchObject({ ok: false, motivo })
    expect(escritas(b)).toEqual([])
  })

  test('porta que levanta vira falha_interna, sem mensagem de fora no corpo', async () => {
    const b = bancada()
    b.porta.puxarFreio = async () => {
      throw new Error('connection refused: 10.0.0.3')
    }
    const resposta = await pedir(b)

    expect(resposta.status).toBe(500)
    expect(JSON.stringify(resposta.corpo)).not.toContain('10.0.0.3')
  })
})

describe('o orçamento do que é nosso (tráfego real é do degrau 3)', () => {
  test('pausa gravada em até 200 ms e os encerramentos de 10 chamadas disparados em até 2 s', async () => {
    const b = bancada({ chamadas: Array.from({ length: 10 }, (_, i) => chamada(i + 1)) })
    const inicio = performance.now()
    await pedir(b)

    expect(b.instantes.puxarFreio).toBeDefined()
    expect((b.instantes.puxarFreio ?? Infinity) - inicio).toBeLessThan(200)
    expect(b.instantes.encerramentos).toHaveLength(10)
    expect(Math.max(...b.instantes.encerramentos) - inicio).toBeLessThan(2_000)
  })
})
