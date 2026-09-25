// O pré-contato: uma mensagem de WhatsApp quando a ligação da fila sai.
//
// **Quando.** Logo depois que a guarda de discagem libera a ligação em
// `cron-dial`, e só então. Mandar antes da guarda escreveria para quem a
// guarda recusa (fora da janela, bloqueado, teto atingido): a mensagem diria
// "estou te ligando agora" e a ligação não viria. Depois da guarda a promessa
// é verdadeira, e o telefone toca segundos depois da mensagem.
//
// **Falha não impede a ligação.** A ligação é o canal principal e já saiu
// quando o pré-contato roda; mensagem que não sai é anotada como `falhou` na
// conversa e a rotina segue. O contrário (não discar porque a Z-API caiu)
// trocaria o canal que paga a operação pelo que é cortesia.
//
// **Uma vez por lead por janela.** Item da fila que volta (execução que morreu
// entre discar e marcar) não pode mandar a mensagem de novo: se já houve
// mensagem nossa para o número nas últimas `JANELA_DO_PRE_CONTATO_MS`, não sai
// outra.
//
// **Modo de teste.** Com `whatsapp_mode = 'teste'` o aviso só sai para número
// da lista de teste da conta (`modo.ts`): a ligação de teste é para esses
// números, e o aviso acompanha.
//
// **O texto.** O que a conta escreveu para o pré-contato
// (`account_settings.whatsapp_pre_contact_text`) vence. Sem ele, a abertura do
// WhatsApp que a conta escreveu (`abertura.ts`), seguida do aviso de que a
// ligação está saindo; sem as duas, a fala padrão. A identidade e a abertura
// são as publicadas (o retrato de `agent_publications`), as mesmas da voz que
// vai tocar em seguida.
//
// **A marca no lead** é o evento `whatsapp` com `acao: 'pre_contato'` na linha
// do tempo, pelo RPC de evento, como os outros.
//
// Módulo portável: sem Deno, sem rede.

import { interpolarFala } from '../agente/compilador.ts'
import { FALAS_DO_WHATSAPP } from '../speech/whatsapp.ts'

import { MARCADOR_CRU, valoresDaAbertura } from './abertura.ts'
import type { SaidaParaGravar } from './resposta.ts'
import type { CredenciaisDaZapi, EnvioDaZapi } from './zapi.ts'

/** Mensagem nossa para o número dentro desta janela dispensa o pré-contato. */
export const JANELA_DO_PRE_CONTATO_MS = 12 * 60 * 60 * 1000

export interface PortaDoPreContato {
  /** `account_settings.whatsapp_pre_contact` e o texto da conta. */
  configuracao(contaId: string): Promise<{ readonly ligado: boolean; readonly texto: string | null }>
  /** A identidade publicada (retrato da publicação), ou nula sem publicação. */
  identidade(contaId: string): Promise<IdentidadeDoPreContato | null>
  lead(contaId: string, leadId: string): Promise<LeadDoPreContato | null>
  numeroBloqueado(contaId: string, telefone: string): Promise<boolean>
  /** O modo do canal deixa escrever para este número (`modo.ts`). */
  atendeONumero(contaId: string, telefone: string): Promise<boolean>
  credenciais(contaId: string): Promise<CredenciaisDaZapi | null>
  /** Houve mensagem nossa para o número desde o instante dado? */
  mensagemNossaDesde(contaId: string, telefone: string, desde: string): Promise<boolean>
  abrirConversa(
    contaId: string,
    telefone: string,
    leadId: string,
    iniciadaPor: 'assistente',
  ): Promise<{ readonly conversaId: string; readonly criada: boolean }>
  enviar(credenciais: CredenciaisDaZapi, telefone: string, texto: string): Promise<EnvioDaZapi>
  registrarSaida(saida: SaidaParaGravar): Promise<string | null>
  /** O evento `whatsapp` com `acao: 'pre_contato'` na linha do tempo. */
  narrar(contaId: string, leadId: string, conversaId: string): Promise<void>
}

export type DesfechoDoPreContato =
  | 'desligado'
  | 'sem_lead'
  | 'numero_bloqueado'
  | 'fora_do_modo_de_teste'
  | 'whatsapp_nao_configurado'
  | 'ja_houve_mensagem'
  | 'texto_invalido'
  | 'enviado'
  | 'envio_falhou'

export interface IdentidadeDoPreContato {
  readonly nome: string
  readonly empresa: string
  /** A abertura do WhatsApp publicada. Nula: a conta não escreveu uma. */
  readonly abertura?: string | null
}

export interface LeadDoPreContato {
  readonly nome: string | null
  readonly telefone: string
  readonly empresa?: string | null
  readonly cidade?: string | null
}

/**
 * O texto que sai: o do pré-contato da conta, senão a abertura dela com o
 * aviso da ligação, senão o padrão, com os marcadores trocados.
 */
export function textoDoPreContato(
  escritoPelaConta: string | null,
  identidade: IdentidadeDoPreContato | null,
  lead: string | null | Omit<LeadDoPreContato, 'telefone'>,
): string {
  const doLead = typeof lead === 'string' || lead === null ? { nome: lead } : lead
  const semIdentidade = !identidade || identidade.nome.trim() === ''
  const abertura = identidade?.abertura?.trim()
  const modelo =
    escritoPelaConta?.trim() ||
    (abertura && !semIdentidade ? `${abertura} ${FALAS_DO_WHATSAPP.avisoDaLigacao}` : '') ||
    (semIdentidade ? FALAS_DO_WHATSAPP.preContatoSemIdentidade : FALAS_DO_WHATSAPP.preContato)
  return interpolarFala(modelo, valoresDaAbertura({ nome: identidade?.nome ?? '', empresa: identidade?.empresa ?? '' }, doLead))
}

export async function enviarPreContato(
  pedido: { readonly contaId: string; readonly leadId: string | null },
  porta: PortaDoPreContato,
  agora: () => number = Date.now,
): Promise<DesfechoDoPreContato> {
  const { contaId, leadId } = pedido
  const configuracao = await porta.configuracao(contaId)
  if (!configuracao.ligado) return 'desligado'
  if (leadId === null) return 'sem_lead'
  const lead = await porta.lead(contaId, leadId)
  if (lead === null) return 'sem_lead'
  if (await porta.numeroBloqueado(contaId, lead.telefone)) return 'numero_bloqueado'
  if (!(await porta.atendeONumero(contaId, lead.telefone))) return 'fora_do_modo_de_teste'
  const credenciais = await porta.credenciais(contaId)
  if (credenciais === null) return 'whatsapp_nao_configurado'
  const desde = new Date(agora() - JANELA_DO_PRE_CONTATO_MS).toISOString()
  if (await porta.mensagemNossaDesde(contaId, lead.telefone, desde)) return 'ja_houve_mensagem'

  const texto = textoDoPreContato(configuracao.texto, await porta.identidade(contaId), lead)
  // Marcador que a conta escreveu e ninguém sabe preencher não sai cru.
  if (texto === '' || MARCADOR_CRU.test(texto)) return 'texto_invalido'

  const { conversaId } = await porta.abrirConversa(contaId, lead.telefone, leadId, 'assistente')
  const envio = await porta.enviar(credenciais, lead.telefone, texto)
  await porta.registrarSaida({ contaId, conversaId, autor: 'assistente', autorId: null, texto, envio })
  if (!envio.ok) return 'envio_falhou'
  await porta.narrar(contaId, leadId, conversaId)
  return 'enviado'
}
