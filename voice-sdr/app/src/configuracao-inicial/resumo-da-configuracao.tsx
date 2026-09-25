import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { Selo, type TomDoSelo } from '@/componentes/selo'
import {
  PARTES_DO_RESUMO,
  aplicarSugestoes,
  type EstadoDaParte,
  type ParteAplicada,
  type SugestoesRevisadas,
} from '@/configuracao-inicial/aplicacao-das-sugestoes'
import { CAMINHO_DA_TELA, telasDoPasso } from '@/configuracao-inicial/telas-do-passo'
import { inicio as copy } from '@/copy/inicio'
import { useTextosDoInicio } from '@/configuracao-inicial/textos'
import { useServicoDaSarah } from '@/sarah/contexto'

const TOM_DO_ESTADO: Record<EstadoDaParte, TomDoSelo> = {
  aplicado: 'positivo',
  rascunho: 'acento',
  para_fazer: 'atencao',
  nada: 'neutro',
  falhou: 'perigo',
}

/** Quanto do valor aparece no cartão. O resto se vê ao alterar. */
const TAMANHO_DO_TRECHO = 180

function trecho(texto: string): string {
  return texto.length > TAMANHO_DO_TRECHO ? `${texto.slice(0, TAMANHO_DO_TRECHO).trimEnd()}…` : texto
}

function rotuloDoCampo(chave: string): string {
  return copy.resumo.campos[chave] ?? copy.sugestoes.campos[chave] ?? chave
}

type ResumoDaConfiguracaoProps = {
  revisadas: SugestoesRevisadas
  /** Segue para a publicação, que é o que põe tudo isto no ar. */
  aoSeguir: () => void
  /** Volta à revisão, com o que foi escrito, para corrigir o que falhou. */
  aoRevisar: () => void
}

/** Sem estas três, publicar recusa: a falha de uma delas não deixa seguir. */
const PARTES_QUE_PUBLICAR_EXIGE: readonly ParteAplicada['parte'][] = ['identidade', 'voz', 'roteiro']

/**
 * Aplica as sugestões revisadas e conta o que fez. Enquanto aplica, a lista se
 * preenche parte a parte; no fim, cada parte vira um cartão com o que foi
 * gravado e o caminho para alterar.
 */
export function ResumoDaConfiguracao({ revisadas, aoSeguir, aoRevisar }: ResumoDaConfiguracaoProps) {
  const sarah = useServicoDaSarah()
  const copy = useTextosDoInicio()
  const cliente = useQueryClient()
  const [feitas, definirFeitas] = useState<ParteAplicada[]>([])
  const [pronto, definirPronto] = useState(false)
  // O `StrictMode` roda o efeito duas vezes em desenvolvimento, e a ref
  // sobrevive ao remonte simulado: sem ela as respostas entrariam em dobro na
  // base de conhecimento.
  const iniciado = useRef(false)

  useEffect(() => {
    if (iniciado.current) return
    iniciado.current = true
    void aplicarSugestoes(sarah, revisadas, (parte) =>
      definirFeitas((atuais) => [...atuais, parte]),
    ).then(() => {
      definirPronto(true)
      // As telas das partes leem de novo o que acabou de ser gravado.
      void cliente.invalidateQueries()
    })
  }, [sarah, revisadas, cliente])

  if (!pronto) {
    const emCurso = PARTES_DO_RESUMO[feitas.length]
    return (
      <ol role="status" className="m-0 flex list-none flex-col gap-1.5 p-0 py-2">
        {PARTES_DO_RESUMO.map((parte, indice) => {
          const feita = feitas[indice]
          const atual = parte === emCurso
          return (
            <li
              key={parte}
              className={`flex min-h-11 items-center gap-3 rounded-controle border px-3.5 py-2 text-[13.5px] transition-[opacity,border-color,background-color] duration-300 ${
                atual
                  ? 'border-borda bg-superficie-funda/60'
                  : 'border-transparent'
              } ${feita || atual ? 'opacity-100' : 'opacity-40'}`}
            >
              {/* O marcador ocupa sempre o lugar do giro, para o texto não
                  andar quando a parte termina. */}
              <span aria-hidden="true" className="grid h-[22px] w-[22px] shrink-0 place-items-center">
                {feita ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-positivo shadow-[0_0_0_4px_var(--positivo-fundo)]" />
                ) : atual ? (
                  <span className="giro" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-superficie-3" />
                )}
              </span>
              <span className={feita ? 'text-texto-secundario' : 'font-semibold text-texto-principal'}>
                {feita ? copy.resumo.partes[parte] : copy.resumo.aplicando[parte]}
              </span>
              {feita ? (
                <span className="ml-auto">
                  <Selo tom={TOM_DO_ESTADO[feita.estado]}>{copy.resumo.estados[feita.estado]}</Selo>
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>
    )
  }

  // Parte que publicar exige e não foi gravada: seguir levaria a uma recusa.
  // `nada` também trava, porque sem sugestão aquela parte fica vazia.
  const travadas = feitas.filter(
    (parte) =>
      PARTES_QUE_PUBLICAR_EXIGE.includes(parte.parte) &&
      (parte.estado === 'falhou' || (parte.estado === 'nada' && parte.parte !== 'voz')),
  )

  return (
    <div className="flex flex-col gap-3.5 pb-3">
      {feitas.map((parte, indice) => (
        <section
          key={parte.parte}
          aria-label={copy.resumo.partes[parte.parte]}
          className={`surgir rounded-cartao border border-borda-suave bg-superficie-funda/50 px-5 py-4 max-md:px-4 ${
            parte.estado === 'nada' ? 'opacity-60' : ''
          }`}
          style={{ animationDelay: `${indice * 110}ms` }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <h3 className="m-0 text-[14.5px] font-extrabold tracking-[-0.01em] text-texto-principal">
              {copy.resumo.partes[parte.parte]}
            </h3>
            <Selo tom={TOM_DO_ESTADO[parte.estado]}>{copy.resumo.estados[parte.estado]}</Selo>
          </div>
          <p className="mt-1 mb-0 text-[12.5px] text-texto-apoio">
            {copy.resumo.explicacao(parte.parte, parte.estado)}
          </p>

          {parte.itens.length > 0 ? (
            <dl className="mt-3 mb-0 flex flex-col gap-2.5 border-t border-borda-suave pt-3">
              {parte.itens.map((item) => (
                <div key={item.chave} className="min-w-0">
                  <dt className="text-[12px] font-bold text-texto-apoio">
                    {rotuloDoCampo(item.chave)}
                  </dt>
                  <dd className="m-0 text-[13px] whitespace-pre-line text-texto-principal">
                    {trecho(item.valor)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {parte.estado !== 'nada' ? (
            <div className="mt-3">
              {/* Alterar abre a tela da parte, como a barra lateral: o que a
                  IA gravou já está lá, e o assistente reabre onde parou. */}
              {parte.passo ? (
                <a
                  href={CAMINHO_DA_TELA[telasDoPasso(parte.passo)[0] ?? 'identidade']}
                  className="botao-link"
                >
                  {copy.resumo.alterar}
                </a>
              ) : (
                <a href="/sarah/conhecimento" className="botao-link">
                  {copy.resumo.abrirConhecimento}
                </a>
              )}
            </div>
          ) : null}
        </section>
      ))}

      {travadas.length > 0 ? (
        <div role="alert" className="flex flex-col gap-3 rounded-cartao border border-perigo-borda bg-perigo-fundo px-4 py-3.5">
          <p className="m-0 text-[13px] text-perigo">
            {copy.resumo.travado(travadas.map((parte) => copy.resumo.partes[parte.parte]))}
          </p>
          <div>
            <button type="button" onClick={aoRevisar} className="botao-primario">
              {copy.resumo.revisar}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end pt-1">
          <button type="button" onClick={aoSeguir} className="botao-primario">
            {copy.resumo.concluir}
          </button>
        </div>
      )}
    </div>
  )
}
