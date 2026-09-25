import { useEffect, useRef, useState, type FormEvent } from 'react'

import { useAutenticacao } from '@/autenticacao/contexto'
import type { MotivoDeFalhaDeFundacao } from '@/autenticacao/tipos'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { LinhaDeCampos } from '@/componentes/linha-de-campos'
import { MarcaDoProduto } from '@/componentes/marca-do-produto'
import { EnderecosDoAuth } from '@/conexao/enderecos-do-auth'
import { autenticacao, TAMANHO_MINIMO_DE_SENHA } from '@/copy/autenticacao'

const copy = autenticacao.fundacao

/**
 * A primeira porta de uma instalação virgem. Aparece sobre a tela de entrada
 * quando ainda não há dono, e não tem como ser fechado de propósito: atrás
 * dele só existe um formulário de entrada que não leva a conta nenhuma, e a
 * saída honesta é fundar. Some sozinho assim que a fundação passa, porque a
 * sessão nova desvia a rota.
 *
 * Não usa `<dialog>`: `showModal` não existe em jsdom, e a verificação da
 * interface é em jsdom (docs/PRD-implementacao.md seção 9.1).
 */
export function ModalDeFundacao({ aoFundar }: { aoFundar: () => void }) {
  const { servico } = useAutenticacao()
  const primeiroCampo = useRef<HTMLInputElement>(null)

  const [nomeDaConta, definirNomeDaConta] = useState('')
  const [nomeDoDono, definirNomeDoDono] = useState('')
  const [email, definirEmail] = useState('')
  const [senha, definirSenha] = useState('')
  const [confirmacao, definirConfirmacao] = useState('')

  const [erros, definirErros] = useState<Record<string, string | undefined>>({})
  const [falha, definirFalha] = useState<MotivoDeFalhaDeFundacao>()
  const [enviando, definirEnviando] = useState(false)

  // O foco vai para o primeiro campo: quem chega aqui não tem outra coisa a
  // fazer na página, e quem navega por teclado não deveria ter que procurar.
  useEffect(() => {
    primeiroCampo.current?.focus()
  }, [])

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    const conta = nomeDaConta.trim()
    const dono = nomeDoDono.trim()
    const endereco = email.trim()

    const encontrados: Record<string, string | undefined> = {
      nomeDaConta: conta ? undefined : copy.nomeDaContaObrigatorio,
      nomeDoDono: dono ? undefined : copy.nomeDoDonoObrigatorio,
      email: endereco ? undefined : copy.emailObrigatorio,
      senha: !senha
        ? copy.senhaObrigatoria
        : senha.length < TAMANHO_MINIMO_DE_SENHA
          ? copy.senhaCurta
          : undefined,
      confirmacao:
        senha && confirmacao !== senha ? copy.senhasDiferentes : undefined,
    }

    definirErros(encontrados)
    definirFalha(undefined)
    if (Object.values(encontrados).some(Boolean)) return

    definirEnviando(true)
    const resultado = await servico.fundarInstalacao({
      nomeDaConta: conta,
      nomeDoDono: dono,
      email: endereco,
      senha,
    })
    definirEnviando(false)

    if (!resultado.ok) {
      definirFalha(resultado.motivo)
      return
    }

    aoFundar()
  }

  return (
    <div className="veu z-50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-da-fundacao"
        className="caixa-de-dialogo max-h-full w-full max-w-[560px] overflow-auto px-7 py-7 max-md:px-5 max-md:py-6"
      >
        <MarcaDoProduto centralizada />

        <h2
          id="titulo-da-fundacao"
          className="titulo-de-tela mt-6 mb-0 text-[22px]"
        >
          {copy.titulo}
        </h2>
        <p className="mt-2.5 mb-1.5 max-w-[62ch] text-texto-apoio">
          {copy.explicacao}
        </p>
        <p className="m-0 text-[12.5px] text-texto-desativado">{copy.aviso}</p>

        <form onSubmit={enviar} noValidate className="mt-6 flex flex-col gap-4">
          <CampoDeTexto
            ref={primeiroCampo}
            rotulo={copy.nomeDaConta.rotulo}
            exemplo={copy.nomeDaConta.exemplo}
            name="nomeDaConta"
            autoComplete="organization"
            value={nomeDaConta}
            erro={erros.nomeDaConta}
            onChange={(evento) => definirNomeDaConta(evento.target.value)}
          />

          <CampoDeTexto
            rotulo={copy.nomeDoDono.rotulo}
            exemplo={copy.nomeDoDono.exemplo}
            name="nomeDoDono"
            autoComplete="name"
            value={nomeDoDono}
            erro={erros.nomeDoDono}
            onChange={(evento) => definirNomeDoDono(evento.target.value)}
          />

          <CampoDeTexto
            rotulo={copy.email.rotulo}
            exemplo={copy.email.exemplo}
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            erro={erros.email}
            onChange={(evento) => definirEmail(evento.target.value)}
          />

          <LinhaDeCampos>
            <CampoDeTexto
              rotulo={copy.senha.rotulo}
              type="password"
              name="senha"
              autoComplete="new-password"
              value={senha}
              erro={erros.senha}
              onChange={(evento) => definirSenha(evento.target.value)}
            />

            <CampoDeTexto
              rotulo={copy.confirmacao.rotulo}
              type="password"
              name="confirmacao"
              autoComplete="new-password"
              value={confirmacao}
              erro={erros.confirmacao}
              onChange={(evento) => definirConfirmacao(evento.target.value)}
            />
          </LinhaDeCampos>

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
        </form>

        {/* A fundação entra sem confirmar e-mail, mas a recuperação de senha
            e os demais links do Auth precisam deste endereço liberado no
            projeto. É aqui que quem instalou está olhando. */}
        <EnderecosDoAuth />
      </div>
    </div>
  )
}
