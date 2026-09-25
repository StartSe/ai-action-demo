import { useQuery } from '@tanstack/react-query'

import { conferirProjeto, situacaoDaVersao, type ResultadoDaConferencia } from '@/conexao/saude-do-projeto'
import { conexao } from '@/copy/conexao'

type AvisoDeVersaoProps = {
  url: string
  conferir?: (url: string) => Promise<ResultadoDaConferencia>
}

/**
 * Uma faixa no topo quando o banco e esta cópia não estão na mesma versão.
 *
 * Cada cliente tem a própria cópia e o próprio projeto, e os dois se atualizam
 * por caminhos diferentes: a cópia pelo repositório, o banco pelo instalador
 * do painel. A faixa diz qual dos dois ficou para trás. Versão desconhecida
 * (projeto instalado por fora do painel) e projeto que não respondeu não
 * desenham nada: a faixa é aviso, não bloqueio.
 */
export function AvisoDeVersao({ url, conferir = conferirProjeto }: AvisoDeVersaoProps) {
  const consulta = useQuery({
    queryKey: ['saude-do-projeto', url],
    queryFn: () => conferir(url),
    staleTime: Infinity,
    retry: false,
  })

  const resultado = consulta.data
  if (!resultado || resultado.estado !== 'pronto') return null
  const situacao = situacaoDaVersao(resultado.versao)
  if (situacao === 'em_dia' || situacao === 'desconhecida') return null

  const texto = conexao.versao[situacao]
  return (
    <div role="status" className="border-b border-borda-suave bg-superficie-cartao px-5 py-3 text-[13px]">
      <strong className="text-texto-principal">{texto.titulo}.</strong>{' '}
      <span className="text-texto-apoio">{texto.texto}</span>
    </div>
  )
}
