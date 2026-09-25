import { Selo } from '@/componentes/selo'

type CartaoMetricaProps = {
  rotulo: string
  /** O número já formatado. Sem ele, o cartão mostra só a explicação. */
  valor?: string
  /** Texto curto ao lado do número, como "de 10". */
  complemento?: string
  /** Por que não há número, ou de onde ele vem. */
  explicacao?: string
  /** Estado do cartão quando ele não tem número, como "Ainda não apurável". */
  selo?: string
}

/**
 * O indicador do design system (kpi): rótulo em cima, o número em `.val`
 * embaixo. Cartão sem número não fica mudo: diz por quê em `explicacao`, e
 * o `selo` nomeia o estado. `role="group"` com o rótulo, para o leitor de tela
 * e o teste acharem o cartão pelo nome.
 */
export function CartaoMetrica({ rotulo, valor, complemento, explicacao, selo }: CartaoMetricaProps) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className="bloco-secundario flex min-w-0 flex-col gap-2 px-4 py-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rotulo-de-indicador">{rotulo}</span>
        {selo ? <Selo tom="informacao">{selo}</Selo> : null}
      </div>
      {valor !== undefined ? (
        <p className="m-0 flex items-baseline gap-1.5">
          <span className="val valor-de-indicador">{valor}</span>
          {complemento ? (
            <span className="text-[12.5px] text-texto-apoio">{complemento}</span>
          ) : null}
        </p>
      ) : null}
      {explicacao ? (
        <p className="m-0 text-[12.5px] text-texto-apoio">{explicacao}</p>
      ) : null}
    </div>
  )
}
