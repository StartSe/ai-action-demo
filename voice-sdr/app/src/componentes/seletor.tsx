import type { ReactNode } from 'react'

type SeletorProps = {
  rotulo: string
  valor: string
  aoTrocar: (valor: string) => void
  /** Campo de formulário em leitura, como o `disabled` dos campos de texto. */
  desativado?: boolean
  children: ReactNode
}

/**
 * O `Select` da suíte: rótulo em cima, campo embaixo, na mesma altura dos
 * demais controles de uma barra de filtros.
 *
 * O `aria-label` repete o rótulo de propósito — o `label` envolve o campo e já
 * o nomeia, mas é o `aria-label` que sobrevive quando a barra é desenhada em
 * tela estreita e o rótulo some.
 *
 * A seta é do tema, e não a do sistema: o campo tira a aparência nativa e a
 * seta vem num `svg` decorativo na cor de apoio, por cima do canto direito.
 */
export function Seletor({ rotulo, valor, aoTrocar, desativado = false, children }: SeletorProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-texto-secundario">
        {rotulo}
      </span>
      <span className="relative flex">
        <select
          value={valor}
          aria-label={rotulo}
          disabled={desativado}
          onChange={(evento) => aoTrocar(evento.target.value)}
          className="campo cursor-pointer appearance-none py-2 pr-9 text-[13.5px] disabled:cursor-not-allowed"
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="pointer-events-none absolute top-1/2 right-3 h-3.5 w-3.5 -translate-y-1/2 fill-none stroke-texto-apoio stroke-2"
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </label>
  )
}
