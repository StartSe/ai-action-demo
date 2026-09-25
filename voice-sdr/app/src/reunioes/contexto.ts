import { createContext, use } from 'react'

import type { ServicoDeReunioes } from '@/reunioes/tipos'

export const ContextoDeReunioes = createContext<ServicoDeReunioes | null>(null)

export function useServicoDeReunioes(): ServicoDeReunioes {
  const servico = use(ContextoDeReunioes)

  if (!servico) {
    throw new Error(
      'useServicoDeReunioes exige que a árvore esteja dentro de ProvedorDeReunioes.',
    )
  }

  return servico
}
