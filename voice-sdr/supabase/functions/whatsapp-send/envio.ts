// whatsapp-send: o que alguém do time faz numa conversa de WhatsApp.
//
// Cinco ações no mesmo endereço, separadas por `acao`:
//
// - `mensagem` (padrão): manda o texto de quem está na sessão. Se a conversa
//   estava com a assistente, ela passa para `humano` na mesma ação: gente
//   escrevendo e assistente respondendo por cima é o defeito que isso evita.
//   Sem `conversation_id`, com `lead_id`, abre conversa nova com o lead.
// - `assumir`: a conversa vai para `humano` e a assistente cala.
// - `devolver`: volta para a assistente; se o lead está esperando resposta,
//   `depois` pede a resposta dela.
// - `encerrar`: ninguém mais responde, e a próxima mensagem do lead abre outra.
// - `iniciar`: a assistente abre a conversa com o lead, com a abertura do
//   WhatsApp publicada (`agents.whatsapp_first_message`, ou a padrão de
//   `_shared/speech/whatsapp.ts`), montada por `_shared/whatsapp/abertura.ts`.
//   É texto fixo, como a primeira fala da ligação: o modelo entra a partir da
//   resposta do lead. A mensagem é montada **antes** de abrir a conversa: sem
//   assistente publicada nada é gravado, e a recusa diz para publicar. No modo
//   de teste (`_shared/whatsapp/modo.ts`) só abre com número da lista de teste.
//
// **Quem pode.** Sessão (o JWT que o gateway conferiu, lido de novo aqui para
// saber quem é) e papel `operator` ou acima na conta do pedido. Não ser membro
// e não ter o papel são o mesmo 403. A conversa se procura **dentro** da conta
// conferida: a de outra conta é o 404 da inexistente.
//
// **Toda ação de gente tem autor**: a mensagem grava `author_id` e as mudanças
// de estado passam por `mudar_estado_da_conversa_do_whatsapp` com o usuário,
// que narra na linha do tempo do lead.
//
// Módulo portável: sem Deno. A porta é do `index.ts`.

import type { PortaDaEntrada } from '../whatsapp-inbound/entrada.ts'
import type { PortasExtrasDoCanal } from '../whatsapp-inbound/portas-do-supabase.ts'
import { MARCADOR_CRU, textoDaAbertura } from '../_shared/whatsapp/abertura.ts'
import type { ConversaGravada, PortaDaResposta } from '../_shared/whatsapp/resposta.ts'

import { MENSAGENS_DO_ENVIO, STATUS_DO_ENVIO, type MotivoDoEnvio } from './respostas.ts'

export const ACOES = ['mensagem', 'assumir', 'devolver', 'encerrar', 'iniciar'] as const
export type AcaoDoEnvio = (typeof ACOES)[number]

/** Os papéis que conversam pelo WhatsApp, a mesma régua de `has_role(..., 'operator')`. */
export const PAPEIS_QUE_CONVERSAM: ReadonlySet<string> = new Set(['owner', 'admin', 'operator'])

export const TAMANHO_MAXIMO_DO_TEXTO = 4096

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface PortaDoEnvio
  extends Pick<PortaDaResposta, 'lerConversa' | 'canalLigado' | 'atendeONumero' | 'numeroBloqueado' | 'credenciais' | 'enviar' | 'registrarSaida' | 'agente' | 'lead' | 'fusoDaConta' | 'historico' | 'motor'>,
    Pick<PortaDaEntrada, 'abrirConversa'>,
    PortasExtrasDoCanal {
  usuarioDaSessao(jwt: string): Promise<{ readonly id: string } | null>
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
}

export interface PedidoDoEnvio {
  readonly metodo: string
  readonly autorizacao: string | null
  readonly corpo: unknown
}

export interface RespostaDoEnvio {
  readonly status: number
  readonly corpo: Readonly<Record<string, unknown>>
  /** A resposta da assistente, depois de `devolver`. */
  readonly depois: { readonly contaId: string; readonly conversaId: string } | null
}

function recusa(motivo: MotivoDoEnvio): RespostaDoEnvio {
  return { status: STATUS_DO_ENVIO[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS_DO_ENVIO[motivo] }, depois: null }
}

function aceita(
  acao: AcaoDoEnvio,
  conversa: { readonly id: string; readonly status: string },
  mensagem: { readonly id: string | null; readonly status: string } | null,
  depois: RespostaDoEnvio['depois'] = null,
): RespostaDoEnvio {
  return { status: 200, corpo: { ok: true, acao, conversa: { id: conversa.id, status: conversa.status }, mensagem }, depois }
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

function lerCorpo(corpo: unknown) {
  const dado = corpo !== null && typeof corpo === 'object' && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : {}
  const acaoBruta = texto(dado.acao) ?? 'mensagem'
  return {
    contaId: texto(dado.account_id),
    conversaId: texto(dado.conversation_id),
    leadId: texto(dado.lead_id),
    texto: typeof dado.text === 'string' ? dado.text.trim() : '',
    acao: (ACOES as readonly string[]).includes(acaoBruta) ? (acaoBruta as AcaoDoEnvio) : null,
  }
}

export async function atenderEnvio(pedido: PedidoDoEnvio, porta: PortaDoEnvio): Promise<RespostaDoEnvio> {
  if (pedido.metodo !== 'POST') return recusa('metodo_invalido')

  const jwt = /^Bearer\s+(.+)$/i.exec(pedido.autorizacao ?? '')?.[1]?.trim() ?? ''
  if (jwt === '') return recusa('sem_sessao')

  const corpo = lerCorpo(pedido.corpo)
  if (corpo.contaId === null || !UUID.test(corpo.contaId) || corpo.acao === null) return recusa('pedido_invalido')
  if (corpo.conversaId !== null && !UUID.test(corpo.conversaId)) return recusa('conversa_nao_encontrada')
  if (corpo.leadId !== null && !UUID.test(corpo.leadId)) return recusa('lead_nao_encontrado')
  const contaId = corpo.contaId.toLowerCase()

  try {
    const usuario = await porta.usuarioDaSessao(jwt)
    if (usuario === null) return recusa('sem_sessao')
    const papel = await porta.papelNaConta(contaId, usuario.id)
    if (papel === null || !PAPEIS_QUE_CONVERSAM.has(papel)) return recusa('sem_acesso')

    switch (corpo.acao) {
      case 'mensagem':
        return await mandarMensagem(contaId, usuario.id, corpo, porta)
      case 'iniciar':
        return await iniciar(contaId, corpo.leadId, porta)
      default:
        return await mudarEstado(contaId, usuario.id, corpo.acao, corpo.conversaId, porta)
    }
  } catch {
    return recusa('falha_interna')
  }
}

async function conversaDaConta(contaId: string, conversaId: string | null, porta: PortaDoEnvio): Promise<ConversaGravada | null> {
  return conversaId === null ? null : await porta.lerConversa(contaId, conversaId)
}

async function mandarMensagem(
  contaId: string,
  usuarioId: string,
  corpo: ReturnType<typeof lerCorpo>,
  porta: PortaDoEnvio,
): Promise<RespostaDoEnvio> {
  if (corpo.texto === '') return recusa('texto_vazio')
  if (corpo.texto.length > TAMANHO_MAXIMO_DO_TEXTO) return recusa('texto_longo')

  let conversa: ConversaGravada | null
  if (corpo.conversaId !== null) {
    conversa = await conversaDaConta(contaId, corpo.conversaId, porta)
    if (conversa === null) return recusa('conversa_nao_encontrada')
    if (conversa.status === 'encerrada') return recusa('conversa_encerrada')
  } else {
    if (corpo.leadId === null) return recusa('pedido_invalido')
    const telefone = await porta.telefoneDoLead(contaId, corpo.leadId)
    if (telefone === null) return recusa('lead_nao_encontrado')
    if (await porta.numeroBloqueado(contaId, telefone)) return recusa('numero_bloqueado')
    const credenciais = await porta.credenciais(contaId)
    if (credenciais === null) return recusa('whatsapp_nao_configurado')
    const { conversaId } = await porta.abrirConversa(contaId, telefone, corpo.leadId, 'humano')
    conversa = await porta.lerConversa(contaId, conversaId)
    if (conversa === null) return recusa('falha_interna')
  }

  if (await porta.numeroBloqueado(contaId, conversa.phone_e164)) return recusa('numero_bloqueado')
  const credenciais = await porta.credenciais(contaId)
  if (credenciais === null) return recusa('whatsapp_nao_configurado')

  // Gente escreveu: a assistente sai da conversa antes de a mensagem sair, e
  // a resposta que ela estivesse gerando é descartada pela reivindicação.
  let status: string = conversa.status
  if (status === 'assistente') {
    await porta.mudarEstado(contaId, conversa.id, ['assistente'], 'humano', 'assumida', usuarioId)
    status = 'humano'
  }

  const envio = await porta.enviar(credenciais, conversa.phone_e164, corpo.texto)
  const mensagemId = await porta.registrarSaida({
    contaId,
    conversaId: conversa.id,
    autor: 'humano',
    autorId: usuarioId,
    texto: corpo.texto,
    envio,
  })
  if (!envio.ok) return recusa('falha_no_envio')
  return aceita('mensagem', { id: conversa.id, status }, { id: mensagemId, status: 'enviada' })
}

/** De onde para onde cada ação leva, e o nome dela na linha do tempo. */
const TRANSICOES = {
  assumir: { de: ['assistente'], para: 'humano', acao: 'assumida' },
  devolver: { de: ['humano'], para: 'assistente', acao: 'devolvida' },
  encerrar: { de: ['assistente', 'humano'], para: 'encerrada', acao: 'encerrada' },
} as const

async function mudarEstado(
  contaId: string,
  usuarioId: string,
  acao: 'assumir' | 'devolver' | 'encerrar',
  conversaId: string | null,
  porta: PortaDoEnvio,
): Promise<RespostaDoEnvio> {
  const conversa = await conversaDaConta(contaId, conversaId, porta)
  if (conversa === null) return recusa('conversa_nao_encontrada')
  const transicao = TRANSICOES[acao]
  if (conversa.status === 'encerrada' && acao !== 'encerrar') return recusa('conversa_encerrada')
  if (acao === 'devolver' && !(await porta.canalLigado(contaId))) return recusa('canal_desligado')

  const resultado = await porta.mudarEstado(contaId, conversa.id, transicao.de, transicao.para, transicao.acao, usuarioId)
  if (resultado === 'nao_encontrada') return recusa('conversa_nao_encontrada')
  if (resultado === 'estado_incompativel') return recusa('conversa_encerrada')
  // `mesmo_estado` é sucesso: o pedido repetido termina onde o primeiro terminou.
  return aceita(
    acao,
    { id: conversa.id, status: transicao.para },
    null,
    acao === 'devolver' && resultado === 'mudou' ? { contaId, conversaId: conversa.id } : null,
  )
}

async function iniciar(contaId: string, leadId: string | null, porta: PortaDoEnvio): Promise<RespostaDoEnvio> {
  if (leadId === null) return recusa('pedido_invalido')
  const telefone = await porta.telefoneDoLead(contaId, leadId)
  if (telefone === null) return recusa('lead_nao_encontrado')
  if (!(await porta.canalLigado(contaId))) return recusa('canal_desligado')
  if (!(await porta.atendeONumero(contaId, telefone))) return recusa('fora_do_modo_de_teste')
  if (await porta.numeroBloqueado(contaId, telefone)) return recusa('numero_bloqueado')
  const credenciais = await porta.credenciais(contaId)
  if (credenciais === null) return recusa('whatsapp_nao_configurado')

  // A abertura sai da assistente publicada, pelo propósito da descoberta, que
  // é o de toda conversa que a assistente abre.
  const agente = await porta.agente(contaId, 'discovery')
  if (agente === null || agente.playbook === null) return recusa('assistente_nao_publicada')
  const lead = await porta.lead(contaId, leadId)
  const texto = textoDaAbertura(agente.aberturaDoWhatsapp ?? null, agente.identidade, lead)
  if (texto === '' || MARCADOR_CRU.test(texto)) return recusa('falha_da_assistente')

  const { conversaId, criada } = await porta.abrirConversa(contaId, telefone, leadId, 'assistente')
  if (!criada) return recusa('conversa_ativa')

  const envio = await porta.enviar(credenciais, telefone, texto)
  const mensagemId = await porta.registrarSaida({ contaId, conversaId, autor: 'assistente', autorId: null, texto, envio })
  if (!envio.ok) return recusa('falha_no_envio')
  return aceita('iniciar', { id: conversaId, status: 'assistente' }, { id: mensagemId, status: 'enviada' })
}
