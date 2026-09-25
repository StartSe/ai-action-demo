import { useState, type FormEvent } from 'react'

import { AreaDeAcesso } from '@/componentes/area-de-acesso'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import {
  avaliarChave,
  guardar as guardarNoNavegador,
  normalizarUrlDoProjeto,
  type ConfiguracaoDoProjeto,
} from '@/conexao/configuracao-do-projeto'
import { enderecoDoInstalador } from '@/conexao/instalador'
import { conferirProjeto, type ResultadoDaConferencia } from '@/conexao/saude-do-projeto'
import { conexao } from '@/copy/conexao'

const copy = conexao.tela

type FalhaDaConexao = keyof typeof copy.falhas

type TelaDeConexaoProps = {
  aoConectar: (configuracao: ConfiguracaoDoProjeto) => void
  /** Injetáveis para o teste: a conferência vai à rede, a gravação ao navegador. */
  conferir?: (url: string) => Promise<ResultadoDaConferencia>
  guardar?: (configuracao: ConfiguracaoDoProjeto) => boolean
  /** O endereço desta cópia, para o instalador devolver a pessoa. */
  volta?: string
}

/**
 * A primeira tela de uma cópia sem projeto: antes da entrada, porque sem
 * projeto não há Auth a quem pedir sessão.
 *
 * O caminho principal é o instalador do painel, que devolve a pessoa com o
 * projeto no link. O formulário é a reserva, para quem já instalou: o endereço
 * basta, porque a função `saude` do projeto devolve a chave publicável, e a
 * mesma chamada prova que a instalação está lá antes de gravar qualquer coisa.
 */
export function TelaDeConexao({
  aoConectar,
  conferir = conferirProjeto,
  guardar = guardarNoNavegador,
  volta = window.location.origin,
}: TelaDeConexaoProps) {
  const [url, definirUrl] = useState('')
  const [chave, definirChave] = useState('')
  const [erroDeUrl, definirErroDeUrl] = useState<string>()
  const [erroDeChave, definirErroDeChave] = useState<string>()
  const [falha, definirFalha] = useState<FalhaDaConexao>()
  const [enviando, definirEnviando] = useState(false)

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    definirFalha(undefined)

    const endereco = normalizarUrlDoProjeto(url)
    const chaveInformada = chave.trim()
    const avaliacao = chaveInformada === '' ? null : avaliarChave(chaveInformada)

    definirErroDeUrl(endereco ? undefined : copy.urlInvalida)
    definirErroDeChave(
      avaliacao === 'secreta'
        ? copy.chaveSecreta
        : avaliacao === 'invalida'
          ? copy.chaveInvalida
          : undefined,
    )
    if (!endereco || (avaliacao !== null && avaliacao !== 'publicavel')) return

    definirEnviando(true)
    const resultado = await conferir(endereco)
    definirEnviando(false)

    if (resultado.estado !== 'pronto') {
      definirFalha(resultado.estado)
      return
    }

    const chaveFinal = chaveInformada || resultado.chave || ''
    if (avaliarChave(chaveFinal) !== 'publicavel') {
      definirErroDeChave(copy.semChave)
      return
    }

    const configuracao = { url: endereco, chave: chaveFinal }
    if (!guardar(configuracao)) {
      definirFalha('sem_armazenamento')
      return
    }
    aoConectar(configuracao)
  }

  return (
    <AreaDeAcesso>
      <h1 className="titulo-de-tela m-0">{copy.titulo}</h1>
      <p className="mt-2.5 mb-0 text-texto-apoio">{copy.explicacao}</p>

      <div className="mt-6 flex flex-col gap-2">
        <a className="botao-primario w-full text-center" href={enderecoDoInstalador(volta)}>
          {copy.instalar}
        </a>
        <p className="m-0 text-[12.5px] text-texto-apoio">{copy.instalarApoio}</p>
      </div>

      <form onSubmit={enviar} noValidate className="mt-7 flex flex-col gap-4 border-t border-borda-suave pt-6">
        <h2 className="titulo-de-secao m-0">{copy.manualTitulo}</h2>

        <CampoDeTexto
          rotulo={copy.url.rotulo}
          exemplo={copy.url.exemplo}
          apoio={copy.url.apoio}
          name="projeto"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={url}
          erro={erroDeUrl}
          onChange={(evento) => definirUrl(evento.target.value)}
        />

        <CampoDeTexto
          rotulo={copy.chave.rotulo}
          exemplo={copy.chave.exemplo}
          apoio={copy.chave.apoio}
          name="chave"
          autoComplete="off"
          spellCheck={false}
          value={chave}
          erro={erroDeChave}
          onChange={(evento) => definirChave(evento.target.value)}
        />

        {falha ? (
          <p role="alert" className="m-0 text-[12.5px] text-perigo">
            {copy.falhas[falha]}
          </p>
        ) : null}

        <button type="submit" disabled={enviando} className="botao-secundario w-full">
          {enviando ? copy.acaoEmCurso : copy.acao}
        </button>
      </form>
    </AreaDeAcesso>
  )
}

type ConfirmacaoDeProjetoProps = {
  atual: ConfiguracaoDoProjeto
  novo: ConfiguracaoDoProjeto
  aoConfirmar: () => void
  aoManter: () => void
}

/**
 * O link do instalador trouxe um projeto diferente do que esta cópia usa. Um
 * link pode ser mandado por qualquer um, então a troca espera a pessoa ver os
 * dois endereços e escolher.
 */
export function ConfirmacaoDeProjeto({ atual, novo, aoConfirmar, aoManter }: ConfirmacaoDeProjetoProps) {
  const texto = conexao.confirmacao
  return (
    <AreaDeAcesso>
      <h1 className="titulo-de-tela m-0">{texto.titulo}</h1>
      <p className="mt-2.5 mb-0 text-texto-apoio">{texto.explicacao}</p>

      <dl className="mt-6 flex flex-col gap-3">
        <div>
          <dt className="text-[13px] font-semibold">{texto.atual}</dt>
          <dd className="val m-0 text-[12.5px] break-all">{atual.url}</dd>
        </div>
        <div>
          <dt className="text-[13px] font-semibold">{texto.novo}</dt>
          <dd className="val m-0 text-[12.5px] break-all">{novo.url}</dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-col gap-2.5">
        <button type="button" className="botao-primario w-full" onClick={aoConfirmar}>
          {texto.acao}
        </button>
        <button type="button" className="botao-secundario w-full" onClick={aoManter}>
          {texto.manter}
        </button>
      </div>
    </AreaDeAcesso>
  )
}
