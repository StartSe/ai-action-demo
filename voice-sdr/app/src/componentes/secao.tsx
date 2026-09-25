import type { ReactNode } from 'react'

/**
 * A `Section` da suíte: um bloco de conteúdo dentro da tela, com o título no
 * acento. Diferente do `Painel`, não desenha cartão: quem desenha é o que vem
 * dentro, que costuma ser uma tabela ou uma lista de cartões.
 */
export function Secao({
  titulo,
  acoes,
  children,
}: {
  titulo: string
  /** Canto superior direito, alinhado ao título. */
  acoes?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mb-7">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="titulo-de-secao m-0">{titulo}</h2>
        {acoes ? <div className="shrink-0">{acoes}</div> : null}
      </div>
      {children}
    </div>
  )
}
