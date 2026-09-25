import type { ReactNode } from 'react'

import { comum } from '@/copy/comum'
import { MarcaDoProduto } from '@/componentes/marca-do-produto'

/**
 * A moldura das três telas que abrem sem sessão: entrada, recuperação de senha
 * e convite. É o login da seção 11 do design system: uma moldura só, com o
 * painel visual à esquerda (marca, o sinal da IA em repouso e a promessa sobre
 * uma grade que se apaga) e o formulário à direita. No celular o painel visual
 * encolhe e fica em cima.
 *
 * Do painel visual do design system ficaram a marca, o sinal e a frase. Os
 * três números de prova ("248 ligações") não entraram: numa tela sem sessão
 * não há conta para medir, e número inventado na porta de entrada é dado
 * falso.
 */
export function AreaDeAcesso({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1040px] items-center px-5 py-10 max-md:px-4 max-md:py-6">
      <div className="grid w-full overflow-hidden rounded-grande border border-borda-suave bg-superficie-funda shadow-media md:min-h-[600px] md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <aside className="relative flex flex-col justify-between gap-8 overflow-hidden bg-[radial-gradient(circle_at_36%_28%,rgb(52_211_153/0.11),transparent_26%),radial-gradient(circle_at_78%_72%,rgb(255_75_85/0.1),transparent_28%),linear-gradient(160deg,var(--superficie-cartao),var(--fundo-app)_70%)] p-7 max-md:gap-6 max-md:p-5">
          {/* A grade do design system, apagando para baixo. Decorativa. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgb(35_81_81/0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgb(35_81_81/0.1)_1px,transparent_1px)] bg-[length:28px_28px] opacity-60 [mask-image:linear-gradient(180deg,black,transparent_88%)]"
          />

          <div className="relative">
            <MarcaDoProduto />
          </div>

          <div className="relative max-w-[330px]">
            <span aria-hidden="true" className="sinal mb-7 ml-4 block h-[72px] w-[72px] max-md:mb-5 max-md:h-14 max-md:w-14" />
            <p className="m-0 text-[26px] leading-[1.08] font-extrabold tracking-[-0.04em] text-texto-principal max-md:text-[21px]">
              {comum.promessa}.
            </p>
          </div>

          {/* Espaçador que mantém a frase no meio, como no design system. */}
          <div aria-hidden="true" className="max-md:hidden" />
        </aside>

        <section className="flex items-center bg-[image:var(--gradiente-cartao)] px-8 py-9 max-md:px-5 max-md:py-7">
          <div className="mx-auto w-full max-w-[360px]">{children}</div>
        </section>
      </div>
    </main>
  )
}
