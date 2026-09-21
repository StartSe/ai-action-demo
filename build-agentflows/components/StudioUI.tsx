"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { version } from "../package.json";
export type IconName =
  | "flows"
  | "runs"
  | "plus"
  | "search"
  | "grid"
  | "list"
  | "arrow"
  | "save"
  | "chat"
  | "code"
  | "more"
  | "close"
  | "copy"
  | "trash"
  | "download"
  | "upload"
  | "undo"
  | "redo"
  | "play"
  | "stop"
  | "spark"
  | "check"
  | "link"
  | "settings"
  | "start"
  | "agent"
  | "condition"
  | "state"
  | "http"
  | "tool"
  | "approval"
  | "loop"
  | "end"
  | "llm"
  | "moon"
  | "sun"
  | "logout"
  | "book"
  | "magnet"
  | "artboard"
  | "info"
  | "eraser"
  | "expand"
  | "pencil"
  | "history"
  | "chevron"
  | "whatsapp"
  | "call"
  | "mic"
  | "speaker";
const paths: Record<string, ReactNode> = {
  flows: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="15" y="15" width="6" height="6" rx="1.5" />
      <path d="M6 9v9h9M9 6h9v9" />
    </>
  ),
  runs: (
    <>
      <path d="M8 5H5v14h14v-3M12 4h8M12 8h8M9 13l3 3 8-8" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  arrow: <path d="m10 5-7 7 7 7M3 12h18" />,
  save: (
    <>
      <path d="M5 3h12l4 4v14H3V3zM7 3v6h10V3M7 21v-8h10v8" />
    </>
  ),
  chat: <path d="M21 11a9 9 0 0 1-9 9H4l-2 2 1-7a9 9 0 1 1 18-4Z" />,
  code: <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M16 8V3H3v13h5" />
    </>
  ),
  trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
  upload: <path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5" />,
  undo: <path d="M4 4v6h6M4 10c4-8 17-5 16 5v4" />,
  redo: <path d="M20 4v6h-6m6 0C16 2 3 5 4 15v4" />,
  play: <path d="m8 4 13 8-13 8z" />,
  stop: <rect x="5" y="5" width="14" height="14" rx="2" />,
  spark: <path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8z" />,
  check: <path d="m5 12 4 4L19 6" />,
  link: (
    <>
      <path d="m10 14 4-4m-6 7-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2-1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3z" />
    </>
  ),
  agent: (
    <>
      <rect x="4" y="7" width="16" height="13" rx="4" />
      <path d="M12 3v4M8 12v1m8-1v1m-7 4h6M2 11v5m20-5v5" />
    </>
  ),
  condition: (
    <>
      <path d="M6 3v5c0 5 12 3 12 9v4M6 8v13m-3-3 3 3 3-3m6 0 3 3 3-3" />
    </>
  ),
  state: <path d="M4 5h16M4 12h16M4 19h16M8 3v4m8 3v4M8 17v4" />,
  http: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </>
  ),
  tool: <path d="M14 5a5 5 0 0 0-6 6L2 17l5 5 6-6a5 5 0 0 0 6-6l-4 3-4-4z" />,
  approval: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a6 6 0 0 1 9-5m2 4 2 2 4-5" />
    </>
  ),
  loop: (
    <path d="M20 5v6h-6M4 19v-6h6M20 11a8 8 0 0 0-14-6m-2 8a8 8 0 0 0 14 6" />
  ),
  end: <path d="M21 11a9 9 0 0 1-9 9H4l-2 2 1-7a9 9 0 1 1 18-4Z" />,
  moon: <path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" />
    </>
  ),
  logout: <path d="M9 3H3v18h6m6-14 5 5-5 5M8 12h12" />,
  book: (
    <path d="M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1v16" />
  ),
  magnet: (
    <path d="M4 3h4v9a4 4 0 0 0 8 0V3h4v9a8 8 0 0 1-16 0zM4 8h4m8 0h4" />
  ),
  artboard: (
    <>
      <rect x="8" y="8" width="8" height="8" rx="1" />
      <path d="M3 8h2m14 0h2M3 16h2m14 0h2M8 3v2m8-2v2M8 19v2m8-2v2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </>
  ),
  eraser: (
    <path d="m19 20-9 0M5 14l9-9 6 6-7 7H8zM12 7l6 6" />
  ),
  expand: <path d="M16 4h4v4m-4-4-6 6M8 20H4v-4m4 4 6-6" />,
  pencil: <path d="M4 20h4L19 9a2.1 2.1 0 0 0-4-4L4 16zm9.5-13.5 4 4" />,
  history: <path d="M12 8v4l3 3M3.05 11a9 9 0 1 0 .5-4M3 3v5h5" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  call: (
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8" />
    </>
  ),
  speaker: (
    <path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
  ),
  whatsapp: (
    <>
      <path d="M3 21l1.6-4.6A8.5 8.5 0 1 1 8 19.6z" />
      <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1a4 4 0 0 1-2-2l1-1-1-2z" />
    </>
  ),
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths[name === "start" ? "play" : "spark"]}
    </svg>
  );
}
export function IconButton({
  icon,
  label,
  onClick,
  disabled = false,
  active = false,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={"studio-icon-button" + (active ? " active" : "")}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}
export async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch(url, {
    method,
    headers:
      body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={"studio-modal" + (wide ? " wide" : "")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        {typeof title === "string" ? <h2>{title}</h2> : title}
        <IconButton icon="close" label="Fechar diálogo" onClick={onClose} />
      </header>
      <div className="studio-modal-body">{children}</div>
    </dialog>
  );
}
export function StudioShell({
  children,
  active,
  onConnect,
  connected,
}: {
  children: ReactNode;
  active: "flows" | "runs" | "connections";
  onConnect: () => void;
  connected?: boolean;
}) {
  const router = useRouter();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const value = localStorage.getItem("agentflows-theme") === "dark";
    document.documentElement.dataset.studioTheme = value ? "dark" : "light";
    const timer = setTimeout(() => setDark(value), 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="studio-shell">
      <aside className="studio-nav">
        <Link href="/" className="studio-brand">
          <span className="brand-mark">
            <Icon name="flows" size={23} />
          </span>
          <span>
            Build<span className="brand-light"> Agentflows</span>
          </span>
        </Link>
        <div className="studio-nav-label">Workspace</div>
        <nav>
          <Link className={active === "flows" ? "active" : ""} href="/">
            <Icon name="flows" />
            Agentflows
          </Link>
          <Link className={active === "runs" ? "active" : ""} href="/historico">
            <Icon name="runs" />
            Execuções
          </Link>
          <Link
            className={active === "connections" ? "active" : ""}
            href="/conexoes"
          >
            <Icon name="link" />
            Conexões
          </Link>
        </nav>
        <div className="studio-nav-bottom">
          <button className="studio-account" onClick={onConnect}>
            <span
              className={"connection-dot " + (connected ? "connected" : "")}
            />
            <span>{connected ? "ChatGPT conectado" : "Conectar ChatGPT"}</span>
            <Icon name="link" size={16} />
          </button>
          <div className="studio-nav-utilities">
            <button
              onClick={() => {
                const value = !dark;
                setDark(value);
                document.documentElement.dataset.studioTheme = value
                  ? "dark"
                  : "light";
                localStorage.setItem(
                  "agentflows-theme",
                  value ? "dark" : "light",
                );
              }}
            >
              <Icon name={dark ? "sun" : "moon"} size={17} />
              {dark ? "Tema claro" : "Tema escuro"}
            </button>
            <button
              title="Sair da conta"
              aria-label="Sair da conta"
              onClick={async () => {
                await fetch("/api/conta/sair", { method: "POST" });
                router.push("/entrar");
              }}
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
          <small>Build Agentflows {version}</small>
        </div>
      </aside>
      <div className="studio-content">{children}</div>
    </div>
  );
}
