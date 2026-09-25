// O que uma reunião deixa para alguém resolver (US-179).
//
// O evento no calendário (US-172) e o convite por e-mail (US-173) não desfazem
// a reunião quando falham: a borda grava a tentativa, tenta de novo com recuo
// e, no teto, desiste. O que fica pendurado aparece aqui como marca, e a copy
// de cada marca diz o que fazer.
//
// Quem decide "desistiu" são os módulos da borda, importados por
// `@compartilhado/`. Uma comparação com o teto escrita aqui seria a segunda
// versão da regra, e ela divergiria no primeiro ajuste do recuo.
//
// Só a reunião ativa (marcada ou confirmada) ganha marca: evento que faltou
// numa reunião cancelada ou já acontecida não pede nada de ninguém.

import { situacaoDoConvite } from '@compartilhado/agenda/convite-de-reuniao.ts'
import { eventoDesistiu } from '@compartilhado/agenda/evento-da-reuniao.ts'

import type { ReuniaoDaLista } from '@/reunioes/tipos'

export const MARCAS = [
  'sem-evento',
  'evento-tentando',
  'evento-desistiu',
  'convite-lead-sem-email',
  'convite-email-nao-configurado',
  'convite-lead-tentando',
  'convite-lead-desistiu',
  'convite-especialista-tentando',
  'convite-especialista-desistiu',
] as const

export type MarcaDaReuniao = (typeof MARCAS)[number]

const ATIVAS = new Set(['scheduled', 'confirmed'])

function marcaDoEvento(reuniao: ReuniaoDaLista): MarcaDaReuniao | null {
  const { externoId, tentativas } = reuniao.evento
  if (externoId !== null) return null
  if (eventoDesistiu({ external_event_id: externoId, event_attempts: tentativas })) {
    return 'evento-desistiu'
  }
  // Sem tentativa nenhuma é o especialista sem calendário para criar o evento.
  return tentativas > 0 ? 'evento-tentando' : 'sem-evento'
}

export function marcasDaReuniao(reuniao: ReuniaoDaLista): MarcaDaReuniao[] {
  if (!ATIVAS.has(reuniao.estado)) return []
  const marcas: MarcaDaReuniao[] = []

  const doEvento = marcaDoEvento(reuniao)
  if (doEvento) marcas.push(doEvento)

  const doLead = situacaoDoConvite(reuniao.conviteDoLead, reuniao.lead.temEmail)
  const doEspecialista = situacaoDoConvite(reuniao.conviteDoEspecialista, true)
  // A conta sem e-mail configurado é uma marca só, para os dois convites: o
  // que fazer é um só, em Integrações.
  if (doLead === 'email_nao_configurado' || doEspecialista === 'email_nao_configurado') {
    marcas.push('convite-email-nao-configurado')
  }
  if (doLead === 'sem_email') marcas.push('convite-lead-sem-email')
  if (doLead === 'desistiu') marcas.push('convite-lead-desistiu')
  // Tentando sem falha nenhuma é o convite saindo agora, e não pendência.
  if (doLead === 'tentando' && reuniao.conviteDoLead.tentativas > 0) {
    marcas.push('convite-lead-tentando')
  }

  // `specialists.email` é obrigatório: do lado do especialista não há "sem e-mail".
  if (doEspecialista === 'desistiu') marcas.push('convite-especialista-desistiu')
  if (doEspecialista === 'tentando' && reuniao.conviteDoEspecialista.tentativas > 0) {
    marcas.push('convite-especialista-tentando')
  }

  return marcas
}
