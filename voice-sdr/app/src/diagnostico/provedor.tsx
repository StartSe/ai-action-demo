import type { ReactNode } from 'react'

import { ContextoDeDiagnostico } from '@/diagnostico/contexto'
import type { ServicoDeDiagnostico } from '@/diagnostico/tipos'

type ProvedorDeDiagnosticoProps = {
  servico: ServicoDeDiagnostico
  children: ReactNode
}

export function ProvedorDeDiagnostico({ servico, children }: ProvedorDeDiagnosticoProps) {
  return <ContextoDeDiagnostico value={servico}>{children}</ContextoDeDiagnostico>
}
