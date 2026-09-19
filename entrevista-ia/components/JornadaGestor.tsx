"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Inicio } from "@/lib/inicio";

export function JornadaGestor({ iaPronta }: { iaPronta: boolean }) {
  const [inicio, setInicio] = useState<Inicio | null>(null);
  useEffect(() => {
    let ativo = true;
    fetch("/api/inicio").then((r) => r.ok ? r.json() : null).then((v: Inicio | null) => { if (ativo) setInicio(v); }).catch(() => {});
    return () => { ativo = false; };
  }, []);
  const passos = [
    { titulo: "Conectar a IA", apoio: "Ative as perguntas e a análise das entrevistas.", pronto: iaPronta, url: "#openrouter" },
    { titulo: "Criar a vaga", apoio: "Defina o cargo e o que você quer avaliar.", pronto: inicio?.passos[1]?.concluido ?? false, url: inicio?.passos[1]?.acao.url ?? "/vagas/nova" },
    { titulo: "Gerar o primeiro link", apoio: "Adicione um candidato e compartilhe o convite.", pronto: inicio?.passos[2]?.concluido ?? false, url: inicio?.passos[2]?.acao.url ?? "/vagas/nova" },
  ];
  const atual = passos.findIndex((p) => !p.pronto);
  return (
    <section className="card p-6 max-md:p-5 mb-7 border-accent/20" aria-label="Primeiros passos">
      <p className="sobretitulo mb-2">Sua primeira entrevista</p>
      <h2 className="text-2xl font-extrabold mb-2">Vamos preparar seu processo</h2>
      <p className="text-sm text-muted mb-5">Comece pelo essencial. Voz personalizada e pesquisa na web podem ser conectadas depois.</p>
      <ol className="grid grid-cols-3 max-md:grid-cols-1 gap-4">
        {passos.map((p, i) => <li key={p.titulo} aria-current={i === atual ? "step" : undefined} className={`rounded-field p-4 border ${i === atual ? "bg-accent-soft border-accent/30" : "border-line"}`}>
          <span className="inline-grid place-items-center size-7 rounded-full bg-accent text-white text-sm font-bold mb-3" aria-hidden="true">{p.pronto ? "✓" : i + 1}</span>
          <h3 className="font-bold text-sm">{p.titulo}{p.pronto && <span className="sr-only"> — concluído</span>}</h3>
          <p className="text-xs text-muted mt-1 mb-3">{p.apoio}</p>
          <Link className="btn-link text-sm" href={p.url}>{p.pronto ? "Revisar" : i === atual ? "Começar aqui →" : "Ver etapa →"}</Link>
        </li>)}
      </ol>
      {atual === -1 && <Link className="btn-link inline-block mt-4" href="/relatorios">Acompanhar as métricas das entrevistas →</Link>}
    </section>
  );
}
