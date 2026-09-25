import { describe, expect, test } from 'vitest'

import { agente, configuracaoDasConversas, FERRAMENTA_RECUSADA, PODE_SIM_E_DESLIGA, ERRO_DO_MODELO } from './conversas-de-exemplo.ts'
import { lerAgenteDoProvedor, lerConfiguracaoDasConversas, lerConversaDoProvedor } from './formato-do-provedor.ts'

describe('a conversa (C1 a C7)', () => {
  test('lê turnos com texto, invocações com o resultado casado por request_id, e o motivo cru', () => {
    const lida = lerConversaDoProvedor(PODE_SIM_E_DESLIGA)
    expect(lida?.turnos.map((turno) => [turno.quem, turno.texto])).toEqual([
      ['agent', 'Oi, Marcos! Aqui é a Sarah, da Fluxo. Posso falar rapidinho sobre a frota de vocês?'],
      ['lead', 'Pode sim.'],
    ])
    expect(lida?.invocacoes).toEqual([
      { nome: 'end_call', segundo: 8, parametros: { reason: 'O lead confirmou.' }, resultado: 'ok', comErro: false, semResultado: false },
    ])
    expect(lida?.motivoDoFim).toBe('end_call tool was called.')
    expect(lida?.variaveis).toMatchObject({ call_id: '11111111-1111-4111-8111-111111111111' })
    expect(lida?.telefone).toEqual({ direcao: 'outbound', numeroExterno: '+5548999998888', callSid: 'CA0001' })
  })

  test('o resultado que chega num turno seguinte ainda casa com o pedido', () => {
    const lida = lerConversaDoProvedor(FERRAMENTA_RECUSADA)
    expect(lida?.invocacoes[0]).toMatchObject({ nome: 'tool-dnc', comErro: true, resultado: '401 Unauthorized' })
  })

  test('o erro do provedor vem com código e razão (C4)', () => {
    expect(lerConversaDoProvedor(ERRO_DO_MODELO)?.erro).toEqual({ codigo: '1011', razao: 'LLM request failed: quota exceeded' })
  })

  test('campo torto é ausente, e nunca derruba a leitura', () => {
    const lida = lerConversaDoProvedor({
      status: 3,
      transcript: [null, { role: 'robo', message: 'x' }, { role: 'user', message: '  ' }, { role: 'agent', message: 'Oi', tool_calls: 'x' }],
      metadata: { error: {}, call_duration_secs: '9' },
    })
    expect(lida).toMatchObject({ status: null, erro: null, duracaoSeg: null, variaveis: null, telefone: null })
    expect(lida?.turnos).toEqual([{ quem: 'agent', texto: 'Oi', segundo: 0 }])
    expect(lerConversaDoProvedor('nada')).toBeNull()
  })
})

describe('o agente vivo (A1 a A3)', () => {
  test('lê primeira fala, idioma, voz, turno, duração, ferramentas e a chave do aviso de início', () => {
    const lido = lerAgenteDoProvedor(agente())
    expect(lido).toMatchObject({
      primeiraFala: 'Oi! Aqui é a Sarah, da Fluxo. Tudo bem?',
      idioma: 'pt',
      llm: 'gemini-2.5-flash',
      vozId: 'voz_marina',
      ajustesDeVoz: { stability: 0.5, speed: 1 },
      tempoDeTurnoSeg: 7,
      silencioParaEncerrarSeg: -1,
      duracaoMaximaSeg: 600,
      webhookDeInicioLigado: true,
      primeiraFalaSobreponivel: true,
      ferramentasPorReferencia: 0,
    })
    expect(lido?.ferramentas).toContain('end_call')
  })

  test('ajuste de voz aninhado em voice_settings também é lido, e o do tts vence', () => {
    const corpo = agente()
    const tts = (corpo.conversation_config as { tts: Record<string, unknown> }).tts
    tts.voice_settings = { stability: 0.9, similarity_boost: 0.8 }
    expect(lerAgenteDoProvedor(corpo)?.ajustesDeVoz).toEqual({ stability: 0.5, similarity_boost: 0.8, speed: 1 })
  })

  test('ferramentas de sistema em built_in_tools entram pelo nome, e tool_ids sem nome são contadas', () => {
    const corpo = agente({ tools: [], toolIds: ['t1', 't2'] })
    const prompt = (corpo.conversation_config as { agent: { prompt: Record<string, unknown> } }).agent.prompt
    prompt.built_in_tools = { end_call: { name: 'end_call' }, language_detection: null, skip_turn: {} }
    const lido = lerAgenteDoProvedor(corpo)
    expect(lido?.ferramentas).toEqual(['end_call', 'skip_turn'])
    expect(lido?.ferramentasPorReferencia).toBe(2)
  })
})

describe('a configuração das conversas (W1)', () => {
  test('lê os dois avisos, e a ausência como nulo', () => {
    expect(lerConfiguracaoDasConversas(configuracaoDasConversas())).toEqual({
      inicioUrl: 'https://exemplo.supabase.co/functions/v1/call-init?conta=a',
      posChamadaId: 'wh_fim_1',
    })
    expect(lerConfiguracaoDasConversas({})).toEqual({ inicioUrl: null, posChamadaId: null })
  })
})
