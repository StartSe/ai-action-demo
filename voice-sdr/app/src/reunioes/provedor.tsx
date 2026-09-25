import type { ReactNode } from 'react'

import { ContextoDeReunioes } from '@/reunioes/contexto'
import type { ServicoDeReunioes } from '@/reunioes/tipos'

type ProvedorDeReunioesProps = {
  servico: ServicoDeReunioes
  children: ReactNode
}

export function ProvedorDeReunioes({ servico, children }: ProvedorDeReunioesProps) {
  return <ContextoDeReunioes value={servico}>{children}</ContextoDeReunioes>
}
