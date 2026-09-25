import { Outlet, useRouterState } from '@tanstack/react-router'

import { useAutenticacao } from '@/autenticacao/contexto'
import { BarraDoTopo } from '@/componentes/barra-do-topo'
import { BarraLateral } from '@/componentes/barra-lateral'
import { ChecklistDeConfiguracao } from '@/componentes/checklist-de-configuracao'
import { CAMINHO_DA_FILA } from '@/copy/navegacao'
import { useItensAbertosDaFila } from '@/fila/contagem-da-fila'
import {
  AvisoDeDiscagemPausada,
  BotaoDoFreio,
} from '@/componentes/freio-de-emergencia'
import { rotuloDoCaminho } from '@/utilidades/navegacao'

export function Casca() {
  const caminhoAtual = useRouterState({
    select: (estado) => estado.location.pathname,
  })
  const { servico, sessao } = useAutenticacao()
  const abertosNaFila = useItensAbertosDaFila()

  // Sem fundo próprio: o do `body` traz os dois brilhos do design system.
  return (
    <div className="min-h-screen">
      <BarraLateral
        caminhoAtual={caminhoAtual}
        checklist={<ChecklistDeConfiguracao />}
        contagens={abertosNaFila === null ? undefined : { [CAMINHO_DA_FILA]: abertosNaFila }}
      />
      <div className="flex min-h-screen flex-col pl-[var(--largura-barra-lateral)]">
        <BarraDoTopo
          secao={rotuloDoCaminho(caminhoAtual)}
          emailDoUsuario={sessao?.email}
          aoSair={() => {
            void servico.sair()
          }}
          freio={<BotaoDoFreio />}
        />
        <AvisoDeDiscagemPausada />
        <Outlet />
      </div>
    </div>
  )
}
