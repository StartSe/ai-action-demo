/**
 * A ação do estado vazio tem duas formas. A de botão faz alguma coisa na
 * própria tela; a de endereço leva para outra, e existe porque nem toda saída
 * cabe aqui — quem não tem lead nenhum precisa ir para a importação.
 *
 * O endereço vira `<a href>`, e não `<Link to>`, pelo mesmo motivo da barra
 * lateral: o destino pode ser uma rota que ainda não foi registrada, e o
 * roteador recusa em tempo de compilação o que não conhece.
 */
type AcaoDoEstadoVazio =
  | { rotulo: string; aoAcionar: () => void; endereco?: never }
  | { rotulo: string; endereco: string; aoAcionar?: never }

type EstadoVazioProps = {
  titulo: string
  explicacao: string
  acao?: AcaoDoEstadoVazio
}

/**
 * O estado vazio do design system: moldura tracejada, o ícone num quadrado
 * menta, texto centralizado e, quando existe, o convite para a ação que
 * preenche a tela.
 */
export function EstadoVazio({ titulo, explicacao, acao }: EstadoVazioProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-cartao border border-dashed border-borda bg-superficie-funda/50 px-10 py-12 text-center max-md:px-5 max-md:py-8">
      <span
        aria-hidden="true"
        className="mb-2 grid h-[52px] w-[52px] place-items-center rounded-[17px] border border-positivo-borda bg-positivo-fundo text-menta-2"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[22px] w-[22px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]"
        >
          <path d="M5 6h14v13H5zM9 10h6M9 14h4" />
        </svg>
      </span>
      <h2 className="m-0 text-[17px] font-extrabold tracking-[-0.015em] text-texto-principal">
        {titulo}
      </h2>
      <p className="m-0 max-w-[48ch] text-[13.5px] text-texto-apoio">
        {explicacao}
      </p>
      {acao?.endereco !== undefined ? (
        <a href={acao.endereco} className="botao-primario mt-3 no-underline">
          {acao.rotulo}
        </a>
      ) : acao ? (
        <button
          type="button"
          onClick={acao.aoAcionar}
          className="botao-primario mt-3"
        >
          {acao.rotulo}
        </button>
      ) : null}
    </div>
  )
}
