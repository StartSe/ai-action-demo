import { lerContexto } from '@/fila/leitura'
import type {
  CargaDaFila,
  EstadoDaAssinatura,
  ItemDaFila,
  ResultadoDaResolucao,
  ServicoDaFila,
} from '@/fila/tipos'

export interface RespostasDaFila {
  itens?: ItemDaFila[]
  /** Quando presente, o dublê devolve isto e ignora a lista em memória. */
  carregar?: CargaDaFila
  /** Quem a sessão é, para o dublê carimbar a autoria como o RPC faz. */
  usuarioId?: string
  /**
   * A conta já teve itens resolvidos que a lista em memória não guarda. Sem
   * isto, `haItens` sai da lista.
   */
  haItens?: boolean
  /** A inclusão em `dnc_entries` que a RLS recusa em silêncio (lista vazia). */
  bloqueioRecusado?: boolean
}

export interface ServicoDaFilaDublado extends ServicoDaFila {
  /** Todo estado pedido, na ordem: prova a releitura depois da escrita. */
  readonly cargas: string[]
  readonly resolucoes: { id: string; texto: string }[]
  /** Os números que `confirmarBloqueio` incluiu em `dnc_entries`, na ordem. */
  readonly bloqueios: string[]
  /** A fila inteira em memória, abertos e resolvidos. */
  readonly linhas: ItemDaFila[]
  /** Quantos ouvintes do tempo real estão abertos. */
  ouvintes(): number
  /** Um item novo chega pela assinatura, como a replicação o emitiria. */
  chegar(item: ItemDaFila): void
  /** A assinatura muda de estado, como o canal do Supabase avisaria. */
  sinalizar(estado: EstadoDaAssinatura): void
  /** Outra pessoa resolve o item enquanto a tela está aberta, sem aviso. */
  resolverPorOutro(id: string, autor: string, texto?: string): void
  /**
   * Segura as cargas seguintes até a função devolvida ser chamada. É o que
   * separa "o item saiu na mesma ação" de "o item saiu quando a releitura
   * chegou".
   */
  segurarCargas(): () => void
}

let sequencia = 0

export function itemDeExemplo(extras: Partial<ItemDaFila> = {}): ItemDaFila {
  sequencia += 1
  return {
    id: `e-${sequencia}`,
    tipo: 'pedido_humano',
    severidade: 'alta',
    criadoEm: new Date(Date.now() - sequencia * 60_000).toISOString(),
    lead: { id: `l-${sequencia}`, nome: 'Marcos Ferreira', telefone: '+5548999998888' },
    chamadaId: `c-${sequencia}`,
    gravacao: 'disponivel',
    contexto: lerContexto({ recorte: 'Quero falar com alguém do comercial.' }),
    limiares: [],
    resolucao: null,
    ...extras,
  }
}

/**
 * Dublê da fila. Guarda os itens em memória e responde a resolução com os
 * códigos de `resolver_item_de_fila`, na ordem do RPC: `inexistente`,
 * `ja_resolvido` sem tocar a linha, `resolucao_vazia`. A assinatura é uma lista
 * de ouvintes que o teste aciona à mão por `chegar`, que é o que o tempo real
 * faria, e por `sinalizar`, que é o canal subindo ou caindo. A carga devolve na
 * ordem do banco (instante); a ordem por severidade é da tela.
 */
export function criarServicoDaFilaDublado(respostas: RespostasDaFila = {}): ServicoDaFilaDublado {
  const cargas: string[] = []
  const resolucoes: { id: string; texto: string }[] = []
  const bloqueios: string[] = []
  const linhas: ItemDaFila[] = [...(respostas.itens ?? [])]
  const ouvintes = new Set<() => void>()
  const estados = new Set<(estado: EstadoDaAssinatura) => void>()
  const usuarioId = respostas.usuarioId ?? 'u-1'
  let segurada: Promise<void> | null = null

  function avisar() {
    for (const ouvinte of ouvintes) ouvinte()
  }

  function resolver(id: string, texto: string): Promise<ResultadoDaResolucao> {
    resolucoes.push({ id, texto })
    const linha = linhas.find((item) => item.id === id)
    if (!linha) return Promise.resolve({ codigo: 'inexistente' })
    if (linha.resolucao !== null) {
      return Promise.resolve({ codigo: 'ja_resolvido', resolucao: { ...linha.resolucao } })
    }
    if (texto.trim() === '') return Promise.resolve({ codigo: 'resolucao_vazia' })
    linha.resolucao = { autor: usuarioId, em: new Date().toISOString(), texto: texto.trim() }
    return Promise.resolve({ codigo: 'resolvido' })
  }

  return {
    cargas,
    resolucoes,
    bloqueios,
    linhas,
    ouvintes: () => ouvintes.size,

    chegar(item) {
      linhas.unshift(item)
      avisar()
    },

    sinalizar(estado) {
      for (const ouvinte of estados) ouvinte(estado)
    },

    resolverPorOutro(id, autor, texto = 'Liguei de volta e resolvi.') {
      const linha = linhas.find((item) => item.id === id)
      if (!linha) return
      linha.resolucao = { autor, em: new Date().toISOString(), texto }
    },

    segurarCargas() {
      let soltar = () => {}
      segurada = new Promise<void>((resolver) => {
        soltar = resolver
      })
      return () => {
        segurada = null
        soltar()
      }
    },

    async carregar(estado): Promise<CargaDaFila> {
      cargas.push(estado)
      if (segurada) await segurada
      if (respostas.carregar) return respostas.carregar
      const itens = linhas
        .filter((item) => (estado === 'aberto') === (item.resolucao === null))
        .sort((a, b) => {
          const chaveA = estado === 'aberto' ? a.criadoEm : (a.resolucao?.em ?? '')
          const chaveB = estado === 'aberto' ? b.criadoEm : (b.resolucao?.em ?? '')
          return chaveA < chaveB ? 1 : chaveA > chaveB ? -1 : 0
        })
      return {
        ok: true,
        itens: itens.map((item) => ({ ...item })),
        haItens: (respostas.haItens ?? false) || linhas.length > 0,
      }
    },

    resolver,

    confirmarBloqueio(id, telefone, texto): Promise<ResultadoDaResolucao> {
      if (respostas.bloqueioRecusado) return Promise.resolve({ codigo: 'sem_permissao' })
      bloqueios.push(telefone)
      return resolver(id, texto)
    },

    assinar(aoMudar, aoTrocarEstado) {
      ouvintes.add(aoMudar)
      if (aoTrocarEstado) estados.add(aoTrocarEstado)
      return () => {
        ouvintes.delete(aoMudar)
        if (aoTrocarEstado) estados.delete(aoTrocarEstado)
      }
    },
  }
}
