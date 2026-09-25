import type { ReactNode } from 'react'

import { Painel } from '@/componentes/painel'
import { Selo, type TomDoSelo } from '@/componentes/selo'
import { playbooksDaSarah as copy } from '@/copy/sarah'
import type { EstadoDoIndicador } from '@/sarah/playbooks'

const TOM: Record<EstadoDoIndicador, TomDoSelo> = {
  rascunho: 'neutro',
  publicado: 'positivo',
  alteracoes_pendentes: 'atencao',
  alterado_fora_da_plataforma: 'perigo',
}

/**
 * O estado de publicação da Sarah com os quatro estados: os três de RF-311 e o
 * de R-06. Quem decide o estado é `estadoDoIndicador`; aqui só se desenha.
 *
 * A ação de republicar vem por `acao`, e só quem publica a recebe: o botão
 * desenhado para quem não pode apertá-lo é convite à recusa da borda.
 */
export function IndicadorPublicacao({
  estado,
  detalhe,
  acao,
}: {
  estado: EstadoDoIndicador
  detalhe?: string
  acao?: ReactNode
}) {
  return (
    <Painel
      rotulo={copy.indicador.rotulo}
      sobretitulo={copy.indicador.rotulo}
      estado={<Selo tom={TOM[estado]}>{copy.indicador.selos[estado]}</Selo>}
    >
      <p className="m-0 text-[13.5px] text-texto-secundario">
        {copy.indicador[estado]}
      </p>
      {detalhe ? (
        <p className="mt-1.5 mb-0 text-[13px] text-texto-apoio">{detalhe}</p>
      ) : null}
      {acao ? <div className="mt-3">{acao}</div> : null}
    </Painel>
  )
}
