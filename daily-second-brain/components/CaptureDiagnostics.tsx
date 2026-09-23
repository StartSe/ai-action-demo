"use client";
import { useEffect, useState } from "react";
import type { CaptureEvent, CaptureTask } from "@/lib/capture-types";
import { request } from "./client";
import { toast } from "./Toast";

export function CaptureDiagnostics({ task }: { task: CaptureTask }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<CaptureEvent[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void request<{ events: CaptureEvent[] }>(
      `/api/captures?id=${encodeURIComponent(task.id)}`,
    )
      .then((data) => {
        if (alive) {
          setEvents(data.events);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [open, task.id, task.updated]);
  return (
    <details
      className="capture-diagnostics"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Ver diagnóstico da coleta</summary>
      {open && (
        <div>
          <div className="diagnostic-heading">
            <small>Coleta {task.id}</small>
            <button
              className="text-button"
              disabled={!events?.length}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    [
                      `Coleta ${task.id} · ${task.status}`,
                      ...(events || []).map(
                        (e) => `${e.created} [${e.stage}] ${e.message}`,
                      ),
                    ].join("\n"),
                  );
                  toast("Diagnóstico copiado.");
                } catch {
                  toast(
                    "Não foi possível copiar. Selecione o texto do diagnóstico.",
                    true,
                  );
                }
              }}
            >
              Copiar diagnóstico
            </button>
          </div>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : events === null ? (
            <p role="status">Carregando diagnóstico…</p>
          ) : !events.length ? (
            <p className="muted">
              Esta coleta é anterior aos registros detalhados. Repita a
              instrução para gerar um diagnóstico.
            </p>
          ) : (
            <ol className="diagnostic-events">
              {events.map((e) => (
                <li
                  key={e.id}
                  className={e.level === "error" ? "diagnostic-error" : ""}
                >
                  <time dateTime={e.created}>
                    {new Date(e.created).toLocaleTimeString("pt-BR")}
                  </time>
                  <div>
                    <strong>{e.stage}</strong>
                    <p>{e.message}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </details>
  );
}
