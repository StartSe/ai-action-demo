import type { ReactNode } from 'react'

import { comum } from '@/copy/comum'

type BarraDoTopoProps = {
  /** O rótulo da tela aberta. Sem ele, a barra mostra só a conta. */
  secao?: string
  emailDoUsuario?: string
  aoSair?: () => void
  /**
   * O freio de emergência (RF-011). Mora aqui porque a barra do topo é o
   * único lugar fixo de toda tela: ele precisa estar ao alcance de onde quer
   * que a pessoa esteja quando alguma coisa der errado.
   */
  freio?: ReactNode
}

function iniciaisDe(email: string) {
  return email.trim().slice(0, 2).toUpperCase()
}

/**
 * A barra do topo, translúcida sobre o fundo como a do design system, reduzida
 * ao que sobra depois da barra lateral: onde a pessoa está, à esquerda, e a
 * conta à direita. A navegação continua na barra
 * lateral, porque são vinte e três destinos em três trilhas (ver
 * docs/padrao-de-interface.md seção 6).
 */
export function BarraDoTopo({
  secao,
  emailDoUsuario,
  aoSair,
  freio,
}: BarraDoTopoProps) {
  return (
    <header className="sem-impressao sticky top-0 z-10 flex min-h-[62px] items-center gap-4 border-b border-borda-suave bg-fundo-app/90 px-8 py-2.5 backdrop-blur-[18px] max-md:px-4">
      {secao ? (
        <p className="m-0 min-w-0 truncate text-[13.5px] font-bold tracking-[-0.01em] text-texto-principal">
          {secao}
        </p>
      ) : null}

      {freio ? <div className="ml-auto">{freio}</div> : null}

      {emailDoUsuario ? (
        <div className={`${freio ? '' : 'ml-auto '}flex min-w-0 items-center gap-2.5`}>
          <span
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-selo border border-borda bg-superficie-2 text-[11px] font-extrabold text-texto-secundario"
          >
            {iniciaisDe(emailDoUsuario)}
          </span>
          <span className="val max-w-[24ch] truncate text-[12px] text-texto-apoio max-md:hidden">
            {emailDoUsuario}
          </span>
          <button type="button" onClick={aoSair} className="botao-link">
            {comum.sair}
          </button>
        </div>
      ) : null}
    </header>
  )
}
