// Garantir os webhooks: o passo da publicação que liga a ElevenLabs da conta a
// `call-init` e `call-events`, sem passo manual.
//
// Os dois webhooks são configuração do **workspace** do provedor, um por chave,
// e não dos agentes. Por isso o passo roda uma vez por publicação, depois dos
// quatro propósitos, e é **idempotente pela leitura**: primeiro lê a
// configuração de conversa do workspace e o webhook guardado no cofre da conta;
// se os dois já apontam para nós, não escreve nada. O teste conta as idas.
//
// **O webhook de fim só se cria quando falta.** Criar devolve um segredo HMAC
// novo, e ele só vale guardado: por isso a ordem é criar, guardar no cofre e só
// então apontar a configuração para ele. Guardar falhou, a configuração não é
// tocada — apontar para um webhook cujo segredo se perdeu faria todo aviso de
// fim cair no 401. Webhook guardado que a configuração deixou de citar é
// conferido na listagem antes de ser reaproveitado; sumiu de lá, cria-se outro.
//
// **Falha aqui não derruba a publicação.** Os agentes já foram ao ar, e tirar a
// Sarah do ar porque o aviso de fim não foi cadastrado seria trocar o principal
// pelo acessório. O desfecho vira pendência no relatório, com frase, e a
// próxima publicação tenta de novo.
//
// **Chave da plataforma não entra.** Com a credencial vinda da plataforma, o
// workspace é da instalação inteira e é compartilhado entre contas: cadastrar
// `?conta=` de uma delas desligaria os avisos de todas as outras. Aí os
// webhooks são da instalação (`SARAH_VOZ_WEBHOOK_SECRET`), e o passo não
// escreve nada.
//
// Módulo portável: sem Deno, sem rede, sem banco. O provedor e o cofre entram
// pela porta da publicação.

import {
  CABECALHO_DO_SEGREDO_DO_INICIO,
  enderecoDoWebhook,
  FUNCAO_DO_FIM,
  FUNCAO_DO_INICIO,
} from '../_shared/provedor/webhooks-da-conta.ts'
import { NOME_DO_PRODUTO } from '../_shared/marca.ts'
import type { OrigemDoSegredo } from '../_shared/secrets.ts'

import {
  CAMINHO_DA_CONFIGURACAO_DE_CONVERSA,
  CAMINHO_DOS_WEBHOOKS,
  corpoDaConfiguracaoDeWebhooks,
  corpoDoWebhookDeFim,
  lerConfiguracaoDoWorkspace,
  lerWebhookCriado,
  lerWebhooksDoWorkspace,
} from './formato-do-provedor.ts'
import { MENSAGENS_DOS_WEBHOOKS, type MotivoDosWebhooks } from './respostas.ts'

/** Uma ida à API do provedor. `caminho` é relativo a `/v1`. */
export interface IdaAoProvedor {
  readonly metodo: 'GET' | 'POST' | 'PATCH'
  readonly caminho: string
  readonly corpo?: unknown
  /** A chave do provedor, já resolvida pela cascata. Não sai daqui. */
  readonly credencial: string
}

/** O que voltou. Porta que não conseguiu falar com o provedor devolve `ok: false`. */
export interface VoltaDoProvedor {
  readonly ok: boolean
  readonly status: number | null
  readonly corpo?: unknown
  readonly latenciaMs?: number | null
}

/** O webhook de fim guardado no cofre da conta. Existir implica haver segredo. */
export interface WebhookGuardado {
  readonly id: string | null
  readonly url: string | null
}

export interface PortaDosWebhooks {
  chamarApiDoProvedor(ida: IdaAoProvedor): Promise<VoltaDoProvedor>
  /** O metadado de `voz` / `webhook_secret`, ou nulo quando a conta não tem. */
  webhookGuardado(contaId: string): Promise<WebhookGuardado | null>
  /** Grava segredo e metadado no cofre da conta, pela porta do servidor. */
  guardarWebhook(contaId: string, webhook: { id: string; url: string; segredo: string }): Promise<void>
  /** O rastro de cada escrita no provedor. Falhar aqui não muda nada. */
  registrarIdaDosWebhooks?(registro: RegistroDosWebhooks): Promise<void>
}

export interface RegistroDosWebhooks {
  readonly endpoint: string
  readonly metodo: 'POST' | 'PATCH'
  readonly ok: boolean
  readonly status: number | null
  readonly latenciaMs: number | null
}

/**
 * `em_dia`: já apontavam para nós, e nada foi escrito.
 * `cadastrados`: esta publicação escreveu no provedor.
 * `da_instalacao`: credencial da plataforma, e os webhooks não são da conta.
 * `falha`: há pendência, com frase.
 */
export type EstadoDosWebhooks = 'em_dia' | 'cadastrados' | 'da_instalacao' | 'falha'

export interface ResultadoDosWebhooks {
  readonly estado: EstadoDosWebhooks
  readonly motivo: MotivoDosWebhooks | null
  readonly mensagem: string | null
}

export interface EntradaDosWebhooks {
  readonly contaId: string
  readonly credencial: string
  readonly origemDaCredencial: OrigemDoSegredo
  /** O endereço base das funções de borda (`.../functions/v1`). */
  readonly enderecoDasFuncoes: string
  /** O segredo do início da conta, já derivado. */
  readonly segredoDoInicio: string
}

export interface DesfechoDosWebhooks {
  readonly resultado: ResultadoDosWebhooks
  /** Segredos que passaram por aqui, para a conferência de vazamento da borda. */
  readonly segredos: readonly string[]
}

/** O nome do webhook de fim no painel do provedor. */
export function nomeDoWebhookDeFim(contaId: string): string {
  return `${NOME_DO_PRODUTO}: fim de ligação (${contaId})`
}

export async function garantirWebhooks(
  entrada: EntradaDosWebhooks,
  porta: PortaDosWebhooks,
): Promise<DesfechoDosWebhooks> {
  const segredos: string[] = [entrada.segredoDoInicio]
  const desfecho = (resultado: ResultadoDosWebhooks): DesfechoDosWebhooks => ({ resultado, segredos })

  if (entrada.origemDaCredencial === 'plataforma') {
    return desfecho({ estado: 'da_instalacao', motivo: null, mensagem: null })
  }

  try {
    const urlDoInicio = enderecoDoWebhook(entrada.enderecoDasFuncoes, FUNCAO_DO_INICIO, entrada.contaId)
    const urlDoFim = enderecoDoWebhook(entrada.enderecoDasFuncoes, FUNCAO_DO_FIM, entrada.contaId)

    const guardado = await porta.webhookGuardado(entrada.contaId)
    const lida = await porta.chamarApiDoProvedor({
      metodo: 'GET',
      caminho: CAMINHO_DA_CONFIGURACAO_DE_CONVERSA,
      credencial: entrada.credencial,
    })
    const configuracao = lida.ok ? lerConfiguracaoDoWorkspace(lida.corpo) : null
    if (!configuracao) return desfecho(falha('configuracao_ilegivel'))

    // O guardado só serve se foi feito para este endereço: trocar a URL do
    // projeto faria um webhook antigo continuar mandando avisos para longe.
    const guardadoServe = guardado?.id && guardado.url === urlDoFim ? guardado.id : null

    const inicioEmDia =
      configuracao.inicioUrl === urlDoInicio &&
      configuracao.inicioCabecalhos[CABECALHO_DO_SEGREDO_DO_INICIO] === entrada.segredoDoInicio
    if (guardadoServe && configuracao.posChamadaId === guardadoServe && inicioEmDia) {
      return desfecho({ estado: 'em_dia', motivo: null, mensagem: null })
    }

    let webhookDoFim = guardadoServe
    if (webhookDoFim && configuracao.posChamadaId !== webhookDoFim) {
      webhookDoFim = await aindaExiste(webhookDoFim, entrada.credencial, porta)
    }

    if (!webhookDoFim) {
      const criacao = await porta.chamarApiDoProvedor({
        metodo: 'POST',
        caminho: CAMINHO_DOS_WEBHOOKS,
        corpo: corpoDoWebhookDeFim(nomeDoWebhookDeFim(entrada.contaId), urlDoFim),
        credencial: entrada.credencial,
      })
      await registrar(porta, CAMINHO_DOS_WEBHOOKS, 'POST', criacao)
      const criado = criacao.ok ? lerWebhookCriado(criacao.corpo) : null
      if (!criado) return desfecho(falha('aviso_de_fim_nao_criado'))
      segredos.push(criado.segredo)

      try {
        await porta.guardarWebhook(entrada.contaId, { id: criado.id, url: urlDoFim, segredo: criado.segredo })
      } catch {
        return desfecho(falha('segredo_nao_guardado'))
      }
      webhookDoFim = criado.id
    }

    const aplicacao = await porta.chamarApiDoProvedor({
      metodo: 'PATCH',
      caminho: CAMINHO_DA_CONFIGURACAO_DE_CONVERSA,
      corpo: corpoDaConfiguracaoDeWebhooks({
        inicioUrl: urlDoInicio,
        inicioCabecalhos: { [CABECALHO_DO_SEGREDO_DO_INICIO]: entrada.segredoDoInicio },
        posChamadaId: webhookDoFim,
      }),
      credencial: entrada.credencial,
    })
    await registrar(porta, CAMINHO_DA_CONFIGURACAO_DE_CONVERSA, 'PATCH', aplicacao)
    if (!aplicacao.ok) return desfecho(falha('configuracao_recusada'))

    return desfecho({ estado: 'cadastrados', motivo: null, mensagem: null })
  } catch {
    // Porta que levanta é provedor ou cofre fora do ar: pendência, e a próxima
    // publicação tenta de novo.
    return desfecho(falha('configuracao_ilegivel'))
  }
}

/** O webhook guardado ainda está na listagem do workspace? */
async function aindaExiste(
  id: string,
  credencial: string,
  porta: PortaDosWebhooks,
): Promise<string | null> {
  const listagem = await porta.chamarApiDoProvedor({ metodo: 'GET', caminho: CAMINHO_DOS_WEBHOOKS, credencial })
  const webhooks = listagem.ok ? lerWebhooksDoWorkspace(listagem.corpo) : null
  // Listagem ilegível não prova que ele sumiu, e criar outro deixaria dois
  // webhooks mandando o mesmo aviso: é pendência, não recriação.
  if (!webhooks) throw new Error('listagem de webhooks ilegível')
  return webhooks.some((webhook) => webhook.id === id) ? id : null
}

async function registrar(
  porta: PortaDosWebhooks,
  endpoint: string,
  metodo: 'POST' | 'PATCH',
  volta: VoltaDoProvedor,
): Promise<void> {
  try {
    await porta.registrarIdaDosWebhooks?.({
      endpoint,
      metodo,
      ok: volta.ok,
      status: volta.status,
      latenciaMs: volta.latenciaMs ?? null,
    })
  } catch {
    // O rastro é acessório; a pendência, se houver, já está no relatório.
  }
}

function falha(motivo: MotivoDosWebhooks): ResultadoDosWebhooks {
  return { estado: 'falha', motivo, mensagem: MENSAGENS_DOS_WEBHOOKS[motivo] }
}
