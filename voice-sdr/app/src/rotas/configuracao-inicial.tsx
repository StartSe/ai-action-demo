import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

import { AreaDeTrabalho } from '@/componentes/area-de-trabalho'
import { AssistenteDeInicio } from '@/configuracao-inicial/assistente-de-inicio'
import { useServicoDeConfiguracaoInicial } from '@/configuracao-inicial/contexto'
import { definirDispensa } from '@/configuracao-inicial/progresso'
import { marcarTutorialVisto } from '@/configuracao-inicial/visita'
import { configuracaoInicial as copy } from '@/copy/configuracao-inicial'
import type { CondutorDeConversa } from '@/sarah/ensaio'

/**
 * O tutorial é o assistente de abertura, e só ele: das conexões à primeira
 * ligação de teste, abrindo na primeira coisa que falta. Fechar no meio grava
 * a dispensa e leva ao painel; a próxima entrada o reabre onde parou.
 */
export function TelaDeConfiguracaoInicial({
  condutor,
}: {
  /** Quem conduz a entrevista por voz. O roteador entrega o da ElevenLabs. */
  condutor?: CondutorDeConversa
} = {}) {
  const servico = useServicoDeConfiguracaoInicial()
  const navegar = useNavigate()
  const busca = useQuery({ queryKey: ['configuracao-inicial'], queryFn: () => servico.carregar() })
  useEffect(marcarTutorialVisto, [])

  async function sair(dispensar: boolean) {
    const carga = busca.data
    if (dispensar && carga?.ok) {
      await servico.salvar(definirDispensa(carga.configuracao, true)).catch(() => null)
      // O painel decide pela mesma chave: com a leitura velha, ele veria o
      // tutorial ainda aberto e mandaria de volta para cá.
      await busca.refetch()
    }
    await navegar({ to: '/' })
  }

  return (
    <AreaDeTrabalho titulo={copy.titulo} lead={copy.explicacao}>
      <AssistenteDeInicio
        condutor={condutor}
        aoConcluir={() => void sair(false)}
        aoPular={() => void sair(true)}
      />
    </AreaDeTrabalho>
  )
}
