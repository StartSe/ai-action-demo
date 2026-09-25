import type { ReactNode } from 'react'

/** Falha do servidor é vermelho; bloqueio por papel é âmbar, porque tem saída. */
type TomDaCaixa = 'perigo' | 'atencao'

const FUNDO: Record<TomDaCaixa, string> = {
  perigo: 'border-perigo-borda bg-perigo-fundo text-perigo',
  atencao: 'border-atencao-borda bg-atencao-fundo text-atencao',
}

/**
 * O `ErrorBox` da suíte. Caixa com `role="alert"`, para o leitor de tela
 * anunciar assim que ela entra.
 *
 * É um `div` e não um `p` porque a negativa por papel traz uma lista dentro
 * (`src/rotas/config-discagem.tsx`). Quando a mensagem é uma frase só, o
 * `textContent` continua sendo exatamente essa frase: nada de título fixo
 * somado por cima, como faz a suíte, porque aqui cada frase de
 * `copy.falhas` já diz o motivo e a saída.
 */
export function CaixaDeErro({
  tom = 'perigo',
  children,
}: {
  tom?: TomDaCaixa
  children: ReactNode
}) {
  return (
    <div
      role="alert"
      className={`rounded-controle border px-4 py-3 text-[13.5px] ${FUNDO[tom]}`}
    >
      {children}
    </div>
  )
}
