import { createContext, use } from 'react'

import type { ServicoDaSarah } from '@/sarah/tipos'

export const ContextoDaSarah = createContext<ServicoDaSarah | null>(null)

export function useServicoDaSarah(): ServicoDaSarah {
  const servico = use(ContextoDaSarah)

  if (!servico) {
    throw new Error(
      'useServicoDaSarah exige que a árvore esteja dentro de ProvedorDaSarah.',
    )
  }

  return servico
}
