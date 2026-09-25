import { createContext, use } from 'react'

import type { ServicoDaFila } from '@/fila/tipos'

export const ContextoDaFila = createContext<ServicoDaFila | null>(null)

export function useServicoDaFila(): ServicoDaFila {
  const servico = use(ContextoDaFila)

  if (!servico) {
    throw new Error('useServicoDaFila exige que a árvore esteja dentro de ProvedorDaFila.')
  }

  return servico
}
