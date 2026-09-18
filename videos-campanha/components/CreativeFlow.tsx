"use client";
/* eslint-disable @next/next/no-img-element -- Assets include user uploads, data URLs and external provider outputs. */
import Link from "next/link";
import DeleteConfirmation from "./DeleteConfirmation";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeProps,
  type Connection,
  type ReactFlowInstance,
} from "reactflow";
import {
  block,
  context,
  ICONS,
  LABELS,
  MODELS,
  order,
  outputSource,
  recipe,
  reconcile,
  receiveGeneration,
  referencePlan,
  RECIPES,
  type Asset,
  type Block,
  type Kind,
  type Project,
  type Wire,
} from "@/lib/flow/model";
import type { Job } from "@/lib/flow/store";
async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}
function Preview({ asset }: { asset?: Asset }) {
  return asset ? (
    asset.kind === "video" ? (
      <video
        className="nodrag nowheel"
        controls
        src={asset.url}
        preload="metadata"
      />
    ) : (
      <img src={asset.url} alt={asset.title} />
    )
  ) : (
    <div className="cf-empty-media">
      <span>✧</span>
      <small>Sua próxima criação começa aqui</small>
    </div>
  );
}
const PHASES: Partial<Record<Kind, string[]>> = {
  video: ["Preparando a cena", "Compondo os quadros", "Renderizando o movimento", "Finalizando os detalhes"],
  image: ["Interpretando o prompt", "Compondo a imagem", "Refinando os detalhes"],
  transform: ["Lendo a referência", "Aplicando a transformação", "Refinando os detalhes"],
};
/* Estado de geração do bloco: substitui o preview enquanto o pedido está na fila.
 * As fases são só ritmo visual (o provedor não informa progresso); o que é real é
 * "Enviando ao modelo" (status "sending") contra "na fila" (status "pending"). */
function Generating({ kind, status, asset }: { kind: Kind; status?: string; asset?: Asset }) {
  const phases = PHASES[kind] ?? PHASES.image!;
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % phases.length), 4500);
    return () => clearInterval(t);
  }, [phases.length]);
  const title = kind === "video" ? "Gerando seu vídeo…" : kind === "transform" ? "Transformando sua imagem…" : "Gerando sua imagem…";
  const hint = kind === "video" ? "Vídeos levam alguns minutos. O bloco avisa quando estiver pronto." : "Isso leva alguns segundos. O bloco avisa quando estiver pronto.";
  return (
    <div className="cf-generating">
      {asset && (asset.kind === "video" ? <video src={asset.url} muted preload="metadata" aria-hidden="true" /> : <img src={asset.url} alt="" aria-hidden="true" />)}
      <div className="cf-generating-body">
        <span className="cf-spark" aria-hidden="true"><i /><i /><b>✦</b></span>
        <strong>{title}</strong>
        <small key={status === "sending" ? "sending" : step}>{status === "sending" ? "Enviando ao modelo" : phases[step]}</small>
        <span className="cf-progress" aria-hidden="true"><i /></span>
        <em>{hint}</em>
      </div>
    </div>
  );
}
function CreativeNode({
  data,
  selected,
}: NodeProps<Block["data"] & { asset?: Asset; onRemove?: () => void; onCancel?: () => void; locked?: boolean }>) {
  const loading = data.status === "pending" || data.status === "sending";
  const problem = ["failed", "uncertain", "submitting"].includes(data.status || "");
  const state = loading ? "Gerando…" : problem ? "Geração precisa de atenção" : data.dirty ? "Precisa atualizar" : data.asset ? "Concluído" : "Aguardando geração";
  return (
    <article aria-busy={loading} className={`cf-node ${selected ? "is-selected" : ""}`}>
      {data.kind !== "idea" && (
        <Handle type="target" position={Position.Left} />
      )}
      <header>
        <span className={`cf-icon ${data.kind}`}>{ICONS[data.kind]}</span>
        <strong>{data.title}</strong>
        <span className={`cf-node-state ${loading ? "is-loading" : problem ? "is-error" : data.asset && !data.dirty ? "is-complete" : ""}`} role="status" aria-label={state} title={state}>
          <span aria-hidden="true">{loading ? "⚙" : problem ? "!" : data.dirty ? "↻" : data.asset ? "✓" : "···"}</span>
        </span>
        {loading ? (
          <button className="cf-node-cancel nodrag nopan" title="A execução para depois desta geração" onClick={(event) => { event.stopPropagation(); data.onCancel?.(); }}>Cancelar</button>
        ) : (
          <button className="cf-node-delete nodrag nopan" aria-label={`Excluir bloco ${data.title}`} title="Excluir bloco" disabled={data.locked} onClick={(event) => { event.stopPropagation(); data.onRemove?.(); }}>×</button>
        )}
      </header>
      {data.kind === "idea" ? (
        <p className="cf-idea">
          {data.prompt || "Descreva sua campanha. O que vamos criar?"}
        </p>
      ) : loading ? (
        <Generating kind={data.kind} status={data.status} asset={data.asset} />
      ) : (
        <Preview asset={data.asset} />
      )}
      <footer>
        <span>
          {data.kind === "idea"
            ? "O início de tudo"
            : data.kind === "output"
              ? "Pronto para sua campanha"
              : MODELS.find((m) => m.id === data.model)?.name}
        </span>
        <span>
          {data.kind === "video" ? `${data.duration}s · ` : ""}
          {data.kind !== "idea" && data.ratio}
        </span>
      </footer>
      {data.kind !== "output" && (
        <Handle type="source" position={Position.Right} />
      )}
    </article>
  );
}
const nodeTypes = { creative: CreativeNode };
export default function CreativeFlow({ initialProjectId }: { initialProjectId?: string } = {}) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const live = useRef<Project | null>(null);
  const [view, setView] = useState<"projects" | "editor" | "assets">(
    "projects",
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [higgsfieldConnected, setHiggsfieldConnected] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState("Salvo");
  const [recipes, setRecipes] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [edgeKind, setEdgeKind] = useState<"input" | "context">("input");
  const [busy, setBusy] = useState(false);
  const [projectJobs, setProjectJobs] = useState<Job[]>([]);
  const [remoteId, setRemoteId] = useState("");
  const [deletion, setDeletion] = useState<{ kind: "project" | "block"; id: string; title: string; projectId: string } | null>(null);
  const [confirmRun, setConfirmRun] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null);
  const revisions = useRef(new Map<string, number>());
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const runLock = useRef(false);
  const stop = useRef(false);
  const mounted = useRef(true);
  const change = useCallback((p: Project) => {
    p = reconcile(live.current, p);
    live.current = p;
    setCurrent(p);
    setSaved("Alterações pendentes");
  }, []);
  const persist = useCallback((p: Project) => {
    const next = saveQueue.current
      .catch(() => {})
      .then(async () => {
        setSaved("Salvando…");
        const result = await api("/api/flows", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...p,
            revision: revisions.current.get(p.id) ?? p.revision,
          }),
        });
        const value = result.project as Project;
        revisions.current.set(p.id, value.revision);
        setProjects((list) => [
          value,
          ...list.filter((i) => i.id !== value.id),
        ]);
        setSaved(
          live.current?.id === p.id && live.current !== p
            ? "Alterações pendentes"
            : "Salvo ✓",
        );
        return value;
      });
    saveQueue.current = next;
    return next;
  }, []);
  useEffect(() => {
    mounted.current = true;
    Promise.all([api("/api/flows"), api("/api/flow-assets")])
      .then(([p, a]) => {
        setProjects(p.projects);
        setConnected(p.connected);
        setHiggsfieldConnected(Boolean(p.higgsfieldConnected));
        setAssets(a.assets);
        for (const item of p.projects)
          revisions.current.set(item.id, item.revision);
        if (new URLSearchParams(window.location.search).get("view") === "assets") setView("assets");
        const projectId = initialProjectId || new URLSearchParams(window.location.search).get("project");
        if (projectId) {
          const target = (p.projects as Project[]).find((item) => item.id === projectId);
          if (target) restoreProject(target);
          else setError("Projeto não encontrado ou indisponível nesta conta.");
        }
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
    return () => {
      mounted.current = false;
      stop.current = true;
    };
  }, [initialProjectId]);
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => {
      persist(current).catch((e) => {
        setSaved("Não salvo");
        setError(e.message);
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [current, persist]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saved !== "Salvo ✓" && saved !== "Salvo") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saved]);
  const attach = useCallback(
    (asset: Asset, nodeId: string, projectId: string) => {
      setAssets((list) => [asset, ...list.filter((a) => a.id !== asset.id)]);
      const p = live.current;
      if (p?.id === projectId)
        change({
          ...p,
          nodes: p.nodes.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    assetId: asset.id,
                    selectionVersion: (n.data.selectionVersion || 0) + 1,
                    dirty: false,
                    status: "completed",
                  },
                }
              : n,
          ),
        });
    },
    [change],
  );
  const open = async (p: Project) => {
    if (runLock.current) {
      setNotice("Aguarde a geração atual antes de trocar de projeto.");
      return;
    }
    if (live.current)
      try {
        await persist(live.current);
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    live.current = p;
    setCurrent(p);
    setSelected(null);
    setView("editor");
    window.history.replaceState(null, "", `/projetos/${encodeURIComponent(p.id)}`);
    setTimeout(() => instance?.fitView({ padding: 0.2 }), 80);
    try {
      const { jobs } = await api(
        `/api/flow-generate?projectId=${encodeURIComponent(p.id)}`,
      );
      setProjectJobs(jobs);
      const seen = new Set<string>();
      const pending: Job[] = [];
      for (const j of jobs as Job[]) {
        if (seen.has(j.nodeId)) continue;
        seen.add(j.nodeId);
        if (j.status === "completed" && j.asset) acceptGeneration(j);
        if (j.status === "pending") pending.push(j);
        if (["uncertain", "submitting"].includes(j.status))
          setError(
            "Há uma geração sem confirmação. Confira o histórico MuAPI antes de reenviar.",
          );
      }
      if (pending.length) {
        runLock.current = true;
        setBusy(true);
        try {
          await Promise.all(pending.map((j) => poll(j)));
        } finally {
          runLock.current = false;
          setBusy(false);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const restoreProject = useEffectEvent((p: Project) => { void open(p); });
  function removeBlock(id: string) {
    const p = live.current;
    if (!p || runLock.current) return;
    const target = p.nodes.find((n) => n.id === id);
    if (target) setDeletion({ kind: "block", id, title: target.data.title, projectId: p.id });
  }
  async function confirmDeletion() {
    if (!deletion) return;
    if (runLock.current) throw new Error("Aguarde a geração terminar antes de excluir.");
    if (deletion.kind === "block") {
      const p = live.current;
      if (!p || p.id !== deletion.projectId) throw new Error("Reabra o projeto antes de excluir o bloco.");
      change({ ...p, nodes: p.nodes.filter((n) => n.id !== deletion.id), edges: p.edges.filter((e) => e.source !== deletion.id && e.target !== deletion.id) });
      if (selected === deletion.id) setSelected(null);
    } else {
      await api(`/api/flows?id=${encodeURIComponent(deletion.id)}`, { method: "DELETE" });
      setProjects((list) => list.filter((p) => p.id !== deletion.id));
      if (live.current?.id === deletion.id) { live.current = null; setCurrent(null); }
    }
    setDeletion(null);
  }

  async function shareProject(p: Project) {
    try {
      const savedProject = await persist(live.current?.id === p.id ? live.current : p);
      const url = new URL(`/projetos/${encodeURIComponent(savedProject.id)}`, window.location.origin).href;
      try {
        await navigator.clipboard.writeText(url);
        setNotice("Link copiado. Quem abrir precisa entrar na conta deste app.");
      } catch { window.prompt("Copie o link. É necessário entrar na conta deste app:", url); }
    } catch (e) { setError((e as Error).message); }
  }
  function acceptGeneration(j: Job) {
    if (!j.asset) return;
    const asset = j.asset;
    setAssets((list) => [asset, ...list.filter((a) => a.id !== asset.id)]);
    const p = live.current;
    if (p?.id !== j.projectId) return;
    const next = receiveGeneration(p, { ...j, asset });
    if (next !== p) {
      change(next);
      if (next.nodes.find((n) => n.id === j.nodeId)?.data.assetId !== asset.id)
        setNotice(
          "Resultado disponível na biblioteca. As alterações mais recentes da etapa foram preservadas.",
        );
    }
  }
  async function poll(initial: Job): Promise<Asset> {
    let latest = initial;
    while (mounted.current) {
      const snapshot = latest;
      setProjectJobs((list) => [
        snapshot,
        ...list.filter((item) => item.id !== snapshot.id),
      ]);
      if (snapshot.status === "completed" && snapshot.asset) {
        acceptGeneration(snapshot);
        return snapshot.asset;
      }
      if (["failed", "uncertain", "submitting"].includes(snapshot.status)) {
        const p = live.current;
        if (p?.id === snapshot.projectId)
          change({
            ...p,
            nodes: p.nodes.map((n) =>
              n.id === snapshot.nodeId
                ? { ...n, data: { ...n.data, status: snapshot.status } }
                : n,
            ),
          });
        throw new Error(
          snapshot.error ||
            "Geração sem confirmação. Consulte o histórico MuAPI.",
        );
      }
      await new Promise((r) => setTimeout(r, 3500));
      latest = (
        await api(`/api/flow-generate?id=${encodeURIComponent(snapshot.id)}`)
      ).job;
    }
    throw new Error(
      "Acompanhamento interrompido. Reabra o projeto para continuar.",
    );
  }

  function patch(data: Partial<Block["data"]>) {
    const p = live.current;
    if (!p || !selected) return;
    change({
      ...p,
      nodes: p.nodes.map((n) =>
        n.id === selected
          ? {
              ...n,
              data: {
                ...n.data,
                ...data,
                ...("assetId" in data
                  ? { selectionVersion: (n.data.selectionVersion || 0) + 1 }
                  : {}),
              },
            }
          : n,
      ),
    });
  }
  function add(kind: Kind, branch = false) {
    const p = live.current;
    if (!p) return;
    const n = block(kind, p.nodes.length);
    const source = p.nodes.find((n) => n.id === selected) || p.nodes.at(-1);
    if (source) {
      n.position = { x: source.position.x + 350, y: source.position.y };
      while (p.nodes.some((b) => Math.abs(b.position.x - n.position.x) < 300 && Math.abs(b.position.y - n.position.y) < 290))
        n.position.y += 310;
    }
    change({
      ...p,
      nodes: [...p.nodes, n],
      edges:
        source && source.data.kind !== "output" && kind !== "idea"
          ? [
              ...p.edges,
              {
                id: crypto.randomUUID(),
                source: source.id,
                target: n.id,
                data: { kind: branch ? "input" : edgeKind },
              },
            ]
          : p.edges,
    });
    setSelected(n.id);
    setTimeout(() => instance?.fitView({ padding: 0.2, duration: 300 }), 80);
  }
  function connect(c: Connection) {
    const p = live.current;
    if (!p || !c.source || !c.target) return;
    if (p.edges.some((e) => e.source === c.source && e.target === c.target)) {
      setNotice("Estas etapas já estão conectadas.");
      return;
    }
    const next = {
      ...p,
      edges: [
        ...p.edges,
        {
          id: crypto.randomUUID(),
          source: c.source,
          target: c.target,
          data: { kind: edgeKind },
        },
      ],
    };
    try {
      order(next);
      change(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function run(target: string) {
    if (runLock.current) return;
    runLock.current = true;
    setBusy(true);
    stop.current = false;
    setError("");
    setConfirmRun(null);
    try {
      const p = live.current;
      if (!p) return;
      await persist(p);
      const ordered = order(p);
      const todo =
        target === "all" ? ordered : ordered.filter((n) => n.id === target);
      for (const original of todo) {
        if (stop.current) break;
        const latest = live.current!;
        const n = latest.nodes.find((n) => n.id === original.id)!;
        if (n.data.kind === "idea") continue;
        if (target === "all" && n.data.assetId && !n.data.dirty) continue;
        if (n.data.kind === "output") {
          const input = outputSource(latest, n.id);
          change({
            ...latest,
            nodes: latest.nodes.map((b) =>
              b.id === n.id
                ? {
                    ...b,
                    data: {
                      ...b.data,
                      assetId: input.data.assetId,
                      dirty: false,
                    },
                  }
                : b,
            ),
          });
          continue;
        }
        await persist(latest);
        setNotice(`Gerando ${n.data.title}…`);
        setSendingId(n.id);
        const result = await api("/api/flow-generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: crypto.randomUUID(),
            projectId: latest.id,
            nodeId: n.id,
          }),
        });
        const now = live.current!;
        change({
          ...now,
          nodes: now.nodes.map((b) =>
            b.id === n.id
              ? { ...b, data: { ...b.data, status: "pending" } }
              : b,
          ),
        });
        setSendingId(null);
        await poll(result.job);
      }
      if (live.current) await persist(live.current);
      setNotice(
        stop.current
          ? "Execução pausada. A geração já enviada foi preservada."
          : "Fluxo atualizado. Seus assets estão na biblioteca.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSendingId(null);
      setBusy(false);
      runLock.current = false;
      if (live.current)
        api(
          `/api/flow-generate?projectId=${encodeURIComponent(live.current.id)}`,
        )
          .then((r) => setProjectJobs(r.jobs))
          .catch(() => {});
    }
  }
  async function recover(j: Job, requestId?: string) {
    try {
      const result = await api("/api/flow-generate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: j.id,
          requestId,
          confirmedNotSubmitted: !requestId,
        }),
      });
      setProjectJobs((list) => [
        result.job,
        ...list.filter((item) => item.id !== j.id),
      ]);
      if (result.job.status === "pending") {
        runLock.current = true;
        setBusy(true);
        await poll(result.job);
      }
      setRemoteId("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      runLock.current = false;
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    try {
      const form = new FormData();
      form.set("file", file);
      if (current) form.set("projectId", current.id);
      const { asset } = await api("/api/flow-assets", {
        method: "POST",
        body: form,
      });
      setAssets((list) => [asset, ...list]);
      if (selected && current) attach(asset, selected, current.id);
      patch({ assetId: asset.id, referenceId: asset.id });
      setNotice("Imagem adicionada à biblioteca.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function navigate(v: "projects" | "assets") {
    if (runLock.current) {
      setNotice("Aguarde a geração atual antes de sair do fluxo.");
      return;
    }
    if (current)
      try {
        await persist(live.current!);
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    live.current = null;
    setCurrent(null);
    setSelected(null);
    setView(v);
    window.history.replaceState(null, "", v === "assets" ? "/?view=assets" : "/");
    setPicker(false);
  }
  const node = current?.nodes.find((n) => n.id === selected);
  const refs = node && current ? context(current, node.id) : [];
  const allRefs =
    node && current
      ? context(
          {
            ...current,
            nodes: current.nodes.map((n) =>
              n.id === node.id
                ? { ...n, data: { ...n.data, excluded: [] } }
                : n,
            ),
          },
          node.id,
        )
      : [];
  const references = current && node ? referencePlan(current, node.id) : [];
  const model = MODELS.find((m) => m.id === node?.data.model);
  const assetFor = (id?: string) => assets.find((a) => a.id === id);
  const visibleProjects = projects.filter(
    (p) =>
      (filter === "all" || p.finished === (filter === "done")) &&
      p.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className={`cf-app ${view === "editor" ? "cf-editor-open" : ""}`}>
      <header className="cf-top">
        <Link href="/" className="cf-brand">
          <span>V</span>
          <div>
            <strong>Vídeos de Campanha</strong>
            <small>Creative Flow</small>
          </div>
        </Link>
        <nav aria-label="Navegação principal">
          <button
            className={view !== "assets" ? "active" : ""}
            onClick={() => navigate("projects")}
          >
            Fluxos
          </button>
          <button
            className={view === "assets" ? "active" : ""}
            onClick={() => navigate("assets")}
          >
            Assets
          </button>
          <button disabled={busy} onClick={async () => {
            try {
              if (live.current) await persist(live.current);
              router.push("/setup");
            } catch (e) { setError((e as Error).message); }
          }}>Configurações</button>
        </nav>
        {loaded && !connected && !higgsfieldConnected && <span className="cf-demo-badge">✧ Modo demonstração</span>}
      </header>
      {(error || notice) && (
        <div
          className={`cf-toast ${error ? "error" : ""}`}
          role={error ? "alert" : "status"}
        >
          <span>{error || notice}</span>
          <button
            aria-label="Fechar mensagem"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            ×
          </button>
        </div>
      )}
      {view === "projects" && (
        <main className="cf-home">
          <div className="cf-heading">
            <div>
              <p className="cf-eyebrow">DA IDEIA À CAMPANHA</p>
              <h1>Seu próximo grande criativo.</h1>
              <p>Crie, conecte e transforme ideias em imagens e vídeos.</p>
            </div>
            <button className="cf-primary" onClick={() => setRecipes(true)}>
              ＋ Novo projeto
            </button>
          </div>
          <section className="cf-recipe-strip">
            <div>
              <span>✦</span>
              <h2>Comece com uma receita</h2>
              <p>Um ponto de partida para sua próxima campanha.</p>
            </div>
            {RECIPES.slice(1, 4).map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  open(recipe(r.id));
                }}
              >
                <span>{r.icon}</span>
                <strong>{r.name}</strong>
                <small>{r.desc}</small>
                <b>↗</b>
              </button>
            ))}
          </section>
          <div className="cf-list-head">
            <h2>
              Seus projetos <span>{projects.length}</span>
            </h2>
            <input
              aria-label="Buscar projetos"
              placeholder="Buscar campanha…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="cf-tabs">
            {[
              ["all", "Todos"],
              ["work", "Em produção"],
              ["done", "Finalizados"],
            ].map(([id, label]) => (
              <button
                className={filter === id ? "active" : ""}
                key={id}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {!loaded ? (
            <p>Carregando projetos…</p>
          ) : (
            <div className="cf-project-grid">
              <button className="cf-new-card" onClick={() => setRecipes(true)}>
                <span>＋</span>
                <strong>Criar uma campanha</strong>
                <small>Uma ideia é tudo que você precisa.</small>
              </button>
              {visibleProjects.map((p) => {
                const own = assets.filter((a) => a.projectId === p.id);
                return (
                  <article key={p.id} className="cf-project">
                    <button onClick={() => open(p)}>
                      <div className="cf-project-cover">
                        {own[0] ? (
                          <Preview asset={own[0]} />
                        ) : (
                          <div className="cf-cover-flow">
                            <i>✧</i>
                            <em />
                            <i>▧</i>
                            <em />
                            <i>▷</i>
                          </div>
                        )}
                        <span>{p.finished ? "Finalizado" : "Em produção"}</span>
                      </div>
                      <div className="cf-project-info">
                        <h3>{p.title}</h3>
                        <p>
                          {p.nodes.length} etapas · {own.length} assets
                        </p>
                        <small>
                          Editado{" "}
                          {new Date(p.updatedAt).toLocaleDateString("pt-BR")}
                        </small>
                      </div>
                    </button>
                    <details className="cf-project-menu">
                      <summary aria-label={`Opções de ${p.title}`} title="Opções do projeto">···</summary>
                      <div className="cf-project-popover">
                        <button onClick={async (event) => {
                          const menu = event.currentTarget.closest("details");
                          try {
                            const updated = await persist({ ...p, finished: !p.finished });
                            if (live.current?.id === p.id) { live.current = updated; setCurrent(updated); }
                            menu?.removeAttribute("open");
                          } catch (e) { setError((e as Error).message); }
                        }}>{p.finished ? "Reabrir projeto" : "Marcar como finalizado"}</button>
                        <button onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void shareProject(p); }}>Copiar link do projeto</button>
                    <button
                      className="cf-project-delete-action"
                      aria-label={`Excluir ${p.title}`}
                      onClick={() => setDeletion({ kind: "project", id: p.id, title: p.title, projectId: p.id })}
                    >
                      Excluir
                    </button>
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>
          )}
          <Link className="cf-legacy" href="/briefing">
            Abrir gerador de conceitos e campanhas anteriores ↗
          </Link>
        </main>
      )}
      {view === "editor" && current && (
        <main className={`cf-workspace ${node ? "has-inspector" : ""}`}>
          <div className="cf-editor-head">
            <button
              aria-label="Voltar aos projetos"
              onClick={() => navigate("projects")}
            >
              ←
            </button>
            <div>
              <input
                aria-label="Nome do projeto"
                value={current.title}
                maxLength={160}
                disabled={busy}
                onChange={(e) => change({ ...current, title: e.target.value })}
              />
              <p>Da ideia ao vídeo. Crie, conecte e gere seus assets com IA.</p>
            </div>
            <span className="cf-save">{saved}</span>
            <button disabled={busy} onClick={() => void shareProject(current)} title="Copiar link do projeto">Compartilhar ↗</button>
            <button
              className="cf-primary"
              disabled={busy}
              onClick={() => setConfirmRun("all")}
            >
              ▷ {busy ? "Gerando…" : "Gerar tudo"}
            </button>
            {busy && (
              <button
                onClick={() => {
                  stop.current = true;
                  setNotice("A execução vai parar após a geração atual.");
                }}
              >
                Pausar
              </button>
            )}
          </div>
          <div className="cf-editor-body">
            <div className="cf-canvas">
              <ReactFlow
                key={current.id}
                nodes={current.nodes.map((n) => ({
                  ...n,
                  selected: n.id === selected,
                  data: {
                    ...n.data, asset: assetFor(n.data.assetId),
                    locked: busy, onRemove: () => removeBlock(n.id),
                    onCancel: () => { stop.current = true; setNotice("A execução vai parar após a geração atual."); },
                    status: sendingId === n.id ? "sending" : projectJobs.find((j) => j.nodeId === n.id)?.status === "pending" ? "pending" : n.data.status,
                  },
                }))}
                edges={current.edges.map((e) => ({
                  ...e,
                  style: {
                    stroke: "#dd239e",
                    strokeWidth: 2,
                    strokeDasharray:
                      e.data.kind === "context" ? "6 5" : undefined,
                  },
                  label: e.data.kind === "context" ? "contexto" : undefined,
                }))}
                nodeTypes={nodeTypes}
                onInit={setInstance}
                fitView
                minZoom={0.2}
                maxZoom={1.5}
                onNodeClick={(_, n) => setSelected(n.id)}
                onPaneClick={() => setSelected(null)}
                onConnect={connect}
                nodesDraggable={!busy}
                nodesConnectable={!busy}
                deleteKeyCode={busy ? null : ["Backspace", "Delete"]}
                onNodesChange={(changes) => {
                  if (busy) return;
                  const p = live.current!;
                  const nodes = applyNodeChanges(changes, p.nodes) as Block[];
                  change({
                    ...p,
                    nodes,
                    edges: p.edges.filter(
                      (e) =>
                        nodes.some((n) => n.id === e.source) &&
                        nodes.some((n) => n.id === e.target),
                    ),
                  });
                }}
                onEdgesChange={(changes) => {
                  if (!busy)
                    change({
                      ...live.current!,
                      edges: applyEdgeChanges(
                        changes,
                        live.current!.edges,
                      ) as Wire[],
                    });
                }}
                onEdgeDoubleClick={(_, edge) => {
                  if (!busy)
                    change({
                      ...current,
                      edges: current.edges.filter((e) => e.id !== edge.id),
                    });
                }}
              >
                <Background color="#e0dbeb" gap={24} size={1} />
                <Controls />
                <MiniMap
                  nodeColor="#f8d5eb"
                  maskColor="#f7f7fbad"
                  pannable
                  zoomable
                />
              </ReactFlow>
              <div className="cf-canvas-tip">
                Arraste para organizar · Um ponto de saída pode conectar vários blocos · Duplo clique na
                linha para remover
              </div>
              <div className="cf-toolbar">
                <span>＋ Adicionar etapa:</span>
                {(Object.keys(LABELS) as Kind[]).map((k) => (
                  <button key={k} disabled={busy} onClick={() => add(k)}>
                    <b>{ICONS[k]}</b>
                    {LABELS[k]}
                  </button>
                ))}
                <select
                  aria-label="Tipo de conexão"
                  value={edgeKind}
                  onChange={(e) =>
                    setEdgeKind(e.target.value as "input" | "context")
                  }
                >
                  <option value="input">Entrada direta</option>
                  <option value="context">Referência / contexto</option>
                </select>
              </div>
            </div>
            {node && (
              <aside key={`${current.id}:${node.id}`} className="cf-inspector" aria-label="Detalhes da etapa">
                <header>
                  <h2>
                    <span>{ICONS[node.data.kind]}</span>{" "}
                    {LABELS[node.data.kind]}
                  </h2>
                  <button
                    aria-label="Fechar detalhes"
                    onClick={() => setSelected(null)}
                  >
                    ×
                  </button>
                </header>
                <div className="cf-inspector-scroll">
                <fieldset disabled={busy}>
                  {["image", "transform"].includes(node.data.kind) && (
                    <div className="cf-branch-actions">
                      <button className="cf-secondary" onClick={() => add("video", true)}>⑂ Criar ramificação de vídeo</button>
                      <p className="cf-muted">Reutilize esta imagem em várias opções. Escolha um modelo em cada bloco de vídeo.</p>
                    </div>
                  )}
                  <label>
                    Nome da etapa
                    <input
                      value={node.data.title}
                      maxLength={100}
                      onChange={(e) => patch({ title: e.target.value })}
                    />
                  </label>
                  {node.data.kind !== "output" && (
                    <label>
                      {node.data.kind === "idea" ? "Sua ideia" : "Prompt"}
                      <textarea
                        rows={5}
                        value={node.data.prompt}
                        maxLength={10000}
                        placeholder="Descreva o que você imagina…"
                        onChange={(e) => patch({ prompt: e.target.value })}
                      />
                    </label>
                  )}
                  {!["idea", "output"].includes(node.data.kind) && (
                    <>
                      <label>
                        Modelo
                        <select
                          value={node.data.model}
                          onChange={(e) => {
                            const m = MODELS.find(
                              (m) => m.id === e.target.value,
                            )!;
                            patch({
                              model: m.id,
                              ratio: m.ratios[0],
                              resolution: m.resolutions[0],
                              duration: m.durations[0] || node.data.duration,
                            });
                          }}
                        >
                          {MODELS.filter((m) =>
                            m.kinds.includes(node.data.kind),
                          ).map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Formato
                        <div className="cf-ratios">
                          {model?.ratios.map((r) => (
                            <button
                              key={r}
                              className={node.data.ratio === r ? "active" : ""}
                              onClick={() => patch({ ratio: r })}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </label>
                      {node.data.kind === "video" && (
                        <label>
                          Duração
                          <select value={node.data.duration} onChange={(e) => patch({ duration: Number(e.target.value) })}>
                            {model?.durations.map((d) => <option key={d} value={d}>{d} segundos</option>)}
                          </select>
                        </label>
                      )}
                      <details>
                        <summary>Avançado</summary>
                        <label>
                          Resolução
                          <select
                            value={
                              node.data.resolution || model?.resolutions[0]
                            }
                            onChange={(e) =>
                              patch({ resolution: e.target.value })
                            }
                          >
                            {model?.resolutions.map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                        </label>
                        <p>
                          {"Referências: "}
                          {node.data.kind === "video"
                            ? node.data.model === "veo3.1-reference"
                              ? "Até 3 referências visuais. Formato definido pelo modelo."
                              : model?.maxImages === 1
                                ? "Uma imagem obrigatória como quadro inicial."
                              : "Até 2 imagens: primeiro e último frame. Para contexto visual, escolha Veo · Referências."
                            : "Até 14 imagens de referência."}
                        </p>
                      </details>
                    </>
                  )}
                  {node.data.kind !== "idea" && (
                    <>
                      <div className="cf-context-head">
                        <h3>Contexto herdado</h3>
                        <span>{refs.length}</span>
                      </div>
                      <label className="cf-check">
                        <input
                          type="checkbox"
                          checked={node.data.inherit}
                          onChange={(e) => patch({ inherit: e.target.checked })}
                        />{" "}
                        Usar contexto anterior
                      </label>
                      {allRefs.length ? (
                        allRefs.map((n) => (
                          <label key={n.id} className="cf-ref">
                            <input
                              type="checkbox"
                              checked={!node.data.excluded.includes(n.id)}
                              onChange={(e) =>
                                patch({
                                  excluded: e.target.checked
                                    ? node.data.excluded.filter(
                                        (id) => id !== n.id,
                                      )
                                    : [...node.data.excluded, n.id],
                                })
                              }
                            />
                            <span>{ICONS[n.data.kind]}</span>
                            <div>
                              {n.data.title}
                              <small>
                                {n.data.kind === "idea"
                                  ? "Ideia da campanha"
                                  : n.data.assetId
                                    ? (() => {
                                        const index = references.findIndex(
                                          (r) => r.assetId === n.data.assetId,
                                        );
                                        const ref = references[index];
                                        if (!ref) return "Referência excluída";
                                        if (["veo3.1-fast", "wan2.2", "kling-v2.1-standard-i2v"].includes(node.data.model))
                                          return index === 0
                                            ? "Quadro inicial"
                                            : index === 1
                                              ? "Quadro final"
                                              : "Excede limite do modelo";
                                        return ref.role === "input"
                                          ? "Entrada direta"
                                          : "Contexto visual";
                                      })()
                                    : "Aguardando geração"}
                              </small>
                            </div>
                          </label>
                        ))
                      ) : (
                        <p className="cf-muted">
                          Conecte uma etapa para herdar suas referências.
                        </p>
                      )}
                      <div className="cf-upload-actions">
                        <label className="cf-upload">
                          ↑ Enviar imagem
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => upload(e.target.files?.[0])}
                          />
                        </label>
                        <button onClick={() => setPicker(true)}>
                          ▧ Biblioteca
                        </button>
                      </div>
                      {node.data.dirty && node.data.assetId && (
                        <p className="cf-stale">
                          ↻ Esta etapa mudou. Gere novamente para atualizar o
                          resultado.
                        </p>
                      )}
                      {node.data.assetId && (
                        <div className="cf-attached">
                          <Preview asset={assetFor(node.data.assetId)} />
                          <button
                            onClick={() =>
                              patch({
                                assetId: undefined,
                                referenceId: undefined,
                                status: undefined,
                              })
                            }
                          >
                            Remover asset desta etapa
                          </button>
                          <a
                            href={assetFor(node.data.assetId)?.url}
                            target="_blank"
                            rel="noreferrer"
                            download
                          >
                            Abrir / baixar ↗
                          </a>
                        </div>
                      )}
                    </>
                  )}
                  {node.data.kind !== "idea" && (
                    <button
                      className="cf-primary cf-full"
                      onClick={() =>
                        node.data.kind === "output"
                          ? run(node.id)
                          : setConfirmRun(node.id)
                      }
                    >
                      {node.data.kind === "output"
                        ? "Preparar entrega"
                        : `✦ Gerar ${LABELS[node.data.kind].toLowerCase()}`}
                    </button>
                  )}
                  {projectJobs
                    .filter(
                      (j) =>
                        j.nodeId === node.id &&
                        ["uncertain", "submitting"].includes(j.status),
                    )
                    .map((j) => (
                      <div className="cf-recovery" key={j.id}>
                        <h3>Verificar geração</h3>
                        <p>
                          O envio não foi confirmado. Consulte seu histórico na
                          MuAPI antes de repetir.
                        </p>
                        <label>
                          ID da solicitação na MuAPI
                          <input
                            value={remoteId}
                            onChange={(e) => setRemoteId(e.target.value)}
                            placeholder="Cole o request_id"
                          />
                        </label>
                        <button
                          disabled={!remoteId.trim()}
                          onClick={() => recover(j, remoteId.trim())}
                        >
                          Retomar pelo ID
                        </button>
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                "Você verificou no histórico MuAPI que esta solicitação não foi recebida? Reenviar uma geração já aceita pode consumir créditos novamente.",
                              )
                            )
                              recover(j);
                          }}
                        >
                          Conferi: não foi enviada
                        </button>
                      </div>
                    ))}
                  {assets.some((a) => a.nodeId === node.id) && (
                    <details>
                      <summary>Gerações anteriores</summary>
                      {assets
                        .filter((a) => a.nodeId === node.id)
                        .map((a) => (
                          <button
                            className="cf-history-item"
                            key={a.id}
                            onClick={() => attach(a, node.id, current.id)}
                          >
                            {new Date(a.createdAt).toLocaleString("pt-BR")} ·
                            Usar versão
                          </button>
                        ))}
                    </details>
                  )}
                  <button
                    className="cf-remove"
                    onClick={() => removeBlock(node.id)}
                  >
                    Remover etapa
                  </button>
                </fieldset>
                </div>
              </aside>
            )}
          </div>
        </main>
      )}
      {(view === "assets" || picker) && (
        <section className={picker ? "cf-modal-backdrop" : "cf-assets"}>
          <div className={picker ? "cf-modal cf-library" : "cf-home"}>
            <div className="cf-heading">
              <div>
                <p className="cf-eyebrow">SUA BIBLIOTECA CRIATIVA</p>
                <h1>
                  {picker
                    ? "Escolha um asset"
                    : "Assets que vão além de uma campanha."}
                </h1>
                <p>Reutilize suas melhores criações em qualquer projeto.</p>
              </div>
              {picker ? (
                <button onClick={() => setPicker(false)}>× Fechar</button>
              ) : (
                <label className="cf-primary cf-upload">
                  ↑ Enviar imagem
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => upload(e.target.files?.[0])}
                  />
                </label>
              )}
            </div>
            <div className="cf-assets-grid">
              {assets.map((a) => (
                <article className="cf-asset" key={a.id}>
                  <Preview asset={a} />
                  <div>
                    <strong>{a.title}</strong>
                    <small>
                      {a.kind === "video" ? "Vídeo" : "Imagem"} ·{" "}
                      {new Date(a.createdAt).toLocaleDateString("pt-BR")}
                    </small>
                    {picker ? (
                      <button
                        className="cf-primary"
                        onClick={() => {
                          if (current && selected) {
                            attach(a, selected, current.id);
                            patch({ assetId: a.id, referenceId: a.id });
                          }
                          setPicker(false);
                        }}
                      >
                        Usar nesta etapa
                      </button>
                    ) : (
                      <a href={a.url} target="_blank" rel="noreferrer" download>
                        Abrir / baixar ↗
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {!assets.length && (
              <div className="cf-empty-library">
                <span>▧</span>
                <h2>Espaço para suas melhores ideias.</h2>
                <p>Envie uma imagem ou gere seu primeiro asset em um fluxo.</p>
              </div>
            )}
          </div>
        </section>
      )}
      {recipes && (
        <div className="cf-modal-backdrop">
          <section
            className="cf-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Novo projeto"
          >
            <button
              className="cf-modal-close"
              aria-label="Fechar receitas"
              onClick={() => setRecipes(false)}
            >
              ×
            </button>
            <p className="cf-eyebrow">UM NOVO COMEÇO</p>
            <h2>Como você quer começar?</h2>
            <p>Escolha uma receita. Cada etapa pode ser sua.</p>
            <div className="cf-recipe-grid">
              {RECIPES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setRecipes(false);
                    open(recipe(r.id));
                  }}
                >
                  <span>{r.icon}</span>
                  <strong>{r.name}</strong>
                  <small>{r.desc}</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
      {confirmRun && (
        <div className="cf-modal-backdrop">
          <section
            className="cf-modal cf-confirm"
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar geração"
          >
            <h2>
              {connected
                ? "Tudo pronto para criar?"
                : !higgsfieldConnected ? "Modo demonstração" : "Este modelo utiliza MuAPI"}
            </h2>
            <p>
              {connected
                ? "A geração usa o saldo da sua conta MuAPI. O custo depende do modelo e dos parâmetros. Ao gerar tudo, somente etapas novas ou desatualizadas serão geradas."
                : !higgsfieldConnected ? "Você pode explorar receitas, montar ramificações e salvar seu fluxo. Para gerar com este modelo, configure a MuAPI em Configurações." : "Sua conta Higgsfield está autorizada, mas seus modelos ainda estão em integração. Para gerar com os modelos atuais do editor, configure também a MuAPI."}
            </p>
            {connected && (
              <p>
                Mantenha esta aba aberta para executar a sequência. Se sair,
                reabra o projeto para acompanhar a geração já enviada.
              </p>
            )}
            <div className="cf-confirm-actions">
              <button onClick={() => setConfirmRun(null)}>
                Voltar ao fluxo
              </button>
              {connected ? (
                <button className="cf-primary" onClick={() => run(confirmRun)}>
                  Confirmar e gerar
                </button>
              ) : (
                <Link className="cf-primary" href="/setup#muapi">
                  Abrir Configurações ↗
                </Link>
              )}
            </div>
          </section>
        </div>
      )}
      {deletion && <DeleteConfirmation kind={deletion.kind} title={deletion.title} onCancel={() => setDeletion(null)} onConfirm={confirmDeletion} />}
    </div>
  );
}
