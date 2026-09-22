"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Toast = {
  id: number;
  message: string;
  tone: "error" | "success" | "info";
  action?: { label: string; run: () => void };
};
export function useFlowMessages() {
  const [messages, setMessages] = useState<Toast[]>([]);
  const sequence = useRef(0);
  const dismiss = useCallback(
    (id: number) =>
      setMessages((items) => items.filter((item) => item.id !== id)),
    [],
  );
  const notify = useCallback(
    (
      message: string,
      tone: Toast["tone"] = "info",
      action?: Toast["action"],
    ) => {
      const id = ++sequence.current;
      setMessages((items) => [
        ...items.filter((item) => item.message !== message).slice(-3),
        { id, message, tone, action },
      ]);
    },
    [],
  );
  const setError = useCallback(
    (message: string) => {
      if (message) notify(message, "error");
      else
        setMessages((items) => items.filter((item) => item.tone !== "error"));
    },
    [notify],
  );
  const setNotice = useCallback(
    (message: string) => {
      if (message) notify(message);
    },
    [notify],
  );
  return { messages, dismiss, notify, setError, setNotice };
}
function ToastMessage({
  toast,
  dismiss,
}: {
  toast: Toast;
  dismiss: (id: number) => void;
}) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (toast.tone === "error" || paused) return;
    const timer = setTimeout(() => dismiss(toast.id), 8000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.tone, dismiss, paused]);
  return (
    <div
      className={`cf-toast-item ${toast.tone}`}
      role={toast.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
      }}
    >
      <span className="cf-toast-symbol" aria-hidden="true">
        {toast.tone === "error" ? "!" : toast.tone === "success" ? "✓" : "i"}
      </span>
      <div>
        <p>{toast.message}</p>
        {toast.action && (
          <button
            className="cf-toast-action"
            onClick={() => {
              toast.action?.run();
              dismiss(toast.id);
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        className="cf-toast-close"
        aria-label="Fechar mensagem"
        onClick={() => dismiss(toast.id)}
      >
        ×
      </button>
    </div>
  );
}
export function FlowToasts({
  messages,
  dismiss,
}: {
  messages: Toast[];
  dismiss: (id: number) => void;
}) {
  return (
    <section className="cf-toasts" aria-label="Notificações">
      {messages.map((toast) => (
        <ToastMessage key={toast.id} toast={toast} dismiss={dismiss} />
      ))}
    </section>
  );
}
export function FlowDialog({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => {
      element?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`cf-modal cf-dialog ${className}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
export function FlowSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="cf-loading-grid">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <div className="cf-loading-card" aria-hidden="true" key={i}>
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ))}
    </div>
  );
}
