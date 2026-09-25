/**
 * O que a tela `/config/bloqueios` conhece. A tabela é `dnc_entries` (US-049),
 * e remover é `update` com instante e motivo, nunca `delete`: RF-804 pede
 * remoção registrada.
 */

import type { MotivoDeRecusa } from '@compartilhado/telefone.ts'

/** As quatro origens do check de `dnc_entries.source`. */
export const ORIGENS = ['manual', 'import', 'lead_request', 'wrong_number'] as const

export type OrigemDoBloqueio = (typeof ORIGENS)[number]

export const ESTADOS = ['ativo', 'removido'] as const

export type EstadoDoBloqueio = (typeof ESTADOS)[number]

export interface Bloqueio {
  id: string
  e164: string
  motivo: string
  origem: OrigemDoBloqueio
  observacao: string | null
  /** Nulo é bloqueio vindo do servidor, sem sessão: a ligação. */
  incluidoPor: string | null
  incluidoEm: string
  removidoEm: string | null
  removidoPor: string | null
  motivoDaRemocao: string | null
}

export interface RecorteDeBloqueios {
  estado: EstadoDoBloqueio
  origem: OrigemDoBloqueio | 'todas'
}

export type MotivoDeFalhaDosBloqueios =
  | 'sem-permissao'
  | 'sem-conta'
  /** O único parcial recusou: o número já tem bloqueio ativo. */
  | 'ja-bloqueado'
  /** O banco recusou um valor (check do número ou do motivo). */
  | 'valor-recusado'
  | 'falha-de-comunicacao'

export type CargaDosBloqueios =
  | {
      ok: true
      bloqueios: Bloqueio[]
      /**
       * A conta tem algum bloqueio, em qualquer estado. É o que separa os dois
       * vazios da tela: conta sem lista nenhuma e recorte sem resultado.
       */
      haBloqueios: boolean
    }
  | { ok: false; motivo: MotivoDeFalhaDosBloqueios }

export interface InclusaoDeBloqueio {
  /** Já normalizado por `@compartilhado/telefone.ts`. */
  e164: string
  motivo: string
}

export type EscritaDoBloqueio =
  | { ok: true }
  | { ok: false; motivo: MotivoDeFalhaDosBloqueios }

/** Uma linha da lista que não virou número. */
export interface LinhaInvalida {
  /** Posição na lista colada, começando em 1. */
  linha: number
  bruto: string
  motivo: MotivoDeRecusa
}

/**
 * A prévia da importação: o mesmo contrato da importação de leads (F1). Nada é
 * gravado até a confirmação, e a confirmação recalcula tudo a partir do texto.
 */
export interface PreviaDaImportacao {
  /** E.164 sem repetição, na ordem da lista. É o que a confirmação grava. */
  validos: string[]
  invalidos: LinhaInvalida[]
  /** Já têm bloqueio ativo e ficam como estão. */
  jaBloqueados: string[]
  /** Linhas que repetem um número que já apareceu antes na mesma lista. */
  repetidos: number
}

export type ResultadoDaPrevia =
  | { ok: true; previa: PreviaDaImportacao }
  | { ok: false; motivo: MotivoDeFalhaDosBloqueios }

export type ResultadoDaImportacao =
  | { ok: true; gravados: number; previa: PreviaDaImportacao }
  | { ok: false; motivo: MotivoDeFalhaDosBloqueios }

/**
 * O contrato que a interface conhece. Implementação sobre o Supabase em
 * `servico-supabase.ts`; dublê de teste em `app/src/testes/`.
 */
export interface ServicoDeBloqueios {
  carregar(recorte: RecorteDeBloqueios): Promise<CargaDosBloqueios>
  incluir(inclusao: InclusaoDeBloqueio): Promise<EscritaDoBloqueio>
  /** Lê os bloqueios ativos e compara com a lista. Não grava nada. */
  preverImportacao(texto: string): Promise<ResultadoDaPrevia>
  /** Recalcula a prévia a partir do texto e grava os válidos com `source='import'`. */
  importar(texto: string, motivo: string): Promise<ResultadoDaImportacao>
  /** `update` com `removed_at` e `removal_reason`; quem removeu, o banco carimba. */
  remover(id: string, motivo: string): Promise<EscritaDoBloqueio>
}
