import type { ReactNode } from 'react'

type DialogoProps = {
  titulo: string
  /** Uma linha abaixo do título, dizendo o que a confirmação faz. */
  explicacao?: ReactNode
  children?: ReactNode
  confirmar: string
  /** Ação destrutiva usa o botão de perigo, tingido de carmim. */
  tom?: 'primario' | 'perigo'
  cancelar: string
  /** Enquanto a ação viaja, os dois botões ficam fora de alcance. */
  ocupado?: boolean
  /** Falso enquanto falta o que a pergunta pede, como a nota da publicação. */
  podeConfirmar?: boolean
  aoConfirmar: () => void
  aoCancelar: () => void
}

/**
 * A confirmação de uma ação que não dá para desfazer sozinha. Título, o que
 * vai acontecer, o que a tela precisar perguntar e dois botões.
 *
 * Não usa `<dialog>`: `showModal` não existe em jsdom, e a verificação da
 * interface é em jsdom (docs/PRD-implementacao.md seção 9.1). É a mesma razão
 * de `ModalDeFundacao`. O desenho é o dialog do design system: cabeçalho,
 * corpo e rodapé separados por linha, sobre o véu.
 */
export function Dialogo({
  titulo,
  explicacao,
  children,
  confirmar,
  tom = 'primario',
  cancelar,
  ocupado = false,
  podeConfirmar = true,
  aoConfirmar,
  aoCancelar,
}: DialogoProps) {
  return (
    <div className="veu z-50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-do-dialogo"
        className="caixa-de-dialogo flex max-h-full w-full max-w-[520px] flex-col overflow-hidden"
      >
        <div className="border-b border-borda-suave px-6 py-4 max-md:px-5">
          <h2
            id="titulo-do-dialogo"
            className="m-0 text-[17px] font-extrabold tracking-[-0.015em] text-texto-principal"
          >
            {titulo}
          </h2>

          {explicacao ? (
            <div className="mt-1.5 mb-0 max-w-[62ch] text-[13.5px] text-texto-apoio">
              {explicacao}
            </div>
          ) : null}
        </div>

        {children ? (
          <div className="min-h-0 overflow-auto px-6 py-5 max-md:px-5">{children}</div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2.5 border-t border-borda-suave bg-superficie-cartao/50 px-6 py-3.5 max-md:px-5">
          <button
            type="button"
            onClick={aoCancelar}
            disabled={ocupado}
            className="botao-secundario"
          >
            {cancelar}
          </button>
          <button
            type="button"
            onClick={aoConfirmar}
            disabled={ocupado || !podeConfirmar}
            className={tom === 'perigo' ? 'botao-perigo' : 'botao-primario'}
          >
            {confirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
