import type {
  AcaoRegistrada,
  ConsultaDeAuditoria,
  Periodo,
} from '@/auditoria/tipos'

/** Os períodos que a tela oferece, na ordem em que aparecem no seletor. */
export const PERIODOS: readonly Periodo[] = ['tudo', '24h', '7d', '30d']

/** Os verbos que o gatilho grava, na ordem em que aparecem no seletor. */
export const ACOES: readonly AcaoRegistrada[] = ['insert', 'update', 'delete']

const HORA = 60 * 60 * 1000

const JANELA: Record<Exclude<Periodo, 'tudo'>, number> = {
  '24h': 24 * HORA,
  '7d': 7 * 24 * HORA,
  '30d': 30 * 24 * HORA,
}

/**
 * O instante a partir do qual o período vale, em ISO 8601, ou `undefined`
 * quando o recorte é tudo. O relógio entra por parâmetro para o teste poder
 * fixá-lo, como no cofre de credenciais.
 */
export function inicioDoPeriodo(
  periodo: Periodo | undefined,
  agora: () => number = Date.now,
): string | undefined {
  if (!periodo || periodo === 'tudo') return undefined
  return new Date(agora() - JANELA[periodo]).toISOString()
}

/**
 * Se a consulta recorta alguma coisa. É o que decide qual estado vazio a tela
 * mostra: sem filtro, a conta nunca registrou nada; com filtro, o recorte é
 * que não achou.
 */
export function temFiltro(consulta: ConsultaDeAuditoria): boolean {
  return Boolean(
    consulta.autor || consulta.acao || (consulta.periodo && consulta.periodo !== 'tudo'),
  )
}

/** Valor do seletor no formulário; `''` é a opção "qualquer". */
export function paraAcao(valor: string): AcaoRegistrada | undefined {
  return ACOES.find((acao) => acao === valor)
}

export function paraPeriodo(valor: string): Periodo {
  return PERIODOS.find((periodo) => periodo === valor) ?? 'tudo'
}
