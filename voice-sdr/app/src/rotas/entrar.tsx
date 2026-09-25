import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { useAutenticacao } from '@/autenticacao/contexto'
import type { MotivoDeFalhaDeEntrada } from '@/autenticacao/tipos'
import { AreaDeAcesso } from '@/componentes/area-de-acesso'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { ModalDeFundacao } from '@/componentes/modal-de-fundacao'
import { TrocarDeProjetoNaEntrada } from '@/conexao/projeto-na-conta'
import { useServicoDeConfiguracaoInicial } from '@/configuracao-inicial/contexto'
import {
  CAMINHO_DA_CONFIGURACAO,
  destinoDepoisDaEntrada,
  reabrirNaEntrada,
} from '@/configuracao-inicial/progresso'
import { autenticacao } from '@/copy/autenticacao'

const copy = autenticacao.entrar

/** Pergunta uma vez por montagem: o estado só muda na própria fundação. */
const CHAVE_DA_FUNDACAO = ['instalacao-sem-dono'] as const

/** A primeira tela da instalação nova: o assistente de configuração. */
const CAMINHO_DEPOIS_DA_FUNDACAO = CAMINHO_DA_CONFIGURACAO

export function TelaDeEntrada() {
  const { servico } = useAutenticacao()
  // `destino` só chega aqui quando a guarda de rota desviou alguém de uma
  // página que exige sessão. É o que a entrada devolve depois.
  const { destino } = useSearch({ from: '/entrar' })
  const navegar = useNavigate()
  const configuracao = useServicoDeConfiguracaoInicial()

  const [email, definirEmail] = useState('')
  const [senha, definirSenha] = useState('')
  const [erroDeEmail, definirErroDeEmail] = useState<string>()
  const [erroDeSenha, definirErroDeSenha] = useState<string>()
  const [falha, definirFalha] = useState<MotivoDeFalhaDeEntrada>()
  const [enviando, definirEnviando] = useState(false)

  // Instalação sem dono não tem a quem pedir convite, então o formulário de
  // entrada não leva a lugar nenhum: o modal de fundação abre por cima. Na
  // dúvida, e enquanto a resposta não chega, a tela é a de entrada.
  const fundacao = useQuery({
    queryKey: CHAVE_DA_FUNDACAO,
    queryFn: () => servico.instalacaoSemDono(),
  })

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    const emailInformado = email.trim()
    definirErroDeEmail(emailInformado ? undefined : copy.emailObrigatorio)
    definirErroDeSenha(senha ? undefined : copy.senhaObrigatoria)
    definirFalha(undefined)
    if (!emailInformado || !senha) return

    definirEnviando(true)
    const resultado = await servico.entrar({ email: emailInformado, senha })
    definirEnviando(false)

    if (!resultado.ok) {
      definirFalha(resultado.motivo)
      return
    }

    // Quem ainda não terminou a configuração volta para o tutorial, aberto e
    // no passo em que parou, mesmo que o tenha fechado da última vez.
    const carga = await configuracao.carregar().catch(() => null)
    const reabrir = reabrirNaEntrada(carga)
    if (reabrir) await configuracao.salvar(reabrir).catch(() => null)
    await navegar({ href: destinoDepoisDaEntrada(carga, destino) })
  }

  return (
    <>
      {/* Fora da `AreaDeAcesso` porque é sobreposição em `fixed`: a posição na
          árvore não muda onde ele aparece. */}
      {fundacao.data === true ? (
        <ModalDeFundacao
          aoFundar={() => {
            // Quem acabou de criar a instalação vai para o tutorial, e não
            // para o `destino`: numa instalação sem dono, ele só pode ter
            // vindo de uma sessão antiga, de um usuário que já não existe.
            void navegar({ href: CAMINHO_DEPOIS_DA_FUNDACAO })
          }}
        />
      ) : null}

      <AreaDeAcesso>
        <h1 className="titulo-de-tela m-0">{copy.titulo}</h1>

        {destino ? (
          <p role="status" className="mt-2.5 mb-0 text-texto-apoio">
            {copy.sessaoExpirada}
          </p>
        ) : null}

        <form onSubmit={enviar} noValidate className="mt-6 flex flex-col gap-4">
          <CampoDeTexto
            rotulo={copy.email.rotulo}
            exemplo={copy.email.exemplo}
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            erro={erroDeEmail}
            onChange={(evento) => definirEmail(evento.target.value)}
          />

          <CampoDeTexto
            rotulo={copy.senha.rotulo}
            type="password"
            name="senha"
            autoComplete="current-password"
            value={senha}
            erro={erroDeSenha}
            onChange={(evento) => definirSenha(evento.target.value)}
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
            {enviando ? copy.acaoEmCurso : copy.acao}
          </button>

          <Link to="/recuperar-senha" className="botao-link self-start">
            {copy.esqueciASenha}
          </Link>

          <TrocarDeProjetoNaEntrada />
        </form>
      </AreaDeAcesso>
    </>
  )
}
