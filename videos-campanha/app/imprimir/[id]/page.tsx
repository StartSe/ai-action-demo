import { notFound } from "next/navigation";
import { Origem } from "@/components/ui";
import { data } from "@/lib/formato";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import { proporcao, rotuloFormato, rotuloObjetivo, type Campanha, type Cena, type EntradaCampanha, type Formato } from "@/lib/types";
import { ImprimirAoCarregar } from "./ImprimirAoCarregar";

/** Um quadro parado do storyboard (sem animação, para o papel): imagem do produto, sobreposição escura e o texto da cena. */
function QuadroEstatico({ cena, formato, imagem }: { cena: Cena; formato: Formato; imagem?: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-[10px] bg-[#1c1530] text-white bg-cover bg-center"
      style={{ aspectRatio: proporcao(formato), backgroundImage: imagem ? `url("${imagem}")` : "radial-gradient(circle at 50% 40%, #be185d 0%, #4a1942 55%, #1c1530 100%)" }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-0 flex items-center justify-center p-3 text-center">
        <p className="font-bold text-[13px] leading-[1.15]">{cena.textoNaTela}</p>
      </div>
    </div>
  );
}

/** Folha de impressão: o storyboard parado e o roteiro por cena de cada conceito, com a proveniência no rodapé. */
export default async function Page({ params }: PageProps<"/imprimir/[id]">) {
  const { id } = await params;
  const registro = obter<EntradaCampanha, Campanha, Meta>(id);
  if (!registro || registro.tipo !== "campanha") notFound();
  const campanha = registro.saida;
  const b = campanha.briefing;

  return (
    <div className="print-sheet max-w-[1100px] mx-auto px-8 py-10 max-md:px-4">
      <ImprimirAoCarregar />
      <header className="mb-6 pb-4 border-b border-line">
        <div className="text-[13px] font-semibold text-muted">Vídeos de Campanha</div>
        <h1 className="text-2xl font-extrabold tracking-[-0.01em]">{campanha.titulo}</h1>
        <div className="text-muted text-sm">{data(new Date())} · {rotuloFormato(b.formato)} · {b.duracaoSeg} s · {rotuloObjetivo(b.objetivo)}</div>
        {(b.publico || b.tom) && <p className="text-sm mt-2">{b.publico && <>Para quem: {b.publico}. </>}{b.tom && <>Tom: {b.tom}.</>}</p>}
      </header>

      <div className="flex flex-col gap-8">
        {campanha.conceitos.map((c, i) => (
          <section key={c.id} className="card p-5" style={{ breakInside: "avoid" }}>
            <div className="text-[12px] font-bold text-accent tracking-[0.02em] mb-1">Conceito {i + 1} · Efeito sugerido: {c.efeitoSugerido}</div>
            <h2 className="text-lg font-extrabold mb-3">{c.titulo}</h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {c.roteiro.map((cena, j) => <QuadroEstatico key={j} cena={cena} formato={b.formato} imagem={b.imagemDataUrl} />)}
            </div>
            <ol className="flex flex-col gap-2 text-sm">
              {c.roteiro.map((cena, j) => (
                <li key={j} className="border-l-2 border-accent-soft pl-3">
                  <div className="text-[12px] font-bold text-muted">Cena {j + 1} · {cena.segundos} s</div>
                  <p>{cena.cena}</p>
                  <p className="font-semibold text-accent-ink">“{cena.textoNaTela}”</p>
                </li>
              ))}
            </ol>
            <p className="text-sm mt-3"><span className="font-bold">Chamada:</span> {c.chamada}</p>
          </section>
        ))}
      </div>

      <footer className="mt-8 pt-4 border-t border-line">
        <Origem meta={registro.meta} />
      </footer>
    </div>
  );
}
