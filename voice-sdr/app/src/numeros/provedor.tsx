import type { ReactNode } from 'react'

import { ContextoDeNumeros } from '@/numeros/contexto'
import type { ServicoDeNumeros } from '@/numeros/tipos'

type ProvedorDeNumerosProps = {
  servico: ServicoDeNumeros
  children: ReactNode
}

export function ProvedorDeNumeros({ servico, children }: ProvedorDeNumerosProps) {
  return <ContextoDeNumeros value={servico}>{children}</ContextoDeNumeros>
}
