// O que o cartão de diagnóstico precisa decidir para desenhar, em função pura.
//
// O cartão não recombina regra da borda: os achados e as propostas chegam
// prontos. O que mora aqui é só tradução para a tela — o tom do selo de cada
// severidade, o valor de cada alvo em texto legível e qual publicação a
// proposta aplicada pede.

import type { PropostaNaTela } from '@diagnostico/diagnostico.ts'
import { eAlvo, nivelDoAlvo, propositoDoAlvo, type Alvo, type ValorDoAlvo } from '@diagnostico/propostas.ts'
import type { Severidade } from '@diagnostico/regras.ts'
import type { Proposito } from '@compartilhado/playbook/camada-um.ts'
import { AJUSTES_DE_VOZ, lerAjustesGravados } from '@voz/formato-do-provedor.ts'

import type { TomDoSelo } from '@/componentes/selo'

export function tomDaSeveridade(severidade: Severidade): TomDoSelo {
  if (severidade === 'erro') return 'perigo'
  if (severidade === 'aviso') return 'atencao'
  return 'informacao'
}

const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

/**
 * O valor de um alvo como a tela o mostra no antes e no depois. Nulo quando
 * não há valor, e a tela escreve a ausência em palavras.
 */
export function textoDoValor(alvo: string, valor: ValorDoAlvo): string | null {
  if (valor === null) return null
  if (typeof valor === 'string') return valor.trim() === '' ? null : valor
  if (typeof valor === 'number') {
    return alvo === 'politica.duracao_maxima' ? `${NUMERO.format(valor)} s` : NUMERO.format(valor)
  }
  if (Array.isArray(valor)) return valor.length === 0 ? null : valor.join('; ')

  const lidos = lerAjustesGravados(valor as Readonly<Record<string, unknown>>)
  const partes = AJUSTES_DE_VOZ.flatMap((ajuste) => {
    const numero = lidos[ajuste.nome]
    return numero === undefined ? [] : [`${ajuste.rotulo} ${NUMERO.format(numero)}`]
  })
  return partes.length === 0 ? null : partes.join(' · ')
}

/** Como a proposta aplicada vai ao ar: pelo playbook (rascunho novo) ou republicando a Sarah. */
export type ModoDePublicar =
  | { readonly tipo: 'playbook'; readonly proposito: Proposito }
  | { readonly tipo: 'sarah' }

export function comoPublicar(proposta: Pick<PropostaNaTela, 'alvo'>): ModoDePublicar {
  if (eAlvo(proposta.alvo)) {
    const proposito = propositoDoAlvo(proposta.alvo)
    if (proposito) return { tipo: 'playbook', proposito }
  }
  return { tipo: 'sarah' }
}

/** O alvo conhecido, ou nulo quando a linha trouxe um que esta versão da tela não sabe ler. */
export function alvoDaProposta(proposta: Pick<PropostaNaTela, 'alvo'>): Alvo | null {
  return eAlvo(proposta.alvo) ? proposta.alvo : null
}

/** A confirmação diz o que acontece: roteiro vira rascunho, publicar não grava nada, o resto grava no nível. */
export function tipoDaConfirmacao(alvo: Alvo): 'roteiro' | 'publicacao' | 'nivel' {
  const nivel = nivelDoAlvo(alvo)
  if (nivel === 'roteiro' || nivel === 'jeito_da_casa') return 'roteiro'
  if (nivel === 'republicar') return 'publicacao'
  return 'nivel'
}
