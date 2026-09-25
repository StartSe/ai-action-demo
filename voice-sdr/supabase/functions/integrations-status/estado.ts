// integrations-status: o estado real de cada provedor da conta.
//
// Responde a uma pergunta que a tela de integrações faz antes de qualquer
// tentativa de ligar: este provedor tem chave, a chave vale, sobra saldo e
// sobra capacidade? (docs/PRD-implementacao.md seção 4.4, L-20, RNF-13.)
//
// Três regras seguram o arquivo:
//
// 1. **O valor da credencial não sai.** Ele é resolvido aqui, entregue à sonda
//    e descartado. `conferirQueNaoVazou` é a rede de segurança: se um valor
//    aparecer no corpo montado, o pedido inteiro vira `falha_interna` em vez de
//    ser respondido.
// 2. **Código bruto de provedor não sai.** `erros.ts` traduz; o código morre
//    lá dentro. Quem administra a conta lê o que fazer, não `invalid_api_key`.
// 3. **Falta de chave e falha do provedor são coisas diferentes**, e falha da
//    chave e falha do provedor também. Daí os quatro estados, e não dois.
//
// Tudo aqui é portável: nenhuma referência a Deno, nenhum import de rede. A
// camada de dados entra por `PortaDeIntegracoes`, dublada no teste e
// implementada em `index.ts` sobre o Supabase e sobre as APIs dos provedores.

import type { OrigemDoSegredo, ResolucaoDeSegredo } from '../_shared/secrets.ts'

import { eFalhaDoProvedor, traduzirErroDoProvedor } from '../_shared/provedor/erros.ts'
import { conferirQueNaoVazou } from '../_shared/provedor/vazamento.ts'
import {
  PROVEDORES,
  provedorPorId,
  rotuloDaChave,
  type Provedor,
  type ProvedorId,
} from './provedores.ts'
import {
  MENSAGENS,
  STATUS,
  mensagemDaFalha,
  type MotivoDaFalha,
  type MotivoLocal,
} from './respostas.ts'

/**
 * `conectado`: a chave existe e o provedor confirmou.
 * `nao_configurado`: falta chave, ou a única que há é da plataforma e esta
 *   conta não pode usá-la.
 * `erro`: a chave existe e o provedor a recusou, ou a conta lá está sem saldo.
 *   Pede ação de quem administra.
 * `indisponivel`: o provedor não respondeu ou está fora do ar. Não pede ação
 *   nenhuma, só que se teste de novo depois.
 *
 * `testando` não está aqui de propósito: é estado da tela enquanto o pedido
 * viaja, não estado que o servidor observe.
 */
export type EstadoDaIntegracao = 'conectado' | 'nao_configurado' | 'erro' | 'indisponivel'

/** Saldo restante no provedor, como ele o reporta. */
export interface CreditoDoProvedor {
  readonly restante: number
  /** Nulo quando o provedor não expõe o total contratado. */
  readonly total?: number | null
  readonly unidade?: string
}

/** Limite de capacidade: sessões simultâneas na voz, canais na telefonia. */
export interface CotaDoProvedor {
  readonly rotulo: string
  readonly emUso: number
  readonly limite: number
}

export interface Credito {
  readonly restante: number
  readonly total: number | null
  readonly unidade: string
  /** Menos de um décimo do total, ou nada. A tela avisa antes de acabar. */
  readonly baixo: boolean
}

export interface Cota {
  readonly rotulo: string
  readonly emUso: number
  readonly limite: number
  readonly esgotada: boolean
}

/** O que a sonda de cada provedor devolve. Não levanta: falha vira `ok: false`. */
export interface RespostaDaSonda {
  readonly ok: boolean
  /** Código do provedor. Lido por `erros.ts` e descartado ali. */
  readonly codigo?: string | null
  readonly status?: number | null
  readonly credito?: CreditoDoProvedor | null
  readonly cota?: CotaDoProvedor | null
}

export interface UsuarioDaSessao {
  readonly id: string
}

/**
 * O que basta para medir os provedores de uma conta: credencial e sonda. É a
 * metade da porta que `cron-credit-watch` também implementa, para a rotina ler
 * o estado pelo mesmo caminho da tela em vez de sondar por conta própria.
 */
export interface PortaDeSondagem {
  /** Cascata de `_shared/secrets.ts`. Nunca resolvida à mão nesta função. */
  credencial(contaId: string, provedor: ProvedorId, chave: string): Promise<ResolucaoDeSegredo>
  /** Bate na API do provedor com as credenciais já resolvidas. */
  sondar(
    provedor: ProvedorId,
    credenciais: Readonly<Record<string, string>>,
  ): Promise<RespostaDaSonda>
}

/**
 * A camada de dados, em quatro operações. O teste a dubla; `index.ts` a
 * implementa sobre o cliente do Supabase e sobre as APIs dos provedores.
 */
export interface PortaDeIntegracoes extends PortaDeSondagem {
  /** Usuário dono deste JWT, ou null quando o token não vale mais. */
  usuarioDaSessao(jwt: string): Promise<UsuarioDaSessao | null>
  /** Papel do usuário na conta, ou null quando ele não é membro dela. */
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
}

export interface FalhaDaIntegracao {
  readonly motivo: MotivoDaFalha
  readonly mensagem: string
}

/**
 * Uma chave que o provedor exige, como a tela precisa dela: nome técnico (o
 * mesmo do cofre), rótulo em português e se já há valor resolvido. A tela
 * desenha um campo por entrada daqui em vez de guardar um catálogo próprio —
 * chave nova no provedor nasce com campo, sem tocar na interface.
 *
 * `preenchida` diz que existe valor, nunca qual: o valor não sai desta função.
 */
export interface ChaveDoProvedor {
  readonly nome: string
  readonly rotulo: string
  readonly preenchida: boolean
}

export interface EstadoDoProvedor {
  readonly provedor: ProvedorId
  readonly rotulo: string
  readonly fornecedor: string
  readonly estado: EstadoDaIntegracao
  /** Todas as chaves exigidas foram resolvidas. */
  readonly configurado: boolean
  /** O provedor respondeu e aceitou a chave. */
  readonly conectado: boolean
  readonly credito: Credito | null
  readonly cota: Cota | null
  readonly erro: FalhaDaIntegracao | null
  /** Todas as chaves exigidas, com rótulo e se já há valor. */
  readonly chaves: readonly ChaveDoProvedor[]
  /** Chaves que faltam cadastrar. Vazia quando está tudo lá. */
  readonly chavesFaltando: readonly string[]
  /** Para onde mandar quem precisa resolver. Vai sempre, inclusive conectado. */
  readonly caminhoDeConfiguracao: string
  /** O que fica bloqueado enquanto este provedor não estiver conectado. */
  readonly bloqueia: string
  /** De que degrau da cascata a credencial veio. Null quando não há credencial. */
  readonly origem: OrigemDoSegredo | null
}

export interface CorpoDoEstado {
  readonly ok: true
  readonly contaId: string
  readonly verificadoEm: string
  readonly provedores: readonly EstadoDoProvedor[]
}

export interface CorpoDeRecusa {
  readonly ok: false
  readonly motivo: MotivoLocal
  readonly mensagem: string
}

export interface RespostaDeEstado {
  readonly status: number
  readonly corpo: CorpoDoEstado | CorpoDeRecusa
}

export interface PedidoDeEstado {
  readonly metodo: string
  readonly contaId: unknown
  /** Cabeçalho Authorization, quando houver. */
  readonly autorizacao: string | null
  /** Recorte da consulta: só estes provedores. Ausente ou vazio significa todos. */
  readonly provedores?: unknown
}

export interface OpcoesDoEstado {
  /** Relógio injetável: o teste fixa o instante em vez de esperar por ele. */
  readonly agora?: () => Date
}

const PREFIXO_BEARER = /^bearer\s+(.+)$/i
const METODOS = new Set(['GET', 'POST'])

/** Abaixo disto o crédito vira aviso na tela, antes de acabar. */
export const FRACAO_DE_CREDITO_BAIXO = 0.1

/**
 * Resolve o pedido inteiro. Devolve sempre status e corpo em português, nunca
 * levanta: exceção da camada de dados vira `falha_interna`, porque a tela
 * precisa de uma frase e não de um stack trace.
 */
export async function consultarIntegracoes(
  pedido: PedidoDeEstado,
  porta: PortaDeIntegracoes,
  opcoes: OpcoesDoEstado = {},
): Promise<RespostaDeEstado> {
  if (!METODOS.has(pedido.metodo.toUpperCase())) return recusa('metodo_invalido')

  const contaId = typeof pedido.contaId === 'string' ? pedido.contaId.trim() : ''
  if (!contaId) return recusa('conta_ausente')

  const escolhidos = normalizarEscolha(pedido.provedores)
  if (escolhidos === 'desconhecido') return recusa('provedor_desconhecido')

  const jwt = extrairJwt(pedido.autorizacao)
  if (!jwt) return recusa('sem_sessao')

  try {
    const usuario = await porta.usuarioDaSessao(jwt)
    if (!usuario) return recusa('sessao_invalida')

    // Membro, qualquer papel: ver o estado é leitura, e operador precisa saber
    // por que a Sarah não liga tanto quanto o dono precisa.
    const papel = await porta.papelNaConta(contaId, usuario.id)
    if (!papel) return recusa('sem_acesso')

    const { provedores, valores } = await medirProvedores(contaId, porta, escolhidos)

    const agora = opcoes.agora ?? (() => new Date())
    const corpo: CorpoDoEstado = {
      ok: true,
      contaId,
      verificadoEm: agora().toISOString(),
      provedores,
    }

    // Rede de segurança do "o valor nunca sai": um rótulo de cota ecoado pelo
    // provedor bastaria para furar a regra em silêncio, e aí o pedido inteiro
    // vira `falha_interna` em vez de ser respondido.
    conferirQueNaoVazou(
      corpo,
      valores,
      'o estado das integrações carregava o valor de uma credencial',
    )
    return { status: 200, corpo }
  } catch {
    return recusa('falha_interna')
  }
}

/** O estado medido de cada provedor, e os valores resolvidos no caminho. */
export interface MedicaoDosProvedores {
  readonly provedores: readonly EstadoDoProvedor[]
  /**
   * Os valores de credencial resolvidos. Existem só para a conferência de
   * vazamento de quem montar um corpo com o estado; nada os escreve.
   */
  readonly valores: readonly string[]
}

/**
 * Mede os provedores de uma conta, sem sessão: quem confere o acesso é quem
 * chama. A tela passa por `consultarIntegracoes`, que confere membro antes; a
 * rotina de crédito chama direto, com a chave de serviço. As duas leem o mesmo
 * estado, e é por isso que o aviso não diverge do cartão.
 */
export async function medirProvedores(
  contaId: string,
  porta: PortaDeSondagem,
  escolhidos: readonly Provedor[] = PROVEDORES,
): Promise<MedicaoDosProvedores> {
  const valores: string[] = []
  const provedores: EstadoDoProvedor[] = []
  for (const provedor of escolhidos) {
    provedores.push(await estadoDoProvedor(contaId, provedor, porta, valores))
  }
  return { provedores, valores }
}

/** O JWT do cabeçalho `Authorization: Bearer <jwt>`, ou null. */
export function extrairJwt(autorizacao: string | null): string | null {
  const achado = PREFIXO_BEARER.exec(autorizacao?.trim() ?? '')
  return achado?.[1]?.trim() || null
}

/**
 * Resolve as chaves de um provedor e, quando estão todas lá, pergunta a ele.
 * Os valores resolvidos são acumulados em `valores` só para a conferência
 * final; nada os escreve no corpo.
 */
async function estadoDoProvedor(
  contaId: string,
  provedor: Provedor,
  porta: PortaDeSondagem,
  valores: string[],
): Promise<EstadoDoProvedor> {
  const credenciais: Record<string, string> = {}
  const faltando: string[] = []
  const origens: OrigemDoSegredo[] = []
  let bloqueada = false

  for (const chave of provedor.chaves) {
    const resolucao = await porta.credencial(contaId, provedor.id, chave)
    if (resolucao.ok) {
      credenciais[chave] = resolucao.valor
      origens.push(resolucao.origem)
      valores.push(resolucao.valor)
      continue
    }
    if (resolucao.motivo === 'plataforma_bloqueada') bloqueada = true
    faltando.push(chave)
  }

  if (faltando.length > 0) {
    // Bloqueio da plataforma tem precedência sobre chave faltando: o caminho
    // para sair dele é outro, e a frase precisa ser a dele.
    const motivo: MotivoDaFalha = bloqueada
      ? 'plataforma_bloqueada'
      : faltando.length === provedor.chaves.length
        ? 'sem_chave'
        : 'chave_incompleta'
    return semChave(provedor, motivo, faltando)
  }

  const resposta = await sondarComSeguranca(porta, provedor.id, credenciais)
  const origem = origemMaisArriscada(origens)

  if (!resposta.ok) {
    const { motivo, mensagem } = traduzirErroDoProvedor(resposta.codigo, resposta.status)
    return {
      ...base(provedor),
      estado: eFalhaDoProvedor(motivo) ? 'indisponivel' : 'erro',
      configurado: true,
      conectado: false,
      credito: null,
      cota: null,
      erro: { motivo, mensagem },
      chaves: chavesDo(provedor, []),
      chavesFaltando: [],
      origem,
    }
  }

  const credito = lerCredito(resposta.credito)
  const cota = lerCota(resposta.cota)

  // Saldo zerado com chave válida ainda é uma integração que não opera. Dizer
  // "conectado" aqui seria verdade técnica e mentira prática.
  const semSaldo = credito !== null && credito.restante <= 0
  const erro: FalhaDaIntegracao | null = semSaldo
    ? { motivo: 'sem_credito', mensagem: mensagemDaFalha('sem_credito') }
    : null

  return {
    ...base(provedor),
    estado: semSaldo ? 'erro' : 'conectado',
    configurado: true,
    // Cota esgotada não derruba a conexão: é capacidade momentânea, e a tela
    // mostra o número em vez de acusar falha.
    conectado: !semSaldo,
    credito,
    cota,
    erro,
    chaves: chavesDo(provedor, []),
    chavesFaltando: [],
    origem,
  }
}

/** A sonda não deve levantar; se levantar, o provedor conta como sem resposta. */
async function sondarComSeguranca(
  porta: PortaDeSondagem,
  provedor: ProvedorId,
  credenciais: Readonly<Record<string, string>>,
): Promise<RespostaDaSonda> {
  try {
    return await porta.sondar(provedor, credenciais)
  } catch {
    return { ok: false, codigo: 'timeout' }
  }
}

function semChave(
  provedor: Provedor,
  motivo: MotivoDaFalha,
  faltando: readonly string[],
): EstadoDoProvedor {
  return {
    ...base(provedor),
    estado: 'nao_configurado',
    configurado: false,
    conectado: false,
    credito: null,
    cota: null,
    erro: {
      motivo,
      mensagem: mensagemDaFalha(
        motivo,
        faltando.map((chave) => rotuloDaChave(provedor, chave)),
      ),
    },
    chaves: chavesDo(provedor, faltando),
    chavesFaltando: faltando,
    origem: null,
  }
}

/** As chaves exigidas do provedor, marcando as que já têm valor resolvido. */
function chavesDo(provedor: Provedor, faltando: readonly string[]): readonly ChaveDoProvedor[] {
  return provedor.chaves.map((nome) => ({
    nome,
    rotulo: rotuloDaChave(provedor, nome),
    preenchida: !faltando.includes(nome),
  }))
}

function base(provedor: Provedor) {
  return {
    provedor: provedor.id,
    rotulo: provedor.rotulo,
    fornecedor: provedor.fornecedor,
    caminhoDeConfiguracao: provedor.caminhoDeConfiguracao,
    bloqueia: provedor.bloqueia,
  } as const
}

function lerCredito(bruto: CreditoDoProvedor | null | undefined): Credito | null {
  if (!bruto || !Number.isFinite(bruto.restante)) return null
  const total = typeof bruto.total === 'number' && Number.isFinite(bruto.total) ? bruto.total : null
  const baixo = bruto.restante <= 0 || (total !== null && total > 0 && bruto.restante / total < FRACAO_DE_CREDITO_BAIXO)
  return {
    restante: bruto.restante,
    total,
    unidade: bruto.unidade?.trim() || 'créditos',
    baixo,
  }
}

function lerCota(bruto: CotaDoProvedor | null | undefined): Cota | null {
  if (!bruto || !Number.isFinite(bruto.emUso) || !Number.isFinite(bruto.limite)) return null
  return {
    rotulo: bruto.rotulo,
    emUso: bruto.emUso,
    limite: bruto.limite,
    esgotada: bruto.limite > 0 && bruto.emUso >= bruto.limite,
  }
}

/**
 * De onde a credencial veio, quando os degraus divergem entre as chaves do
 * mesmo provedor. Reporta o mais arriscado: se uma das chaves é da
 * plataforma, é isso que a auditoria e a tela precisam ver.
 */
function origemMaisArriscada(origens: readonly OrigemDoSegredo[]): OrigemDoSegredo | null {
  if (origens.includes('plataforma')) return 'plataforma'
  if (origens.includes('recurso')) return 'recurso'
  return origens[0] ?? null
}

/** Nenhum provedor, ou os pedidos; `desconhecido` quando um id não existe. */
function normalizarEscolha(pedidos: unknown): readonly Provedor[] | 'desconhecido' {
  if (pedidos === undefined || pedidos === null) return PROVEDORES

  const lista = (Array.isArray(pedidos) ? pedidos : [pedidos])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item !== '')

  if (lista.length === 0) return PROVEDORES

  const escolhidos: Provedor[] = []
  for (const id of lista) {
    const provedor = provedorPorId(id)
    if (!provedor) return 'desconhecido'
    if (!escolhidos.includes(provedor)) escolhidos.push(provedor)
  }
  return escolhidos
}

function recusa(motivo: MotivoLocal): RespostaDeEstado {
  return {
    status: STATUS[motivo],
    corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] },
  }
}
