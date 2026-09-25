// As decisões puras da tela de voz (RF-302, RF-303, RF-304). Nada aqui toca
// React, rede nem Supabase.
//
// A regra que dá forma ao arquivo: **a tela não tem catálogo de ajustes.** A
// faixa, o passo e o padrão de cada controle vêm da voz que o servidor mandou
// (`ajustesAceitos`), porque quem os conhece é o provedor. Uma lista escrita
// aqui faria um ajuste novo do provedor nascer sem controle, e uma faixa que
// ele mudasse ficaria errada num arquivo que ninguém lembra de abrir.

import type {
  AjusteDeVozAceito,
  AjustesDeVoz,
  AmostraDaPrimeiraFala,
  CatalogoDeVozes,
  EscolhaDeVoz,
  EstadoDoCatalogoDeVozes,
  VozDoCatalogo,
} from '@/sarah/tipos'

/**
 * Os quatro estados do servidor mais o da tela. `esperando` só existe enquanto
 * o pedido viaja: nenhum servidor observa "estou sendo perguntado", e afirmar
 * "o provedor não respondeu" durante a própria pergunta manda quem administra
 * a conta agir sobre um resultado que ainda está vindo.
 */
export type EstadoDaTelaDeVoz = EstadoDoCatalogoDeVozes | 'esperando'

export function estadoDaTelaDeVoz(
  esperando: boolean,
  catalogo: CatalogoDeVozes | null,
): EstadoDaTelaDeVoz {
  if (esperando || catalogo === null) return 'esperando'
  return catalogo.estado
}

/**
 * O valor dentro da faixa do provedor. O controle é um cursor: recusar o
 * pedido por causa de um centésimo fora do limite trocaria a audição por uma
 * mensagem de erro, e é a mesma decisão que `resolverAjustes` toma na borda.
 */
export function aparar(ajuste: AjusteDeVozAceito, valor: number): number {
  if (!Number.isFinite(valor)) return ajuste.padrao
  return Math.min(ajuste.maximo, Math.max(ajuste.minimo, valor))
}

/**
 * Os ajustes com que uma voz abre: o que a conta gravou, senão o padrão que o
 * provedor declarou para **aquela** voz. Uma voz que nasce com estabilidade
 * 0,8 precisa abrir o controle em 0,8, senão a primeira audição soa diferente
 * da voz que se escolheu.
 */
export function ajustesIniciais(
  voz: VozDoCatalogo,
  gravados: AjustesDeVoz,
): AjustesDeVoz {
  const iniciais: AjustesDeVoz = {}
  for (const ajuste of voz.ajustesAceitos) {
    iniciais[ajuste.nome] = aparar(ajuste, gravados[ajuste.nome] ?? ajuste.padrao)
  }
  return iniciais
}

/**
 * A voz que a tela abre selecionada: a gravada, quando ela ainda está no
 * catálogo em português. Nenhuma outra — escolher a primeira da lista por
 * conveniência faria a tela sugerir uma voz que ninguém escolheu.
 */
export function vozInicial(
  catalogo: CatalogoDeVozes,
  vozEscolhida: string | null,
): VozDoCatalogo | null {
  if (vozEscolhida === null) return null
  return catalogo.vozes.find((voz) => voz.id === vozEscolhida) ?? null
}

/** A escolha que já está gravada no agente, ou null enquanto não há uma. */
export function escolhaGravada(
  vozEscolhida: string | null,
  ajustes: AjustesDeVoz,
): EscolhaDeVoz | null {
  return vozEscolhida === null ? null : { vozId: vozEscolhida, ajustes }
}

/** Duas escolhas iguais, voz e ajuste a ajuste. Diz se há o que gravar. */
export function mesmaEscolha(
  uma: EscolhaDeVoz | null,
  outra: EscolhaDeVoz | null,
): boolean {
  if (uma === null || outra === null) return uma === outra
  if (uma.vozId !== outra.vozId) return false

  // A união das duas chaves, e não as de uma delas: um ajuste que existe só de
  // um lado é diferença, e comparar só os da esquerda deixaria de ver o ajuste
  // que a pessoa acabou de mexer pela primeira vez.
  const daEsquerda: Record<string, number | undefined> = uma.ajustes
  const daDireita: Record<string, number | undefined> = outra.ajustes
  const nomes = new Set([...Object.keys(daEsquerda), ...Object.keys(daDireita)])

  for (const nome of nomes) {
    if (daEsquerda[nome] !== daDireita[nome]) return false
  }
  return true
}

/**
 * A fonte do elemento de áudio. O provedor devolve o som em base64 e o
 * navegador toca por `data:`; não há arquivo em lugar nenhum, e a amostra
 * morre com a aba — ela é uma experimentação, não um artefato da conta.
 */
export function fonteDaAmostra(amostra: AmostraDaPrimeiraFala): string {
  return `data:${amostra.formato};base64,${amostra.audioBase64}`
}
