// O serviço de especialistas dublado (US-251).
//
// Guarda o cadastro em memória e aplica as mesmas consequências do banco: o
// que se salva volta na próxima carga, e desligar mantém a linha. Sem isso, o
// teste da tela passaria mesmo com a gravação não gravando nada.

import type {
  Bloqueio,
  CargaDaAgenda,
  CargaDosEspecialistas,
  Especialista,
  FaixaSemanal,
  GravacaoDaAgenda,
  GravacaoDoEspecialista,
  MotivoDeFalhaDosEspecialistas,
  PedidoDeBloqueio,
  PedidoDeEspecialista,
  PedidoDeFaixa,
  PreparoDaConexao,
  ServicoDeEspecialistas,
} from '@/especialistas/tipos'

/** O endereço que o dublê devolve quando o Google já verificou o aplicativo. */
export const ENDERECO_DE_AUTORIZACAO = 'https://accounts.google.com/o/oauth2/v2/auth?state=exemplo'

export interface RespostasDeEspecialistas {
  /** O cadastro inicial. Sem isto, a conta começa vazia. */
  especialistas?: Especialista[]
  /** A carga nunca volta, para provar o estado de carregando. */
  pendente?: boolean
  /** Recusa a carga com este motivo, para provar cada frase. */
  falha?: MotivoDeFalhaDosEspecialistas
  /** Recusa a gravação, para provar a negativa por papel. */
  gravacao?: GravacaoDoEspecialista
  /** O fuso da conta. Sem isto, o default de `accounts.timezone`. */
  fusoDaConta?: string
  /** A agenda inicial de cada especialista, pelo id. Sem isto, vazia. */
  agendas?: Record<string, { faixas?: FaixaSemanal[]; bloqueios?: Bloqueio[] }>
  /** A carga da agenda nunca volta, para provar o estado de carregando. */
  agendaPendente?: boolean
  /** Recusa a carga da agenda com este motivo. */
  falhaDaAgenda?: MotivoDeFalhaDosEspecialistas
  /** Recusa toda escrita na agenda, para provar a recusa da RLS virando frase. */
  gravacaoDaAgenda?: GravacaoDaAgenda
  /**
   * O que `calendar-connect` responde. Função para mudar entre a sondagem e o
   * clique. Sem isto, o endereço de autorização.
   */
  preparo?: PreparoDaConexao | ((vez: number) => PreparoDaConexao)
  /** A sondagem nunca volta, para provar o estado de consulta. */
  preparoPendente?: boolean
  /** Recusa a desconexão com este resultado. */
  desconexao?: GravacaoDoEspecialista
  /** Recusa a gravação do endereço iCal com este resultado. */
  enderecoIcal?: GravacaoDoEspecialista
}

/** Cada escrita na agenda, na ordem. É o que prova o que foi ao banco. */
export type EscritaDaAgenda =
  | { tipo: 'acrescentarFaixa'; pedido: PedidoDeFaixa }
  | { tipo: 'removerFaixa'; id: string }
  | { tipo: 'acrescentarBloqueio'; pedido: PedidoDeBloqueio }
  | { tipo: 'removerBloqueio'; id: string }

export interface ServicoDeEspecialistasDublado extends ServicoDeEspecialistas {
  /** Todo pedido gravado, na ordem. É o que prova o que foi ao banco. */
  readonly gravados: PedidoDeEspecialista[]
  /** Cada ligar/desligar, na ordem. */
  readonly alternados: { id: string; ativo: boolean }[]
  /** Cada escrita na agenda, inclusive as que o banco recusou. */
  readonly escritasDaAgenda: EscritaDaAgenda[]
  /** Cada pergunta a `calendar-connect`, pelo especialista. */
  readonly preparos: string[]
  /** Cada desconexão pedida, inclusive as recusadas. */
  readonly desconexoes: string[]
  /** Cada endereço iCal pedido, inclusive os recusados. */
  readonly enderecosIcal: { especialistaId: string; endereco: string }[]
}

export function especialistaDeExemplo(mudanca: Partial<Especialista> = {}): Especialista {
  return {
    id: 'especialista-1',
    nome: 'Marina Duarte',
    area: 'Frotas pesadas',
    fuso: 'America/Sao_Paulo',
    modalidades: ['video'],
    duracaoPadraoMin: 30,
    tetoDiario: 6,
    antecedenciaMinimaMin: 120,
    antecedenciaMaximaDias: 30,
    sala: 'https://meet.exemplo.com/marina',
    email: 'marina@empresa.com.br',
    ativo: true,
    ultimoAtendimentoEm: null,
    calendario: { estado: 'desconectado' },
    ...mudanca,
  }
}

export function criarServicoDeEspecialistasDublado(
  respostas: RespostasDeEspecialistas = {},
): ServicoDeEspecialistasDublado {
  const gravados: PedidoDeEspecialista[] = []
  const alternados: { id: string; ativo: boolean }[] = []
  const escritasDaAgenda: EscritaDaAgenda[] = []
  const preparos: string[] = []
  const desconexoes: string[] = []
  const enderecosIcal: { especialistaId: string; endereco: string }[] = []
  let cadastro: Especialista[] = [...(respostas.especialistas ?? [])]
  // Faixas e bloqueios de todos, com o dono ao lado, como nas tabelas.
  let faixas: (FaixaSemanal & { especialistaId: string })[] = []
  let bloqueios: (Bloqueio & { especialistaId: string })[] = []
  for (const [especialistaId, agenda] of Object.entries(respostas.agendas ?? {})) {
    faixas.push(...(agenda.faixas ?? []).map((faixa) => ({ ...faixa, especialistaId })))
    bloqueios.push(...(agenda.bloqueios ?? []).map((bloqueio) => ({ ...bloqueio, especialistaId })))
  }
  let proximoId = 1
  const semDono = <T extends { especialistaId: string }>(linha: T): Omit<T, 'especialistaId'> => {
    const copia: Partial<T> = { ...linha }
    delete copia.especialistaId
    return copia as Omit<T, 'especialistaId'>
  }

  return {
    gravados,
    alternados,
    escritasDaAgenda,
    preparos,
    desconexoes,
    enderecosIcal,

    async carregar(): Promise<CargaDosEspecialistas> {
      if (respostas.pendente) return new Promise<CargaDosEspecialistas>(() => {})
      if (respostas.falha) return { ok: false, motivo: respostas.falha }
      // Ativos primeiro, como a consulta ordena.
      const ordenado = [...cadastro].sort((a, b) => Number(b.ativo) - Number(a.ativo))
      return {
        ok: true,
        especialistas: ordenado,
        fusoDaConta: respostas.fusoDaConta ?? 'America/Sao_Paulo',
      }
    },

    async salvar(pedido): Promise<GravacaoDoEspecialista> {
      gravados.push(pedido)
      if (respostas.gravacao && !respostas.gravacao.ok) return respostas.gravacao

      const anterior = cadastro.find((item) => item.id === pedido.id)
      const linha: Especialista = {
        id: pedido.id ?? `especialista-${cadastro.length + 1}`,
        nome: pedido.nome.trim(),
        area: pedido.area?.trim() || null,
        fuso: pedido.fuso,
        modalidades: pedido.modalidades,
        duracaoPadraoMin: pedido.duracaoPadraoMin,
        tetoDiario: pedido.tetoDiario,
        antecedenciaMinimaMin: pedido.antecedenciaMinimaMin,
        antecedenciaMaximaDias: pedido.antecedenciaMaximaDias,
        sala: pedido.sala?.trim() || null,
        email: pedido.email.trim(),
        ativo: pedido.ativo,
        // O carimbo do rodízio é do servidor: a tela nunca o escreve.
        ultimoAtendimentoEm: anterior?.ultimoAtendimentoEm ?? null,
        // O calendário é do OAuth, e não do cadastro: salvar não o toca.
        calendario: anterior?.calendario ?? { estado: 'desconectado' },
      }

      cadastro = pedido.id
        ? cadastro.map((item) => (item.id === pedido.id ? linha : item))
        : [linha, ...cadastro]
      return { ok: true }
    },

    async alternarAtivo(id, ativo): Promise<GravacaoDoEspecialista> {
      alternados.push({ id, ativo })
      if (respostas.gravacao && !respostas.gravacao.ok) return respostas.gravacao
      // Desligar mantém a linha: o histórico das reuniões depende dela.
      cadastro = cadastro.map((item) => (item.id === id ? { ...item, ativo } : item))
      return { ok: true }
    },

    async carregarAgenda(especialistaId): Promise<CargaDaAgenda> {
      if (respostas.agendaPendente) return new Promise<CargaDaAgenda>(() => {})
      if (respostas.falhaDaAgenda) return { ok: false, motivo: respostas.falhaDaAgenda }
      return {
        ok: true,
        faixas: faixas.filter((faixa) => faixa.especialistaId === especialistaId).map(semDono),
        bloqueios: bloqueios
          .filter((bloqueio) => bloqueio.especialistaId === especialistaId)
          .map(semDono),
      }
    },

    // As recusas abaixo são as do banco, na mesma ordem: sem elas, a tela
    // passaria no teste com o check e o único da tabela esquecidos.
    async acrescentarFaixa(pedido): Promise<GravacaoDaAgenda> {
      escritasDaAgenda.push({ tipo: 'acrescentarFaixa', pedido })
      if (respostas.gravacaoDaAgenda) return respostas.gravacaoDaAgenda
      if (pedido.fim <= pedido.inicio) return { ok: false, motivo: 'ordem-invertida' }
      const repetida = faixas.some(
        (faixa) =>
          faixa.especialistaId === pedido.especialistaId &&
          faixa.diaDaSemana === pedido.diaDaSemana &&
          faixa.inicio === pedido.inicio,
      )
      if (repetida) return { ok: false, motivo: 'faixa-repetida' }
      faixas = [...faixas, { id: `faixa-${proximoId++}`, ...pedido }]
      return { ok: true }
    },

    async removerFaixa(id): Promise<GravacaoDaAgenda> {
      escritasDaAgenda.push({ tipo: 'removerFaixa', id })
      if (respostas.gravacaoDaAgenda) return respostas.gravacaoDaAgenda
      faixas = faixas.filter((faixa) => faixa.id !== id)
      return { ok: true }
    },

    async acrescentarBloqueio(pedido): Promise<GravacaoDaAgenda> {
      escritasDaAgenda.push({ tipo: 'acrescentarBloqueio', pedido })
      if (respostas.gravacaoDaAgenda) return respostas.gravacaoDaAgenda
      // A restrição de exclusão da tabela, `[)`: o encostado convive.
      const conflito = bloqueios.find(
        (bloqueio) =>
          bloqueio.especialistaId === pedido.especialistaId &&
          Date.parse(bloqueio.inicio) < Date.parse(pedido.fim) &&
          Date.parse(pedido.inicio) < Date.parse(bloqueio.fim),
      )
      if (conflito) return { ok: false, motivo: 'bloqueio-sobreposto', conflito: semDono(conflito) }
      bloqueios = [...bloqueios, { id: `bloqueio-${proximoId++}`, ...pedido }]
      return { ok: true }
    },

    async removerBloqueio(id): Promise<GravacaoDaAgenda> {
      escritasDaAgenda.push({ tipo: 'removerBloqueio', id })
      if (respostas.gravacaoDaAgenda) return respostas.gravacaoDaAgenda
      bloqueios = bloqueios.filter((bloqueio) => bloqueio.id !== id)
      return { ok: true }
    },

    async prepararConexaoDoCalendario(especialistaId): Promise<PreparoDaConexao> {
      preparos.push(especialistaId)
      if (respostas.preparoPendente) return new Promise<PreparoDaConexao>(() => {})
      const preparo = respostas.preparo
      if (typeof preparo === 'function') return preparo(preparos.length)
      return preparo ?? { resultado: 'autorizar', url: ENDERECO_DE_AUTORIZACAO }
    },

    async desconectarCalendario(especialistaId): Promise<GravacaoDoEspecialista> {
      desconexoes.push(especialistaId)
      if (respostas.desconexao && !respostas.desconexao.ok) return respostas.desconexao
      // Apagar o vínculo é o que a próxima carga vê: sem calendário.
      cadastro = cadastro.map((item) =>
        item.id === especialistaId ? { ...item, calendario: { estado: 'desconectado' } } : item,
      )
      return { ok: true }
    },

    async conectarCalendarioIcal(especialistaId, endereco): Promise<GravacaoDoEspecialista> {
      enderecosIcal.push({ especialistaId, endereco })
      if (respostas.enderecoIcal && !respostas.enderecoIcal.ok) return respostas.enderecoIcal
      // Gravado, a próxima carga vê o calendário por endereço à espera da
      // primeira leitura da rotina.
      cadastro = cadastro.map((item) =>
        item.id === especialistaId
          ? { ...item, calendario: { estado: 'conectado', provedor: 'ical', sincronizadoEm: null } }
          : item,
      )
      return { ok: true }
    },
  }
}
