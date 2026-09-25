// O nome que a conta deu à assistente, para o texto das telas.
//
// Lê a identidade pela mesma chave da tela de identidade
// (`['sarah-identidade']`): gravar o nome ali, ou na primeira pergunta do
// tutorial, atualiza toda tela que o cita sem estado passando entre elas.
// Nulo enquanto a carga não chegou ou a conta ainda não escolheu, e aí o texto
// é o genérico de `@/copy/assistente`.

import { useQuery } from '@tanstack/react-query'

import { useServicoDaSarah } from '@/sarah/contexto'
import type { CargaDaSarah } from '@/sarah/tipos'

export const CHAVE_DA_IDENTIDADE = ['sarah-identidade'] as const

/** O nome gravado na carga, ou nulo. Pura, para quem já tem a carga em mãos. */
export function nomeDaCarga(carga: CargaDaSarah | undefined): string | null {
  const nome = carga?.ok ? (carga.sarah.identidade?.nome.trim() ?? '') : ''
  return nome === '' ? null : nome
}

export function useNomeDaAssistente(): string | null {
  const servico = useServicoDaSarah()
  const carga = useQuery({
    queryKey: CHAVE_DA_IDENTIDADE,
    queryFn: () => servico.carregarIdentidade(),
  })
  return nomeDaCarga(carga.data)
}
