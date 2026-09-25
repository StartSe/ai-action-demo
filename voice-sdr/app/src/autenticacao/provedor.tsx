import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from 'react'

import { ContextoDeAutenticacao } from '@/autenticacao/contexto'
import type { ServicoDeAutenticacao } from '@/autenticacao/tipos'

type ProvedorDeAutenticacaoProps = {
  servico: ServicoDeAutenticacao
  children: ReactNode
}

/**
 * A sessão vive no serviço, fora do React: quem a muda é o Supabase, em
 * resposta a entrada, saída ou expiração. `useSyncExternalStore` é o jeito de
 * ler isso sem duplicar o estado nem sincronizar por efeito.
 */
export function ProvedorDeAutenticacao({
  servico,
  children,
}: ProvedorDeAutenticacaoProps) {
  const assinar = useCallback(
    (aoMudar: () => void) => servico.observarSessao(aoMudar),
    [servico],
  )
  const ler = useCallback(() => servico.sessaoAtual(), [servico])

  const sessao = useSyncExternalStore(assinar, ler, ler)
  const valor = useMemo(() => ({ servico, sessao }), [servico, sessao])

  return <ContextoDeAutenticacao value={valor}>{children}</ContextoDeAutenticacao>
}
