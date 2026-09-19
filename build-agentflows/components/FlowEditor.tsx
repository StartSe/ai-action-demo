"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeProps,
  type Node,
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
import { Topbar, useStatus } from "./ui";
import { IntegrationCode } from "./IntegrationCode";
import { RunView } from "./RunView";
export async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}
function FlowBlock({ data, selected }: NodeProps<Node<Block["data"]>>) {
  const item = BLOCKS[data.kind];
  const branches =
    data.kind === "condition" || data.kind === "approval"
      ? ["yes", "no"]
      : data.kind === "loop"
        ? ["repeat", "done"]
        : [];
  return (
    <div className={`flow-block ${selected ? "selected" : ""}`}>
      {data.kind !== "start" && (
        <Handle type="target" position={Position.Left} />
      )}
      <div className="block-type">
        <span className="block-icon">{item.icon}</span>
        {item.label}
      </div>
      <strong>{data.label}</strong>
      <small>{data.config.prompt || data.config.text || item.help}</small>
      {data.kind !== "end" &&
        (branches.length ? (
          branches.map((h, i) => (
            <div key={h}>
              <span className={`port-label port-${i}`}>
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
                style={{ top: i ? "78%" : "48%" }}
              />
            </div>
          ))
        ) : (
          <Handle type="source" position={Position.Right} />
        ))}
    </div>
  );
}
const nodeTypes = { block: FlowBlock };
const names: Record<string, string> = {
  system: "Instruções do agente",
  prompt: "Entrada",
  model: "Modelo (opcional)",
  tools: "Ferramentas autorizadas",
  state: "Estado inicial",
  value: "Valor",
  operator: "Comparação",
  compare: "Comparar com",
  key: "Nome da variável",
  url: "Endereço do serviço",
  method: "Método",
  body: "Conteúdo enviado",
  credential: "Nome da credencial (opcional)",
  tool: "Nome da ferramenta",
  args: "Argumentos",
  limit: "Número de passagens",
  text: "Resposta final",
};
const fields: Record<Kind, string[]> = {
  start: ["state"],
  llm: ["system", "prompt", "model"],
  agent: ["system", "prompt", "model", "tools"],
  condition: ["value", "operator", "compare"],
  state: ["key", "value"],
  http: ["url", "method", "body", "credential"],
  tool: ["tool", "args"],
  approval: ["prompt"],
  loop: ["limit"],
  end: ["text"],
};
export function FlowEditor() {
  const {status,erro}=useStatus();
  const [flows, setFlows] = useState<Flow[]>([]),
    [flow, setFlow] = useState<Flow | null>(null),
    [graph, setGraph] = useState<Graph>({ nodes: [], edges: [] }),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [panel, setPanel] = useState<"blocks" | "test" | "integration">("blocks"),
    [input, setInput] = useState(
      "Meu pedido está atrasado e preciso de ajuda urgente.",
    ),
    [run, setRun] = useState<Run | null>(null),
    [demo, setDemo] = useState(true),
    [toolNames, setToolNames] = useState<string[]>([]);
  const file = useRef<HTMLInputElement>(null),
    started = useRef(false);
  const choose = useCallback((f: Flow) => {
    setFlow(f);
    setGraph(f.graph);
    setSelected(null);
    setDirty(false);
    setRun(null);
    setNotice("");
  }, []);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    request<Flow[]>("/api/flows")
      .then(async (list) => {
        setFlows(list);
        const query = new URLSearchParams(location.search);
        const id = query.get("flow");
        let f = list.find((f) => f.id === id) || list[0];
        if (query.has("exemplo") && !f) {
          f = await request<Flow>("/api/flows", "POST", {
            name: "Triagem de atendimento",
            example: true,
          });
          setFlows([f]);
        }
        if (f) choose(f);
      })
      .catch((e) => setError(e.message));
  }, [choose]);
  useEffect(() => {
    if (!busy || !flow) return;
    const t = setInterval(() => {
      request<Run[]>("/api/runs?flowId=" + flow.id)
        .then((r) => {
          if (r[0]) setRun(r[0]);
        })
        .catch(() => {});
    }, 1200);
    return () => clearInterval(t);
  }, [busy, flow]);
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);
  const act = async (fn: () => Promise<void>) => {
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
  };
  const sync = (f: Flow) => {
    setFlow(f);
    setFlows((prev) => [f, ...prev.filter((x) => x.id !== f.id)]);
    setDirty(false);
  };
  async function save() {
    if (!flow) throw new Error("Crie um fluxo primeiro.");
    const f = await request<Flow>("/api/flows/" + flow.id, "PUT", {
      name: flow.name,
      description: flow.description,
      graph,
    });
    sync(f);
    return f;
  }
  const updateGraph = (g: Graph) => {
    setGraph(g);
    setDirty(true);
  };
  const onConnect = useCallback((c: Connection) => {
    setGraph((g) => ({ ...g, edges: addEdge(c, g.edges) }));
    setDirty(true);
  }, []);
  const node = graph.nodes.find((n) => n.id === selected);
  function patchNode(key: string, value: string) {
    if (!node) return;
    updateGraph({
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === node.id
          ? {
              ...n,
              data:
                key === "label"
                  ? { ...n.data, label: value }
                  : { ...n.data, config: { ...n.data.config, [key]: value } },
            }
          : n,
      ),
    });
  }
  function add(kind: Kind) {
    const id = "n_" + crypto.randomUUID();
    updateGraph({
      ...graph,
      nodes: [
        ...graph.nodes,
        block(
          kind,
          id,
          100 + (graph.nodes.length % 3) * 290,
          100 + Math.floor(graph.nodes.length / 3) * 200,
        ),
      ],
    });
    setSelected(id);
  }
  async function create(example = false) {
    if (dirty && !window.confirm("Descartar as alterações não salvas?")) return;
    await act(async () => {
      const f = await request<Flow>("/api/flows", "POST", {
        name: example ? "Triagem de atendimento" : "Novo fluxo",
        example,
      });
      setFlows((prev) => [f, ...prev]);
      choose(f);
    });
  }
  function exportGraph() {
    if (!flow) return;
    const blob = new Blob(
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
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = flow.name.replace(/[^a-z0-9_-]/gi, "_") + ".json";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importGraph(f: File) {
    if (dirty && !window.confirm("Descartar as alterações não salvas?")) return;
    await act(async () => {
      if (f.size > 300000) throw new Error("Use um arquivo de até 300 KB.");
      const b = JSON.parse(await f.text());
      if (b.format !== "build-agentflows/v1")
        throw new Error("Use um arquivo exportado pelo Build Agentflows.");
      const created = await request<Flow>("/api/flows", "POST", {
        name: b.name,
      });
      try {
        const saved = await request<Flow>("/api/flows/" + created.id, "PUT", {
          name: b.name,
          description: b.description || "",
          graph: b.graph,
        });
        setFlows((prev) => [saved, ...prev]);
        choose(saved);
      } catch (e) {
        await request("/api/flows/" + created.id, "DELETE");
        throw e;
      }
    });
  }
  return (
    <>
      <Topbar
        marca="B"
        nome="Build Agentflows"
        area="Operações"
        status={status} erro={erro}
      />
      <main className="flows-main">
        <div className="flows-heading">
          <div>
            <p className="eyebrow">Seu time de agentes</p>
            <h1>Transforme tarefas em fluxos inteligentes</h1>
            <p>Conecte agentes, defina decisões e acompanhe cada execução.</p>
          </div>
          <div className="toolbar">
            <button
              className="btn-ghost"
              disabled={busy}
              onClick={() => file.current?.click()}
            >
              Importar fluxo
            </button>
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => create()}
            >
              Novo fluxo
            </button>
          </div>
        </div>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importGraph(f);
            e.target.value = "";
          }}
        />
        {error && (
          <div className="flow-error" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Fechar erro">
              ×
            </button>
          </div>
        )}
        {notice && (
          <p role="status" className="flow-notice">
            {notice}
          </p>
        )}
        {!flow ? (
          <section className="flow-welcome card">
            <span className="welcome-symbol">◈</span>
            <h2>Uma tarefa. Vários agentes trabalhando juntos.</h2>
            <p>
              Monte seu primeiro fluxo ou explore um exemplo de atendimento.
            </p>
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => create(true)}
            >
              Preencher com um exemplo
            </button>
            <div className="welcome-steps">
              <span>Desenhe o caminho</span>
              <span>Teste cada etapa</span>
              <span>Conecte aos seus sistemas</span>
            </div>
          </section>
        ) : (
          <>
            <div className="flow-toolbar">
              <label className="flow-picker">
                Fluxo
                <select
                  aria-label="Escolher fluxo"
                  value={flow.id}
                  disabled={busy}
                  onChange={(e) => {
                    if (
                      !dirty ||
                      window.confirm("Descartar as alterações não salvas?")
                    )
                      choose(flows.find((f) => f.id === e.target.value)!);
                  }}
                >
                  {flows.map((f) => (
                    <option value={f.id} key={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <span className="flow-badge">
                {flow.published ? "Publicado · v" + flow.version : "Rascunho"}
              </span>
              <span className="save-status">
                {dirty ? "Alterações não salvas" : "Salvo"}
              </span>
              <div className="toolbar">
                <button
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await save();
                      setNotice("Fluxo salvo.");
                    })
                  }
                >
                  Salvar
                </button>
                <button
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await save();
                      sync(
                        await request<Flow>(
                          "/api/flows/" + flow.id + "/publish",
                          "POST",
                          {},
                        ),
                      );
                      setNotice(
                        "Versão publicada. As integrações já podem executá-la.",
                      );
                    })
                  }
                >
                  Publicar
                </button>
                <button
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => {
                    setPanel("test");
                    setSelected(null);
                  }}
                >
                  Testar fluxo
                </button>
              </div>
            </div>
            <div className="flow-workspace">
              <aside className="flow-sidebar">
                <div className="flow-tabs">
                  <button
                    className={panel === "blocks" ? "active" : ""}
                    onClick={() => setPanel("blocks")}
                  >
                    Blocos
                  </button>
                  <button
                    className={panel === "test" ? "active" : ""}
                    onClick={() => setPanel("test")}
                  >
                    Teste
                  </button>
                  <button
                    className={panel === "integration" ? "active" : ""}
                    onClick={() => setPanel("integration")}
                  >
                    Integrar
                  </button>
                </div>
                {panel === "blocks" ? (
                  <>
                    <h2>Adicionar bloco</h2>
                    <p>Escolha uma etapa e conecte suas saídas.</p>
                    <div className="block-library">
                      {(Object.keys(BLOCKS) as Kind[]).map((k) => (
                        <button key={k} disabled={busy} onClick={() => add(k)}>
                          <span className="block-icon">{BLOCKS[k].icon}</span>
                          <span>
                            <strong>{BLOCKS[k].label}</strong>
                            <small>{BLOCKS[k].help}</small>
                          </span>
                          <span>+</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : panel === "test" ? (
                  <>
                    <h2>Teste seu fluxo</h2>
                    <label>
                      Entrada
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        rows={5}
                      />
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={demo}
                        onChange={(e) => setDemo(e.target.checked)}
                      />{" "}
                      Simular sem ações externas
                    </label>
                    <p>Sem IA conectada, a execução será demonstrativa.</p>
                    <button
                      className="btn-primary"
                      disabled={busy}
                      onClick={() =>
                        act(async () => {
                          await save();
                          setRun(null);
                          setRun(
                            await request<Run>(
                              "/api/flows/" + flow.id + "/run",
                              "POST",
                              { input, demo },
                            ),
                          );
                        })
                      }
                    >
                      {busy ? "Executando…" : "Executar teste"}
                    </button>
                    <Link className="btn-link" href="/historico">
                      Ver todas as execuções
                    </Link>
                  </>
                ) : (
                  <>
                    <h2>Conecte seu fluxo</h2>
                    <p>
                      Publique uma versão e gere um código de acesso em
                      Configurações.
                    </p>
                    <Link className="btn-link" href="/setup">
                      Configurar acesso
                    </Link>
                    <details>
                      <summary>Dados para a equipe técnica</summary>
                      <p>POST com Authorization: Bearer e corpo:</p>
                      <IntegrationCode id={flow.id} />
                      <p>
                        No MCP, use executar_fluxo com id e input. O código
                        também dá acesso aos demais fluxos desta instalação.
                      </p>
                    </details>
                    <button className="btn-ghost" onClick={exportGraph}>
                      Exportar fluxo
                    </button>
                    {flow.published && (
                      <button
                        className="btn-ghost"
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            sync(
                              await request<Flow>(
                                "/api/flows/" + flow.id + "/publish",
                                "POST",
                                { active: false },
                              ),
                            );
                            setNotice("Publicação desativada.");
                          })
                        }
                      >
                        Desativar publicação
                      </button>
                    )}
                  </>
                )}
              </aside>
              <div className="flow-canvas" aria-label="Editor visual do fluxo">
                <ReactFlow
                  nodes={graph.nodes}
                  edges={graph.edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={(changes) => {
                    setGraph((g) => ({
                      ...g,
                      nodes: applyNodeChanges(changes, g.nodes) as Block[],
                    }));
                    if (
                      changes.some(
                        (c) => c.type !== "select" && c.type !== "dimensions",
                      )
                    )
                      setDirty(true);
                  }}
                  onEdgesChange={(changes) => {
                    setGraph((g) => ({
                      ...g,
                      edges: applyEdgeChanges(changes, g.edges),
                    }));
                    setDirty(true);
                  }}
                  onConnect={onConnect}
                  onNodeClick={(_, n) => setSelected(n.id)}
                  onPaneClick={() => setSelected(null)}
                  fitView
                  minZoom={0.2}
                  maxZoom={1.5}
                  deleteKeyCode={["Backspace", "Delete"]}
                  nodesDraggable={!busy}
                  nodesConnectable={!busy}
                  elementsSelectable={!busy}
                >
                  <Background gap={22} size={1} />
                  <Controls />
                  <MiniMap pannable zoomable />
                </ReactFlow>
                <div className="canvas-hint">
                  Conecte os pontos entre blocos · selecione para editar
                </div>
              </div>
              <aside className="flow-inspector">
                {node ? (
                  <>
                    <div className="inspector-heading">
                      <h2>{BLOCKS[node.data.kind].label}</h2>
                      <button
                        aria-label="Fechar bloco"
                        onClick={() => setSelected(null)}
                      >
                        ×
                      </button>
                    </div>
                    <label>
                      Nome do bloco
                      <input
                        value={node.data.label}
                        maxLength={100}
                        onChange={(e) => patchNode("label", e.target.value)}
                      />
                    </label>
                    <p>{BLOCKS[node.data.kind].help}</p>
                    {fields[node.data.kind].map((key) => (
                      <label key={key}>
                        {names[key]}
                        {key === "operator" || key === "method" ? (
                          <select
                            value={node.data.config[key] || ""}
                            onChange={(e) => patchNode(key, e.target.value)}
                          >
                            {(key === "operator"
                              ? [
                                  ["contains", "Contém"],
                                  ["equals", "É igual a"],
                                  ["notEquals", "É diferente de"],
                                  ["greater", "É maior que"],
                                  ["empty", "Está vazio"],
                                ]
                              : ["GET", "POST", "PUT", "PATCH", "DELETE"].map(
                                  (v) => [v, v],
                                )
                            ).map(([v, l]) => (
                              <option value={v} key={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                        ) : [
                            "system",
                            "prompt",
                            "state",
                            "body",
                            "args",
                            "text",
                          ].includes(key) ? (
                          <textarea
                            rows={4}
                            value={node.data.config[key] || ""}
                            onChange={(e) => patchNode(key, e.target.value)}
                          />
                        ) : (
                          <input
                            value={node.data.config[key] || ""}
                            onChange={(e) => patchNode(key, e.target.value)}
                          />
                        )}
                      </label>
                    ))}
                    <details>
                      <summary>Referências a outras etapas</summary>
                      <p>
                        <code>{"{{input}}"}</code> entrada original
                        <br />
                        <code>{"{{last}}"}</code> última saída
                        <br />
                        <code>{"{{state.nome}}"}</code> variável
                        <br />
                        <code>{"{{nodes." + node.id + "}}"}</code> saída deste
                        bloco nas próximas etapas
                      </p>
                    </details>
                    {["agent", "tool"].includes(node.data.kind) && (
                      <>
                        <button
                          className="btn-ghost"
                          onClick={() =>
                            act(async () => {
                              const ts =
                                await request<{ name: string }[]>("/api/tools");
                              setToolNames(ts.map((t) => t.name));
                            })
                          }
                        >
                          Consultar ferramentas
                        </button>
                        {toolNames.length > 0 && <p>{toolNames.join(", ")}</p>}
                        <p>
                          Separe os nomes autorizados por vírgula. Use uma
                          aprovação antes de ações que precisam de revisão.
                        </p>
                      </>
                    )}
                    <button
                      className="delete-button"
                      disabled={busy}
                      onClick={() => {
                        updateGraph({
                          nodes: graph.nodes.filter((n) => n.id !== node.id),
                          edges: graph.edges.filter(
                            (e) => e.source !== node.id && e.target !== node.id,
                          ),
                        });
                        setSelected(null);
                      }}
                    >
                      Excluir bloco
                    </button>
                  </>
                ) : (
                  <>
                    <h2>Sobre o fluxo</h2>
                    <label>
                      Nome
                      <input
                        value={flow.name}
                        maxLength={100}
                        onChange={(e) => {
                          setFlow({ ...flow, name: e.target.value });
                          setDirty(true);
                        }}
                      />
                    </label>
                    <label>
                      Descrição
                      <textarea
                        value={flow.description}
                        maxLength={1000}
                        rows={4}
                        onChange={(e) => {
                          setFlow({ ...flow, description: e.target.value });
                          setDirty(true);
                        }}
                      />
                    </label>
                    <div className="flow-facts">
                      <strong>{graph.nodes.length} blocos</strong>
                      <span>{graph.edges.length} conexões</span>
                    </div>
                    <p>
                      Selecione um bloco no quadro para configurar suas
                      instruções.
                    </p>
                    <p>
                      Alterações ficam no rascunho até você publicar uma nova
                      versão.
                    </p>
                    <button className="btn-ghost" onClick={exportGraph}>
                      Exportar fluxo
                    </button>
                    <button
                      className="delete-button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Excluir este fluxo? O histórico de execuções será mantido.",
                          )
                        )
                          void act(async () => {
                            await request("/api/flows/" + flow.id, "DELETE");
                            const rest = flows.filter((f) => f.id !== flow.id);
                            setFlows(rest);
                            setFlow(null);
                            if (rest[0]) choose(rest[0]);
                          });
                      }}
                    >
                      Excluir fluxo
                    </button>
                  </>
                )}
              </aside>
            </div>
            {run && <RunView run={run} onChange={setRun} />}
          </>
        )}
      </main>
    </>
  );
}
