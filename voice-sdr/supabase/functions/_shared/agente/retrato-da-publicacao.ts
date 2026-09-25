// O retrato do que a publicação pôs no ar, por propósito.
//
// **Por que existe.** A voz fala o que está no provedor, e o provedor só muda
// quando alguém publica. O WhatsApp, lendo a identidade direto de `agents`,
// passaria a falar com o nome, a oferta e o roteiro que alguém acabou de
// digitar, sem publicar: dois canais, duas assistentes. `agent-publish` grava
// este retrato em `agent_publications.channel_snapshot` junto da publicação de
// cada propósito, e o motor do WhatsApp lê daqui. Sem retrato (conta que nunca
// publicou, ou publicação de antes dele), o canal não responde.
//
// **O que entra**: o que o WhatsApp usa e a voz publicou. Identidade, a versão
// do roteiro do propósito que foi ao ar e as particularidades do WhatsApp
// (abertura e jeito do canal). Política da conta e critérios ficam de fora: a
// conversa por mensagem não grava áudio nem tem duração, e os dois continuam
// lidos na hora.
//
// **Tudo o que entra aqui está no hash da publicação** (identidade e roteiro
// no prompt, as particularidades no bloco `whatsapp` da configuração). É isso
// que deixa `agent-publish` pular o retrato do propósito inalterado: hash
// igual é retrato igual. A exceção é a publicação de antes do retrato, que
// ganha o dele na primeira passagem, sem mudar `published_at`.
//
// Módulo portável: sem Deno, sem rede.

import type { PlaybookPublicado } from './compilador.ts'

/** A versão do formato. Formato novo sobe o número e o leitor aceita os dois. */
export const VERSAO_DO_RETRATO = 1

/** O retrato, com as chaves como vão para o `jsonb`. */
export interface RetratoDaPublicacao {
  readonly versao: typeof VERSAO_DO_RETRATO
  readonly identidade: {
    readonly nome: string
    readonly empresa: string
    readonly oferta: string | null
    readonly nunca_afirmar: readonly string[]
  }
  readonly roteiro: {
    readonly playbook_version_id: string
    readonly versao: number
    readonly camada_dois: string
    readonly camada_tres: string
  }
  readonly whatsapp: {
    readonly abertura: string | null
    readonly jeito: string | null
  }
}

export interface EntradaDoRetrato {
  readonly identidade: {
    readonly nome: string
    readonly empresa: string
    readonly oferta: string | null
    readonly nuncaAfirmar: readonly string[]
  }
  readonly playbook: PlaybookPublicado
  readonly aberturaDoWhatsapp: string | null
  readonly jeitoDoWhatsapp: string | null
}

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

export function montarRetrato(entrada: EntradaDoRetrato): RetratoDaPublicacao {
  return {
    versao: VERSAO_DO_RETRATO,
    identidade: {
      nome: entrada.identidade.nome,
      empresa: entrada.identidade.empresa,
      oferta: textoOuNulo(entrada.identidade.oferta),
      nunca_afirmar: [...entrada.identidade.nuncaAfirmar],
    },
    roteiro: {
      playbook_version_id: entrada.playbook.playbookVersionId,
      versao: entrada.playbook.versao,
      camada_dois: entrada.playbook.camadaDois,
      camada_tres: entrada.playbook.camadaTres,
    },
    whatsapp: {
      abertura: textoOuNulo(entrada.aberturaDoWhatsapp),
      jeito: textoOuNulo(entrada.jeitoDoWhatsapp),
    },
  }
}

/** O retrato lido do banco, no formato que o motor usa. */
export interface AssistentePublicada {
  readonly identidade: {
    readonly nome: string
    readonly empresa: string
    readonly oferta: string | null
    readonly nuncaAfirmar: readonly string[]
  }
  readonly playbook: PlaybookPublicado
  readonly aberturaDoWhatsapp: string | null
  readonly jeitoDoWhatsapp: string | null
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null
}

/**
 * O retrato gravado, ou nulo quando não há um legível. Nulo não é erro: é a
 * conta sem publicação, e quem chama cala o canal e abre o item na fila.
 * Retrato torto também é nulo, pelo mesmo caminho: responder com metade da
 * identidade seria pior do que não responder.
 */
export function lerRetrato(bruto: unknown): AssistentePublicada | null {
  const retrato = objeto(bruto)
  if (retrato === null || retrato.versao !== VERSAO_DO_RETRATO) return null
  const identidade = objeto(retrato.identidade)
  const roteiro = objeto(retrato.roteiro)
  const whatsapp = objeto(retrato.whatsapp) ?? {}
  if (identidade === null || roteiro === null) return null

  const nome = textoOuNulo(identidade.nome)
  const empresa = textoOuNulo(identidade.empresa)
  const playbookVersionId = textoOuNulo(roteiro.playbook_version_id)
  const versao = Number(roteiro.versao)
  if (nome === null || empresa === null || playbookVersionId === null || !Number.isInteger(versao)) return null
  if (typeof roteiro.camada_dois !== 'string') return null

  return {
    identidade: {
      nome,
      empresa,
      oferta: textoOuNulo(identidade.oferta),
      nuncaAfirmar: Array.isArray(identidade.nunca_afirmar)
        ? identidade.nunca_afirmar.filter((item): item is string => typeof item === 'string')
        : [],
    },
    playbook: {
      playbookVersionId,
      versao,
      camadaDois: roteiro.camada_dois,
      camadaTres: typeof roteiro.camada_tres === 'string' ? roteiro.camada_tres : '',
    },
    aberturaDoWhatsapp: textoOuNulo(whatsapp.abertura),
    jeitoDoWhatsapp: textoOuNulo(whatsapp.jeito),
  }
}
