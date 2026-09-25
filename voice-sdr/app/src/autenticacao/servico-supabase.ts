import {
  createClient,
  type AuthError,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js'

import {
  classificarFalhaDeEntrada,
  classificarFalhaDeFundacao,
  classificarFalhaDeRecuperacao,
  precisaConferirOEmail,
} from '@/autenticacao/falhas'
import type { Sessao, ServicoDeAutenticacao } from '@/autenticacao/tipos'
import type { ConfiguracaoDoProjeto } from '@/conexao/configuracao-do-projeto'

/** Rota que recebe quem clica no link do e-mail de recuperação. */
export const CAMINHO_DE_RECUPERACAO = '/recuperar-senha'

/**
 * O cliente do projeto desta cópia. Quem decide o projeto é
 * `conexao/configuracao-do-projeto.ts`: o link do instalador, o que foi
 * gravado no navegador ou as variáveis do build.
 */
export function criarClienteSupabase(
  configuracao: ConfiguracaoDoProjeto,
): SupabaseClient {
  return createClient(configuracao.url, configuracao.chave)
}

function paraSessao(sessao: Session | null): Sessao | null {
  const usuario = sessao?.user
  if (!usuario) return null

  return { usuarioId: usuario.id, email: usuario.email ?? '' }
}

function codigoDe(erro: AuthError | null): string | undefined {
  return erro?.code
}

export function criarServicoDeAutenticacao(
  cliente: SupabaseClient,
): ServicoDeAutenticacao {
  let sessao: Sessao | null = null
  const ouvintes = new Set<(sessao: Sessao | null) => void>()

  function anunciar(nova: Sessao | null) {
    sessao = nova
    for (const ouvinte of ouvintes) ouvinte(nova)
  }

  /**
   * Conferência de e-mail pelo RPC. Devolve `undefined` quando não respondeu:
   * quem classifica decide o que fazer com a dúvida.
   */
  async function emailRegistrado(email: string): Promise<boolean | undefined> {
    try {
      const { data, error } = await cliente.rpc('email_registrado', {
        p_email: email,
      })
      if (error) return undefined
      return data === true
    } catch {
      return undefined
    }
  }

  return {
    async iniciar() {
      const { data } = await cliente.auth.getSession()
      sessao = paraSessao(data.session)

      cliente.auth.onAuthStateChange((_evento, nova) => {
        anunciar(paraSessao(nova))
      })
    },

    sessaoAtual() {
      return sessao
    },

    async instalacaoSemDono() {
      // Pergunta sem sessão, antes de desenhar a tela. Servidor mudo devolve
      // falso: na dúvida a tela mostra o formulário de entrada, que é o caso
      // comum e não abre porta nenhuma.
      try {
        const { data, error } = await cliente.rpc('instalacao_sem_dono')
        if (error) return false
        return data === true
      } catch {
        return false
      }
    },

    async fundarInstalacao({ nomeDaConta, nomeDoDono, email, senha }) {
      const { data, error } = await cliente.auth.signUp({
        email,
        password: senha,
        options: { data: { display_name: nomeDoDono } },
      })

      if (error) {
        return { ok: false, motivo: classificarFalhaDeFundacao(codigoDe(error)) }
      }

      // Sem sessão depois do cadastro é projeto que exige confirmação de
      // e-mail, que é o padrão de um projeto novo do Supabase. Enquanto a
      // instalação não tem dono, o banco marca o e-mail como confirmado no
      // cadastro (migração 20261005110000), então entrar com a mesma senha
      // devolve a sessão. Se nem assim houver sessão, o RPC seguinte cairia em
      // `auth.uid()` nulo, e a recusa aqui é mais honesta.
      let sessaoNova = data.session
      if (!sessaoNova) {
        const entrada = await cliente.auth.signInWithPassword({ email, password: senha })
        sessaoNova = entrada.error ? null : entrada.data.session
      }
      if (!sessaoNova) {
        return { ok: false, motivo: 'falha-de-comunicacao' }
      }

      anunciar(paraSessao(sessaoNova))

      const { error: erroDaFundacao } = await cliente.rpc('fundar_instalacao', {
        p_nome_da_conta: nomeDaConta,
      })

      if (erroDaFundacao) {
        // A sessão criada continua válida, mas não leva a conta nenhuma. Sair
        // devolve a tela ao estado anterior em vez de deixar quem tentou
        // preso numa sessão órfã.
        await cliente.auth.signOut()
        anunciar(null)

        return {
          ok: false,
          motivo: classificarFalhaDeFundacao(erroDaFundacao.code),
        }
      }

      return { ok: true }
    },

    temSessao() {
      return sessao !== null
    },

    observarSessao(ouvinte) {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },

    async entrar({ email, senha }) {
      const { data, error } = await cliente.auth.signInWithPassword({
        email,
        password: senha,
      })

      if (!error) {
        anunciar(paraSessao(data.session))
        return { ok: true }
      }

      const codigo = codigoDe(error)
      const conferencia = precisaConferirOEmail(codigo)
        ? await emailRegistrado(email)
        : undefined

      return { ok: false, motivo: classificarFalhaDeEntrada(codigo, conferencia) }
    },

    async pedirRecuperacao(email) {
      const { error } = await cliente.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${CAMINHO_DE_RECUPERACAO}`,
      })

      if (error) {
        return { ok: false, motivo: classificarFalhaDeRecuperacao(codigoDe(error)) }
      }

      return { ok: true }
    },

    async definirNovaSenha(senha) {
      const { data, error } = await cliente.auth.updateUser({ password: senha })

      if (error) {
        return { ok: false, motivo: classificarFalhaDeRecuperacao(codigoDe(error)) }
      }

      if (data.user) {
        anunciar({ usuarioId: data.user.id, email: data.user.email ?? '' })
      }

      return { ok: true }
    },

    async sair() {
      await cliente.auth.signOut()
      anunciar(null)
    },
  }
}
