import type { ReactNode } from 'react'

import { ContextoDoPainel } from '@/painel/contexto'
import type { ServicoDoPainel } from '@/painel/tipos'

type ProvedorDoPainelProps = {
  servico: ServicoDoPainel
  children: ReactNode
}

export function ProvedorDoPainel({ servico, children }: ProvedorDoPainelProps) {
  return <ContextoDoPainel value={servico}>{children}</ContextoDoPainel>
}
