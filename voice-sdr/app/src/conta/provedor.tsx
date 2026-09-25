import type { ReactNode } from 'react'

import { ContextoDaConta } from '@/conta/contexto'
import type { ServicoDaConta } from '@/conta/tipos'

type ProvedorDaContaProps = {
  servico: ServicoDaConta
  children: ReactNode
}

export function ProvedorDaConta({ servico, children }: ProvedorDaContaProps) {
  return <ContextoDaConta value={servico}>{children}</ContextoDaConta>
}
