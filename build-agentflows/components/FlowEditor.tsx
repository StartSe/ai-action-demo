"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  ControlButton,
  MiniMap,
  Handle,
  Position,
  NodeToolbar,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeProps,
  type Node,
  type ReactFlowInstance,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  BLOCKS,
  block,
  type Kind,
  type Block,
  type Flow,
  type Graph,
  type Run,
} from "@/lib/flow-types";
import { NODE_STYLE } from "@/lib/flow-presets";
import { Icon, IconButton, Modal, request } from "./StudioUI";
import { ChatGPTConnection, useChatGPT } from "./ChatGPTConnection";
import { NodeDialog } from "./NodeDialog";
import { RunView } from "./RunView";
import { IntegrationDialog } from "./IntegrationDialog";

type VisualData = Block["data"] & {
  execution?: string;
  edit?: () => void;
  duplicate?: () => void;
  remove?: () => void;
};
function FlowNode({ data, selected }: NodeProps<Node<VisualData>>) {
  const style = NODE_STYLE[data.kind],
    branches =
      data.kind === "condition" || data.kind === "approval"
        ? ["yes", "no"]
        : data.kind === "loop"
          ? ["repeat", "done"]
          : [];
  return (
    <>
      <NodeToolbar>
        <div className="node-hover-toolbar">
          <IconButton
            icon="settings"
            label="Editar bloco"
            onClick={() => data.edit?.()}
          />
          {data.kind !== "start" && (
            <IconButton
              icon="copy"
              label="Duplicar bloco"
              onClick={() => data.duplicate?.()}
            />
          )}
          <IconButton
            icon="trash"
            label="Excluir bloco"
            onClick={() => data.remove?.()}
          />
        </div>
      </NodeToolbar>
      <div
        className={
          "agent-node" +
          (selected ? " selected" : "") +
          (data.execution ? " execution-" + data.execution : "")
        }
        style={
          {
            "--node-color": style.color,
            "--node-soft": style.soft,
          } as CSSProperties
        }
      >
        {data.kind !== "start" && (
          <Handle type="target" position={Position.Left} />
        )}
        <span className="agent-node-icon">
          <Icon name={data.kind} size={24} />
        </span>
        <div className="agent-node-copy">
          <strong>{data.label}</strong>
          <div className="agent-node-caption">
            {["agent", "llm"].includes(data.kind) ? (
              <span>
                <Icon name="spark" size={12} />
                ChatGPT
              </span>
            ) : data.kind === "start" ? (
              <span>
                <Icon name="chat" size={12} />
                Entrada de conversa
              </span>
            ) : (
              <span>{BLOCKS[data.kind].label}</span>
            )}
          </div>
        </div>
        {data.execution && (
          <span className={"node-execution-badge " + data.execution}>
            {data.execution === "running" ? (
              <span className="studio-spinner" />
            ) : (
              <Icon
                name={
                  data.execution === "failed"
                    ? "close"
                    : data.execution === "waiting"
                      ? "approval"
                      : "check"
                }
                size={13}
              />
            )}
          </span>
        )}
        {data.kind !== "end" &&
          (branches.length ? (
            branches.map((h, i) => (
              <div key={h}>
                <span
                  className="branch-label"
                  style={{ top: i ? "72%" : "27%" }}
                >
                  {h === "yes"
                    ? "Sim"
                    : h === "no"
                      ? "Não"
                      : h === "repeat"
                        ? "Repetir"
                        : "Concluir"}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={h}
                  style={{ top: i ? "78%" : "33%" }}
                />
              </div>
            ))
          ) : (
            <Handle type="source" position={Position.Right} />
          ))}
      </div>
    </>
  );
}
const nodeTypes = { block: FlowNode };
export function FlowEditor({ id }: { id: string }) {
  const router = useRouter(),
    canvasRef = useRef<HTMLDivElement>(null),
    instance = useRef<Pick<ReactFlowInstance, "screenToFlowPosition"> | null>(
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
  const [input, setInput] = useState("");
  const [demo, setDemo] = useState(false);
  const [snap, setSnap] = useState(false);
  const [dots, setDots] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
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
    return () => {
      alive = false;
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
      if (editing || rename || connect || integration) return;
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
  function add(kind: Kind, position?: { x: number; y: number }) {
    const bounds = canvasRef.current?.getBoundingClientRect();
    const pos = position ||
      instance.current?.screenToFlowPosition({
        x: (bounds?.x || 0) + (bounds?.width || 800) / 2 - 100,
        y: (bounds?.y || 0) + (bounds?.height || 600) / 2,
      }) || { x: 300, y: 200 };
    const n = block(kind, "n_" + crypto.randomUUID(), pos.x, pos.y);
    commit({ ...graph, nodes: [...graph.nodes, n] });
    setPalette(false);
    setEditing(n.id);
  }
  function duplicate(n: Block) {
    const copy = structuredClone(n);
    copy.id = "n_" + crypto.randomUUID();
    copy.position = { x: n.position.x + 50, y: n.position.y + 120 };
    copy.data.label += " (cópia)";
    commit({ ...graph, nodes: [...graph.nodes, copy] });
  }
  function remove(id: string) {
    commit({
      nodes: graph.nodes.filter((n) => n.id !== id),
      edges: graph.edges.filter((e) => e.source !== id && e.target !== id),
    });
  }
  function connectNodes(c: Connection) {
    if (c.source === c.target) {
      setError("Conecte blocos diferentes. Use Repetir para criar ciclos.");
      return;
    }
    commit({ ...graph, edges: addEdge(c, graph.edges) });
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
  async function execute() {
    setRunning(true);
    setError("");
    setRun(null);
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      await save();
      const from = new Date().toISOString();
      timer = setInterval(() => {
        void request<Run[]>("/api/runs?flowId=" + id)
          .then((items) => {
            const latest = items.find((r) => r.createdAt >= from);
            if (latest) setRun(latest);
          })
          .catch(() => {});
      }, 800);
      setRun(
        await request<Run>("/api/flows/" + id + "/run", "POST", {
          input: input.trim(),
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
  const visualNodes = graph.nodes.map((n) => {
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
        edit: () => setEditing(n.id),
        duplicate: () => duplicate(n),
        remove: () => remove(n.id),
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
            label="Integrar fluxo"
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
          <ReactFlow
            nodes={visualNodes}
            edges={graph.edges.map((e) => ({
              ...e,
              animated: running && run?.next === e.target,
            }))}
            nodeTypes={nodeTypes}
            onInit={(i) => {
              instance.current = i;
            }}
            onBeforeDelete={async () => { snapshot(graph); return true; }}
            onNodesChange={(changes) => {
              setGraph((g) => ({
                ...g,
                nodes: applyNodeChanges(changes, g.nodes) as Block[],
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
            onNodeDoubleClick={(_, n) => setEditing(n.id)}
            onEdgeClick={(_, e) => setSelectedEdge(e.id)}
            onPaneClick={() => setSelectedEdge(null)}
            fitView
            fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
            minZoom={0.25}
            maxZoom={2}
            snapToGrid={snap}
            snapGrid={[20, 20]}
            deleteKeyCode={
              editing || rename || connect || integration
                ? null
                : ["Backspace", "Delete"]
            }
            nodesDraggable={!running}
            nodesConnectable={!running}
            colorMode="light"
          >
            {dots && <Background gap={20} size={1} color="#c9ccd6" />}
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
                title="Ajustar à grade"
                aria-label="Ajustar à grade"
                className={snap ? "active" : ""}
                onClick={() => setSnap(!snap)}
              >
                <Icon name="grid" size={16} />
              </ControlButton>
              <ControlButton
                title="Mostrar grade"
                aria-label="Mostrar grade"
                className={dots ? "active" : ""}
                onClick={() => setDots(!dots)}
              >
                <Icon name="more" size={16} />
              </ControlButton>
            </Controls>
            <MiniMap
              position="bottom-left"
              pannable
              zoomable
              nodeColor={(n) => NODE_STYLE[(n.data as Block["data"]).kind].soft}
              nodeStrokeColor={(n) =>
                NODE_STYLE[(n.data as Block["data"]).kind].color
              }
              nodeStrokeWidth={2}
            />
          </ReactFlow>
          <div className="canvas-left-actions">
            <button
              className={"add-node-button" + (palette ? " active" : "")}
              title="Adicionar bloco"
              aria-label="Adicionar bloco"
              onClick={() => setPalette(!palette)}
            >
              <Icon name={palette ? "close" : "plus"} size={23} />
            </button>
          </div>
          {palette && (
            <aside className="node-palette">
              <header>
                <h2>Adicionar blocos</h2>
                <IconButton
                  icon="close"
                  label="Fechar biblioteca"
                  onClick={() => setPalette(false)}
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
                  <section key={group}>
                    <h3>{group}</h3>
                    {(Object.keys(BLOCKS) as Kind[])
                      .filter(
                        (k) =>
                          NODE_STYLE[k].group === group &&
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
                            style={{
                              color: NODE_STYLE[k].color,
                              background: NODE_STYLE[k].soft,
                            }}
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
                  </section>
                ))}
              </div>
            </aside>
          )}
          {selectedEdge && (
            <div className="selected-edge-action">
              <span>Conexão selecionada</span>
              <button
                onClick={() => {
                  commit({
                    ...graph,
                    edges: graph.edges.filter((e) => e.id !== selectedEdge),
                  });
                  setSelectedEdge(null);
                }}
              >
                <Icon name="trash" size={15} />
                Excluir conexão
              </button>
            </div>
          )}
          <div className="canvas-help">
            Clique duas vezes em um bloco para editar
          </div>
          {!chat && !history && (
            <button className="chat-launcher" onClick={() => setChat(true)}>
              <Icon name="chat" size={23} />
              <span>Testar</span>
            </button>
          )}
        </div>
        {(chat || history) && (
          <aside className="canvas-test-panel">
            <header>
              <div>
                <Icon name={chat ? "chat" : "runs"} size={20} />
                <h2>{chat ? "Testar Agentflow" : "Execuções do fluxo"}</h2>
              </div>
              <IconButton
                icon="close"
                label="Fechar painel"
                onClick={() => {
                  setChat(false);
                  setHistory(false);
                }}
              />
            </header>
            {history ? (
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
                        setRun(r);
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
            ) : (
              <>
                <div className="chat-scroll">
                  {!run && !running ? (
                    <div className="chat-empty">
                      <div className="chat-empty-icon">
                        <Icon name="agent" size={34} />
                      </div>
                      <h3>Converse com seu fluxo</h3>
                      <p>
                        Envie uma mensagem para testar seus agentes e acompanhar
                        o caminho percorrido.
                      </p>
                      <button
                        onClick={() =>
                          setInput(
                            "Meu pedido está atrasado e preciso de ajuda urgente.",
                          )
                        }
                      >
                        Testar com uma solicitação de exemplo
                      </button>
                    </div>
                  ) : (
                    <>
                      {run && (
                        <>
                          <div className="test-user-message">{run.input}</div>
                          <RunView run={run} onChange={setRun} compact />
                        </>
                      )}
                      {running && (
                        <div className="chat-thinking">
                          <span className="studio-spinner" />
                          Executando as etapas…
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="chat-composer">
                  <label className="demo-toggle">
                    <input
                      type="checkbox"
                      checked={demo}
                      onChange={(e) => setDemo(e.target.checked)}
                    />
                    Simular com respostas de exemplo
                  </label>
                  {!connection?.account && !demo && (
                    <p>
                      Conecte o ChatGPT para executar de verdade.{" "}
                      <button onClick={() => setConnect(true)}>Conectar</button>
                    </p>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (input.trim() && !running) void execute();
                    }}
                  >
                    <textarea
                      aria-label="Mensagem para testar"
                      placeholder="Digite sua mensagem…"
                      rows={3}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (
                            input.trim() &&
                            !running &&
                            (demo || connection?.account)
                          )
                            void execute();
                        }
                      }}
                    />
                    <button
                      type="submit"
                      className="chat-send"
                      title="Enviar mensagem"
                      aria-label="Enviar mensagem"
                      disabled={
                        running ||
                        !input.trim() ||
                        (!demo && !connection?.account)
                      }
                    >
                      <Icon name="play" size={17} />
                    </button>
                  </form>
                  <small>
                    {demo
                      ? "Demonstração · nenhuma ação externa"
                      : "ChatGPT · usa os limites da sua assinatura"}
                  </small>
                </div>
              </>
            )}
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
          models={connection?.models || []}
          onClose={() => setEditing(null)}
          onSave={(n) =>
            commit({
              ...graph,
              nodes: graph.nodes.map((x) => (x.id === n.id ? n : x)),
            })
          }
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
