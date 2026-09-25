// Provas do webhook de fim. Ambiente node, sem rede e sem banco: a porta é um
// `Proxy` que registra todo membro tocado, na ordem.
//
// O que este arquivo segura:
//
// 1. **O aviso aciona `call-finalize` e não finaliza nada.** A porta não tem
//    método de escrita de desfecho, e o registro mostra só resolver, acionar e
//    rastrear.
// 2. **Os três 401 são idênticos e não tocam a porta**: ausente, malformada e
//    inválida saem com o mesmo status e o mesmo corpo, e o registro vazio.
// 3. **A janela de rotação** (R-07): o segredo anterior vale dentro das 24 h e
//    não vale depois.
// 4. **O aviso repetido aciona de novo sem decidir nada**: o segundo pedido faz
//    exatamente o que o primeiro fez. Quem garante uma finalização só é a
//    reivindicação de `call-finalize` (US-069), e não este webhook.
// 5. **Conversa desconhecida devolve 200**, registra o aviso e não aciona nada.
// 6. **O rastro** vai para `integration_events` com `correlation_id` igual ao
//    `call_id`, sem a transcrição dentro.

import { describe, expect, test } from 'vitest'

import {
  cabecalhoAssinado,
  JANELA_DE_ROTACAO_EM_SEGUNDOS,
} from '../_shared/provedor/assinatura-de-webhook.ts'

import {
  ENDPOINT_DO_AVISO,
  receberAviso,
  type AvisoSemChamada,
  type ChamadaDoAviso,
  type EventoDeIntegracao,
  type OpcoesDoFim,
  type PortaDoAviso,
  type RespostaDoFim,
} from './eventos.ts'

const SEGREDO = 'segredo-de-webhook-desta-instalacao'
const ANTERIOR = 'segredo-de-antes-da-rotacao'
const AGORA = 1_774_000_000

const CONTA = '11111111-1111-4111-8111-111111111111'
const CHAMADA = '22222222-2222-4222-8222-222222222222'
const CONVERSA = 'conv_de_teste_0001'
const SID = 'CA0000000000000000000000000000beef'

/** Uma fala improvável e presente: é ela que não pode aparecer no rastro. */
const FALA_DO_LEAD = 'meu CPF é 123 e moro na rua das Acácias'

function corpoDoAviso(ajustes: { conversa?: string | null; sid?: string | null } = {}): string {
  const conversa = ajustes.conversa === undefined ? CONVERSA : ajustes.conversa
  const sid = ajustes.sid === undefined ? SID : ajustes.sid
  return JSON.stringify({
    type: 'post_call_transcription',
    event_timestamp: AGORA,
    data: {
      agent_id: 'agent_discovery_0001',
      conversation_id: conversa,
      status: 'done',
      transcript: [{ role: 'user', message: FALA_DO_LEAD }],
      metadata: { phone_call: { call_sid: sid } },
    },
  })
}

interface Bancada {
  readonly porta: PortaDoAviso
  readonly tocados: string[]
  readonly acionadas: string[]
  readonly eventos: EventoDeIntegracao[]
  readonly semChamada: AvisoSemChamada[]
}

function bancada(
  ajustes: {
    porConversa?: ChamadaDoAviso | null
    porTelefonia?: ChamadaDoAviso | null
    finalizacaoFalha?: boolean
    rastroFalha?: boolean
    /** Os segredos de webhook guardados no cofre, por conta. */
    segredosDasContas?: ReadonlyMap<string, string>
    cofreFalha?: boolean
  } = {},
): Bancada {
  const chamada: ChamadaDoAviso = { id: CHAMADA, account_id: CONTA }
  const tocados: string[] = []
  const acionadas: string[] = []
  const eventos: EventoDeIntegracao[] = []
  const semChamada: AvisoSemChamada[] = []

  const real: PortaDoAviso = {
    async segredoDoWebhookDaConta(contaId) {
      if (ajustes.cofreFalha) throw new Error('cofre fora do ar')
      return ajustes.segredosDasContas?.get(contaId) ?? null
    },
    async chamadaPelaConversa(conversaId) {
      if (ajustes.porConversa !== undefined) return ajustes.porConversa
      return conversaId === CONVERSA ? chamada : null
    },
    async chamadaPelaTelefonia(sid) {
      if (ajustes.porTelefonia !== undefined) return ajustes.porTelefonia
      return sid === SID ? chamada : null
    },
    async acionarFinalizacao(chamadaId) {
      if (ajustes.finalizacaoFalha) throw new Error('call-finalize fora do ar')
      acionadas.push(chamadaId)
    },
    async registrarEventoDeIntegracao(evento) {
      if (ajustes.rastroFalha) throw new Error('banco fora do ar')
      eventos.push(evento)
    },
    async registrarAvisoSemChamada(aviso) {
      semChamada.push(aviso)
    },
  }

  const porta = new Proxy(real, {
    get(alvo, membro, receptor) {
      tocados.push(String(membro))
      return Reflect.get(alvo, membro, receptor) as unknown
    },
  })

  return { porta, tocados, acionadas, eventos, semChamada }
}

const OPCOES: OpcoesDoFim = {
  segredoDoWebhook: SEGREDO,
  segredoAnterior: null,
  rotacionadoEmSegundos: null,
  agoraEmSegundos: AGORA,
}

async function avisar(
  b: Bancada,
  ajustes: {
    corpo?: string
    assinatura?: string | null
    segredoDeQuemAssina?: string
    opcoes?: Partial<OpcoesDoFim>
    metodo?: string
    conta?: string | null
  } = {},
): Promise<RespostaDoFim> {
  const opcoes = { ...OPCOES, ...ajustes.opcoes }
  const corpo = ajustes.corpo ?? corpoDoAviso()
  const assinatura =
    ajustes.assinatura !== undefined
      ? ajustes.assinatura
      : await cabecalhoAssinado(ajustes.segredoDeQuemAssina ?? SEGREDO, opcoes.agoraEmSegundos, corpo)
  return await receberAviso(
    { metodo: ajustes.metodo ?? 'POST', corpo, assinatura, contaDoEndereco: ajustes.conta ?? null },
    b.porta,
    opcoes,
  )
}

describe('o acionamento da finalização', () => {
  test('o aviso assinado aciona call-finalize com o call_id e devolve 200', async () => {
    const b = bancada()
    const resposta = await avisar(b)

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({ ok: true, chamadaId: CHAMADA, desfecho: 'finalizacao_acionada' })
    expect(b.acionadas).toEqual([CHAMADA])
  })

  test('não finaliza ele mesmo: só resolve, aciona e rastreia', async () => {
    const b = bancada()
    await avisar(b)
    expect(b.tocados).toEqual([
      'chamadaPelaConversa',
      'acionarFinalizacao',
      'registrarEventoDeIntegracao',
    ])
  })

  test('sem conversa conhecida, resolve pela chamada da telefonia', async () => {
    const b = bancada({ porConversa: null })
    const resposta = await avisar(b)
    expect(resposta.status).toBe(200)
    expect(b.acionadas).toEqual([CHAMADA])
    expect(b.tocados.slice(0, 2)).toEqual(['chamadaPelaConversa', 'chamadaPelaTelefonia'])
  })

  test('aviso sem conversa nenhuma também resolve pela telefonia', async () => {
    const b = bancada()
    await avisar(b, { corpo: corpoDoAviso({ conversa: null }) })
    expect(b.acionadas).toEqual([CHAMADA])
    expect(b.tocados[0]).toBe('chamadaPelaTelefonia')
  })

  test('finalização fora do ar devolve 503, para o provedor reenviar, e rastreia o 503', async () => {
    const b = bancada({ finalizacaoFalha: true })
    const resposta = await avisar(b)
    expect(resposta.status).toBe(503)
    expect(resposta.corpo.ok).toBe(false)
    expect(b.eventos.map((evento) => evento.status_code)).toEqual([503])
  })

  test('rastro que não grava não derruba o aviso', async () => {
    const b = bancada({ rastroFalha: true })
    const resposta = await avisar(b)
    expect(resposta.status).toBe(200)
    expect(b.acionadas).toEqual([CHAMADA])
  })
})

describe('os três 401', () => {
  const casos: ReadonlyArray<readonly [string, string | null]> = [
    ['ausente', null],
    ['malformada', 'nem parece assinatura'],
    ['inválida', `t=${AGORA},v0=${'d'.repeat(64)}`],
  ]

  test.each(casos)('assinatura %s recusa com 401 sem tocar na porta', async (_nome, assinatura) => {
    const b = bancada()
    const resposta = await avisar(b, { assinatura })
    expect(resposta.status).toBe(401)
    expect(b.tocados).toEqual([])
    expect(b.acionadas).toEqual([])
  })

  test('os três saem com resposta idêntica', async () => {
    const respostas = await Promise.all(
      casos.map(async ([, assinatura]) => await avisar(bancada(), { assinatura })),
    )
    const [primeira, ...demais] = respostas
    for (const resposta of demais) expect(resposta).toEqual(primeira)
  })

  test('assinatura fora da tolerância de relógio também é o mesmo 401', async () => {
    const b = bancada()
    const corpo = corpoDoAviso()
    const velha = await cabecalhoAssinado(SEGREDO, AGORA - 3600, corpo)
    const resposta = await avisar(b, { corpo, assinatura: velha })
    expect(resposta).toEqual(await avisar(bancada(), { assinatura: null }))
    expect(b.tocados).toEqual([])
  })

  test('segredo da instalação ausente recusa até a assinatura certa', async () => {
    const b = bancada()
    const resposta = await avisar(b, { opcoes: { segredoDoWebhook: null } })
    expect(resposta.status).toBe(401)
    expect(b.tocados).toEqual([])
  })
})

describe('a janela de rotação dos dois segredos (R-07)', () => {
  const ROTACIONADO_EM = AGORA - 60 * 60

  function durante(agora: number): Partial<OpcoesDoFim> {
    return { segredoAnterior: ANTERIOR, rotacionadoEmSegundos: ROTACIONADO_EM, agoraEmSegundos: agora }
  }

  test('o segredo anterior ainda vale dentro das 24 h', async () => {
    const b = bancada()
    const resposta = await avisar(b, { segredoDeQuemAssina: ANTERIOR, opcoes: durante(AGORA) })
    expect(resposta.status).toBe(200)
    expect(b.acionadas).toEqual([CHAMADA])
  })

  test('e não vale depois delas', async () => {
    const depois = ROTACIONADO_EM + JANELA_DE_ROTACAO_EM_SEGUNDOS + 1
    const b = bancada()
    const resposta = await avisar(b, { segredoDeQuemAssina: ANTERIOR, opcoes: durante(depois) })
    expect(resposta.status).toBe(401)
    expect(b.tocados).toEqual([])
  })

  test('o segredo atual vale durante a janela', async () => {
    const b = bancada()
    const resposta = await avisar(b, { opcoes: durante(AGORA) })
    expect(resposta.status).toBe(200)
  })
})

describe('o aviso repetido', () => {
  test('aciona a finalização de novo, fazendo exatamente o que o primeiro fez', async () => {
    const b = bancada()
    const corpo = corpoDoAviso()
    const primeira = await avisar(b, { corpo })
    const tocadosNaPrimeira = [...b.tocados]
    const segunda = await avisar(b, { corpo })

    expect(segunda).toEqual(primeira)
    // Nenhuma pergunta a mais no segundo: quem decide que só um finaliza é a
    // reivindicação de call-finalize, e não uma leitura aqui.
    expect(b.tocados).toEqual([...tocadosNaPrimeira, ...tocadosNaPrimeira])
    expect(b.acionadas).toEqual([CHAMADA, CHAMADA])
  })
})

describe('a conversa desconhecida', () => {
  test('devolve 200, registra o aviso e não aciona nada', async () => {
    const b = bancada({ porConversa: null, porTelefonia: null })
    const resposta = await avisar(b)

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({ ok: true, chamadaId: null, desfecho: 'conversa_desconhecida' })
    expect(b.acionadas).toEqual([])
    expect(b.eventos).toEqual([])
    expect(b.semChamada).toEqual([
      { tipo: 'post_call_transcription', conversaId: CONVERSA, chamadaDaTelefoniaId: SID },
    ])
  })

  test('aviso sem identificador nenhum também é 200', async () => {
    const b = bancada()
    const resposta = await avisar(b, { corpo: corpoDoAviso({ conversa: null, sid: null }) })
    expect(resposta.status).toBe(200)
    expect(b.acionadas).toEqual([])
    expect(b.tocados).toEqual(['registrarAvisoSemChamada'])
  })
})

describe('o rastro em integration_events', () => {
  test('cada aviso recebido vira uma linha com correlation_id igual ao call_id', async () => {
    const b = bancada()
    await avisar(b)
    await avisar(b)

    expect(b.eventos).toHaveLength(2)
    for (const evento of b.eventos) {
      expect(evento).toMatchObject({
        account_id: CONTA,
        direction: 'inbound',
        endpoint: ENDPOINT_DO_AVISO,
        status_code: 200,
        correlation_id: CHAMADA,
      })
      expect(evento.request).toMatchObject({ conversation_id: CONVERSA, call_sid: SID })
    }
  })

  test('a transcrição não entra no rastro', async () => {
    const b = bancada()
    await avisar(b)
    expect(JSON.stringify(b.eventos)).not.toContain(FALA_DO_LEAD)
  })
})

describe('o resto da porta de entrada', () => {
  test('método que não é POST é 405 sem tocar na porta', async () => {
    const b = bancada()
    const resposta = await avisar(b, { metodo: 'GET' })
    expect(resposta.status).toBe(405)
    expect(b.tocados).toEqual([])
  })

  test('corpo assinado que não é JSON é 400', async () => {
    const b = bancada()
    const resposta = await avisar(b, { corpo: 'não é json' })
    expect(resposta.status).toBe(400)
    expect(b.tocados).toEqual([])
  })
})

describe('o segredo da conta (?conta=)', () => {
  const SEGREDO_DA_CONTA = 'wsec_segredo-que-a-elevenlabs-devolveu'
  const OUTRA_CONTA = '99999999-9999-4999-8999-999999999999'
  const COFRE = new Map([
    [CONTA, SEGREDO_DA_CONTA],
    [OUTRA_CONTA, 'wsec_segredo-da-outra-conta'],
  ])

  test('assinado com o segredo da conta, aciona a finalização da chamada dela', async () => {
    const b = bancada({ segredosDasContas: COFRE })
    const resposta = await avisar(b, { conta: CONTA, segredoDeQuemAssina: SEGREDO_DA_CONTA })
    expect(resposta.status).toBe(200)
    expect(b.acionadas).toEqual([CHAMADA])
    expect(b.tocados[0]).toBe('segredoDoWebhookDaConta')
  })

  test('errado, ausente, de outra conta e conta inexistente: o mesmo 401', async () => {
    const casos = [
      { conta: CONTA, segredoDeQuemAssina: 'wsec_outro-qualquer' },
      { conta: CONTA, assinatura: null },
      { conta: CONTA, assinatura: 'nem parece assinatura' },
      { conta: OUTRA_CONTA, segredoDeQuemAssina: SEGREDO_DA_CONTA },
      { conta: '88888888-8888-4888-8888-888888888888', segredoDeQuemAssina: SEGREDO_DA_CONTA },
    ]
    const respostas: RespostaDoFim[] = []
    for (const caso of casos) {
      const b = bancada({ segredosDasContas: COFRE })
      respostas.push(await avisar(b, caso))
      expect(b.acionadas).toEqual([])
      // Só o cofre pode ter sido lido: nenhuma chamada foi procurada.
      expect(b.tocados.filter((membro) => membro !== 'segredoDoWebhookDaConta')).toEqual([])
    }
    expect(respostas[0]?.status).toBe(401)
    for (const resposta of respostas) expect(resposta).toEqual(respostas[0])
  })

  test('cabeçalho sem a forma da receita não chega nem ao cofre', async () => {
    const b = bancada({ segredosDasContas: COFRE })
    await avisar(b, { conta: CONTA, assinatura: 't=abc,v0=zz' })
    expect(b.tocados).toEqual([])
  })

  test('o segredo de uma conta não aciona a chamada de outra: é a conversa desconhecida', async () => {
    const b = bancada({
      segredosDasContas: COFRE,
      porConversa: { id: CHAMADA, account_id: OUTRA_CONTA },
    })
    const resposta = await avisar(b, { conta: CONTA, segredoDeQuemAssina: SEGREDO_DA_CONTA })
    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toMatchObject({ ok: true, chamadaId: null, desfecho: 'conversa_desconhecida' })
    expect(b.acionadas).toEqual([])
  })

  test('o segredo da instalação continua valendo com a conta no endereço', async () => {
    const b = bancada({ segredosDasContas: COFRE })
    const resposta = await avisar(b, { conta: CONTA })
    expect(resposta.status).toBe(200)
    expect(b.acionadas).toEqual([CHAMADA])
  })

  test('cofre fora do ar com assinatura que a instalação não reconhece é 503, para o provedor reenviar', async () => {
    const b = bancada({ cofreFalha: true })
    const resposta = await avisar(b, { conta: CONTA, segredoDeQuemAssina: SEGREDO_DA_CONTA })
    expect(resposta.status).toBe(503)
    expect(b.acionadas).toEqual([])
  })
})
