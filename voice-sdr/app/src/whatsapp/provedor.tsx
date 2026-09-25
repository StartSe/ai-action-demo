import type { ReactNode } from 'react'

import { ContextoDoWhatsapp } from '@/whatsapp/contexto'
import type { ServicoDeWhatsapp } from '@/whatsapp/tipos'

type ProvedorDeWhatsappProps = {
  servico: ServicoDeWhatsapp
  children: ReactNode
}

export function ProvedorDeWhatsapp({ servico, children }: ProvedorDeWhatsappProps) {
  return <ContextoDoWhatsapp value={servico}>{children}</ContextoDoWhatsapp>
}
