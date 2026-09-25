// A tabela de casos da política de retentativa: uma só, exercitada pelos dois
// lados.
//
// A regra vive no módulo portável (`politica-de-retentativa.ts`) e na função
// SQL `public.decidir_retentativa`, que `reprogramar_tentativa` chama na
// transação em que enfileira. Duas verdades sobre a mesma regra é defeito, e a
// ponte é esta tabela: `politica-de-retentativa.test.ts` a exercita contra o
// módulo em `test:unit`, e `testes/banco/reprogramacao-de-tentativa.test.ts` a
// exercita contra a função SQL em PGlite. Caso novo entra aqui e os dois lados
// passam a cobrá-lo.
//
// Módulo de dado, sem `vitest` dentro. As datas são de outubro de 2026:
// segunda 5, sexta 9, sábado 10, segunda 12. São Paulo é UTC−3, Manaus UTC−4,
// Rio Branco UTC−5 e Fernando de Noronha UTC−2, sem horário de verão.

import { POLITICA_PADRAO, TURNOS_PADRAO } from './padroes.ts'
import type {
  MotivoDaRetentativa,
  PoliticaDeRetentativa,
  ResultadoDaLigacao,
  TurnoDeRetentativa,
} from './politica-de-retentativa.ts'

export interface CasoDeRetentativa {
  readonly nome: string
  readonly resultado: ResultadoDaLigacao
  readonly tentativa: number
  /** Instante ISO-8601 em UTC. */
  readonly agora: string
  readonly fuso: string
  readonly politica: PoliticaDeRetentativa
  readonly turnos: readonly TurnoDeRetentativa[]
  readonly esperado:
    | { readonly reprogramar: true; readonly quando: string; readonly turno: string }
    | { readonly reprogramar: false; readonly motivo: MotivoDaRetentativa }
}

const SP = 'America/Sao_Paulo'
const P = POLITICA_PADRAO
const T = TURNOS_PADRAO

function caso(
  nome: string,
  resultado: ResultadoDaLigacao,
  tentativa: number,
  agora: string,
  esperado: CasoDeRetentativa['esperado'],
  extra: Partial<Pick<CasoDeRetentativa, 'fuso' | 'politica' | 'turnos'>> = {},
): CasoDeRetentativa {
  return { nome, resultado, tentativa, agora, fuso: SP, politica: P, turnos: T, esperado, ...extra }
}

const sim = (quando: string, turno: string) => ({ reprogramar: true as const, quando, turno })
const nao = (motivo: MotivoDaRetentativa) => ({ reprogramar: false as const, motivo })

export const CASOS_DE_RETENTATIVA: readonly CasoDeRetentativa[] = [
  // Sem atendimento: o recuo da tentativa -------------------------------------
  caso('sem atendimento na 1ª às 10h: recuo de 60 min, mesma manhã', 'sem_atendimento', 1,
    '2026-10-05T13:00:00Z', sim('2026-10-05T14:00:00Z', 'manha')),
  caso('sem atendimento na 2ª às 10h: recuo de 180 min cai na tarde', 'sem_atendimento', 2,
    '2026-10-05T13:00:00Z', sim('2026-10-05T16:00:00Z', 'tarde')),
  caso('sem atendimento na 3ª às 10h: recuo de um dia', 'sem_atendimento', 3,
    '2026-10-05T13:00:00Z', sim('2026-10-06T13:00:00Z', 'manha')),
  caso('sem atendimento às 17h30: o recuo sai dos turnos e vai para a manhã seguinte', 'sem_atendimento', 1,
    '2026-10-05T20:30:00Z', sim('2026-10-06T12:00:00Z', 'manha')),
  caso('sem atendimento na sexta às 17h30: vira a semana', 'sem_atendimento', 1,
    '2026-10-09T20:30:00Z', sim('2026-10-12T12:00:00Z', 'manha')),
  caso('sem atendimento com segundos: o segundo se mantém e o milissegundo cai', 'sem_atendimento', 1,
    '2026-10-05T13:00:30.500Z', sim('2026-10-05T14:00:30Z', 'manha')),
  caso('tabela de um recuo só: o último se repete na 3ª tentativa', 'sem_atendimento', 3,
    '2026-10-05T13:00:00Z', sim('2026-10-05T13:30:00Z', 'manha'),
    { politica: { ...P, recuosEmMinutos: [30] } }),
  caso('recuo que cai no intervalo entre turnos vai para o começo do seguinte', 'sem_atendimento', 1,
    '2026-10-05T13:30:00Z', sim('2026-10-05T17:00:00Z', 'tarde'),
    { turnos: [{ name: 'manha', start: '09:00', end: '11:00' }, { name: 'tarde', start: '14:00', end: '17:00' }] }),

  // Ocupado: recuo curto --------------------------------------------------------
  caso('ocupado às 10h: 15 min depois', 'ocupado', 1,
    '2026-10-05T13:00:00Z', sim('2026-10-05T13:15:00Z', 'manha')),
  caso('ocupado às 11h50: o recuo passa para a tarde', 'ocupado', 3,
    '2026-10-05T14:50:00Z', sim('2026-10-05T15:05:00Z', 'tarde')),
  caso('ocupado às 17h50: o recuo sai do último turno e vai para o dia seguinte', 'ocupado', 1,
    '2026-10-05T20:50:00Z', sim('2026-10-06T12:00:00Z', 'manha')),

  // Caixa postal: outro turno -------------------------------------------------
  caso('caixa postal às 10h vai para a tarde', 'caixa_postal', 1,
    '2026-10-05T13:00:00Z', sim('2026-10-05T15:00:00Z', 'tarde')),
  caso('caixa postal às 13h vai para o fim de tarde', 'caixa_postal', 1,
    '2026-10-05T16:00:00Z', sim('2026-10-05T18:00:00Z', 'fim_de_tarde')),
  caso('caixa postal no último turno vai para o primeiro do próximo dia útil', 'caixa_postal', 1,
    '2026-10-05T19:00:00Z', sim('2026-10-06T12:00:00Z', 'manha')),
  caso('caixa postal na sexta à tarde vai para segunda de manhã', 'caixa_postal', 2,
    '2026-10-09T19:00:00Z', sim('2026-10-12T12:00:00Z', 'manha')),
  caso('caixa postal às 8h, antes de qualquer turno, vai para a manhã', 'caixa_postal', 1,
    '2026-10-05T11:00:00Z', sim('2026-10-05T12:00:00Z', 'manha')),
  caso('caixa postal no primeiro segundo da tarde pula a tarde inteira', 'caixa_postal', 1,
    '2026-10-05T15:00:00Z', sim('2026-10-05T18:00:00Z', 'fim_de_tarde')),
  caso('caixa postal no último segundo da manhã vai para a tarde', 'caixa_postal', 1,
    '2026-10-05T14:59:59Z', sim('2026-10-05T15:00:00Z', 'tarde')),
  caso('caixa postal no sábado vai para segunda', 'caixa_postal', 1,
    '2026-10-10T13:00:00Z', sim('2026-10-12T12:00:00Z', 'manha')),
  caso('caixa postal com um turno só vai para o dia seguinte', 'caixa_postal', 1,
    '2026-10-05T13:00:00Z', sim('2026-10-06T12:00:00Z', 'dia'),
    { turnos: [{ name: 'dia', start: '09:00', end: '18:00' }] }),
  caso('caixa postal no sábado com janela que abre no domingo', 'caixa_postal', 1,
    '2026-10-10T19:00:00Z', sim('2026-10-11T12:00:00Z', 'manha'),
    { politica: { ...P, diasUteis: [0, 1, 2, 3, 4, 5, 6] } }),

  // Fuso do lead ----------------------------------------------------------------
  caso('Manaus às 11h30 (12h30 em São Paulo): o turno é o do lead, e vai para a tarde dele', 'caixa_postal', 1,
    '2026-10-05T15:30:00Z', sim('2026-10-05T16:00:00Z', 'tarde'), { fuso: 'America/Manaus' }),
  caso('Noronha às 17h30: a manhã seguinte é às 9h de Noronha', 'sem_atendimento', 1,
    '2026-10-05T19:30:00Z', sim('2026-10-06T11:00:00Z', 'manha'), { fuso: 'America/Noronha' }),
  caso('Rio Branco às 17h: caixa postal no último turno do lead', 'caixa_postal', 1,
    '2026-10-05T22:00:00Z', sim('2026-10-06T14:00:00Z', 'manha'), { fuso: 'America/Rio_Branco' }),

  // Recusas -----------------------------------------------------------------------
  caso('número inválido não reprograma', 'numero_invalido', 1,
    '2026-10-05T13:00:00Z', nao('numero_invalido')),
  caso('número inválido no teto continua sendo número inválido', 'numero_invalido', 4,
    '2026-10-05T13:00:00Z', nao('numero_invalido')),
  caso('sem atendimento na tentativa do teto não reprograma', 'sem_atendimento', 4,
    '2026-10-05T13:00:00Z', nao('teto_de_tentativas')),
  caso('caixa postal acima do teto não reprograma', 'caixa_postal', 7,
    '2026-10-05T13:00:00Z', nao('teto_de_tentativas')),
  caso('teto de uma tentativa: nenhuma retentativa', 'ocupado', 1,
    '2026-10-05T13:00:00Z', nao('teto_de_tentativas'), { politica: { ...P, tetoDeTentativas: 1 } }),
  caso('caixa postal na 3ª de 4 ainda reprograma', 'caixa_postal', 3,
    '2026-10-05T13:00:00Z', sim('2026-10-05T15:00:00Z', 'tarde')),
  caso('conta sem dia de discagem: fora de turno', 'sem_atendimento', 1,
    '2026-10-05T13:00:00Z', nao('fora_de_turno'), { politica: { ...P, diasUteis: [] } }),
]
