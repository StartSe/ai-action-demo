import type { ReactNode } from 'react'

import { ContextoDeEquipe } from '@/equipe/contexto'
import type { ServicoDeEquipe } from '@/equipe/tipos'

type ProvedorDeEquipeProps = {
  servico: ServicoDeEquipe
  children: ReactNode
}

export function ProvedorDeEquipe({ servico, children }: ProvedorDeEquipeProps) {
  return <ContextoDeEquipe value={servico}>{children}</ContextoDeEquipe>
}
