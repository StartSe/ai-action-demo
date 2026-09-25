import { useQuery } from '@tanstack/react-query'

import { Carregando } from '@/componentes/carregando'
import { Secao } from '@/componentes/secao'
import { discagem as copyDaDiscagem } from '@/copy/discagem'
import { useServicoDeDiscagem } from '@/discagem/contexto'
import type { FaltaNoPortao, PortaoDaConta } from '@/discagem/tipos'

const copy = copyDaDiscagem.portao

const CHAVE = ['portao-de-lead-real'] as const

/** As duas condições na ordem da guarda: a liberação da fase, depois a ligação de teste. */
const CONDICOES: readonly FaltaNoPortao[] = ['liberacao_da_fase', 'primeira_chamada_de_teste']

/**
 * Se a conta já liga para lead real e o que falta (RF-912, L-03).
 *
 * A tela lê e desenha: o que falta vem de `estado_do_portao`, que repete o
 * passo 2 de `guard_dial`. Recalcular aqui a partir da bandeira e da data daria
 * à tela uma segunda versão da regra, e ela poderia dizer "liberado" com a
 * guarda fechada.
 */
export function EstadoDoPortao() {
  const servico = useServicoDeDiscagem()

  const consulta = useQuery({
    queryKey: CHAVE,
    queryFn: () => servico.portao(),
  })

  return (
    <Secao titulo={copy.titulo}>
      {consulta.isPending ? (
        <Carregando texto={copy.carregando} />
      ) : consulta.data?.ok ? (
        <Portao portao={consulta.data.portao} />
      ) : (
        <p role="alert" className="m-0 text-[12.5px] text-perigo">
          {copy.falhas[consulta.data?.motivo ?? 'falha-de-comunicacao']}
        </p>
      )}
    </Secao>
  )
}

function Portao({ portao }: { portao: PortaoDaConta }) {
  const liberado = portao.falta.length === 0

  return (
    <section
      aria-label={copy.titulo}
      className={`bloco-secundario px-4 py-3.5 text-[13.5px] ${
        liberado ? 'border-positivo-borda' : 'border-atencao-borda'
      }`}
    >
      <p className={`m-0 font-bold ${liberado ? 'text-positivo' : 'text-atencao'}`}>
        {liberado ? copy.liberado : copy.restrito}
      </p>
      <p className="mt-1 mb-3 text-texto-apoio">
        {liberado ? copy.liberadoExplicacao : copy.restritoExplicacao}
      </p>

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {CONDICOES.map((condicao) => {
          const falta = portao.falta.includes(condicao)
          const textos = copy.condicoes[condicao]
          return (
            // O ponto diz o mesmo que a palavra ao lado: menta cumprida,
            // âmbar pendente.
            <li
              key={condicao}
              aria-label={textos.rotulo}
              className={`relative pl-5 before:absolute before:top-[0.55em] before:left-0.5 before:h-2 before:w-2 before:rounded-full before:content-[''] ${
                falta ? 'before:bg-atencao' : 'before:bg-menta-2'
              }`}
            >
              <p className="m-0 font-semibold text-texto-principal">
                {textos.rotulo}:{' '}
                <span className={falta ? 'text-atencao' : 'text-texto-apoio'}>
                  {falta ? copy.pendente : copy.cumprida}
                </span>
              </p>
              {falta ? (
                <>
                  <p className="mt-0.5 mb-0 text-texto-apoio">{textos.pendente}</p>
                  <p className="mt-0.5 mb-0">{textos.caminho}</p>
                  {condicao === 'primeira_chamada_de_teste' ? (
                    <a href="/" className="botao-link mt-1 inline-block">
                      {copy.abrirDiscador}
                    </a>
                  ) : null}
                </>
              ) : (
                <p className="mt-0.5 mb-0 text-texto-apoio">
                  {condicao === 'liberacao_da_fase'
                    ? copy.faseLiberada
                    : copy.ligacaoFeita(portao.primeiraChamadaDeTesteEm)}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
