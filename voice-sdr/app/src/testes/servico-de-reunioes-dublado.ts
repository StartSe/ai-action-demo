import { aplicarRecorte, ORIGENS_DA_LISTA } from '@/reunioes/consulta'
import type {
  CargaDaFicha,
  CargaDeReunioes,
  ContextoDasReunioes,
  EspecialistaDaAgenda,
  FichaDaReuniao,
  PedidoDeDesfecho,
  RecorteDeReunioes,
  ResultadoDoDesfecho,
  ReuniaoDaLista,
  ServicoDeReunioes,
} from '@/reunioes/tipos'

export const FUSO_DA_CONTA = 'America/Sao_Paulo'

export const ANA: EspecialistaDaAgenda = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  nome: 'Ana Ribeiro',
  fuso: 'America/Sao_Paulo',
  ativo: true,
}

/** Especialista em outro fuso: a agenda mostra o horário dele ao lado. */
export const BRUNO: EspecialistaDaAgenda = {
  id: 'bbbbbbbb-0000-4000-8000-000000000002',
  nome: 'Bruno Tavares',
  fuso: 'America/Manaus',
  ativo: true,
}

export interface RespostasDeReunioes {
  /** Quando presente, o dublê devolve isto e ignora `especialistas`. */
  contexto?: ContextoDasReunioes
  especialistas?: EspecialistaDaAgenda[]
  fusoDaConta?: string
  /** O que o banco guarda, inclusive a reunião de ensaio que a visão tira. */
  reunioes?: ReuniaoDaLista[]
  /** Quando presente, o dublê devolve isto e ignora `reunioes`. */
  listarReunioes?: CargaDeReunioes
  /** A carga da lista nunca volta, para provar o estado de carregando. */
  listaPendente?: boolean
  /** O teto da consulta. Sem isto, o de verdade. */
  teto?: number
  /** As fichas que o banco guarda, inclusive a de ensaio, que a visão tira. */
  fichas?: FichaDaReuniao[]
  /** Quando presente, o dublê devolve isto e ignora `fichas`. */
  carregarFicha?: CargaDaFicha
  /** A ficha nunca volta, para provar o estado de carregando. */
  fichaPendente?: boolean
  /** Quando presente, o dublê devolve isto a toda marcação e não muda nada. */
  marcarDesfecho?: ResultadoDoDesfecho
  /** Quem o dublê grava como autor da marcação. */
  autorDaMarcacao?: string
  /** O instante que o dublê grava na marcação. */
  instanteDaMarcacao?: string
}

export interface ServicoDeReunioesDublado extends ServicoDeReunioes {
  /** Cada recorte que a tela pediu, na ordem. */
  readonly recortes: RecorteDeReunioes[]
  /** Cada id de ficha que a tela pediu, na ordem. */
  readonly fichasPedidas: string[]
  /** Cada marcação do desfecho que chegou ao "banco", na ordem. */
  readonly desfechosPedidos: PedidoDeDesfecho[]
}

const ENTREGA_ENVIADA = {
  enviadoEm: '2026-09-28T12:00:00Z',
  tentativas: 1,
  erro: null,
  proximaTentativa: null,
}

/** Uma reunião ativa, com evento e os dois convites enviados: nada a resolver. */
export function reuniaoDaLista(extras: Partial<ReuniaoDaLista> = {}): ReuniaoDaLista {
  return {
    id: 'r-1',
    inicio: '2026-10-01T17:00:00Z',
    fim: '2026-10-01T17:30:00Z',
    modalidade: 'video',
    estado: 'scheduled',
    apuracao: 'pending',
    origem: 'ligacao',
    chamadaDaMarcacao: 'c-1',
    lead: { id: 'l-1', nome: 'Carla Menezes', temEmail: true },
    especialista: { id: ANA.id, nome: ANA.nome, fuso: ANA.fuso },
    evento: { externoId: 'evt-1', tentativas: 1 },
    conviteDoLead: ENTREGA_ENVIADA,
    conviteDoEspecialista: ENTREGA_ENVIADA,
    ...extras,
  }
}

/**
 * A ficha de uma reunião marcada na ligação `c-1` e confirmada na `c-2`, com
 * resumo de passagem, evento e os dois convites enviados.
 */
export function fichaDaReuniao(extras: Partial<FichaDaReuniao> = {}): FichaDaReuniao {
  const base = reuniaoDaLista()
  return {
    ...base,
    estado: 'confirmed',
    fusoDaConta: FUSO_DA_CONTA,
    fusoDoLead: 'America/Recife',
    lead: {
      ...base.lead,
      email: 'carla@aurora.com.br',
      telefone: '+5581999990000',
      empresa: 'Aurora Logística',
    },
    sala: 'https://meet.example.com/ana-ribeiro',
    motivoDoCancelamento: null,
    notas: null,
    resumoDePassagem: {
      resumo: 'Diretora de operações, quer um piloto no próximo trimestre.',
      dor: 'A fila de atendimento chega a dois dias.',
      objecoes: ['Preço', 'Integração com o CRM próprio'],
    },
    marcadaEm: '2026-09-28T14:05:00Z',
    confirmadaEm: '2026-09-30T13:02:00Z',
    chamadaDaMarcacao: 'c-1',
    chamadaDaConfirmacao: 'c-2',
    chamadas: [
      { id: 'c-1', iniciadaEm: '2026-09-28T14:00:00Z' },
      { id: 'c-2', iniciadaEm: '2026-09-30T13:00:00Z' },
    ],
    evento: { externoId: 'evt-1', tentativas: 1, erro: null, proximaTentativa: null },
    marcacoes: [],
    ...extras,
  }
}

/**
 * O dublê aplica o recorte com o mesmo módulo da tela, inclusive `origens`:
 * é assim que a reunião de ensaio que ele guarda fica fora da lista, como a
 * visão `reunioes_reais` a deixa fora no banco.
 */
export function criarServicoDeReunioesDublado(
  respostas: RespostasDeReunioes = {},
): ServicoDeReunioesDublado {
  const recortes: RecorteDeReunioes[] = []
  const fichasPedidas: string[] = []
  const desfechosPedidos: PedidoDeDesfecho[] = []
  const guardadas = respostas.reunioes ?? []
  const fichas = respostas.fichas ?? []

  return {
    recortes,
    fichasPedidas,
    desfechosPedidos,

    async carregarContexto() {
      if (respostas.contexto) return respostas.contexto
      return {
        ok: true,
        fusoDaConta: respostas.fusoDaConta ?? FUSO_DA_CONTA,
        especialistas: respostas.especialistas ?? [ANA, BRUNO],
      }
    },

    async listarReunioes(recorte) {
      recortes.push(recorte)
      if (respostas.listaPendente) return new Promise<CargaDeReunioes>(() => {})
      if (respostas.listarReunioes) return respostas.listarReunioes
      const pagina = aplicarRecorte(guardadas, recorte, respostas.teto)
      const daConta = guardadas.filter((reuniao) => ORIGENS_DA_LISTA.includes(reuniao.origem))
      return { ok: true, pagina: { ...pagina, contaTemReuniao: daConta.length > 0 } }
    },

    // A ficha de ensaio fica de fora pela mesma regra da lista, como a visão
    // a deixa fora no banco: a tela recebe `nao-encontrada`, igual à de outra
    // conta.
    async carregarFicha(id) {
      fichasPedidas.push(id)
      if (respostas.fichaPendente) return new Promise<CargaDaFicha>(() => {})
      if (respostas.carregarFicha) return respostas.carregarFicha
      const ficha = fichas.find(
        (guardada) => guardada.id === id && ORIGENS_DA_LISTA.includes(guardada.origem),
      )
      return ficha ? { ok: true, ficha: { ...ficha } } : { ok: false, motivo: 'nao-encontrada' }
    },

    // As regras de `marcar_desfecho_da_reuniao`, escritas aqui à parte da
    // tela: reusar a validação dela faria a sabotagem da tela sumir junto com
    // a do banco. A marcação muda a ficha e a linha da lista guardadas, como
    // o update muda a linha que a próxima leitura devolve.
    async marcarDesfecho(pedido) {
      desfechosPedidos.push(pedido)
      if (respostas.marcarDesfecho) return respostas.marcarDesfecho

      const ficha = fichas.find((guardada) => guardada.id === pedido.reuniaoId)
      const daLista = guardadas.find((guardada) => guardada.id === pedido.reuniaoId)
      const atual = ficha ?? daLista
      if (!atual || !ORIGENS_DA_LISTA.includes(atual.origem)) return { ok: false, motivo: 'nao-encontrada' }
      if (pedido.desfecho === 'canceled' && !pedido.motivo?.trim()) return { ok: false, motivo: 'motivo-obrigatorio' }
      if (atual.apuracao === 'attested' && !pedido.sobrescrever) return { ok: false, motivo: 'ja-apurada' }

      // A linha da lista se troca por outra, em vez de mudar no lugar: o
      // objeto antigo é o que a consulta guardou, e mudado no lugar ele faria
      // a releitura parecer igual à anterior.
      const mudanca = { estado: pedido.desfecho, apuracao: 'attested' as const }
      if (daLista) guardadas[guardadas.indexOf(daLista)] = { ...daLista, ...mudanca }
      if (ficha) {
        Object.assign(ficha, mudanca, {
          motivoDoCancelamento: pedido.desfecho === 'canceled' ? pedido.motivo!.trim() : null,
          marcacoes: [
            ...ficha.marcacoes,
            {
              instante: respostas.instanteDaMarcacao ?? '2026-10-01T18:00:00Z',
              autorId: respostas.autorDaMarcacao ?? 'u-1',
              desfecho: pedido.desfecho,
              motivo: pedido.motivo?.trim() || null,
              sobrescreveu: ficha.apuracao === 'attested',
            },
          ],
        })
      }
      return { ok: true }
    },
  }
}
