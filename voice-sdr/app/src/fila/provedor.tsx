import type { ReactNode } from 'react'

import { ContextoDaFila } from '@/fila/contexto'
import type { ServicoDaFila } from '@/fila/tipos'

type ProvedorDaFilaProps = {
  servico: ServicoDaFila
  children: ReactNode
}

export function ProvedorDaFila({ servico, children }: ProvedorDaFilaProps) {
  return <ContextoDaFila value={servico}>{children}</ContextoDaFila>
}
