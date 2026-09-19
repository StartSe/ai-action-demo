"use client";

import { useEffect, useRef, useState } from "react";

export default function DeleteConfirmation({ kind, title, onCancel, onConfirm }: {
  kind: "project" | "block";
  title: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => { element?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  async function confirm() {
    if (pending) return;
    setPending(true);
    setError("");
    try { await onConfirm(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível excluir. Tente novamente."); setPending(false); }
  }
  return (
    <dialog ref={dialog} className="cf-delete-dialog" aria-labelledby="delete-title" aria-describedby="delete-description" onCancel={(event) => { event.preventDefault(); if (!pending) onCancel(); }}>
      <button className="cf-delete-close" aria-label="Fechar confirmação" disabled={pending} onClick={onCancel}>×</button>
      <div className="cf-delete-symbol" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg></div>
      <h2 id="delete-title">Excluir {kind === "project" ? "projeto" : "bloco"}?</h2>
      <p id="delete-description">{kind === "project" ? <>O projeto <strong>“{title}”</strong> será excluído. Esta ação não pode ser desfeita.</> : <>O bloco <strong>“{title}”</strong> e suas conexões serão removidos deste fluxo.</>}</p>
      <p className="cf-delete-preserved">Seus arquivos continuam na biblioteca de Assets.</p>
      {error && <p className="cf-delete-error" role="alert">{error}</p>}
      <div className="cf-delete-actions">
        <button autoFocus disabled={pending} onClick={onCancel}>Cancelar</button>
        <button className="cf-delete-confirm" disabled={pending} onClick={() => void confirm()}>{pending ? "Excluindo…" : `Excluir ${kind === "project" ? "projeto" : "bloco"}`}</button>
      </div>
    </dialog>
  );
}
