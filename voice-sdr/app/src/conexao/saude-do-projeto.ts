// A pergunta que a interface faz ao projeto antes de usá-lo: a função `saude`.
//
// Ela é pública (`verify_jwt = false`) e responde sem sessão, então serve à
// tela de conexão, que ainda não tem cliente do Supabase, e ao aviso de versão,
// que roda com a sessão já aberta. O formato é o de
// `supabase/functions/saude/saude.ts`, lido de lá para não haver segunda versão.

import { VERSAO_DA_INSTALACAO } from '@compartilhado/versao-da-instalacao.ts'
import type { CorpoDaSaude, VersaoRegistrada } from '@saude/saude.ts'

export type ResultadoDaConferencia =
  | {
      readonly estado: 'pronto'
      readonly chave: string | null
      readonly versao: CorpoDaSaude['versao']
    }
  /** O projeto respondeu, mas a função não existe: a instalação não foi feita. */
  | { readonly estado: 'sem_instalacao' }
  /** A função respondeu que o banco não está pronto. */
  | { readonly estado: 'instalacao_incompleta' }
  /** Nem o projeto respondeu: endereço errado, projeto pausado ou rede. */
  | { readonly estado: 'inalcancavel' }

/** Quanto a tela espera antes de dizer que o projeto não respondeu. */
export const PRAZO_DA_CONFERENCIA_MS = 10_000

export async function conferirProjeto(
  url: string,
  buscar: typeof fetch = fetch,
): Promise<ResultadoDaConferencia> {
  let resposta: Response
  try {
    resposta = await buscar(`${url}/functions/v1/saude`, {
      method: 'GET',
      signal: AbortSignal.timeout(PRAZO_DA_CONFERENCIA_MS),
    })
  } catch {
    return { estado: 'inalcancavel' }
  }

  if (resposta.status === 404) return { estado: 'sem_instalacao' }

  let corpo: Partial<CorpoDaSaude> | null
  try {
    corpo = (await resposta.json()) as Partial<CorpoDaSaude>
  } catch {
    corpo = null
  }
  if (!corpo || typeof corpo.ok !== 'boolean' || !corpo.versao) {
    return resposta.ok ? { estado: 'sem_instalacao' } : { estado: 'inalcancavel' }
  }
  if (!corpo.ok) return { estado: 'instalacao_incompleta' }
  return {
    estado: 'pronto',
    chave: typeof corpo.chave === 'string' ? corpo.chave : null,
    versao: corpo.versao,
  }
}

export type SituacaoDaVersao =
  | 'em_dia'
  /** O banco ficou para trás desta cópia: falta reinstalar pelo painel. */
  | 'banco_atrasado'
  /** O banco já está numa versão que esta cópia não conhece. */
  | 'copia_atrasada'
  /** Mesma migração, funções publicadas de outra geração. */
  | 'funcoes_diferentes'
  /** O projeto não registrou versão (instalado por fora do painel). */
  | 'desconhecida'

/**
 * Compara a versão que esta cópia espera com a do projeto.
 *
 * A migração é o que dá ordem: é uma data (`AAAAMMDDHHMMSS`), e a comparação
 * de texto entre datas de mesmo tamanho é a comparação delas. As funções só
 * têm resumo, que diz "igual" ou "diferente", nunca qual é mais nova.
 */
export function situacaoDaVersao(
  projeto: CorpoDaSaude['versao'],
  esperada: VersaoRegistrada = VERSAO_DA_INSTALACAO,
): SituacaoDaVersao {
  const migracao = projeto.banco?.migracao ?? null
  if (!migracao || !esperada.migracao) return 'desconhecida'
  if (migracao < esperada.migracao) return 'banco_atrasado'
  if (migracao > esperada.migracao) return 'copia_atrasada'
  const publicadas = projeto.funcoes.funcoes
  if (publicadas && esperada.funcoes && publicadas !== esperada.funcoes) return 'funcoes_diferentes'
  return 'em_dia'
}
