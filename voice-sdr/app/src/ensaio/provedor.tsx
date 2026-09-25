import type { ReactNode } from 'react'

import { ContextoDoEnsaio } from '@/ensaio/contexto'
import type { ServicoDoEnsaio } from '@/ensaio/tipos'

type ProvedorDoEnsaioProps = {
  servico: ServicoDoEnsaio
  children: ReactNode
}

export function ProvedorDoEnsaio({ servico, children }: ProvedorDoEnsaioProps) {
  return <ContextoDoEnsaio value={servico}>{children}</ContextoDoEnsaio>
}
