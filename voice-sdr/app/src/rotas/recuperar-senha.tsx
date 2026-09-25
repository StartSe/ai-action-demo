import { Link } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { useAutenticacao } from '@/autenticacao/contexto'
import type {
  MotivoDeFalhaDeRecuperacao,
  ServicoDeAutenticacao,
} from '@/autenticacao/tipos'
import { AreaDeAcesso } from '@/componentes/area-de-acesso'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { EnderecosDoAuth } from '@/conexao/enderecos-do-auth'
import { autenticacao, TAMANHO_MINIMO_DE_SENHA } from '@/copy/autenticacao'
import { comum } from '@/copy/comum'

const copy = autenticacao.recuperarSenha

/**
 * Uma rota, dois momentos. Sem sessão, a tela pede o e-mail e dispara o link.
 * Com sessão, quem chegou aqui veio do link do e-mail (o Supabase já abriu a
 * sessão de recuperação) e o que falta é escolher a senha nova.
 */
export function TelaDeRecuperacaoDeSenha() {
  const { servico, sessao } = useAutenticacao()

  return (
    <AreaDeAcesso>
      {sessao ? (
        <FormularioDeNovaSenha servico={servico} />
      ) : (
        <FormularioDePedido servico={servico} />
      )}
    </AreaDeAcesso>
  )
}

type FormularioProps = {
  servico: ServicoDeAutenticacao
}

function FormularioDePedido({ servico }: FormularioProps) {
  const [email, definirEmail] = useState('')
  const [erroDeEmail, definirErroDeEmail] = useState<string>()
  const [falha, definirFalha] = useState<MotivoDeFalhaDeRecuperacao>()
  const [enviado, definirEnviado] = useState(false)
  const [enviando, definirEnviando] = useState(false)

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    const emailInformado = email.trim()
    definirErroDeEmail(emailInformado ? undefined : copy.pedido.emailObrigatorio)
    definirFalha(undefined)
    if (!emailInformado) return

    definirEnviando(true)
    const resultado = await servico.pedirRecuperacao(emailInformado)
    definirEnviando(false)

    if (resultado.ok) {
      definirEnviado(true)
      return
    }

    definirFalha(resultado.motivo)
  }

  return (
    <>
      <h1 className="titulo-de-tela m-0">{copy.pedido.titulo}</h1>
      <p className="mt-2.5 mb-0 text-texto-apoio">{copy.pedido.explicacao}</p>

      {enviado ? (
        <>
          <p role="status" className="mt-6 mb-0 text-texto-secundario">
            {copy.pedido.enviado}
          </p>
          {/* O link do e-mail só volta para esta cópia se o Auth do projeto
              conhecer o endereço dela. A instalação não consegue gravá-lo. */}
          <EnderecosDoAuth />
        </>
      ) : (
        <form onSubmit={enviar} noValidate className="mt-6 flex flex-col gap-4">
          <CampoDeTexto
            rotulo={copy.pedido.email.rotulo}
            exemplo={copy.pedido.email.exemplo}
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            erro={erroDeEmail}
            onChange={(evento) => definirEmail(evento.target.value)}
          />

          {falha ? (
            <p role="alert" className="m-0 text-[12.5px] text-perigo">
              {copy.falhas[falha]}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={enviando}
            className="botao-primario mt-1 w-full"
          >
            {enviando ? copy.pedido.acaoEmCurso : copy.pedido.acao}
          </button>
        </form>
      )}

      <p className="mt-6 mb-0">
        <Link to="/entrar" className="botao-link">
          {copy.pedido.voltar}
        </Link>
      </p>
    </>
  )
}

function FormularioDeNovaSenha({ servico }: FormularioProps) {
  const [senha, definirSenha] = useState('')
  const [confirmacao, definirConfirmacao] = useState('')
  const [erroDeSenha, definirErroDeSenha] = useState<string>()
  const [erroDeConfirmacao, definirErroDeConfirmacao] = useState<string>()
  const [falha, definirFalha] = useState<MotivoDeFalhaDeRecuperacao>()
  const [salva, definirSalva] = useState(false)
  const [salvando, definirSalvando] = useState(false)

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    const erro = validarSenha(senha)
    definirErroDeSenha(erro)
    definirErroDeConfirmacao(
      senha === confirmacao ? undefined : copy.novaSenha.senhasDiferentes,
    )
    definirFalha(undefined)
    if (erro || senha !== confirmacao) return

    definirSalvando(true)
    const resultado = await servico.definirNovaSenha(senha)
    definirSalvando(false)

    if (resultado.ok) {
      definirSalva(true)
      return
    }

    definirFalha(resultado.motivo)
  }

  if (salva) {
    return (
      <>
        <h1 className="titulo-de-tela m-0">{copy.novaSenha.titulo}</h1>
        <p role="status" className="mt-2.5 mb-0 text-texto-secundario">
          {copy.novaSenha.salva}
        </p>
        <p className="mt-6 mb-0">
          <Link to="/" className="botao-link">
            {comum.irParaOPainel}
          </Link>
        </p>
      </>
    )
  }

  return (
    <>
      <h1 className="titulo-de-tela m-0">{copy.novaSenha.titulo}</h1>
      <p className="mt-2.5 mb-0 text-texto-apoio">{copy.novaSenha.explicacao}</p>

      <form onSubmit={enviar} noValidate className="mt-6 flex flex-col gap-4">
        <CampoDeTexto
          rotulo={copy.novaSenha.senha.rotulo}
          type="password"
          name="senha"
          autoComplete="new-password"
          value={senha}
          erro={erroDeSenha}
          onChange={(evento) => definirSenha(evento.target.value)}
        />

        <CampoDeTexto
          rotulo={copy.novaSenha.confirmacao.rotulo}
          type="password"
          name="confirmacao"
          autoComplete="new-password"
          value={confirmacao}
          erro={erroDeConfirmacao}
          onChange={(evento) => definirConfirmacao(evento.target.value)}
        />

        {falha ? (
          <p role="alert" className="m-0 text-[12.5px] text-perigo">
            {copy.falhas[falha]}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={salvando}
          className="botao-primario mt-1 w-full"
        >
          {salvando ? copy.novaSenha.acaoEmCurso : copy.novaSenha.acao}
        </button>
      </form>
    </>
  )
}

function validarSenha(senha: string): string | undefined {
  if (!senha) return copy.novaSenha.senhaObrigatoria
  if (senha.length < TAMANHO_MINIMO_DE_SENHA) return copy.novaSenha.senhaCurta
  return undefined
}
