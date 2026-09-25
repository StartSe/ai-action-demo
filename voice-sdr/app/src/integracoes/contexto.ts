import { createContext, use } from 'react'

import type { ServicoDeIntegracoes } from '@/integracoes/tipos'

export const ContextoDeIntegracoes =
  createContext<ServicoDeIntegracoes | null>(null)

export function useServicoDeIntegracoes(): ServicoDeIntegracoes {
  const servico = use(ContextoDeIntegracoes)

  if (!servico) {
    throw new Error(
      'useServicoDeIntegracoes exige que a árvore esteja dentro de ProvedorDeIntegracoes.',
    )
  }

  return servico
}
