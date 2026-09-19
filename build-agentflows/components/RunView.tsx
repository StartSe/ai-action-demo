"use client";
import { useState } from "react";
import type { Run } from "@/lib/flow-types";
const status = {
  running: "Em execução",
  waiting: "Aguardando aprovação",
  completed: "Concluída",
  failed: "Falhou",
  cancelled: "Cancelada",
};
export function RunView({
  run,
  onChange,
}: {
  run: Run;
  onChange?: (r: Run) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function decide(action: string, decision?: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/runs/" + run.id, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, decision }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      onChange?.(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="run-view card">
      <div className="run-heading">
        <div>
          <p className="eyebrow">
            Execução {run.demo ? "demonstrativa" : "real"} ·{" "}
            {run.version ? "v" + run.version : "rascunho"}
          </p>
          <h2>{run.name}</h2>
        </div>
        <span className={"run-status status-" + run.status}>
          {status[run.status]}
        </span>
      </div>
      {run.error && (
        <p role="alert" className="flow-error">
          {run.error}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="run-columns">
        <div>
          <h3>Etapas percorridas</h3>
          {run.trace.map((t, i) => (
            <details key={i} className="trace-step">
              <summary>
                <span>
                  {i + 1}. {t.label}
                </span>
                <small>{t.ms} ms</small>
              </summary>
              <pre>{t.output}</pre>
            </details>
          ))}
        </div>
        <div>
          <h3>Resultado</h3>
          <pre className="run-output">
            {run.output || "Aguardando a primeira resposta…"}
          </pre>
          {run.status === "waiting" && (
            <div className="toolbar">
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() => decide("resume", "yes")}
              >
                Aprovar e continuar
              </button>
              <button
                className="btn-ghost"
                disabled={busy}
                onClick={() => decide("resume", "no")}
              >
                Rejeitar e continuar
              </button>
            </div>
          )}
          {["waiting", "running"].includes(run.status) && (
            <button
              className="delete-button"
              disabled={busy}
              onClick={() => decide("cancel")}
            >
              Cancelar execução
            </button>
          )}
          <details>
            <summary>Estado compartilhado</summary>
            <pre>{JSON.stringify(run.state, null, 2)}</pre>
          </details>
        </div>
      </div>
    </section>
  );
}
