// As decisões da tela `/fila` que não dependem de React (US-149, RF-908,
// RF-909, RF-910). Testadas à parte, em `consulta.test.ts`.
//
// 1. **Severidade primeiro, depois o instante.** Alta antes de média antes de
//    baixa; dentro da mesma severidade, o mais recente primeiro (nos resolvidos,
//    o resolvido mais recente). O banco entrega por instante, e a ordem da tela
//    é daqui.
// 2. **Dois vazios, e quem decide é a conta.** Fila nunca preenchida é conta sem
//    item nenhum, em estado nenhum; recorte sem resultado é conta com itens que
//    o estado ou o tipo escolhidos deixaram de fora. Um só vazio mentiria para
//    um dos dois.
// 3. **A ação é por tipo, e cada uma faz alguma coisa.** Pedido de humano liga
//    para o lead; pedido de bloqueio confirma o bloqueio em `dnc_entries`; os
//    outros abrem a tela onde o trabalho é feito. Tipo sem ação (o da fatia
//    seguinte) ou item sem o dado que a ação pede não ganha botão: controle
//    que não faz nada é pior do que nenhum.
// 4. **Sem tempo real, recarga por intervalo.** A assinatura que cai ou não sobe
//    liga a recarga; a que está de pé a desliga.

import type {
  EstadoDaAssinatura,
  FiltroDeTipo,
  ItemDaFila,
  Severidade,
  TipoDoItem,
} from '@/fila/tipos'
import { TIPOS_DE_FATIA_SEGUINTE } from '@/fila/tipos'

const PESO_DA_SEVERIDADE: Record<Severidade, number> = { alta: 0, media: 1, baixa: 2 }

/** Quanto espera a recarga quando o tempo real não está de pé. */
export const INTERVALO_DA_RECARGA_MS = 30_000

function instanteDe(item: ItemDaFila): string {
  return item.resolucao?.em ?? item.criadoEm
}

/** Severidade, depois o instante mais recente, depois o id: a ordem é total. */
export function ordenarItens(itens: readonly ItemDaFila[]): ItemDaFila[] {
  return [...itens].sort((a, b) => {
    const porSeveridade = PESO_DA_SEVERIDADE[a.severidade] - PESO_DA_SEVERIDADE[b.severidade]
    if (porSeveridade !== 0) return porSeveridade
    const instanteA = instanteDe(a)
    const instanteB = instanteDe(b)
    if (instanteA !== instanteB) return instanteA < instanteB ? 1 : -1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

export function filtrarPorTipo(itens: readonly ItemDaFila[], filtro: FiltroDeTipo): ItemDaFila[] {
  return filtro === 'todos' ? [...itens] : itens.filter((item) => item.tipo === filtro)
}

export type EstadoDaLista = 'nunca_preenchida' | 'recorte_vazio' | 'com_itens'

export function estadoDaLista(haItens: boolean, noRecorte: number): EstadoDaLista {
  if (noRecorte > 0) return 'com_itens'
  return haItens ? 'recorte_vazio' : 'nunca_preenchida'
}

/** O intervalo do `refetchInterval`, ou `false` quando o tempo real basta. */
export function intervaloDaRecarga(assinatura: EstadoDaAssinatura): number | false {
  return assinatura === 'indisponivel' ? INTERVALO_DA_RECARGA_MS : false
}

/** A fatia que entrega o tipo, quando ele ainda não tem produtor nesta fase. */
export function fatiaQueEntrega(tipo: TipoDoItem): string | null {
  return TIPOS_DE_FATIA_SEGUINTE[tipo] ?? null
}

export type AcaoDoItem =
  /** Pedido de humano: quem opera assume a conversa, ligando para o lead. */
  | { tipo: 'ligar'; telefone: string }
  /** Pedido de bloqueio: garante o número em `dnc_entries` e resolve. */
  | { tipo: 'confirmar_bloqueio'; telefone: string }
  | { tipo: 'abrir_chamada'; chamadaId: string }
  | { tipo: 'abrir_avaliacao'; chamadaId: string }
  | { tipo: 'abrir_lead'; leadId: string }
  | { tipo: 'abrir_integracoes' }

function telefoneDo(item: ItemDaFila): string | null {
  return item.lead?.telefone ?? item.contexto.telefone
}

/** A ação em um clique do item, ou nula quando falta o dado que ela pede. */
export function acaoDoItem(item: ItemDaFila): AcaoDoItem | null {
  const telefone = telefoneDo(item)
  switch (item.tipo) {
    case 'pedido_humano':
      return telefone ? { tipo: 'ligar', telefone } : null
    case 'pedido_bloqueio':
      return telefone ? { tipo: 'confirmar_bloqueio', telefone } : null
    case 'sentimento_negativo':
    case 'classificacao_pendente':
      return item.chamadaId ? { tipo: 'abrir_chamada', chamadaId: item.chamadaId } : null
    case 'avaliacao_reprovada':
      return item.chamadaId ? { tipo: 'abrir_avaliacao', chamadaId: item.chamadaId } : null
    case 'falha_repetida':
      return item.lead ? { tipo: 'abrir_lead', leadId: item.lead.id } : null
    case 'credito_baixo':
      return { tipo: 'abrir_integracoes' }
    case 'reuniao_sem_especialista':
      return null
  }
}

/** A ação que escreve pede papel de operador; a que só abre tela, não. */
export function acaoEscreve(acao: AcaoDoItem): boolean {
  return acao.tipo === 'confirmar_bloqueio'
}
