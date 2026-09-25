/** Os quatro papéis da conta, do mais alto para o mais baixo. */
export type Papel = 'owner' | 'admin' | 'operator' | 'viewer'

export interface Membro {
  usuarioId: string
  /** Nome de exibição do perfil; cai no e-mail quando ainda não há nome. */
  nome: string
  email: string
  papel: Papel
  /** ISO 8601, ou null para quem nunca acessou. */
  ultimoAcesso: string | null
}

export interface ConvitePendente {
  id: string
  email: string
  papel: Papel
  expiraEm: string
}

export interface Equipe {
  conta: { id: string; nome: string }
  /** Papel de quem está olhando a tela. É o que decide leitura ou escrita. */
  papelDoUsuario: Papel
  membros: Membro[]
  convites: ConvitePendente[]
}

/**
 * Por que a operação foi recusada. `sem-permissao` é o que a RLS devolve
 * quando quem tenta não é admin — a tela já desabilita os campos, mas a
 * política é que decide.
 */
export type MotivoDeFalhaDaEquipe =
  | 'sem-permissao'
  | 'sem-conta'
  | 'convite-repetido'
  | 'email-invalido'
  | 'falha-de-comunicacao'

export type CargaDaEquipe =
  | { ok: true; equipe: Equipe }
  | { ok: false; motivo: MotivoDeFalhaDaEquipe }

export type AcaoDaEquipe =
  | { ok: true }
  | { ok: false; motivo: MotivoDeFalhaDaEquipe }

export type ConviteCriado =
  | { ok: true; link: string }
  | { ok: false; motivo: MotivoDeFalhaDaEquipe }

/** Situação do convite lida pelo RPC `previa_do_convite`. */
export type SituacaoDoConvite =
  | 'valido'
  | 'expirado'
  | 'revogado'
  | 'ja_aceito'
  | 'nao_encontrado'

/** Todo estado em que o link não dá mais para aceitar. */
export type SituacaoRecusada = Exclude<SituacaoDoConvite, 'valido'>

export interface PreviaDoConvite {
  situacao: SituacaoDoConvite
  contaNome: string
  papel: Papel
  /** E-mail para o qual o convite foi emitido. O link só vale para ele. */
  email: string
  /** Nome de quem convidou, ou o e-mail dele quando não há nome. */
  convidadoPor: string
  expiraEm: string
}

export type LeituraDoConvite =
  | { ok: true; previa: PreviaDoConvite }
  | { ok: false; motivo: 'falha-de-comunicacao' }

/**
 * O aceite devolve a frase pronta: quem a escreve é a função de borda
 * `invite-accept`, que é quem conhece o estado do convite
 * (supabase/functions/invite-accept/respostas.ts).
 */
export interface RespostaDoAceite {
  ok: boolean
  mensagem: string
  contaNome?: string
}

/**
 * O contrato que a interface conhece. A implementação sobre o Supabase está
 * em `servico-supabase.ts`; os testes de componente passam um dublê que
 * atende a esta mesma interface, sem rede.
 */
export interface ServicoDeEquipe {
  /** Conta do usuário, membros e convites pendentes, em uma chamada. */
  carregar(): Promise<CargaDaEquipe>
  /** Cria o convite e devolve o link em claro. O banco guarda só o hash. */
  convidar(dados: { email: string; papel: Papel }): Promise<ConviteCriado>
  trocarPapel(usuarioId: string, papel: Papel): Promise<AcaoDaEquipe>
  remover(usuarioId: string): Promise<AcaoDaEquipe>
  revogarConvite(conviteId: string): Promise<AcaoDaEquipe>
  /** Quem convidou, para qual conta e com qual papel. Não exige sessão. */
  lerConvite(token: string): Promise<LeituraDoConvite>
  /** Chama a função de borda invite-accept com a sessão de quem clicou. */
  aceitarConvite(token: string): Promise<RespostaDoAceite>
}
