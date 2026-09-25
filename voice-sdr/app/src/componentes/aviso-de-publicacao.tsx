import { Painel } from '@/componentes/painel'
import { Selo, type TomDoSelo } from '@/componentes/selo'
import { identidadeDaSarah as copy, PUBLICACAO_EM_PORTUGUES } from '@/copy/sarah'
import type { EstadoDePublicacao } from '@/sarah/tipos'

const TOM: Record<EstadoDePublicacao, TomDoSelo> = {
  rascunho: 'neutro',
  publicado: 'positivo',
  alteracoes_pendentes: 'atencao',
}

/**
 * O estado de publicação (RF-311) e o que ele cobra, em toda tela que muda o
 * que a Sarah leva para a ligação.
 *
 * `alteracoes_pendentes` é o caso que este aviso existe para não deixar passar
 * em silêncio: salvar muda o banco e não põe no ar, e configuração salva que
 * não está no ar é a forma mais silenciosa de enganar quem configura.
 */
export function AvisoDePublicacao({ estado }: { estado: EstadoDePublicacao }) {
  return (
    <Painel
      sobretitulo={copy.publicacao.rotulo}
      estado={<Selo tom={TOM[estado]}>{PUBLICACAO_EM_PORTUGUES[estado]}</Selo>}
    >
      <p className="m-0 text-[13.5px] text-texto-secundario">
        {copy.publicacao[estado]}
      </p>
      {estado === 'publicado' ? null : (
        <a href="/sarah/playbooks" className="botao-link mt-2 inline-block">
          {copy.publicacao.publicar}
        </a>
      )}
    </Painel>
  )
}
