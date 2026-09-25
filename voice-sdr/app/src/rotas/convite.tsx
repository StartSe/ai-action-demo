import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'

import { useAutenticacao } from '@/autenticacao/contexto'
import { AreaDeAcesso } from '@/componentes/area-de-acesso'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { Carregando } from '@/componentes/carregando'
import { convite as copy } from '@/copy/convite'
import { PAPEL_EM_PORTUGUES } from '@/copy/equipe'
import { useServicoDeEquipe } from '@/equipe/contexto'
import type { RespostaDoAceite } from '@/equipe/tipos'
import { formatarData } from '@/utilidades/datas'

export function TelaDeConvite() {
  const { token } = useParams({ from: '/convite/$token' })
  const servico = useServicoDeEquipe()
  const { servico: autenticacao, sessao } = useAutenticacao()

  const consulta = useQuery({
    queryKey: ['convite', token],
    queryFn: () => servico.lerConvite(token),
  })

  const [resposta, definirResposta] = useState<RespostaDoAceite>()
  const [aceitando, definirAceitando] = useState(false)

  async function aceitar() {
    definirAceitando(true)
    definirResposta(await servico.aceitarConvite(token))
    definirAceitando(false)
  }

  if (consulta.isPending) {
    return (
      <Moldura>
        <Carregando texto={copy.carregando} />
      </Moldura>
    )
  }

  if (!consulta.data?.ok) {
    return (
      <Moldura>
        <CaixaDeErro>{copy.falhaDeComunicacao}</CaixaDeErro>
      </Moldura>
    )
  }

  const { previa } = consulta.data

  if (previa.situacao !== 'valido') {
    return (
      <Moldura>
        <CaixaDeErro>{copy.situacoes[previa.situacao]}</CaixaDeErro>
        <Link to="/entrar" className="botao-link mt-4 inline-block">
          {copy.entrar}
        </Link>
      </Moldura>
    )
  }

  // A conferência de e-mail que vale é a do banco, dentro de aceitar_convite.
  // Esta aqui só evita o clique que já se sabe recusado.
  const emailConfere =
    sessao !== null &&
    sessao.email.trim().toLowerCase() === previa.email.trim().toLowerCase()

  return (
    <Moldura>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2">
        <Linha rotulo={copy.convidadoPor} valor={previa.convidadoPor} />
        <Linha rotulo={copy.empresa} valor={previa.contaNome} />
        <Linha rotulo={copy.papel} valor={PAPEL_EM_PORTUGUES[previa.papel]} />
        <Linha rotulo={copy.paraOEmail} valor={previa.email} monoespacado />
        <Linha
          rotulo={copy.validoAte}
          valor={formatarData(previa.expiraEm)}
          monoespacado
        />
      </dl>

      {resposta ? (
        <div className="mt-6">
          {resposta.ok ? (
            <p role="status" className="m-0 text-texto-secundario">
              {resposta.mensagem}
            </p>
          ) : (
            <CaixaDeErro>{resposta.mensagem}</CaixaDeErro>
          )}
          {resposta.ok ? (
            <Link to="/" className="botao-link mt-3 inline-block">
              {copy.irParaOPainel}
            </Link>
          ) : null}
        </div>
      ) : sessao === null ? (
        <div className="mt-6">
          <p className="m-0 text-texto-apoio">{copy.semSessao}</p>
          <div className="mt-3 flex gap-5">
            <Link
              to="/entrar"
              search={{ destino: `/convite/${token}` }}
              className="botao-link"
            >
              {copy.entrar}
            </Link>
            <Link to="/recuperar-senha" className="botao-link">
              {copy.criarSenha}
            </Link>
          </div>
        </div>
      ) : emailConfere ? (
        <button
          type="button"
          disabled={aceitando}
          onClick={() => {
            void aceitar()
          }}
          className="botao-primario mt-6"
        >
          {aceitando ? copy.aceitando : copy.aceitar}
        </button>
      ) : (
        <div className="mt-6">
          <CaixaDeErro>{copy.emailDiferente}</CaixaDeErro>
          <button
            type="button"
            onClick={() => {
              void autenticacao.sair()
            }}
            className="botao-link mt-3"
          >
            {copy.sair}
          </button>
        </div>
      )}
    </Moldura>
  )
}

function Moldura({ children }: { children: ReactNode }) {
  return (
    <AreaDeAcesso>
      <h1 className="titulo-de-tela m-0 mb-6">{copy.titulo}</h1>
      {children}
    </AreaDeAcesso>
  )
}

function Linha({
  rotulo,
  valor,
  monoespacado,
}: {
  rotulo: string
  valor: string
  monoespacado?: boolean
}) {
  return (
    <>
      <dt className="text-[13px] text-texto-apoio">{rotulo}</dt>
      <dd
        className={
          monoespacado
            ? 'val m-0 text-[13px] text-texto-principal'
            : 'm-0 font-medium text-texto-principal'
        }
      >
        {valor}
      </dd>
    </>
  )
}
