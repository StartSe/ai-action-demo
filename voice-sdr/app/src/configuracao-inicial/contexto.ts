import { createContext, use } from 'react'

import type { ServicoDeConfiguracaoInicial } from '@/configuracao-inicial/tipos'

export const ContextoDeConfiguracaoInicial =
  createContext<ServicoDeConfiguracaoInicial | null>(null)

export function useServicoDeConfiguracaoInicial(): ServicoDeConfiguracaoInicial {
  const servico = use(ContextoDeConfiguracaoInicial)

  if (!servico) {
    throw new Error(
      'useServicoDeConfiguracaoInicial exige que a árvore esteja dentro de ProvedorDeConfiguracaoInicial.',
    )
  }

  return servico
}
