// model-connect: a conta conecta o próprio provedor de modelo (US-246).
//
// Quatro passos, um por `acao`:
//
//   `iniciar`      inventa o PKCE, guarda o estado e devolve o endereço para
//                  onde mandar quem autoriza.
//   `concluir`     recebe o código e a marca da volta, troca por chave, grava
//                  no cofre e liga a porta da conta.
//   `desconectar`  apaga a chave e devolve a conta à porta da plataforma.
//   `catalogo`     lista os modelos do provedor, para a tela de escolha.
//
// **O VERIFIER NUNCA PASSA PELO NAVEGADOR.** A ida devolve só a URL; o segredo
// fica em `model_auth_states`. Uma tela que o guardasse no `localStorage`
// desfaria o motivo de o PKCE existir.
//
// **O ENDEREÇO DE RETORNO É FILTRADO.** Ele vem do navegador, e um endereço de
// fora levaria o código de autorização para outro site. A borda só aceita
// retorno da própria aplicação, e a lista de origens permitidas é do ambiente
// — não do pedido.
//
// **A VOLTA CONFERE A CONTA.** O estado diz de qual conta é a autorização, e a
// borda compara com a conta da sessão que está concluindo. Sem isso, quem
// abrisse a autorização numa conta poderia concluí-la em outra, e a chave de
// uma empresa iria para o cofre da outra.
//
// **A CHAVE NÃO PASSA PELA RESPOSTA.** Ela vai do provedor para o Vault por
// `set_account_secret`, e o que volta para a tela é o resumo — os últimos
// quatro caracteres. Devolver a chave para a tela a poria no histórico do
// navegador de quem a conectou.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import {
  corpoDaTroca,
  lerCatalogo,
  lerChaveDaTroca,
  lerEstadoDaVolta,
  montarUrlDeAutorizacao,
  PROVEDOR,
  resumoDaChave,
  type ModeloDoCatalogo,
} from '../_shared/modelo/openrouter.ts'
import { criarPar, METODO_DO_DESAFIO } from '../_shared/modelo/pkce.ts'
import type { EnvelopeDoProvedor } from '../_shared/provedor/resposta.ts'

import { MENSAGENS, rotuloDaChave, STATUS, type MotivoDaConexao } from './respostas.ts'

/**
 * Quem conecta: o dono, e só ele.
 *
 * Não é escolha desta função — é a do cofre. Conectar o provedor põe uma
 * credencial em `account_secrets`, e `set_account_secret` recusa quem não é
 * `owner` ("o cofre da conta é administrado pelo dono"). Aceitar `admin` aqui
 * faria a borda prometer o que o banco nega, e a pessoa veria a autorização no
 * provedor dar certo e a gravação falhar depois — com a chave já criada lá.
 *
 * Escolher **qual modelo** continua sendo de administrador
 * (`escolher_modelo_da_conta`): escolher não é guardar credencial.
 */
export const PAPEIS_QUE_CONECTAM: ReadonlySet<string> = new Set(['owner'])

export const ACOES = ['iniciar', 'concluir', 'desconectar', 'catalogo'] as const
export type AcaoDaConexao = (typeof ACOES)[number]

export interface UsuarioDaSessao {
  readonly id: string
}

export interface AutorizacaoEmVoo {
  readonly contaId: string
  readonly provedor: string
  readonly verifier: string
  readonly callbackUrl: string
}

/**
 * O que o provedor respondeu. É o envelope de `_shared/provedor/resposta.ts`
 * sem acréscimo nenhum: `corpo` já mora nele, e redeclará-lo aqui só criaria
 * uma segunda forma da mesma coisa.
 */
export type RespostaDoProvedor = EnvelopeDoProvedor

export interface PortaDaConexao {
  usuarioDaSessao(jwt: string): Promise<UsuarioDaSessao | null>
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  nomeDaConta(contaId: string): Promise<string>
  abrirAutorizacao(dados: {
    contaId: string
    provedor: string
    estado: string
    verifier: string
    callbackUrl: string
    criadaPor: string
  }): Promise<void>
  /** Toma a autorização pela marca, uma vez só. Nula quando não vale mais. */
  consumirAutorizacao(estado: string): Promise<AutorizacaoEmVoo | null>
  /** Nunca levanta: falha de rede e recusa chegam como `ok: false`. */
  trocarCodigoPorChave(corpo: Record<string, unknown>): Promise<RespostaDoProvedor>
  buscarCatalogo(): Promise<RespostaDoProvedor>
  gravarChaveNoCofre(contaId: string, chave: string, autorId: string): Promise<void>
  apagarChaveDoCofre(contaId: string): Promise<void>
  concluirConexao(contaId: string, provedor: string, resumo: Record<string, unknown>, autorId: string): Promise<void>
  desconectar(contaId: string): Promise<void>
  /** As origens que valem como retorno desta instalação. */
  origensPermitidas(): readonly string[]
}

export interface PedidoDaBorda {
  readonly metodo: string
  readonly autorizacao: string | null
  readonly contaId: unknown
  readonly acao: unknown
  readonly retorno: unknown
  readonly codigo: unknown
  readonly estado: unknown
  /** O `state` que veio na query do retorno, quando o provedor o preservou. */
  readonly estadoDaQuery: unknown
}

export type CorpoDaConexao =
  | { ok: true; passo: 'iniciada'; url: string }
  | { ok: true; passo: 'conectada'; provedor: string; resumo: Record<string, unknown> }
  | { ok: true; passo: 'desconectada' }
  | { ok: true; passo: 'catalogo'; modelos: readonly ModeloDoCatalogo[] }

export interface RecusaDaConexao {
  readonly ok: false
  readonly motivo: MotivoDaConexao
  readonly mensagem: string
}

export interface RespostaDaConexao {
  readonly status: number
  readonly corpo: CorpoDaConexao | RecusaDaConexao
}

const PREFIXO_BEARER = /^bearer\s+(.+)$/i

/** Conduz um passo da conexão. Nunca levanta: exceção da porta vira `falha_interna`. */
export async function atenderConexao(
  pedido: PedidoDaBorda,
  porta: PortaDaConexao,
): Promise<RespostaDaConexao> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  const contaId = texto(pedido.contaId)
  if (!contaId) return recusa('conta_ausente')

  const jwt = PREFIXO_BEARER.exec(pedido.autorizacao?.trim() ?? '')?.[1]?.trim()
  if (!jwt) return recusa('sem_sessao')

  const acao = lerAcao(pedido.acao)
  if (!acao) return recusa('acao_invalida')

  try {
    const usuario = await porta.usuarioDaSessao(jwt)
    if (!usuario) return recusa('sessao_invalida')

    const papel = await porta.papelNaConta(contaId, usuario.id)
    if (!papel) return recusa('sem_acesso')
    if (!PAPEIS_QUE_CONECTAM.has(papel)) return recusa('papel_insuficiente')

    if (acao === 'iniciar') return await iniciar(pedido, contaId, usuario.id, porta)
    if (acao === 'concluir') return await concluir(pedido, contaId, usuario.id, porta)
    if (acao === 'desconectar') return await desconectar(contaId, porta)
    return await catalogo(porta)
  } catch {
    return recusa('falha_interna')
  }
}

function lerAcao(valor: unknown): AcaoDaConexao | null {
  return typeof valor === 'string' && (ACOES as readonly string[]).includes(valor)
    ? (valor as AcaoDaConexao)
    : null
}

async function iniciar(
  pedido: PedidoDaBorda,
  contaId: string,
  autorId: string,
  porta: PortaDaConexao,
): Promise<RespostaDaConexao> {
  const retorno = texto(pedido.retorno)
  if (!retorno) return recusa('retorno_ausente')
  if (!retornoPermitido(retorno, porta.origensPermitidas())) return recusa('retorno_invalido')

  const par = await criarPar()
  await porta.abrirAutorizacao({
    contaId,
    provedor: PROVEDOR,
    estado: par.estado,
    verifier: par.verifier,
    callbackUrl: retorno,
    criadaPor: autorId,
  })

  const url = montarUrlDeAutorizacao({
    callbackUrl: retorno,
    desafio: par.desafio,
    metodoDoDesafio: METODO_DO_DESAFIO,
    estado: par.estado,
    rotuloDaChave: rotuloDaChave(await porta.nomeDaConta(contaId)),
  })

  return { status: 200, corpo: { ok: true, passo: 'iniciada', url } }
}

async function concluir(
  pedido: PedidoDaBorda,
  contaId: string,
  autorId: string,
  porta: PortaDaConexao,
): Promise<RespostaDaConexao> {
  const codigo = texto(pedido.codigo)
  if (!codigo) return recusa('codigo_ausente')

  const estado = lerEstadoDaVolta({ state: pedido.estado, callbackQuery: pedido.estadoDaQuery })
  if (!estado) return recusa('estado_ausente')

  const emVoo = await porta.consumirAutorizacao(estado)
  if (!emVoo) return recusa('estado_desconhecido')
  // Quem abriu a autorização numa conta não a conclui em outra: a chave de uma
  // empresa iria para o cofre da outra.
  if (emVoo.contaId !== contaId) return recusa('conta_divergente')

  const resposta = await porta.trocarCodigoPorChave(
    corpoDaTroca(codigo, emVoo.verifier, METODO_DO_DESAFIO),
  )
  if (!resposta.ok) {
    // 400 e 403 são recusa do provedor sobre este código (prazo, verifier
    // errado); o resto é o provedor indisponível, e a diferença muda o que a
    // pessoa faz em seguida.
    const status = resposta.status ?? 0
    return recusa(status >= 400 && status < 500 ? 'provedor_recusou' : 'provedor_indisponivel')
  }

  const chave = lerChaveDaTroca(resposta.corpo)
  if (!chave) return recusa('resposta_ilegivel')

  // O cofre primeiro, a porta depois: a ordem importa. Ligar a porta antes de
  // a chave existir deixaria a conta apontando para um provedor sem
  // credencial, e toda chamada ao modelo falharia até alguém reconectar.
  await porta.gravarChaveNoCofre(contaId, chave, autorId)
  const resumo = resumoDaChave(chave)
  await porta.concluirConexao(contaId, emVoo.provedor, resumo, autorId)

  return { status: 200, corpo: { ok: true, passo: 'conectada', provedor: emVoo.provedor, resumo } }
}

async function desconectar(contaId: string, porta: PortaDaConexao): Promise<RespostaDaConexao> {
  // A porta primeiro, a chave depois: é o espelho da conexão. Apagar a chave
  // antes deixaria uma janela em que a conta ainda aponta para o provedor sem
  // ter credencial.
  await porta.desconectar(contaId)
  await porta.apagarChaveDoCofre(contaId)
  return { status: 200, corpo: { ok: true, passo: 'desconectada' } }
}

async function catalogo(porta: PortaDaConexao): Promise<RespostaDaConexao> {
  const resposta = await porta.buscarCatalogo()
  if (!resposta.ok) return recusa('provedor_indisponivel')
  const modelos = lerCatalogo(resposta.corpo)
  if (modelos.length === 0) return recusa('resposta_ilegivel')
  return { status: 200, corpo: { ok: true, passo: 'catalogo', modelos } }
}

/**
 * O retorno é de uma das origens desta instalação.
 *
 * Compara a origem, e não o endereço inteiro: a tela decide o caminho e a
 * query, e travar o endereço completo obrigaria a mudar o ambiente a cada rota
 * nova. O que não pode variar é de quem é o domínio.
 */
export function retornoPermitido(retorno: string, origens: readonly string[]): boolean {
  let url: URL
  try {
    url = new URL(retorno)
  } catch {
    return false
  }
  // `http` só em endereço local: em qualquer outro lugar, o código de
  // autorização viajaria em claro.
  const localhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localhost)) return false

  return origens.some((permitida) => {
    try {
      return new URL(permitida).origin === url.origin
    } catch {
      return false
    }
  })
}

function texto(valor: unknown): string | null {
  const limpo = typeof valor === 'string' ? valor.trim() : ''
  return limpo === '' ? null : limpo
}

function recusa(motivo: MotivoDaConexao): RespostaDaConexao {
  return { status: STATUS[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] } }
}
