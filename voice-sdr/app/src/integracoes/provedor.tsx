import type { ReactNode } from 'react'

import { ContextoDeIntegracoes } from '@/integracoes/contexto'
import type { ServicoDeIntegracoes } from '@/integracoes/tipos'

type ProvedorDeIntegracoesProps = {
  servico: ServicoDeIntegracoes
  children: ReactNode
}

export function ProvedorDeIntegracoes({
  servico,
  children,
}: ProvedorDeIntegracoesProps) {
  return (
    <ContextoDeIntegracoes value={servico}>{children}</ContextoDeIntegracoes>
  )
}
