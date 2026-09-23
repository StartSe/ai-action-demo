"use client";
// Prévia da página gerada: iframe isolado (sandbox só com scripts, origem opaca — o HTML gerado não enxerga
// este app, nem cookies, nem o armazenamento local), alternância entre computador e celular (390 px, oculta
// no celular, onde não faz sentido), a miniatura da referência ao lado, o código-fonte em <details> com
// botão de copiar e o aviso sobre conteúdo de terceiros.
import { useState, type CSSProperties } from "react";
import { CopyButton } from "./ui";
import { Ampliar, AmpliarImagem } from "./Ampliar";

type Modo = "computador" | "celular";

export const LARGURA_CELULAR = 390;

function Moldura({ html, titulo, style, ampliada = false }: { html: string; titulo: string; style?: CSSProperties; ampliada?: boolean }) {
  const [pronta, setPronta] = useState(false);
  return <div className={`relative ${ampliada ? "h-full" : ""}`}>
    {!pronta && <p role="status" className="absolute top-3 left-3 right-3 p-3 rounded-lg bg-surface border border-line text-sm text-ink">Carregando a prévia...</p>}
    <iframe title={titulo} sandbox="allow-scripts" srcDoc={html} onLoad={() => setPronta(true)} className={`block bg-white mx-auto ${ampliada ? "h-full" : "w-full"}`} style={style} />
  </div>;
}

export function PreviaPagina({ html, titulo, referencia, alturaComputador = 680, alturaCelular = 760, aoAmpliar }: { html: string; titulo: string; referencia?: string; alturaComputador?: number; alturaCelular?: number; aoAmpliar?: () => void }) {
  const [modo, setModo] = useState<Modo>("computador");
  const celular = modo === "celular";
  const botao = (valor: Modo, rotulo: string) => (
    <button
      type="button"
      aria-pressed={modo === valor}
      className={`px-3.5 py-1.5 rounded-lg text-[13.5px] font-bold cursor-pointer transition-colors ${modo === valor ? "bg-accent text-white" : "text-ink hover:bg-bg"}`}
      onClick={() => setModo(valor)}
    >
      {rotulo}
    </button>
  );

  return (
    <div>
      <div className="no-print flex items-center justify-between flex-wrap gap-3 mb-3">
        {/* O alternador não aparece no celular: lá a prévia já ocupa a largura do aparelho. */}
        <div role="group" aria-label="Tamanho da prévia" className="max-md:hidden inline-flex gap-1 p-1 border border-line rounded-[10px] bg-surface">
          {botao("computador", "Computador")}
          {botao("celular", "Celular")}
        </div>
        {aoAmpliar ? <button className="btn-ghost" onClick={aoAmpliar}>Abrir em tela cheia</button> : <Ampliar rotulo="Abrir em tela cheia" titulo={titulo}>
          <Moldura html={html} titulo={`Prévia ampliada de ${titulo}`} ampliada style={{ width: celular ? LARGURA_CELULAR : "100%", maxWidth: "100%" }} />
        </Ampliar>}
        {referencia && (
          <figure className="m-0 shrink-0 max-md:ml-auto">
            <AmpliarImagem src={referencia} />
            <figcaption className="text-muted text-[11.5px] text-center mt-1">Referência</figcaption>
          </figure>
        )}
      </div>

      <div className={`bg-bg border border-line rounded-card p-3 ${celular ? "flex justify-center" : ""}`}>
        <div className="bg-white border border-line rounded-[10px] overflow-hidden shadow-card" style={celular ? { width: LARGURA_CELULAR, maxWidth: "100%" } : undefined}>
          <div className="flex items-center gap-1.5 px-3 h-8 border-b border-line bg-surface" aria-hidden="true">
            <span className="w-2.5 h-2.5 rounded-full bg-line" /><span className="w-2.5 h-2.5 rounded-full bg-line" /><span className="w-2.5 h-2.5 rounded-full bg-line" />
            <span className="ml-2 text-[11px] text-muted truncate">{titulo}</span>
          </div>
          <Moldura key={modo} html={html} titulo={`Prévia de ${titulo}`} style={{ height: celular ? alturaCelular : alturaComputador }} />
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
