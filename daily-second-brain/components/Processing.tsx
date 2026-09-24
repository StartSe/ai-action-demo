"use client";
import type { BrainState, Note, OrganizationJob } from "@/lib/types";
import { sourcePreview } from "@/lib/source-preview";
import { Icon } from "./Icons";

export function processingActive(job?: OrganizationJob) {
  return job?.status === "queued" || job?.status === "running";
}
export function Processing({
  jobs = {},
  notes,
  open,
  retry,
  dismiss,
  submitting,
  syncError,
  refresh,
}: {
  jobs?: BrainState["sourceProcessing"];
  notes: Note[];
  open: (note: Note) => void;
  retry: (ids: string[]) => Promise<boolean>;
  dismiss: () => void;
  submitting: boolean;
  syncError: string;
  refresh: () => void;
}) {
  const visible = Object.values(jobs).filter((j) => !j.dismissed);
  const active = visible.filter(processingActive);
  const done = visible.filter((j) => j.status === "done");
  const failed = visible.filter((j) => j.status === "failed");
  if (!visible.length && !syncError) return null;
  return (
    <section
      className="processing-panel"
      aria-label="Processamento das memórias"
    >
      <div className="processing-heading">
        <Icon
          name={active.length ? "spark" : failed.length ? "info" : "check"}
          size={20}
        />
        <div className="processing-summary" role="status" aria-live="polite">
          <strong>
            {active.length
              ? `Organizando ${active.length} fonte(s) em segundo plano`
              : failed.length
                ? "Algumas fontes precisam de atenção"
                : "Memórias organizadas com sucesso"}
          </strong>
          <span>
            {done.length + failed.length} de {visible.length} finalizadas ·{" "}
            {done.length} na wiki
            {failed.length ? ` · ${failed.length} com falha` : ""}
          </span>
        </div>
        {done.length > 0 && (
          <button className="text-button" onClick={dismiss}>
            Limpar concluídas
          </button>
        )}
      </div>
      {visible.length > 0 && (
        <progress
          aria-label="Fontes finalizadas"
          value={done.length + failed.length}
          max={visible.length}
        />
      )}
      {active.length > 0 && (
        <p className="muted">
          Pode continuar usando Daily ou fechar esta aba. O processamento
          continua.
        </p>
      )}
      {syncError && (
        <p className="error" role="alert">
          {syncError}{" "}
          <button className="text-button" onClick={refresh}>
            Atualizar agora
          </button>
        </p>
      )}
      {visible.length > 0 && (
        <details>
          <summary>
            Acompanhar fontes
            {failed.length ? ` · ${failed.length} com falha` : ""}
          </summary>
          <ul className="processing-list">
            {visible.map((job) => {
              const source = notes.find((n) => n.id === job.sourceId);
              const page = notes.find((n) => n.id === job.pageId);
              return (
                <li key={job.id} data-processing-id={job.sourceId}>
                  <div>
                    <button
                      className="text-button processing-title"
                      onClick={() => source && open(source)}
                    >
                      {source ? sourcePreview(source).title : "Fonte"}
                    </button>
                    <span
                      className={
                        job.status === "failed" ? "danger-text" : "muted"
                      }
                    >
                      {job.phase}
                    </span>
                    {job.error && <p className="error">{job.error}</p>}
                  </div>
                  {page && (
                    <button className="text-button" onClick={() => open(page)}>
                      Abrir na wiki <Icon name="arrow" size={14} />
                    </button>
                  )}
                  {job.status === "failed" && (
                    <button
                      className="button"
                      disabled={submitting}
                      onClick={() => void retry([job.sourceId])}
                    >
                      Tentar novamente
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {failed.length > 1 && (
            <button
              className="button"
              disabled={submitting}
              onClick={() =>
                void retry(failed.slice(0, 100).map((j) => j.sourceId))
              }
            >
              Tentar fontes com falha novamente
            </button>
          )}
        </details>
      )}
    </section>
  );
}
