"use client";

import { useEffect, useRef, type FormEvent } from "react";
import type { MensagemChat } from "@/lib/types";

export type BolhaChat = MensagemChat & { transferido?: boolean; pendente?: boolean };

function horaAtual() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Mockup de celular com a conversa de WhatsApp simulada. */
export function Celular({
  nome,
  mensagens,
  valor,
  onValorChange,
  onEnviar,
  enviando,
}: {
  nome: string;
  mensagens: BolhaChat[];
  valor: string;
  onValorChange: (v: string) => void;
  onEnviar: (texto: string) => void;
  enviando: boolean;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensagens]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const texto = valor.trim();
    if (!texto) return;
    onValorChange("");
    onEnviar(texto);
  }

  return (
    <div className="flex justify-center mb-5">
      <div className="w-[360px] max-w-full h-[560px] bg-[#e5ddd5] rounded-[28px] border-[10px] border-[#1f2937] shadow-card overflow-hidden flex flex-col">
        <div className="bg-accent text-white px-4 py-3.5 flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-full bg-white/20 grid place-items-center font-extrabold text-[15px] shrink-0">
            {(nome || "A").trim().charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-[15px]">{nome || "Atendente"}</div>
            <div className="text-xs opacity-85 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
              online
            </div>
          </div>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5 bg-[#e5ddd5]">
          {mensagens.map((m, i) => (
            <div
              key={i}
              className={`max-w-[82%] px-3 pt-2 pb-[18px] rounded-xl text-sm leading-snug shadow-[0_1px_1px_rgba(0,0,0,0.08)] relative break-words ${
                m.papel === "cliente" ? "self-end bg-[#dcf8c6] rounded-br-[3px]" : "self-start bg-white rounded-bl-[3px]"
              } ${m.transferido ? "border border-warn" : ""} ${m.pendente ? "text-muted italic" : ""}`}
            >
              {m.texto}
              <span className="absolute right-3 bottom-1 text-[10px] text-muted">{horaAtual()}</span>
            </div>
          ))}
        </div>

        <form onSubmit={submit} className="flex gap-2 p-2.5 bg-[#f0f0f0] border-t border-line shrink-0">
          <input
            className="flex-1 min-w-0 rounded-full border border-line px-3.5 py-2.5 bg-white outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft"
            placeholder="Digite uma pergunta do cliente..."
            autoComplete="off"
            value={valor}
            onChange={(e) => onValorChange(e.target.value)}
            disabled={enviando}
          />
          <button type="submit" className="btn-primary w-auto rounded-full px-[18px] whitespace-nowrap" disabled={enviando}>
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}
