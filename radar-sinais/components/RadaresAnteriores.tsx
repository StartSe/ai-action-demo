"use client";
// Lista compacta dos últimos radares salvos (GET /api/radar), no fim de /radar: abre o radar salvo
// (/r/[id]) ou refaz a pesquisa com os mesmos temas. Não é um item de menu, por decisão de 19/09/2026.
import { DadosTeste } from "./DadosTeste";
import Link from "next/link";
import { useEffect, useState } from "react";
import { data } from "@/lib/formato";
import type { DadosRadar } from "@/lib/types";

type Item = { id: string; titulo: string; criadoEm: string; demo: boolean; entrada: DadosRadar };

export function RadaresAnteriores({ atual, atualizadoEm, aoRemoverExemplos }: { atual?: string; atualizadoEm?: string; aoRemoverExemplos?: () => void }) {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [revisao, setRevisao] = useState(0);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    let ativo = true;
    fetch("/api/radar")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("falha"))))
      .then((d) => { if (ativo) setItens(d.itens ?? []); })
      .catch(() => { if (ativo) setFalhou(true); });
    return () => { ativo = false; };
  }, [atualizadoEm, revisao]);
  if (falhou) return <p role="alert" className="mt-4">Não foi possível carregar os radares anteriores.</p>;
  if (!itens) return null;
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
                  {data(r.criadoEm, { comHora: true })} · últimos {r.entrada.periodoDias} dias{r.id === atual ? " · este radar" : ""}{r.demo ? " · demonstração" : ""}
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
      {itens.length === 0 && <p className="text-sm text-muted">Nenhum radar salvo.</p>}
      <DadosTeste key={atualizadoEm} aoRemover={() => { setRevisao(v => v + 1); aoRemoverExemplos?.(); }} />
    </section>
  );
}
