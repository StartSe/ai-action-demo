import { useQuery } from '@tanstack/react-query'

import { useServicoDeChamadas } from '@/chamadas/contexto'
import { duracaoPorExtenso, juntarValores } from '@/chamadas/estimativa'
import { estimativaDeCusto as copy } from '@/copy/chamadas'

/** A mesma chave no discador e na primeira ligação: uma leitura só por tela. */
const CHAVE_DA_ESTIMATIVA = ['estimativa-de-custo'] as const

/**
 * Quanto uma ligação custa, antes de ligar (D-14).
 *
 * O número vem do banco (`estimativa_de_custo`), das últimas ligações
 * atendidas da conta com preço, por moeda. Sem ligação medida, diz que a
 * estimativa vem depois da primeira. Enquanto carrega, ou se a leitura falhar,
 * não desenha nada: a estimativa ajuda a decidir, mas não trava a ligação.
 */
export function EstimativaDeCusto() {
  const servico = useServicoDeChamadas()
  const consulta = useQuery({
    queryKey: CHAVE_DA_ESTIMATIVA,
    queryFn: () => servico.estimarCusto(),
  })

  const carga = consulta.data
  if (!carga?.ok) return null
  const { estimativa } = carga

  return (
    <div
      role="note"
      aria-label={copy.titulo}
      className="bloco-secundario px-4 py-3 text-[13.5px]"
    >
      <p className="m-0 font-semibold text-texto-principal">{copy.titulo}</p>
      {estimativa.ligacoesMedidas === 0 ? (
        <p className="mt-1 mb-0 text-texto-apoio">{copy.semAmostra}</p>
      ) : (
        <>
          <p className="mt-1 mb-0 text-texto-secundario">
            <span className="val">
              {copy.porLigacao(
                juntarValores(estimativa.porLigacao),
                juntarValores(estimativa.porMinuto),
              )}
            </span>
          </p>
          <p className="mt-1 mb-0 text-texto-apoio">
            {copy.base(
              estimativa.ligacoesMedidas,
              estimativa.duracaoMediaSeg === null
                ? null
                : duracaoPorExtenso(estimativa.duracaoMediaSeg),
            )}
          </p>
          <p className="mt-1 mb-0 text-texto-apoio">{copy.aviso}</p>
        </>
      )}
    </div>
  )
}
