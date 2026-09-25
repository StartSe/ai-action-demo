import type { ReactNode } from 'react'

type PainelProps = {
  /** Âncora para link direto ao cartão, como `/config/integracoes#telefonia`. */
  id?: string
  /**
   * Nome acessível do cartão. Só passe quando o cartão for um destino em si:
   * com ele a seção vira `role="region"`, e uma tela cheia de regiões sem
   * necessidade atrapalha quem navega por marcos.
   */
  rotulo?: string
  titulo?: string
  /** Uma linha abaixo do título. */
  apoio?: string
  /** Canto superior direito, normalmente um `Selo`. */
  estado?: ReactNode
  /** Linha acima do título, em caixa alta pequena. */
  sobretitulo?: ReactNode
  children: ReactNode
}

/**
 * O cartão (card do design system) que agrupa um assunto. Título curto, uma linha
 * de apoio e o conteúdo. O selo de estado fica no canto, alinhado ao título.
 */
export function Painel({
  id,
  rotulo,
  titulo,
  apoio,
  estado,
  sobretitulo,
  children,
}: PainelProps) {
  const temCabecalho = Boolean(titulo || apoio || estado || sobretitulo)

  return (
    <section
      id={id}
      aria-label={rotulo}
      className="cartao px-6 py-5 max-md:px-4 max-md:py-4"
    >
      {temCabecalho ? (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {sobretitulo ? (
              <p className="sobretitulo m-0 mb-1">{sobretitulo}</p>
            ) : null}
            {titulo ? (
              <h2 className="m-0 text-[17px] font-extrabold tracking-[-0.02em] text-texto-principal">
                {titulo}
              </h2>
            ) : null}
            {apoio ? (
              <p className="mt-1 mb-0 max-w-[62ch] text-[13.5px] text-texto-apoio">
                {apoio}
              </p>
            ) : null}
          </div>
          {estado ? <div className="shrink-0">{estado}</div> : null}
        </header>
      ) : null}

      {children}
    </section>
  )
}
