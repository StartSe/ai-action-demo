// Transcrições de exemplo para a leitura das ferramentas de sistema (US-107).
// Módulo de dado, sem `vitest` dentro: é lido por
// `leitura-da-transcricao.test.ts`, em `test:unit`, e pelo teste de banco da
// finalização, em `test:db`.
//
// **Cada fixture declara o formato em que foi escrita** (`formato`), e quem a lê
// escolhe o adaptador por ele em `ADAPTADORES_DE_CONVERSA`. O corpo é o que
// `GET convai/conversations/{id}` devolve segundo a suposição declarada no
// cabeçalho de `formato-do-provedor.ts` — escrito à mão, e não copiado de uma
// conversa real, porque a conferência contra o provedor é do degrau 3. Quando
// uma conversa real chegar, ela entra aqui com o formato dela, e a fixture à mão
// continua como o caso que ela descreve.
//
// O `esperado` é o que a leitura conclui: as linhas em ordem de instante, com o
// instante em milissegundos contados do início da conversa, o fim, e os pedidos
// de bloqueio que a finalização reaplica (US-108) — toda invocação de
// `tool-dnc`, com erro ou sem.

import { FORMATO_DA_CONVERSA } from './formato-do-provedor.ts'
import type { AtendidaPor, MotivoDoFim } from './leitura-da-transcricao.ts'
import type { OrigemDoBloqueio } from '../tool-dnc/bloqueio.ts'

/** 2026-03-20T10:00:00Z, o início de todas as conversas de exemplo. */
export const INICIO_DAS_TRANSCRICOES_EM_SEGUNDOS = 1_774_000_800

export interface LinhaEsperada {
  readonly tool: string
  /** Milissegundos desde o início da conversa. */
  readonly ms: number
  readonly error: string | null
}

export interface BloqueioEsperado {
  readonly origem: OrigemDoBloqueio
  /** Milissegundos desde o início da conversa. */
  readonly ms: number
  readonly notas: string | null
}

export interface TranscricaoDeExemplo {
  readonly nome: string
  readonly formato: string
  readonly corpo: Readonly<Record<string, unknown>>
  readonly esperado: {
    readonly linhas: readonly LinhaEsperada[]
    readonly motivo: MotivoDoFim
    readonly atendidaPor: AtendidaPor
    readonly bloqueios: readonly BloqueioEsperado[]
  }
}

function conversa(transcript: readonly unknown[], duracao: number): Record<string, unknown> {
  return {
    conversation_id: 'conv_exemplo',
    status: 'done',
    has_audio: false,
    transcript,
    metadata: {
      start_time_unix_secs: INICIO_DAS_TRANSCRICOES_EM_SEGUNDOS,
      call_duration_secs: duracao,
    },
  }
}

export const TRANSCRICOES_DE_EXEMPLO: readonly TranscricaoDeExemplo[] = [
  {
    nome: 'encerramento pela Sarah',
    formato: FORMATO_DA_CONVERSA,
    corpo: conversa(
      [
        { role: 'agent', message: 'Oi, Marcos! Aqui é a Sarah, da Fluxo Cargo.', time_in_call_secs: 1 },
        { role: 'user', message: 'Oi, pode falar.', time_in_call_secs: 4 },
        { role: 'agent', message: 'Obrigada pelo seu tempo. Até mais!', time_in_call_secs: 40 },
        {
          role: 'agent',
          message: null,
          time_in_call_secs: 42,
          tool_calls: [{ request_id: 'e1', tool_name: 'end_call', params_as_json: '{"reason":"despedida"}' }],
          tool_results: [{ request_id: 'e1', tool_name: 'end_call', result_value: '', is_error: false }],
        },
      ],
      43,
    ),
    esperado: {
      linhas: [{ tool: 'system:end_call', ms: 42_000, error: null }],
      motivo: 'completed',
      atendidaPor: 'human',
      bloqueios: [],
    },
  },
  {
    nome: 'caixa postal',
    formato: FORMATO_DA_CONVERSA,
    corpo: conversa(
      [
        { role: 'agent', message: 'Oi, Marcos! Aqui é a Sarah, da Fluxo Cargo.', time_in_call_secs: 1 },
        { role: 'user', message: 'Deixe seu recado após o sinal.', time_in_call_secs: 3 },
        {
          role: 'agent',
          message: null,
          time_in_call_secs: 5,
          tool_calls: [{ request_id: 'v1', tool_name: 'voicemail_detection', params_as_json: '{}' }],
        },
      ],
      6,
    ),
    esperado: {
      linhas: [{ tool: 'system:voicemail_detection', ms: 5_000, error: null }],
      motivo: 'voicemail',
      atendidaPor: 'machine',
      bloqueios: [],
    },
  },
  {
    // `tool-transfer` deu certo e quem a registra é ela mesma; a transcrição só
    // acrescenta o que o provedor fez depois, com o número que ela devolveu.
    nome: 'transferência depois de tool-transfer',
    formato: FORMATO_DA_CONVERSA,
    corpo: conversa(
      [
        { role: 'agent', message: 'Oi, Marcos! Aqui é a Sarah, da Fluxo Cargo.', time_in_call_secs: 1 },
        { role: 'user', message: 'Quero falar com uma pessoa.', time_in_call_secs: 6 },
        {
          role: 'agent',
          message: null,
          time_in_call_secs: 8,
          tool_calls: [{ request_id: 't1', tool_name: 'tool-transfer', params_as_json: '{"reason":"pediu"}' }],
          tool_results: [{ request_id: 't1', tool_name: 'tool-transfer', result_value: '{"ok":true}', is_error: false }],
        },
        {
          role: 'agent',
          message: 'Vou te passar agora para alguém do time.',
          time_in_call_secs: 10,
          tool_calls: [
            { request_id: 't2', tool_name: 'transfer_to_number', params_as_json: '{"transfer_number":"+5511988887777"}' },
          ],
        },
      ],
      12,
    ),
    esperado: {
      linhas: [{ tool: 'system:transfer_to_number', ms: 10_000, error: null }],
      motivo: 'transferred',
      atendidaPor: 'human',
      bloqueios: [],
    },
  },
  {
    nome: 'transferência que voltou com erro',
    formato: FORMATO_DA_CONVERSA,
    corpo: conversa(
      [
        { role: 'user', message: 'Me passa para alguém?', time_in_call_secs: 3 },
        {
          role: 'agent',
          message: null,
          time_in_call_secs: 5,
          tool_calls: [{ request_id: 'x1', tool_name: 'transfer_to_number' }],
        },
        {
          role: 'agent',
          message: 'Não consegui completar agora. Alguém do time te retorna.',
          time_in_call_secs: 20,
          tool_results: [{ request_id: 'x1', tool_name: 'transfer_to_number', result_value: 'ocupado', is_error: true }],
        },
      ],
      25,
    ),
    esperado: {
      linhas: [{ tool: 'system:transfer_to_number', ms: 5_000, error: 'ocupado' }],
      motivo: 'completed',
      atendidaPor: 'human',
      bloqueios: [],
    },
  },
  {
    nome: 'sem nenhuma invocação',
    formato: FORMATO_DA_CONVERSA,
    corpo: conversa(
      [
        { role: 'agent', message: 'Oi, Marcos! Aqui é a Sarah, da Fluxo Cargo.', time_in_call_secs: 1 },
        { role: 'user', message: 'Agora não posso, tchau.', time_in_call_secs: 4 },
      ],
      5,
    ),
    esperado: { linhas: [], motivo: 'completed', atendidaPor: 'human', bloqueios: [] },
  },
  {
    // A pessoa errada da camada 1: duas falas, tool-dnc entre elas e end_call
    // no fim, com o bloqueio falhando e o encerramento no mesmo turno. Os
    // turnos vêm fora de ordem, e o segundo tool-dnc do mesmo turno também
    // falhou: sem o desempate, os dois cairiam no mesmo `at` e o único
    // descartaria um deles.
    nome: 'pessoa errada, fora de ordem e no mesmo segundo',
    formato: FORMATO_DA_CONVERSA,
    corpo: conversa(
      [
        {
          role: 'agent',
          message: 'Desculpa o incômodo. Tenha um bom dia!',
          time_in_call_secs: 30,
          tool_calls: [
            { request_id: 'd1', tool_name: 'tool-dnc', params_as_json: '{"reason":"wrong_number"}' },
            { request_id: 'd2', tool_name: 'tool-dnc', params_as_json: '{"reason":"wrong_number"}' },
            { request_id: 'f1', tool_name: 'end_call' },
          ],
          tool_results: [
            { request_id: 'd1', tool_name: 'tool-dnc', result_value: 'prazo estourado', is_error: true },
            { request_id: 'd2', tool_name: 'tool-dnc', result_value: 'prazo estourado', is_error: true },
          ],
        },
        { role: 'agent', message: 'Oi, falo com o Marcos?', time_in_call_secs: 1 },
        { role: 'user', message: 'Não, aqui não tem Marcos.', time_in_call_secs: 4 },
      ],
      31,
    ),
    esperado: {
      linhas: [
        { tool: 'tool-dnc', ms: 30_000, error: 'prazo estourado' },
        { tool: 'tool-dnc', ms: 30_001, error: 'prazo estourado' },
        { tool: 'system:end_call', ms: 30_002, error: null },
      ],
      motivo: 'completed',
      atendidaPor: 'human',
      bloqueios: [
        { origem: 'wrong_number', ms: 30_000, notas: null },
        { origem: 'wrong_number', ms: 30_001, notas: null },
      ],
    },
  },
  {
    // O não perturbe da camada 1 com o banco fora do ar durante a ligação: o
    // esqueleto responde 200 com `ok: false` e a frase de contorno, e o provedor
    // registra a invocação como bem-sucedida. Nenhuma linha nasce dela, e o
    // bloqueio só existe se a finalização o reaplicar (R-02).
    nome: 'não perturbe com o banco fora do ar',
    formato: FORMATO_DA_CONVERSA,
    corpo: conversa(
      [
        { role: 'agent', message: 'Oi, Marcos! Aqui é a Sarah, da Fluxo Cargo.', time_in_call_secs: 1 },
        { role: 'user', message: 'Não me liga mais, por favor.', time_in_call_secs: 5 },
        {
          role: 'agent',
          message: null,
          time_in_call_secs: 7,
          tool_calls: [
            {
              request_id: 'n1',
              tool_name: 'tool-dnc',
              params_as_json: '{"reason":"lead_request","notes":"pediu para não ligar mais"}',
            },
          ],
          tool_results: [
            {
              request_id: 'n1',
              tool_name: 'tool-dnc',
              result_value: '{"ok":false,"data":{},"speech":"Tudo certo."}',
              is_error: false,
            },
          ],
        },
        {
          role: 'agent',
          message: 'Pode deixar, não te ligo mais. Tchau!',
          time_in_call_secs: 9,
          tool_calls: [{ request_id: 'n2', tool_name: 'end_call' }],
        },
      ],
      10,
    ),
    esperado: {
      linhas: [{ tool: 'system:end_call', ms: 9_000, error: null }],
      motivo: 'completed',
      atendidaPor: 'human',
      bloqueios: [{ origem: 'lead_request', ms: 7_000, notas: 'pediu para não ligar mais' }],
    },
  },
]
