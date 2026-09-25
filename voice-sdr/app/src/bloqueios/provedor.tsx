import type { ReactNode } from 'react'

import { ContextoDeBloqueios } from '@/bloqueios/contexto'
import type { ServicoDeBloqueios } from '@/bloqueios/tipos'

type ProvedorDeBloqueiosProps = {
  servico: ServicoDeBloqueios
  children: ReactNode
}

export function ProvedorDeBloqueios({ servico, children }: ProvedorDeBloqueiosProps) {
  return <ContextoDeBloqueios value={servico}>{children}</ContextoDeBloqueios>
}
