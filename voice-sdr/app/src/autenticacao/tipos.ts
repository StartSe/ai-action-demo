/** Sessão viva, no recorte que a interface usa. */
export interface Sessao {
  usuarioId: string
  email: string
}

/**
 * Por que a entrada foi recusada. `conta-inexistente` e `senha-incorreta` são
 * o mesmo erro para o GoTrue; quem os separa é o serviço, conferindo o e-mail
 * (migração 20260921022000_conferencia_de_email.sql).
 */
export type MotivoDeFalhaDeEntrada =
  | 'conta-inexistente'
  | 'senha-incorreta'
  | 'email-nao-confirmado'
  | 'excesso-de-tentativas'
  | 'falha-de-comunicacao'

export type MotivoDeFalhaDeRecuperacao =
  | 'excesso-de-tentativas'
  | 'link-expirado'
  | 'senha-fraca'
  | 'falha-de-comunicacao'

/**
 * Por que a fundação da instalação foi recusada. `ja-fundada` é a corrida
 * perdida: alguém fundou entre a pergunta que a tela fez e o envio deste
 * formulário, e a saída é entrar ou pedir convite, não tentar de novo.
 */
export type MotivoDeFalhaDeFundacao =
  | 'ja-fundada'
  | 'email-em-uso'
  | 'senha-fraca'
  | 'excesso-de-tentativas'
  | 'falha-de-comunicacao'

export type ResultadoDeEntrada =
  | { ok: true }
  | { ok: false; motivo: MotivoDeFalhaDeEntrada }

export type ResultadoDeFundacao =
  | { ok: true }
  | { ok: false; motivo: MotivoDeFalhaDeFundacao }

/** O que a fundação precisa saber: quem é o dono e como a conta se chama. */
export interface DadosDaFundacao {
  nomeDaConta: string
  nomeDoDono: string
  email: string
  senha: string
}

export type ResultadoDeRecuperacao =
  | { ok: true }
  | { ok: false; motivo: MotivoDeFalhaDeRecuperacao }

/**
 * O contrato que a interface conhece. A implementação sobre o Supabase está em
 * `servico-supabase.ts`; os testes de componente passam um dublê que atende a
 * esta mesma interface, sem rede.
 */
export interface ServicoDeAutenticacao {
  /** Lê a sessão guardada e passa a observar as mudanças. Chame uma vez. */
  iniciar(): Promise<void>
  sessaoAtual(): Sessao | null
  /**
   * Verdadeiro enquanto nenhuma conta tem dono. A tela de entrada pergunta
   * antes de desenhar: numa instalação virgem não há a quem pedir convite, e
   * o formulário de entrada não leva a lugar nenhum.
   */
  instalacaoSemDono(): Promise<boolean>
  /**
   * Cadastra o primeiro usuário e faz dele o dono da primeira conta. Só
   * atravessa uma vez por instalação; o servidor é quem decide isso.
   */
  fundarInstalacao(dados: DadosDaFundacao): Promise<ResultadoDeFundacao>
  /** Leitura síncrona para a guarda de rota, que roda antes de renderizar. */
  temSessao(): boolean
  /** Registra o ouvinte e devolve a função que o remove. */
  observarSessao(ouvinte: (sessao: Sessao | null) => void): () => void
  entrar(credenciais: {
    email: string
    senha: string
  }): Promise<ResultadoDeEntrada>
  /** Dispara o e-mail com o link de recuperação. */
  pedirRecuperacao(email: string): Promise<ResultadoDeRecuperacao>
  /** Troca a senha do usuário da sessão de recuperação. */
  definirNovaSenha(senha: string): Promise<ResultadoDeRecuperacao>
  sair(): Promise<void>
}
