import type { ReactNode } from 'react'

import { ContextoDeDiscagem } from '@/discagem/contexto'
import type { ServicoDeDiscagem } from '@/discagem/tipos'

type ProvedorDeDiscagemProps = {
  servico: ServicoDeDiscagem
  children: ReactNode
}

export function ProvedorDeDiscagem({ servico, children }: ProvedorDeDiscagemProps) {
  return <ContextoDeDiscagem value={servico}>{children}</ContextoDeDiscagem>
}
