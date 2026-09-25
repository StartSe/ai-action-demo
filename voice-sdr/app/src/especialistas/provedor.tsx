import type { ReactNode } from 'react'

import { ContextoDeEspecialistas } from '@/especialistas/contexto'
import type { ServicoDeEspecialistas } from '@/especialistas/tipos'

type ProvedorDeEspecialistasProps = {
  servico: ServicoDeEspecialistas
  children: ReactNode
}

export function ProvedorDeEspecialistas({ servico, children }: ProvedorDeEspecialistasProps) {
  return <ContextoDeEspecialistas value={servico}>{children}</ContextoDeEspecialistas>
}
