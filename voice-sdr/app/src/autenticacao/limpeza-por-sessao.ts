// Quem está na sessão mudou: o que a sessão anterior deixou no cache e no
// navegador vai embora.
//
// As chaves de consulta não levam a conta (`['configuracao-inicial']`,
// `['sarah-voz']`), e sair, zerar o ambiente ou entrar com outro usuário não
// recarrega a página. Sem a limpeza, a próxima conta abriria os formulários
// com o negócio da anterior ainda no cache, e bastaria gravar para o texto de
// um teste virar roteiro de outra conta.

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { useAutenticacao } from '@/autenticacao/contexto'
import { esquecerDadosDoNavegador } from '@/utilidades/dados-do-navegador'

/** Limpa o cache de consultas e o navegador quando o usuário da sessão muda. */
export function useLimpezaAoTrocarDeSessao(): void {
  const { sessao } = useAutenticacao()
  const clienteDeConsulta = useQueryClient()
  const usuarioAnterior = useRef<string | null>(sessao?.usuarioId ?? null)
  const usuario = sessao?.usuarioId ?? null

  useEffect(() => {
    if (usuario === usuarioAnterior.current) return
    usuarioAnterior.current = usuario
    clienteDeConsulta.clear()
    esquecerDadosDoNavegador()
  }, [usuario, clienteDeConsulta])
}
