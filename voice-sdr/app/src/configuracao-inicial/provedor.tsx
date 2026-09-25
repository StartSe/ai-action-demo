import type { ReactNode } from 'react'

import { ContextoDeConfiguracaoInicial } from '@/configuracao-inicial/contexto'
import type { ServicoDeConfiguracaoInicial } from '@/configuracao-inicial/tipos'

type ProvedorDeConfiguracaoInicialProps = {
  servico: ServicoDeConfiguracaoInicial
  children: ReactNode
}

export function ProvedorDeConfiguracaoInicial({
  servico,
  children,
}: ProvedorDeConfiguracaoInicialProps) {
  return (
    <ContextoDeConfiguracaoInicial value={servico}>
      {children}
    </ContextoDeConfiguracaoInicial>
  )
}
