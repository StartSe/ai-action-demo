import { comum } from '@/copy/comum'

/**
 * A marca: o orbe da Sarah, o mesmo `.sinal` que representa a IA no resto do
 * produto, e o nome do produto ao lado. O orbe é decorativo, porque o nome
 * inteiro está escrito logo em seguida; em repouso, ele só flutua e respira.
 *
 * `recolhivel` é a barra lateral: abaixo de 1024px ela fica só com os ícones,
 * e o nome sai da vista sem sair da árvore de acessibilidade.
 *
 * `centralizada` é a porta de entrada (a fundação): orbe maior, em repouso
 * como o da tela de acesso, e o nome embaixo, no eixo do cartão.
 */
export function MarcaDoProduto({
  recolhivel = false,
  centralizada = false,
}: {
  recolhivel?: boolean
  centralizada?: boolean
}) {
  if (centralizada) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <span aria-hidden="true" className="sinal h-14 w-14" />
        <span className="text-[16px] font-extrabold tracking-[-0.02em] text-texto-principal">
          {comum.nomeDoProduto}
        </span>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span aria-hidden="true" className="sinal h-9 w-9" />
      <span
        className={`truncate text-[14px] font-extrabold tracking-[-0.02em] text-texto-principal ${
          recolhivel ? 'max-lg:sr-only' : ''
        }`}
      >
        {comum.nomeDoProduto}
      </span>
    </div>
  )
}
