// As decisões puras da tela de privacidade (RF-806, RF-807, L-18). Nada aqui
// toca React, rede nem Supabase.
//
// Duas regras dão forma ao arquivo. A prévia do aviso usa o mesmo módulo da
// amostra de voz e da publicação (`@compartilhado/agente/primeira-fala.ts`) e a
// mesma frase padrão da camada 1: uma segunda interpolação aqui mostraria uma
// frase que a ligação não diz. E o estado da gravação separa o declarado (a
// coluna) do medido (o que está publicado no provedor), que é a diferença que
// a F0 estabeleceu para o checklist e que L-18 torna obrigatória aqui.

import { interpolarPrimeiraFala } from '@compartilhado/agente/primeira-fala.ts'
import { FALAS_DE_TODO_PROPOSITO } from '@compartilhado/speech/todos-os-propositos.ts'

import { NOME_GENERICO } from '@/copy/assistente'
import type {
  GravacaoNoProvedor,
  IdentidadeDaPrevia,
  PrivacidadeDaConta,
} from '@/privacidade/tipos'

/** O padrão de `account_settings.retention_days` (RF-807). */
export const RETENCAO_PADRAO_DIAS = 90

/**
 * A privacidade com que a conta nasce: o `default` de cada coluna em
 * `account_settings`. `padroes-da-configuracao.test.ts` compara com a migração.
 */
export const PRIVACIDADE_PADRAO: PrivacidadeDaConta = {
  gravacaoLigada: true,
  avisoDeGravacao: null,
  retencaoDias: RETENCAO_PADRAO_DIAS,
}

/** O check `account_settings_retencao`, espelhado para recusar antes do banco. */
export const FAIXA_DA_RETENCAO = { minimo: 1, maximo: 3650 } as const

const INTEIRO = /^[0-9]+$/

/** O que está nos campos, como texto: o que a pessoa digitou, sem conversão. */
export interface RascunhoDaPrivacidade {
  gravacaoLigada: boolean
  /** Em branco é a frase padrão, que é o nulo da coluna. */
  aviso: string
  retencao: string
}

export type MotivoDaRetencao = 'nao-numero' | 'fora-da-faixa'

export type ValidacaoDaPrivacidade =
  | { ok: true; privacidade: PrivacidadeDaConta }
  | { ok: false; retencao: MotivoDaRetencao }

export function rascunhoDe(privacidade: PrivacidadeDaConta): RascunhoDaPrivacidade {
  return {
    gravacaoLigada: privacidade.gravacaoLigada,
    aviso: privacidade.avisoDeGravacao ?? '',
    retencao: String(privacidade.retencaoDias),
  }
}

export function validarPrivacidade(rascunho: RascunhoDaPrivacidade): ValidacaoDaPrivacidade {
  const texto = rascunho.retencao.trim()
  if (!INTEIRO.test(texto)) return { ok: false, retencao: 'nao-numero' }

  const dias = Number(texto)
  if (dias < FAIXA_DA_RETENCAO.minimo || dias > FAIXA_DA_RETENCAO.maximo) {
    return { ok: false, retencao: 'fora-da-faixa' }
  }

  const aviso = rascunho.aviso.trim()
  return {
    ok: true,
    privacidade: {
      gravacaoLigada: rascunho.gravacaoLigada,
      avisoDeGravacao: aviso === '' ? null : aviso,
      retencaoDias: dias,
    },
  }
}

/** Só o que mudou vai ao RPC, e a trilha registra só isso. */
export function mudancasDe(
  base: PrivacidadeDaConta,
  nova: PrivacidadeDaConta,
): Partial<PrivacidadeDaConta> {
  const mudancas: Partial<PrivacidadeDaConta> = {}
  if (base.gravacaoLigada !== nova.gravacaoLigada) mudancas.gravacaoLigada = nova.gravacaoLigada
  if (base.avisoDeGravacao !== nova.avisoDeGravacao) {
    mudancas.avisoDeGravacao = nova.avisoDeGravacao
  }
  if (base.retencaoDias !== nova.retencaoDias) mudancas.retencaoDias = nova.retencaoDias
  return mudancas
}

/**
 * Reduzir o prazo apaga o que já passou do prazo novo na próxima execução
 * diária. É o único caso que pede a contagem antes de salvar: aumentar não
 * apaga nada, e o expurgo já feito não volta.
 */
export function reduzPrazo(base: PrivacidadeDaConta, nova: PrivacidadeDaConta): boolean {
  return nova.retencaoDias < base.retencaoDias
}

/**
 * O aviso como o lead de exemplo o ouviria no começo da ligação. É o que
 * `call-init` monta: o texto da conta, ou a frase da camada 1 quando ele está
 * em branco, com os marcadores da conta resolvidos.
 */
export function previaDoAviso(aviso: string, identidade: IdentidadeDaPrevia | null): string {
  const texto = aviso.trim() === '' ? FALAS_DE_TODO_PROPOSITO.avisoDeGravacao : aviso.trim()
  return interpolarPrimeiraFala(texto, {
    nome: identidade?.nome.trim() || NOME_GENERICO,
    empresa: identidade?.empresa.trim() ?? '',
    nuncaAfirmar: [],
  })
}

/**
 * Os três estados da gravação que a tela distingue.
 *
 * `desligada-no-painel` é o de L-18: a coluna diz desligada, e há propósito no
 * ar com a configuração anterior. A tela não pode dizer "desligada" aí, porque
 * o provedor continua guardando o áudio e o cliente acreditaria o contrário.
 */
export type EstadoDaGravacao = 'ligada' | 'desligada' | 'desligada-no-painel'

export function estadoDaGravacao(
  privacidade: PrivacidadeDaConta,
  noProvedor: GravacaoNoProvedor,
): EstadoDaGravacao {
  if (privacidade.gravacaoLigada) return 'ligada'
  return noProvedor.propositosPendentes.length > 0 ? 'desligada-no-painel' : 'desligada'
}
