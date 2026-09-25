import { atenderReset, type PermissaoDaInstalacao, type PortaDoReset } from '@reset/reset.ts'

import { LIMIARES_PADRAO, type LimiaresDaFila } from '@/conta/limiares'
import type {
  CargaDosLimiares,
  EspecialistaDoRoteamento,
  GravacaoDoRoteamento,
  GravacaoDosLimiares,
  MotivoDeFalhaDoRoteamento,
  MotivoDeFalhaDosLimiares,
  ResultadoDoReset,
  RoteamentoDaConta,
  ServicoDaConta,
} from '@/conta/tipos'

export interface RespostasDaConta {
  /** O que `SARAH_PERMITE_ZERAR_AMBIENTE` diz. Padrão: `sim`. */
  permissao?: PermissaoDaInstalacao
  /** Quantas contas a instalação tem, para o reset sem a variável. Padrão: 1. */
  contasDaInstalacao?: number
  /** O papel de quem pede. */
  papel?: string
  /** A linha de `account_settings`; `null` é a conta sem linha. Padrão: os padrões. */
  limiares?: LimiaresDaFila | null
  /** A carga dos limiares falha com este motivo. */
  falhaNosLimiares?: MotivoDeFalhaDosLimiares
  /** A carga dos limiares nunca responde: o estado de espera da tela. */
  limiaresPendentes?: boolean
  /** A linha de `account_settings`; `null` é a conta sem linha. Padrão: `area`. */
  roteamento?: RoteamentoDaConta | null
  /**
   * O nome da conta, que o tutorial usa como empresa (D-10). Padrão: nulo, e
   * o campo da empresa nasce vazio em todo teste que não fala disso.
   */
  nomeDaConta?: string | null
  /** Os especialistas da conta. Padrão: `especialistasDeExemplo()`. */
  especialistas?: EspecialistaDoRoteamento[]
  /** A carga do roteamento falha com este motivo. */
  falhaNaCarga?: MotivoDeFalhaDoRoteamento
  /** A carga do roteamento nunca responde: o estado de espera da tela. */
  cargaPendente?: boolean
}

/** Uma entrada da trilha que o gatilho de auditoria escreveria. */
export interface TrocaDeLimiares {
  antes: LimiaresDaFila
  depois: LimiaresDaFila
}

/** Uma entrada da trilha que o gatilho de auditoria escreveria. */
export interface TrocaDeRoteamento {
  antes: RoteamentoDaConta
  depois: RoteamentoDaConta
}

export interface ServicoDaContaDublado extends ServicoDaConta {
  /** Cada confirmação que a tela mandou, na ordem. */
  readonly pedidosDeReset: string[]
  /** Quantas vezes o banco foi zerado de fato. */
  zerados(): number
  /** Cada pedido de gravação dos limiares, na ordem, aceito ou não. */
  readonly pedidosDeLimiares: LimiaresDaFila[]
  /** O que o gatilho de auditoria gravou: as trocas aceitas. */
  readonly trilhaDosLimiares: TrocaDeLimiares[]
  /** Cada pedido de gravação do roteamento, na ordem, aceito ou não. */
  readonly pedidosDeRoteamento: RoteamentoDaConta[]
  /** O que o gatilho de auditoria gravou: só as trocas aceitas que mudaram algo. */
  readonly trilhaDoRoteamento: TrocaDeRoteamento[]
  /** Os especialistas "no banco". O teste pode desativar um no meio. */
  readonly especialistas: EspecialistaDoRoteamento[]
}

/** Dois ativos com área, um sem área e uma inativa. */
export function especialistasDeExemplo(): EspecialistaDoRoteamento[] {
  return [
    { id: 'esp-ana', nome: 'Ana Ribeiro', area: 'Frota', ativo: true },
    { id: 'esp-bruno', nome: 'Bruno Tavares', area: 'Seguros', ativo: true },
    { id: 'esp-carla', nome: 'Carla Menezes', area: null, ativo: true },
    { id: 'esp-davi', nome: 'Davi Lopes', area: 'Frota', ativo: false },
  ]
}

const PAPEIS_QUE_ESCREVEM = new Set(['owner', 'admin'])

/**
 * Os `check` de `account_settings`, escritos à parte da tela de propósito:
 * reusar `validarLimiares` aqui faria a recusa do banco sumir junto com a da
 * tela numa sabotagem.
 */
function foraDoDominioNoBanco(limiares: LimiaresDaFila): boolean {
  return (
    !(limiares.pisoDeSentimento >= -1 && limiares.pisoDeSentimento <= 1) ||
    !(limiares.tetoDeFalhas > 0) ||
    !(limiares.tetoDeCriterios > 0) ||
    (limiares.avisoDeCreditoCentavos !== null && !(limiares.avisoDeCreditoCentavos > 0))
  )
}

/**
 * As duas linhas do banco, escritas à parte da tela de propósito: o check
 * `account_settings_destino_do_modo` e o gatilho `guardar_destino_do_roteamento`.
 * Reusar a validação da tela aqui faria a recusa do banco sumir junto com a
 * da tela numa sabotagem.
 */
function recusaDoBanco(
  gravado: RoteamentoDaConta,
  pedido: RoteamentoDaConta,
  especialistas: readonly EspecialistaDoRoteamento[],
): MotivoDeFalhaDoRoteamento | null {
  if (pedido.especialistaFixoId !== null && pedido.especialistaFixoId !== gravado.especialistaFixoId) {
    const destino = especialistas.find((item) => item.id === pedido.especialistaFixoId)
    if (!destino) return 'especialista-de-outra-conta'
    if (!destino.ativo) return 'especialista-inativo'
  }
  if ((pedido.modo === 'fixed') !== (pedido.especialistaFixoId !== null)) {
    return 'fixo-sem-especialista'
  }
  return null
}

/**
 * O dublê passa o pedido por `atenderReset`, o mesmo código da borda: as
 * travas (instalação, papel, confirmação) que a tela mostra são as do sistema.
 */
export function criarServicoDaContaDublado(respostas: RespostasDaConta = {}): ServicoDaContaDublado {
  const pedidosDeReset: string[] = []
  let zerados = 0
  const pedidosDeLimiares: LimiaresDaFila[] = []
  const trilhaDosLimiares: TrocaDeLimiares[] = []
  let limiares = respostas.limiares === undefined ? { ...LIMIARES_PADRAO } : respostas.limiares
  const pedidosDeRoteamento: RoteamentoDaConta[] = []
  const trilhaDoRoteamento: TrocaDeRoteamento[] = []
  const especialistas = respostas.especialistas ?? especialistasDeExemplo()
  let roteamento: RoteamentoDaConta | null =
    respostas.roteamento === undefined
      ? { modo: 'area', especialistaFixoId: null }
      : respostas.roteamento

  const porta: PortaDoReset = {
    usuarioDaSessao: async () => ({ id: 'u-1' }),
    papelNaConta: async () => respostas.papel ?? 'owner',
    contasDaInstalacao: async () => respostas.contasDaInstalacao ?? 1,
    agentesPublicados: async () => [{ contaId: 'c-1', agenteId: 'ag-1' }],
    apagarAgente: async () => true,
    zerar: async () => {
      zerados += 1
      return { contas: 1, usuarios: 1 }
    },
  }

  return {
    pedidosDeReset,
    zerados: () => zerados,
    pedidosDeLimiares,
    trilhaDosLimiares,
    async carregarLimiares(): Promise<CargaDosLimiares> {
      if (respostas.limiaresPendentes) return new Promise<never>(() => {})
      if (respostas.falhaNosLimiares) return { ok: false, motivo: respostas.falhaNosLimiares }
      return { ok: true, limiares: limiares ? { ...limiares } : null }
    },
    async definirLimiares(pedido): Promise<GravacaoDosLimiares> {
      pedidosDeLimiares.push({ ...pedido })
      // A política de admin: a RLS recusa em silêncio, e o serviço traduz.
      if (!PAPEIS_QUE_ESCREVEM.has(respostas.papel ?? 'owner')) {
        return { ok: false, motivo: 'sem-permissao' }
      }
      if (!limiares) return { ok: false, motivo: 'sem-permissao' }
      if (foraDoDominioNoBanco(pedido)) return { ok: false, motivo: 'fora-do-dominio' }
      trilhaDosLimiares.push({ antes: limiares, depois: { ...pedido } })
      limiares = { ...pedido }
      return { ok: true, limiares: { ...limiares } }
    },
    pedidosDeRoteamento,
    trilhaDoRoteamento,
    especialistas,
    async carregarRoteamento() {
      if (respostas.cargaPendente) return new Promise(() => {})
      if (respostas.falhaNaCarga) return { ok: false, motivo: respostas.falhaNaCarga }
      return {
        ok: true,
        roteamento: roteamento ? { ...roteamento } : null,
        especialistas: especialistas.map((item) => ({ ...item })),
      }
    },
    async definirRoteamento(pedido): Promise<GravacaoDoRoteamento> {
      pedidosDeRoteamento.push({ ...pedido })
      // Sem linha, o `update` não afeta nada: a mesma cara da RLS que nega.
      if (!roteamento || !PAPEIS_QUE_ESCREVEM.has(respostas.papel ?? 'owner')) {
        return { ok: false, motivo: 'sem-permissao' }
      }
      const recusa = recusaDoBanco(roteamento, pedido, especialistas)
      if (recusa) return { ok: false, motivo: recusa }
      const antes = roteamento
      roteamento = { modo: pedido.modo, especialistaFixoId: pedido.especialistaFixoId }
      if (antes.modo !== roteamento.modo || antes.especialistaFixoId !== roteamento.especialistaFixoId) {
        trilhaDoRoteamento.push({ antes, depois: { ...roteamento } })
      }
      return { ok: true, roteamento: { ...roteamento } }
    },
    async carregarNomeDaConta() {
      return respostas.nomeDaConta ?? null
    },
    async zerarAmbiente(confirmacao): Promise<ResultadoDoReset> {
      pedidosDeReset.push(confirmacao)
      const resposta = await atenderReset(
        {
          metodo: 'POST',
          autorizacao: 'Bearer dublê',
          contaId: 'c-1',
          confirmacao,
          permissao: respostas.permissao ?? 'sim',
        },
        porta,
      )
      return resposta.corpo.ok
        ? {
            ok: true,
            agentesApagados: resposta.corpo.agentesApagados,
            agentesQueFicaram: resposta.corpo.agentesQueFicaram,
          }
        : { ok: false, mensagem: resposta.corpo.mensagem }
    },
  }
}
