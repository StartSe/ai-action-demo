import { createContext, use } from 'react'

import type { ServicoDeChamadas } from '@/chamadas/tipos'

export const ContextoDeChamadas = createContext<ServicoDeChamadas | null>(null)

export function useServicoDeChamadas(): ServicoDeChamadas {
  const servico = use(ContextoDeChamadas)

  if (!servico) {
    throw new Error(
      'useServicoDeChamadas exige que a árvore esteja dentro de ProvedorDeChamadas.',
    )
  }

  return servico
}
