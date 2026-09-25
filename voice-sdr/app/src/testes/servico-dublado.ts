import type {
  DadosDaFundacao,
  ResultadoDeEntrada,
  ResultadoDeFundacao,
  ResultadoDeRecuperacao,
  Sessao,
  ServicoDeAutenticacao,
} from '@/autenticacao/tipos'

export interface RespostasDoDuble {
  sessao?: Sessao | null
  entrar?: ResultadoDeEntrada
  pedirRecuperacao?: ResultadoDeRecuperacao
  definirNovaSenha?: ResultadoDeRecuperacao
  /** O padrão é falso: instalação já fundada é o estado comum. */
  instalacaoSemDono?: boolean
  fundarInstalacao?: ResultadoDeFundacao
}

export interface ServicoDublado extends ServicoDeAutenticacao {
  /** Credenciais recebidas em cada chamada de `entrar`, na ordem. */
  readonly entradas: { email: string; senha: string }[]
  readonly emailsDeRecuperacao: string[]
  readonly senhasDefinidas: string[]
  readonly fundacoes: DadosDaFundacao[]
}

/**
 * Dublê do serviço de autenticação para os testes de componente. Atende ao
 * mesmo contrato, em memória, sem rede e sem Supabase.
 */
export function criarServicoDublado(
  respostas: RespostasDoDuble = {},
): ServicoDublado {
  let sessao: Sessao | null = respostas.sessao ?? null
  const ouvintes = new Set<(sessao: Sessao | null) => void>()
  const entradas: { email: string; senha: string }[] = []
  const emailsDeRecuperacao: string[] = []
  const senhasDefinidas: string[] = []
  const fundacoes: DadosDaFundacao[] = []

  function anunciar(nova: Sessao | null) {
    sessao = nova
    for (const ouvinte of ouvintes) ouvinte(nova)
  }

  return {
    entradas,
    emailsDeRecuperacao,
    senhasDefinidas,
    fundacoes,

    iniciar: () => Promise.resolve(),
    sessaoAtual: () => sessao,
    temSessao: () => sessao !== null,

    instalacaoSemDono: () =>
      Promise.resolve(respostas.instalacaoSemDono ?? false),

    fundarInstalacao(dados) {
      fundacoes.push(dados)
      const resultado = respostas.fundarInstalacao ?? { ok: true }
      if (resultado.ok) {
        anunciar({ usuarioId: 'u-1', email: dados.email })
      }
      return Promise.resolve(resultado)
    },

    observarSessao(ouvinte) {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },

    entrar(credenciais) {
      entradas.push(credenciais)
      const resultado = respostas.entrar ?? { ok: true }
      if (resultado.ok) {
        anunciar({ usuarioId: 'u-1', email: credenciais.email })
      }
      return Promise.resolve(resultado)
    },

    pedirRecuperacao(email) {
      emailsDeRecuperacao.push(email)
      return Promise.resolve(respostas.pedirRecuperacao ?? { ok: true })
    },

    definirNovaSenha(senha) {
      senhasDefinidas.push(senha)
      return Promise.resolve(respostas.definirNovaSenha ?? { ok: true })
    },

    sair() {
      anunciar(null)
      return Promise.resolve()
    },
  }
}
