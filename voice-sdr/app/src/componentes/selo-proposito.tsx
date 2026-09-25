import { Selo } from '@/componentes/selo'
import { PROPOSITO_EM_PORTUGUES } from '@/copy/sarah'

/**
 * O selo de propósito (seção 5 de docs/padrao-de-interface.md): Descoberta,
 * Lembrete, Resgate ou Retomada, em toda linha de chamada.
 *
 * Um tom só para os quatro. Os tons do `Selo` dizem estado (atenção, perigo,
 * positivo), e propósito não é estado: pintar o Resgate de atenção ensinaria a
 * ler a ligação como problema. Quem distingue os quatro é a palavra.
 *
 * Valor fora dos quatro aparece cru, no tom neutro, em vez de sumir: é dado que
 * o check de `calls.purpose` não deveria ter deixado entrar, e esconder o
 * defeito não ajuda ninguém a achá-lo.
 */
export function SeloProposito({ proposito }: { proposito: string }) {
  const rotulos: Readonly<Record<string, string>> = PROPOSITO_EM_PORTUGUES
  const rotulo = Object.hasOwn(rotulos, proposito) ? rotulos[proposito] : undefined
  return <Selo tom={rotulo ? 'acento' : 'neutro'}>{rotulo ?? proposito}</Selo>
}
