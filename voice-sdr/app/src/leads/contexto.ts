import { createContext, use } from 'react'

import type { ServicoDeLeads } from '@/leads/tipos'

export const ContextoDeLeads = createContext<ServicoDeLeads | null>(null)

export function useServicoDeLeads(): ServicoDeLeads {
  const servico = use(ContextoDeLeads)

  if (!servico) {
    throw new Error(
      'useServicoDeLeads exige que a árvore esteja dentro de ProvedorDeLeads.',
    )
  }

  return servico
}
