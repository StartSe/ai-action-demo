import { createContext, use } from 'react'

import type { ServicoDeDiagnostico } from '@/diagnostico/tipos'

export const ContextoDeDiagnostico = createContext<ServicoDeDiagnostico | null>(null)

export function useServicoDeDiagnostico(): ServicoDeDiagnostico {
  const servico = use(ContextoDeDiagnostico)

  if (!servico) {
    throw new Error(
      'useServicoDeDiagnostico exige que a árvore esteja dentro de ProvedorDeDiagnostico.',
    )
  }

  return servico
}
