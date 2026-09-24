"use client";
// Faixa dispensável com até três observações sobre o painel (RF-11). Some ao fechar e só volta na próxima análise.
import type { Observacao, TipoObservacao } from "@/lib/types";

const ROTULO: Record<TipoObservacao, string> = { anomalia: "Chama atenção", tendencia: "Tendência", sugestao: "Sugestão" };
const NIVEL: Record<TipoObservacao, string> = { anomalia: "media", tendencia: "positivo", sugestao: "neutral" };

export function BannerObservacoes({ observacoes, demo, onFechar }: { observacoes: Observacao[]; demo: boolean; onFechar: () => void }) {
  return (
    <section className="card p-5 mb-5 border-accent/40 reveal no-print" aria-label="Observações sobre o painel">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-bold text-[15px]">O que chama atenção neste painel</h2>
          <p className="text-muted text-[12.5px]">{demo ? "Leitura de exemplo, calculada a partir dos números mostrados." : "Leitura da IA sobre os números de exemplo, não sobre a sua empresa."}</p>
        </div>
        <button type="button" className="btn-ghost !py-1.5 !px-3 text-[13px]" onClick={onFechar} aria-label="Fechar observações">Fechar</button>
      </div>
      {observacoes.length === 0 ? (
        <p className="text-muted text-sm">Nada de especial para apontar neste painel.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {observacoes.map((o, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <span className={`chip-${NIVEL[o.tipo]} shrink-0 mt-0.5`}>{ROTULO[o.tipo]}</span>
              <span>{o.mensagem}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
