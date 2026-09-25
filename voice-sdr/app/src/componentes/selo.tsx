import type { ReactNode } from 'react'

/**
 * Os tons de estado do design system (badge success, warning, danger, info),
 * mais o acento e o neutro. Cada tom é uma classe de `estilos.css`.
 */
export type TomDoSelo =
  | 'positivo'
  | 'atencao'
  | 'perigo'
  | 'informacao'
  | 'acento'
  | 'neutro'

const CLASSE: Record<TomDoSelo, string> = {
  positivo: 'selo-positivo',
  atencao: 'selo-atencao',
  perigo: 'selo-perigo',
  informacao: 'selo-informacao',
  acento: 'selo-acento',
  neutro: 'selo-neutro',
}

/**
 * O `badge` do design system. Um selo diz em que estado a coisa está, sempre
 * com a palavra escrita: a cor sozinha não informa quem não a distingue.
 */
export function Selo({
  tom = 'neutro',
  children,
}: {
  tom?: TomDoSelo
  children: ReactNode
}) {
  return <span className={`selo ${CLASSE[tom]}`}>{children}</span>
}
