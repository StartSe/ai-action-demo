"use client";
// Prévia da página gerada: iframe isolado (sandbox só com scripts, origem opaca — o HTML gerado não enxerga
// este app, nem cookies, nem o armazenamento local), alternância entre computador e celular (390 px),
// o código-fonte em <details> com botão de copiar e o aviso sobre conteúdo de terceiros.
import { useState } from "react";
import { CopyButton } from "./ui";

type Modo = "computador" | "celular";

export const LARGURA_CELULAR = 390;

export function PreviaPagina({ html, titulo, alturaComputador = 680, alturaCelular = 760 }: { html: string; titulo: string; alturaComputador?: number; alturaCelular?: number }) {
  const [modo, setModo] = useState<Modo>("computador");
  const celular = modo === "celular";
  const botao = (valor: Modo, rotulo: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={modo === valor}
      className={`px-3.5 py-1.5 rounded-lg text-[13.5px] font-bold cursor-pointer transition-colors ${modo === valor ? "bg-accent text-white" : "text-ink hover:bg-bg"}`}
      onClick={() => setModo(valor)}
    >
      {rotulo}
    </button>
  );

  return (
    <div>
      <div className="no-print flex items-center justify-between gap-3 mb-3 max-md:flex-wrap">
        <div role="radiogroup" aria-label="Tamanho da prévia" className="inline-flex gap-1 p-1 border border-line rounded-[10px] bg-surface">
          {botao("computador", "Computador")}
          {botao("celular", "Celular")}
        </div>
        <span className="text-muted text-[12.5px]">{celular ? `Largura de ${LARGURA_CELULAR} px` : "Largura da tela"}</span>
      </div>

      <div className={`bg-bg border border-line rounded-card p-3 ${celular ? "flex justify-center" : ""}`}>
        <div className="bg-white border border-line rounded-[10px] overflow-hidden shadow-card" style={celular ? { width: LARGURA_CELULAR, maxWidth: "100%" } : undefined}>
          <div className="flex items-center gap-1.5 px-3 h-8 border-b border-line bg-surface" aria-hidden="true">
            <span className="w-2.5 h-2.5 rounded-full bg-line" /><span className="w-2.5 h-2.5 rounded-full bg-line" /><span className="w-2.5 h-2.5 rounded-full bg-line" />
            <span className="ml-2 text-[11px] text-muted truncate">{titulo}</span>
          </div>
          <iframe
            key={modo}
            title={`Prévia de ${titulo}`}
            sandbox="allow-scripts"
            srcDoc={html}
            className="block w-full bg-white"
            style={{ height: celular ? alturaCelular : alturaComputador }}
          />
        </div>
      </div>

      <details className="mt-4 group">
        <summary className="cursor-pointer font-bold text-[14px] list-none flex items-center gap-2 select-none">
          <span className="inline-block transition-transform group-open:rotate-90" aria-hidden="true">▸</span>
          Ver o código
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <div className="no-print flex justify-end"><CopyButton texto={() => html} rotulo="Copiar código" /></div>
          <pre className="max-h-[420px] overflow-auto text-[12px] leading-[1.5] p-4 rounded-card bg-ink text-white whitespace-pre-wrap break-words"><code>{html}</code></pre>
        </div>
      </details>

      <p className="text-muted text-[13px] mt-4">Use a referência pela estrutura. Textos, marcas e imagens de terceiros são protegidos; troque pelo conteúdo da sua empresa.</p>
    </div>
  );
}
