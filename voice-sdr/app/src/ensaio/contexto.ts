import { createContext, use } from 'react'

import type { ServicoDoEnsaio } from '@/ensaio/tipos'

export const ContextoDoEnsaio = createContext<ServicoDoEnsaio | null>(null)

export function useServicoDoEnsaio(): ServicoDoEnsaio {
  const servico = use(ContextoDoEnsaio)

  if (!servico) {
    throw new Error('useServicoDoEnsaio exige que a árvore esteja dentro de ProvedorDoEnsaio.')
  }

  return servico
}
