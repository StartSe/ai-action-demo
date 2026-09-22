"use client";
/* eslint-disable @next/next/no-img-element -- Assets include user uploads, data URLs and external provider outputs. */
import Link from "next/link";
import DeleteConfirmation from "./DeleteConfirmation";
import Preview from "./FlowPreview";
import FlowModelPicker from "./FlowModelPicker";
import { FlowDialog, FlowSkeleton, FlowToasts, useFlowMessages } from "./FlowFeedback";
import { generationPlan, modelSettings, MODEL_HELP } from "@/lib/flow/experience";
import { version } from "@/package.json";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useId, useRef, useState } from "react";
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
  let r: Response;
  try { r = await fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(120000) }); }
  catch { throw new Error("Não foi possível conectar. Verifique sua conexão e tente novamente."); }
  let data;
  try { data = await r.json(); }
  catch { throw new Error("O servidor não respondeu como esperado. Tente novamente em instantes."); }
  if (!data || typeof data !== "object") throw new Error("O servidor não respondeu como esperado. Tente novamente em instantes.");
  if (!r.ok) throw new Error(data.error || "Não foi possível concluir. Tente novamente.");
  return data;
}
function Generating({ kind, status, asset, startedAt }: { kind: Kind; status?: string; asset?: Asset; startedAt?: string }) {
  const [elapsed, setElapsed] = useState(0);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  useEffect(() => {
    const start = startedAt ? Date.parse(startedAt) : Date.now();
    const t = setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000))), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  const title = status === "sending" ? "Enviando ao modelo…" : kind === "video" ? "Gerando seu vídeo…" : kind === "transform" ? "Transformando sua imagem…" : "Gerando sua imagem…";
  const hint = elapsed >= 120 ? "Ainda aguardando o resultado. Você não precisa enviar de novo." : "O tempo varia conforme o modelo e a fila. Avisaremos aqui quando terminar.";
  return (
    <div className="cf-generating">
      {asset && (asset.kind === "video" ? <video src={asset.url} muted preload="metadata" aria-hidden="true" /> : <img src={asset.url} alt="" aria-hidden="true" />)}
      <svg className="cf-waves" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`cfw1${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f7bfe6" stopOpacity=".7" />
            <stop offset="1" stopColor="#dccbfb" stopOpacity=".45" />
          </linearGradient>
          <linearGradient id={`cfw2${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffffff" stopOpacity=".85" />
            <stop offset="1" stopColor="#f3d2ef" stopOpacity=".5" />
          </linearGradient>
        </defs>
        <path d="M0 118 C70 60 150 175 250 108 S375 40 400 66 L400 200 L0 200 Z" fill={`url(#cfw1${uid})`} />
        <path d="M0 165 C90 105 200 205 300 142 S372 96 400 118 L400 200 L0 200 Z" fill={`url(#cfw2${uid})`} />
      </svg>
      <div className="cf-generating-body">
        <span className="cf-spark" aria-hidden="true">
          <i /><i />
          <svg viewBox="0 0 64 64">
            <defs>
              <linearGradient id={`cfs${uid}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#f22baa" />
                <stop offset="1" stopColor="#7b3fe4" />
              </linearGradient>
            </defs>
            <path d="M32 3 C34.5 21 43 29.5 61 32 C43 34.5 34.5 43 32 61 C29.5 43 21 34.5 3 32 C21 29.5 29.5 21 32 3 Z" fill={`url(#cfs${uid})`} />
            <path d="M32 14 C33.2 24.5 39.5 30.8 50 32 C39.5 33.2 33.2 39.5 32 50 C30.8 39.5 24.5 33.2 14 32 C24.5 30.8 30.8 24.5 32 14 Z" fill="#fff" opacity=".55" />
          </svg>
          <em /><em /><em />
        </span>
        <strong>{title}</strong>
        <small>{status === "sending" ? "Preparando a solicitação" : "Pedido recebido · aguardando resultado"}</small>
        <span className="cf-elapsed">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} decorridos</span>
        <span className="cf-progress" aria-hidden="true"><i /></span>
        <em>{hint}</em>
      </div>
    </div>
  );
}
function CreativeNode({
  data,
  selected,
}: NodeProps<Block["data"] & { asset?: Asset; onRemove?: () => void; onCancel?: () => void; onRun?: () => void; onReview?: () => void; onModel?: () => void; jobError?: string; startedAt?: string; locked?: boolean }>) {
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
          <button className="cf-node-cancel nodrag nopan" title="A execução para depois desta geração" onClick={(event) => { event.stopPropagation(); data.onCancel?.(); }}>Pausar sequência</button>
        ) : (
          <button className="cf-node-delete nodrag nopan" aria-label={`Excluir bloco ${data.title}`} title="Excluir bloco" disabled={data.locked} onClick={(event) => { event.stopPropagation(); data.onRemove?.(); }}>×</button>
        )}
      </header>
      {data.kind === "idea" ? (
        <p className="cf-idea">
          {data.prompt || "Descreva sua campanha. O que vamos criar?"}
        </p>
      ) : loading ? (
        <Generating kind={data.kind} status={data.status} asset={data.asset} startedAt={data.startedAt} />
      ) : (
        <Preview asset={data.asset} autoPlay />
      )}
      {problem && <div className="cf-node-problem"><p>{data.jobError || "Esta geração precisa de atenção."}</p><button className="nodrag nopan" onClick={(e) => { e.stopPropagation(); data.onReview?.(); }}>Ver como resolver</button></div>}
      <footer>
        {["idea", "output"].includes(data.kind) ? <span>{data.kind === "idea" ? "O início de tudo" : data.asset ? "Pronto para sua campanha" : "Conecte o resultado para entregar"}</span> : <button className="nodrag nopan cf-node-model" disabled={data.locked} onClick={(e) => { e.stopPropagation(); data.onModel?.(); }} title="Escolher modelo">{MODELS.find((m) => m.id === data.model)?.name}⌄</button>}
        {data.kind !== "idea" && <span>{data.kind === "video" ? `${data.duration}s · ` : ""}{data.ratio}</span>}
      </footer>
      {!["idea", "output"].includes(data.kind) && !loading && <div className="cf-node-actions">
        <button className="nodrag nopan" disabled={data.locked || ["uncertain", "submitting"].includes(data.status || "")} onClick={(e) => { e.stopPropagation(); data.onRun?.(); }}>{data.status === "failed" ? "↻ Tentar novamente" : data.asset ? "✦ Gerar novamente" : "✦ Gerar"}</button>
        {data.asset && <a className="nodrag nopan" href={data.asset.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Abrir ↗</a>}
      </div>}
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
  const { messages, dismiss, notify, setError, setNotice } = useFlowMessages();
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [modelPicker, setModelPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadLock = useRef(false);
  const [trackingIssue, setTrackingIssue] = useState(false);
  const [sequence, setSequence] = useState<{ index: number; total: number; title: string } | null>(null);
  const [saved, setSaved] = useState("Salvo");
  const [recipes, setRecipes] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [edgeKind, setEdgeKind] = useState<"input" | "context">("input");
  const [generating, setBusy] = useState(false);
  const busy = generating || uploading;
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
    let active = true;
    Promise.all([api("/api/flows"), api("/api/flow-assets")])
      .then(([p, a]) => {
        if (!active) return;
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
      .catch((e) => { if (active) setLoadError(e.message); });
    return () => {
      active = false;
      mounted.current = false;
      stop.current = true;
    };
  }, [initialProjectId, loadAttempt, setError]);
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => {
      persist(current).catch((e) => {
        setSaved("Não salvo");
        setError(e.message);
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [current, persist, setError]);
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
    if (runLock.current || uploadLock.current) {
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
    setProjectJobs([]);
    setTrackingIssue(false);
    setView("editor");
    window.history.replaceState(null, "", `/projetos/${encodeURIComponent(p.id)}`);
    setTimeout(() => instance?.fitView({ padding: 0.2 }), 80);
    runLock.current = true;
    setBusy(true);
    let jobsLoaded = false;
    try {
      const { jobs } = await api(
        `/api/flow-generate?projectId=${encodeURIComponent(p.id)}`,
      );
      jobsLoaded = true;
      setProjectJobs(jobs);
      const seen = new Set<string>();
      const pending: Job[] = [];
      for (const j of jobs as Job[]) {
        if (seen.has(j.nodeId)) continue;
        seen.add(j.nodeId);
        if (j.status === "completed" && j.asset) acceptGeneration(j);
        if (j.status === "pending") pending.push(j);
        if (j.status === "failed") setError(j.error || "Uma geração falhou. Selecione a etapa para tentar novamente.");
        if (["uncertain", "submitting"].includes(j.status))
          setError(
            "Há uma geração sem confirmação. Confira o histórico MuAPI antes de reenviar.",
          );
      }
      if (pending.length) {
        runLock.current = true;
        setBusy(true);
        try {
          const results = await Promise.allSettled(pending.map((j) => poll(j)));
          const failed = results.find((result) => result.status === "rejected");
          if (failed?.status === "rejected") throw failed.reason;
        } finally {
          runLock.current = false;
          setBusy(false);
        }
      }
    } catch (e) {
      if (!jobsLoaded) setTrackingIssue(true);
      setError((e as Error).message);
    } finally {
      runLock.current = false;
      setBusy(false);
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
    let failures = 0;
    while (mounted.current) {
      const snapshot = latest;
      setProjectJobs((list) => [
        snapshot,
        ...list.filter((item) => item.id !== snapshot.id),
      ]);
      if (snapshot.status === "completed" && snapshot.asset) {
        acceptGeneration(snapshot);
        setTrackingIssue(false);
        notify(`${snapshot.title}: ${snapshot.kind === "video" ? "vídeo pronto" : "imagem pronta"}.`, "success", { label: "Ver resultado", run: () => { setSelected(snapshot.nodeId); instance?.fitView({ nodes: [{ id: snapshot.nodeId }], padding: 0.6, duration: 300 }); } });
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
      if (!mounted.current) break;
      try {
        latest = (await api(`/api/flow-generate?id=${encodeURIComponent(snapshot.id)}`, { signal: AbortSignal.timeout(60000) })).job;
        failures = 0;
        setTrackingIssue(false);
      } catch {
        if (!mounted.current) break;
        setTrackingIssue(true);
        failures++;
        if (failures >= 3) throw new Error("Não foi possível atualizar o andamento. Sua geração foi preservada. Use Retomar acompanhamento para consultar o resultado.");
      }
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
    if (runLock.current || uploadLock.current) return;
    if (live.current) {
      const plan = generationPlan(live.current, target, assets);
      if (plan.issue) { setSelected(plan.issue.nodeId); setError(plan.issue.message); setConfirmRun(null); return; }
    }
    runLock.current = true;
    setBusy(true);
    stop.current = false;
    setError("");
    setTrackingIssue(false);
    setConfirmRun(null);
    try {
      const p = live.current;
      if (!p) return;
      await persist(p);
      const ordered = order(p);
      const todo =
        target === "all" ? ordered : ordered.filter((n) => n.id === target);
      const total = todo.filter((n) => !["idea", "output"].includes(n.data.kind) && !(target === "all" && n.data.assetId && !n.data.dirty)).length;
      let index = 0;
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
        setSequence({ index: ++index, total, title: n.data.title });
        if (index === 1) setNotice("Geração iniciada. Acompanhe o resultado no bloco.");
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
      setSequence(null);
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
    if (runLock.current || uploadLock.current) return;
    runLock.current = true;
    setBusy(true);
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
    if (!file || uploadLock.current || runLock.current) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size === 0 || file.size > 10 * 1024 * 1024) {
      setError("Envie JPG, PNG ou WebP de até 10 MB.");
      return;
    }
    uploadLock.current = true;
    setUploading(true);
    const projectId = live.current?.id;
    const nodeId = selected;
    try {
      const form = new FormData();
      form.set("file", file);
      if (projectId) form.set("projectId", projectId);
      const { asset } = await api("/api/flow-assets", { method: "POST", body: form });
      setAssets((list) => [asset, ...list]);
      const p = live.current;
      if (nodeId && p && p.id === projectId) {
        change({ ...p, nodes: p.nodes.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, assetId: n.data.kind === "video" ? n.data.assetId : asset.id, referenceId: asset.id, dirty: n.data.kind === "video", selectionVersion: (n.data.selectionVersion || 0) + 1 } } : n) });
      }
      notify("Imagem adicionada à biblioteca.", "success");
    } catch (e) { setError((e as Error).message); }
    finally { uploadLock.current = false; setUploading(false); }
  }
  async function resumeTracking() {
    if (runLock.current || !live.current) return;
    setTrackingIssue(false);
    setError("");
    await open(live.current);
  }
  async function navigate(v: "projects" | "assets") {
    if (runLock.current || uploadLock.current) {
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
  const plan = current && confirmRun ? generationPlan(current, confirmRun, assets) : null;
  const nodeJob = projectJobs.find((j) => j.nodeId === node?.id);
  const unsettled = projectJobs.some((j, i) => projectJobs.findIndex((other) => other.nodeId === j.nodeId) === i && ["pending", "uncertain", "submitting"].includes(j.status));
  const nodeIssue = current && node && !["idea", "output"].includes(node.data.kind) ? generationPlan(current, node.id, assets).issue : null;
  const visibleAssets = picker ? assets.filter((a) => a.kind === "image") : assets;
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
            <small>Creative Flow · v{version}</small>
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
      <FlowToasts messages={messages} dismiss={dismiss} />
      {view === "projects" && (
        <main className="cf-home">
          <div className="cf-heading">
            <div>
              <p className="cf-eyebrow">DA IDEIA À CAMPANHA</p>
              <h1>Seu próximo grande criativo.</h1>
              <p>Crie, conecte e transforme ideias em imagens e vídeos.</p>
            </div>
            <button className="cf-primary" disabled={!loaded} onClick={() => setRecipes(true)}>
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
                disabled={!loaded}
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
          {loadError ? <div className="cf-load-error" role="alert"><h2>Não foi possível carregar seus projetos.</h2><p>{loadError}</p><button className="cf-primary" onClick={() => { setLoadError(""); setLoadAttempt((n) => n + 1); }}>Tentar carregar novamente</button></div> : !loaded ? (
            <FlowSkeleton label="Carregando projetos e biblioteca…" />
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
                          <Preview asset={own[0]} interactive={false} />
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
          {loaded && projects.length > 0 && visibleProjects.length === 0 && <p className="cf-no-results">Nenhum projeto encontrado. <button onClick={() => { setQuery(""); setFilter("all"); }}>Limpar filtros</button></p>}
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
              disabled={busy || unsettled}
              onClick={() => setConfirmRun("all")}
            >
              ▷ {uploading ? "Enviando imagem…" : generating ? "Gerando…" : "Gerar tudo"}
            </button>
            {generating && (
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
          {(generating || trackingIssue || unsettled || uploading) && <div className={`cf-run-status ${trackingIssue ? "has-issue" : ""}`} role="status">
            <span>{uploading ? "Enviando imagem…" : trackingIssue ? generating ? "Conexão interrompida. Tentando atualizar o andamento…" : "Acompanhamento interrompido. A geração já enviada foi preservada." : generating ? sequence ? `Etapa ${sequence.index} de ${sequence.total} · ${sequence.title}` : "Acompanhando geração em andamento…" : "Há uma geração aguardando confirmação. Selecione o bloco para verificar."}</span>
            {!generating && (trackingIssue || projectJobs.some((j) => j.status === "pending")) && <button onClick={() => void resumeTracking()}>Retomar acompanhamento</button>}
          </div>}
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
                    onRun: () => { setSelected(n.id); setConfirmRun(n.id); },
                    onReview: () => setSelected(n.id),
                    onModel: () => { setSelected(n.id); setModelPicker(true); },
                    startedAt: projectJobs.find((j) => j.nodeId === n.id)?.createdAt,
                    jobError: projectJobs.find((j) => j.nodeId === n.id)?.error,
                    onCancel: () => { stop.current = true; setNotice("A execução vai parar após a geração atual."); },
                    status: sendingId === n.id ? "sending" : (() => { const j = projectJobs.find((j) => j.nodeId === n.id); return j && ["pending", "failed", "uncertain", "submitting"].includes(j.status) ? j.status : n.data.status; })(),
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
                      <div className="cf-model-field">
                        <span>Modelo</span>
                        <button className="cf-model-trigger" onClick={() => setModelPicker(true)} aria-haspopup="dialog"><strong>{model?.name || "Escolher modelo"}</strong><span>Trocar ⌄</span></button>
                        <p>{MODEL_HELP[node.data.model]?.description}</p>
                        <small>{MODEL_HELP[node.data.model]?.references}</small>
                      </div>
                      <label>
                        Formato
                        <div className="cf-ratios">
                          {model?.ratios.map((r) => (
                            <button
                              key={r}
                              aria-pressed={node.data.ratio === r}
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
                          <select aria-label="Duração" value={node.data.duration} onChange={(e) => patch({ duration: Number(e.target.value) })}>
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
                          {uploading ? "Enviando imagem…" : "↑ Enviar imagem"}
                          <input
                            type="file"
                            disabled={busy}
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }}
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
                  {nodeJob?.status === "failed" && <div className="cf-inline-issue" role="status"><strong>A geração não foi concluída.</strong><p>{nodeJob.error || "Revise os parâmetros e tente novamente."}</p></div>}
                  {nodeIssue && !busy && <p className="cf-inline-issue">{nodeIssue.message}</p>}
                  {node.data.kind !== "idea" && (
                    <button
                      disabled={Boolean(nodeIssue) || Boolean(nodeJob && ["pending", "uncertain", "submitting"].includes(nodeJob.status))}
                      className="cf-primary cf-full"
                      onClick={() =>
                        node.data.kind === "output"
                          ? run(node.id)
                          : setConfirmRun(node.id)
                      }
                    >
                      {node.data.kind === "output"
                        ? "Preparar entrega"
                        : nodeJob?.status === "failed" ? "↻ Tentar novamente" : `✦ Gerar ${LABELS[node.data.kind].toLowerCase()}`}
                    </button>
                  )}
                  {projectJobs
                    .filter(
                      (j) =>
                        j.id === nodeJob?.id &&
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
                  {uploading ? "Enviando imagem…" : "↑ Enviar imagem"}
                  <input
                    type="file"
                    disabled={busy}
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }}
                  />
                </label>
              )}
            </div>
            {!loaded && !loadError && <FlowSkeleton label="Carregando biblioteca…" />}
            <div className="cf-assets-grid">
              {visibleAssets.map((a) => (
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
                            patch({ ...(node?.data.kind !== "video" ? { assetId: a.id } : {}), dirty: node?.data.kind === "video", referenceId: a.id });
                            notify("Imagem de referência selecionada.", "success");
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
            {loaded && !visibleAssets.length && (
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
      {modelPicker && node && <FlowModelPicker node={node} onClose={() => setModelPicker(false)} onSelect={(id) => {
        const settings = modelSettings(node.data, id);
        patch(settings);
        setModelPicker(false);
        const adjusted = settings.ratio !== node.data.ratio || settings.duration !== node.data.duration || settings.resolution !== (node.data.resolution || model?.resolutions[0]);
        notify(adjusted ? "Modelo alterado. Os parâmetros incompatíveis foram ajustados; revise antes de gerar." : "Modelo alterado. Suas escolhas foram mantidas.");
      }} />}
      {confirmRun && (
        <FlowDialog title="Confirmar geração" className="cf-confirm" onClose={() => setConfirmRun(null)}>
            <h2>{connected ? "Tudo pronto para criar?" : "Conecte a MuAPI para gerar"}</h2>
            {connected ? <>
              <p>{plan?.steps.length || 0} {plan?.steps.length === 1 ? "geração" : "gerações"} nesta execução. Etapas já atualizadas serão reutilizadas em Gerar tudo.</p>
              <ul className="cf-generation-summary">{plan?.steps.map((n) => <li key={n.id}><strong>{n.data.title}</strong><span>{MODELS.find((m) => m.id === n.data.model)?.name}</span><small>{n.data.ratio} · {n.data.resolution || MODELS.find((m) => m.id === n.data.model)?.resolutions[0]}{n.data.kind === "video" ? ` · ${n.data.duration}s` : ""}</small></li>)}</ul>
              <p>A MuAPI cobra pelo modelo e pelos parâmetros escolhidos. O provedor não informa o preço antecipadamente nesta integração.</p>
              {confirmRun === "all" && <p>Mantenha a aba aberta para executar a sequência. Pausar interrompe as próximas etapas; a geração enviada continua.</p>}
            </> : <p>{higgsfieldConnected ? "O Higgsfield está autorizado. Os modelos deste editor usam a MuAPI, que precisa ser conectada em Configurações." : "Você pode montar e salvar seu fluxo. Para criar imagens e vídeos, conecte sua conta em Configurações."}</p>}
            {plan?.issue && <div className="cf-inline-issue" role="alert"><strong>{plan.issue.title}</strong><p>{plan.issue.message}</p><button onClick={() => { setSelected(plan.issue!.nodeId); setConfirmRun(null); }}>Revisar etapa</button></div>}
            <div className="cf-confirm-actions">
              <button onClick={() => setConfirmRun(null)}>Voltar ao fluxo</button>
              {connected ? <button className="cf-primary" disabled={Boolean(plan?.issue) || busy || unsettled} onClick={() => run(confirmRun)}>{plan?.steps.length ? "Confirmar e gerar" : "Atualizar fluxo"}</button> : <button className="cf-primary" onClick={async () => { try { if (live.current) await persist(live.current); router.push("/setup#muapi"); } catch (e) { setError((e as Error).message); } }}>Abrir Configurações ↗</button>}
            </div>
        </FlowDialog>
      )}
      {deletion && <DeleteConfirmation kind={deletion.kind} title={deletion.title} onCancel={() => setDeletion(null)} onConfirm={confirmDeletion} />}
    </div>
  );
}
