"use client";
// A barra de uma nota de 0 a 10, usada pelas competências da visão geral (US-022) e pelos tipos de
// cliente da aba Personas (US-024).
//
// O desenho é um SVG de dois retângulos (a régua e a nota), sem nenhuma dependência de gráfico: são
// dez, doze linhas e a escala é sempre a mesma. `preserveAspectRatio="none"` é o que deixa a barra
// acompanhar a largura da tela sem recalcular nada no navegador; o arredondamento fica no invólucro,
// em CSS, porque esticar um `rx` deformaria a ponta.
//
// Sem nota (base pequena demais para uma média), a barra fica só com a régua: uma barra cheia até um
// número que a tela não mostra seria pior que barra nenhuma.
import { PREENCHIMENTO, tomDaNota } from "./apresentacao";

export default function BarraNota({ valor, descricao }: { valor: number | null; descricao: string }) {
  return (
    <div className="h-2.5 rounded-chip overflow-hidden bg-line">
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="block w-full h-full" role="img" aria-label={descricao}>
        {valor !== null && <rect x="0" y="0" width={Math.max(0, Math.min(10, valor)) * 10} height="10" className={PREENCHIMENTO[tomDaNota(valor)]} />}
      </svg>
    </div>
  );
}
