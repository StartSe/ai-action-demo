import type { ReactNode } from 'react'

import { ContextoDeAuditoria } from '@/auditoria/contexto'
import type { ServicoDeAuditoria } from '@/auditoria/tipos'

type ProvedorDeAuditoriaProps = {
  servico: ServicoDeAuditoria
  children: ReactNode
}

export function ProvedorDeAuditoria({
  servico,
  children,
}: ProvedorDeAuditoriaProps) {
  return <ContextoDeAuditoria value={servico}>{children}</ContextoDeAuditoria>
}
