import { createContext, use } from 'react'

import type { ServicoDeDiscagem } from '@/discagem/tipos'

export const ContextoDeDiscagem = createContext<ServicoDeDiscagem | null>(null)

export function useServicoDeDiscagem(): ServicoDeDiscagem {
  const servico = use(ContextoDeDiscagem)

  if (!servico) {
    throw new Error(
      'useServicoDeDiscagem exige que a árvore esteja dentro de ProvedorDeDiscagem.',
    )
  }

  return servico
}
