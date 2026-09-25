import { createContext, use } from 'react'

import type { ServicoDaConta } from '@/conta/tipos'

export const ContextoDaConta = createContext<ServicoDaConta | null>(null)

export function useServicoDaConta(): ServicoDaConta {
  const servico = use(ContextoDaConta)

  if (!servico) {
    throw new Error('useServicoDaConta exige que a árvore esteja dentro de ProvedorDaConta.')
  }

  return servico
}
