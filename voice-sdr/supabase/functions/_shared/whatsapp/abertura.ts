// A abertura da assistente no WhatsApp: a primeira mensagem quando ela inicia
// a conversa, e a base do pré-contato.
//
// **O texto é da conta, ou o padrão.** `agents.whatsapp_first_message` vai ao
// ar pela publicação e chega aqui pelo retrato (`retrato-da-publicacao.ts`);
// nulo vale `FALAS_DO_WHATSAPP.abertura`. Os marcadores são os da primeira fala
// da voz (`MARCADORES_DA_PRIMEIRA_FALA`), com a mesma recusa na tela, e se
// preenchem pela mesma `interpolarFala`: o que não tem valor some com a
// preposição que o apresentava. `nome_do_especialista` fica em branco, porque
// antes da conversa não há reunião.
//
// **Sem modelo.** A abertura é texto fixo, como a primeira fala da ligação: a
// conta decide o que a assistente diz primeiro, e o modelo entra a partir da
// resposta do lead.
//
// Módulo portável: sem Deno, sem rede.

import { interpolarFala } from '../agente/compilador.ts'
import { valoresDaConta } from '../agente/primeira-fala.ts'
import { FALAS_DO_WHATSAPP } from '../speech/whatsapp.ts'

export interface IdentidadeDaAbertura {
  readonly nome: string
  readonly empresa: string
  readonly nuncaAfirmar?: readonly string[]
}

export interface LeadDaAbertura {
  readonly nome: string | null
  readonly empresa?: string | null
  readonly cidade?: string | null
}

/** Marcador que sobrou depois da interpolação: texto que não pode sair. */
export const MARCADOR_CRU = /\{\{?\s*[A-Za-z0-9_]+\s*\}?\}/

/** Os valores de cada marcador, da identidade publicada e do lead. */
export function valoresDaAbertura(
  identidade: IdentidadeDaAbertura,
  lead: LeadDaAbertura | null,
): Readonly<Record<string, string>> {
  return {
    ...valoresDaConta({ nome: identidade.nome.trim(), empresa: identidade.empresa.trim(), nuncaAfirmar: identidade.nuncaAfirmar ?? [] }),
    nome_do_lead: lead?.nome?.trim() ?? '',
    empresa_do_lead: lead?.empresa?.trim() ?? '',
    cidade_do_lead: lead?.cidade?.trim() ?? '',
    nome_do_especialista: '',
  }
}

/** A abertura que sai: a da conta, senão a padrão, com os marcadores trocados. */
export function textoDaAbertura(
  escritaPelaConta: string | null,
  identidade: IdentidadeDaAbertura,
  lead: LeadDaAbertura | null,
): string {
  const modelo = escritaPelaConta?.trim() || FALAS_DO_WHATSAPP.abertura
  return interpolarFala(modelo, valoresDaAbertura(identidade, lead))
}
