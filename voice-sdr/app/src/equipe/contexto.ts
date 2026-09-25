import { createContext, use } from 'react'

import type { ServicoDeEquipe } from '@/equipe/tipos'

export const ContextoDeEquipe = createContext<ServicoDeEquipe | null>(null)

export function useServicoDeEquipe(): ServicoDeEquipe {
  const servico = use(ContextoDeEquipe)

  if (!servico) {
    throw new Error(
      'useServicoDeEquipe exige que a árvore esteja dentro de ProvedorDeEquipe.',
    )
  }

  return servico
}
