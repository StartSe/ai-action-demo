import { createContext, use } from 'react'

import type { ServicoDeBloqueios } from '@/bloqueios/tipos'

export const ContextoDeBloqueios = createContext<ServicoDeBloqueios | null>(null)

export function useServicoDeBloqueios(): ServicoDeBloqueios {
  const servico = use(ContextoDeBloqueios)

  if (!servico) {
    throw new Error(
      'useServicoDeBloqueios exige que a árvore esteja dentro de ProvedorDeBloqueios.',
    )
  }

  return servico
}
