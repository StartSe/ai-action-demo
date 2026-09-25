// O que a ficha da reunião decide antes de desenhar (US-180, RF-511).
//
// O estado do evento e o de cada convite saem das mesmas regras da borda
// (`eventoDesistiu`, `situacaoDoConvite`), como as marcas da lista. O que
// fazer quando falhou é a marca da lista: só a reunião ativa pede alguma
// coisa de alguém, e a regra disso mora em `marcas.ts`.

import { situacaoDoConvite, type EntregaDoConvite } from '@compartilhado/agenda/convite-de-reuniao.ts'
import { eventoDesistiu } from '@compartilhado/agenda/evento-da-reuniao.ts'

import { marcasDaReuniao, type MarcaDaReuniao } from '@/reunioes/marcas'
import type { ChamadaDaReuniao, FichaDaReuniao } from '@/reunioes/tipos'

export type EstadoDoEvento = 'criado' | 'removendo' | 'sem-evento' | 'tentando' | 'desistiu'

export type EstadoDoConvite = 'enviado' | 'sem-email' | 'email-nao-configurado' | 'na-fila' | 'tentando' | 'desistiu'

export function estadoDoEvento(ficha: Pick<FichaDaReuniao, 'evento' | 'estado'>): EstadoDoEvento {
  const { externoId, tentativas } = ficha.evento
  // A cancelada com evento é a que `cron-calendar-sync` ainda vai tirar do
  // calendário do especialista (US-181).
  if (externoId !== null) return ficha.estado === 'canceled' ? 'removendo' : 'criado'
  // Reunião cancelada não é tentada de novo: sem evento, fica sem evento.
  if (ficha.estado === 'canceled') return 'sem-evento'
  if (eventoDesistiu({ external_event_id: externoId, event_attempts: tentativas })) return 'desistiu'
  return tentativas > 0 ? 'tentando' : 'sem-evento'
}

export function estadoDoConvite(entrega: EntregaDoConvite, temEmail: boolean): EstadoDoConvite {
  const situacao = situacaoDoConvite(entrega, temEmail)
  if (situacao === 'sem_email') return 'sem-email'
  if (situacao === 'email_nao_configurado') return 'email-nao-configurado'
  // Sem tentativa nenhuma é o convite saindo agora, e não uma falha.
  if (situacao === 'tentando') return entrega.tentativas > 0 ? 'tentando' : 'na-fila'
  return situacao
}

export type ItemVerificado = 'evento' | 'conviteDoLead' | 'conviteDoEspecialista'

const PREFIXO_DA_MARCA: Record<ItemVerificado, (marca: MarcaDaReuniao) => boolean> = {
  evento: (marca) => marca === 'sem-evento' || marca.startsWith('evento-'),
  // A falta de e-mail da conta é dos dois convites.
  conviteDoLead: (marca) => marca.startsWith('convite-lead-') || marca === 'convite-email-nao-configurado',
  conviteDoEspecialista: (marca) =>
    marca.startsWith('convite-especialista-') || marca === 'convite-email-nao-configurado',
}

/** A marca que pede ação sobre o item, ou nula quando não há nada a fazer. */
export function marcaDoItem(ficha: FichaDaReuniao, item: ItemVerificado): MarcaDaReuniao | null {
  return marcasDaReuniao(ficha).find(PREFIXO_DA_MARCA[item]) ?? null
}

export type TipoDoPasso =
  | 'marcada-na-ligacao'
  | 'marcada-manualmente'
  | 'confirmada-na-ligacao'
  | 'confirmada-manualmente'

export interface PassoDoHistorico {
  tipo: TipoDoPasso
  instante: string
  /** A ligação, quando o passo veio de uma e a leitura a achou: é o link da ficha. */
  chamada: ChamadaDaReuniao | null
}

/**
 * "Marcada na ligação X" e "confirmada na ligação Y", numa ordem só (T-23).
 * O instante do passo é o da ligação quando ela existe, e o da reunião
 * quando não: `created_at` para a marcação e `confirmed_at` para a
 * confirmação. Reunião sem ligação nenhuma é marcada manualmente, e é caso
 * normal.
 */
export function historicoDaFicha(ficha: FichaDaReuniao): PassoDoHistorico[] {
  const achar = (id: string | null) =>
    id === null ? null : (ficha.chamadas.find((chamada) => chamada.id === id) ?? null)

  const daMarcacao = achar(ficha.chamadaDaMarcacao)
  const passos: PassoDoHistorico[] = [
    {
      tipo: ficha.chamadaDaMarcacao ? 'marcada-na-ligacao' : 'marcada-manualmente',
      instante: daMarcacao?.iniciadaEm ?? ficha.marcadaEm,
      chamada: daMarcacao,
    },
  ]

  if (ficha.chamadaDaConfirmacao || ficha.confirmadaEm) {
    const daConfirmacao = achar(ficha.chamadaDaConfirmacao)
    passos.push({
      tipo: ficha.chamadaDaConfirmacao ? 'confirmada-na-ligacao' : 'confirmada-manualmente',
      instante: daConfirmacao?.iniciadaEm ?? ficha.confirmadaEm ?? ficha.marcadaEm,
      chamada: daConfirmacao,
    })
  }

  // `sort` é estável: no mesmo instante, a marcação vem antes da confirmação.
  return passos.sort((a, b) => Date.parse(a.instante) - Date.parse(b.instante))
}
