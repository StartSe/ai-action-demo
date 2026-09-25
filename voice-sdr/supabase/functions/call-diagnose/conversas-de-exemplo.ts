// Corpos de exemplo da ElevenLabs para o diagnóstico. Módulo de dado, sem
// `vitest` dentro: é lido pelos testes da borda e pelo dublê da interface, que
// atende a análise pelo mesmo código da borda.
//
// **Escritos à mão, segundo as suposições de `formato-do-provedor.ts`** (C1 a
// C7, A1 a A3, W1), e não copiados de uma conversa real: a conferência contra o
// provedor é do degrau 3. Quando uma conversa real chegar, ela entra aqui ao
// lado, e a fixture à mão continua como o caso que descreve.
//
// Cada cenário é um caso que o dono já viveu ou que as regras precisam
// reconhecer. `pode_sim_e_desliga` é o da ligação de teste que motivou esta
// borda: a Sarah fala a primeira fala, o dono responde "Pode sim" e a própria
// Sarah chama `end_call`.

export const CONVERSA_DE_EXEMPLO = 'conv_01jexemplo'
export const AGENTE_DE_EXEMPLO = 'agent_01jexemplo'

/** O início das conversas de exemplo, em segundos Unix: 2026-09-24T13:00:00Z. */
export const INICIO_EM_SEGUNDOS = 1_790_254_800

type Turno = Record<string, unknown>

function turno(role: 'agent' | 'user', message: string, segundo: number, extra: Turno = {}): Turno {
  return { role, message, time_in_call_secs: segundo, tool_calls: [], tool_results: [], ...extra }
}

/** Uma conversa no formato C1, com o que o cenário mudar por cima. */
export function conversa(sobre: {
  status?: string
  transcript?: readonly Turno[]
  metadata?: Record<string, unknown>
  inicio?: Record<string, unknown> | null
  agentId?: string
}): Record<string, unknown> {
  return {
    agent_id: sobre.agentId ?? AGENTE_DE_EXEMPLO,
    conversation_id: CONVERSA_DE_EXEMPLO,
    status: sobre.status ?? 'done',
    transcript: sobre.transcript ?? [],
    metadata: {
      start_time_unix_secs: INICIO_EM_SEGUNDOS,
      call_duration_secs: 14,
      termination_reason: 'Call ended by remote party',
      error: null,
      phone_call: { direction: 'outbound', external_number: '+5548999998888', call_sid: 'CA0001' },
      ...sobre.metadata,
    },
    analysis: { call_successful: 'unknown', transcript_summary: 'Ligação curta.' },
    ...(sobre.inicio === null
      ? {}
      : {
          conversation_initiation_client_data: sobre.inicio ?? {
            dynamic_variables: {
              call_id: '11111111-1111-4111-8111-111111111111',
              system__conversation_id: CONVERSA_DE_EXEMPLO,
              system__agent_id: AGENTE_DE_EXEMPLO,
            },
            conversation_config_override: { agent: { first_message: 'Oi, Marcos! Aqui é a Sarah, da Fluxo. Tudo bem?' } },
          },
        }),
    has_audio: true,
  }
}

const ABERTURA = turno('agent', 'Oi, Marcos! Aqui é a Sarah, da Fluxo. Posso falar rapidinho sobre a frota de vocês?', 0)

/** A ligação de teste do dono: "Pode sim" e a Sarah encerra. */
export const PODE_SIM_E_DESLIGA = conversa({
  transcript: [
    ABERTURA,
    turno('user', 'Pode sim.', 6),
    turno('agent', '', 8, {
      tool_calls: [
        { request_id: 'req_1', tool_name: 'end_call', params_as_json: JSON.stringify({ reason: 'O lead confirmou.' }) },
      ],
      tool_results: [{ request_id: 'req_1', tool_name: 'end_call', result_value: 'ok', is_error: false }],
    }),
  ],
  metadata: { call_duration_secs: 9, termination_reason: 'end_call tool was called.' },
})

/** Caiu por erro do modelo de linguagem do agente (C4). */
export const ERRO_DO_MODELO = conversa({
  status: 'failed',
  transcript: [ABERTURA, turno('user', 'Pode sim.', 6)],
  metadata: {
    call_duration_secs: 11,
    termination_reason: 'LLM error',
    error: { code: 1011, reason: 'LLM request failed: quota exceeded' },
  },
})

/** O webhook de início não respondeu: a conversa começou sem `call_id` (C6). */
export const WEBHOOK_DE_INICIO_FALHO = conversa({
  transcript: [
    turno('agent', 'Oi, {nome_do_lead}! Aqui é a Sarah.', 0),
    turno('user', 'Oi?', 4),
  ],
  metadata: { call_duration_secs: 7, termination_reason: 'Call ended by remote party' },
  inicio: {
    dynamic_variables: { system__conversation_id: CONVERSA_DE_EXEMPLO, system__agent_id: AGENTE_DE_EXEMPLO },
  },
})

/** Ferramenta nossa recusada com 401 no meio da ligação (C2). */
export const FERRAMENTA_RECUSADA = conversa({
  transcript: [
    ABERTURA,
    turno('user', 'Pode sim, mas não quero mais ligação.', 5),
    turno('agent', 'Entendi, vou tirar seu número.', 7, {
      tool_calls: [{ request_id: 'req_9', tool_name: 'tool-dnc', params_as_json: '{"motivo":"pedido do lead"}' }],
    }),
    turno('agent', 'Pronto.', 9, {
      tool_results: [{ request_id: 'req_9', tool_name: 'tool-dnc', result_value: '401 Unauthorized', is_error: true }],
    }),
    turno('user', 'Obrigado.', 11),
    turno('user', 'Tchau.', 12),
    turno('user', 'Tchau mesmo.', 13),
  ],
  metadata: { call_duration_secs: 14, termination_reason: 'Call ended by remote party' },
})

/** Uma conversa boa, que nenhuma regra de erro deve acusar. */
export const CONVERSA_BOA = conversa({
  transcript: [
    ABERTURA,
    turno('user', 'Pode sim.', 5),
    turno('agent', 'Quantos caminhões vocês têm hoje?', 7),
    turno('user', 'Uns quarenta.', 10),
    turno('agent', 'E como vocês acompanham as entregas?', 12),
    turno('user', 'Por planilha.', 15),
    turno('agent', 'Faz sentido conversar com a especialista.', 17),
    turno('user', 'Pode ser.', 20),
  ],
  metadata: { call_duration_secs: 95, termination_reason: 'Call ended by remote party' },
})

/** Um agente no formato A1, com o que o cenário mudar por cima. */
export function agente(sobre: {
  firstMessage?: string
  prompt?: string
  language?: string
  voiceId?: string
  maxDuration?: number
  tools?: readonly Record<string, unknown>[]
  toolIds?: readonly string[]
  placeholders?: Record<string, string>
  turn?: Record<string, unknown>
  webhookDeInicio?: boolean
} = {}): Record<string, unknown> {
  return {
    agent_id: AGENTE_DE_EXEMPLO,
    name: 'Sarah (discovery)',
    conversation_config: {
      agent: {
        first_message: sobre.firstMessage ?? 'Oi! Aqui é a Sarah, da Fluxo. Tudo bem?',
        language: sobre.language ?? 'pt',
        dynamic_variables: { dynamic_variable_placeholders: sobre.placeholders ?? {} },
        prompt: {
          prompt: sobre.prompt ?? 'Você é a Sarah. Fale português do Brasil.',
          llm: 'gemini-2.5-flash',
          tools: sobre.tools ?? [
            { type: 'system', name: 'end_call' },
            { type: 'system', name: 'voicemail_detection' },
            { type: 'system', name: 'transfer_to_number' },
            { type: 'webhook', name: 'tool-dnc' },
            { type: 'webhook', name: 'tool-qualify' },
            { type: 'webhook', name: 'tool-transfer' },
          ],
          ...(sobre.toolIds ? { tool_ids: sobre.toolIds } : {}),
        },
      },
      tts: { voice_id: sobre.voiceId ?? 'voz_marina', model_id: 'eleven_flash_v2_5', stability: 0.5, speed: 1 },
      turn: { turn_timeout: 7, silence_end_call_timeout: -1, ...sobre.turn },
      conversation: { max_duration_seconds: sobre.maxDuration ?? 600 },
    },
    platform_settings: {
      overrides: {
        enable_conversation_initiation_client_data_from_webhook: sobre.webhookDeInicio ?? true,
        conversation_config_override: { agent: { first_message: true } },
      },
    },
  }
}

/** A configuração das conversas do workspace (W1), com os dois avisos cadastrados. */
export function configuracaoDasConversas(sobre: { inicioUrl?: string | null; posChamadaId?: string | null } = {}) {
  const inicioUrl = sobre.inicioUrl === undefined ? 'https://exemplo.supabase.co/functions/v1/call-init?conta=a' : sobre.inicioUrl
  const posChamadaId = sobre.posChamadaId === undefined ? 'wh_fim_1' : sobre.posChamadaId
  return {
    ...(inicioUrl === null ? {} : { conversation_initiation_client_data_webhook: { url: inicioUrl, request_headers: {} } }),
    webhooks: posChamadaId === null ? {} : { post_call_webhook_id: posChamadaId },
  }
}
