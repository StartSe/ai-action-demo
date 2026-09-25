// call-audio: a gravação da chamada por URL assinada de validade curta (RF-411,
// RF-807).
//
// O áudio mora no balde `recordings`, que não é público, e o navegador nunca
// recebe credencial nenhuma: recebe um endereço temporário que o Storage assina
// e que para de abrir sozinho. O que esta função resolveu:
//
// **CINCO MINUTOS, E A RAZÃO É O LINK QUE VAZA.** Um endereço assinado é uma
// credencial ao portador enquanto vale: quem o tiver ouve a ligação, com ou sem
// conta. Ele sai da tela copiado numa mensagem, no histórico do navegador, num
// relatório de erro. Cinco minutos cobrem abrir a ficha e dar o play — o
// reprodutor pede um endereço novo quando precisa de outro — e fazem o link
// copiado morrer antes de chegar longe. Uma hora seria conforto para ninguém e
// uma janela de uma hora para quem o recebeu por engano. E a validade nunca
// passa do expurgo: a gravação que expira em dois minutos recebe dois minutos.
//
// **A CONTA SAI DO DADO, NÃO DO PEDIDO.** O corpo traz só a chamada. A conta é a
// da linha de `calls`, lida com a chave de serviço, e é contra ela que se
// confere o vínculo de quem pediu. Receber a conta no corpo e conferir o
// vínculo com ela deixaria o membro da conta A pedir a chamada da conta B
// dizendo "conta A". Não ser membro responde o mesmo 404 da chamada que não
// existe: a diferença contaria a quem sonda que o identificador existe.
//
// **EXPURGADA É 410, COM A FRASE, E NÃO UM REPRODUTOR QUEBRADO.** A rotina de
// expurgo apaga o arquivo e zera `recording_path`; `recording_expires_at`
// continua na linha, e é por ele que se sabe que houve gravação. Vencido o
// prazo, a resposta é 410 mesmo que o arquivo ainda não tenha sido apagado: a
// retenção é promessa à pessoa gravada, e não depende de a rotina já ter
// passado.
//
// **DIVERGÊNCIA DECLARADA do critério de aceite**, que trata todo
// `recording_path` nulo como expurgo: caminho nulo **sem** data de expurgo não é
// gravação expurgada, é gravação que nunca houve — a conta a desligou (L-18) ou
// a chamada ainda não foi finalizada. Dizer "expurgada pelo prazo de 90 dias"
// para uma conta que desligou a gravação seria afirmar que se guardou o que ela
// pediu para não guardar. Esse caso é 404 com frase própria.
//
// **O VALOR NUNCA SAI** (seção 8, pela conferência de US-013). O que esta
// função resolve de sensível é da instalação — a chave de serviço com que o
// adaptador fala com o Storage —, e ela é procurada no corpo serializado antes
// de responder. Achar derruba o pedido inteiro como `falha_interna`. O token
// dentro da URL assinada é o que se entrega de propósito, e não é credencial da
// instalação: vale para um arquivo, por cinco minutos.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados e o Storage
// entram por `PortaDoAudio`, implementada em `index.ts`.

import { conferirQueNaoVazou } from '../_shared/provedor/vazamento.ts'

import { MENSAGENS, mensagemDoExpurgo, STATUS, type MotivoDoAudio } from './respostas.ts'

/** A validade da URL assinada: cinco minutos. A razão está no cabeçalho. */
export const VALIDADE_DA_URL_EM_SEGUNDOS = 5 * 60

/** O prazo de retenção quando a conta não tem linha de configuração (a migração). */
export const RETENCAO_PADRAO_EM_DIAS = 90

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PREFIXO_BEARER = /^bearer\s+(.+)$/i

/** A chamada, no que o áudio precisa dela. */
export interface GravacaoDaChamada {
  readonly id: string
  readonly account_id: string
  readonly recording_path: string | null
  readonly recording_expires_at: string | null
}

export interface UsuarioDaSessao {
  readonly id: string
}

export interface PortaDoAudio {
  usuarioDaSessao(jwt: string): Promise<UsuarioDaSessao | null>
  /** Lida com a chave de serviço, sem filtro de conta: a conta sai daqui. */
  gravacaoDaChamada(chamadaId: string): Promise<GravacaoDaChamada | null>
  /** O papel em `account_members`; nulo é não ser membro. */
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  /** `account_settings.retention_days`, para a frase do expurgo. */
  retencaoDaConta(contaId: string): Promise<number>
  /** A URL assinada pelo Storage. Levanta quando o Storage recusou. */
  assinarGravacao(caminho: string, validadeEmSegundos: number): Promise<string>
}

export interface PedidoDaBorda {
  readonly metodo: string
  readonly chamadaId: unknown
  readonly autorizacao: string | null
}

export interface OpcoesDoAudio {
  /** O relógio do pedido, em ISO-8601. */
  readonly agora: string
  /** O que a instalação resolveu e nunca pode sair no corpo (a chave de serviço). */
  readonly segredosDaInstalacao: readonly string[]
}

export interface CorpoDoAudio {
  readonly ok: true
  readonly chamadaId: string
  readonly url: string
  readonly validadeEmSegundos: number
  readonly expiraEm: string
}

export interface RecusaDoAudio {
  readonly ok: false
  readonly motivo: MotivoDoAudio
  readonly mensagem: string
}

export interface RespostaDoAudio {
  readonly status: number
  readonly corpo: CorpoDoAudio | RecusaDoAudio
}

/** Nunca levanta: exceção da porta vira `falha_interna`. */
export async function atenderAudio(
  pedido: PedidoDaBorda,
  porta: PortaDoAudio,
  opcoes: OpcoesDoAudio,
): Promise<RespostaDoAudio> {
  let resposta: RespostaDoAudio
  try {
    resposta = await conduzir(pedido, porta, opcoes)
  } catch {
    resposta = recusa('falha_interna')
  }

  try {
    conferirQueNaoVazou(resposta.corpo, opcoes.segredosDaInstalacao, 'credencial no corpo de call-audio')
  } catch {
    return recusa('falha_interna')
  }
  return resposta
}

async function conduzir(
  pedido: PedidoDaBorda,
  porta: PortaDoAudio,
  opcoes: OpcoesDoAudio,
): Promise<RespostaDoAudio> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  const jwt = extrairJwt(pedido.autorizacao)
  if (!jwt) return recusa('sem_sessao')

  const chamadaId = typeof pedido.chamadaId === 'string' ? pedido.chamadaId.trim() : ''
  if (!UUID.test(chamadaId)) return recusa('chamada_invalida')

  const usuario = await porta.usuarioDaSessao(jwt)
  if (!usuario) return recusa('sessao_invalida')

  const chamada = await porta.gravacaoDaChamada(chamadaId)
  if (!chamada) return recusa('chamada_desconhecida')

  // O vínculo contra a conta da linha, nunca contra uma conta do pedido.
  const papel = await porta.papelNaConta(chamada.account_id, usuario.id)
  if (!papel) return recusa('chamada_desconhecida')

  const agoraMs = Date.parse(opcoes.agora)
  const expiraMs = chamada.recording_expires_at === null ? null : Date.parse(chamada.recording_expires_at)
  const caminho = chamada.recording_path?.trim() ?? ''

  if (expiraMs === null && caminho === '') return recusa('sem_gravacao')
  if (caminho === '' || (expiraMs !== null && expiraMs <= agoraMs)) {
    const retencao = await porta.retencaoDaConta(chamada.account_id)
    return {
      status: STATUS.gravacao_expurgada,
      corpo: { ok: false, motivo: 'gravacao_expurgada', mensagem: mensagemDoExpurgo(retencao) },
    }
  }

  const restanteEmSegundos = expiraMs === null ? Infinity : Math.ceil((expiraMs - agoraMs) / 1000)
  const validade = Math.min(VALIDADE_DA_URL_EM_SEGUNDOS, restanteEmSegundos)

  let url: string
  try {
    url = await porta.assinarGravacao(caminho, validade)
  } catch {
    return recusa('armazenamento_indisponivel')
  }

  return {
    status: 200,
    corpo: {
      ok: true,
      chamadaId: chamada.id,
      url,
      validadeEmSegundos: validade,
      expiraEm: new Date(agoraMs + validade * 1000).toISOString(),
    },
  }
}

function extrairJwt(autorizacao: string | null): string | null {
  const casado = PREFIXO_BEARER.exec(autorizacao?.trim() ?? '')
  const jwt = casado?.[1]?.trim() ?? ''
  return jwt === '' ? null : jwt
}

function recusa(motivo: Exclude<MotivoDoAudio, 'gravacao_expurgada'>): RespostaDoAudio {
  return { status: STATUS[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] } }
}
