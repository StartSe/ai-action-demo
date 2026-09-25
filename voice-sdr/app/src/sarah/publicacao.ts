import { PROPOSITOS } from '@compartilhado/playbook/camada-um.ts'

import type { EstadoDePublicacao } from '@/sarah/tipos'

/** Uma linha de `agent_publications`, no recorte que a tela lê. */
export interface PublicacaoDaConta {
  status: string
  publicadaEm: string | null
}

/**
 * O estado de publicação **do ponto de vista da identidade** (RF-311), nos três
 * nomes da US-060.
 *
 * O que decide é o carimbo: identidade alterada depois da última publicação não
 * está no ar, porque nome, empresa e abertura entram na configuração dos quatro
 * propósitos. Propósito que nunca subiu conta como pendente pelo mesmo motivo.
 *
 * **O que esta função não responde, e por quê.** A comparação exata é entre o
 * hash compilado e o gravado, e ela precisa do roteiro publicado de cada
 * propósito, da política da conta e da voz. Quem a faz é a tela de playbooks
 * (US-084), que carrega tudo isso; aqui basta dizer se o que se acabou de
 * escrever já vale na próxima ligação, e para isso o carimbo responde. O erro
 * possível é de um lado só: mudança no roteiro sem mudança na identidade
 * aparece como publicada aqui, e a tela de playbooks é quem a denuncia.
 */
export function estadoDaPublicacaoDaIdentidade(
  identidadeAtualizadaEm: string,
  publicacoes: readonly PublicacaoDaConta[],
): EstadoDePublicacao {
  const noAr = publicacoes.filter(
    (publicacao) =>
      publicacao.status === 'publicado' && publicacao.publicadaEm !== null,
  )

  if (noAr.length === 0) return 'rascunho'
  if (noAr.length < PROPOSITOS.length) return 'alteracoes_pendentes'

  const identidade = Date.parse(identidadeAtualizadaEm)
  const maisAntiga = Math.min(
    ...noAr.map((publicacao) => Date.parse(publicacao.publicadaEm ?? '')),
  )

  // Carimbo ilegível vira pendente, e não publicado: mandar republicar custa um
  // clique, e dizer "está no ar" sem saber custa uma ligação com a Sarah velha.
  if (Number.isNaN(identidade) || Number.isNaN(maisAntiga)) {
    return 'alteracoes_pendentes'
  }

  return maisAntiga >= identidade ? 'publicado' : 'alteracoes_pendentes'
}
