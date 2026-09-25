// A contagem de itens abertos da fila "Precisam de você" para a barra lateral
// (D-06, especificação 5.2: "contagem visível na navegação").
//
// A leitura é a mesma da tela da fila, pela mesma chave (`['fila', 'aberto']`):
// quem abre a fila não busca de novo, e a resolução feita lá invalida `['fila']`
// e atualiza o número aqui. O tempo real é a mesma assinatura (`assinar`), que
// só avisa: a carga refeita é quem conta, sob a RLS de quem olha.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useServicoDaFila } from '@/fila/contexto'

const CHAVE = ['fila'] as const

/** Quantos itens abertos a fila tem agora, ou nulo enquanto não se sabe. */
export function useItensAbertosDaFila(): number | null {
  const servico = useServicoDaFila()
  const cliente = useQueryClient()

  const consulta = useQuery({
    queryKey: [...CHAVE, 'aberto'],
    queryFn: () => servico.carregar('aberto'),
  })

  useEffect(
    () =>
      servico.assinar(() => {
        // Sem cancelar a releitura em voo: com a tela da fila aberta, ela
        // também ouve e invalida, e o aviso vira uma carga só.
        void cliente.invalidateQueries({ queryKey: CHAVE }, { cancelRefetch: false })
      }),
    [servico, cliente],
  )

  const carga = consulta.data
  return carga?.ok ? carga.itens.length : null
}
