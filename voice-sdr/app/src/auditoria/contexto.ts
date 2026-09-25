import { createContext, use } from 'react'

import type { ServicoDeAuditoria } from '@/auditoria/tipos'

export const ContextoDeAuditoria = createContext<ServicoDeAuditoria | null>(
  null,
)

export function useServicoDeAuditoria(): ServicoDeAuditoria {
  const servico = use(ContextoDeAuditoria)

  if (!servico) {
    throw new Error(
      'useServicoDeAuditoria exige que a árvore esteja dentro de ProvedorDeAuditoria.',
    )
  }

  return servico
}
