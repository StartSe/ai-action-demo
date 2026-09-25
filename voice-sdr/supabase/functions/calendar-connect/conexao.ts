// calendar-connect: o começo do OAuth do calendário do especialista (L-06, RF-507).
//
// Quem administra a conta clica em conectar na ficha do especialista, e esta
// borda devolve o endereço do Google para onde a tela manda o navegador. Nada
// além disso: nenhuma credencial passa por aqui, e nada se grava. O token nasce
// na volta, em `calendar-callback`, que troca o código de servidor para servidor
// e o põe no Vault.
//
// **O `state` é a única ponte entre as duas.** A volta é pública, então é ele
// que diz de qual conta e de qual especialista é a autorização. Vai assinado com
// a chave do servidor e vence em dez minutos (`_shared/agenda/estado-da-conexao.ts`).
//
// **Quem conecta é administrador.** Conectar a agenda decide onde a reunião
// nasce e dá a uma agenda de fora o poder de tirar horário da oferta; é a mesma
// régua da política de escrita de `specialist_calendars`.
//
// **Espera do Google não é erro.** Enquanto a verificação do aplicativo não sai
// (P-04), a instalação fica sem o par OAuth, e a resposta diz isso com a frase
// do estado normal, em vez de mandar tentar de novo.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import { MENSAGENS_DO_CALENDARIO } from '../_shared/agenda/calendario.ts'
import { montarEnderecoDeAutorizacao } from '../_shared/agenda/calendario-google.ts'
import { emitirEstadoDaConexao } from '../_shared/agenda/estado-da-conexao.ts'

/** Os papéis de `has_role(conta, 'admin')`: o dono também administra. */
export const PAPEIS_QUE_CONECTAM: ReadonlySet<string> = new Set(['owner', 'admin'])

export type MotivoDaConexao =
  | 'metodo_nao_suportado'
  | 'sem_sessao'
  | 'pedido_incompleto'
  | 'sem_permissao'
  | 'especialista_nao_encontrado'
  | 'aguardando_google'
  | 'falha_interna'

// Registro de interface: direto e declarativo (docs/padrao-de-interface.md seção 4).
export const MENSAGENS_DA_CONEXAO: Record<MotivoDaConexao, string> = {
  metodo_nao_suportado: 'Este endereço só aceita o pedido de conexão da tela do especialista.',
  sem_sessao: 'Sua sessão terminou. Entre de novo para conectar o calendário.',
  pedido_incompleto: 'O pedido não informou a conta e o especialista. Abra a ficha do especialista e conecte de novo.',
  sem_permissao: 'Só quem administra a conta conecta o calendário de um especialista.',
  especialista_nao_encontrado: 'Este especialista não foi encontrado nesta conta.',
  aguardando_google: MENSAGENS_DO_CALENDARIO.sem_permissao_de_calendario,
  falha_interna: 'Não foi possível preparar a conexão agora. Tente de novo em alguns minutos.',
}

const STATUS: Record<MotivoDaConexao, number> = {
  metodo_nao_suportado: 405,
  sem_sessao: 401,
  pedido_incompleto: 400,
  sem_permissao: 403,
  especialista_nao_encontrado: 404,
  // 200, e não 503: é o estado de toda instalação até o Google verificar o
  // aplicativo, e a tela o desenha como espera, não como falha.
  aguardando_google: 200,
  falha_interna: 500,
}

export interface PedidoDaConexao {
  readonly metodo: string
  readonly autorizacao: string | null
  readonly contaId: unknown
  readonly especialistaId: unknown
}

export interface PortaDaConexao {
  /** Quem é o dono do JWT, ou nulo quando ele não vale. */
  usuarioDaSessao(jwt: string): Promise<{ readonly id: string } | null>
  /** `account_members.role`, ou nulo para quem não é membro. */
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  /** O especialista existe e é desta conta. */
  especialistaDaConta(contaId: string, especialistaId: string): Promise<boolean>
}

export interface ConfiguracaoDaConexao {
  /** Par do aplicativo OAuth da instalação. Vazio enquanto o Google não verifica. */
  readonly clienteId: string
  /** O endereço público de `calendar-callback`, cadastrado no aplicativo. */
  readonly redirecionamento: string
  readonly chaveDoServidor: string
  readonly agora?: () => number
}

export type CorpoDaConexao =
  | { readonly ok: true; readonly estado: 'autorizar'; readonly url: string }
  | { readonly ok: false; readonly motivo: MotivoDaConexao; readonly mensagem: string }

export interface RespostaDaConexao {
  readonly status: number
  readonly corpo: CorpoDaConexao
}

function recusa(motivo: MotivoDaConexao): RespostaDaConexao {
  return { status: STATUS[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS_DA_CONEXAO[motivo] } }
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

export async function atenderConexaoDoCalendario(
  pedido: PedidoDaConexao,
  porta: PortaDaConexao,
  configuracao: ConfiguracaoDaConexao,
): Promise<RespostaDaConexao> {
  if (pedido.metodo !== 'POST') return recusa('metodo_nao_suportado')

  const jwt = /^bearer\s+(.+)$/i.exec(pedido.autorizacao?.trim() ?? '')?.[1]?.trim() ?? ''
  if (!jwt) return recusa('sem_sessao')

  try {
    const usuario = await porta.usuarioDaSessao(jwt)
    if (!usuario) return recusa('sem_sessao')

    const contaId = texto(pedido.contaId)
    const especialistaId = texto(pedido.especialistaId)
    if (!contaId || !especialistaId) return recusa('pedido_incompleto')

    const papel = await porta.papelNaConta(contaId, usuario.id)
    if (!papel || !PAPEIS_QUE_CONECTAM.has(papel)) return recusa('sem_permissao')

    if (!(await porta.especialistaDaConta(contaId, especialistaId))) return recusa('especialista_nao_encontrado')

    // Conferido depois do papel: quem não administra não precisa saber em que
    // pé está o aplicativo da instalação.
    if (!configuracao.clienteId || !configuracao.redirecionamento || !configuracao.chaveDoServidor.trim()) {
      return recusa('aguardando_google')
    }

    const agora = configuracao.agora?.() ?? Date.now()
    const estado = await emitirEstadoDaConexao(
      { contaId, especialistaId, usuarioId: usuario.id },
      configuracao.chaveDoServidor,
      agora,
    )
    const url = montarEnderecoDeAutorizacao({
      clienteId: configuracao.clienteId,
      redirecionamento: configuracao.redirecionamento,
      estado,
    })
    return { status: 200, corpo: { ok: true, estado: 'autorizar', url } }
  } catch {
    return recusa('falha_interna')
  }
}
