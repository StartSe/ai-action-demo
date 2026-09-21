"use client";
// Conversa de ajuste do painel (RF-09) com o botão "Desfazer" (RF-10): histórico do que foi pedido e do
// que foi feito, em ordem, e o campo "O que você quer mudar?".
import { useState, type FormEvent } from "react";
import { Aviso } from "./ui";
import type { Fala } from "@/lib/types";

const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function ConversaRefino({ falas, onEnviar, enviando, onDesfazer, podeDesfazer, erro }: { falas: Fala[]; onEnviar: (texto: string) => void; enviando: boolean; onDesfazer: () => void; podeDesfazer: boolean; erro?: { mensagem: string; acao?: { rotulo: string; url: string } } | null }) {
  const [texto, setTexto] = useState("");

  function enviar(e: FormEvent) {
    e.preventDefault();
    const pedido = texto.trim();
    if (pedido.length < 3 || enviando) return;
    onEnviar(pedido);
    setTexto("");
  }

  return (
    <section className="card p-6 max-md:p-5 no-print" aria-label="Ajustar o painel conversando">
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Ajuste conversando</h2>
          <p className="text-muted text-sm">Peça uma mudança de cada vez: trocar um gráfico, acrescentar um indicador, tirar a tabela.</p>
        </div>
        <button type="button" className="btn-ghost !py-2" onClick={onDesfazer} disabled={!podeDesfazer || enviando}>Desfazer</button>
      </div>

      {falas.length > 0 && (
        <ol className="flex flex-col gap-2.5 my-4" aria-label="Histórico da conversa">
          {falas.map((f, i) => (
            <li key={`${f.em}-${i}`} className={`flex ${f.autor === "voce" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] px-3.5 py-2.5 rounded-[14px] text-sm ${f.autor === "voce" ? "bg-accent-soft text-accent-ink" : "bg-bg text-ink border border-line"}`}>
                <p>{f.texto}</p>
                <p className={`text-[11px] mt-1 ${f.autor === "voce" ? "text-accent-ink/70" : "text-muted"}`}>{f.autor === "voce" ? "Você" : "Painel"} · {HORA.format(new Date(f.em))}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {enviando && <p role="status" className="text-sm text-accent-ink my-3">Ajustando o painel… com modelo gratuito isso pode levar até meio minuto.</p>}
      {erro && <div className="my-3"><Aviso tom="danger" acao={erro.acao}>{erro.mensagem}</Aviso></div>}

      <form onSubmit={enviar} className="flex gap-2.5 max-md:flex-col mt-3">
        <label htmlFor="pedido-ajuste" className="sr-only">O que você quer mudar?</label>
        <input id="pedido-ajuste" className="input" placeholder="O que você quer mudar? Ex.: troque o gráfico de barras por pizza" value={texto} maxLength={500} disabled={enviando} onChange={(e) => setTexto(e.target.value)} />
        <button type="submit" className="btn-primary !w-auto shrink-0" disabled={enviando || texto.trim().length < 3}>{enviando ? "Ajustando…" : "Ajustar"}</button>
      </form>
    </section>
  );
}
