import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { IconeDeNavegacao } from '@/componentes/icone-de-navegacao'
import { MarcaDoProduto } from '@/componentes/marca-do-produto'
import { barraLateral, navegacao } from '@/copy/navegacao'
import { ehItemAtivo } from '@/utilidades/navegacao'

type BarraLateralProps = {
  caminhoAtual: string
  /**
   * O checklist da configuração inicial, quando há pendência. Entra por prop
   * para a barra continuar sendo testável sem provedor nem roteador: quem
   * sabe o estado da conta é a casca.
   */
  checklist?: ReactNode
  /**
   * Quantos itens esperam, por caminho (hoje só `/fila`, D-06). Zero e
   * ausente não desenham nada. Entra por prop pelo mesmo motivo do checklist.
   */
  contagens?: Readonly<Partial<Record<string, number>>>
}

/**
 * A barra lateral do design system: 250px, 220px abaixo de 1100px e, abaixo de
 * 1024px, recolhida em 78px só com os ícones. A largura é a variável
 * `--largura-barra-lateral`, que a casca também lê para abrir espaço ao
 * conteúdo. Recolhida, o nome de cada item sai da vista com `sr-only` e
 * continua sendo o nome do elo; o `title` faz as vezes da dica do design
 * system. O checklist não cabe em 78px e some da barra: a configuração
 * continua a um clique, em `/configuracao-inicial`.
 */
export function BarraLateral({ caminhoAtual, checklist, contagens }: BarraLateralProps) {
  return (
    <nav
      aria-label={barraLateral.rotulo}
      className="sem-impressao fixed inset-y-0 left-0 z-20 flex w-[var(--largura-barra-lateral)] flex-col overflow-y-auto border-r border-borda-suave bg-fundo-app/92 backdrop-blur-[18px]"
    >
      <div className="flex min-h-[62px] items-center px-5 pt-5 pb-3 max-lg:justify-center max-lg:px-2">
        <MarcaDoProduto recolhivel />
      </div>

      {checklist ? <div className="max-lg:hidden">{checklist}</div> : null}

      <div className="flex flex-1 flex-col gap-5 px-3.5 py-4 max-lg:px-2.5">
        {navegacao.trilhas.map((trilha) => (
          <section key={trilha.sigla}>
            <h2 className="sobretitulo m-0 px-2.5 pb-1.5 text-[10.5px] max-lg:sr-only">
              {trilha.sigla}
            </h2>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {trilha.itens.map((item) => {
                const ativo = ehItemAtivo(item.caminho, caminhoAtual)
                const contagem = contagens?.[item.caminho] ?? 0

                // Item anunciado e ainda não construído: texto apagado, sem
                // elo. Um link que não leva a lugar nenhum é pior do que a
                // ausência dele, e esconder o item faria cada tela nova
                // parecer surpresa.
                if (!item.disponivel) {
                  return (
                    <li key={item.caminho}>
                      <span
                        aria-disabled="true"
                        title={item.rotulo}
                        className="flex items-center gap-2.5 rounded-controle px-2.5 py-2 text-[13px] font-medium text-texto-desativado opacity-80 max-lg:justify-center max-lg:py-2.5"
                      >
                        <IconeDeNavegacao caminho={item.caminho} />
                        <span className="min-w-0 flex-1 truncate max-lg:sr-only">
                          {item.rotulo}
                        </span>
                        <span className="text-[10px] tracking-wide uppercase max-lg:sr-only">
                          {barraLateral.emBreve}
                        </span>
                      </span>
                    </li>
                  )
                }

                return (
                  <li key={item.caminho}>
                    {/* `Link` e não `<a>`: navegação no cliente, sem recarregar
                        a aplicação inteira a cada item do menu — o que perdia
                        a sessão em memória e o estado da tela aberta. */}
                    <Link
                      to={item.caminho}
                      title={item.rotulo}
                      aria-current={ativo ? 'page' : undefined}
                      className={`flex items-center gap-2.5 rounded-controle px-2.5 py-2 text-[13px] no-underline transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foco-de-controle max-lg:justify-center max-lg:py-2.5 ${
                        ativo
                          ? 'bg-acento-repouso font-semibold text-acento-tinta shadow-[inset_3px_0_0_var(--acento)]'
                          : 'font-medium text-texto-apoio hover:bg-superficie-2/60 hover:text-texto-principal'
                      }`}
                    >
                      <span className="relative flex shrink-0">
                        <IconeDeNavegacao caminho={item.caminho} />
                        {/* Recolhida, a barra só mostra o ponto sobre o ícone. */}
                        {contagem > 0 ? (
                          <span
                            aria-hidden="true"
                            className="absolute -top-1 -right-1 hidden h-2.5 w-2.5 rounded-full bg-acento max-lg:block"
                          />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate max-lg:sr-only">{item.rotulo}</span>
                      {contagem > 0 ? (
                        <>
                          <span
                            aria-hidden="true"
                            className="val rounded-full bg-acento px-1.5 text-[11px] font-bold text-texto-sobre-acento max-lg:hidden"
                          >
                            {contagem}
                          </span>
                          <span className="sr-only">{`, ${barraLateral.esperando(contagem)}`}</span>
                        </>
                      ) : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  )
}
