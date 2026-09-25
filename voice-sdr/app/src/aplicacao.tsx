import { RouterProvider } from '@tanstack/react-router'
import { useEffect } from 'react'

import { useAutenticacao } from '@/autenticacao/contexto'
import { useLimpezaAoTrocarDeSessao } from '@/autenticacao/limpeza-por-sessao'
import type { criarRoteador } from '@/roteador'

type AplicacaoProps = {
  roteador: ReturnType<typeof criarRoteador>
}

/**
 * Sessão que muda é contexto de rota que muda: a guarda de `beforeLoad` só
 * reavalia quando o roteador é invalidado. É o que faz a expiração da sessão
 * levar para `/entrar` sem recarregar a página. E o cache da sessão anterior
 * vai embora com ela (`limpeza-por-sessao.ts`).
 */
export function Aplicacao({ roteador }: AplicacaoProps) {
  const { sessao } = useAutenticacao()
  useLimpezaAoTrocarDeSessao()

  useEffect(() => {
    void roteador.invalidate()
  }, [roteador, sessao])

  return <RouterProvider router={roteador} />
}
