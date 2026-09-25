// As decisões puras da tela de identidade (RF-301, RF-304). Nada aqui toca
// React, rede nem Supabase.
//
// A regra que dá forma ao arquivo é a das variáveis: quem decide quais existem
// é `@compartilhado/agente/primeira-fala.ts`, o mesmo módulo que a amostra de
// voz e a publicação usam. Uma segunda lista escrita aqui recusaria variável
// que existe assim que o servidor ganhasse a primeira nova.

import {
  interpolarPrimeiraFala,
  marcadoresDesconhecidos,
} from '@compartilhado/agente/primeira-fala.ts'

import { FALAS_DO_WHATSAPP } from '@compartilhado/speech/whatsapp.ts'

import { NOME_GENERICO } from '@/copy/assistente'
import type { IdentidadeDaSarah } from '@/sarah/tipos'

/** A assistente de uma conta que acabou de nascer: nada escrito, nada suposto. */
export const IDENTIDADE_EM_BRANCO: IdentidadeDaSarah = {
  nome: '',
  empresa: '',
  oferta: '',
  nuncaAfirmar: [],
  destinoDeTransferencia: '',
  primeiraFala: '',
  aberturaDoWhatsapp: '',
  jeitoNaVoz: '',
  jeitoNoWhatsapp: '',
}

/** Espaço nas pontas some antes de gravar: o banco recusa nome só de espaço. */
export function aparar(identidade: IdentidadeDaSarah): IdentidadeDaSarah {
  return {
    nome: identidade.nome.trim(),
    empresa: identidade.empresa.trim(),
    oferta: identidade.oferta.trim(),
    nuncaAfirmar: identidade.nuncaAfirmar
      .map((item) => item.trim())
      .filter((item) => item !== ''),
    destinoDeTransferencia: identidade.destinoDeTransferencia.trim(),
    primeiraFala: identidade.primeiraFala.trim(),
    aberturaDoWhatsapp: identidade.aberturaDoWhatsapp.trim(),
    jeitoNaVoz: identidade.jeitoNaVoz.trim(),
    jeitoNoWhatsapp: identidade.jeitoNoWhatsapp.trim(),
  }
}

/**
 * As variáveis da primeira fala que ninguém sabe preencher.
 *
 * A gravação para aqui, e a razão é audível: marcador que não resolve some da
 * frase na hora da síntese, e a abertura chega ao lead com um buraco no meio.
 * Recusar na tela, dizendo qual é e quais existem, custa uma frase; descobrir
 * ouvindo custa uma ligação.
 */
export function variaveisDesconhecidas(primeiraFala: string): string[] {
  return marcadoresDesconhecidos(primeiraFala)
}

/**
 * A abertura como o lead a ouviria, com o lead de exemplo da semente. Usa o
 * mesmo módulo da amostra de voz (US-083) e da publicação (US-060).
 *
 * Sem nome escrito, a prévia diz "assistente": o campo em branco no meio da
 * frase faria a prévia parecer quebrada quando o que falta é só o nome.
 */
export function previaDaPrimeiraFala(identidade: IdentidadeDaSarah): string {
  return interpolarPrimeiraFala(identidade.primeiraFala, {
    nome: identidade.nome.trim() || NOME_GENERICO,
    empresa: identidade.empresa.trim(),
    nuncaAfirmar: identidade.nuncaAfirmar,
  })
}

/**
 * A abertura do WhatsApp como o lead a leria, com o lead de exemplo. Em
 * branco, a prévia mostra a padrão do servidor, que é o que sai de verdade.
 */
export function previaDaAberturaDoWhatsapp(identidade: IdentidadeDaSarah): string {
  return interpolarPrimeiraFala(identidade.aberturaDoWhatsapp.trim() || FALAS_DO_WHATSAPP.abertura, {
    nome: identidade.nome.trim() || NOME_GENERICO,
    empresa: identidade.empresa.trim(),
    nuncaAfirmar: identidade.nuncaAfirmar,
  })
}

/**
 * O nome é o mínimo para gravar, e é o mínimo do próprio banco: `agents.name`
 * é `not null` com check de texto não vazio. A empresa pode esperar: o
 * tutorial grava o nome antes dela, e quem a cobra é a publicação. Oferta,
 * transferência e primeira fala ficam de fora pelo mesmo motivo, que é o que
 * permite salvar a assistente pela metade e voltar depois.
 */
export function identidadeGravavel(identidade: IdentidadeDaSarah): boolean {
  return aparar(identidade).nome !== ''
}

/** Duas identidades iguais, campo a campo. Diz se há o que gravar. */
export function identidadesIguais(
  uma: IdentidadeDaSarah,
  outra: IdentidadeDaSarah,
): boolean {
  return (
    uma.nome === outra.nome &&
    uma.empresa === outra.empresa &&
    uma.oferta === outra.oferta &&
    uma.destinoDeTransferencia === outra.destinoDeTransferencia &&
    uma.primeiraFala === outra.primeiraFala &&
    uma.aberturaDoWhatsapp === outra.aberturaDoWhatsapp &&
    uma.jeitoNaVoz === outra.jeitoNaVoz &&
    uma.jeitoNoWhatsapp === outra.jeitoNoWhatsapp &&
    uma.nuncaAfirmar.length === outra.nuncaAfirmar.length &&
    uma.nuncaAfirmar.every((item, indice) => item === outra.nuncaAfirmar[indice])
  )
}
