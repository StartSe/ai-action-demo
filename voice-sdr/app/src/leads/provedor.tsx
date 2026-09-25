import type { ReactNode } from 'react'

import { ContextoDeLeads } from '@/leads/contexto'
import type { ServicoDeLeads } from '@/leads/tipos'

type ProvedorDeLeadsProps = {
  servico: ServicoDeLeads
  children: ReactNode
}

export function ProvedorDeLeads({ servico, children }: ProvedorDeLeadsProps) {
  return <ContextoDeLeads value={servico}>{children}</ContextoDeLeads>
}
