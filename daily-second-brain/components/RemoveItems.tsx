"use client";
import { useEffect, useRef, useState } from "react";
import type { RemovalPlan, RemovalSelection } from "@/lib/removal";
import { request } from "./client";
import { Icon } from "./Icons";
export function RemoveItems({
  selection,
  close,
  done,
}: {
  selection: RemovalSelection;
  close: () => void;
  done: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [plan, setPlan] = useState<RemovalPlan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    let active = true;
    void request<RemovalPlan>("/api/brain", "POST", {
      action: "preview-delete",
      ...selection,
    })
      .then((p) => {
        if (active) setPlan(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      d?.close();
    };
  }, [selection]);
  return (
    <dialog
      ref={dialog}
      className="dialog removal-dialog"
      aria-labelledby="removal-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <button
        className="icon-button dialog-close"
        aria-label="Fechar exclusão"
        disabled={busy}
        onClick={close}
      >
        <Icon name="close" />
      </button>
      <span className="eyebrow">LIMPAR A ENTRADA</span>
      <h2 id="removal-title">Excluir estes itens?</h2>
      {!plan && !error && (
        <p role="status">Conferindo os itens relacionados…</p>
      )}
      {plan && (
        <>
          <p>
            Serão excluídas{" "}
            <strong>{plan.sourceIds.length} fonte(s) pendente(s)</strong> e{" "}
            <strong>{plan.taskIds.length} coleta(s)</strong>, incluindo etapas,
            diagnósticos, versões e arquivos dessas fontes.
          </p>
          {plan.running > 0 && (
            <p>
              As {plan.running} coleta(s) na fila ou em andamento serão
              interrompidas.
            </p>
          )}
          <p className="muted">
            {plan.preserved > 0
              ? `${plan.preserved} fonte(s) já usada(s) na memória serão preservadas. `
              : ""}
            Páginas da wiki e rotinas agendadas permanecem. Esta exclusão não
            pode ser desfeita.
          </p>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button className="button" autoFocus disabled={busy} onClick={close}>
          Manter itens
        </button>
        <button
          className="button danger"
          disabled={busy || !plan || !!error}
          onClick={async () => {
            setBusy(true);
            try {
              await request("/api/brain", "POST", {
                action: "delete",
                ...selection,
                token: plan!.token,
              });
              await done();
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Excluindo…" : "Excluir definitivamente"}
        </button>
      </div>
    </dialog>
  );
}
