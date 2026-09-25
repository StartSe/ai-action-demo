const DATA_E_HORA = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

const DATA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })

const HORA = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'medium' })

/** Data e hora no formato brasileiro. String vazia quando não há instante. */
export function formatarInstante(iso: string | null | undefined): string {
  const data = paraData(iso)
  return data ? DATA_E_HORA.format(data) : ''
}

/** Só a data. É o que basta para prazo de convite. */
export function formatarData(iso: string | null | undefined): string {
  const data = paraData(iso)
  return data ? DATA.format(data) : ''
}

/** Hora com segundos. É o que distingue duas ferramentas da mesma conversa. */
export function formatarHora(iso: string | null | undefined): string {
  const data = paraData(iso)
  return data ? HORA.format(data) : ''
}

const RELATIVO = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

/**
 * Quanto tempo faz, em linguagem de gente: "há 5 minutos", "há 3 horas",
 * "ontem". `agora` entra por parâmetro, porque relógio lido no desenho
 * reprova no lint e torna o teste dependente da hora em que roda.
 */
export function formatarRelativo(iso: string | null | undefined, agora: number): string {
  const data = paraData(iso)
  if (!data) return ''
  const segundos = Math.round((data.getTime() - agora) / 1000)
  const minutos = Math.round(segundos / 60)
  if (Math.abs(minutos) < 1) return RELATIVO.format(0, 'second')
  if (Math.abs(minutos) < 60) return RELATIVO.format(minutos, 'minute')
  const horas = Math.round(minutos / 60)
  if (Math.abs(horas) < 24) return RELATIVO.format(horas, 'hour')
  return RELATIVO.format(Math.round(horas / 24), 'day')
}

function paraData(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const data = new Date(iso)
  return Number.isNaN(data.getTime()) ? null : data
}
