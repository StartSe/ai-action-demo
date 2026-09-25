import type {
  CanalDoWhatsapp,
  CargaDaConversa,
  CargaDaConversaDoLead,
  CargaDeConversas,
  CargaDoCanal,
  ConversaDaLista,
  ConversaDetalhe,
  FiltroDeStatus,
  GravacaoDoCanal,
  MensagemDaConversa,
  PedidoDaAcao,
  ResultadoDaAcao,
  ResultadoDaConexao,
  ServicoDeWhatsapp,
} from '@/whatsapp/tipos'

export interface RespostasDoWhatsapp {
  /** Conversas de exemplo, com o histórico. Sem isto, a conta começa vazia. */
  conversas?: ConversaDetalhe[]
  /** O canal já gravado. `null` é a conta sem linha de configuração ainda. */
  canal?: CanalDoWhatsapp | null
  /** Quando presente, `agir` devolve isto em vez da simulação de sempre. */
  agir?: ResultadoDaAcao
  /** Quando presente, `conectar` devolve isto em vez do sucesso de sempre. */
  conectar?: ResultadoDaConexao
  carregar?: CargaDeConversas
}

export interface ServicoDeWhatsappDublado extends ServicoDeWhatsapp {
  readonly acoes: PedidoDaAcao[]
  /** Quantas vezes `conectar()` foi chamado. */
  conexoes(): number
  ouvintes(conversaId: string): number
  /** Uma mensagem chega pela assinatura, como a replicação a emitiria. */
  chegar(conversaId: string, mensagem: MensagemDaConversa): void
  /** A conversa inteira, para o teste ler o que ficou depois de uma ação. */
  conversaGravada(id: string): ConversaDetalhe | undefined
}

let sequencia = 0

export function mensagemDeExemplo(extras: Partial<MensagemDaConversa> = {}): MensagemDaConversa {
  sequencia += 1
  return {
    id: `m-${sequencia}`,
    direcao: 'in',
    autor: 'lead',
    corpo: 'Quero saber mais sobre a roteirização.',
    midia: null,
    leituraDaMidia: null,
    estadoDaLeitura: null,
    status: 'recebida',
    erro: null,
    criadaEm: new Date(Date.now() - sequencia * 60_000).toISOString(),
    ...extras,
  }
}

export function conversaDeExemplo(extras: Partial<ConversaDetalhe> = {}): ConversaDetalhe {
  sequencia += 1
  return {
    id: `w-${sequencia}`,
    leadId: `l-${sequencia}`,
    leadNome: 'Marcos Ferreira',
    telefone: '+5548999998888',
    status: 'assistente',
    proposito: 'discovery',
    iniciadaPor: 'lead',
    criadaEm: new Date(Date.now() - sequencia * 3_600_000).toISOString(),
    mensagens: [mensagemDeExemplo()],
    ...extras,
  }
}

function paraLista(conversa: ConversaDetalhe): ConversaDaLista {
  const ultima = conversa.mensagens[conversa.mensagens.length - 1]
  return {
    id: conversa.id,
    leadId: conversa.leadId,
    leadNome: conversa.leadNome,
    telefone: conversa.telefone,
    status: conversa.status,
    proposito: conversa.proposito,
    ultimaMensagem: ultima
      ? { corpo: ultima.corpo, midia: ultima.midia, em: ultima.criadaEm }
      : null,
    atualizadaEm: ultima?.criadaEm ?? conversa.criadaEm,
  }
}

/**
 * Dublê do canal de WhatsApp. Guarda conversas e mensagens em memória, como o
 * de fila guarda `exception_items`: `agir` simula o que `whatsapp-send`
 * faria (mudar `status`, empilhar mensagem), e a assinatura é uma lista de
 * ouvintes por conversa que o teste aciona à mão por `chegar`.
 */
export function criarServicoDeWhatsappDublado(
  respostas: RespostasDoWhatsapp = {},
): ServicoDeWhatsappDublado {
  const conversas = new Map<string, ConversaDetalhe>(
    (respostas.conversas ?? []).map((item) => [item.id, item]),
  )
  const acoes: PedidoDaAcao[] = []
  const ouvintesPorConversa = new Map<string, Set<() => void>>()
  let canal: CanalDoWhatsapp | null = respostas.canal ?? null
  let chamadasDeConectar = 0

  function avisar(conversaId: string) {
    for (const ouvinte of ouvintesPorConversa.get(conversaId) ?? []) ouvinte()
  }

  return {
    acoes,
    conexoes: () => chamadasDeConectar,
    ouvintes: (conversaId) => ouvintesPorConversa.get(conversaId)?.size ?? 0,
    conversaGravada: (id) => conversas.get(id),

    chegar(conversaId, mensagem) {
      const conversa = conversas.get(conversaId)
      if (!conversa) return
      conversa.mensagens = [...conversa.mensagens, mensagem]
      avisar(conversaId)
    },

    async listarConversas(filtro: FiltroDeStatus = 'todas'): Promise<CargaDeConversas> {
      if (respostas.carregar) return respostas.carregar
      const todas = [...conversas.values()].map(paraLista)
      const filtradas = filtro === 'todas' ? todas : todas.filter((item) => item.status === filtro)
      return {
        ok: true,
        conversas: filtradas.sort((a, b) => (a.atualizadaEm < b.atualizadaEm ? 1 : -1)),
      }
    },

    async carregarConversa(id): Promise<CargaDaConversa> {
      const conversa = conversas.get(id)
      if (!conversa) return { ok: false, motivo: 'nao-encontrada' }
      return { ok: true, conversa: { ...conversa, mensagens: [...conversa.mensagens] } }
    },

    async carregarConversaDoLead(leadId): Promise<CargaDaConversaDoLead> {
      const doLead = [...conversas.values()]
        .filter((item) => item.leadId === leadId)
        .sort((a, b) => (paraLista(a).atualizadaEm < paraLista(b).atualizadaEm ? 1 : -1))
      return { ok: true, conversa: doLead[0] ? paraLista(doLead[0]) : null }
    },

    async agir(pedido: PedidoDaAcao): Promise<ResultadoDaAcao> {
      acoes.push(pedido)
      if (respostas.agir) return respostas.agir

      if (pedido.acao === 'iniciar') {
        const existente = pedido.leadId
          ? [...conversas.values()].find(
              (item) => item.leadId === pedido.leadId && item.status !== 'encerrada',
            )
          : undefined
        if (existente) return { ok: true, conversaId: existente.id, status: existente.status }

        const nova = conversaDeExemplo({
          leadId: pedido.leadId ?? null,
          mensagens: [],
          status: 'assistente',
        })
        conversas.set(nova.id, nova)
        return { ok: true, conversaId: nova.id, status: nova.status }
      }

      const conversa = pedido.conversaId ? conversas.get(pedido.conversaId) : undefined
      if (!conversa) {
        return {
          ok: false,
          motivo: 'conversa_nao_encontrada',
          mensagem: 'Esta conversa não existe mais nesta conta.',
        }
      }

      if (pedido.acao === 'assumir') conversa.status = 'humano'
      else if (pedido.acao === 'devolver') conversa.status = 'assistente'
      else if (pedido.acao === 'encerrar') conversa.status = 'encerrada'
      else if (pedido.acao === 'mensagem' || pedido.acao === undefined) {
        conversa.mensagens = [
          ...conversa.mensagens,
          {
            id: `m-${(sequencia += 1)}`,
            direcao: 'out',
            autor: 'humano',
            corpo: pedido.texto ?? '',
            midia: null,
            leituraDaMidia: null,
            estadoDaLeitura: null,
            status: 'enviada',
            erro: null,
            criadaEm: new Date().toISOString(),
          },
        ]
      }

      return { ok: true, conversaId: conversa.id, status: conversa.status }
    },

    async conectar(): Promise<ResultadoDaConexao> {
      chamadasDeConectar += 1
      return (
        respostas.conectar ?? {
          ok: true,
          estado: 'conectado',
          mensagem: 'Webhook registrado na Z-API.',
        }
      )
    },

    async carregarCanal(): Promise<CargaDoCanal> {
      return { ok: true, canal }
    },

    async definirCanal(novo): Promise<GravacaoDoCanal> {
      canal = novo
      return { ok: true, canal: novo }
    },

    assinar(conversaId, aoMudar) {
      const conjunto = ouvintesPorConversa.get(conversaId) ?? new Set()
      conjunto.add(aoMudar)
      ouvintesPorConversa.set(conversaId, conjunto)
      return () => {
        conjunto.delete(aoMudar)
      }
    },
  }
}
