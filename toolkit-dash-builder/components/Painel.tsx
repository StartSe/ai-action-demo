// A grade do painel e o despacho por tipo de componente. Sem "use client": é renderizado também pelos
// Server Components de /r/[id] e /imprimir/[id]; só TabelaPainel é cliente (usa o DataTable e copia CSV).
import "@/app/painel.css";
import type { ComponentePainel, EspecPainel } from "@/lib/types";
import { LARGURA_CLASSE } from "@/lib/validar-painel";
import { CartaoIndicador } from "./CartaoIndicador";
import { GraficoBarras } from "./GraficoBarras";
import { GraficoRosca } from "./GraficoRosca";
import { GraficoSerie } from "./GraficoSerie";
import { TabelaPainel } from "./TabelaPainel";

export type ModoPainel = "tela" | "impressao";

/** Exportado para `PainelEditavel` desenhar os mesmos cartões no modo de reorganizar, sem duplicar o despacho. */
export function Corpo({ componente, modo }: { componente: ComponentePainel; modo: ModoPainel }) {
  switch (componente.tipo) {
    case "indicador":
      return <CartaoIndicador dados={componente.dados} titulo={componente.titulo} />;
    case "linha":
    case "area":
      return <GraficoSerie dados={componente.dados} titulo={componente.titulo} area={componente.tipo === "area"} />;
    case "barra":
      return <GraficoBarras dados={componente.dados} titulo={componente.titulo} />;
    case "pizza":
    case "rosca":
      return <GraficoRosca dados={componente.dados} titulo={componente.titulo} rosca={componente.tipo === "rosca"} />;
    case "tabela":
      return <TabelaPainel componente={componente} modo={modo} />;
  }
}

/** Grade de 4 colunas com um cartão por componente, ordenados por linha e coluna (o validador já garante a ordem). */
export function Painel({ painel, modo = "tela" }: { painel: EspecPainel; modo?: ModoPainel }) {
  const ordenados = [...painel.componentes].sort((a, b) => a.posicao.linha - b.posicao.linha || a.posicao.coluna - b.posicao.coluna);
  return (
    <div className="painel-grade">
      {ordenados.map((c) => (
        <article key={c.id} className={`card painel-cartao p-5 max-md:p-4 ${LARGURA_CLASSE[c.posicao.largura]} ${c.tipo === "tabela" ? "painel-tabela" : ""}`}>
          <h3 className="text-[13px] font-bold text-muted mb-3 leading-snug" title={c.titulo}>{c.titulo}</h3>
          <div className="painel-corpo">
            <Corpo componente={c} modo={modo} />
          </div>
        </article>
      ))}
    </div>
  );
}
