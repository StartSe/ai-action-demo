import type { ReactNode } from 'react'

/**
 * A `Row` da suíte: dois campos lado a lado no computador, empilhados no
 * celular. Serve a par que se lê junto, como senha e confirmação.
 */
export function LinhaDeCampos({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1 [&>*]:min-w-0">
      {children}
    </div>
  )
}
