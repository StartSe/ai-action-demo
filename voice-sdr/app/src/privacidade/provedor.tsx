import type { ReactNode } from 'react'

import { ContextoDePrivacidade } from '@/privacidade/contexto'
import type { ServicoDePrivacidade } from '@/privacidade/tipos'

type ProvedorDePrivacidadeProps = {
  servico: ServicoDePrivacidade
  children: ReactNode
}

export function ProvedorDePrivacidade({ servico, children }: ProvedorDePrivacidadeProps) {
  return <ContextoDePrivacidade value={servico}>{children}</ContextoDePrivacidade>
}
