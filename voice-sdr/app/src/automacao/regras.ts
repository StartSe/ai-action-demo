/**
 * O rascunho da tela de automação e a conferência dele, com as mesmas faixas
 * dos checks de `account_settings`. A tela confere para dizer onde está o erro;
 * quem decide é o banco, e a recusa dele volta como `valor-recusado`.
 *
 * Os turnos se escrevem um por linha, "manha 09:00-12:00", e são conferidos
 * por `lerTurnos` do módulo compartilhado: as mesmas regras de
 * `turnos_de_retentativa_validos`.
 */

import { lerTurnos } from '@compartilhado/automacao/politica-de-retentativa.ts'

import type { AutomacaoDaConta, TurnoDeRetentativa } from '@/automacao/tipos'

export interface RascunhoDaAutomacao {
  lembreteInicioMinutos: string
  lembreteFimMinutos: string
  retentativaTeto: string
  retentativaRecuosMinutos: string
  retentativaOcupadoMinutos: string
  turnos: string
  resgateTeto: string
  resgateRecuoMinutos: string
}

export type CampoDaAutomacao = keyof RascunhoDaAutomacao

/** As faixas dos checks das colunas. */
export const FAIXAS_DA_AUTOMACAO: Readonly<Record<Exclude<CampoDaAutomacao, 'turnos' | 'retentativaRecuosMinutos'>, { minimo: number; maximo: number }>> = {
  lembreteInicioMinutos: { minimo: 0, maximo: 1439 },
  lembreteFimMinutos: { minimo: 1, maximo: 1440 },
  retentativaTeto: { minimo: 1, maximo: 10 },
  retentativaOcupadoMinutos: { minimo: 1, maximo: 1440 },
  resgateTeto: { minimo: 0, maximo: 10 },
  resgateRecuoMinutos: { minimo: 1, maximo: 20160 },
}

export const FAIXA_DO_RECUO = { minimo: 1, maximo: 10080, quantos: 10 } as const

export type MotivoDoCampoDaAutomacao = 'obrigatorio' | 'fora-da-faixa' | 'formato' | 'janela-invertida'

export type ErrosDaAutomacao = Partial<Record<CampoDaAutomacao, MotivoDoCampoDaAutomacao>>

export function turnosEmTexto(turnos: readonly TurnoDeRetentativa[]): string {
  return turnos.map((turno) => `${turno.name} ${turno.start}-${turno.end}`).join('\n')
}

export function rascunhoDaAutomacao(automacao: AutomacaoDaConta): RascunhoDaAutomacao {
  return {
    lembreteInicioMinutos: String(automacao.lembreteInicioMinutos),
    lembreteFimMinutos: String(automacao.lembreteFimMinutos),
    retentativaTeto: String(automacao.retentativaTeto),
    retentativaRecuosMinutos: automacao.retentativaRecuosMinutos.join(', '),
    retentativaOcupadoMinutos: String(automacao.retentativaOcupadoMinutos),
    turnos: turnosEmTexto(automacao.turnos),
    resgateTeto: String(automacao.resgateTeto),
    resgateRecuoMinutos: String(automacao.resgateRecuoMinutos),
  }
}

function inteiro(texto: string): number | null {
  const limpo = texto.trim()
  return /^\d+$/.test(limpo) ? Number(limpo) : null
}

const LINHA_DE_TURNO = /^(\S+)\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/

function lerLinhasDeTurno(texto: string): TurnoDeRetentativa[] | null {
  const linhas = texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '')
  if (linhas.length === 0) return null
  const turnos: TurnoDeRetentativa[] = []
  for (const linha of linhas) {
    const partes = LINHA_DE_TURNO.exec(linha)
    if (!partes) return null
    turnos.push({ name: partes[1]!, start: partes[2]!, end: partes[3]! })
  }
  try {
    lerTurnos(turnos)
  } catch {
    return null
  }
  return turnos.length <= 6 ? turnos : null
}

export type ValidacaoDaAutomacao =
  | { ok: true; automacao: AutomacaoDaConta }
  | { ok: false; erros: ErrosDaAutomacao }

export function validarAutomacao(rascunho: RascunhoDaAutomacao): ValidacaoDaAutomacao {
  const erros: ErrosDaAutomacao = {}
  const numeros: Partial<Record<keyof typeof FAIXAS_DA_AUTOMACAO, number>> = {}
  for (const [campo, faixa] of Object.entries(FAIXAS_DA_AUTOMACAO) as [keyof typeof FAIXAS_DA_AUTOMACAO, { minimo: number; maximo: number }][]) {
    const bruto = rascunho[campo]
    if (bruto.trim() === '') {
      erros[campo] = 'obrigatorio'
      continue
    }
    const valor = inteiro(bruto)
    if (valor === null || valor < faixa.minimo || valor > faixa.maximo) {
      erros[campo] = 'fora-da-faixa'
      continue
    }
    numeros[campo] = valor
  }

  if (
    numeros.lembreteInicioMinutos !== undefined &&
    numeros.lembreteFimMinutos !== undefined &&
    numeros.lembreteInicioMinutos >= numeros.lembreteFimMinutos
  ) {
    erros.lembreteFimMinutos = 'janela-invertida'
  }

  const recuos = rascunho.retentativaRecuosMinutos
    .split(',')
    .map((parte) => parte.trim())
    .filter((parte) => parte !== '')
    .map(inteiro)
  if (recuos.length === 0) {
    erros.retentativaRecuosMinutos = 'obrigatorio'
  } else if (
    recuos.length > FAIXA_DO_RECUO.quantos ||
    recuos.some((valor) => valor === null || valor < FAIXA_DO_RECUO.minimo || valor > FAIXA_DO_RECUO.maximo)
  ) {
    erros.retentativaRecuosMinutos = 'fora-da-faixa'
  }

  const turnos = lerLinhasDeTurno(rascunho.turnos)
  if (turnos === null) erros.turnos = rascunho.turnos.trim() === '' ? 'obrigatorio' : 'formato'

  if (Object.keys(erros).length > 0 || turnos === null) return { ok: false, erros }
  return {
    ok: true,
    automacao: {
      lembreteInicioMinutos: numeros.lembreteInicioMinutos!,
      lembreteFimMinutos: numeros.lembreteFimMinutos!,
      retentativaTeto: numeros.retentativaTeto!,
      retentativaRecuosMinutos: recuos as number[],
      retentativaOcupadoMinutos: numeros.retentativaOcupadoMinutos!,
      turnos,
      resgateTeto: numeros.resgateTeto!,
      resgateRecuoMinutos: numeros.resgateRecuoMinutos!,
    },
  }
}

/** Só o que mudou, para a trilha registrar só isso. */
export function mudancasDaAutomacao(base: AutomacaoDaConta, nova: AutomacaoDaConta): Partial<AutomacaoDaConta> {
  const mudancas: Partial<AutomacaoDaConta> = {}
  for (const campo of Object.keys(nova) as (keyof AutomacaoDaConta)[]) {
    if (JSON.stringify(base[campo]) !== JSON.stringify(nova[campo])) {
      ;(mudancas as Record<string, unknown>)[campo] = nova[campo]
    }
  }
  return mudancas
}
