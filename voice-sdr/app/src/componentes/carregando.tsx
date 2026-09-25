/**
 * A espera: a frase do que está acontecendo, com o giro menta ao lado, e o
 * esqueleto do que vai aparecer. O design system pede esqueleto quando a
 * estrutura é conhecida, e é o caso de toda carga de tela.
 *
 * `role="status"` em vez do `aria-live` solto da suíte, porque é assim que o
 * leitor de tela e a busca por papel dos testes enxergam a espera.
 */
export function Carregando({ texto }: { texto: string }) {
  return (
    <div role="status" className="flex flex-col gap-3.5 py-2">
      <p className="m-0 flex items-center gap-2.5 text-[13px] text-texto-apoio">
        <span aria-hidden="true" className="giro h-4 w-4 border-2" />
        {texto}
      </p>
      <div className="esqueleto h-11 w-4/5" />
      <div className="esqueleto w-3/5" />
      <div className="esqueleto w-[70%]" />
      <div className="esqueleto h-11 w-[90%]" />
      <div className="esqueleto w-1/2" />
    </div>
  )
}
