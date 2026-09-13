"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { MensagemChat } from "@/lib/types";

/** `hora` é gravada no momento em que a mensagem é enviada/recebida, não recalculada a cada render. */
export type BolhaChat = MensagemChat & { transferido?: boolean; erro?: boolean; pendente?: boolean; hora?: string; ferramentaUsada?: string };

/** Aprova ou corrige a resposta do atendente para o par {pergunta, resposta} entrar na base. */
export type AoSalvarBase = (pergunta: string, resposta: string) => void;

export function horaAtual() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * "Aprovar" grava a resposta como está; "Corrigir" abre um campo com a resposta certa antes de gravar.
 * Reaproveitado tanto no simulador (por bolha) quanto na lista de conversas (por linha).
 */
export function AcoesResposta({
  pergunta,
  resposta,
  onAprovar,
  onCorrigir,
  modoInicial = "padrao",
}: {
  pergunta: string;
  resposta: string;
  onAprovar?: AoSalvarBase;
  onCorrigir?: AoSalvarBase;
  /** Abre já em "corrigindo" quando a pessoa chega de um link "Corrigir" (ex.: relatório diário). */
  modoInicial?: "padrao" | "corrigindo";
}) {
  const [modo, setModo] = useState<"padrao" | "corrigindo" | "salvo">(modoInicial);
  const [texto, setTexto] = useState(resposta);

  if (modo === "salvo") return <span className="text-[11px] font-semibold text-accent-ink px-1">Adicionado à base ✓</span>;

  if (modo === "corrigindo")
    return (
      <div className="w-full flex flex-col gap-1.5 px-1">
        <textarea
          className="input text-sm min-h-[70px]"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          autoFocus
        />
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-primary !w-auto text-xs px-3 py-1.5"
            onClick={() => {
              const corrigida = texto.trim();
              if (!corrigida) return;
              onCorrigir?.(pergunta, corrigida);
              setModo("salvo");
            }}
          >
            Salvar correção
          </button>
          <button type="button" className="btn-ghost !w-auto text-xs px-3 py-1.5" onClick={() => setModo("padrao")}>
            Cancelar
          </button>
        </div>
      </div>
    );

  return (
    <div className="flex gap-3 px-1">
      {onAprovar && (
        <button
          type="button"
          className="text-[11px] font-semibold text-accent-ink hover:underline"
          onClick={() => {
            onAprovar(pergunta, resposta);
            setModo("salvo");
          }}
        >
          Aprovar
        </button>
      )}
      {onCorrigir && (
        <button type="button" className="text-[11px] font-semibold text-muted hover:underline" onClick={() => setModo("corrigindo")}>
          Corrigir
        </button>
      )}
    </div>
  );
}

function saudacaoPadrao(nome: string, negocio: string): string {
  const quem = nome.trim() || "o atendente";
  const sufixoEmpresa = negocio.trim() ? ` da ${negocio.trim()}` : "";
  return `Olá! Eu sou ${quem}${sufixoEmpresa}. Como posso ajudar?`;
}

/** Mockup de celular com a conversa de WhatsApp simulada. */
export function Celular({
  nome,
  negocio,
  mensagens,
  valor,
  onValorChange,
  onEnviar,
  enviando,
  onAprovar,
  onCorrigir,
}: {
  nome: string;
  negocio: string;
  mensagens: BolhaChat[];
  valor: string;
  onValorChange: (v: string) => void;
  onEnviar: (texto: string) => void;
  enviando: boolean;
  onAprovar?: AoSalvarBase;
  onCorrigir?: AoSalvarBase;
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
          {mensagens.length === 0 && (
            <div className="max-w-[82%] px-3 py-2 rounded-xl text-sm leading-snug shadow-[0_1px_1px_rgba(0,0,0,0.08)] self-start bg-white rounded-bl-[3px]">
              {saudacaoPadrao(nome, negocio)}
            </div>
          )}
          {mensagens.map((m, i) => {
            const pergunta = m.papel === "atendente" && mensagens[i - 1]?.papel === "cliente" ? mensagens[i - 1].texto : undefined;
            const podeAvaliar = pergunta && !m.pendente && !m.erro && (onAprovar || onCorrigir);
            return (
              <div
                key={i}
                className={`flex flex-col gap-1 max-w-[82%] ${m.papel === "cliente" ? "self-end items-end" : "self-start items-start"}`}
              >
                <div
                  className={`w-full px-3 pt-2 pb-[18px] rounded-xl text-sm leading-snug shadow-[0_1px_1px_rgba(0,0,0,0.08)] relative break-words ${
                    m.papel === "cliente" ? "bg-[#dcf8c6] rounded-br-[3px]" : "bg-white rounded-bl-[3px]"
                  } ${m.transferido ? "border border-warn" : ""} ${m.erro ? "border border-danger" : ""} ${m.pendente ? "text-muted italic" : ""}`}
                >
                  {m.transferido && <span className="block text-[11px] font-bold text-warn mb-0.5">Encaminhado para uma pessoa</span>}
                  {m.texto}
                  {m.hora && <span className="absolute right-3 bottom-1 text-[10px] text-muted">{m.hora}</span>}
                </div>
                {m.ferramentaUsada && (
                  <span className="text-[11px] text-muted px-1" title={`Ferramenta MCP: ${m.ferramentaUsada}`}>
                    Consultado em {m.ferramentaUsada}
                  </span>
                )}
                {podeAvaliar && pergunta && (
                  <AcoesResposta pergunta={pergunta} resposta={m.texto} onAprovar={onAprovar} onCorrigir={onCorrigir} />
                )}
              </div>
            );
          })}
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
