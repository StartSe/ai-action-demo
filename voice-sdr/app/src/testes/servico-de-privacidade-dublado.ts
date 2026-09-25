import { PROPOSITOS } from '@compartilhado/playbook/camada-um.ts'

import { FAIXA_DA_RETENCAO } from '@/privacidade/privacidade'
import type {
  CargaDaPrivacidade,
  ContagemForaDoPrazo,
  GravacaoDaPrivacidade,
  IdentidadeDaPrevia,
  PrivacidadeDaConta,
  ServicoDePrivacidade,
} from '@/privacidade/tipos'

export interface GravacaoDaPrivacidadeDublada {
  mudancas: Partial<PrivacidadeDaConta>
  motivo: string
}

export interface RespostasDePrivacidade {
  /** Quando presente, o dublê devolve isto e ignora o estado em memória. */
  carregar?: CargaDaPrivacidade
  privacidade?: PrivacidadeDaConta
  /**
   * A gravação que está no ar no provedor, ou null quando nada foi publicado.
   * O padrão é a Sarah publicada com a gravação ligada.
   */
  noAr?: { gravacaoLigada: boolean } | null
  identidade?: IdentidadeDaPrevia | null
  /** Há quantos dias terminou cada chamada com conteúdo da conta. */
  chamadasTerminadasHaDias?: readonly number[]
  /** Recusa a gravação, para provar a frase de cada motivo. */
  salvar?: GravacaoDaPrivacidade
}

export interface ServicoDePrivacidadeDublado extends ServicoDePrivacidade {
  /** Toda gravação pedida, na ordem: é o que prova o que foi ao RPC. */
  readonly gravacoes: GravacaoDaPrivacidadeDublada[]
  /** Toda contagem pedida, na ordem. */
  readonly contagens: number[]
  /**
   * O que `agent-publish` faz do ponto de vista da privacidade: o que está no
   * ar passa a ser o que está gravado. Quem o chama no teste é o dublê da
   * Sarah, ao republicar.
   */
  publicar(): void
}

/** Os padrões das colunas de `account_settings`. */
export function privacidadeDeExemplo(): PrivacidadeDaConta {
  return { gravacaoLigada: true, avisoDeGravacao: null, retencaoDias: 90 }
}

/**
 * Dublê da privacidade. Guarda as colunas e o que está no ar em memória, e
 * mede a pendência de gravação como a borda mede: gravação desligada aqui e
 * ligada no que está publicado. Recusa o que o check da coluna recusaria.
 */
export function criarServicoDePrivacidadeDublado(
  respostas: RespostasDePrivacidade = {},
): ServicoDePrivacidadeDublado {
  const gravacoes: GravacaoDaPrivacidadeDublada[] = []
  const contagens: number[] = []
  let privacidade = respostas.privacidade ?? privacidadeDeExemplo()
  let noAr = respostas.noAr === undefined ? { gravacaoLigada: true } : respostas.noAr
  const identidade =
    respostas.identidade === undefined
      ? { nome: 'Sarah', empresa: 'Vexo Tecnologia' }
      : respostas.identidade
  const chamadas = respostas.chamadasTerminadasHaDias ?? []

  return {
    gravacoes,
    contagens,

    publicar() {
      noAr = { gravacaoLigada: privacidade.gravacaoLigada }
    },

    carregar(): Promise<CargaDaPrivacidade> {
      if (respostas.carregar) return Promise.resolve(respostas.carregar)
      const pendente = !privacidade.gravacaoLigada && noAr?.gravacaoLigada === true
      return Promise.resolve({
        ok: true,
        privacidade,
        noProvedor: { propositosPendentes: pendente ? [...PROPOSITOS] : [] },
        identidade,
      })
    },

    contarForaDoPrazo(dias): Promise<ContagemForaDoPrazo> {
      contagens.push(dias)
      return Promise.resolve({
        ok: true,
        chamadas: chamadas.filter((haDias) => haDias > dias).length,
      })
    },

    salvar(mudancas, motivo): Promise<GravacaoDaPrivacidade> {
      gravacoes.push({ mudancas, motivo })
      if (respostas.salvar) return Promise.resolve(respostas.salvar)
      if (!motivo.trim()) return Promise.resolve({ ok: false, motivo: 'valor-recusado' })

      const proxima = { ...privacidade, ...mudancas }
      if (
        proxima.retencaoDias < FAIXA_DA_RETENCAO.minimo ||
        proxima.retencaoDias > FAIXA_DA_RETENCAO.maximo
      ) {
        return Promise.resolve({ ok: false, motivo: 'valor-recusado' })
      }

      privacidade = proxima
      return Promise.resolve({ ok: true, privacidade })
    },
  }
}
