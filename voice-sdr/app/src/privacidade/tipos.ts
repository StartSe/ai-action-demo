/**
 * O que a tela de privacidade conhece. As colunas moram em `account_settings`
 * (US-045) e a escrita passa por `definir_privacidade`, que exige o dono e
 * grava o motivo na trilha (RF-008).
 */

import type { Proposito } from '@compartilhado/playbook/camada-um.ts'

export interface PrivacidadeDaConta {
  gravacaoLigada: boolean
  /** Nulo é a frase da camada 1 (`FALAS_DE_TODO_PROPOSITO.avisoDeGravacao`). */
  avisoDeGravacao: string | null
  retencaoDias: number
}

export type CampoDaPrivacidade = keyof PrivacidadeDaConta

/**
 * O que está no ar, medido e não deduzido: os propósitos publicados com um
 * hash diferente do que a configuração de agora compilaria, com a gravação
 * desligada. Enquanto a lista não estiver vazia, o provedor pode continuar
 * gravando (L-18).
 */
export interface GravacaoNoProvedor {
  propositosPendentes: readonly Proposito[]
}

/** Nome e empresa da Sarah, para a prévia do aviso soar como a ligação. */
export interface IdentidadeDaPrevia {
  nome: string
  empresa: string
}

export type MotivoDeFalhaDaPrivacidade =
  | 'sem-permissao'
  | 'sem-conta'
  | 'falha-de-comunicacao'
  /** O banco recusou um valor (check da coluna). */
  | 'valor-recusado'

export type CargaDaPrivacidade =
  | {
      ok: true
      privacidade: PrivacidadeDaConta
      noProvedor: GravacaoNoProvedor
      identidade: IdentidadeDaPrevia | null
    }
  /** A conta existe e a linha de configuração não: é o estado vazio da tela. */
  | { ok: true; privacidade: null }
  | { ok: false; motivo: MotivoDeFalhaDaPrivacidade }

export type GravacaoDaPrivacidade =
  | { ok: true; privacidade: PrivacidadeDaConta }
  | { ok: false; motivo: MotivoDeFalhaDaPrivacidade }

export type ContagemForaDoPrazo =
  | { ok: true; chamadas: number }
  | { ok: false; motivo: MotivoDeFalhaDaPrivacidade }

/**
 * O contrato que a interface conhece. Implementação sobre o Supabase em
 * `servico-supabase.ts`; dublê de teste em `app/src/testes/`. Republicar não
 * mora aqui: é `agent-publish`, pelo serviço da Sarah.
 */
export interface ServicoDePrivacidade {
  carregar(): Promise<CargaDaPrivacidade>
  /** Quantas chamadas a próxima execução do expurgo apagaria com este prazo. */
  contarForaDoPrazo(dias: number): Promise<ContagemForaDoPrazo>
  /** Grava só os campos informados, com o motivo que vai para a trilha. */
  salvar(
    mudancas: Partial<PrivacidadeDaConta>,
    motivo: string,
  ): Promise<GravacaoDaPrivacidade>
}
