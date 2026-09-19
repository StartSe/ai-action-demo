"use client";
// Lista compacta dos últimos radares salvos (GET /api/radar), no fim de /radar: abre o radar salvo
// (/r/[id]) ou refaz a pesquisa com os mesmos temas. Não é um item de menu, por decisão de 19/09/2026.
import Link from "next/link";
import { useEffect, useState } from "react";
import { data } from "@/lib/formato";
import type { DadosRadar } from "@/lib/types";

type Item = { id: string; titulo: string; criadoEm: string; entrada: DadosRadar };

export function RadaresAnteriores({ atual, atualizadoEm }: { atual?: string; atualizadoEm?: string }) {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    let ativo = true;
    fetch("/api/radar")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("falha"))))
      .then((d) => { if (ativo) setItens(d.itens ?? []); })
      .catch(() => { if (ativo) setFalhou(true); });
    return () => { ativo = false; };
  }, [atualizadoEm]);
  if (falhou || !itens || itens.length === 0) return null;
  return (
    <section id="anteriores" className="mt-6">
      <h2 className="section-title">Radares anteriores</h2>
      <ul className="card divide-y divide-line">
        {itens.map((r) => {
          const link = `/radar?${new URLSearchParams({ temas: r.entrada.temas.join("\n"), periodo: String(r.entrada.periodoDias), setor: r.entrada.setor || "" })}`;
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="flex-1 min-w-[200px]">
                <span className="block font-semibold text-ink leading-snug">{r.entrada.temas.join(" · ")}</span>
                <span className="text-xs text-muted">
                  {data(r.criadoEm, { comHora: true })} · últimos {r.entrada.periodoDias} dias{r.id === atual ? " · este radar" : ""}
                </span>
              </span>
              <span className="flex gap-3 shrink-0">
                <Link href={`/r/${r.id}`} className="btn-link text-[13px]">Abrir</Link>
                <Link href={link} className="btn-link text-[13px]">Refazer</Link>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
