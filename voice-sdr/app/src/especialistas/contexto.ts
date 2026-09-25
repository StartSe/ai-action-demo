import { createContext, use } from 'react'

import type { ServicoDeEspecialistas } from '@/especialistas/tipos'

export const ContextoDeEspecialistas = createContext<ServicoDeEspecialistas | null>(null)

export function useServicoDeEspecialistas(): ServicoDeEspecialistas {
  const servico = use(ContextoDeEspecialistas)

  if (!servico) {
    throw new Error(
      'useServicoDeEspecialistas exige que a árvore esteja dentro de ProvedorDeEspecialistas.',
    )
  }

  return servico
}
