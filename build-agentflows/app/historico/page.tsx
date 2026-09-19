"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Topbar, useStatus } from "@/components/ui";
import { RunView } from "@/components/RunView";
import { request } from "@/components/FlowEditor";
import type { Run } from "@/lib/flow-types";
export default function Page() {
  const {status,erro}=useStatus();
  const [runs, setRuns] = useState<Run[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const load = () =>
      request<Run[]>("/api/runs")
        .then(setRuns)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    void load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <Topbar
        marca="B"
        nome="Build Agentflows"
        area="Operações"
        status={status} erro={erro}
      />
      <main className="flows-main">
        <h1>Execuções</h1>
        <p>Acompanhe os resultados e responda às aprovações pendentes.</p>
        {error && <p role="alert">{error}</p>}
        {loading ? (
          <p>Carregando execuções…</p>
        ) : !runs.length ? (
          <div className="card flow-welcome">
            <h2>Nenhuma execução ainda</h2>
            <p>Abra um fluxo e faça o primeiro teste.</p>
            <Link className="btn-primary" href="/">
              Abrir fluxos
            </Link>
          </div>
        ) : (
          runs.map((r) => (
            <RunView
              key={r.id}
              run={r}
              onChange={(changed) =>
                setRuns((prev) =>
                  prev.map((x) => (x.id === changed.id ? changed : x)),
                )
              }
            />
          ))
        )}
      </main>
    </>
  );
}
