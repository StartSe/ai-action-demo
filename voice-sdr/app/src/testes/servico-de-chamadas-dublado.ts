import { faltaParaAbrir } from '@compartilhado/discagem/portao.ts'
import {
  guardarDiscagem,
  type ChamadaDaGuarda,
  type PortaDeGuarda,
  type RespostaDaGuarda,
} from '@compartilhado/discagem/guarda.ts'
import { dentroDaJanela } from '@compartilhado/discagem/janela.ts'

import { aplicarRecorte } from '@/chamadas/consulta'
import { ETAPAS_DE_EXEMPLO } from '@/testes/servico-de-leads-dublado'
import type {
  CargaDaEstimativa,
  CargaDaFicha,
  CargaDaOperacao,
  CargaDeChamadas,
  ChamadaDaLista,
  CargaDoDiscador,
  ChamadaAoVivo,
  Discador,
  EventoAoVivo,
  FichaDaChamada,
  FreioPuxado,
  PedidoDeCorrecao,
  PedidoDeLigacao,
  RecorteDeChamadas,
  ResultadoDaLigacao,
  ResultadoDaCorrecao,
  ResultadoDoAudio,
  ResultadoDoEncerramento,
  ResultadoDoPasso,
  ServicoDeChamadas,
} from '@/chamadas/tipos'

export const FUSO_DA_CONTA = 'America/Sao_Paulo'

export interface RespostasDeChamadas {
  /** Quando presente, o dublê devolve isto e ignora o freio guardado. */
  operacao?: CargaDaOperacao
  /** O freio já puxado quando a tela abre. */
  freio?: FreioPuxado | null
  /** Quando presente, o dublê devolve isto e ignora `discador`. */
  carregarDiscador?: CargaDoDiscador
  discador?: Partial<Discador>
  /** A carga do discador nunca volta, para provar o estado de carregando. */
  discadorPendente?: boolean
  /** Números na lista de não perturbe, em E.164 (passo 3 da guarda). */
  bloqueados?: string[]
  /** A janela da conta, no formato de `account_settings`. */
  janela?: unknown
  /** O fuso de cada telefone, em E.164. Sem entrada, vale o da conta. */
  fusos?: Record<string, string>
  /** O relógio da guarda, em ISO-8601. */
  agora?: () => string
  /** A lista que a assinatura entrega ao abrir. */
  aoVivo?: ChamadaAoVivo[]
  /** A assinatura cai logo ao abrir. */
  aoVivoFalha?: boolean
  /** A assinatura abre e nunca entrega a primeira lista. */
  aoVivoPendente?: boolean
  encerrar?: ResultadoDoEncerramento
  /** Segura a discagem até `liberarDiscagem()`, para provar o estado de espera. */
  segurarDiscagem?: boolean
  /** As fichas por id. Id fora daqui é `nao-encontrada`, como pela RLS. */
  fichas?: Record<string, CargaDaFicha>
  /** A carga da ficha nunca volta, para provar o estado de carregando. */
  fichaPendente?: boolean
  /** Quando presente, `corrigirClassificacao` devolve isto e não grava nada. */
  correcao?: ResultadoDaCorrecao
  /** Segura a correção até `liberarCorrecao()`, para provar o estado de espera. */
  segurarCorrecao?: boolean
  /** O que `call-audio` responde. Sem isto, uma URL assinada de exemplo. */
  audio?: ResultadoDoAudio
  /** As chamadas da conta, que o dublê recorta como a consulta faria. */
  chamadas?: ChamadaDaLista[]
  /** Quando presente, a lista devolve isto e ignora `chamadas`. */
  listarChamadas?: CargaDeChamadas
  /** A carga da lista nunca volta, para provar o estado de carregando. */
  listaPendente?: boolean
  /**
   * O que `estimativa_de_custo` responde. Sem isto, a conta sem ligação
   * medida: a estimativa diz que vem depois da primeira.
   */
  estimativa?: CargaDaEstimativa
  /** O teto da lista. Sem isto, o da consulta de verdade. */
  tetoDaLista?: number
  /**
   * As respostas do ciclo de evolução, na ordem em que os passos as consomem.
   * Fila, e não um valor por passo, porque o ciclo é encadeado: a mesma tela
   * chama analisar, responder e aplicar em sequência, e cada um responde uma
   * coisa diferente.
   */
  passosDaRevisao?: ResultadoDoPasso[]
  /** O passo nunca volta, para provar o estado de espera. */
  revisaoPendente?: boolean
}

export interface ServicoDeChamadasDublado extends ServicoDeChamadas {
  /** Todo pedido que chegou ao "servidor", na ordem. */
  readonly pedidos: PedidoDeLigacao[]
  /** O que a guarda recebeu, na ordem. É o que prova que ela foi consultada. */
  readonly consultasDaGuarda: ChamadaDaGuarda[]
  /** Uma entrada por ligação que saiu, pela chave de idempotência. */
  readonly ligacoes: Map<string, string>
  readonly encerradas: string[]
  readonly paradas: string[]
  readonly retomadas: string[]
  /** Cada pedido a `call-audio`, pela chamada, na ordem. */
  readonly pedidosDeAudio: string[]
  /** Cada recorte que a lista pediu, na ordem. */
  readonly recortesDaLista: RecorteDeChamadas[]
  /** Cada passo do ciclo de evolução que a tela pediu, na ordem. */
  readonly passosPedidos: { acao: string; corpo: Record<string, unknown> }[]
  /** Cada pedido a `corrigir_classificacao`, na ordem, como chegou ao serviço. */
  readonly correcoes: PedidoDeCorrecao[]
  /**
   * Uma escrita posterior da retaguarda (`call-classify`, a finalização) sobre
   * a ficha guardada, passando pela trava da US-129: é o que o banco faria.
   */
  retaguarda(chamadaId: string, mudanca: Partial<FichaDaChamada>): void
  liberarCorrecao(): void
  /** Empurra uma nova lista pela assinatura, sem rede. */
  empurrar(chamadas: ChamadaAoVivo[]): void
  liberarDiscagem(): void
}

export const NUMERO_DE_TESTE = '+5511999990001'
export const LEAD_REAL = { id: 'lead-1', nome: 'Paula Siqueira', telefone: '+5511988887777' }

/**
 * O discador de uma conta nova da F2: portão fechado, um número de teste, um
 * lead real e uma linha de origem.
 */
export function discadorDeExemplo(mudanca: Partial<Discador> = {}): Discador {
  const numerosDeTeste = mudanca.numerosDeTeste ?? [
    { telefone: NUMERO_DE_TESTE, rotulo: 'Celular da Renata' },
  ]
  return {
    portao: {
      realDialing: false,
      primeiraChamadaDeTesteEm: null,
      numerosDeTeste: numerosDeTeste.map((numero) => numero.telefone),
    },
    numerosDeTeste,
    leads: [LEAD_REAL],
    linhas: [{ id: 'l-1', e164: '+551140001234', rotulo: 'Linha comercial' }],
    ...mudanca,
  }
}

/** Uma chamada em curso, começada `segundos` antes de agora. */
export function chamadaAoVivo(
  segundos: number,
  mudanca: Partial<ChamadaAoVivo> = {},
): ChamadaAoVivo {
  return {
    chamadaId: 'ch-1',
    contaId: 'c-1',
    status: 'in_progress',
    proposito: 'discovery',
    leadId: LEAD_REAL.id,
    iniciadaEm: new Date(Date.now() - segundos * 1000).toISOString(),
    duracaoSeg: null,
    ...mudanca,
  }
}

export const CHAMADA_ENCERRADA = '4f1c2a3b-0000-4000-8000-00000000c001'

/**
 * Uma linha da lista: a descoberta encerrada de `fichaDeExemplo`, começada
 * `minutosAtras` antes de agora. A data se ancora no relógio para o filtro de
 * período valer em qualquer dia em que o teste rodar.
 */
export function chamadaDaLista(
  minutosAtras: number,
  mudanca: Partial<ChamadaDaLista> = {},
): ChamadaDaLista {
  return {
    id: CHAMADA_ENCERRADA,
    proposito: 'discovery',
    direcao: 'outbound',
    status: 'ended',
    leadId: LEAD_REAL.id,
    leadNome: LEAD_REAL.nome,
    numero: LEAD_REAL.telefone,
    iniciadaEm: new Date(Date.now() - minutosAtras * 60 * 1000).toISOString(),
    duracaoSeg: 125,
    parcelas: [
      { componente: 'voice', centavos: 35, moeda: 'USD' },
      { componente: 'model', centavos: 12, moeda: 'USD' },
    ],
    motivoDoFim: 'completed',
    nota: null,
    ...mudanca,
  }
}

/**
 * Uma chamada de descoberta encerrada, com os turnos de `call-finalize`: o
 * atendimento às 14:00:00, o aviso de gravação aos 4 segundos, voz e modelo
 * já com preço e a telefonia ainda esperando o dela. A classificação já veio.
 */
export function fichaDeExemplo(mudanca: Partial<FichaDaChamada> = {}): FichaDaChamada {
  return {
    id: CHAMADA_ENCERRADA,
    proposito: 'discovery',
    direcao: 'outbound',
    status: 'ended',
    leadId: LEAD_REAL.id,
    leadNome: LEAD_REAL.nome,
    numeroDeDestino: LEAD_REAL.telefone,
    numeroDeOrigem: '+551140001234',
    iniciadaEm: '2026-09-22T16:59:50.000Z',
    atendidaEm: '2026-09-22T17:00:00.000Z',
    encerradaEm: '2026-09-22T17:02:05.000Z',
    duracaoSeg: 125,
    custoTotalCentavos: 47,
    parcelas: [
      { componente: 'voice', centavos: 35, moeda: 'USD' },
      { componente: 'model', centavos: 12, moeda: 'USD' },
    ],
    turnos: [
      {
        quem: 'agent',
        texto: 'Oi, Paula! Antes da gente começar: essa ligação é gravada, tudo bem?',
        em: '2026-09-22T17:00:04.000Z',
      },
      { quem: 'lead', texto: 'Tudo bem, pode falar.', em: '2026-09-22T17:00:09.000Z' },
      {
        quem: 'agent',
        texto: 'Obrigada pelo seu tempo, até logo.',
        em: '2026-09-22T17:02:01.000Z',
      },
    ],
    ferramentas: [{ ferramenta: 'system:end_call', em: '2026-09-22T17:02:03.000Z', erro: null }],
    motivoDoFim: 'completed',
    atendidaPor: 'human',
    avisoDeGravacaoEm: '2026-09-22T17:00:04.000Z',
    caminhoDaGravacao: `c-1/${CHAMADA_ENCERRADA}.mp3`,
    // Longe no futuro: a gravação continua dentro do prazo em qualquer dia em
    // que o teste rodar.
    gravacaoExpiraEm: '2099-12-21T17:02:05.000Z',
    sentimento: 0.6,
    classificacao: { stage_key: 'qualified', summary: 'Quer ver uma demonstração na semana que vem.' },
    origemDaClassificacao: 'backfill',
    confiancaDaClassificacao: 0.72,
    corrigidaPor: null,
    corrigidaEm: null,
    notaDaAvaliacao: null,
    itensDaAvaliacao: [],
    criteriosDaConta: [],
    etapas: ETAPAS_DE_EXEMPLO.map(({ chave, rotulo }) => ({ chave, rotulo })),
    ...mudanca,
  }
}

/** Quem corrige no dublê: a pessoa da sessão de `equipeDeExemplo`. */
export const QUEM_CORRIGE = 'Renata Alves'

/**
 * A trava de `proteger_classificacao_corrigida` (US-129), sobre a ficha: com a
 * classificação já corrigida por gente, a escrita posterior mantém
 * classificação, fonte, confiança, autor, hora, avaliação e sentimento, e
 * deixa passar o resto. O dublê devolve o que o banco devolveria.
 */
export function aplicarTravaDaCorrecao(
  antes: FichaDaChamada,
  mudanca: Partial<FichaDaChamada>,
): FichaDaChamada {
  const depois = { ...antes, ...mudanca }
  if (antes.origemDaClassificacao !== 'human') return depois
  return {
    ...depois,
    classificacao: antes.classificacao,
    origemDaClassificacao: antes.origemDaClassificacao,
    confiancaDaClassificacao: antes.confiancaDaClassificacao,
    corrigidaPor: antes.corrigidaPor,
    corrigidaEm: antes.corrigidaEm,
    itensDaAvaliacao: antes.itensDaAvaliacao,
    notaDaAvaliacao: antes.notaDaAvaliacao,
    sentimento: antes.sentimento,
  }
}

/**
 * Dublê do serviço de chamadas. A discagem passa por `guardarDiscagem`, o
 * módulo que `call-place` usa para chamar e traduzir a guarda, com uma porta
 * em memória que decide freio, portão, bloqueio e janela na ordem de
 * `guard_dial`. É o que faz a recusa que a tela mostra ser a frase do sistema,
 * e não uma escrita para o teste: o dublê substitui a rede e o banco, e não a
 * decisão nem o texto.
 *
 * O padrão é silencioso na casca: freio solto, nenhuma chamada em curso.
 */
export function criarServicoDeChamadasDublado(
  respostas: RespostasDeChamadas = {},
): ServicoDeChamadasDublado {
  let freio: FreioPuxado | null = respostas.freio ?? null
  const discador = discadorDeExemplo(respostas.discador)
  const bloqueados = new Set(respostas.bloqueados ?? [])
  const agora = respostas.agora ?? (() => new Date().toISOString())

  const pedidos: PedidoDeLigacao[] = []
  const consultasDaGuarda: ChamadaDaGuarda[] = []
  const ligacoes = new Map<string, string>()
  const encerradas: string[] = []
  const paradas: string[] = []
  const retomadas: string[] = []
  const pedidosDeAudio: string[] = []
  const recortesDaLista: RecorteDeChamadas[] = []
  const passosPedidos: { acao: string; corpo: Record<string, unknown> }[] = []
  const correcoes: PedidoDeCorrecao[] = []
  const fichas = new Map<string, CargaDaFicha>(Object.entries(respostas.fichas ?? {}))
  const correcoesSeguradas: (() => void)[] = []
  const ouvintes = new Set<(evento: EventoAoVivo) => void>()
  let aoVivo: ChamadaAoVivo[] = respostas.aoVivo ?? []
  const segurados: (() => void)[] = []

  const porta: PortaDeGuarda = {
    async guardDial(chamada): Promise<RespostaDaGuarda> {
      consultasDaGuarda.push(chamada)
      const telefone = chamada.p_phone_e164
      const negar = (reason: string, dados: Record<string, unknown> | null = null) => ({
        allowed: false,
        reason,
        dados,
        phone_line_id: null,
      })

      if (freio) return negar('dialing_paused')

      const deTeste = discador.portao.numerosDeTeste.includes(telefone)
      if (faltaParaAbrir(discador.portao).length > 0 && !deTeste) {
        return negar('real_dialing_gate', {
          real_dialing: discador.portao.realDialing,
          first_test_call_ok_at: discador.portao.primeiraChamadaDeTesteEm,
        })
      }

      if (bloqueados.has(telefone)) return negar('dnc_active')

      if (respostas.janela !== undefined) {
        const fuso = respostas.fusos?.[telefone] ?? FUSO_DA_CONTA
        if (!dentroDaJanela(respostas.janela, chamada.p_instante, fuso).dentro) {
          return negar('outside_window', { timezone: fuso, window: respostas.janela })
        }
      }

      const linha = discador.linhas[0]
      return {
        allowed: true,
        reason: 'placed',
        dados: { from_number: linha?.e164 ?? null },
        phone_line_id: linha?.id ?? 'l-rodizio',
      }
    },
  }

  const passosDaRevisao = [...(respostas.passosDaRevisao ?? [])]

  /**
   * Registra o passo pedido e devolve a próxima resposta da fila. Fila vazia
   * vira falha genérica, e não uma resposta de sucesso inventada: teste que
   * pede um passo a mais do que o cenário previu precisa falhar, não passar.
   */
  function proximoPasso(
    acao: string,
    corpo: Record<string, unknown>,
  ): Promise<ResultadoDoPasso> {
    passosPedidos.push({ acao, corpo })
    if (respostas.revisaoPendente) return new Promise<ResultadoDoPasso>(() => {})
    const proxima = passosDaRevisao.shift()
    return Promise.resolve(
      proxima ?? { ok: false, mensagem: `o dublê não tem resposta para o passo ${acao}` },
    )
  }

  function avisar(evento: EventoAoVivo) {
    for (const ouvinte of ouvintes) ouvinte(evento)
  }

  return {
    pedidos,
    consultasDaGuarda,
    ligacoes,
    encerradas,
    paradas,
    retomadas,
    pedidosDeAudio,
    recortesDaLista,
    passosPedidos,
    correcoes,

    retaguarda(chamadaId, mudanca) {
      const carga = fichas.get(chamadaId)
      if (!carga?.ok) throw new Error(`o dublê não tem a ficha ${chamadaId}`)
      fichas.set(chamadaId, { ok: true, ficha: aplicarTravaDaCorrecao(carga.ficha, mudanca) })
    },

    liberarCorrecao() {
      for (const soltar of correcoesSeguradas.splice(0)) soltar()
    },

    // O mesmo que `corrigir_classificacao`: motivo vazio e etapa fora do funil
    // são `classificacao-invalida`; aceita, a fonte vira `human`, a confiança
    // some e o autor e a hora ficam gravados.
    async corrigirClassificacao(pedido) {
      correcoes.push(pedido)
      if (respostas.segurarCorrecao) {
        await new Promise<void>((soltar) => correcoesSeguradas.push(soltar))
      }
      if (respostas.correcao) return respostas.correcao
      const carga = fichas.get(pedido.chamadaId)
      if (!carga?.ok) return { ok: false, motivo: 'nao-encontrada' }
      const chave = pedido.classificacao.stage_key
      if (
        pedido.motivo.trim() === '' ||
        (chave !== undefined && !carga.ficha.etapas.some((etapa) => etapa.chave === chave))
      ) {
        return { ok: false, motivo: 'classificacao-invalida' }
      }
      fichas.set(pedido.chamadaId, {
        ok: true,
        ficha: {
          ...carga.ficha,
          classificacao: pedido.classificacao,
          origemDaClassificacao: 'human',
          confiancaDaClassificacao: null,
          corrigidaPor: QUEM_CORRIGE,
          corrigidaEm: agora(),
        },
      })
      return { ok: true }
    },

    // O ciclo de evolução (US-245). Os cinco passos consomem a mesma fila de
    // respostas: o ciclo é encadeado, e é a ordem da fila que descreve o que a
    // borda responderia a cada chamada da tela.
    async analisarChamada(chamadaId) {
      return proximoPasso('analisar', { call_id: chamadaId })
    },
    async responderRevisao(revisaoId, respostasDadas) {
      return proximoPasso('responder', { review_id: revisaoId, answers: respostasDadas })
    },
    async questionarProposta(revisaoId, mudancaId, questionamento) {
      return proximoPasso('questionar', {
        review_id: revisaoId,
        change_id: mudancaId,
        note: questionamento,
      })
    },
    async aplicarRevisao(revisaoId, decisoes) {
      return proximoPasso('aplicar', { review_id: revisaoId, decisions: decisoes })
    },
    async descartarRevisao(revisaoId) {
      return proximoPasso('descartar', { review_id: revisaoId })
    },

    empurrar(chamadas) {
      aoVivo = chamadas
      avisar({ tipo: 'chamadas', chamadas })
    },

    liberarDiscagem() {
      for (const soltar of segurados.splice(0)) soltar()
    },

    async carregarOperacao() {
      if (respostas.operacao) return respostas.operacao
      return { ok: true, contaId: 'c-1', freio }
    },

    async carregarDiscador() {
      if (respostas.discadorPendente) return new Promise<CargaDoDiscador>(() => {})
      if (respostas.carregarDiscador) return respostas.carregarDiscador
      return { ok: true, discador }
    },

    async discar(pedido): Promise<ResultadoDaLigacao> {
      pedidos.push(pedido)
      if (respostas.segurarDiscagem) {
        await new Promise<void>((soltar) => segurados.push(soltar))
      }

      // O único de `(account_id, idempotency_key)`: a mesma chave devolve a
      // ligação que já existe, e nenhuma nova sai (T-07).
      const existente = ligacoes.get(pedido.referencia)
      if (existente) {
        return {
          ok: true,
          estado: 'ja_existia',
          chamadaId: existente,
          mensagem: 'Esta ligação já tinha sido pedida. Nenhuma ligação nova saiu.',
        }
      }

      const decisao = await guardarDiscagem(
        {
          contaId: 'c-1',
          telefone: pedido.telefone,
          leadId: pedido.leadId,
          ator: 'user',
          atorId: 'u-1',
          fonte: 'manual',
          instante: agora(),
          fusoDaConta: FUSO_DA_CONTA,
        },
        porta,
      )

      if (!decisao.ok) {
        return {
          ok: false,
          motivo: decisao.motivo,
          mensagem: decisao.mensagem,
          alternativa: decisao.alternativa,
        }
      }

      const chamadaId = `ch-${ligacoes.size + 1}`
      ligacoes.set(pedido.referencia, chamadaId)
      return {
        ok: true,
        estado: 'discando',
        chamadaId,
        mensagem: 'A ligação foi para a linha e está discando.',
      }
    },

    async encerrar(chamadaId) {
      encerradas.push(chamadaId)
      if (respostas.encerrar) return respostas.encerrar
      return {
        ok: true,
        mensagem:
          'Chamada sendo encerrada. A ficha é atualizada quando a telefonia confirmar o fim.',
      }
    },

    async pararDiscagem(motivo) {
      paradas.push(motivo)
      freio = { em: agora(), por: 'Renata Alves', motivo }
      return {
        ok: true,
        mensagem: 'Discagem parada. Nenhuma ligação nova sai desta conta até alguém retomar.',
      }
    },

    async retomarDiscagem(motivo) {
      retomadas.push(motivo)
      freio = null
      return {
        ok: true,
        mensagem: 'Discagem retomada. A fila volta a ser consumida no próximo minuto.',
      }
    },

    async carregarFicha(chamadaId) {
      if (respostas.fichaPendente) return new Promise<CargaDaFicha>(() => {})
      // `Map`: o id vem da barra de endereço, e `fichas['constructor']` num
      // objeto acharia a função na cadeia de protótipos.
      return fichas.get(chamadaId) ?? { ok: false, motivo: 'nao-encontrada' }
    },

    async pedirAudio(chamadaId) {
      pedidosDeAudio.push(chamadaId)
      return (
        respostas.audio ?? {
          ok: true,
          url: `https://armazenamento.exemplo/recordings/${chamadaId}.mp3?token=assinado`,
          expiraEm: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        }
      )
    },

    async estimarCusto() {
      return (
        respostas.estimativa ?? {
          ok: true,
          estimativa: { ligacoesMedidas: 0, duracaoMediaSeg: null, porLigacao: [], porMinuto: [] },
        }
      )
    },

    async listarChamadas(recorte) {
      recortesDaLista.push(recorte)
      if (respostas.listaPendente) return new Promise<CargaDeChamadas>(() => {})
      if (respostas.listarChamadas) return respostas.listarChamadas
      return {
        ok: true,
        pagina: aplicarRecorte(respostas.chamadas ?? [], recorte, respostas.tetoDaLista),
      }
    },

    assinarAoVivo(aoReceber) {
      ouvintes.add(aoReceber)
      // A primeira lista chega depois de assinar, como pela rede.
      queueMicrotask(() => {
        if (!ouvintes.has(aoReceber) || respostas.aoVivoPendente) return
        aoReceber(
          respostas.aoVivoFalha ? { tipo: 'erro' } : { tipo: 'chamadas', chamadas: aoVivo },
        )
      })
      return () => {
        ouvintes.delete(aoReceber)
      }
    },
  }
}
