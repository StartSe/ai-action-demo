"use client";
import { useState } from "react";
import type { Run } from "@/lib/flow-types";
import { Icon, request } from "./StudioUI";
export const RUN_STATUS = {
  running: "Em execução",
  waiting: "Aguardando aprovação",
  completed: "Concluída",
  failed: "Falhou",
  cancelled: "Cancelada",
};
export function RunView({
  run,
  onChange,
  compact = false,
}: {
  run: Run;
  onChange?: (r: Run) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [tab, setTab] = useState<"output" | "steps" | "state">("output");
  async function decide(action: string, decision?: string) {
    setBusy(true);
    setError("");
    try {
      onChange?.(
        await request<Run>("/api/runs/" + run.id, "POST", { action, decision }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível continuar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={"studio-run " + (compact ? "compact" : "")}>
      <header>
        <div>
          <span className="run-provider">
            <Icon name={run.demo ? "play" : "spark"} size={15} />
            {run.demo ? "Demonstração" : "ChatGPT"} ·{" "}
            {run.version ? "v" + run.version : "rascunho"}
          </span>
          {!compact && <h2>{run.name}</h2>}
        </div>
        <span className={"execution-status " + run.status}>
          {RUN_STATUS[run.status]}
        </span>
      </header>
      {run.error && (
        <p role="alert" className="studio-error">
          {run.error}
        </p>
      )}
      {error && (
        <p role="alert" className="studio-error">
          {error}
        </p>
      )}
      <div className="run-tabs">
        <button
          className={tab === "output" ? "active" : ""}
          onClick={() => setTab("output")}
        >
          Resposta
        </button>
        <button
          className={tab === "steps" ? "active" : ""}
          onClick={() => setTab("steps")}
        >
          Etapas <span>{run.trace.length}</span>
        </button>
        <button
          className={tab === "state" ? "active" : ""}
          onClick={() => setTab("state")}
        >
          Estado
        </button>
      </div>
      {tab === "output" ? (
        <div className="run-response">
          {run.output || "Aguardando resposta…"}
        </div>
      ) : tab === "state" ? (
        <pre className="run-state">{JSON.stringify(run.state, null, 2)}</pre>
      ) : (
        <div className="run-timeline">
          {run.trace.map((t, i) => (
            <details key={i}>
              <summary>
                <span className="timeline-check">
                  <Icon name="check" size={12} />
                </span>
                <strong>{t.label}</strong>
                <small>
                  {t.ms < 1000 ? t.ms + " ms" : (t.ms / 1000).toFixed(1) + " s"}
                </small>
              </summary>
              <pre>{t.output}</pre>
            </details>
          ))}
        </div>
      )}
      {run.status === "waiting" && (
        <div className="approval-actions">
          <p>Este fluxo precisa da sua decisão.</p>
          <button
            className="studio-button primary"
            disabled={busy}
            onClick={() => decide("resume", "yes")}
          >
            Aprovar e continuar
          </button>
          <button
            className="studio-button"
            disabled={busy}
            onClick={() => decide("resume", "no")}
          >
            Rejeitar
          </button>
        </div>
      )}
      {["waiting", "running"].includes(run.status) && (
        <button
          className="studio-button subtle danger"
          disabled={busy}
          onClick={() => decide("cancel")}
        >
          <Icon name="stop" size={14} />
          Cancelar execução
        </button>
      )}
    </section>
  );
}
