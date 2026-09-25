import { createContext, use } from 'react'

import type { ServicoDeWhatsapp } from '@/whatsapp/tipos'

export const ContextoDoWhatsapp = createContext<ServicoDeWhatsapp | null>(null)

export function useServicoDeWhatsapp(): ServicoDeWhatsapp {
  const servico = use(ContextoDoWhatsapp)

  if (!servico) {
    throw new Error('useServicoDeWhatsapp exige que a árvore esteja dentro de ProvedorDeWhatsapp.')
  }

  return servico
}
