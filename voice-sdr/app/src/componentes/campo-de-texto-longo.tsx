import { useId, type ComponentPropsWithoutRef, type Ref } from 'react'

type CampoDeTextoLongoProps = {
  rotulo: string
  /** Exemplo real ao lado do rótulo, no lugar de texto de ajuda genérico. */
  exemplo?: string
  /** Uma linha abaixo do campo, dizendo o que ele faz com o que se escreve. */
  apoio?: string
  erro?: string
  ref?: Ref<HTMLTextAreaElement>
} & Omit<ComponentPropsWithoutRef<'textarea'>, 'id' | 'className'>

/**
 * O `Field` da suíte em versão de várias linhas. Mesmo desenho do
 * `CampoDeTexto`: rótulo, exemplo e recusa no mesmo bloco, com a recusa ligada
 * ao campo por `aria-describedby`.
 *
 * Existe separado e não como variante do `CampoDeTexto` porque os atributos são
 * de elementos diferentes (`rows` é do `textarea`, `autoComplete` só faz
 * sentido no `input`), e uma prop `multilinha` faria o tipo aceitar atributo
 * que o elemento escolhido não tem.
 */
export function CampoDeTextoLongo({
  rotulo,
  exemplo,
  apoio,
  erro,
  ref,
  ...atributos
}: CampoDeTextoLongoProps) {
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

      <textarea
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
