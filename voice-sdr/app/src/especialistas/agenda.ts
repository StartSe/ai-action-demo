// As regras da agenda do especialista, sem renderizar nada (US-176).
//
// Faixa semanal e bloqueio são relógio de parede **no fuso do especialista**
// (T-21). A conta de fuso não se refaz aqui: quem converte relógio em instante
// e instante em relógio é `_shared/agenda/horarios.ts`, o mesmo módulo que
// gera os horários que a Sarah oferece. Duas conversões seriam duas verdades, e
// a divergência só apareceria na voz dela oferecendo um horário que não existe.
//
// A ordem das horas se confere aqui antes de mandar; o check da tabela é a
// segunda linha, e a mensagem dele não é frase para ninguém ler.

import { instanteDoRelogio, relogioEm } from '@compartilhado/agenda/horarios.ts'

import type { Bloqueio, FaixaSemanal } from '@/especialistas/tipos'

/** Segunda primeiro, como quem monta a semana de trabalho lê. 0 é domingo. */
export const DIAS_NA_ORDEM_DA_SEMANA = [1, 2, 3, 4, 5, 6, 0] as const

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const DATA = /^(\d{4})-(\d{2})-(\d{2})$/

export type ProblemaDaFaixa = 'hora' | 'ordem'

/**
 * O que impede a faixa. `HH:MM` compara como texto, e é por isso que a ordem
 * dispensa conversão: o dia é o mesmo e o fuso também.
 */
export function problemaDaFaixa(inicio: string, fim: string): ProblemaDaFaixa | null {
  if (!HORA.test(inicio) || !HORA.test(fim)) return 'hora'
  // Igual também é recusa: faixa de duração zero não é agenda.
  if (fim <= inicio) return 'ordem'
  return null
}

/** O bloqueio como o formulário o guarda: data e hora separadas, no fuso dele. */
export interface RascunhoDeBloqueio {
  dataInicio: string
  horaInicio: string
  dataFim: string
  horaFim: string
  motivo: string
}

export type ProblemaDoBloqueio = 'inicio' | 'fim' | 'ordem'

export type LeituraDoBloqueio =
  | { ok: true; inicio: string; fim: string; motivo: string | null }
  | { ok: false; problema: ProblemaDoBloqueio }

/**
 * O rascunho vira dois instantes no fuso do especialista. Relógio que não
 * existiu naquele dia (buraco de horário de verão) adianta, pela mesma regra
 * de `horarios.ts`.
 */
export function lerBloqueio(rascunho: RascunhoDeBloqueio, fuso: string): LeituraDoBloqueio {
  const inicio = instanteNoFuso(rascunho.dataInicio, rascunho.horaInicio, fuso)
  if (inicio === null) return { ok: false, problema: 'inicio' }
  const fim = instanteNoFuso(rascunho.dataFim, rascunho.horaFim, fuso)
  if (fim === null) return { ok: false, problema: 'fim' }
  if (fim <= inicio) return { ok: false, problema: 'ordem' }
  const motivo = rascunho.motivo.trim()
  return {
    ok: true,
    inicio: new Date(inicio).toISOString(),
    fim: new Date(fim).toISOString(),
    // Vazio vira nulo: o check da tabela recusa motivo em branco.
    motivo: motivo === '' ? null : motivo,
  }
}

function instanteNoFuso(data: string, hora: string, fuso: string): number | null {
  const partes = DATA.exec(data)
  if (!partes || !HORA.test(hora)) return null
  const [ano, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])]
  // `Date.UTC` normaliza 31 de fevereiro para março; a data que não volta
  // igual não existe.
  const conferida = new Date(Date.UTC(ano, mes - 1, dia))
  if (conferida.getUTCMonth() !== mes - 1 || conferida.getUTCDate() !== dia) return null
  const [horas, minutos] = hora.split(':').map(Number) as [number, number]
  return instanteDoRelogio(fuso, { ano, mes, dia }, horas * 60 + minutos)
}

/** "07/10/2026 14:30" no fuso pedido, lido pelo mesmo módulo que gera horário. */
export function rotularNoFuso(instante: string, fuso: string): string {
  const relogio = relogioEm(instante, fuso)
  return `${dois(relogio.dia)}/${dois(relogio.mes)}/${relogio.ano} ${dois(relogio.hora)}:${dois(relogio.minuto)}`
}

function dois(valor: number): string {
  return String(valor).padStart(2, '0')
}

/**
 * Os bloqueios que ainda importam, do mais próximo para o mais distante, e os
 * que já passaram, do mais recente para o mais antigo. O que está em curso
 * conta como próximo: ainda fecha a agenda agora.
 */
export function separarBloqueios(
  bloqueios: readonly Bloqueio[],
  agora: number,
): { proximos: Bloqueio[]; passados: Bloqueio[] } {
  const fimDe = (bloqueio: Bloqueio) => Date.parse(bloqueio.fim)
  const inicioDe = (bloqueio: Bloqueio) => Date.parse(bloqueio.inicio)
  return {
    proximos: bloqueios
      .filter((bloqueio) => fimDe(bloqueio) > agora)
      .sort((a, b) => inicioDe(a) - inicioDe(b)),
    passados: bloqueios
      .filter((bloqueio) => fimDe(bloqueio) <= agora)
      .sort((a, b) => inicioDe(b) - inicioDe(a)),
  }
}

/** As faixas de um dia, da mais cedo para a mais tarde. */
export function faixasDoDia(faixas: readonly FaixaSemanal[], dia: number): FaixaSemanal[] {
  return faixas
    .filter((faixa) => faixa.diaDaSemana === dia)
    .sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0))
}

/** O `time` do Postgres (`09:00:00`) na forma que a tela edita (`09:00`). */
export function horaDoBanco(valor: string): string {
  return valor.slice(0, 5)
}
