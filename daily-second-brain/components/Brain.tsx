"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BrainState, Note, Settings } from "@/lib/types";
import { Icon } from "./Icons";
import { Graph } from "./Graph";
import { Markdown } from "./Markdown";
import { Connections } from "./Connections";
import { request } from "./client";
import { Captures } from "./Captures";
import { Onboarding } from "./Onboarding";
import type { CaptureState, SetupState } from "@/lib/capture-types";
import { APP_VERSION } from "@/lib/version";
type View =
  | "home"
  | "graph"
  | "raw"
  | "wiki"
  | "outputs"
  | "chat"
  | "connections"
  | "captures"
  | "setup"
  | "rules";
const NAV: { id: View; label: string; icon: string }[] = [
  { id: "home", label: "Visão do dia", icon: "sun" },
  { id: "captures", label: "Coletas e rotinas", icon: "zap" },
  { id: "graph", label: "Mapa da memória", icon: "graph" },
  { id: "raw", label: "Caixa de entrada", icon: "inbox" },
  { id: "wiki", label: "Minha wiki", icon: "book" },
  { id: "outputs", label: "Artefatos", icon: "spark" },
  { id: "chat", label: "Conversar com Daily", icon: "chat" },
];
const LABELS = {
  raw: "Fonte original",
  wiki: "Página da wiki",
  outputs: "Artefato",
};
function date(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}
function Dialog({
  children,
  close,
  wide = false,
  label,
}: {
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
  label: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const d = ref.current;
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "dialog wide" : "dialog"}
      onCancel={close}
      aria-label={label}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <button
        className="icon-button dialog-close"
        aria-label="Fechar"
        onClick={close}
      >
        <Icon name="close" />
      </button>
      {children}
    </dialog>
  );
}
export function Brain() {
  const [initializing, setInitializing] = useState(true);
  const [state, setState] = useState<BrainState | null>(null);
  const [captures, setCaptures] = useState<CaptureState>({
    tasks: [],
    schedules: [],
  });
  const [setup, setSetup] = useState<SetupState | null>(null);
  const captureVersion = useRef("");
  const [settings, setSettings] = useState<Settings>({
    provider: "chatgpt",
    model: "",
    openrouter: false,
    elevenlabs: false,
    zapier: false,
    voice: "",
  });
  const [view, setView] = useState<View>("home");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [capture, setCapture] = useState(false);
  const [selected, setSelected] = useState<Note | null>(null);
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState<Note[] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [artifact, setArtifact] = useState(false);
  const [clearingDemo, setClearingDemo] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [recording, setRecording] = useState(false);
  const [ruleDraft, setRuleDraft] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const voiceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatBottom = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [captureTitle, setCaptureTitle] = useState("");
  const [captureContent, setCaptureContent] = useState("");
  const load = useCallback(async () => {
    const s = await request<BrainState>("/api/brain");
    setState(s);
    return s;
  }, []);
  const loadCaptures = useCallback(async () => {
    const s = await request<CaptureState>("/api/captures");
    setCaptures(s);
    const version = JSON.stringify(
      s.tasks.map((t) => [t.id, t.sources, t.pages, t.status]),
    );
    if (captureVersion.current && captureVersion.current !== version)
      await load();
    captureVersion.current = version;
  }, [load]);
  const refreshCaptures = useCallback(async () => {
    await Promise.all([loadCaptures(), load()]);
  }, [loadCaptures, load]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const q = new URLSearchParams(location.search);
        const tab = q.get("view");
        if (
          tab &&
          [
            "home",
            "graph",
            "raw",
            "wiki",
            "outputs",
            "chat",
            "connections",
            "captures",
            "setup",
            "rules",
          ].includes(tab)
        )
          setView(tab as View);
        if (q.get("exemplo") === "1")
          await request("/api/brain", "POST", { action: "seed" });
        const [s, c] = await Promise.all([
          request<BrainState>("/api/brain"),
          request<Settings>("/api/settings"),
        ]);
        if (!cancelled) {
          setState(s);
          setSettings(c);
        }
        await loadCaptures();
        const intro = await request<SetupState>("/api/onboarding");
        if (!cancelled) {
          setSetup(intro);
          if (intro.status === "new" && !tab && q.get("exemplo") !== "1")
            setView("setup");
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCaptures]);
  useEffect(() => {
    const timer = setInterval(() => void loadCaptures().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [loadCaptures]);
  useEffect(() => {
    if (view !== "setup") return;
    const timer = setInterval(
      () =>
        void request<SetupState>("/api/onboarding")
          .then(setSetup)
          .catch(() => {}),
      3000,
    );
    return () => clearInterval(timer);
  }, [view]);
  useEffect(() => {
    if (view === "captures" || view === "setup")
      void request<SetupState>("/api/onboarding")
        .then(setSetup)
        .catch(() => {});
  }, [view]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 5000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    if (view === "chat")
      chatBottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state?.messages.length, view, busy]);
  useEffect(
    () => () => {
      if (voiceTimer.current) clearTimeout(voiceTimer.current);
      stream.current?.getTracks().forEach((t) => t.stop());
      audio.current?.pause();
    },
    [],
  );
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        e.key.toLowerCase() !== "n" ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        document.querySelector("dialog[open]") ||
        (e.target instanceof HTMLElement &&
          (e.target.isContentEditable ||
            /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)))
      )
        return;
      e.preventDefault();
      setView("captures");
      historyReplace("captures");
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  function go(v: View) {
    setView(v);
    setSearch("");
    setMobile(false);
    historyReplace(v);
  }
  function historyReplace(v: View) {
    window.history.replaceState(null, "", v === "home" ? "/" : `/?view=${v}`);
  }
  function open(n: Note) {
    setSelected(n);
    setEditing(false);
    setHistory(null);
  }
  async function act<T>(
    key: string,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    setBusy(key);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function action(action: string, data: Record<string, unknown> = {}) {
    return request<Note>("/api/brain", "POST", { action, ...data });
  }
  async function organize(n: Note) {
    await act("organize", async () => {
      const wiki = await action("organize", { id: n.id });
      await load();
      open(wiki);
      setNotice("Fonte conectada à sua wiki.");
    });
  }
  async function send(text = prompt) {
    if (!text.trim() || busy) return;
    go("chat");
    setPrompt("");
    await act("chat", async () => {
      try {
        await action("chat", { prompt: text });
        await load();
      } catch (e) {
        setPrompt(text);
        await load();
        throw e;
      }
    });
  }
  async function speak(text: string) {
    await act("voice", async () => {
      audio.current?.pause();
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw Error((await res.json()).error);
      const url = URL.createObjectURL(await res.blob());
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => URL.revokeObjectURL(url);
      await a.play();
    });
  }
  async function record() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (!settings.elevenlabs) {
      go("connections");
      setNotice("Conecte a ElevenLabs para conversar por voz.");
      return;
    }
    await act("microphone", async () => {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw Error(
          "Este navegador não oferece gravação. Use um navegador atualizado com HTTPS.",
        );
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const r = new MediaRecorder(s);
      recorder.current = r;
      const chunks: BlobPart[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        setRecording(false);
        s.getTracks().forEach((t) => t.stop());
        if (voiceTimer.current) clearTimeout(voiceTimer.current);
        void act("transcribe", async () => {
          const f = new FormData();
          f.set("audio", new Blob(chunks, { type: r.mimeType }), "audio.webm");
          const res = await fetch("/api/voice", { method: "POST", body: f });
          const j = await res.json();
          if (!res.ok) throw Error(j.error);
          setPrompt(j.text || "");
          setNotice("Revise a transcrição antes de enviar.");
        });
      };
      r.start();
      setRecording(true);
      voiceTimer.current = setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 60000);
    });
  }
  const notes = state?.notes || [];
  const wiki = notes.filter((n) => n.kind === "wiki");
  const inbox = notes.filter((n) => n.kind === "raw" && n.status === "inbox");
  const outputs = notes.filter((n) => n.kind === "outputs");
  const connections = wiki.reduce(
    (s, n) =>
      s +
      [...n.content.matchAll(/\[\[([^\]]+)\]\]/g)].filter((m) =>
        wiki.some((w) => w.title === m[1]),
      ).length,
    0,
  );
  const found = notes.filter((n) =>
    (n.title + " " + n.content + " " + n.tags.join(" "))
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  const isDemo = notes.length > 0 && notes.every((n) => n.demo);
  function cards(list: Note[], compact = false) {
    return (
      <div className={compact ? "note-list" : "note-grid"}>
        {list.map((n) => (
          <button
            key={n.id}
            className={`note-card ${n.kind}`}
            onClick={() => open(n)}
          >
            <span className="note-card-icon">
              <Icon
                name={
                  n.kind === "wiki"
                    ? "book"
                    : n.kind === "outputs"
                      ? "spark"
                      : "file"
                }
                size={18}
              />
            </span>
            <div>
              <span className="note-overline">
                {LABELS[n.kind]}
                {n.demo ? " · exemplo" : ""}
              </span>
              <h3>{n.title}</h3>
              {!compact && (
                <p>{n.content.replace(/[#*\[\]]/g, "").slice(0, 135)}…</p>
              )}
              <div className="note-meta">
                <span>{date(n.updated)}</span>
                {n.tags.slice(0, 2).map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
                {n.kind === "raw" && (
                  <span
                    className={
                      n.status === "inbox" ? "pending-tag" : "ready-tag"
                    }
                  >
                    {n.status === "inbox" ? "A organizar" : "Na wiki"}
                  </span>
                )}
              </div>
            </div>
            <Icon name="chevron" size={15} />
          </button>
        ))}
      </div>
    );
  }
  function empty(title: string, description: string, icon = "brain") {
    return (
      <div className="empty">
        <Icon name={icon} size={36} />
        <h2>{title}</h2>
        <p>{description}</p>
        <button
          className="button primary"
          onClick={() => {
            setCapture(true);
            setCaptureTitle("");
            setCaptureContent("");
          }}
        >
          <Icon name="plus" size={17} />
          Capturar memória
        </button>
      </div>
    );
  }
  return (
    <div className="shell">
      <aside className={`sidebar ${mobile ? "visible" : ""}`}>
        <Link className="brand" href="/">
          <span className="brand-icon">
            <Icon name="brain" size={26} />
          </span>
          <span>
            daily<small>SECOND BRAIN</small>
            <span className="version" aria-label={`Versão ${APP_VERSION}`}>
              v{APP_VERSION}
            </span>
          </span>
        </Link>
        <button
          className="capture-button"
          aria-label="Capturar memória"
          onClick={() => {
            go("captures");
          }}
        >
          <Icon name="plus" size={17} /> Capturar memória <kbd>N</kbd>
        </button>
        <span className="nav-label">MEU ESPAÇO</span>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "active" : ""}
              onClick={() => go(n.id)}
            >
              <Icon name={n.icon} size={18} />
              <span>{n.label}</span>
              {n.id === "raw" && inbox.length > 0 && <em>{inbox.length}</em>}
              {n.id === "captures" &&
                captures.tasks.some((t) =>
                  ["queued", "running"].includes(t.status),
                ) && <span className="live-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="memory-flow">
            <span>INFORMAÇÃO VIRA AÇÃO</span>
            <div>
              <i />
              raw <Icon name="arrow" size={12} />
              <i />
              wiki <Icon name="arrow" size={12} />
              <i />
              outputs
            </div>
          </div>
          <nav>
            <button
              className={view === "setup" ? "active" : ""}
              onClick={() => go("setup")}
            >
              <Icon name="sun" size={18} />
              Configuração
            </button>
            <button
              className={view === "connections" ? "active" : ""}
              onClick={() => go("connections")}
            >
              <Icon name="plug" size={18} />
              Conexões
              <span className="little-dot" />
            </button>
            <button
              className={view === "rules" ? "active" : ""}
              onClick={() => go("rules")}
            >
              <Icon name="settings" size={18} />
              Regras da memória
            </button>
          </nav>
          <div className="profile">
            <span className="avatar">EU</span>
            <div>
              <strong>Meu segundo cérebro</strong>
              <small>Espaço pessoal</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sair"
              onClick={() =>
                void act("logout", async () => {
                  await request("/api/conta/sair", "POST");
                  window.location.assign(
                    new URL("/entrar", window.location.origin).href,
                  );
                })
              }
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="mobile-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Abrir menu"
            onClick={() => setMobile(true)}
          >
            <Icon name="menu" />
          </button>
          <span className="breadcrumb">
            Meu espaço <Icon name="chevron" size={12} />
            <strong>
              {NAV.find((n) => n.id === view)?.label ||
                (view === "connections"
                  ? "Conexões"
                  : view === "setup"
                    ? "Configuração"
                    : "Regras da memória")}
            </strong>
          </span>
          <div className="topbar-right">
            <label className="search">
              <Icon name="search" size={16} />
              <input
                aria-label="Buscar na memória"
                placeholder="Buscar na memória…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button aria-label="Limpar busca" onClick={() => setSearch("")}>
                  <Icon name="close" size={14} />
                </button>
              )}
            </label>
            <span className="private-label">
              <Icon name="shield" size={14} /> Pessoal
            </span>
          </div>
        </header>
        {error && (
          <div className="global-error" role="alert">
            <span>{error}</span>
            <button
              className="icon-button"
              aria-label="Fechar aviso"
              onClick={() => setError("")}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            <Icon name="check" size={17} />
            {notice}
          </div>
        )}
        {!state || initializing ? (
          <div className="loading">
            <div className="loading-orb" />
            <p>Conectando sua memória…</p>
            {error && (
              <button className="button" onClick={() => void act("load", load)}>
                Tentar novamente
              </button>
            )}
          </div>
        ) : search ? (
          <main className="main">
            <div className="page-heading">
              <span className="eyebrow">BUSCA NA MEMÓRIA</span>
              <h1>Ideias que se encontram.</h1>
              <p>
                {found.length} resultado(s) para “{search}”
              </p>
            </div>
            {cards(found)}
            {!found.length && (
              <p>Nenhuma memória encontrada. Tente outro assunto.</p>
            )}
          </main>
        ) : (
          <main className={`main view-${view}`}>
            {view === "home" && (
              <>
                <div className="home-heading">
                  <div>
                    <span className="eyebrow">
                      <span className="live-dot" /> UM NOVO DIA. NOVAS CONEXÕES.
                    </span>
                    <h1>
                      Sua mente, <span>expandida.</span>
                    </h1>
                    <p>O que você sabe é só o começo. Veja o que se conecta.</p>
                  </div>
                  <button
                    className="button"
                    disabled={!!busy}
                    onClick={() => {
                      setArtifact(true);
                      setPrompt(
                        "Meu briefing do dia: decisões, conexões e próximos passos",
                      );
                    }}
                  >
                    <Icon name="spark" size={17} /> Meu briefing do dia{" "}
                    <Icon name="arrow" size={15} />
                  </button>
                </div>
                {isDemo && (
                  <div className="demo-banner">
                    <span>
                      <Icon name="spark" size={15} /> Você está explorando
                      memórias de exemplo.
                    </span>
                    <button onClick={() => go("connections")}>
                      Conectar minha IA <Icon name="arrow" size={14} />
                    </button>
                  </div>
                )}
                {setup?.status !== "complete" && (
                  <div className="setup-banner">
                    <Icon name="brain" size={22} />
                    <div>
                      <strong>
                        Prepare sua memória para trabalhar com você.
                      </strong>
                      <p>
                        Conecte a IA, escolha suas fontes e inicie uma coleta
                        guiada.
                      </p>
                    </div>
                    <button className="button" onClick={() => go("setup")}>
                      Abrir configuração <Icon name="arrow" size={14} />
                    </button>
                  </div>
                )}
                <button
                  className="capture-home-banner"
                  onClick={() => go("captures")}
                >
                  <span className="mini-orb">
                    <Icon name="zap" size={23} />
                  </span>
                  <span>
                    <strong>
                      {captures.tasks.some((t) =>
                        ["queued", "running"].includes(t.status),
                      )
                        ? "Daily está cuidando das suas coletas."
                        : "Peça ao Daily para buscar e organizar."}
                    </strong>
                    <small>
                      Slack, e-mails e outras fontes → sua wiki. Uma vez ou
                      todos os dias.
                    </small>
                  </span>
                  <Icon name="arrow" size={19} />
                </button>
                <div className="stats">
                  {[
                    {
                      label: "Memórias capturadas",
                      value: notes.filter((n) => n.kind === "raw").length,
                      icon: "inbox",
                      hint: `${inbox.length} para organizar`,
                      v: "raw",
                    },
                    {
                      label: "Páginas na sua wiki",
                      value: wiki.length,
                      icon: "book",
                      hint: "Conhecimento conectado",
                      v: "wiki",
                    },
                    {
                      label: "Conexões entre ideias",
                      value: connections,
                      icon: "graph",
                      hint: "Contexto que faz sentido",
                      v: "graph",
                    },
                    {
                      label: "Artefatos criados",
                      value: outputs.length,
                      icon: "spark",
                      hint: "Da memória para a ação",
                      v: "outputs",
                    },
                  ].map((s) => (
                    <button key={s.label} onClick={() => go(s.v as View)}>
                      <div>
                        <span>{s.label}</span>
                        <Icon name={s.icon} size={17} />
                      </div>
                      <strong>{String(s.value).padStart(2, "0")}</strong>
                      <small>{s.hint}</small>
                    </button>
                  ))}
                </div>
                <div className="home-grid">
                  <section className="map-panel">
                    <div className="section-heading">
                      <div>
                        <Icon name="graph" size={18} />
                        <h2>Seu universo de ideias</h2>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => go("graph")}
                      >
                        Explorar mapa <Icon name="arrow" size={14} />
                      </button>
                    </div>
                    <Graph notes={notes} open={open} />
                  </section>
                  <aside className="daily-panel">
                    <div className="daily-panel-heading">
                      <span className="mini-orb">
                        <Icon name="spark" size={19} />
                      </span>
                      <span>DAILY INSIGHTS</span>
                      <span className="badge">
                        {isDemo ? "EXEMPLO" : "EXPLORAR"}
                      </span>
                    </div>
                    <h2>
                      Entre uma ideia
                      <br />e outra, <em>o novo.</em>
                    </h2>
                    <p>
                      {wiki.length
                        ? "Sua memória tem perspectivas esperando para se encontrar. Vamos descobrir uma?"
                        : "Comece com uma nota, uma leitura ou aquela ideia que não pode escapar."}
                    </p>
                    {wiki.length ? (
                      <>
                        <button
                          className="insight-prompt"
                          disabled={!!busy}
                          onClick={() =>
                            void send(
                              "Que conexão entre minhas memórias eu ainda não percebi? Cite as fontes e separe hipóteses de fatos.",
                            )
                          }
                        >
                          <span className="insight-number">01</span>
                          <div>
                            <strong>Encontre o fio da meada</strong>
                            <span>Revele conexões entre assuntos.</span>
                          </div>
                          <Icon name="arrow" size={16} />
                        </button>
                        <button
                          className="insight-prompt"
                          disabled={!!busy}
                          onClick={() =>
                            void send(
                              "O que ficou em aberto nas minhas memórias? Mostre perguntas e próximas ações com fontes.",
                            )
                          }
                        >
                          <span className="insight-number">02</span>
                          <div>
                            <strong>Retome uma boa pergunta</strong>
                            <span>O que ainda merece atenção?</span>
                          </div>
                          <Icon name="arrow" size={16} />
                        </button>
                      </>
                    ) : (
                      <button
                        className="button"
                        disabled={!!busy}
                        onClick={() =>
                          void act("seed", async () => {
                            await action("seed");
                            await load();
                          })
                        }
                      >
                        Explorar com um exemplo <Icon name="arrow" size={16} />
                      </button>
                    )}
                    <div className="daily-footer">
                      <span className="live-dot" /> Contexto antes de respostas.
                    </div>
                  </aside>
                </div>
                <div className="recent-grid">
                  <section>
                    <div className="section-heading">
                      <div>
                        <Icon name="clock" size={17} />
                        <h2>Na sua órbita, recentemente</h2>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => go("wiki")}
                      >
                        Ver wiki <Icon name="arrow" size={14} />
                      </button>
                    </div>
                    {wiki.length ? (
                      cards(wiki.slice(0, 3), true)
                    ) : (
                      <div className="inline-empty">
                        Capture uma ideia. Daily ajuda a encontrar seu lugar.
                      </div>
                    )}
                  </section>
                  <section>
                    <div className="section-heading">
                      <div>
                        <Icon name="inbox" size={17} />
                        <h2>Prontas para conectar</h2>
                        <span className="count">{inbox.length}</span>
                      </div>
                    </div>
                    {inbox.length ? (
                      cards(inbox.slice(0, 2), true)
                    ) : (
                      <div className="inline-empty">
                        <Icon name="check" size={17} /> Sua caixa de entrada
                        está em dia.
                      </div>
                    )}
                    <button
                      className="quick-capture"
                      onClick={() => {
                        setCapture(true);
                        setCaptureTitle("");
                        setCaptureContent("");
                      }}
                    >
                      <Icon name="plus" size={17} />
                      Uma ideia acabou de chegar?
                    </button>
                  </section>
                </div>
                <button className="floating-chat" onClick={() => go("chat")}>
                  <span className="mini-orb">
                    <Icon name="spark" size={18} />
                  </span>
                  Converse com sua memória
                  <Icon name="arrow" size={16} />
                </button>
              </>
            )}
            {view === "graph" && (
              <>
                <div className="page-heading">
                  <span className="eyebrow">TUDO ESTÁ CONECTADO</span>
                  <h1>O mapa da sua memória.</h1>
                  <p>
                    Clique em uma ideia para seguir suas conexões e reencontrar
                    as fontes.
                  </p>
                </div>
                <Graph notes={notes} open={open} expanded />
                <div className="graph-explainer">
                  <Icon name="link" size={16} />
                  As linhas representam links entre páginas. Conecte ideias
                  usando [[título da página]] na wiki.
                </div>
              </>
            )}
            {(["raw", "wiki", "outputs"] as string[]).includes(view) && (
              <>
                <div className="page-heading row-heading">
                  <div>
                    <span className="eyebrow">
                      {view === "raw"
                        ? "01 / CAPTURAR"
                        : view === "wiki"
                          ? "02 / CONECTAR"
                          : "03 / CRIAR"}
                    </span>
                    <h1>
                      {view === "raw"
                        ? "Toda ideia tem um começo."
                        : view === "wiki"
                          ? "Conhecimento que se conecta."
                          : "Sua memória em movimento."}
                    </h1>
                    <p>
                      {view === "raw"
                        ? "Notas, leituras e conversas. Traga como estiver; organize depois."
                        : view === "wiki"
                          ? "Sua biblioteca viva, com contexto, referências e novas relações."
                          : "Briefings, planos e reflexões que nascem do que você já sabe."}
                    </p>
                  </div>
                  <div className="button-row">
                    {view === "outputs" ? (
                      <button
                        className="button primary"
                        onClick={() => {
                          setArtifact(true);
                          setPrompt("");
                        }}
                      >
                        <Icon name="plus" size={16} />
                        Criar artefato
                      </button>
                    ) : view === "raw" ? (
                      <button
                        className="button primary"
                        onClick={() => {
                          setCapture(true);
                          setCaptureTitle("");
                          setCaptureContent("");
                        }}
                      >
                        <Icon name="plus" size={16} />
                        Capturar memória
                      </button>
                    ) : (
                      <a className="button" href="/api/export">
                        <Icon name="download" size={16} />
                        Exportar memória
                      </a>
                    )}
                  </div>
                </div>
                <div className="collection-bar">
                  <span>
                    {notes.filter((n) => n.kind === view).length}{" "}
                    {view === "wiki"
                      ? "páginas"
                      : view === "raw"
                        ? "fontes"
                        : "artefatos"}
                  </span>
                  <span>
                    <Icon name="clock" size={14} /> Atualizadas recentemente
                  </span>
                </div>
                {notes.some((n) => n.kind === view)
                  ? cards(notes.filter((n) => n.kind === view))
                  : empty(
                      view === "wiki"
                        ? "O começo de uma biblioteca viva."
                        : view === "raw"
                          ? "Deixe as ideias chegarem."
                          : "Conhecimento pronto para ganhar forma.",
                      view === "wiki"
                        ? "Capture uma fonte e peça ao Daily para organizar sua primeira página."
                        : view === "raw"
                          ? "Cole um texto ou importe um arquivo. A fonte original será preservada."
                          : "Adicione fontes e transforme suas memórias em um briefing ou plano.",
                    )}
              </>
            )}
            {view === "chat" && (
              <div className="chat-layout">
                <div className="chat-header">
                  <div className="mini-orb">
                    <Icon name="brain" size={23} />
                  </div>
                  <div>
                    <h1>Uma conversa com sua memória.</h1>
                    <p>
                      Daily ·{" "}
                      {isDemo
                        ? "Explorando o exemplo"
                        : settings.provider === "chatgpt"
                          ? "ChatGPT"
                          : "OpenRouter"}
                    </p>
                  </div>
                  <button
                    className="button subtle"
                    onClick={() => {
                      setArtifact(true);
                      setPrompt(
                        "Transforme nossas memórias em um plano de ação",
                      );
                    }}
                  >
                    <Icon name="spark" size={16} />
                    Criar artefato
                  </button>
                </div>
                <div className="chat-messages">
                  {!state.messages.length && (
                    <div className="chat-welcome">
                      <div className="welcome-orb">
                        <Icon name="brain" size={45} />
                      </div>
                      <span className="eyebrow">PENSE JUNTO. VÁ ALÉM.</span>
                      <h2>O que está na sua mente?</h2>
                      <p>
                        Posso conectar ideias, recuperar decisões e transformar
                        <br />o que você sabe em um próximo passo.
                      </p>
                      <div className="suggestions">
                        {[
                          "O que merece minha atenção hoje?",
                          "Conecte duas ideias da minha wiki",
                          "Quais decisões ainda estão em aberto?",
                        ].map((p) => (
                          <button
                            key={p}
                            disabled={!!busy}
                            onClick={() => void send(p)}
                          >
                            {p}
                            <Icon name="arrow" size={15} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {state.messages.map((m) => (
                    <article className={`message ${m.role}`} key={m.id}>
                      <span className="message-avatar">
                        {m.role === "assistant" ? (
                          <Icon name="spark" size={17} />
                        ) : (
                          "EU"
                        )}
                      </span>
                      <div>
                        <header>
                          {m.role === "assistant" ? "Daily" : "Você"}
                          <small>
                            {new Date(m.created).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </small>
                        </header>
                        <Markdown
                          content={m.content}
                          notes={notes}
                          open={open}
                        />
                        {m.role === "assistant" && (
                          <div className="message-actions">
                            {m.sources.length > 0 && (
                              <details>
                                <summary>
                                  Contexto consultado · {m.sources.length}
                                </summary>
                                {notes
                                  .filter((n) => m.sources.includes(n.id))
                                  .map((n) => (
                                    <button
                                      key={n.id}
                                      className="text-button"
                                      onClick={() => open(n)}
                                    >
                                      {n.title}
                                    </button>
                                  ))}
                              </details>
                            )}
                            <button
                              className="text-button"
                              disabled={!!busy}
                              onClick={() =>
                                settings.elevenlabs
                                  ? void speak(m.content)
                                  : go("connections")
                              }
                            >
                              <Icon name="volume" size={14} />
                              Ouvir
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                  {state.actions
                    .filter((a) => a.status === "pending")
                    .map((a) => (
                      <div key={a.id} className="approval">
                        <span className="eyebrow">AÇÃO PREPARADA · ZAPIER</span>
                        <h3>{a.name}</h3>
                        <pre>{JSON.stringify(a.args, null, 2)}</pre>
                        <p>
                          Ao confirmar, esta ação será executada no serviço
                          conectado. O resultado será guardado como fonte.
                        </p>
                        <div className="button-row">
                          <button
                            className="button primary"
                            disabled={!!busy}
                            onClick={() =>
                              void act("approve", async () => {
                                try {
                                  await action("approve", { id: a.id });
                                  setNotice(
                                    "Ação executada. Resultado na Caixa de entrada.",
                                  );
                                } finally {
                                  await load();
                                }
                              })
                            }
                          >
                            Confirmar execução
                          </button>
                          <button
                            className="button"
                            disabled={!!busy}
                            onClick={() =>
                              void act("reject", async () => {
                                await action("reject", { id: a.id });
                                await load();
                              })
                            }
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ))}
                  {state.actions
                    .filter((a) => a.status !== "pending")
                    .slice(0, 8)
                    .map((a) => (
                      <div className="action-result" key={a.id}>
                        <Icon
                          name={a.status === "done" ? "check" : "clock"}
                          size={16}
                        />
                        <div>
                          <strong>{a.name}</strong>
                          <p>
                            {a.status === "done"
                              ? "Executada. Resultado preservado na memória."
                              : a.status === "failed"
                                ? a.result
                                : a.status === "running"
                                  ? "Em execução. Se houve interrupção, confira o serviço antes de repetir."
                                  : "Ação cancelada."}
                          </p>
                        </div>
                        {a.status === "done" && (
                          <button
                            className="text-button"
                            onClick={() => {
                              const n = notes.find((n) => n.id === a.result);
                              if (n) open(n);
                            }}
                          >
                            Ver fonte
                          </button>
                        )}
                      </div>
                    ))}
                  {busy === "chat" && (
                    <div className="thinking">
                      <span className="loading-orb" />
                      Conectando ideias e buscando contexto…
                    </div>
                  )}
                  <div ref={chatBottom} />
                </div>
                <form
                  className="chat-composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                >
                  <textarea
                    aria-label="Mensagem para Daily"
                    placeholder="Pergunte, conecte, imagine…"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    maxLength={6000}
                    rows={2}
                  />
                  <div>
                    <span>
                      <Icon name="book" size={14} />
                      Sua memória como contexto
                    </span>
                    <div>
                      <button
                        type="button"
                        className={`icon-button ${recording ? "recording" : ""}`}
                        aria-label={
                          recording ? "Parar gravação" : "Falar com Daily"
                        }
                        disabled={!!busy}
                        onClick={() => void record()}
                      >
                        <Icon name="mic" size={19} />
                      </button>
                      <button
                        className="send-button"
                        aria-label="Enviar mensagem"
                        disabled={!!busy || !prompt.trim()}
                      >
                        <Icon name="arrow" size={20} />
                      </button>
                    </div>
                  </div>
                </form>
                <p className="composer-hint">
                  {recording
                    ? "Ouvindo… clique no microfone para parar."
                    : busy === "transcribe"
                      ? "Transcrevendo sua ideia…"
                      : "Daily pode errar. Consulte as fontes e revise decisões importantes."}
                </p>
              </div>
            )}
            {view === "connections" && (
              <Connections settings={settings} update={setSettings} />
            )}
            {view === "captures" && (
              <Captures
                state={captures}
                notes={notes}
                refresh={refreshCaptures}
                ready={setup ? setup.aiConnected && settings.zapier : true}
                configure={() => go("connections")}
                manual={() => {
                  setCaptureTitle("");
                  setCaptureContent("");
                  setCapture(true);
                }}
                open={(id) => {
                  const n = notes.find((n) => n.id === id);
                  if (n) open(n);
                  else
                    void act("open", async () => {
                      const s = await load();
                      const found = s.notes.find((n) => n.id === id);
                      if (found) open(found);
                    });
                }}
              />
            )}
            {view === "setup" &&
              (setup ? (
                <Onboarding
                  setup={setup}
                  settings={settings}
                  rules={state.rules}
                  updateSetup={setSetup}
                  updateSettings={(s) => {
                    setSettings(s);
                    void request<SetupState>("/api/onboarding")
                      .then(setSetup)
                      .catch(() => {});
                  }}
                  finish={async (destination) => {
                    await refreshCaptures();
                    go(destination === "manual" ? "raw" : destination);
                    if (destination === "manual") {
                      setCaptureTitle("");
                      setCaptureContent("");
                      setCapture(true);
                    }
                  }}
                />
              ) : (
                <p>Preparando seus primeiros passos…</p>
              ))}
            {view === "rules" && (
              <div className="rules-page">
                <div className="page-heading">
                  <span className="eyebrow">DO SEU JEITO</span>
                  <h1>Uma memória com seus princípios.</h1>
                  <p>
                    Defina como Daily organiza, conecta e escreve. Estas regras
                    acompanham cada interação.
                  </p>
                </div>
                <div className="rules-editor">
                  <header>
                    <Icon name="file" size={17} />
                    <strong>REGRAS.md</strong>
                    <span>Markdown</span>
                  </header>
                  <textarea
                    aria-label="Regras da memória"
                    value={ruleDraft ?? state.rules}
                    onChange={(e) => setRuleDraft(e.target.value)}
                    maxLength={12000}
                    rows={18}
                  />
                  <footer>
                    <small>
                      Fontes originais e confirmação de ações são protegidas
                      pelo aplicativo.
                    </small>
                    <button
                      className="button primary"
                      disabled={!!busy || ruleDraft === null}
                      onClick={() =>
                        void act("rules", async () => {
                          await action("rules", { content: ruleDraft });
                          await load();
                          setRuleDraft(null);
                          setNotice("Regras da memória atualizadas.");
                        })
                      }
                    >
                      <Icon name="check" size={16} />
                      Salvar regras
                    </button>
                  </footer>
                </div>
                {notes.some((n) => n.demo) && (
                  <div className="export-card">
                    <Icon name="spark" size={26} />
                    <div>
                      <h3>Espaço para suas próprias ideias.</h3>
                      <p>
                        Remova as memórias fictícias quando terminar de
                        explorar. Fontes usadas por suas memórias pessoais serão
                        preservadas.
                      </p>
                    </div>
                    <button
                      className="button"
                      onClick={() => setClearingDemo(true)}
                    >
                      Limpar exemplo
                    </button>
                  </div>
                )}
                <div className="export-card">
                  <Icon name="download" size={26} />
                  <div>
                    <h3>Seu conhecimento vai com você.</h3>
                    <p>
                      Exporte raw, wiki, outputs e suas regras em Markdown. Abra
                      como um cofre no Obsidian.
                    </p>
                  </div>
                  <a href="/api/export" className="button">
                    Exportar memória
                  </a>
                </div>
              </div>
            )}
          </main>
        )}
      </div>
      {clearingDemo && (
        <Dialog
          label="Limpar exemplo"
          close={() => !busy && setClearingDemo(false)}
        >
          <span className="eyebrow">SUAS MEMÓRIAS FICAM</span>
          <h2>Limpar memórias de exemplo?</h2>
          <p className="muted">
            Somente notas, páginas e artefatos fictícios serão removidos. Suas
            memórias, regras e conversas permanecem. Exemplos usados como fonte
            de uma memória pessoal também ficam.
          </p>
          <div className="button-row">
            <button
              className="button primary"
              disabled={!!busy}
              onClick={() =>
                void act("clear-demo", async () => {
                  const result = await request<{
                    removed: number;
                    preserved: number;
                  }>("/api/brain", "POST", { action: "clear-demo" });
                  await load();
                  setClearingDemo(false);
                  setNotice(
                    `${result.removed} exemplos removidos.${result.preserved ? ` ${result.preserved} preservados por serem fontes de memórias pessoais.` : ""}`,
                  );
                })
              }
            >
              Sim, limpar exemplo
            </button>
            <button className="button" onClick={() => setClearingDemo(false)}>
              Manter exemplos
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Dialog>
      )}
      {capture && (
        <Dialog
          label="Capturar memória"
          close={() => !busy && setCapture(false)}
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <span className="eyebrow">DEIXE A IDEIA CHEGAR</span>
          <h2>O que vale guardar?</h2>
          <p className="muted">
            Uma nota, uma leitura, uma conversa. Não precisa organizar agora.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act("capture", async () => {
                await action("capture", {
                  title: captureTitle,
                  content: captureContent,
                });
                await load();
                setCapture(false);
                go("raw");
                setNotice(
                  "Memória capturada. A fonte original está preservada.",
                );
              });
            }}
          >
            <label>
              Um título para reencontrar
              <input
                autoFocus
                value={captureTitle}
                onChange={(e) => setCaptureTitle(e.target.value)}
                placeholder="Uma ideia que não pode escapar…"
                required
                maxLength={140}
              />
            </label>
            <label>
              Conteúdo
              <textarea
                rows={9}
                value={captureContent}
                onChange={(e) => setCaptureContent(e.target.value)}
                placeholder="Cole o texto, suas notas ou a transcrição aqui…"
                required
                maxLength={100000}
              />
            </label>
            <input
              type="file"
              accept=".md,.txt,.csv,.json"
              hidden
              ref={fileRef}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 100000) {
                  setError("Importe um arquivo de até 100 KB.");
                  return;
                }
                if (!/\.(md|txt|csv|json)$/i.test(f.name)) {
                  setError("Use arquivos Markdown, texto, CSV ou JSON.");
                  return;
                }
                setCaptureContent(await f.text());
                if (!captureTitle)
                  setCaptureTitle(f.name.replace(/\.[^.]+$/, "").slice(0, 140));
              }}
            />
            <div className="modal-footer">
              <button
                className="button subtle"
                type="button"
                onClick={() => fileRef.current?.click()}
              >
                <Icon name="upload" size={16} />
                Importar arquivo
              </button>
              <button className="button primary" disabled={!!busy}>
                {busy === "capture" ? "Guardando…" : "Guardar na memória"}
                <Icon name="arrow" size={16} />
              </button>
            </div>
            <small className="muted">
              Markdown, TXT, CSV ou JSON · até 100 KB
            </small>
          </form>
        </Dialog>
      )}
      {artifact && (
        <Dialog
          label="Criar artefato"
          close={() => !busy && setArtifact(false)}
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <span className="eyebrow">DA MEMÓRIA PARA A AÇÃO</span>
          <h2>O que vamos criar?</h2>
          <p className="muted">
            Daily usa as fontes relevantes da sua memória e mantém as
            referências.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act("artifact", async () => {
                const n = await action("artifact", { prompt });
                await load();
                setArtifact(false);
                go("outputs");
                open(n);
              });
            }}
          >
            <label>
              Descreva o resultado
              <textarea
                autoFocus
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Um briefing das decisões recentes e dos próximos passos…"
                required
                maxLength={6000}
              />
            </label>
            <div className="preset-chips">
              {[
                "Briefing do dia",
                "Plano de ação da semana",
                "Conexões e perguntas em aberto",
              ].map((p) => (
                <button type="button" key={p} onClick={() => setPrompt(p)}>
                  {p}
                </button>
              ))}
            </div>
            <button className="button primary full" disabled={!!busy}>
              <Icon name="spark" size={17} />
              {busy === "artifact"
                ? "Criando com sua memória…"
                : "Criar artefato"}
            </button>
          </form>
        </Dialog>
      )}
      {selected && (
        <Dialog
          wide
          label={selected.title}
          close={() => !busy && setSelected(null)}
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="document-top">
            <span className={`badge ${selected.kind}`}>
              {LABELS[selected.kind]}
            </span>
            {selected.demo && <span className="badge">Exemplo</span>}
            <small>
              {date(selected.updated)} · versão {selected.revision}
            </small>
          </div>
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act("edit", async () => {
                  const n = await action("edit", {
                    id: selected.id,
                    revision: selected.revision,
                    title: f.get("title"),
                    content: f.get("content"),
                  });
                  await load();
                  open(n);
                  setNotice("Nova versão salva. Histórico preservado.");
                });
              }}
            >
              <label>
                Título
                <input
                  name="title"
                  defaultValue={selected.title}
                  required
                  maxLength={140}
                />
              </label>
              <label>
                Conteúdo em Markdown
                <textarea
                  className="markdown-editor"
                  rows={17}
                  name="content"
                  defaultValue={selected.content}
                  required
                  maxLength={100000}
                />
              </label>
              <div className="button-row">
                <button className="button primary" disabled={!!busy}>
                  Salvar versão
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={() => setEditing(false)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <>
              <h1 className="document-title">{selected.title}</h1>
              <div className="document-actions">
                {selected.kind === "raw" ? (
                  selected.status === "inbox" && (
                    <button
                      className="button primary"
                      disabled={!!busy}
                      onClick={() => void organize(selected)}
                    >
                      <Icon name="spark" size={16} />
                      {busy === "organize"
                        ? "Conectando à wiki…"
                        : "Organizar na wiki"}
                    </button>
                  )
                ) : (
                  <button className="button" onClick={() => setEditing(true)}>
                    <Icon name="edit" size={16} />
                    Editar
                  </button>
                )}
                <a
                  href={`/api/export?id=${selected.id}`}
                  className="button subtle"
                >
                  <Icon name="download" size={16} />
                  Markdown
                </a>
                {selected.kind !== "raw" && (
                  <button
                    className="button subtle"
                    onClick={() =>
                      void act("history", async () =>
                        setHistory(
                          await request<Note[]>(
                            `/api/brain?revisions=${selected.id}`,
                          ),
                        ),
                      )
                    }
                  >
                    <Icon name="clock" size={16} />
                    Versões
                  </button>
                )}
                {selected.kind === "outputs" && (
                  <button
                    className="button subtle"
                    disabled={!!busy}
                    onClick={() =>
                      void act("recycle", async () => {
                        const n = await action("recycle", { id: selected.id });
                        await load();
                        open(n);
                        setNotice(
                          "Artefato devolvido como fonte. Organize quando quiser.",
                        );
                      })
                    }
                  >
                    <Icon name="refresh" size={16} />
                    Voltar à memória
                  </button>
                )}
              </div>
              <Markdown content={selected.content} notes={notes} open={open} />
              {history && (
                <div className="revision-list">
                  <h3>Histórico preservado</h3>
                  {history.map((n) => (
                    <div key={n.revision}>
                      <span>
                        Versão {n.revision} · {date(n.updated)}
                      </span>
                      <button
                        className="text-button"
                        disabled={!!busy || n.revision === selected.revision}
                        onClick={() =>
                          void act("restore", async () => {
                            const restored = await action("edit", {
                              id: selected.id,
                              revision: selected.revision,
                              title: n.title,
                              content: n.content,
                            });
                            await load();
                            open(restored);
                            setNotice("Versão restaurada em uma nova revisão.");
                          })
                        }
                      >
                        {n.revision === selected.revision
                          ? "Atual"
                          : "Restaurar"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="document-relations">
                {selected.sources.length > 0 && (
                  <section>
                    <h3>
                      <Icon name="link" size={15} /> Fontes e contexto de origem
                    </h3>
                    {notes
                      .filter((n) => selected.sources.includes(n.id))
                      .map((n) => (
                        <button
                          className="relation"
                          key={n.id}
                          onClick={() => open(n)}
                        >
                          <Icon name="file" size={15} />
                          {n.title}
                          <Icon name="arrow" size={14} />
                        </button>
                      ))}
                  </section>
                )}
                <section>
                  <h3>
                    <Icon name="graph" size={15} /> Quem se conecta a esta
                    memória
                  </h3>
                  {notes
                    .filter(
                      (n) =>
                        n.id !== selected.id &&
                        (n.sources.includes(selected.id) ||
                          n.content.includes(`[[${selected.title}]]`)),
                    )
                    .map((n) => (
                      <button
                        className="relation"
                        key={n.id}
                        onClick={() => open(n)}
                      >
                        <Icon name="book" size={15} />
                        {n.title}
                        <Icon name="arrow" size={14} />
                      </button>
                    ))}
                </section>
              </div>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}
