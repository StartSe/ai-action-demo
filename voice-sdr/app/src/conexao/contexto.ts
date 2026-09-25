import { createContext, use } from 'react'

import type { ConfiguracaoDoProjeto } from '@/conexao/configuracao-do-projeto'

/** O projeto com que esta cópia está falando, e como trocá-lo. */
export interface ProjetoConectado {
  readonly configuracao: ConfiguracaoDoProjeto
  /** Encerra a sessão, limpa o cache e volta para a tela de conexão. */
  trocarDeProjeto(): Promise<void>
}

export const ContextoDoProjeto = createContext<ProjetoConectado | null>(null)

/**
 * Nulo fora do provedor. Os testes de tela que não tratam de conexão rodam sem
 * ele, e quem usa o projeto desenha a versão sem link nesse caso.
 */
export function useProjetoConectado(): ProjetoConectado | null {
  return use(ContextoDoProjeto)
}
