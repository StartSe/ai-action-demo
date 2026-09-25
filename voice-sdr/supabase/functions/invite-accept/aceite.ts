// invite-accept: resolve o token do link e cria o vínculo com a conta.
//
// A função é pública, sem JWT verificado pelo gateway, porque quem clica no
// link pode chegar sem sessão e merece uma frase em português em vez do 401
// cru do gateway. A sessão, quando existe, vem no cabeçalho Authorization e é
// conferida aqui dentro.
//
// Tudo neste arquivo é portável: nenhuma referência a Deno, nenhum import de
// rede. A camada de dados entra por `PortaDeConvites`, o que deixa o
// comportamento inteiro testável sem banco e sem servidor. O adaptador sobre o
// Supabase está em `index.ts`.

import { hashDeToken } from '../_shared/token-de-convite.ts'

import { MENSAGENS, STATUS, type MotivoDoAceite } from './respostas.ts'

/** Códigos que o RPC `public.aceitar_convite` devolve na coluna `resultado`. */
export type CodigoDoBanco =
  | 'aceito'
  | 'ja_membro'
  | 'ja_aceito'
  | 'expirado'
  | 'revogado'
  | 'nao_encontrado'
  | 'email_divergente'
  | 'usuario_desconhecido'

export interface ResultadoDoBanco {
  readonly resultado: CodigoDoBanco
  readonly conta_id: string | null
  readonly conta_nome: string | null
  readonly papel: string | null
}

export interface UsuarioDaSessao {
  readonly id: string
  readonly email: string
}

/**
 * A camada de dados da função, em duas operações. O teste a dubla; `index.ts`
 * a implementa sobre o cliente do Supabase com a chave de serviço.
 */
export interface PortaDeConvites {
  /** Usuário dono deste JWT, ou null quando o token não vale mais. */
  usuarioDaSessao(jwt: string): Promise<UsuarioDaSessao | null>
  /** Chama o RPC aceitar_convite. O banco decide; aqui só se traduz. */
  aceitar(tokenHash: string, usuarioId: string): Promise<ResultadoDoBanco>
}

export interface PedidoDeAceite {
  readonly metodo: string
  /** Token em claro, como veio do link. */
  readonly token: unknown
  /** Cabeçalho Authorization, quando houver. */
  readonly autorizacao: string | null
}

export interface ContaDoAceite {
  readonly id: string
  readonly nome: string
  readonly papel: string
}

export interface CorpoDaResposta {
  readonly ok: boolean
  readonly motivo: MotivoDoAceite
  readonly mensagem: string
  readonly conta?: ContaDoAceite
}

export interface RespostaDeAceite {
  readonly status: number
  readonly corpo: CorpoDaResposta
}

const PREFIXO_BEARER = /^bearer\s+(.+)$/i

/**
 * Resolve o pedido inteiro. Devolve sempre status e corpo em português, nunca
 * levanta: uma exceção da camada de dados vira `falha_interna`, porque o
 * convidado precisa de uma frase, não de um stack trace.
 */
export async function aceitarConvite(
  pedido: PedidoDeAceite,
  porta: PortaDeConvites,
): Promise<RespostaDeAceite> {
  if (pedido.metodo.toUpperCase() !== 'POST') {
    return recusa('metodo_invalido')
  }

  const token = typeof pedido.token === 'string' ? pedido.token.trim() : ''
  if (!token) return recusa('token_ausente')

  const jwt = extrairJwt(pedido.autorizacao)
  if (!jwt) return recusa('sem_sessao')

  try {
    const usuario = await porta.usuarioDaSessao(jwt)
    if (!usuario) return recusa('sessao_invalida')

    const resultado = await porta.aceitar(await hashDeToken(token), usuario.id)
    return traduzir(resultado)
  } catch {
    return recusa('falha_interna')
  }
}

/** O JWT do cabeçalho `Authorization: Bearer <jwt>`, ou null. */
export function extrairJwt(autorizacao: string | null): string | null {
  const achado = PREFIXO_BEARER.exec(autorizacao?.trim() ?? '')
  return achado?.[1]?.trim() || null
}

function traduzir(resultado: ResultadoDoBanco): RespostaDeAceite {
  const codigo = resultado.resultado
  const entrou = codigo === 'aceito' || codigo === 'ja_membro'

  if (!entrou) return recusa(codigo)

  // O banco só devolve conta e papel quando o vínculo existe. Se vierem
  // vazios com código de sucesso, o contrato foi quebrado, e mentir para o
  // convidado seria pior do que admitir a falha.
  const { conta_id: id, conta_nome: nome, papel } = resultado
  if (!id || !nome || !papel) return recusa('falha_interna')

  return {
    status: STATUS[codigo],
    corpo: {
      ok: true,
      motivo: codigo,
      mensagem: MENSAGENS[codigo],
      conta: { id, nome, papel },
    },
  }
}

function recusa(motivo: MotivoDoAceite): RespostaDeAceite {
  return {
    status: STATUS[motivo],
    corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] },
  }
}
