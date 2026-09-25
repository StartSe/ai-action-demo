import { createContext, use } from 'react'

import type { ServicoDoPainel } from '@/painel/tipos'

export const ContextoDoPainel = createContext<ServicoDoPainel | null>(null)

export function useServicoDoPainel(): ServicoDoPainel {
  const servico = use(ContextoDoPainel)

  if (!servico) {
    throw new Error('useServicoDoPainel exige que a árvore esteja dentro de ProvedorDoPainel.')
  }

  return servico
}
