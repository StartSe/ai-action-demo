/**
 * A automação da conta (US-190): a janela do lembrete, a retentativa por
 * resultado da ligação e o resgate de falta atestada. As colunas moram em
 * `account_settings` e a escrita passa por `definir_automacao_da_conta`, que
 * grava o motivo na trilha (RF-008).
 */

import type { TurnoDeRetentativa } from '@compartilhado/automacao/politica-de-retentativa.ts'

export type { TurnoDeRetentativa }

export interface AutomacaoDaConta {
  /** O lembrete sai para a reunião que começa entre início e fim, em minutos a partir de agora. */
  lembreteInicioMinutos: number
  lembreteFimMinutos: number
  retentativaTeto: number
  /** A espera depois de cada tentativa sem atendimento; o último valor se repete. */
  retentativaRecuosMinutos: number[]
  retentativaOcupadoMinutos: number
  turnos: TurnoDeRetentativa[]
  /** Zero desliga o resgate. */
  resgateTeto: number
  resgateRecuoMinutos: number
}

export type MotivoDeFalhaDaAutomacao =
  | 'sem-permissao'
  | 'sem-conta'
  | 'falha-de-comunicacao'
  | 'valor-recusado'

export type CargaDaAutomacao =
  | { ok: true; automacao: AutomacaoDaConta | null }
  | { ok: false; motivo: MotivoDeFalhaDaAutomacao }

export type GravacaoDaAutomacao =
  | { ok: true; automacao: AutomacaoDaConta }
  | { ok: false; motivo: MotivoDeFalhaDaAutomacao }

export interface ServicoDeAutomacao {
  carregar(): Promise<CargaDaAutomacao>
  /** Grava só os campos informados, com o motivo que vai para a trilha. */
  salvar(mudancas: Partial<AutomacaoDaConta>, motivo: string): Promise<GravacaoDaAutomacao>
}
