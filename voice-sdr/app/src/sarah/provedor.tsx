import type { ReactNode } from 'react'

import { ContextoDaSarah } from '@/sarah/contexto'
import type { ServicoDaSarah } from '@/sarah/tipos'

type ProvedorDaSarahProps = {
  servico: ServicoDaSarah
  children: ReactNode
}

export function ProvedorDaSarah({ servico, children }: ProvedorDaSarahProps) {
  return <ContextoDaSarah value={servico}>{children}</ContextoDaSarah>
}
