// A resposta da assistente a uma conversa, fora do webhook.
//
// **Por que fora do webhook.** A Z-API espera o 200 em poucos segundos e
// reenvia o que não recebeu. Gravar a mensagem cabe nisso; esperar o modelo,
// as ferramentas e o envio não. `whatsapp-inbound` grava, responde 200 e
// agenda `responderConversa` com `EdgeRuntime.waitUntil`, que mantém o
// isolado vivo depois da resposta HTTP.
//
// **Rajada e ordem.** O lead manda duas ou três mensagens seguidas, e cada uma
// chega num webhook. O desenho, nesta ordem:
//
// 1. Cada webhook espera a janela de agrupamento (`JANELA_DE_AGRUPAMENTO_MS`)
//    antes de qualquer leitura: é o tempo de a rajada terminar de chegar.
// 2. Depois tenta a reivindicação (`reivindicar_resposta_do_whatsapp`), um
//    `update ... returning` com a conversa em `assistente` e `replying_at`
//    livre ou velho de dois minutos. Só um webhook da rajada a toma; os outros
//    saem com `ocupada`, sem ler nada.
// 3. Quem tomou lê o histórico inteiro e responde uma vez a todas as
//    mensagens novas. Se a última mensagem já é nossa, não há o que responder
//    (webhook repetido, execução que voltou).
// 4. Antes de enviar, relê o histórico: se chegou mensagem do lead enquanto o
//    modelo pensava, a resposta é descartada (`refeita`), porque não considera
//    a mensagem nova.
// 5. Ao soltar (`soltar_resposta_do_whatsapp`), o banco diz se chegou mensagem
//    do lead depois do corte. Chegou: a mesma execução responde de novo, porque
//    o webhook dela pode ter saído com `ocupada` enquanto a conversa estava
//    tomada. O número de rodadas tem teto (`RODADAS_POR_EXECUCAO`).
//
// **Quem não responde, e o que acontece.** Conversa com gente, canal
// desligado, número fora da lista no modo de teste, número bloqueado e
// WhatsApp sem credencial calam. Sem modelo
// conectado e falha da assistente calam e abrem item na fila de exceções
// (`pedido_humano`), para alguém do time responder à mão. Áudio e imagem são
// lidos pelo modelo da conta antes (`midia.ts`), e a resposta espera a leitura
// (`midia_pendente`); o que não foi lido recebe a fala que pede para repetir ou
// escrever, sem modelo. Vídeo, documento e figurinha recebem o pedido de texto.
//
// Módulo portável: sem Deno, sem rede. Tudo entra pela porta.

import type { PlaybookPublicado, PoliticaDaConta } from '../agente/compilador.ts'
import type { Proposito } from '../playbook/camada-um.ts'
import type { LinhaDeCriterio } from '../qualificacao/avaliacao.ts'
import { FALAS_DO_WHATSAPP } from '../speech/whatsapp.ts'

import {
  conversar,
  MENSAGENS_DO_HISTORICO,
  type IdentidadeDoCanal,
  type LeadDoCanal,
  type MensagemDoHistorico,
  type PortaDoMotor,
  type ResultadoDaConversa,
} from './conversa.ts'
import type { CredenciaisDaZapi, EnvioDaZapi } from './zapi.ts'

/** Quanto cada webhook espera a rajada terminar antes de tentar responder. */
export const JANELA_DE_AGRUPAMENTO_MS = 5_000

/** Quantas vezes uma execução responde, se mensagens seguirem chegando. */
export const RODADAS_POR_EXECUCAO = 3

/** Uma oferta de horário gravada na conversa (`whatsapp_conversations.slot_offers`). */
export interface OfertaGravada {
  readonly position: number
  readonly specialist_id: string
  readonly starts_at: string
  readonly ends_at: string
  readonly expires_at: string
}

/** Quanto tempo uma oferta feita por mensagem continua valendo. */
export const VALIDADE_DA_OFERTA_MS = 2 * 60 * 60 * 1000

export interface ConversaGravada {
  readonly id: string
  readonly account_id: string
  readonly lead_id: string | null
  readonly phone_e164: string
  readonly status: 'assistente' | 'humano' | 'encerrada'
  readonly purpose: Proposito
  readonly slot_offers: readonly OfertaGravada[]
}

/**
 * A assistente como a publicação a pôs no ar (o retrato de
 * `agent_publications`), mais a política e os critérios lidos na hora. Nula na
 * porta: a conta não publicou, e o canal cala e abre o item na fila.
 */
export interface AgenteDaConta {
  readonly identidade: IdentidadeDoCanal
  /** A versão do playbook do propósito que foi ao ar. Nula: nada a seguir. */
  readonly playbook: PlaybookPublicado | null
  /** `agents.whatsapp_first_message` publicada. Nula: a abertura padrão. */
  readonly aberturaDoWhatsapp?: string | null
  readonly politica: PoliticaDaConta
  readonly criterios: readonly LinhaDeCriterio[]
}

export interface LeadDaConversa extends LeadDoCanal {
  /** `leads.timezone`. */
  readonly fuso: string | null
}

export type MotivoDoItem = 'modelo_nao_conectado' | 'falha_da_assistente' | 'assistente_nao_publicada'

export interface ItemDaConversaNaFila {
  readonly contaId: string
  readonly conversaId: string
  readonly leadId: string | null
  readonly motivo: MotivoDoItem | 'pedido_do_lead'
  readonly recorte: string | null
}

export interface SaidaParaGravar {
  readonly contaId: string
  readonly conversaId: string
  readonly autor: 'assistente' | 'humano' | 'sistema'
  readonly autorId: string | null
  readonly texto: string
  readonly envio: EnvioDaZapi
}

/** O que a resposta lê e escreve. A mesma porta serve à abertura de `whatsapp-send`. */
export interface PortaDaGeracao {
  agente(contaId: string, proposito: Proposito): Promise<AgenteDaConta | null>
  lead(contaId: string, leadId: string): Promise<LeadDaConversa | null>
  fusoDaConta(contaId: string): Promise<string>
  historico(contaId: string, conversaId: string, limite: number): Promise<readonly MensagemDoHistorico[]>
  /** O modelo da conta e as ferramentas desta conversa. */
  motor(conversa: ConversaGravada): Promise<PortaDoMotor>
}

export interface PortaDaResposta extends PortaDaGeracao {
  reivindicar(contaId: string, conversaId: string): Promise<string | null>
  /** Solta e diz se chegou mensagem do lead depois do corte. */
  soltar(contaId: string, conversaId: string, corte: string): Promise<boolean>
  lerConversa(contaId: string, conversaId: string): Promise<ConversaGravada | null>
  canalLigado(contaId: string): Promise<boolean>
  /**
   * O modo do canal deixa a assistente conversar com este número: `todos`, ou
   * `teste` com o número na lista de teste da conta (`_shared/whatsapp/modo.ts`).
   */
  atendeONumero(contaId: string, telefone: string): Promise<boolean>
  numeroBloqueado(contaId: string, telefone: string): Promise<boolean>
  credenciais(contaId: string): Promise<CredenciaisDaZapi | null>
  enviar(credenciais: CredenciaisDaZapi, telefone: string, texto: string): Promise<EnvioDaZapi>
  /** Grava a mensagem que saiu e devolve o id dela. */
  registrarSaida(saida: SaidaParaGravar): Promise<string | null>
  abrirItemNaFila(item: ItemDaConversaNaFila): Promise<void>
}

export type DesfechoDaRodada =
  | 'ocupada'
  | 'conversa_sumiu'
  | 'com_humano'
  | 'encerrada'
  | 'canal_desligado'
  | 'fora_do_modo_de_teste'
  | 'nada_a_responder'
  | 'midia_pendente'
  | 'numero_bloqueado'
  | 'whatsapp_nao_configurado'
  | 'refeita'
  | MotivoDoItem
  | 'respondida'
  | 'envio_falhou'

export interface OpcoesDaResposta {
  readonly esperar?: (ms: number) => Promise<void>
  readonly janelaMs?: number
  readonly agora?: () => number
}

function esperarPadrao(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms))
}

/** As ofertas que ainda valem, pelo início, para o crivo da resposta. */
export function ofertasVigentes(ofertas: readonly OfertaGravada[], agoraMs: number): string[] {
  return ofertas.filter((oferta) => Date.parse(oferta.expires_at) > agoraMs).map((oferta) => oferta.starts_at)
}

export type ResultadoDaGeracao =
  | { readonly tipo: 'sem_agente' }
  | ResultadoDaConversa

/**
 * Monta o contexto da conversa e pede a mensagem ao motor. É a metade que a
 * abertura (`whatsapp-send`, ação `iniciar`) e a resposta compartilham.
 */
export async function gerarMensagem(
  conversa: ConversaGravada,
  porta: PortaDaGeracao,
  opcoes: { readonly abertura?: boolean; readonly agora?: () => number } = {},
): Promise<ResultadoDaGeracao> {
  const agoraMs = (opcoes.agora ?? Date.now)()
  const agente = await porta.agente(conversa.account_id, conversa.purpose)
  if (agente === null || agente.playbook === null) return { tipo: 'sem_agente' }

  const lead = conversa.lead_id === null ? null : await porta.lead(conversa.account_id, conversa.lead_id)
  const fuso = lead?.fuso?.trim() || (await porta.fusoDaConta(conversa.account_id))
  const historico = opcoes.abertura ? [] : await porta.historico(conversa.account_id, conversa.id, MENSAGENS_DO_HISTORICO)

  return await conversar(
    {
      proposito: conversa.purpose,
      identidade: agente.identidade,
      playbook: agente.playbook,
      politica: agente.politica,
      criteriosDaConta: agente.criterios,
      lead,
      historico,
      ofertas: ofertasVigentes(conversa.slot_offers, agoraMs),
      fusoDoLead: fuso,
      abertura: opcoes.abertura === true,
      agora: new Date(agoraMs).toISOString(),
    },
    await porta.motor(conversa),
  )
}

/** As mensagens do lead desde a última nossa. */
function novasDoLead(historico: readonly MensagemDoHistorico[]): MensagemDoHistorico[] {
  const novas: MensagemDoHistorico[] = []
  for (let indice = historico.length - 1; indice >= 0; indice -= 1) {
    const mensagem = historico[indice]!
    if (mensagem.direcao === 'out') break
    novas.unshift(mensagem)
  }
  return novas
}

async function umaRodada(
  contaId: string,
  conversaId: string,
  porta: PortaDaResposta,
  agora: () => number,
): Promise<DesfechoDaRodada> {
  const conversa = await porta.lerConversa(contaId, conversaId)
  if (conversa === null) return 'conversa_sumiu'
  if (conversa.status === 'humano') return 'com_humano'
  if (conversa.status === 'encerrada') return 'encerrada'
  if (!(await porta.canalLigado(contaId))) return 'canal_desligado'
  // A conta voltou ao modo de teste com a conversa aberta, ou alguém a devolveu:
  // número fora da lista não recebe resposta dela.
  if (!(await porta.atendeONumero(contaId, conversa.phone_e164))) return 'fora_do_modo_de_teste'

  const historico = await porta.historico(contaId, conversaId, MENSAGENS_DO_HISTORICO)
  const novas = novasDoLead(historico)
  if (novas.length === 0) return 'nada_a_responder'
  if (await porta.numeroBloqueado(contaId, conversa.phone_e164)) return 'numero_bloqueado'

  const credenciais = await porta.credenciais(contaId)
  if (credenciais === null) return 'whatsapp_nao_configurado'

  const enviarEGravar = async (texto: string): Promise<DesfechoDaRodada> => {
    const envio = await porta.enviar(credenciais, conversa.phone_e164, texto)
    await porta.registrarSaida({ contaId, conversaId, autor: 'assistente', autorId: null, texto, envio })
    return envio.ok ? 'respondida' : 'envio_falhou'
  }

  // O áudio ou a imagem ainda está com o modelo: quem lê responde quando
  // terminar (`whatsapp-inbound`), e responder agora ignoraria o que ela disse.
  if (novas.some((mensagem) => mensagem.estadoDaLeitura === 'pendente')) return 'midia_pendente'

  // Só mídia sem leitura, sem nenhuma palavra: a assistente não leu nada, e
  // diz isso sem inventar. Áudio e imagem que falharam pedem para repetir.
  const semPalavra = (mensagem: MensagemDoHistorico) =>
    mensagem.midia !== null && mensagem.texto.trim() === '' && !(mensagem.estadoDaLeitura === 'lida' && mensagem.leitura?.trim())
  if (novas.every(semPalavra)) {
    const falhou = (midia: string) => novas.some((mensagem) => mensagem.midia === midia && mensagem.estadoDaLeitura === 'falhou')
    const fala = falhou('audio')
      ? FALAS_DO_WHATSAPP.audioNaoOuvido
      : falhou('imagem')
        ? FALAS_DO_WHATSAPP.imagemNaoVista
        : FALAS_DO_WHATSAPP.pedirTexto
    return await enviarEGravar(fala)
  }

  const ultima = novas.at(-1)!
  const item = (motivo: MotivoDoItem) =>
    porta.abrirItemNaFila({ contaId, conversaId, leadId: conversa.lead_id, motivo, recorte: ultima.texto.slice(0, 280) || null })

  const resultado = await gerarMensagem(conversa, porta, { agora })
  switch (resultado.tipo) {
    case 'sem_agente':
      await item('assistente_nao_publicada')
      return 'assistente_nao_publicada'
    case 'sem_modelo':
      await item('modelo_nao_conectado')
      return 'modelo_nao_conectado'
    case 'falha':
      await item('falha_da_assistente')
      return 'falha_da_assistente'
    case 'resposta': {
      // Chegou mensagem enquanto o modelo pensava: a resposta não considera
      // ela, e sair assim responderia pela metade. Descarta e deixa a rodada
      // seguinte, que o `soltar` já vai pedir, responder a tudo de uma vez.
      const depois = await porta.historico(contaId, conversaId, MENSAGENS_DO_HISTORICO)
      if (novasDoLead(depois).length !== novas.length) return 'refeita'
      return await enviarEGravar(resultado.texto)
    }
  }
}

/**
 * Responde à conversa, depois da janela de agrupamento, se esta execução
 * tomar a reivindicação. Devolve o desfecho de cada rodada, na ordem.
 */
export async function responderConversa(
  pedido: { readonly contaId: string; readonly conversaId: string },
  porta: PortaDaResposta,
  opcoes: OpcoesDaResposta = {},
): Promise<DesfechoDaRodada[]> {
  const agora = opcoes.agora ?? Date.now
  await (opcoes.esperar ?? esperarPadrao)(opcoes.janelaMs ?? JANELA_DE_AGRUPAMENTO_MS)

  const desfechos: DesfechoDaRodada[] = []
  for (let rodada = 0; rodada < RODADAS_POR_EXECUCAO; rodada += 1) {
    const corte = await porta.reivindicar(pedido.contaId, pedido.conversaId)
    if (corte === null) {
      desfechos.push('ocupada')
      break
    }
    try {
      desfechos.push(await umaRodada(pedido.contaId, pedido.conversaId, porta, agora))
    } catch (erro) {
      await porta.soltar(pedido.contaId, pedido.conversaId, corte)
      throw erro
    }
    if (!(await porta.soltar(pedido.contaId, pedido.conversaId, corte))) break
  }
  return desfechos
}
