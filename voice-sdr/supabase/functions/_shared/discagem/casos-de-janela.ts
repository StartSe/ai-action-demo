// A tabela de casos da janela de discagem: uma só, exercitada pelos dois lados.
//
// A regra da janela vive em dois lugares por necessidade — o SQL da guarda
// decide se a Sarah liga (seção 6, passo 4), e `janela.ts` monta a frase da
// recusa e a prévia da tela. Duas verdades sobre a mesma regra é defeito, e a
// ponte é esta tabela: `janela.test.ts` a exercita contra o módulo em
// `test:unit`, e `testes/banco/janela-de-discagem.test.ts` a exercita contra
// `public.dentro_da_janela_de_discagem` e `public.proxima_abertura_de_discagem`
// em PGlite. Caso novo entra aqui e os dois lados passam a cobrá-lo.
//
// Módulo de dado, sem `vitest` dentro: teste que importa teste registra as
// chamadas de `test()` do outro na própria suíte.
//
// **Os fusos são os que o Brasil tem de verdade** (R-10). São Paulo é UTC−3,
// Manaus é UTC−4 e Fernando de Noronha é UTC−2, e nenhum dos três tem horário
// de verão hoje. Os casos 19h/Manaus/Noronha são o par que derruba qualquer
// conversão feita por soma de horas: o mesmo instante é dentro da janela para
// um lead e fora para o outro.
//
// As datas são de outubro de 2026 e a escolha não é enfeite: em toda data
// anterior a fevereiro de 2019, São Paulo tinha horário de verão, e o caso
// deixaria de medir o que diz medir.

import type { MotivoDaJanela } from './janela.ts'

export interface CasoDeJanela {
  readonly nome: string
  /** Cru, porque os casos de recusa por configuração não têm o tipo. */
  readonly janela: unknown
  /** Instante ISO-8601 em UTC. */
  readonly instante: string
  /** `leads.timezone`, ou o da conta quando o lead não tem (ver `resolverFuso`). */
  readonly fuso: string
  readonly dentro: boolean
  /** `null` quando dentro. */
  readonly motivo: MotivoDaJanela | null
  /** Instante ISO-8601 em UTC, ou `null` quando a janela nunca abre. */
  readonly proximaAbertura: string | null
}

/** O padrão da coluna: segunda a sexta, das 9h às 18h. */
export const JANELA_COMERCIAL = {
  '1': { start: '09:00', end: '18:00' },
  '2': { start: '09:00', end: '18:00' },
  '3': { start: '09:00', end: '18:00' },
  '4': { start: '09:00', end: '18:00' },
  '5': { start: '09:00', end: '18:00' },
} as const

/** A mesma, até as 19h. É a que separa São Paulo, Manaus e Noronha. */
export const JANELA_ATE_AS_19 = {
  '1': { start: '09:00', end: '19:00' },
  '2': { start: '09:00', end: '19:00' },
  '3': { start: '09:00', end: '19:00' },
  '4': { start: '09:00', end: '19:00' },
  '5': { start: '09:00', end: '19:00' },
} as const

export const JANELA_COM_SABADO = {
  ...JANELA_COMERCIAL,
  '6': { start: '09:00', end: '13:00' },
} as const

export const SAO_PAULO = 'America/Sao_Paulo'
export const MANAUS = 'America/Manaus'
export const NORONHA = 'America/Noronha'

export const CASOS_DE_JANELA: readonly CasoDeJanela[] = [
  // O limite, escrito: a faixa é fechada no início e aberta no fim.
  {
    nome: '9h em ponto disca: a faixa é fechada no início',
    janela: JANELA_COMERCIAL,
    instante: '2026-10-06T12:00:00Z',
    fuso: SAO_PAULO,
    dentro: true,
    motivo: null,
    proximaAbertura: '2026-10-06T12:00:00Z',
  },
  {
    nome: '17h59 de terça ainda disca',
    janela: JANELA_COMERCIAL,
    instante: '2026-10-06T20:59:00Z',
    fuso: SAO_PAULO,
    dentro: true,
    motivo: null,
    proximaAbertura: '2026-10-06T20:59:00Z',
  },
  {
    nome: '18h em ponto não disca: a faixa é aberta no fim',
    janela: JANELA_COMERCIAL,
    instante: '2026-10-06T21:00:00Z',
    fuso: SAO_PAULO,
    dentro: false,
    motivo: 'fora_da_faixa',
    proximaAbertura: '2026-10-07T12:00:00Z',
  },

  // O caso da história: 22h de terça em São Paulo.
  {
    nome: '22h de terça em São Paulo é recusada, e abre às 9h de quarta',
    janela: JANELA_COMERCIAL,
    instante: '2026-10-07T01:00:00Z',
    fuso: SAO_PAULO,
    dentro: false,
    motivo: 'fora_da_faixa',
    proximaAbertura: '2026-10-07T12:00:00Z',
  },
  {
    nome: '8h de terça é recusada, e a abertura é no mesmo dia',
    janela: JANELA_COMERCIAL,
    instante: '2026-10-06T11:00:00Z',
    fuso: SAO_PAULO,
    dentro: false,
    motivo: 'fora_da_faixa',
    proximaAbertura: '2026-10-06T12:00:00Z',
  },

  // Dia sem faixa não é dia com faixa vazia.
  {
    nome: 'domingo não tem faixa, e a próxima abertura é segunda às 9h',
    janela: JANELA_COMERCIAL,
    instante: '2026-10-11T15:00:00Z',
    fuso: SAO_PAULO,
    dentro: false,
    motivo: 'dia_sem_faixa',
    proximaAbertura: '2026-10-12T12:00:00Z',
  },
  {
    nome: '18h de sexta pula o fim de semana inteiro',
    janela: JANELA_COMERCIAL,
    instante: '2026-10-09T21:00:00Z',
    fuso: SAO_PAULO,
    dentro: false,
    motivo: 'fora_da_faixa',
    proximaAbertura: '2026-10-12T12:00:00Z',
  },
  {
    nome: 'sábado com faixa própria disca às 10h',
    janela: JANELA_COM_SABADO,
    instante: '2026-10-10T13:00:00Z',
    fuso: SAO_PAULO,
    dentro: true,
    motivo: null,
    proximaAbertura: '2026-10-10T13:00:00Z',
  },
  {
    nome: 'janela vazia nunca abre, e isso é configuração válida',
    janela: {},
    instante: '2026-10-06T12:00:00Z',
    fuso: SAO_PAULO,
    dentro: false,
    motivo: 'dia_sem_faixa',
    proximaAbertura: null,
  },
  {
    nome: 'fim em 24:00 disca às 23h de segunda',
    janela: { '1': { start: '09:00', end: '24:00' } },
    instante: '2026-10-06T02:00:00Z',
    fuso: SAO_PAULO,
    dentro: true,
    motivo: null,
    proximaAbertura: '2026-10-06T02:00:00Z',
  },

  // R-10: o mesmo instante, três leads, três respostas. Quem somar três horas
  // acerta São Paulo e erra os outros dois.
  {
    nome: '19h em São Paulo é fora da janela para o lead de São Paulo',
    janela: JANELA_ATE_AS_19,
    instante: '2026-10-06T22:00:00Z',
    fuso: SAO_PAULO,
    dentro: false,
    motivo: 'fora_da_faixa',
    proximaAbertura: '2026-10-07T12:00:00Z',
  },
  {
    nome: '19h em São Paulo é 18h em Manaus, e o lead de lá ainda recebe',
    janela: JANELA_ATE_AS_19,
    instante: '2026-10-06T22:00:00Z',
    fuso: MANAUS,
    dentro: true,
    motivo: null,
    proximaAbertura: '2026-10-06T22:00:00Z',
  },
  {
    nome: '19h em São Paulo é 20h em Noronha, e o lead de lá não recebe',
    janela: JANELA_ATE_AS_19,
    instante: '2026-10-06T22:00:00Z',
    fuso: NORONHA,
    dentro: false,
    motivo: 'fora_da_faixa',
    proximaAbertura: '2026-10-07T11:00:00Z',
  },

  // Configuração quebrada tem recusa própria. O banco recusa estas na escrita,
  // e é isso que o teste de PGlite cobra: janela malformada não chega à guarda.
  {
    nome: 'faixa sem end é configuração quebrada',
    janela: { '1': { start: '09:00' } },
    instante: '2026-10-06T12:00:00Z',
    fuso: SAO_PAULO,
    dentro: false,
    motivo: 'janela_invalida',
    proximaAbertura: null,
  },
  {
    nome: 'lista no lugar do objeto é configuração quebrada',
    janela: ['09:00', '18:00'],
    instante: '2026-10-06T12:00:00Z',
    fuso: SAO_PAULO,
    dentro: false,
    motivo: 'janela_invalida',
    proximaAbertura: null,
  },
  {
    nome: 'dia 7 é configuração quebrada: a semana vai de 0 a 6',
    janela: { '7': { start: '09:00', end: '18:00' } },
    instante: '2026-10-06T12:00:00Z',
    fuso: SAO_PAULO,
    dentro: false,
    motivo: 'janela_invalida',
    proximaAbertura: null,
  },
  {
    nome: 'faixa invertida é configuração quebrada',
    janela: { '2': { start: '18:00', end: '09:00' } },
    instante: '2026-10-06T12:00:00Z',
    fuso: SAO_PAULO,
    dentro: false,
    motivo: 'janela_invalida',
    proximaAbertura: null,
  },
  {
    nome: 'hora sem zero à esquerda é configuração quebrada',
    janela: { '2': { start: '9:00', end: '18:00' } },
    instante: '2026-10-06T12:00:00Z',
    fuso: SAO_PAULO,
    dentro: false,
    motivo: 'janela_invalida',
    proximaAbertura: null,
  },
]

/** Os casos que o gatilho do banco recusa na escrita. */
export const CASOS_INVALIDOS: readonly CasoDeJanela[] = CASOS_DE_JANELA.filter(
  (caso) => caso.motivo === 'janela_invalida',
)

/** Os casos que chegam à guarda, porque a coluna os aceita. */
export const CASOS_VALIDOS: readonly CasoDeJanela[] = CASOS_DE_JANELA.filter(
  (caso) => caso.motivo !== 'janela_invalida',
)
