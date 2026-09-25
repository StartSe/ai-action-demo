import type { ReactNode } from 'react'

import { ContextoDeChamadas } from '@/chamadas/contexto'
import type { ServicoDeChamadas } from '@/chamadas/tipos'

type ProvedorDeChamadasProps = {
  servico: ServicoDeChamadas
  children: ReactNode
}

export function ProvedorDeChamadas({ servico, children }: ProvedorDeChamadasProps) {
  return <ContextoDeChamadas value={servico}>{children}</ContextoDeChamadas>
}
