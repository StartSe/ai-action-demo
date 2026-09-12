"use client";

import type { Conversa } from "@/lib/types";

/** Lista de conversas recebidas (simulador e WhatsApp de verdade), com opção de limpar cada uma. */
export function Conversas({ lista, onLimpar }: { lista: Conversa[]; onLimpar: (numero: string) => void }) {
  if (!lista.length) {
    return <p className="text-muted text-sm">Nenhuma conversa ainda. Teste no celular acima ou aguarde mensagens reais do WhatsApp.</p>;
  }
  return (
    <div>
      {lista.map((c) => (
        <div key={c.numero} className="flex items-center justify-between gap-3 flex-wrap px-4 py-3.5 card shadow-none mb-2.5">
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm">{c.numero}</div>
            <div className="text-muted text-[13px] whitespace-nowrap overflow-hidden text-ellipsis max-w-[420px] max-md:max-w-[220px]">{c.ultima_mensagem}</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <span className="chip-neutral">{c.origem === "whatsapp" ? "whatsapp" : "simulador"}</span>
            {c.transferir && <span className="chip bg-[#fff4e0] text-warn">transferir p/ humano</span>}
            <span className="text-muted text-xs">{c.hora}</span>
            <button type="button" className="btn-link" onClick={() => onLimpar(c.numero)}>Limpar</button>
          </div>
        </div>
      ))}
    </div>
  );
}
