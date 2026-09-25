// A tabela de casos do lembrete de reunião: uma só, exercitada pelos dois
// lados. `lembrete-de-reuniao.test.ts` a cobra do módulo em `test:unit`, e
// `testes/banco/lembrete-de-reuniao.test.ts` a cobra de
// `enfileirar_lembretes_de_reuniao` em PGlite: entra na fila exatamente a
// reunião cujo motivo esperado é `na_janela`.
//
// Módulo de dado, sem `vitest` dentro. O instante é dado em segundos a partir
// de `agora`, para os dois lados montarem o mesmo cenário sem data fixa.

import { JANELA_DO_LEMBRETE_PADRAO } from './padroes.ts'
import type { JanelaDoLembrete, MotivoDoLembrete } from './lembrete-de-reuniao.ts'

export interface CasoDeLembrete {
  readonly nome: string
  /** Segundos entre agora e o começo da reunião; negativo é passado. */
  readonly segundosAteComecar: number
  readonly status: 'scheduled' | 'confirmed' | 'canceled' | 'rescheduled' | 'attended' | 'no_show'
  readonly lembrada: boolean
  readonly comTelefone: boolean
  readonly janela: JanelaDoLembrete
  readonly esperado: MotivoDoLembrete
}

const MIN = 60

function caso(
  nome: string,
  segundosAteComecar: number,
  esperado: MotivoDoLembrete,
  extra: Partial<Omit<CasoDeLembrete, 'nome' | 'segundosAteComecar' | 'esperado'>> = {},
): CasoDeLembrete {
  return {
    nome,
    segundosAteComecar,
    status: 'scheduled',
    lembrada: false,
    comTelefone: true,
    janela: JANELA_DO_LEMBRETE_PADRAO,
    esperado,
    ...extra,
  }
}

export const CASOS_DE_LEMBRETE: readonly CasoDeLembrete[] = [
  caso('reunião daqui a 20 minutos, com a janela padrão, entra', 20 * MIN, 'na_janela'),
  caso('reunião daqui a 12 minutos entra', 12 * MIN, 'na_janela'),
  caso('borda de dentro do começo da janela: exatamente 5 minutos entra', 5 * MIN, 'na_janela'),
  caso('um segundo antes do começo da janela já é tarde', 5 * MIN - 1, 'depois_da_janela'),
  caso('borda de dentro do fim da janela: exatamente 20 minutos entra', 20 * MIN, 'na_janela'),
  caso('um segundo depois do fim da janela ainda é cedo', 20 * MIN + 1, 'antes_da_janela'),
  caso('reunião daqui a 2 horas é cedo', 120 * MIN, 'antes_da_janela'),
  caso('reunião amanhã é cedo', 24 * 60 * MIN, 'antes_da_janela'),
  caso('reunião daqui a 2 minutos é tarde para ligar', 2 * MIN, 'depois_da_janela'),
  caso('reunião que começa agora não é lembrada', 0, 'depois_da_janela'),
  caso('reunião que começou há 10 minutos nunca é lembrada', -10 * MIN, 'depois_da_janela'),
  caso('rotina parada por uma hora: a reunião de 40 minutos atrás fica de fora', -40 * MIN, 'depois_da_janela'),
  caso('já lembrada não entra, mesmo na janela', 15 * MIN, 'ja_lembrada', { lembrada: true }),
  caso('já lembrada e já passada é ja_lembrada', -5 * MIN, 'ja_lembrada', { lembrada: true }),
  caso('confirmada não é lembrada', 15 * MIN, 'status_nao_elegivel', { status: 'confirmed' }),
  caso('cancelada não é lembrada', 15 * MIN, 'status_nao_elegivel', { status: 'canceled' }),
  caso('remarcada não é lembrada', 15 * MIN, 'status_nao_elegivel', { status: 'rescheduled' }),
  caso('lead sem telefone não é lembrado', 15 * MIN, 'sem_telefone', { comTelefone: false }),
  caso('janela da conta de 30 a 60 minutos: 45 entra', 45 * MIN, 'na_janela', {
    janela: { inicioEmMinutos: 30, fimEmMinutos: 60 },
  }),
  caso('janela da conta de 30 a 60 minutos: 20 já é tarde', 20 * MIN, 'depois_da_janela', {
    janela: { inicioEmMinutos: 30, fimEmMinutos: 60 },
  }),
  caso('janela que começa em zero: 1 minuto ainda entra', MIN, 'na_janela', {
    janela: { inicioEmMinutos: 0, fimEmMinutos: 10 },
  }),
]
