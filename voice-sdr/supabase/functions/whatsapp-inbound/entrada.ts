// whatsapp-inbound: o webhook da Z-API da conta, para mensagens recebidas e
// para o status das enviadas.
//
// **O endereço é a credencial.** A Z-API não assina o webhook nem deixa
// cadastrar cabeçalho (suposição Z4), então quem autentica é
// `?conta=<id>&chave=<HMAC>` (`_shared/whatsapp/endereco.ts`), conferido em
// tempo constante **antes de ler o corpo e de tocar na porta**. Tudo errado é
// o mesmo 401 (`RECUSA_DO_ENDERECO`), e o teste conta os membros da porta
// tocados na recusa: zero.
//
// **Receber e responder são duas metades.** `receberWebhook` grava e devolve o
// 200 em poucos passos de banco; a resposta da assistente, que espera modelo e
// envio, volta em `depois`, que o `index.ts` entrega ao `EdgeRuntime.waitUntil`
// para correr depois da resposta HTTP. O desenho da rajada e da reivindicação
// está em `_shared/whatsapp/resposta.ts`.
//
// **A ordem do que chega:**
//
// 1. Endereço, depois o corpo. Status de entrega atualiza as mensagens e sai.
// 2. Mensagem nossa, de grupo, sem id ou ilegível: 200 sem gravar nada.
//    **Modo de teste** (`_shared/whatsapp/modo.ts`): número fora da lista de
//    teste da conta também é 200 sem gravar nada, nem lead, nem conversa, nem
//    descadastro. A instância costuma ser um número em uso, e quem escreveu
//    para ele não é contato do produto. Vale com o canal ligado ou desligado:
//    desligado, ninguém responde, mas gravar a conversa pessoal de quem não é
//    lead seria o mesmo defeito.
// 3. **Repetida** (o `messageId` já está gravado): 200 sem gravar de novo. Se
//    ela é descadastro, o bloqueio é refeito (é idempotente pelo único parcial
//    de `dnc_entries`), porque a primeira passagem pode ter caído depois de
//    gravar a mensagem e antes de bloquear. E a resposta é agendada de novo:
//    a reivindicação e o "a última mensagem já é nossa" impedem a dobra.
// 4. Lead por `registrar_lead` com `ignorar` (fonte `whatsapp`, cidade e fuso
//    do DDD), conversa ativa por `abrir_conversa_do_whatsapp`, mensagem por
//    `registrar_mensagem_do_whatsapp`.
// 5. **Descadastro** ("parar", "sair", "não quero mais receber"...): bloqueio
//    pelo mesmo RPC de `tool-dnc` (`bloquear_numero_pela_ferramenta`, origem
//    `lead_request`), conversa encerrada, item `pedido_bloqueio` na fila quando
//    o bloqueio é novo, e a confirmação em `depois`. Vale com a conversa com
//    gente e com o canal desligado: é pedido legal.
// 6. Conversa com a assistente e canal ligado: `depois` responde. Áudio e
//    imagem são gravados com a leitura `pendente`, e `depois` os lê pelo
//    modelo da conta antes de responder (`_shared/whatsapp/midia.ts`).
//
// Falha de banco em 4 ou 5 é 503 e a Z-API reenvia; o resto é 200.
//
// Módulo portável: sem Deno. A porta é do `index.ts`.

import { resolverFusoDoTelefone } from '../_shared/ddd.ts'
import type { ChavesDoServidor } from '../_shared/tools/segredo.ts'
import { FALAS_DO_WHATSAPP } from '../_shared/speech/whatsapp.ts'
import { ePedidoDeDescadastro } from '../_shared/whatsapp/descadastro.ts'
import { eMidiaLida, type DesfechoDaLeitura, type MidiaLida } from '../_shared/whatsapp/midia.ts'
import { contaDoEnderecoDoWhatsapp } from '../_shared/whatsapp/endereco.ts'
import type { ConversaGravada, PortaDaResposta } from '../_shared/whatsapp/resposta.ts'
import {
  type AnexoRecebido,
  eStatusDeMensagem,
  lerMensagemRecebida,
  lerStatusDeMensagens,
  type EstadoDaEntrega,
  type TipoDeMidia,
} from '../_shared/whatsapp/zapi.ts'

import { MENSAGENS, RECUSA_DO_ENDERECO, STATUS } from './respostas.ts'

/** A fonte do lead que nasce por mensagem (`leads.source`). */
export const ORIGEM_DO_WHATSAPP = 'whatsapp'

/** O motivo gravado em `dnc_entries.reason` para o descadastro por mensagem. */
export const MOTIVO_DO_DESCADASTRO = 'Pediu pelo WhatsApp para não receber mais mensagens.'

export interface LeadParaRegistrar {
  readonly name: string | null
  readonly phone_e164: string
  readonly city: string | null
  readonly state: string | null
  readonly timezone: string | null
  readonly source: string
  readonly source_ref: string | null
}

export interface PortaDaEntrada
  extends Pick<PortaDaResposta, 'lerConversa' | 'canalLigado' | 'atendeONumero' | 'credenciais' | 'enviar' | 'registrarSaida'> {
  atualizarEntregas(contaId: string, idsDoProvedor: readonly string[], estado: EstadoDaEntrega): Promise<void>
  /** A conversa da mensagem já gravada com este `messageId`, ou nula. */
  mensagemExistente(contaId: string, idDoProvedor: string): Promise<{ readonly conversaId: string } | null>
  registrarLead(contaId: string, lead: LeadParaRegistrar): Promise<string>
  abrirConversa(
    contaId: string,
    telefone: string,
    leadId: string | null,
    iniciadaPor: 'lead' | 'assistente' | 'humano',
  ): Promise<{ readonly conversaId: string; readonly criada: boolean }>
  registrarEntrada(
    contaId: string,
    conversaId: string,
    mensagem: {
      readonly texto: string
      readonly midia: TipoDeMidia | null
      readonly idDoProvedor: string
      /** `pendente` quando o modelo vai ler a mídia (`media_status`). */
      readonly leitura: 'pendente' | null
    },
  ): Promise<{ readonly mensagemId: string; readonly nova: boolean }>
  /** Baixa e lê a mídia pelo modelo da conta, e grava o texto derivado (`_shared/whatsapp/midia.ts`). */
  lerMidia(
    contaId: string,
    mensagemId: string,
    midia: MidiaLida,
    anexo: AnexoRecebido | null,
  ): Promise<DesfechoDaLeitura>
  /** `bloquear_numero_pela_ferramenta`, origem `lead_request`. */
  bloquear(contaId: string, telefone: string, notas: string | null): Promise<{ readonly criado: boolean }>
  /** `mudar_estado_da_conversa_do_whatsapp` para `encerrada`, pela assistente. */
  encerrarPorDescadastro(contaId: string, conversaId: string): Promise<string>
  /** Item `pedido_bloqueio` na fila, pela chave da conversa. */
  abrirItemDeBloqueio(contaId: string, conversa: ConversaGravada, recorte: string | null): Promise<void>
}

export interface PedidoDoWebhook {
  readonly metodo: string
  /** O endereço inteiro, com a consulta: é nele que a credencial vem. */
  readonly endereco: string
  /** O corpo cru. Só é lido depois do endereço conferido. */
  readonly corpo: string
}

export interface AmbienteDaEntrada {
  readonly chaves: ChavesDoServidor
  readonly agora?: () => number
  /** Para onde vai o que não tem outra saída. Padrão `console.error`. */
  readonly log?: (evento: string, detalhe: Readonly<Record<string, unknown>>) => void
}

export interface RespostaDoWebhook {
  readonly status: number
  readonly corpo: Readonly<Record<string, unknown>>
  /** O que fica para depois da resposta HTTP: responder ou confirmar. */
  readonly depois: ((responder: (contaId: string, conversaId: string) => Promise<unknown>) => Promise<unknown>) | null
}

function aceita(corpo: Readonly<Record<string, unknown>>, depois: RespostaDoWebhook['depois'] = null): RespostaDoWebhook {
  return { status: 200, corpo: { ok: true, ...corpo }, depois }
}

function falhaInterna(): RespostaDoWebhook {
  return { status: STATUS.falha_interna, corpo: { ok: false, motivo: 'falha_interna', mensagem: MENSAGENS.falha_interna }, depois: null }
}

function logPadrao(evento: string, detalhe: Readonly<Record<string, unknown>>): void {
  console.error(`[whatsapp-inbound] ${evento}`, detalhe)
}

/** Agenda a resposta da conversa, que `responder` (o do `index.ts`) executa. */
function responderDepois(contaId: string, conversaId: string): RespostaDoWebhook['depois'] {
  return (responder) => responder(contaId, conversaId)
}

export async function receberWebhook(
  pedido: PedidoDoWebhook,
  porta: PortaDaEntrada,
  ambiente: AmbienteDaEntrada,
): Promise<RespostaDoWebhook> {
  const log = ambiente.log ?? logPadrao
  if (pedido.metodo !== 'POST') {
    return { status: STATUS.metodo_invalido, corpo: { ok: false, motivo: 'metodo_invalido', mensagem: MENSAGENS.metodo_invalido }, depois: null }
  }

  // 1. O endereço, antes do corpo e antes da porta.
  const contaId = await contaDoEnderecoDoWhatsapp(pedido.endereco, ambiente.chaves, ambiente.agora)
  if (contaId === null) return { ...RECUSA_DO_ENDERECO, depois: null }

  let corpo: unknown
  try {
    corpo = JSON.parse(pedido.corpo)
  } catch {
    return aceita({ ignorada: 'corpo_ilegivel' })
  }

  try {
    if (eStatusDeMensagem(corpo)) {
      const status = lerStatusDeMensagens(corpo)
      if (status !== null) await porta.atualizarEntregas(contaId, status.ids, status.estado)
      return aceita({ status: status?.estado ?? 'ignorado' })
    }

    // 2. O que não é conversa com lead.
    const mensagem = lerMensagemRecebida(corpo)
    if (mensagem.tipo === 'ignorar') return aceita({ ignorada: mensagem.motivo })
    if (!(await porta.atendeONumero(contaId, mensagem.telefone))) return aceita({ ignorada: 'fora_do_modo_de_teste' })
    const descadastro = mensagem.midia === null && ePedidoDeDescadastro(mensagem.texto)

    // 3. A repetida.
    const existente = await porta.mensagemExistente(contaId, mensagem.idDoProvedor)
    if (existente !== null) {
      if (descadastro) {
        await porta.bloquear(contaId, mensagem.telefone, mensagem.texto)
        return aceita({ duplicada: true, descadastro: true })
      }
      return aceita(
        { duplicada: true },
        (await porta.canalLigado(contaId)) ? responderDepois(contaId, existente.conversaId) : null,
      )
    }

    // 4. Lead, conversa e mensagem.
    const local = resolverFusoDoTelefone(mensagem.telefone)
    const leadId = await porta.registrarLead(contaId, {
      name: mensagem.nomeDoRemetente,
      phone_e164: mensagem.telefone,
      city: local?.cidade ?? null,
      state: local?.estado ?? null,
      timezone: local?.fuso ?? null,
      source: ORIGEM_DO_WHATSAPP,
      source_ref: null,
    })
    const { conversaId } = await porta.abrirConversa(contaId, mensagem.telefone, leadId, 'lead')
    // Áudio e imagem só vão ao modelo quando ela vai responder: com o canal
    // desligado ou a conversa com gente, ler seria custo sem uso.
    const antes = descadastro || !eMidiaLida(mensagem.midia) ? null : await porta.lerConversa(contaId, conversaId)
    const midiaParaLer =
      antes !== null && eMidiaLida(mensagem.midia) && antes.status === 'assistente' && (await porta.canalLigado(contaId))
        ? mensagem.midia
        : null
    const gravada = await porta.registrarEntrada(contaId, conversaId, {
      texto: mensagem.texto,
      midia: mensagem.midia,
      idDoProvedor: mensagem.idDoProvedor,
      leitura: midiaParaLer === null ? null : 'pendente',
    })
    if (!gravada.nova) return aceita({ duplicada: true })

    // 6a. A mídia: lê, e só então responde. Se outra execução da rajada tomou
    // a conversa enquanto o modelo lia, ela saiu com `midia_pendente`, e esta
    // tenta de novo uma vez.
    if (midiaParaLer !== null) {
      const anexo = mensagem.anexo
      return aceita({ gravada: true, leitura: 'pendente' }, async (responder) => {
        await porta.lerMidia(contaId, gravada.mensagemId, midiaParaLer, anexo)
        const desfechos = await responder(contaId, conversaId)
        if (Array.isArray(desfechos) && desfechos[0] === 'ocupada') return await responder(contaId, conversaId)
        return desfechos
      })
    }

    // 5. Descadastro.
    if (descadastro) {
      const { criado } = await porta.bloquear(contaId, mensagem.telefone, mensagem.texto)
      const conversa = await porta.lerConversa(contaId, conversaId)
      await porta.encerrarPorDescadastro(contaId, conversaId)
      if (criado && conversa !== null) await porta.abrirItemDeBloqueio(contaId, conversa, mensagem.texto.slice(0, 280))
      return aceita({ descadastro: true }, async () => {
        const credenciais = await porta.credenciais(contaId)
        if (credenciais === null) return
        const texto = FALAS_DO_WHATSAPP.descadastro
        const envio = await porta.enviar(credenciais, mensagem.telefone, texto)
        await porta.registrarSaida({ contaId, conversaId, autor: 'assistente', autorId: null, texto, envio })
      })
    }

    // 6. A resposta, depois do 200.
    const conversa = await porta.lerConversa(contaId, conversaId)
    const responde = conversa?.status === 'assistente' && (await porta.canalLigado(contaId))
    return aceita({ gravada: true }, responde ? responderDepois(contaId, conversaId) : null)
  } catch (erro) {
    log('falha_ao_gravar', { contaId, erro: erro instanceof Error ? erro.message : String(erro) })
    return falhaInterna()
  }
}
