// Transcrições de exemplo para a conferência das duas falas na pessoa errada
// (US-109). Módulo de dado, sem `vitest` dentro, pela razão de
// `transcricoes-de-exemplo.ts`: cada fixture declara o formato em que foi
// escrita, e quem a lê escolhe o adaptador por ele. O corpo segue a suposição
// do cabeçalho de `formato-do-provedor.ts`, escrito à mão.
//
// Os cinco casos do critério de aceite. O `esperado` é a medição.

import { FORMATO_DA_CONVERSA } from './formato-do-provedor.ts'
import type { MedicaoDoEncerramento } from './encerramento-da-pessoa-errada.ts'
import { INICIO_DAS_TRANSCRICOES_EM_SEGUNDOS } from './transcricoes-de-exemplo.ts'

export interface EncerramentoDeExemplo {
  readonly nome: string
  readonly formato: string
  readonly corpo: Readonly<Record<string, unknown>>
  readonly esperado: MedicaoDoEncerramento
}

function conversa(transcript: readonly unknown[], duracao: number): Record<string, unknown> {
  return {
    conversation_id: 'conv_pessoa_errada',
    status: 'done',
    has_audio: false,
    transcript,
    metadata: { start_time_unix_secs: INICIO_DAS_TRANSCRICOES_EM_SEGUNDOS, call_duration_secs: duracao },
  }
}

const ABERTURA = [
  { role: 'agent', message: 'Oi, falo com o Marcos?', time_in_call_secs: 1 },
  { role: 'user', message: 'Não, aqui não tem nenhum Marcos.', time_in_call_secs: 4 },
] as const

const DNC = { request_id: 'd1', tool_name: 'tool-dnc', params_as_json: '{"reason":"wrong_number"}' }
const FIM = { request_id: 'f1', tool_name: 'end_call' }

export const ENCERRAMENTOS_DE_EXEMPLO: readonly EncerramentoDeExemplo[] = [
  {
    nome: 'encerrou na mesma fala',
    formato: FORMATO_DA_CONVERSA,
    corpo: conversa(
      [
        ...ABERTURA,
        {
          role: 'agent',
          message: 'Desculpa o engano. Tenha um bom dia!',
          time_in_call_secs: 6,
          tool_calls: [DNC, FIM],
        },
      ],
      7,
    ),
    esperado: { aplica: true, falas: 1, conforme: true, encerrouComEndCall: true },
  },
  {
    // O roteiro da camada 1: desculpa com tool-dnc, despedida com end_call.
    nome: 'encerrou na fala seguinte',
    formato: FORMATO_DA_CONVERSA,
    corpo: conversa(
      [
        ...ABERTURA,
        { role: 'agent', message: 'Ah, desculpa o engano.', time_in_call_secs: 6, tool_calls: [DNC] },
        { role: 'user', message: 'Tudo bem.', time_in_call_secs: 8 },
        { role: 'agent', message: 'Tenha um bom dia!', time_in_call_secs: 9, tool_calls: [FIM] },
      ],
      10,
    ),
    esperado: { aplica: true, falas: 2, conforme: true, encerrouComEndCall: true },
  },
  {
    // A Sarah tenta explicar o produto antes de se despedir. Os turnos vêm
    // fora de ordem: a régua é o instante, não a posição.
    nome: 'encerrou na terceira',
    formato: FORMATO_DA_CONVERSA,
    corpo: conversa(
      [
        { role: 'agent', message: 'Tenha um bom dia!', time_in_call_secs: 14, tool_calls: [FIM] },
        ...ABERTURA,
        { role: 'agent', message: 'Ah, desculpa o engano.', time_in_call_secs: 6, tool_calls: [DNC] },
        { role: 'user', message: 'Tudo bem.', time_in_call_secs: 8 },
        { role: 'agent', message: 'A Fluxo Cargo ajuda transportadoras a...', time_in_call_secs: 10 },
        { role: 'user', message: 'Não tenho interesse.', time_in_call_secs: 12 },
      ],
      15,
    ),
    esperado: { aplica: true, falas: 3, conforme: false, encerrouComEndCall: true },
  },
  {
    // A pessoa desligou, e a Sarah falou três vezes sem encerrar.
    nome: 'nunca chamou end_call',
    formato: FORMATO_DA_CONVERSA,
    corpo: conversa(
      [
        ...ABERTURA,
        { role: 'agent', message: 'Ah, desculpa o engano.', time_in_call_secs: 6, tool_calls: [DNC] },
        { role: 'agent', message: 'Você conhece o Marcos?', time_in_call_secs: 9 },
        { role: 'user', message: 'Não.', time_in_call_secs: 11 },
        { role: 'agent', message: 'Sabe o número dele?', time_in_call_secs: 12 },
      ],
      13,
    ),
    esperado: { aplica: true, falas: 3, conforme: false, encerrouComEndCall: false },
  },
  {
    // Encerrou sem tool-dnc com wrong_number: o bloqueio pedido pela pessoa
    // (lead_request) não é identificação de pessoa errada.
    nome: 'nunca chamou tool-dnc com wrong_number',
    formato: FORMATO_DA_CONVERSA,
    corpo: conversa(
      [
        ...ABERTURA,
        {
          role: 'agent',
          message: 'Pode deixar, não te ligo mais.',
          time_in_call_secs: 6,
          tool_calls: [{ request_id: 'n1', tool_name: 'tool-dnc', params_as_json: '{"reason":"lead_request"}' }],
        },
        { role: 'agent', message: 'Tchau!', time_in_call_secs: 8 },
        { role: 'agent', message: 'Tenha um bom dia!', time_in_call_secs: 9, tool_calls: [FIM] },
      ],
      10,
    ),
    esperado: { aplica: false },
  },
]
