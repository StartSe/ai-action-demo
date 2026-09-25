import { createContext, use } from 'react'

import type { Sessao, ServicoDeAutenticacao } from '@/autenticacao/tipos'

export interface ValorDeAutenticacao {
  servico: ServicoDeAutenticacao
  sessao: Sessao | null
}

export const ContextoDeAutenticacao = createContext<ValorDeAutenticacao | null>(
  null,
)

export function useAutenticacao(): ValorDeAutenticacao {
  const valor = use(ContextoDeAutenticacao)

  if (!valor) {
    throw new Error(
      'useAutenticacao exige que a árvore esteja dentro de ProvedorDeAutenticacao.',
    )
  }

  return valor
}
