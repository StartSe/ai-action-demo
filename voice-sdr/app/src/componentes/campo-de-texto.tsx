import { useId, type ComponentPropsWithoutRef, type Ref } from 'react'

type CampoDeTextoProps = {
  rotulo: string
  /** Exemplo real ao lado do rótulo, no lugar de texto de ajuda genérico. */
  exemplo?: string
  /** Texto abaixo do campo, ligado a ele por `aria-describedby`. */
  apoio?: string
  erro?: string
  /**
   * Chega ao `input`. Serve a quem precisa mandar o foco para cá: o modal de
   * fundação faz isso ao abrir. Prop comum, sem `forwardRef`, que o React 19
   * dispensa.
   */
  ref?: Ref<HTMLInputElement>
} & Omit<ComponentPropsWithoutRef<'input'>, 'id' | 'className'>

/** O `Field` da suíte, com o rótulo, o exemplo e a recusa no mesmo bloco. */
export function CampoDeTexto({
  rotulo,
  exemplo,
  apoio,
  erro,
  ref,
  ...atributos
}: CampoDeTextoProps) {
  const id = useId()
  const idDoErro = `${id}-erro`
  const idDoApoio = `${id}-apoio`
  const descricao = [erro ? idDoErro : null, apoio ? idDoApoio : null]
    .filter((item) => item !== null)
    .join(' ')

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-semibold">
          {rotulo}
        </label>
        {exemplo ? (
          <span className="val text-[11.5px] text-texto-desativado">
            {exemplo}
          </span>
        ) : null}
      </div>

      <input
        {...atributos}
        ref={ref}
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descricao === '' ? undefined : descricao}
        className={erro ? 'campo-recusado' : 'campo'}
      />

      {erro ? (
        <p id={idDoErro} className="m-0 text-[12.5px] text-perigo">
          {erro}
        </p>
      ) : null}

      {apoio ? (
        <p id={idDoApoio} className="m-0 text-[12.5px] text-texto-apoio">
          {apoio}
        </p>
      ) : null}
    </div>
  )
}
