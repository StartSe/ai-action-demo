import { createContext, use } from 'react'

import type { ServicoDePrivacidade } from '@/privacidade/tipos'

export const ContextoDePrivacidade = createContext<ServicoDePrivacidade | null>(null)

export function useServicoDePrivacidade(): ServicoDePrivacidade {
  const servico = use(ContextoDePrivacidade)

  if (!servico) {
    throw new Error(
      'useServicoDePrivacidade exige que a árvore esteja dentro de ProvedorDePrivacidade.',
    )
  }

  return servico
}
