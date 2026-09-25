// Falas da agenda: a oferta de horários, a confirmação, o horário tomado e o
// contorno. Quem as emite é o servidor, na resposta de tool-availability e de
// tool-book-meeting, e por isso moram aqui e não em `app/src/copy/`.
//
// Três decisões que valem para toda fala de horário do produto:
//
// 1. **O horário se diz no fuso do lead**, e o do especialista entra só quando
//    o relógio dele é outro naquele instante: "14h no seu horário, 15h aqui em
//    São Paulo" (T-21). Quando os dois relógios coincidem, a frase não fala de
//    fuso nenhum — dizer o óbvio em ligação é ruído. A comparação é pelo relógio
//    do instante, e não pelo nome do fuso: Belém e São Paulo têm nomes
//    diferentes e o mesmo relógio.
// 2. **A oferta se lê por posição**, "opção um, opção dois", até quatro, sem
//    identificador nenhum (T-09). É a posição que tool-book-meeting resolve.
// 3. **Meia hora se diz "14h30"**, e hora cheia "14h"; meia-noite se diz
//    "meia-noite" e meio-dia "meio-dia". Uma forma só, provada no teste, para
//    que duas ferramentas não inventem duas leituras do mesmo horário.
//
// A conversão de fuso é de `_shared/agenda/horarios.ts` (`relogioEm`); aqui
// só se monta a frase. Nomes de dia são arrays em português, nunca `Intl`.

import { relogioEm, type RelogioLocal } from '../agenda/horarios.ts'

import { FALAS_DAS_FERRAMENTAS } from './ferramentas.ts'

/** Um horário oferecido, como a fala o precisa: início e os dois fusos. */
export interface HorarioFalado {
  readonly inicio: string
  readonly fusoDoLead: string
  readonly fusoDoEspecialista: string
}

const DIAS_FALADOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

const POSICOES_FALADAS = ['um', 'dois', 'três', 'quatro']

/**
 * Onde o especialista está, dito em voz alta. As cinco zonas do país
 * (`_shared/ddd.ts`) mais as que costumam aparecer; fuso fora da lista cai em
 * "no horário do especialista", que é verdade sem inventar cidade.
 */
const LUGARES_DOS_FUSOS: ReadonlyMap<string, string> = new Map([
  ['America/Sao_Paulo', 'aqui em São Paulo'],
  ['America/Manaus', 'aqui em Manaus'],
  ['America/Rio_Branco', 'aqui em Rio Branco'],
  ['America/Campo_Grande', 'aqui em Campo Grande'],
  ['America/Cuiaba', 'aqui em Cuiabá'],
  ['America/Belem', 'aqui em Belém'],
  ['America/Fortaleza', 'aqui em Fortaleza'],
  ['America/Recife', 'aqui em Recife'],
  ['America/Bahia', 'aqui em Salvador'],
  ['America/Noronha', 'aqui em Noronha'],
])

/** "14h", "14h30", "meia-noite", "meio-dia", "meia-noite e meia". */
export function falarHora(hora: number, minuto: number): string {
  if (hora === 0 && minuto === 0) return 'meia-noite'
  if (hora === 12 && minuto === 0) return 'meio-dia'
  if (hora === 0 && minuto === 30) return 'meia-noite e meia'
  if (hora === 12 && minuto === 30) return 'meio-dia e meia'
  return minuto === 0 ? `${hora}h` : `${hora}h${String(minuto).padStart(2, '0')}`
}

/** "hoje", "amanhã", o dia da semana até seis dias, e com a data depois disso. */
function falarDia(relogio: RelogioLocal, hoje: RelogioLocal): string {
  const distancia = relogio.diaCivil - hoje.diaCivil
  if (distancia === 0) return 'hoje'
  if (distancia === 1) return 'amanhã'
  const nome = DIAS_FALADOS[relogio.diaDaSemana] ?? ''
  return distancia > 1 && distancia < 7 ? nome : `${nome}, dia ${relogio.dia},`
}

/** "às 14h", mas "ao meio-dia" e "à meia-noite": a preposição muda com a hora. */
function preposicao(hora: string): string {
  if (hora.startsWith('meio-dia')) return `ao ${hora}`
  if (hora.startsWith('meia-noite')) return `à ${hora}`
  return `às ${hora}`
}

/**
 * O horário inteiro, no fuso do lead, com o do especialista quando o relógio
 * dele é outro: "terça às 14h no seu horário, 15h aqui em São Paulo".
 */
export function falarHorario(horario: HorarioFalado, agora: string): string {
  const doLead = relogioEm(horario.inicio, horario.fusoDoLead)
  const hojeDoLead = relogioEm(agora, horario.fusoDoLead)
  const horaDoLead = falarHora(doLead.hora, doLead.minuto)
  const base = `${falarDia(doLead, hojeDoLead)} ${preposicao(horaDoLead)}`

  const doEspecialista = relogioEm(horario.inicio, horario.fusoDoEspecialista)
  const mesmoRelogio =
    doEspecialista.diaCivil === doLead.diaCivil &&
    doEspecialista.hora === doLead.hora &&
    doEspecialista.minuto === doLead.minuto
  if (mesmoRelogio) return base

  const lugar = LUGARES_DOS_FUSOS.get(horario.fusoDoEspecialista) ?? 'no horário do especialista'
  const horaDeLa = falarHora(doEspecialista.hora, doEspecialista.minuto)
  // Perto da meia-noite o dia de lá é outro, e a frase precisa dizer qual.
  const diaDeLa =
    doEspecialista.diaCivil === doLead.diaCivil
      ? ''
      : ` de ${DIAS_FALADOS[doEspecialista.diaDaSemana] ?? ''}`
  return `${base} no seu horário, ${horaDeLa}${diaDeLa} ${lugar}`
}

/**
 * A oferta, lida por posição: "Tenho estas opções: opção um, terça às 14h;
 * opção dois, terça às 16h. Qual fica melhor pra você?". Até quatro; lista
 * vazia é a fala de agenda cheia.
 */
export function falarOferta(horarios: readonly HorarioFalado[], agora: string): string {
  if (horarios.length === 0) return FALAS_DA_AGENDA.agendaCheia
  if (horarios.length > POSICOES_FALADAS.length) {
    throw new Error(`a oferta tem no máximo ${POSICOES_FALADAS.length} horários: ${horarios.length}`)
  }
  if (horarios.length === 1) {
    return `Tenho um horário: ${falarHorario(horarios[0]!, agora)}. Fica bom pra você?`
  }
  const opcoes = horarios
    .map((horario, indice) => `opção ${POSICOES_FALADAS[indice]}, ${falarHorario(horario, agora)}`)
    .join('; ')
  return `Tenho estas opções: ${opcoes}. Qual fica melhor pra você?`
}

/** A confirmação depois de a reunião ser gravada. */
export function falarConfirmacao(horario: HorarioFalado, agora: string): string {
  return `Fechado, ficou marcado pra ${falarHorario(horario, agora)}. Vou te mandar o convite por e-mail.`
}

export const FALAS_DA_AGENDA = {
  /** O 23P01 da restrição de exclusão, dito como o PRD manda (seção 5). */
  horarioTomado: 'Esse horário acabou de ser preenchido, deixa eu ver outro.',
  /** Falha de qualquer outra natureza: a mesma frase de contorno das ferramentas. */
  falha: FALAS_DAS_FERRAMENTAS.falha,
  /** Nenhum horário no horizonte. Não promete instante nenhum (O-06). */
  agendaCheia:
    'Poxa, a agenda está bem cheia nos próximos dias. Deixa eu pedir pro time te chamar com uma opção, tá bom?',
  /**
   * A posição escolhida não é de oferta nenhuma desta chamada, ou a oferta
   * venceu. As duas pedem nova consulta: a frase faz o roteiro chamar
   * `tool-availability` de novo, como a do horário tomado.
   */
  ofertaSemValidade: 'Deixa eu olhar a agenda de novo pra te passar os horários certinhos.',
  /** O dia do especialista lotou entre a oferta e a escolha. */
  diaLotado: 'Esse dia acabou de lotar, deixa eu ver outro dia pra você.',
  /** O horário ficou perto demais de agora para a antecedência do especialista. */
  emCimaDaHora: 'Esse horário ficou em cima da hora pra marcar, deixa eu ver um pouco mais pra frente.',
  /** O horário passou do horizonte que o especialista aceita. */
  longeDemais: 'Esse horário ficou longe demais na agenda, deixa eu ver uma data mais próxima.',
  /** O lead já tem reunião ativa: marcar outra é remarcar, e remarcar não é esta ferramenta. */
  jaTemReuniao: 'Vi aqui que você já tem uma conversa marcada com a gente, então vou manter essa, tá bom?',
  /** O especialista foi desligado entre a oferta e a escolha. */
  especialistaSaiu: 'Essa agenda acabou de sair do ar, deixa eu ver outro horário com o time.',
  /** A modalidade que veio não é uma das três. */
  qualModalidade: 'Você prefere fazer por vídeo, por telefone ou presencial?',
} as const
