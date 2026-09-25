import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { caminhoDaAmostra, nomeCurto, type VozDeExemplo } from '@voz/vozes-de-exemplo.ts'

import { AMOSTRAS_GERADAS, VOZES_DE_EXEMPLO } from '@/configuracao-inicial/vozes-de-exemplo-geradas'
import { inicio as copy } from '@/copy/inicio'
import { useServicoDaSarah } from '@/sarah/contexto'

/**
 * A linha de uma voz. A escolhida leva o estado ativo do cartão de escolha; a
 * borda de repouso só entra fora dele, porque a utilitária venceria a classe.
 */
const CLASSE_DA_LINHA =
  'flex items-center justify-between gap-2 rounded-cartao border px-3 py-2.5 transition-[border-color,background-color,box-shadow] duration-150'
const CLASSE_DA_LINHA_EM_REPOUSO =
  'border-borda bg-superficie-funda/40 hover:border-borda-controle'

/** Escolher é confirmação: a voz escolhida fica menta, e o carmim fica para seguir. */
const CLASSE_DE_ESCOLHIDA = 'botao-menta px-3 py-1 text-[12.5px]'
const CLASSE_DE_ESCOLHER = 'botao-secundario px-3 py-1 text-[12.5px]'

/**
 * As barras da voz ao lado do nome enquanto a amostra toca. A altura vai no
 * `style`: `.onda-de-voz` mora fora das camadas e venceria a utilitária.
 */
function OndaTocando() {
  return (
    <span aria-hidden="true" className="onda-de-voz shrink-0" style={{ height: 16 }}>
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}

/** O que a etapa guarda da voz: uma das seis, ou qualquer outra do catálogo. */
export type VozDaEscolha = Pick<VozDeExemplo, 'id' | 'nome'>

type EscolhaDeVozProps = {
  escolhida: VozDaEscolha | null
  aoEscolher: (voz: VozDaEscolha) => void
}

/**
 * As seis vozes de exemplo, três de cada gênero, com a amostra gravada dentro
 * da aplicação: ouvir não sintetiza nada e não custa crédito a ninguém. Um
 * `<audio>` só, para duas amostras nunca tocarem juntas.
 */
export function EscolhaDeVoz({ escolhida, aoEscolher }: EscolhaDeVozProps) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [tocando, definirTocando] = useState<string | null>(null)
  const [outras, definirOutras] = useState(false)

  useEffect(() => () => audio.current?.pause(), [])

  /** Toca um endereço; o mesmo botão de novo para. Uma amostra por vez. */
  function tocar(id: string, endereco: string) {
    if (!audio.current) audio.current = new Audio()
    const tocador = audio.current
    if (tocando === id) {
      tocador.pause()
      definirTocando(null)
      return
    }
    tocador.src = endereco
    tocador.onended = () => definirTocando(null)
    // Navegador antigo devolve `undefined` em vez de promessa.
    const tocada = tocador.play() as Promise<void> | undefined
    tocada?.catch(() => definirTocando(null))
    definirTocando(id)
  }

  function ouvir(voz: VozDeExemplo) {
    tocar(voz.id, caminhoDaAmostra(voz.id))
  }

  if (outras) {
    return (
      <OutrasVozes
        escolhida={escolhida}
        tocando={tocando}
        aoTocar={tocar}
        aoEscolher={aoEscolher}
        aoFechar={() => definirOutras(false)}
      />
    )
  }

  const colunas = [
    { rotulo: copy.vozes.femininas, vozes: VOZES_DE_EXEMPLO.filter((voz) => voz.genero === 'feminina') },
    { rotulo: copy.vozes.masculinas, vozes: VOZES_DE_EXEMPLO.filter((voz) => voz.genero === 'masculina') },
  ]

  return (
    <section aria-label={copy.vozes.titulo} className="mt-5 flex flex-col gap-3">
      <h3 className="titulo-de-secao m-0">{copy.vozes.titulo}</h3>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        {colunas.map((coluna) => (
          <div key={coluna.rotulo} className="flex flex-col gap-2">
            <p className="sobretitulo m-0">{coluna.rotulo}</p>
            {coluna.vozes.map((voz, indice) => {
              const marcada = escolhida?.id === voz.id
              return (
                <div
                  key={voz.id}
                  className={`surgir ${CLASSE_DA_LINHA} ${marcada ? 'cartao-de-escolha-ativo' : CLASSE_DA_LINHA_EM_REPOUSO}`}
                  style={{ animationDelay: `${indice * 90}ms` }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {tocando === voz.id ? <OndaTocando /> : null}
                    <span className="truncate text-[13.5px] font-bold text-texto-principal">
                      {nomeCurto(voz)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {AMOSTRAS_GERADAS ? (
                      <button
                        type="button"
                        onClick={() => ouvir(voz)}
                        aria-label={`${tocando === voz.id ? copy.vozes.parar : copy.vozes.ouvir} ${nomeCurto(voz)}`}
                        className="botao-fantasma px-2 py-1 text-[12.5px]"
                      >
                        {tocando === voz.id ? copy.vozes.parar : copy.vozes.ouvir}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-pressed={marcada}
                      aria-label={`${copy.vozes.escolher} ${nomeCurto(voz)}`}
                      onClick={() => aoEscolher(voz)}
                      className={marcada ? CLASSE_DE_ESCOLHIDA : CLASSE_DE_ESCOLHER}
                    >
                      {marcada ? copy.vozes.escolhida : copy.vozes.escolher}
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => definirOutras(true)} className="botao-secundario self-start">
        {copy.vozes.outra}
      </button>
      <p className="m-0 text-[12.5px] text-texto-apoio">
        {copy.vozes.aviso}{' '}
        <a href="/sarah/voz" className="botao-link">
          {copy.vozes.abrirVoz}
        </a>
      </p>
    </section>
  )
}

type OutrasVozesProps = {
  escolhida: VozDaEscolha | null
  tocando: string | null
  aoTocar: (id: string, endereco: string) => void
  aoEscolher: (voz: VozDaEscolha) => void
  aoFechar: () => void
}

/**
 * As vozes em português da ElevenLabs da conta, pela mesma carga da tela de
 * voz. A prévia é a que o próprio provedor publica para cada voz: ouvir não
 * sintetiza nada.
 */
function OutrasVozes({ escolhida, tocando, aoTocar, aoEscolher, aoFechar }: OutrasVozesProps) {
  const sarah = useServicoDaSarah()
  const carga = useQuery({ queryKey: ['sarah-voz'], queryFn: () => sarah.carregarVoz() })
  const [busca, definirBusca] = useState('')

  const vozes = carga.data?.ok ? carga.data.voz.catalogo.vozes : []
  const termo = busca.trim().toLowerCase()
  const filtradas = termo ? vozes.filter((voz) => voz.nome.toLowerCase().includes(termo)) : vozes

  return (
    <section aria-label={copy.vozes.daConta} className="mt-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="titulo-de-secao m-0">{copy.vozes.daConta}</h3>
        <button type="button" onClick={aoFechar} className="botao-link">
          {copy.vozes.fecharOutras}
        </button>
      </div>

      <input
        aria-label={copy.vozes.buscar}
        placeholder={copy.vozes.buscarExemplo}
        value={busca}
        onChange={(evento) => definirBusca(evento.target.value)}
        className="campo"
      />

      {carga.isPending ? (
        <p role="status" className="m-0 flex items-center gap-2.5 text-[13px] text-texto-apoio">
          <span aria-hidden="true" className="giro" />
          {copy.vozes.carregandoCatalogo}
        </p>
      ) : !carga.data?.ok ? (
        <p role="alert" className="m-0 text-[13px] text-perigo">
          {copy.vozes.semCatalogo}
        </p>
      ) : filtradas.length === 0 ? (
        <p className="m-0 text-[13px] text-texto-apoio">{copy.vozes.semResultado}</p>
      ) : (
        <ul className="m-0 flex max-h-72 list-none flex-col gap-1.5 overflow-y-auto p-0 pr-1">
          {filtradas.map((voz) => {
            const marcada = escolhida?.id === voz.id
            const nome = nomeCurto(voz)
            return (
              <li
                key={voz.id}
                className={`${CLASSE_DA_LINHA} ${marcada ? 'cartao-de-escolha-ativo' : CLASSE_DA_LINHA_EM_REPOUSO}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {tocando === voz.id ? <OndaTocando /> : null}
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-bold text-texto-principal">{nome}</span>
                    {voz.descricao ? (
                      <span className="block truncate text-[11.5px] text-texto-apoio">{voz.descricao}</span>
                    ) : null}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {voz.previa ? (
                    <button
                      type="button"
                      onClick={() => aoTocar(voz.id, voz.previa ?? '')}
                      aria-label={`${tocando === voz.id ? copy.vozes.parar : copy.vozes.ouvir} ${nome}`}
                      className="botao-fantasma px-2 py-1 text-[12.5px]"
                    >
                      {tocando === voz.id ? copy.vozes.parar : copy.vozes.ouvir}
                    </button>
                  ) : (
                    <span className="text-[11.5px] text-texto-desativado">{copy.vozes.semPrevia}</span>
                  )}
                  <button
                    type="button"
                    aria-pressed={marcada}
                    aria-label={`${copy.vozes.escolher} ${nome}`}
                    onClick={() => aoEscolher({ id: voz.id, nome: voz.nome })}
                    className={marcada ? CLASSE_DE_ESCOLHIDA : CLASSE_DE_ESCOLHER}
                  >
                    {marcada ? copy.vozes.escolhida : copy.vozes.escolher}
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
