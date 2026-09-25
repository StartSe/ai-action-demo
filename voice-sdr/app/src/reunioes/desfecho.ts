// O desfecho da reunião marcado à mão (US-181, RF-512 e RF-516).
//
// **Nunca há desfecho inferido.** Nada aqui deduz se a reunião aconteceu: a
// reunião que ninguém apurou é `pending`, e a tela a mostra como não apurada,
// jamais como falta, inclusive depois do horário. A apuração por e-mail e a
// pós-reunião são da F6, e chegam pela mesma trilha com `attested_source`
// próprio.
//
// **O histórico das marcações sai da trilha de auditoria.** O RPC
// `marcar_desfecho_da_reuniao` muda a linha, e o gatilho genérico grava uma
// linha de `audit_log` por marcação, com autor, hora, motivo e o antes e o
// depois do que mudou. `attested_at` muda em toda marcação (é `now()`), e é
// por ele que se reconhece a linha. O status só aparece no payload quando
// mudou; quando a marcação repete o status (cancelar de novo com outro
// motivo), ele é o mesmo de depois da marcação seguinte, e por isso a leitura
// anda da mais recente para a mais antiga, partindo do estado atual.

import {
  ESTADOS_DA_REUNIAO,
  type DesfechoManual,
  type EstadoDaReuniao,
  type MarcacaoDoDesfecho,
  type MotivoDeRecusaDoDesfecho,
  type PedidoDeDesfecho,
  type ReuniaoDaLista,
  type ResultadoDoDesfecho,
} from '@/reunioes/tipos'

/** Uma linha de `audit_log` da reunião, como o PostgREST a devolve. */
export interface LinhaDaTrilha {
  actor_id: unknown
  reason: unknown
  payload: unknown
  created_at: unknown
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {}
}

function estado(valor: unknown): EstadoDaReuniao | null {
  return typeof valor === 'string' && (ESTADOS_DA_REUNIAO as readonly string[]).includes(valor)
    ? (valor as EstadoDaReuniao)
    : null
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

/**
 * As marcações do desfecho, da mais antiga para a mais recente. `linhas` são
 * as de `audit_log` da reunião em ordem de criação; `estadoAtual` é o status
 * de agora, que é o ponto de partida da leitura de trás para a frente.
 */
export function marcacoesDaTrilha(
  linhas: readonly LinhaDaTrilha[],
  estadoAtual: EstadoDaReuniao,
): MarcacaoDoDesfecho[] {
  const marcacoes: MarcacaoDoDesfecho[] = []
  let depoisDesta = estadoAtual

  for (let indice = linhas.length - 1; indice >= 0; indice -= 1) {
    const linha = linhas[indice]!
    const payload = objeto(linha.payload)
    const campos = Array.isArray(payload.campos) ? (payload.campos as unknown[]) : []
    const antes = objeto(payload.antes)
    const depois = objeto(payload.depois)
    const mudouOStatus = campos.includes('status')
    const statusDepois = mudouOStatus ? (estado(depois.status) ?? depoisDesta) : depoisDesta

    if (campos.includes('attested_at') && depois.attested_at !== null && depois.attested_at !== undefined) {
      marcacoes.push({
        instante: String(linha.created_at),
        autorId: texto(linha.actor_id),
        desfecho: statusDepois,
        motivo: texto(linha.reason),
        sobrescreveu: antes.attestation_status === 'attested',
      })
    }

    depoisDesta = mudouOStatus ? (estado(antes.status) ?? statusDepois) : statusDepois
  }

  return marcacoes.reverse()
}

/** Cancelar pede motivo; realizada e falta, não. */
export function pedeMotivo(desfecho: DesfechoManual): boolean {
  return desfecho === 'canceled'
}

/**
 * O que falta para o pedido ir ao banco, ou nulo quando ele pode ir. É a
 * mesma regra do RPC, e o RPC continua recusando: esta só evita a ida.
 */
export function problemaDoPedido(pedido: Pick<PedidoDeDesfecho, 'desfecho' | 'motivo'>): 'motivo-obrigatorio' | null {
  return pedeMotivo(pedido.desfecho) && !texto(pedido.motivo) ? 'motivo-obrigatorio' : null
}

/**
 * A reunião que passou do fim e ninguém apurou. É a que a lista mostra como
 * não apurada: o horário passado não a transforma em falta.
 */
export function aguardaApuracao(reuniao: Pick<ReuniaoDaLista, 'fim' | 'apuracao'>, agora: number): boolean {
  return reuniao.apuracao === 'pending' && Date.parse(reuniao.fim) <= agora
}

const CODIGOS: ReadonlyMap<string, ResultadoDoDesfecho> = new Map<string, ResultadoDoDesfecho>([
  ['marcada', { ok: true }],
  ['ja_apurada', { ok: false, motivo: 'ja-apurada' }],
  ['motivo_obrigatorio', { ok: false, motivo: 'motivo-obrigatorio' }],
  ['sem_papel', { ok: false, motivo: 'sem-papel' }],
  ['nao_encontrada', { ok: false, motivo: 'nao-encontrada' }],
  ['desfecho_desconhecido', { ok: false, motivo: 'desfecho-desconhecido' }],
])

/** O código de `marcar_desfecho_da_reuniao` na grafia da interface. Desconhecido é falha. */
export function traduzirCodigoDoDesfecho(codigo: unknown): ResultadoDoDesfecho {
  const falha: MotivoDeRecusaDoDesfecho = 'falha-de-comunicacao'
  return (typeof codigo === 'string' ? CODIGOS.get(codigo) : undefined) ?? { ok: false, motivo: falha }
}
