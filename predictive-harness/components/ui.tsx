"use client";
import { AppVersion } from "./AppVersion";
import { useEffect, useRef, type ReactNode } from "react";
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    harness: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v4m0 10v4M3 12h4m10 0h4" />
        <path d="m5.6 5.6 2.8 2.8m7.2 7.2 2.8 2.8M5.6 18.4l2.8-2.8m7.2-7.2 2.8-2.8" />
      </>
    ),
    table: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M9 4v16" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    chat: <path d="M21 11a9 9 0 0 1-9 9H4l-2 2 1-7a9 9 0 1 1 18-4Z" />,
    send: <path d="m3 3 19 9-19 9 3-9zm3 9h16" />,
    settings: (
      <>
        <path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    spark: <path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6zM21 2v4m-2-2h4" />,
    link: <path d="m10 14 4-4m-6 6-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2-1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" />,
    upload: <path d="M12 16V3M7 8l5-5 5 5M4 16v5h16v-5" />,
    trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8h.01M12 12v5" />
      </>
    ),
    logout: <path d="M9 3H3v18h6m6-14 5 5-5 5M8 12h12" />,
    arrow: <path d="m10 5-7 7 7 7M3 12h18" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
    refresh: <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />,
    gauge: (
      <>
        <path d="M4 15a8 8 0 1 1 16 0" />
        <path d="m12 15 4-5" />
        <circle cx="12" cy="15" r="1.5" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4m8-4v4" />
      </>
    ),
    hash: <path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18" />,
    text: <path d="M4 6h16M4 12h10M4 18h14" />,
    pin: (
      <>
        <path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    tag: <path d="M3 3h9l9 9-9 9-9-9zM8 8h.01" />,
    percent: <path d="M19 5 5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm9 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />,
    coins: (
      <>
        <ellipse cx="12" cy="6" rx="8" ry="3" />
        <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </>
    ),
    edit: <path d="M4 20h4l10-10-4-4L4 16v4zM13 7l4 4" />,
    eye: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.harness}
    </svg>
  );
}
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={"logo" + (compact ? " compact" : "")}>
      <span className="logo-mark">
        <Icon name="harness" size={compact ? 19 : 23} />
      </span>
      <span className="logo-wordmark">Cowork FPEA<AppVersion /></span>
    </span>
  );
}
export function IconButton({ icon, label, onClick, disabled, active }: { icon: string; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button type="button" className={"icon-button" + (active ? " active" : "")} title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal" + (wide ? " wide" : "")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <IconButton icon="close" label="Fechar" onClick={onClose} />
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export async function request<T>(url: string, method = "GET", body?: unknown, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body !== undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    ...init,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data as T;
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div className="error-box" role="alert">
      <Icon name="info" size={18} />
      <span>{error}</span>
    </div>
  ) : null;
}
export const fmtPct = (p: number | null | undefined) => (p === null || p === undefined ? "" : `${Math.round(p * 100)}%`);
export const fmtUsd = (v: number) => (v < 0.01 ? `US$ ${v.toFixed(5)}` : `US$ ${v.toFixed(3)}`);
export const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1).replace(".", ",")} s` : `${Math.round(ms)} ms`);
