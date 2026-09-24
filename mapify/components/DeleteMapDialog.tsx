"use client";
import { useEffect, useRef, useState } from "react";
import { ErrorBox, Icon, Modal, request } from "./ui";

export function DeleteMapDialog({
  map,
  onClose,
  onDeleted,
}: {
  map: { id: string; title: string };
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const keepButton = useRef<HTMLButtonElement>(null);
  useEffect(() => keepButton.current?.focus(), []);
  async function remove() {
    if (inFlight.current) return;
    inFlight.current = true;
    setDeleting(true);
    setError("");
    try {
      await request(`/api/maps/${map.id}`, "DELETE");
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
      inFlight.current = false;
    }
  }
  return (
    <Modal
      title="Excluir este mapa?"
      onClose={onClose}
      dismissible={!deleting}
      className="delete-map-dialog"
    >
      <p>
        O mapa <strong>“{map.title}”</strong>, suas edições e a conversa serão
        excluídos. Esta ação não pode ser desfeita.
      </p>
      <ErrorBox error={error} />
      <div className="modal-footer">
        <button
          className="secondary"
          onClick={onClose}
          disabled={deleting}
          ref={keepButton}
        >
          Manter mapa
        </button>
        <button
          className="primary danger-button"
          onClick={remove}
          disabled={deleting}
        >
          {deleting ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <Icon name="trash" size={16} />
          )}
          {deleting ? "Excluindo…" : "Excluir mapa"}
        </button>
      </div>
    </Modal>
  );
}
