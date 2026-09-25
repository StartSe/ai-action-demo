import type { ReactNode } from 'react'

import { ContextoDoProjeto, type ProjetoConectado } from '@/conexao/contexto'

export function ProvedorDoProjeto({
  valor,
  children,
}: {
  valor: ProjetoConectado
  children: ReactNode
}) {
  return <ContextoDoProjeto value={valor}>{children}</ContextoDoProjeto>
}
