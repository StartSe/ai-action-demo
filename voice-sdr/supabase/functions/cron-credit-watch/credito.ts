// cron-credit-watch: aviso de crédito e de cota (seção 4.6, RF-612, L-24).
//
// Roda a cada 15 minutos, dentro do envelope das rotinas, e avisa quem
// administra a conta antes de o crédito do provedor acabar. Crédito zerado no
// meio de uma campanha é ligação perdida sem explicação.
//
// **O estado vem de integrations-status, não de sonda própria.** A rotina
// chama `medirProvedores`, a mesma medição que desenha o cartão da tela, com as
// sondas de `integrations-status/sondas.ts`. Catálogo de provedor é dado:
// provedor novo em `provedores.ts` nasce vigiado. Duas sondas para o mesmo
// saldo fariam o aviso dizer uma coisa e o cartão outra.
//
// **Quando avisa.** Crédito: com `account_settings.credit_alert_cents`
// preenchido, e só então (nulo é "sem aviso", como diz a coluna). Saldo em
// moeda (unidade de três letras, `USD`) se compara em centavos com o limiar;
// crédito em outra unidade (caracteres da voz) não se compara com centavos, e
// usa a regra do cartão, `credito.baixo` (menos de um décimo do total). Cota:
// sempre que o provedor a informa e o uso passa de `LIMIAR_DA_COTA`.
//
// **`indisponivel` não avisa nem rearma.** Provedor que não respondeu não é
// provedor sem saldo, e também não é provedor com saldo de volta. Confundir o
// primeiro par treina quem administra a ignorar o aviso; confundir o segundo
// faria uma queda do provedor rearmar o aviso e repeti-lo quando ele voltasse.
// O mesmo vale para `erro` sem crédito lido (chave recusada): o cartão já diz o
// que fazer, e não há número para comparar.
//
// **Conta sem nada configurado fica em silêncio.** Quem ainda não cadastrou
// provedor nenhum não tem crédito para acabar, e o checklist da configuração
// inicial já aponta o que falta. A rotina nem lê os avisos abertos dela.
//
// **Um aviso por queda.** O aviso fica aberto em `provider_alerts` até o
// provedor voltar acima do limiar; enquanto está aberto, a passagem seguinte
// não escreve nada. O estado é do servidor: a rotina lê os avisos abertos da
// conta antes de decidir, e o único parcial `provider_alerts_um_aberto` é a
// rede quando duas passagens decidem juntas (`abrir_aviso_de_provedor` devolve
// falso para a segunda).
//
// **O item na fila de exceções não entra (L-24).** `exception_items` é F4. Em
// F2 o aviso é a linha de `provider_alerts` e a passagem é a linha de
// `job_runs` do envelope. `PortaDoVigia.abrirExcecao` é o ponto de extensão:
// membro opcional, chamado só quando existe e só para aviso que acabou de
// abrir. Implementá-lo agora seria escrever numa tabela que não existe.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados entra por
// `PortaDoVigia`, e a medição por `PortaDeSondagem`.

import { conferirQueNaoVazou } from '../_shared/provedor/vazamento.ts'
import {
  executarRotina,
  type ItemDaRotina,
  type PortaDeExecucao,
  type ResultadoDaExecucao,
} from '../_shared/rotinas/execucao.ts'
import { segredoDaRotinaConfere } from '../_shared/rotinas/portao.ts'
import {
  medirProvedores,
  type EstadoDoProvedor,
  type PortaDeSondagem,
} from '../integrations-status/estado.ts'
import type { ProvedorId } from '../integrations-status/provedores.ts'

/** O nome da rotina na seção 4.6 e em `job_runs.routine`. */
export const NOME_DA_ROTINA = 'cron-credit-watch'

/**
 * Fração da cota em uso a partir da qual a conta é avisada. Nove décimos, e
 * não o limite cheio: no limite a ligação nova já está esperando vaga, e o
 * aviso existe para chegar antes disso.
 */
export const LIMIAR_DA_COTA = 0.9

/** Os tipos de `provider_alerts.kind`, na lista do check. */
export type TipoDoAviso = 'credito' | 'cota'

/** Uma linha de `reivindicar_vigia_de_credito`. */
export interface ContaVigiada {
  readonly account_id: string
  /** Nulo é conta sem aviso de crédito. A cota é vigiada assim mesmo. */
  readonly credit_alert_cents: number | null
}

/** Um aviso aberto (`rearmed_at` nulo) em `provider_alerts`. */
export interface AvisoAberto {
  readonly provider: ProvedorId
  readonly kind: TipoDoAviso
}

/** O aviso que vai para `abrir_aviso_de_provedor`. */
export interface AvisoNovo {
  readonly account_id: string
  readonly provider: ProvedorId
  readonly kind: TipoDoAviso
  readonly message: string
  readonly observed: Readonly<Record<string, unknown>>
}

export interface PortaDoVigia {
  /** `reivindicar_vigia_de_credito`: `for no key update skip locked`, grava `provider_watch`. */
  reivindicarContas(limite: number, instante: string): Promise<readonly ContaVigiada[]>
  /** Os avisos abertos da conta. */
  avisosAbertos(contaId: string): Promise<readonly AvisoAberto[]>
  /** `abrir_aviso_de_provedor`. Falso quando já havia aviso aberto (a rede do único). */
  abrirAviso(aviso: AvisoNovo, instante: string): Promise<boolean>
  /** `rearmar_aviso_de_provedor`. Falso quando não havia aviso aberto. */
  rearmarAviso(contaId: string, provedor: ProvedorId, tipo: TipoDoAviso, instante: string): Promise<boolean>
  /**
   * O item na fila de exceções (F4, L-24). Ausente em F2 de propósito: a
   * tabela não existe, e o aviso já está registrado em `provider_alerts`.
   */
  abrirExcecao?(aviso: AvisoNovo): Promise<void>
}

/** O que a leitura de um provedor diz sobre um tipo de aviso. */
export interface Leitura {
  readonly provedor: ProvedorId
  readonly tipo: TipoDoAviso
  /** Abaixo do limiar (crédito) ou acima dele (cota): a condição do aviso. */
  readonly alerta: boolean
  readonly frase: string
  readonly observado: Readonly<Record<string, unknown>>
}

/** O que fazer com os avisos de uma conta depois de medi-la. */
export interface DecisaoDosAvisos {
  readonly abrir: readonly AvisoNovo[]
  readonly rearmar: readonly AvisoAberto[]
}

const MOEDA = /^[A-Z]{3}$/

/**
 * As leituras de um provedor, puras. Provedor sem leitura (indisponível, sem
 * chave, chave recusada, sem número informado) não devolve nada, e nada é o
 * que faz a decisão não abrir nem rearmar.
 */
export function lerProvedor(estado: EstadoDoProvedor, conta: ContaVigiada): readonly Leitura[] {
  if (estado.estado !== 'conectado' && estado.estado !== 'erro') return []

  const leituras: Leitura[] = []
  const nome = `${estado.rotulo} (${estado.fornecedor})`
  const efeito = minusculaInicial(estado.bloqueia)

  const credito = estado.credito
  const limiar = conta.credit_alert_cents
  if (credito !== null && limiar !== null) {
    const unidade = credito.unidade.trim().toUpperCase()
    if (MOEDA.test(unidade)) {
      const centavos = Math.round(credito.restante * 100)
      leituras.push({
        provedor: estado.provedor,
        tipo: 'credito',
        alerta: centavos < limiar,
        frase: `Crédito baixo em ${nome}: restam ${dinheiro(centavos, unidade)}, abaixo do aviso de ${dinheiro(limiar, unidade)}. Quando acabar, ${efeito}`,
        observado: { restante_cents: centavos, unidade, limiar_cents: limiar },
      })
    } else {
      // Caracteres não se comparam com centavos. A regra é a do cartão, para o
      // aviso e a tela dizerem "baixo" no mesmo instante.
      const total = credito.total === null ? '' : ` de ${numero(credito.total)}`
      leituras.push({
        provedor: estado.provedor,
        tipo: 'credito',
        alerta: credito.baixo,
        frase: `Crédito baixo em ${nome}: restam ${numero(credito.restante)}${total} ${credito.unidade}. Quando acabar, ${efeito}`,
        observado: { restante: credito.restante, total: credito.total, unidade: credito.unidade, regra: 'fracao_do_total' },
      })
    }
  }

  const cota = estado.cota
  if (cota !== null && cota.limite > 0) {
    leituras.push({
      provedor: estado.provedor,
      tipo: 'cota',
      alerta: cota.emUso / cota.limite >= LIMIAR_DA_COTA,
      frase: `Cota perto do limite em ${nome}: ${numero(cota.emUso)} de ${numero(cota.limite)} ${cota.rotulo} em uso. Quando esgotar, ${efeito}`,
      observado: { em_uso: cota.emUso, limite: cota.limite, rotulo: cota.rotulo, limiar: LIMIAR_DA_COTA },
    })
  }

  return leituras
}

/**
 * A decisão da conta, pura. Alerta sem aviso aberto abre; sem alerta com aviso
 * aberto rearma; o resto não escreve nada — e é esse "resto" que faz quatro
 * passagens com o crédito baixo darem um aviso só.
 */
export function decidirAvisos(
  conta: ContaVigiada,
  estados: readonly EstadoDoProvedor[],
  abertos: readonly AvisoAberto[],
): DecisaoDosAvisos {
  const aberto = new Set(abertos.map((aviso) => chaveDoAviso(aviso.provider, aviso.kind)))
  const abrir: AvisoNovo[] = []
  const rearmar: AvisoAberto[] = []

  for (const estado of estados) {
    for (const leitura of lerProvedor(estado, conta)) {
      const estaAberto = aberto.has(chaveDoAviso(leitura.provedor, leitura.tipo))
      if (leitura.alerta && !estaAberto) {
        abrir.push({
          account_id: conta.account_id,
          provider: leitura.provedor,
          kind: leitura.tipo,
          message: leitura.frase,
          observed: leitura.observado,
        })
      } else if (!leitura.alerta && estaAberto) {
        rearmar.push({ provider: leitura.provedor, kind: leitura.tipo })
      }
    }
  }
  return { abrir, rearmar }
}

type ItemDoVigia = ItemDaRotina & { readonly conta: ContaVigiada }

export interface PedidoDoVigia {
  readonly porta: PortaDoVigia
  readonly sondagem: PortaDeSondagem
  readonly execucao: PortaDeExecucao
  readonly agora?: () => number
}

/** Uma passagem de `cron-credit-watch`, dentro do envelope das rotinas. */
export function vigiarCredito(pedido: PedidoDoVigia): Promise<ResultadoDaExecucao> {
  const { porta, sondagem } = pedido
  const agora = pedido.agora ?? Date.now

  return executarRotina<ItemDoVigia>({
    nome: NOME_DA_ROTINA,
    porta: pedido.execucao,
    agora,
    trabalho: {
      async reivindicar(limite, instante) {
        const contas = await porta.reivindicarContas(limite, instante)
        return contas.map((conta) => ({ chave: conta.account_id, conta }))
      },
      async processar(item, instante) {
        await vigiarConta(porta, sondagem, item.conta, instante)
      },
    },
  })
}

async function vigiarConta(
  porta: PortaDoVigia,
  sondagem: PortaDeSondagem,
  conta: ContaVigiada,
  instante: string,
) {
  const { provedores, valores } = await medirProvedores(conta.account_id, sondagem)
  if (provedores.every((estado) => estado.estado === 'nao_configurado')) return

  const abertos = await porta.avisosAbertos(conta.account_id)
  const decisao = decidirAvisos(conta, provedores, abertos)

  // O rótulo da cota vem do provedor; ecoado com o valor de uma credencial,
  // ele iria parar numa tabela que todo membro lê. Melhor a passagem falhar.
  conferirQueNaoVazou(decisao, valores, 'o aviso de crédito carregava o valor de uma credencial')

  for (const aviso of decisao.rearmar) {
    await porta.rearmarAviso(conta.account_id, aviso.provider, aviso.kind, instante)
  }
  for (const aviso of decisao.abrir) {
    const abriu = await porta.abrirAviso(aviso, instante)
    if (abriu && porta.abrirExcecao) await porta.abrirExcecao(aviso)
  }
}

function chaveDoAviso(provedor: string, tipo: string): string {
  return `${provedor}:${tipo}`
}

function minusculaInicial(frase: string): string {
  return frase.charAt(0).toLocaleLowerCase('pt-BR') + frase.slice(1)
}

function dinheiro(centavos: number, moeda: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(centavos / 100)
}

function numero(valor: number): string {
  return new Intl.NumberFormat('pt-BR').format(valor)
}

// A borda --------------------------------------------------------------------

export interface PedidoDaRotina {
  readonly metodo: string
  /** O cabeçalho `x-internal-secret`. */
  readonly segredo: string | null
}

export interface RespostaDaRotina {
  readonly status: number
  readonly corpo: Readonly<Record<string, unknown>>
}

/**
 * O que o `index.ts` chama. O segredo é conferido antes de tocar em qualquer
 * porta: sem ele, nem `job_runs` recebe linha.
 */
export async function atenderRotina(
  pedido: PedidoDaRotina,
  vigia: PedidoDoVigia,
  opcoes: { readonly segredoInterno: string },
): Promise<RespostaDaRotina> {
  if (pedido.metodo.toUpperCase() !== 'POST') return { status: 405, corpo: { ok: false } }
  if (!(await segredoDaRotinaConfere(pedido.segredo, opcoes.segredoInterno))) {
    return { status: 401, corpo: { ok: false } }
  }

  const resultado = await vigiarCredito(vigia)
  return { status: resultado.ok ? 200 : 500, corpo: { ...resultado } }
}
