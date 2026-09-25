import { createContext, use } from 'react'

import type { ServicoDeNumeros } from '@/numeros/tipos'

export const ContextoDeNumeros = createContext<ServicoDeNumeros | null>(null)

export function useServicoDeNumeros(): ServicoDeNumeros {
  const servico = use(ContextoDeNumeros)

  if (!servico) {
    throw new Error(
      'useServicoDeNumeros exige que a árvore esteja dentro de ProvedorDeNumeros.',
    )
  }

  return servico
}
