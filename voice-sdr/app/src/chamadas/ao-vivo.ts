// O acompanhamento das chamadas em curso (RF-416, R-08), fora do React.
//
// A assinatura em tempo real é estado que vive fora da árvore: quem o guarda é
// a loja abaixo, e o componente a lê por `useSyncExternalStore`. Sincronizar
// por `useEffect` + `setState` o lint desta base recusa, e com razão — o efeito
// desenharia a lista velha uma vez antes de cada atualização.
//
// A transcrição NUNCA vem por aqui. `call_live` tem sete colunas, e a lista
// delas está em `COLUNAS_DE_CALL_LIVE`, que a implementação sobre o Supabase
// usa no `select` e o teste cobra por conjunto exato. Coluna nova aqui é
// decisão sobre o que trafega para todo navegador aberto nesta tela.

import type { ChamadaAoVivo, EventoAoVivo, ServicoDeChamadas } from '@/chamadas/tipos'

/** As colunas de `call_live`, na ordem da migração, e nenhuma a mais. */
export const COLUNAS_DE_CALL_LIVE = [
  'call_id',
  'account_id',
  'status',
  'purpose',
  'lead_id',
  'started_at',
  'duration_sec',
] as const

/** Uma linha de `call_live` como o Supabase a entrega. */
export function paraChamadaAoVivo(linha: Record<string, unknown>): ChamadaAoVivo {
  const duracao = linha.duration_sec
  return {
    chamadaId: String(linha.call_id),
    contaId: String(linha.account_id),
    status: String(linha.status),
    proposito: String(linha.purpose),
    leadId: typeof linha.lead_id === 'string' ? linha.lead_id : null,
    iniciadaEm: String(linha.started_at),
    duracaoSeg: typeof duracao === 'number' ? duracao : null,
  }
}

export type EstadoAoVivo =
  | { fase: 'carregando' }
  | { fase: 'erro' }
  | { fase: 'pronto'; chamadas: readonly ChamadaAoVivo[] }

export interface LojaAoVivo {
  assinar(ouvinte: () => void): () => void
  ler(): EstadoAoVivo
}

const CARREGANDO: EstadoAoVivo = { fase: 'carregando' }

/**
 * A loja da assinatura. A assinatura no servidor abre com o primeiro ouvinte e
 * fecha com o último: a tela que sai não deixa canal aberto para trás.
 */
export function criarLojaAoVivo(servico: ServicoDeChamadas): LojaAoVivo {
  let estado: EstadoAoVivo = CARREGANDO
  const ouvintes = new Set<() => void>()
  let cancelar: (() => void) | null = null

  function receber(evento: EventoAoVivo) {
    estado =
      evento.tipo === 'erro'
        ? { fase: 'erro' }
        : { fase: 'pronto', chamadas: evento.chamadas }
    for (const ouvinte of ouvintes) ouvinte()
  }

  return {
    assinar(ouvinte) {
      ouvintes.add(ouvinte)
      if (!cancelar) cancelar = servico.assinarAoVivo(receber)
      return () => {
        ouvintes.delete(ouvinte)
        if (ouvintes.size === 0 && cancelar) {
          cancelar()
          cancelar = null
          estado = CARREGANDO
        }
      }
    },
    ler: () => estado,
  }
}

/**
 * O relógio que faz a duração correr. Um só por tela, com o intervalo aberto
 * enquanto alguém o lê; o instante guardado muda só no tique, para o
 * `useSyncExternalStore` não ver um valor novo a cada leitura.
 */
export function criarRelogio(intervaloMs = 1000) {
  let agora = Date.now()
  const ouvintes = new Set<() => void>()
  let intervalo: ReturnType<typeof setInterval> | null = null

  return {
    assinar(ouvinte: () => void) {
      ouvintes.add(ouvinte)
      if (!intervalo) {
        agora = Date.now()
        intervalo = setInterval(() => {
          agora = Date.now()
          for (const cada of ouvintes) cada()
        }, intervaloMs)
      }
      return () => {
        ouvintes.delete(ouvinte)
        if (ouvintes.size === 0 && intervalo) {
          clearInterval(intervalo)
          intervalo = null
        }
      }
    },
    ler: () => agora,
  }
}
