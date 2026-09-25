// O contrato das reuniões para a interface (US-179, RF-510).
//
// A agenda e a lista leem da visão `reunioes_reais`, que é `meetings` sem a
// reunião marcada num ensaio (T-16). O estado do evento no calendário e o do
// convite de cada lado chegam crus, como o banco os guarda: quem decide o que
// é "desistiu" são os módulos da borda (`eventoDesistiu`, `situacaoDoConvite`),
// importados por `@compartilhado/`, e nunca uma comparação escrita na tela.

import type { EntregaDoConvite } from '@compartilhado/agenda/convite-de-reuniao.ts'

import type { Modalidade } from '@/especialistas/tipos'

export const ESTADOS_DA_REUNIAO = [
  'scheduled',
  'confirmed',
  'rescheduled',
  'canceled',
  'attended',
  'no_show',
] as const

export type EstadoDaReuniao = (typeof ESTADOS_DA_REUNIAO)[number]

/**
 * `meetings.attestation_status`. `pending` é a reunião que ninguém apurou, e
 * a tela a mostra como não apurada, jamais como falta (RF-516). `unattested`
 * é da apuração por e-mail da F6, quando nenhuma fonte respondeu.
 */
export type ApuracaoDaReuniao = 'pending' | 'attested' | 'unattested'

/** Os três desfechos que alguém marca à mão (RF-512). */
export const DESFECHOS_MANUAIS = ['attended', 'no_show', 'canceled'] as const

export type DesfechoManual = (typeof DESFECHOS_MANUAIS)[number]

/**
 * De onde a reunião veio. `ensaio` só existe no dublê e na regra: no banco, a
 * visão já a tirou, e a consulta nunca a recebe.
 */
export type OrigemDaReuniao = 'ligacao' | 'manual' | 'ensaio'

export interface ReuniaoDaLista {
  id: string
  inicio: string
  fim: string
  modalidade: Modalidade
  estado: EstadoDaReuniao
  apuracao: ApuracaoDaReuniao
  origem: OrigemDaReuniao
  /** A ligação em que a Sarah marcou (`booked_call_id`), para o link da ficha (T-23). */
  chamadaDaMarcacao: string | null
  lead: { id: string; nome: string; temEmail: boolean }
  especialista: { id: string; nome: string; fuso: string }
  evento: { externoId: string | null; tentativas: number }
  conviteDoLead: EntregaDoConvite
  conviteDoEspecialista: EntregaDoConvite
}

/** O que o seletor de especialista e a agenda precisam, antes do recorte. */
export interface EspecialistaDaAgenda {
  id: string
  nome: string
  fuso: string
  ativo: boolean
}

export type MotivoDeFalhaDasReunioes =
  | 'sem-permissao'
  | 'sem-conta'
  | 'falha-de-comunicacao'
  | 'filtro-invalido'

export type ContextoDasReunioes =
  | {
      ok: true
      fusoDaConta: string
      especialistas: readonly EspecialistaDaAgenda[]
    }
  | { ok: false; motivo: MotivoDeFalhaDasReunioes }

/**
 * O recorte que o serviço aplica. Os instantes são ISO: a busca guarda o
 * período por nome, e o recorte guarda onde ele começa e acaba no relógio.
 */
export interface RecorteDeReunioes {
  /** Início incluído. */
  desde?: string
  /** Fim excluído. */
  ate?: string
  especialistaId?: string
  estado?: EstadoDaReuniao
  modalidade?: Modalidade
  /** Do mais cedo para o mais tarde, ou o contrário (período passado). */
  crescente: boolean
  /** As origens que a lista mostra. O ensaio fica de fora (T-16). */
  origens: readonly OrigemDaReuniao[]
}

export interface PaginaDeReunioes {
  reunioes: readonly ReuniaoDaLista[]
  /** Havia mais do que o teto: a tela avisa, em vez de cortar calada. */
  truncada: boolean
  /** A conta tem alguma reunião, fora de qualquer recorte: decide qual vazio. */
  contaTemReuniao: boolean
}

export type CargaDeReunioes =
  | { ok: true; pagina: PaginaDeReunioes }
  | { ok: false; motivo: MotivoDeFalhaDasReunioes }

/** Uma das duas ligações do histórico, quando ela ainda existe (T-23). */
export interface ChamadaDaReuniao {
  id: string
  iniciadaEm: string
}

/**
 * A ficha da reunião (US-180, RF-511): a linha da lista mais o que só a ficha
 * desenha. O resumo de passagem chega cru, como o banco o guarda: ele ainda
 * não tem forma fixa, e quem o parte em blocos é `resumo-de-passagem.ts`.
 */
export interface FichaDaReuniao extends ReuniaoDaLista {
  fusoDaConta: string
  /** `leads.timezone`, ou o da conta quando o lead não tem. */
  fusoDoLead: string
  lead: ReuniaoDaLista['lead'] & {
    email: string | null
    telefone: string | null
    empresa: string | null
  }
  /** `specialists.room_url`. */
  sala: string | null
  motivoDoCancelamento: string | null
  notas: string | null
  resumoDePassagem: unknown
  marcadaEm: string
  confirmadaEm: string | null
  /** A ligação de confirmação (`confirmed_call_id`). */
  chamadaDaConfirmacao: string | null
  /** As duas ligações, só as que a leitura achou: sem ela, o histórico não liga. */
  chamadas: readonly ChamadaDaReuniao[]
  evento: ReuniaoDaLista['evento'] & { erro: string | null; proximaTentativa: string | null }
  /** As marcações do desfecho, da mais antiga para a mais recente. */
  marcacoes: readonly MarcacaoDoDesfecho[]
}

export interface PedidoDeDesfecho {
  reuniaoId: string
  desfecho: DesfechoManual
  motivo: string | null
  /** A pessoa confirmou que troca um desfecho já apurado. */
  sobrescrever: boolean
}

/** Os códigos de `marcar_desfecho_da_reuniao`, na grafia da interface. */
export type MotivoDeRecusaDoDesfecho =
  | 'ja-apurada'
  | 'motivo-obrigatorio'
  | 'sem-papel'
  | 'nao-encontrada'
  | 'desfecho-desconhecido'
  | 'falha-de-comunicacao'

export type ResultadoDoDesfecho = { ok: true } | { ok: false; motivo: MotivoDeRecusaDoDesfecho }

/**
 * Uma marcação do desfecho, lida da trilha de auditoria. Quando a segunda
 * sobrescreve a primeira, as duas aparecem, cada uma com autor e hora.
 */
export interface MarcacaoDoDesfecho {
  instante: string
  /** Nulo quando quem marcou foi uma rotina do servidor. */
  autorId: string | null
  desfecho: EstadoDaReuniao
  motivo: string | null
  /** A marcação trocou um desfecho que já estava apurado. */
  sobrescreveu: boolean
}

export type MotivoDeFalhaDaFicha = Exclude<MotivoDeFalhaDasReunioes, 'filtro-invalido'> | 'nao-encontrada'

export type CargaDaFicha =
  | { ok: true; ficha: FichaDaReuniao }
  | { ok: false; motivo: MotivoDeFalhaDaFicha }

export interface ServicoDeReunioes {
  carregarContexto(): Promise<ContextoDasReunioes>
  listarReunioes(recorte: RecorteDeReunioes): Promise<CargaDeReunioes>
  /**
   * Uma reunião por id, pela mesma visão da lista. Inexistente, de outra
   * conta e de ensaio dão o mesmo `nao-encontrada`: a RLS e a visão já
   * devolvem zero linha, e distinguir os casos seria oráculo de existência.
   */
  carregarFicha(id: string): Promise<CargaDaFicha>
  /** `marcar_desfecho_da_reuniao`: a única porta do desfecho para gente. */
  marcarDesfecho(pedido: PedidoDeDesfecho): Promise<ResultadoDoDesfecho>
}
