"use client";
import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";

export interface MensagemChat {
  id: string;
  papel: "usuario" | "assistente" | "erro";
  texto: string;
}

const SUGESTOES = [
  { rotulo: "Criar cartão de entrevista", mensagem: "Crie um cartão para entrevistar a candidata Paula na quinta em A fazer" },
  { rotulo: "Mover onboarding do Pedro", mensagem: "Mova o onboarding do Pedro para concluído" },
  { rotulo: "Ver resumo do quadro", mensagem: "Como está o quadro?" },
];

const BOLHA_BASE = "px-3.5 py-2.5 rounded-xl text-sm leading-relaxed max-w-[94%]";
const BOLHA_POR_PAPEL: Record<MensagemChat["papel"], string> = {
  assistente: `${BOLHA_BASE} self-start rounded-bl-[4px] bg-accent-soft text-accent-ink`,
  usuario: `${BOLHA_BASE} self-end rounded-br-[4px] bg-bg border border-line`,
  erro: `${BOLHA_BASE} self-start rounded-bl-[4px] bg-[#fde8e6] text-danger`,
};

export function Chat({
  mensagens,
  carregando,
  valor,
  onValorChange,
  onEnviar,
}: {
  mensagens: MensagemChat[];
  carregando: boolean;
  valor: string;
  onValorChange: (v: string) => void;
  onEnviar: (mensagem: string) => void;
}) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [mensagens, carregando]);

  function enviarValorAtual(e?: FormEvent) {
    e?.preventDefault();
    const texto = valor.trim();
    if (!texto || carregando) return;
    onEnviar(texto);
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarValorAtual();
    }
  }

  return (
    <>
      <div ref={logRef} className="flex flex-col gap-2.5 mb-4 max-h-[46vh] overflow-y-auto pr-0.5">
        {mensagens.map((m) => (
          <div key={m.id} className={BOLHA_POR_PAPEL[m.papel]}>
            {m.texto}
          </div>
        ))}
        {carregando && (
          <div className={`${BOLHA_BASE} self-start flex items-center gap-1.5 bg-accent-soft`}>
            <span className="w-1.5 h-1.5 rounded-full bg-accent opacity-35 animate-[pisca_1.1s_infinite]" />
            <span className="w-1.5 h-1.5 rounded-full bg-accent opacity-35 animate-[pisca_1.1s_infinite] [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-accent opacity-35 animate-[pisca_1.1s_infinite] [animation-delay:300ms]" />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {SUGESTOES.map((s) => (
          <button
            key={s.rotulo}
            type="button"
            className="bg-accent-soft text-accent-ink rounded-full px-3.5 py-[7px] text-[13px] font-semibold text-left hover:bg-accent/15 disabled:opacity-60"
            disabled={carregando}
            onClick={() => onEnviar(s.mensagem)}
          >
            {s.rotulo}
          </button>
        ))}
      </div>

      <form className="flex gap-2 items-end" onSubmit={enviarValorAtual}>
        <textarea
          className="input min-h-[46px] max-h-[140px] resize-y flex-1"
          required
          placeholder="Peça algo ao agente"
          value={valor}
          onChange={(e) => onValorChange(e.target.value)}
          onKeyDown={aoTeclar}
        />
        <button type="submit" className="btn-primary w-auto px-5 shrink-0" disabled={carregando}>
          {carregando ? "Enviando" : "Enviar"}
        </button>
      </form>
    </>
  );
}
