"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  ControlButton,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  type ReactFlowInstance,
  type Connection,
  type FinalConnectionState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  BLOCKS,
  block,
  shortLabel,
  type Kind,
  type Block,
  type Flow,
  type Graph,
  type Run,
} from "@/lib/flow-types";
import { NODE_STYLE } from "@/lib/flow-presets";
import {
  connect as connectGraph,
  connectionProblem,
  outputLabel,
} from "@/lib/flow-graph";
import { Icon, IconButton, Modal, request } from "./StudioUI";
import { ChatGPTConnection, useChatGPT } from "./ChatGPTConnection";
import { NodeDialog } from "./NodeDialog";
import { ChatPopup } from "./ChatPopup";
import { IntegrationDialog } from "./IntegrationDialog";
import { GeneratorDialog } from "./GeneratorDialog";
import type { Generated } from "@/lib/flow-generator";
import { AgentNode, type VisualNode } from "./flow/AgentNode";
import { AgentEdge, type VisualEdge } from "./flow/AgentEdge";
import { ConnectionLine } from "./flow/ConnectionLine";
const nodeTypes = { block: AgentNode };
const edgeTypes = { agent: AgentEdge };
// Conexão iniciada em uma saída e solta no vazio: o próximo bloco nasce já conectado.
type Pending = {
  source: string;
  sourceHandle: string | null;
  position: { x: number; y: number };
  screen: { x: number; y: number };
};
export function FlowEditor({ id }: { id: string }) {
  const router = useRouter(),
    canvasRef = useRef<HTMLDivElement>(null),
    instance = useRef<Pick<
      ReactFlowInstance<VisualNode, VisualEdge>,
      "screenToFlowPosition" | "fitView"
    > | null>(
      null,
    ),
    past = useRef<Graph[]>([]),
    future = useRef<Graph[]>([]);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [] });
  const [dirty, setDirty] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [palette, setPalette] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [rename, setRename] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [connect, setConnect] = useState(false);
  const [integration, setIntegration] = useState(false);
  const [chat, setChat] = useState(false);
  const [history, setHistory] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [session, setSession] = useState<Run[]>([]);
  const [pendingInput, setPendingInput] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [demo, setDemo] = useState(false);
  const [snap, setSnap] = useState(false);
  const [dots, setDots] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [info, setInfo] = useState<Kind | null>(null);
  const [generator, setGenerator] = useState(false);
  const [dark, setDark] = useState(false);
  const { connection, setConnection } = useChatGPT();
  useEffect(() => {
    let alive = true;
    void request<Flow>("/api/flows/" + id)
      .then((f) => {
        if (alive) {
          setFlow(f);
          setGraph(f.graph);
          setTitle(f.name);
          setDescription(f.description);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    const theme = localStorage.getItem("agentflows-theme") || "light";
    document.documentElement.dataset.studioTheme = theme;
    const timer = setTimeout(() => setDark(theme === "dark"), 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id]);
  const snapshot = useCallback((g: Graph) => {
    past.current = [...past.current.slice(-49), structuredClone(g)];
    future.current = [];
    setUndoCount(past.current.length);
    setRedoCount(0);
  }, []);
  const commit = useCallback(
    (g: Graph) => {
      snapshot(graph);
      setGraph(g);
      setDirty(true);
    },
    [graph, snapshot, setGraph, setDirty],
  );
  const undo = useCallback(() => {
    const g = past.current.pop();
    if (!g) return;
    future.current.push(structuredClone(graph));
    setGraph(g);
    setUndoCount(past.current.length);
    setRedoCount(future.current.length);
    setDirty(true);
  }, [graph, setGraph, setDirty, setUndoCount, setRedoCount]);
  const redo = useCallback(() => {
    const g = future.current.pop();
    if (!g) return;
    past.current.push(structuredClone(graph));
    setGraph(g);
    setUndoCount(past.current.length);
    setRedoCount(future.current.length);
    setDirty(true);
  }, [graph, setGraph, setDirty, setUndoCount, setRedoCount]);
  const save = useCallback(async () => {
    if (!flow) throw new Error("Fluxo não carregado.");
    const saved = await request<Flow>("/api/flows/" + id, "PUT", {
      name: flow.name,
      description: flow.description,
      graph,
    });
    setFlow(saved);
    setDirty(false);
    return saved;
  }, [flow, graph, id, setFlow, setDirty]);
  const act = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError("");
      setNotice("");
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível concluir.");
      } finally {
        setBusy(false);
      }
    },
    [setBusy, setError, setNotice],
  );
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    const keys = (e: KeyboardEvent) => {
      if (editing || rename || connect || integration || generator) return;
      const el = e.target as HTMLElement;
      if (el.matches("input,textarea,select")) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (!busy)
          void act(async () => {
            await save();
            setNotice("Fluxo salvo.");
          });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("beforeunload", leave);
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("beforeunload", leave);
      window.removeEventListener("keydown", keys);
    };
  }, [
    dirty,
    editing,
    rename,
    connect,
    integration,
    generator,
    busy,
    save,
    undo,
    redo,
    act,
  ]);
  useEffect(() => {
    if (!history) return;
    void request<Run[]>("/api/runs?flowId=" + id)
      .then(setRuns)
      .catch((e) => setError(e.message));
  }, [history, id]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  function applyGenerated(g: Generated) {
    commit(g.graph);
    setFlow({
      ...flow!,
      name: /^Novo (fluxo|Agentflow)$/i.test(flow!.name) ? g.name : flow!.name,
      description: flow!.description || g.description,
    });
    setNotice("Fluxo gerado. Revise as instruções de cada bloco e salve.");
    setTimeout(
      () => instance.current?.fitView({ padding: 0.3, maxZoom: 1 }),
      60,
    );
  }
  function closePalette() {
    setPalette(false);
    setPending(null);
    setSearch("");
  }
  function add(kind: Kind, position?: { x: number; y: number }) {
    if (kind === "start" && graph.nodes.some((n) => n.data.kind === "start")) {
      setError("O fluxo tem apenas um Início.");
      return;
    }
    const bounds = canvasRef.current?.getBoundingClientRect();
    const pos = position ||
      pending?.position ||
      instance.current?.screenToFlowPosition({
        x: (bounds?.x || 0) + (bounds?.width || 800) / 2 - 100,
        y: (bounds?.y || 0) + (bounds?.height || 600) / 2,
      }) || { x: 300, y: 200 };
    const n = block(kind, "n_" + crypto.randomUUID(), pos.x, pos.y);
    n.data.label = nextLabel(kind);
    n.selected = true;
    let next: Graph = {
      ...graph,
      nodes: [...graph.nodes.map((x) => ({ ...x, selected: false })), n],
    };
    if (pending) {
      const c = { ...pending, target: n.id };
      if (!connectionProblem(next, c)) next = connectGraph(next, c);
    }
    commit(next);
    closePalette();
  }
  // Nome incremental como no Flowise: Agente 0, Agente 1, LLM 0...
  function nextLabel(kind: Kind) {
    const base = shortLabel(kind);
    const used = new Set(graph.nodes.map((n) => n.data.label));
    let i = graph.nodes.filter((n) => n.data.kind === kind).length;
    while (used.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  }
  function duplicate(n: Block) {
    const copy = structuredClone(n);
    copy.id = "n_" + crypto.randomUUID();
    copy.position = { x: n.position.x + 50, y: n.position.y + 120 };
    copy.data.label = nextLabel(n.data.kind);
    copy.selected = false;
    commit({ ...graph, nodes: [...graph.nodes, copy] });
    setNotice("Bloco duplicado.");
  }
  function renameBlock(id: string, label: string) {
    commit({
      ...graph,
      nodes: graph.nodes.map((x) =>
        x.id === id ? { ...x, data: { ...x.data, label } } : x,
      ),
    });
  }
  function remove(id: string) {
    commit({
      nodes: graph.nodes.filter((n) => n.id !== id),
      edges: graph.edges.filter((e) => e.source !== id && e.target !== id),
    });
  }
  function connectNodes(c: Connection) {
    const problem = connectionProblem(graph, c);
    if (problem) {
      setError(problem);
      return;
    }
    commit(connectGraph(graph, c));
  }
  // Ao soltar uma conexão: explica por que foi recusada ou, no vazio, oferece o próximo bloco.
  function connectEnd(
    event: MouseEvent | TouchEvent,
    state: FinalConnectionState,
  ) {
    if (state.isValid || !state.fromNode || state.fromHandle?.type !== "source")
      return;
    if (state.toNode) {
      const problem = connectionProblem(graph, {
        source: state.fromNode.id,
        target: state.toNode.id,
        sourceHandle: state.fromHandle.id,
      });
      if (problem) setError(problem);
      return;
    }
    const from = state.fromNode.id,
      handle = state.fromHandle.id ?? null;
    if (
      graph.edges.some(
        (e) => e.source === from && (e.sourceHandle || null) === handle,
      )
    ) {
      setError(
        "Esta saída já está conectada. Remova a conexão atual ou use uma Condição para ramificar.",
      );
      return;
    }
    const point = "changedTouches" in event ? event.changedTouches[0] : event;
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!point || !bounds || !instance.current) return;
    setPending({
      source: from,
      sourceHandle: handle,
      position: instance.current.screenToFlowPosition({
        x: point.clientX,
        y: point.clientY,
      }),
      screen: {
        x: Math.min(point.clientX - bounds.x, bounds.width - 330),
        y: Math.min(point.clientY - bounds.y, Math.max(bounds.height - 420, 80)),
      },
    });
    setPalette(true);
  }
  function exportFlow() {
    if (!flow) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              format: "build-agentflows/v1",
              name: flow.name,
              description: flow.description,
              graph,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = flow.name.replace(/[^a-z0-9_-]/gi, "_") + ".json";
    a.click();
    URL.revokeObjectURL(url);
  }
  // Cada execução vira uma troca no chat; o mesmo registro é atualizado enquanto roda.
  const updateRun = useCallback((r: Run) => {
    setRun(r);
    setSession((list) =>
      list.some((x) => x.id === r.id)
        ? list.map((x) => (x.id === r.id ? r : x))
        : [...list, r],
    );
  }, [setRun, setSession]);
  async function execute(input: string) {
    setRunning(true);
    setError("");
    setPendingInput(input);
    setRun(null);
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      await save();
      const from = new Date().toISOString();
      timer = setInterval(() => {
        void request<Run[]>("/api/runs?flowId=" + id)
          .then((items) => {
            const latest = items.find((r) => r.createdAt >= from);
            if (latest) updateRun(latest);
          })
          .catch(() => {});
      }, 800);
      updateRun(
        await request<Run>("/api/flows/" + id + "/run", "POST", {
          input,
          demo,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível executar.");
    } finally {
      if (timer) clearInterval(timer);
      setRunning(false);
    }
  }
  const node = graph.nodes.find((n) => n.id === editing);
  const visualNodes: VisualNode[] = graph.nodes.map((n) => {
    const done = run?.trace.some((t) => t.nodeId === n.id);
    const current = run?.next === n.id;
    const execution =
      current && ["running", "waiting", "failed"].includes(run?.status || "")
        ? run!.status
        : done
          ? "completed"
          : undefined;
    return {
      ...n,
      data: {
        ...n.data,
        execution,
        connected: graph.edges
          .filter((e) => e.source === n.id)
          .map((e) => e.sourceHandle || null),
        edit: () => setEditing(n.id),
        duplicate: () => duplicate(n),
        remove: () => remove(n.id),
        info: () => setInfo(n.data.kind),
        rename: (label: string) => renameBlock(n.id, label),
      },
    };
  });
  const kindOf = (id: string) => graph.nodes.find((n) => n.id === id)?.data.kind;
  const visualEdges: VisualEdge[] = graph.edges.map((e) => {
    const from = kindOf(e.source),
      to = kindOf(e.target);
    return {
      ...e,
      type: "agent",
      data: {
        sourceColor: from ? NODE_STYLE[from].color : "#6557d2",
        targetColor: to ? NODE_STYLE[to].color : "#6557d2",
        label: from ? outputLabel(from, e.sourceHandle) : "",
        active: running && run?.next === e.target,
      },
    };
  });
  if (!flow)
    return (
      <main className="studio-loading">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="studio-button" onClick={() => router.push("/")}>
              Voltar aos fluxos
            </button>
          </>
        ) : (
          <>
            <span className="studio-spinner" />
            Abrindo Agentflow…
          </>
        )}
      </main>
    );
  return (
    <main className="canvas-page">
      <header className="canvas-header">
        <IconButton
          icon="arrow"
          label="Voltar aos fluxos"
          onClick={() => {
            if (!dirty || window.confirm("Sair sem salvar as alterações?"))
              router.push("/");
          }}
        />
        <div className="canvas-title">
          <button
            onClick={() => {
              setTitle(flow.name);
              setDescription(flow.description);
              setRename(true);
            }}
          >
            <h1>{flow.name}</h1>
            <Icon name="settings" size={15} />
          </button>
          <span>
            <i className={dirty ? "unsaved" : ""} />
            {dirty
              ? "Alterações não salvas"
              : flow.published
                ? "Publicado · v" + flow.version
                : "Rascunho salvo"}
          </span>
        </div>
        <div className="canvas-header-actions">
          <button
            className={
              "studio-button connection-button" +
              (connection?.account ? " is-connected" : "")
            }
            onClick={() => setConnect(true)}
          >
            <Icon name="spark" size={17} />
            <span>{connection?.account ? "ChatGPT" : "Conectar ChatGPT"}</span>
          </button>
          <IconButton
            icon="runs"
            label="Histórico do fluxo"
            active={history}
            onClick={() => {
              setHistory(!history);
              setChat(false);
            }}
          />
          <IconButton
            icon="code"
            label="Implantar fluxo"
            onClick={() => setIntegration(true)}
          />
          <details className="canvas-menu">
            <summary aria-label="Mais ações">
              <Icon name="more" />
            </summary>
            <div>
              <button onClick={exportFlow}>
                <Icon name="download" size={16} />
                Exportar fluxo
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const f = await request<Flow>("/api/flows", "POST", {
                      name: flow.name + " (cópia)",
                    });
                    await request("/api/flows/" + f.id, "PUT", {
                      ...f,
                      description: flow.description,
                      graph,
                    });
                    router.push("/flows/" + f.id);
                  })
                }
              >
                <Icon name="copy" size={16} />
                Duplicar fluxo
              </button>
              <button className="danger" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" size={16} />
                Excluir fluxo
              </button>
            </div>
          </details>
          <button
            className="studio-button primary"
            disabled={busy || running}
            onClick={() =>
              act(async () => {
                await save();
                setNotice("Fluxo salvo.");
              })
            }
          >
            <Icon name="save" size={17} />
            <span>Salvar</span>
          </button>
        </div>
      </header>
      <div className="canvas-body">
        <div
          className="studio-canvas"
          ref={canvasRef}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const kind = e.dataTransfer.getData(
              "application/agentflow",
            ) as Kind;
            if (Object.hasOwn(BLOCKS, kind))
              add(
                kind,
                instance.current?.screenToFlowPosition({
                  x: e.clientX,
                  y: e.clientY,
                }),
              );
          }}
        >
          <ReactFlow<VisualNode, VisualEdge>
            nodes={visualNodes}
            edges={visualEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionLineComponent={ConnectionLine}
            connectionRadius={36}
            isValidConnection={(c) => !connectionProblem(graph, c)}
            onInit={(i) => {
              instance.current = i;
            }}
            onBeforeDelete={async () => {
              snapshot(graph);
              return true;
            }}
            onNodesChange={(changes) => {
              setGraph((g) => ({
                ...g,
                nodes: applyNodeChanges(changes, g.nodes as VisualNode[]).map(
                  (n) => ({ ...n, data: { ...n.data } }) as Block,
                ),
              }));
              if (changes.some((c) => ["remove", "position"].includes(c.type)))
                setDirty(true);
            }}
            onEdgesChange={(changes) => {
              setGraph((g) => ({
                ...g,
                edges: applyEdgeChanges(changes, g.edges),
              }));
              if (changes.some((c) => c.type === "remove")) setDirty(true);
            }}
            onNodeDragStart={() => snapshot(graph)}
            onConnect={connectNodes}
            onConnectEnd={connectEnd}
            onNodeDoubleClick={(_, n) => setEditing(n.id)}
            onPaneClick={() => {
              if (pending) closePalette();
            }}
            fitView
            fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
            minZoom={0.25}
            maxZoom={2}
            snapToGrid={snap}
            snapGrid={[25, 25]}
            deleteKeyCode={
              editing || rename || connect || integration || info || generator
                ? null
                : ["Backspace", "Delete"]
            }
            nodesDraggable={!running}
            nodesConnectable={!running}
            colorMode="light"
          >
            {dots && (
              <Background gap={16} size={1} color={dark ? "#4a4d5e" : "#aaa"} />
            )}
            <Controls
              position="bottom-center"
              orientation="horizontal"
              showInteractive={false}
            >
              <ControlButton
                title="Desfazer"
                aria-label="Desfazer"
                disabled={!undoCount}
                onClick={undo}
              >
                <Icon name="undo" size={16} />
              </ControlButton>
              <ControlButton
                title="Refazer"
                aria-label="Refazer"
                disabled={!redoCount}
                onClick={redo}
              >
                <Icon name="redo" size={16} />
              </ControlButton>
              <ControlButton
                title="Alinhar à grade"
                aria-label="Alinhar à grade"
                className={snap ? "active" : ""}
                onClick={() => setSnap(!snap)}
              >
                <Icon name="magnet" size={16} />
              </ControlButton>
              <ControlButton
                title="Mostrar fundo"
                aria-label="Mostrar fundo"
                className={dots ? "active" : ""}
                onClick={() => setDots(!dots)}
              >
                <Icon name="artboard" size={16} />
              </ControlButton>
            </Controls>
            <MiniMap
              position="bottom-left"
              pannable
              zoomable
              nodeColor={(n) => NODE_STYLE[(n.data as Block["data"]).kind].color}
              nodeStrokeColor={dark ? "#525252" : "#fff"}
              nodeStrokeWidth={3}
              maskColor={dark ? "#2d2d2d99" : "#f0f0f099"}
            />
          </ReactFlow>
          <div className="canvas-left-actions">
            <button
              className={"add-node-button" + (palette ? " active" : "")}
              title="Adicionar bloco"
              aria-label="Adicionar bloco"
              onClick={() => (palette ? closePalette() : setPalette(true))}
            >
              <Icon name={palette ? "close" : "plus"} size={23} />
            </button>
            <button
              className="generate-button"
              title="Gerar fluxo com IA"
              aria-label="Gerar fluxo com IA"
              onClick={() => setGenerator(true)}
            >
              <Icon name="spark" size={22} />
            </button>
          </div>
          {palette && (
            <aside
              className={"node-palette" + (pending ? " anchored" : "")}
              style={
                pending
                  ? { left: pending.screen.x, top: pending.screen.y }
                  : undefined
              }
            >
              <header>
                <h2>{pending ? "Próximo bloco" : "Adicionar blocos"}</h2>
                <IconButton
                  icon="close"
                  label="Fechar biblioteca"
                  onClick={closePalette}
                />
              </header>
              <label className="studio-search">
                <Icon name="search" size={17} />
                <input
                  autoFocus
                  placeholder="Buscar blocos"
                  aria-label="Buscar blocos"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div className="node-palette-scroll">
                {[
                  "Agentes e IA",
                  "Controle de fluxo",
                  "Dados e integrações",
                ].map((group) => (
                  <details key={group} open>
                    <summary>
                      {group}
                      <Icon name="chevron" size={14} />
                    </summary>
                    {(Object.keys(BLOCKS) as Kind[])
                      .filter(
                        (k) =>
                          NODE_STYLE[k].group === group &&
                          !(pending && k === "start") &&
                          (BLOCKS[k].label + " " + BLOCKS[k].help)
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                      )
                      .map((k) => (
                        <button
                          key={k}
                          draggable
                          onDragStart={(e) =>
                            e.dataTransfer.setData("application/agentflow", k)
                          }
                          onClick={() => add(k)}
                        >
                          <span
                            className="palette-node-icon"
                            style={{ background: NODE_STYLE[k].color }}
                          >
                            <Icon name={k} size={21} />
                          </span>
                          <span>
                            <strong>{BLOCKS[k].label}</strong>
                            <small>{BLOCKS[k].help}</small>
                          </span>
                          <Icon name="plus" size={15} />
                        </button>
                      ))}
                  </details>
                ))}
              </div>
            </aside>
          )}
          <div className="canvas-help">
            Arraste a seta de um bloco para conectar · clique duas vezes para
            editar
          </div>
          <div className="canvas-right-actions">
            <button
              className={"chat-fab" + (chat ? " active" : "")}
              title={chat ? "Fechar chat" : "Testar Agentflow"}
              aria-label={chat ? "Fechar chat" : "Testar Agentflow"}
              onClick={() => {
                setChat(!chat);
                setHistory(false);
              }}
            >
              <Icon name={chat ? "close" : "chat"} size={22} />
            </button>
          </div>
          {chat && (
            <ChatPopup
              session={session}
              pendingInput={pendingInput}
              running={running}
              demo={demo}
              connected={!!connection?.account}
              expanded={expanded}
              onDemo={setDemo}
              onSend={(text) => void execute(text)}
              onChange={updateRun}
              onConnect={() => setConnect(true)}
              onClose={() => setChat(false)}
              onClear={() => {
                setSession([]);
                setRun(null);
              }}
              onExpand={() => setExpanded(!expanded)}
            />
          )}
        </div>
        {history && (
          <aside className="canvas-test-panel">
            <header>
              <div>
                <Icon name="runs" size={20} />
                <h2>Execuções do fluxo</h2>
              </div>
              <IconButton
                icon="close"
                label="Fechar painel"
                onClick={() => setHistory(false)}
              />
            </header>
            <div className="flow-runs-list">
              {!runs.length ? (
                <div className="chat-empty">
                  <Icon name="runs" size={30} />
                  <h3>Nenhuma execução ainda</h3>
                  <p>Teste seu fluxo para acompanhar cada etapa.</p>
                </div>
              ) : (
                runs.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      updateRun(r);
                      setChat(true);
                      setHistory(false);
                    }}
                  >
                    <span className={"run-status-dot " + r.status} />
                    <span>
                      <strong>{r.input.slice(0, 70)}</strong>
                      <small>
                        {new Date(r.createdAt).toLocaleString("pt-BR")} ·{" "}
                        {r.demo ? "Demonstração" : "ChatGPT"}
                      </small>
                    </span>
                    <span>
                      {r.status === "completed"
                        ? "Concluída"
                        : r.status === "waiting"
                          ? "Aguardando"
                          : r.status === "failed"
                            ? "Falhou"
                            : "Em execução"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </aside>
        )}
      </div>
      {error && (
        <div role="alert" className="canvas-toast error">
          {error}
          <button aria-label="Fechar erro" onClick={() => setError("")}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="canvas-toast">
          <Icon name="check" size={17} />
          {notice}
        </div>
      )}
      {node && (
        <NodeDialog
          key={node.id}
          node={node}
          others={graph.nodes.map((n) => ({ id: n.id, label: n.data.label }))}
          models={connection?.models || []}
          onClose={() => setEditing(null)}
          onSave={(n) => {
            commit({
              ...graph,
              nodes: graph.nodes.map((x) => (x.id === n.id ? n : x)),
            });
            setNotice("Bloco atualizado. Salve o fluxo para manter.");
          }}
        />
      )}
      {info && (
        <Modal title={BLOCKS[info].label} onClose={() => setInfo(null)}>
          <div className="node-dialog-type">
            <span style={{ background: NODE_STYLE[info].color }}>
              <Icon name={info} size={24} />
            </span>
            <div>
              <strong>{BLOCKS[info].label}</strong>
              <p>{BLOCKS[info].help}</p>
            </div>
          </div>
          <p>
            {outputLabel(info, "yes")
              ? `Este bloco tem duas saídas (${outputLabel(info, "yes")} e ${outputLabel(info, "no")}). Conecte cada uma ao próximo passo.`
              : info === "loop"
                ? "Repetir volta a uma etapa anterior pela saída Repetir até o limite e então segue pela saída Concluir."
                : info === "end"
                  ? "A Resposta encerra o fluxo e entrega o texto final a quem chamou."
                  : "Conecte a saída deste bloco ao próximo passo do fluxo."}
          </p>
          <div className="modal-actions">
            <button
              className="studio-button primary"
              onClick={() => setInfo(null)}
            >
              Entendi
            </button>
          </div>
        </Modal>
      )}
      {generator && (
        <GeneratorDialog
          flowId={id}
          replaces={graph.nodes.length > 1 || graph.edges.length > 0}
          connected={!!connection?.account}
          onConnect={() => {
            setGenerator(false);
            setConnect(true);
          }}
          onClose={() => setGenerator(false)}
          onApply={applyGenerated}
        />
      )}
      {connect && (
        <ChatGPTConnection
          onClose={() => setConnect(false)}
          onChange={setConnection}
        />
      )}
      {integration && (
        <IntegrationDialog
          flow={flow}
          save={save}
          onChange={setFlow}
          onClose={() => setIntegration(false)}
        />
      )}
      {rename && (
        <Modal title="Detalhes do Agentflow" onClose={() => setRename(false)}>
          <div className="node-fields">
            <label>
              Nome
              <input
                autoFocus
                value={title}
                maxLength={100}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Descrição
              <textarea
                rows={3}
                value={description}
                maxLength={1000}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </div>
          <div className="modal-actions">
            <button className="studio-button" onClick={() => setRename(false)}>
              Cancelar
            </button>
            <button
              className="studio-button primary"
              disabled={!title.trim()}
              onClick={() => {
                setFlow({ ...flow, name: title.trim(), description });
                setDirty(true);
                setRename(false);
              }}
            >
              Salvar detalhes
            </button>
          </div>
        </Modal>
      )}
      {confirmDelete && (
        <Modal
          title="Excluir Agentflow"
          onClose={() => setConfirmDelete(false)}
        >
          <p>
            Excluir “{flow.name}”? O histórico de execuções será preservado.
          </p>
          <div className="modal-actions">
            <button
              className="studio-button"
              onClick={() => setConfirmDelete(false)}
            >
              Cancelar
            </button>
            <button
              className="studio-button danger"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await request("/api/flows/" + id, "DELETE");
                  setDirty(false);
                  router.push("/");
                })
              }
            >
              Excluir fluxo
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
