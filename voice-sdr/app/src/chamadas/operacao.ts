// O estado da operação da conta, lido por toda tela: o freio, na casca, e o
// discador, no painel. As duas leituras compartilham a chave de consulta, e é
// isso que faz o discador recusar no mesmo instante em que o freio é puxado:
// quem puxa invalida `CHAVE_DA_OPERACAO`, e não há estado passando entre eles.

import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useServicoDeChamadas } from '@/chamadas/contexto'
import type { FreioPuxado } from '@/chamadas/tipos'
import { useServicoDeEquipe } from '@/equipe/contexto'
import { quemConcedeAcesso } from '@/equipe/papeis'
import type { Membro, Papel } from '@/equipe/tipos'

export const CHAVE_DA_OPERACAO = ['operacao'] as const

/** A mesma chave da tela de equipe: o papel de quem olha vem da mesma carga. */
export const CHAVE_DA_EQUIPE = ['equipe'] as const

export interface Operacao {
  /** Falso enquanto a primeira leitura não voltou. */
  carregada: boolean
  freio: FreioPuxado | null
  /** Nulo enquanto a equipe não carregou, ou quando ela falhou. */
  papel: Papel | null
  /** A quem pedir acesso, para a negativa por papel. */
  administradores: Membro[]
  recarregar: () => Promise<void>
}

export function useOperacao(): Operacao {
  const servico = useServicoDeChamadas()
  const servicoDeEquipe = useServicoDeEquipe()
  const clienteDeConsulta = useQueryClient()

  const operacao = useQuery({
    queryKey: CHAVE_DA_OPERACAO,
    queryFn: () => servico.carregarOperacao(),
  })
  const equipe = useQuery({
    queryKey: CHAVE_DA_EQUIPE,
    queryFn: () => servicoDeEquipe.carregar(),
  })

  const carga = operacao.data
  const cargaDaEquipe = equipe.data

  return {
    carregada: !operacao.isPending && !equipe.isPending,
    freio: carga?.ok ? carga.freio : null,
    papel: cargaDaEquipe?.ok ? cargaDaEquipe.equipe.papelDoUsuario : null,
    administradores: cargaDaEquipe?.ok ? quemConcedeAcesso(cargaDaEquipe.equipe.membros) : [],
    recarregar: () => clienteDeConsulta.invalidateQueries({ queryKey: CHAVE_DA_OPERACAO }),
  }
}
