"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MapCanvas } from "./MapCanvas";
import { Icon, IconButton, Logo, Modal, ErrorBox, request } from "./ui";
import { Connections } from "./Connections";
import { AppVersion } from "./AppVersion";
import { DeleteMapDialog } from "./DeleteMapDialog";
import { demoMap } from "@/lib/demo";
import {
  findNode,
  updateNode,
  countNodes,
  sourceLabels,
  sourceDescription,
  type MindMap,
  type MindNode,
} from "@/lib/types";
import { markdown, svgMap } from "@/lib/layout";

function downloadFile(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function Outline({
  node,
  selected,
  onSelect,
  depth = 0,
}: {
  node: MindNode;
  selected: string | null;
  onSelect: (id: string) => void;
  depth?: number;
}) {
  return (
    <div>
      <button
        className={"outline-item" + (selected === node.id ? " selected" : "")}
        style={{ paddingLeft: 16 + depth * 16 }}
        onClick={() => onSelect(node.id)}
      >
        <span className="outline-dot" />
        {node.label}
      </button>
      {node.children.map((c) => (
        <Outline
          key={c.id}
          node={c}
          selected={selected}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
export function MapEditor({ id }: { id: string }) {
  const router = useRouter();
  const [map, setMap] = useState<MindMap | null>(() =>
    id === "exemplo" ? demoMap() : null,
  );
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<"topic" | "source" | "chat">("topic");
  const [outline, setOutline] = useState(true);
  const [mobileOutline, setMobileOutline] = useState(false);
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [fitKey, setFitKey] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [connections, setConnections] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [question, setQuestion] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [present, setPresent] = useState(false);
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState<MindNode[]>([]);
  const [future, setFuture] = useState<MindNode[]>([]);
  const mapRef = useRef(map);
  const saveFlight = useRef(false);
  const failedSave = useRef<{ root: MindNode; title: string } | null>(null);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    mapRef.current = map;
    dirtyRef.current = dirty;
  }, [map, dirty]);
  useEffect(() => {
    let live = true;
    if (id === "exemplo") return;
    request<MindMap>(`/api/maps/${id}`)
      .then((m) => {
        if (live) setMap(m);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [id]);
  useEffect(() => {
    function before(e: BeforeUnloadEvent) {
      if (dirtyRef.current) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, []);
  const save = useCallback(async () => {
    const current = mapRef.current;
    if (!current || saveFlight.current || !dirtyRef.current) return;
    if (
      failedSave.current?.root === current.root &&
      failedSave.current?.title === current.title
    )
      return;
    if (!current.title.trim() || !current.root.label.trim()) {
      setError("Preencha o título antes de salvar.");
      return;
    }
    if (id === "exemplo") {
      setError("Salve uma cópia para guardar suas alterações.");
      return;
    }
    saveFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await request<MindMap>(`/api/maps/${id}`, "PUT", {
        title: current.title,
        root: current.root,
        revision: current.revision,
      });
      setMap((latest) =>
        latest
          ? {
              ...latest,
              revision: result.revision,
              updatedAt: result.updatedAt,
            }
          : result,
      );
      if (
        mapRef.current?.root === current.root &&
        mapRef.current?.title === current.title
      )
        setDirty(false);
    } catch (e) {
      failedSave.current = { root: current.root, title: current.title };
      setError((e as Error).message);
    } finally {
      saveFlight.current = false;
      setSaving(false);
    }
  }, [id]);
  useEffect(() => {
    if (!dirty || id === "exemplo" || chatBusy || saving) return;
    const timer = setTimeout(() => void save(), 1000);
    return () => clearTimeout(timer);
  }, [map?.root, map?.title, dirty, id, chatBusy, saving, save]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        failedSave.current = null;
        void save();
      }
      if (e.key === "Escape") setPresent(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);
  const toggle = useCallback((nodeId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);
  function edit(root: MindNode) {
    if (!map) return;
    setHistory((h) => [...h.slice(-29), map.root]);
    setFuture([]);
    setMap({ ...map, root });
    setDirty(true);
  }
  function select(nodeId: string) {
    setSelected(nodeId || null);
    if (nodeId) setPanel("topic");
  }
  function focus(nodeId: string) {
    setMobileOutline(false);
    setCollapsed(new Set());
    setSelected(nodeId);
    setFocusId(nodeId);
    setPanel("topic");
  }
  async function copy() {
    if (!map) return;
    setSaving(true);
    setError("");
    try {
      const m = await request<MindMap>(
        "/api/maps",
        "POST",
        id === "exemplo" ? {} : { copy: id },
      );
      await request(`/api/maps/${m.id}`, "PUT", {
        revision: m.revision,
        root: map.root,
        title: map.title,
      });
      setDirty(false);
      router.push(`/maps/${m.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function exportMap(format: string) {
    if (!map) return;
    const name =
      map.title.replace(/[^\p{L}\p{N}\s-]/gu, "").slice(0, 80) || "mapify";
    if (format === "json")
      downloadFile(
        `${name}.json`,
        new Blob([JSON.stringify(map, null, 2)], { type: "application/json" }),
      );
    if (format === "md")
      downloadFile(
        `${name}.md`,
        new Blob(
          [
            markdown(map.root) +
              `\n## Fonte\n${map.source.title}\n${map.source.url || ""}\n${sourceDescription(map.source)}\n`,
          ],
          { type: "text/markdown" },
        ),
      );
    if (format === "svg")
      downloadFile(
        `${name}.svg`,
        new Blob([svgMap(map.root)], { type: "image/svg+xml" }),
      );
    if (format === "png") {
      try {
        const svg = svgMap(map.root);
        const url = URL.createObjectURL(
          new Blob([svg], { type: "image/svg+xml" }),
        );
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          const scale = Math.min(2, 6000 / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = image.width * scale;
          canvas.height = image.height * scale;
          canvas
            .getContext("2d")!
            .drawImage(image, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/png"),
          );
          if (!blob) throw new Error("Não foi possível exportar a imagem.");
          downloadFile(`${name}.png`, blob);
        } finally {
          URL.revokeObjectURL(url);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    }
    setExporting(false);
  }
  const node = map && selected ? findNode(map.root, selected) : null;
  const matched: MindNode[] = [];
  function searchNodes(n: MindNode) {
    if (search && n.label.toLowerCase().includes(search.toLowerCase()))
      matched.push(n);
    n.children.forEach(searchNodes);
  }
  if (map) searchNodes(map.root);
  if (!map)
    return (
      <main className="loading-page">
        <Logo />
        {error ? (
          <>
            <ErrorBox error={error} />
            <Link href="/" className="secondary">
              Voltar à biblioteca
            </Link>
          </>
        ) : (
          <p>Carregando seu mapa…</p>
        )}
      </main>
    );
  return (
    <div className={"editor" + (present ? " presenting" : "")}>
      <header className="editor-header">
        <Link
          href="/"
          className="editor-brand"
          onClick={(e) => {
            if (dirty) {
              e.preventDefault();
              setError(
                "Aguarde o salvamento ou salve uma cópia antes de sair.",
              );
            }
          }}
        >
          <Logo />
          <AppVersion />
        </Link>
        <span className="header-separator" />
        <div className="map-heading">
          <input
            aria-label="Título do mapa"
            value={map.title}
            maxLength={160}
            disabled={chatBusy}
            onChange={(e) => {
              setMap({ ...map, title: e.target.value });
              setDirty(true);
            }}
          />
          <span className="save-status">
            {id === "exemplo"
              ? "Mapa de exemplo · Explore à vontade"
              : saving
                ? "Salvando…"
                : dirty
                  ? "Alterações pendentes"
                  : "Todas as alterações salvas"}
            {!dirty && id !== "exemplo" && <Icon name="check" size={12} />}
          </span>
        </div>
        <div className="editor-actions">
          {map.demo && <span className="demo-pill">Exemplo</span>}
          <IconButton
            icon="star"
            label="Favoritar mapa"
            active={map.favorite}
            disabled={id === "exemplo" || dirty || saving || chatBusy}
            onClick={async () => {
              try {
                setMap(
                  await request(`/api/maps/${id}`, "PUT", {
                    revision: map.revision,
                    favorite: !map.favorite,
                  }),
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
          <button className="secondary" onClick={() => setPresent(!present)}>
            <Icon name="play" size={15} />
            <span>Apresentar</span>
          </button>
          {id === "exemplo" ? (
            <button className="primary" onClick={copy} disabled={saving}>
              Salvar uma cópia
            </button>
          ) : (
            <button className="primary" onClick={() => setExporting(true)}>
              <Icon name="download" size={16} />
              <span>Exportar</span>
            </button>
          )}
          <IconButton
            icon="settings"
            label="Configurações e conexões"
            onClick={() => setConnections(true)}
          />
          {id !== "exemplo" && (
            <button
              className="text-button delete-map-action"
              aria-label="Excluir mapa"
              title="Excluir mapa"
              disabled={chatBusy || saving}
              onClick={() => setConfirmDelete(true)}
            >
              <Icon name="trash" size={17} />
              <span>Excluir</span>
            </button>
          )}
        </div>
      </header>
      <div className="editor-toolbar">
        <div>
          <IconButton
            icon="list"
            label="Mostrar estrutura"
            active={outline}
            onClick={() => {
              if (window.innerWidth <= 960) setMobileOutline(!mobileOutline);
              else setOutline(!outline);
            }}
          />
          <span className="toolbar-divider" />
          <IconButton
            icon="undo"
            label="Desfazer"
            disabled={!history.length || chatBusy}
            onClick={() => {
              const previous = history.at(-1)!;
              setFuture((f) => [map.root, ...f]);
              setHistory((h) => h.slice(0, -1));
              setMap({ ...map, root: previous });
              setDirty(true);
            }}
          />
          <IconButton
            icon="redo"
            label="Refazer"
            disabled={!future.length || chatBusy}
            onClick={() => {
              setHistory((h) => [...h, map.root]);
              setMap({ ...map, root: future[0] });
              setFuture((f) => f.slice(1));
              setDirty(true);
            }}
          />
          <span className="toolbar-divider" />
          <button
            className="text-button"
            onClick={() => {
              setCollapsed(new Set());
              setFitKey((k) => k + 1);
            }}
          >
            <Icon name="expand" size={16} />
            Expandir tudo
          </button>
          <button
            className="text-button"
            onClick={() => {
              setCollapsed(new Set(map.root.children.map((n) => n.id)));
              setFitKey((k) => k + 1);
            }}
          >
            Visão geral
          </button>
        </div>
        <div className="canvas-meta">
          <span className={`source-icon ${map.source.kind}`}>
            <Icon name={map.source.kind} size={16} />
          </span>
          {sourceLabels[map.source.kind]}
          <span>·</span>
          {countNodes(map.root)} tópicos
        </div>
      </div>
      {error && (
        <div className="editor-error">
          <ErrorBox error={error} />
          <IconButton
            icon="close"
            label="Fechar aviso"
            onClick={() => setError("")}
          />
          {error.includes("outra aba") && (
            <button
              className="secondary"
              onClick={() => window.location.reload()}
            >
              Recarregar
            </button>
          )}
        </div>
      )}
      <div className="editor-body">
        {(outline || mobileOutline) && !present && (
          <aside
            className={"outline-panel" + (mobileOutline ? " mobile-open" : "")}
          >
            <div className="panel-heading">
              <h3>Estrutura do mapa</h3>
              <span>{countNodes(map.root)}</span>
            </div>
            <label className="search-field">
              <Icon name="search" size={15} />
              <input
                aria-label="Buscar tópico"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Encontrar uma ideia…"
              />
            </label>
            <div className="outline-scroll">
              {search ? (
                matched.length ? (
                  matched.map((n) => (
                    <button
                      key={n.id}
                      className="outline-item"
                      onClick={() => focus(n.id)}
                    >
                      {n.label}
                    </button>
                  ))
                ) : (
                  <p className="muted">Nenhum tópico encontrado.</p>
                )
              ) : (
                <Outline node={map.root} selected={selected} onSelect={focus} />
              )}
            </div>
            <div className="outline-footer">
              <button className="text-button" disabled={saving} onClick={copy}>
                <Icon name="copy" size={16} />
                Duplicar mapa
              </button>
            </div>
          </aside>
        )}
        <main className="canvas-area">
          <MapCanvas
            sourceUrl={map.source.url}
            root={map.root}
            collapsed={collapsed}
            onToggle={toggle}
            onSelect={select}
            selected={selected}
            fitKey={fitKey}
            focusId={focusId}
          />
          <div className="canvas-label">
            <Icon name="map" size={14} />
            Mapa mental<span>Arraste para navegar · Role para aproximar</span>
          </div>
          <div className="canvas-bottom">
            <button className="canvas-chat" onClick={() => setPanel("chat")}>
              <span>
                <Icon name="spark" size={20} />
              </span>
              <span>Pergunte, explore, conecte novas ideias…</span>
              <Icon name="chat" size={18} />
            </button>
            <button
              className="fit-button"
              title="Enquadrar mapa"
              aria-label="Enquadrar mapa"
              onClick={() => {
                setFocusId(null);
                setFitKey((k) => k + 1);
              }}
            >
              <Icon name="expand" />
            </button>
          </div>
          {present && (
            <button
              className="exit-present secondary"
              onClick={() => setPresent(false)}
            >
              Sair da apresentação · Esc
            </button>
          )}
        </main>
        {!present && (
          <aside className="details-panel">
            <div className="detail-tabs">
              {[
                { id: "topic", label: "Tópico", icon: "map" },
                { id: "source", label: "Fonte", icon: "book" },
                { id: "chat", label: "Conversa", icon: "spark" },
              ].map((t) => (
                <button
                  key={t.id}
                  className={panel === t.id ? "active" : ""}
                  onClick={() => setPanel(t.id as typeof panel)}
                >
                  <Icon name={t.icon} size={16} />
                  {t.label}
                </button>
              ))}
            </div>
            {panel === "topic" ? (
              node ? (
                <div className="detail-content" key={node.id}>
                  <span className="eyebrow">Ideia em foco</span>
                  <label>
                    Título
                    <textarea
                      aria-label="Título"
                      rows={3}
                      value={node.label}
                      maxLength={160}
                      disabled={chatBusy}
                      onChange={(e) =>
                        edit(
                          updateNode(map.root, node.id, (n) => ({
                            ...n,
                            label: e.target.value,
                          })),
                        )
                      }
                    />
                  </label>
                  <label>
                    Notas
                    <textarea
                      aria-label="Notas"
                      rows={6}
                      value={node.note}
                      maxLength={2400}
                      disabled={chatBusy}
                      onChange={(e) =>
                        edit(
                          updateNode(map.root, node.id, (n) => ({
                            ...n,
                            note: e.target.value,
                          })),
                        )
                      }
                    />
                  </label>
                  <div className="topic-actions">
                    <button
                      className="secondary"
                      disabled={chatBusy || countNodes(map.root) >= 180}
                      onClick={() => {
                        const child: MindNode = {
                          id: crypto.randomUUID(),
                          label: "Nova ideia",
                          note: "",
                          refs: [],
                          children: [],
                        };
                        edit(
                          updateNode(map.root, node.id, (n) => ({
                            ...n,
                            children: [...n.children, child],
                          })),
                        );
                        setCollapsed((c) => {
                          const next = new Set(c);
                          next.delete(node.id);
                          return next;
                        });
                        setSelected(child.id);
                      }}
                    >
                      <Icon name="plus" size={16} />
                      Adicionar subtema
                    </button>
                    {node.id !== map.root.id && (
                      <IconButton
                        icon="trash"
                        label="Excluir tópico e seus subtemas"
                        disabled={chatBusy}
                        onClick={() => {
                          function remove(n: MindNode): MindNode {
                            return {
                              ...n,
                              children: n.children
                                .filter((c) => c.id !== selected)
                                .map(remove),
                            };
                          }
                          edit(remove(map.root));
                          setSelected(null);
                        }}
                      />
                    )}
                  </div>
                  <h4>Na fonte original</h4>
                  {node.refs.length ? (
                    node.refs.map((ref) => {
                      const s = map.source.segments.find((s) => s.id === ref);
                      return s ? (
                        <button
                          key={ref}
                          className="reference-card"
                          onClick={() => {
                            setPanel("source");
                            setTimeout(
                              () =>
                                document
                                  .getElementById(`source-${ref}`)
                                  ?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "center",
                                  }),
                              50,
                            );
                          }}
                        >
                          <Icon name="book" size={15} />
                          <span>
                            {s.label}
                            <small>{s.text.slice(0, 140)}…</small>
                          </span>
                          <Icon name="chevron" size={13} />
                        </button>
                      ) : null;
                    })
                  ) : (
                    <p className="muted small">
                      Este tópico não tem um trecho associado.
                    </p>
                  )}
                </div>
              ) : (
                <div className="detail-content map-overview">
                  <span className="overview-icon">
                    <Icon name="spark" size={25} />
                  </span>
                  <h2>
                    Uma visão do todo.
                    <br />
                    Um mundo de conexões.
                  </h2>
                  <p>{map.summary}</p>
                  <div className="overview-stats">
                    <div>
                      <strong>{map.root.children.length}</strong>
                      <span>ideias principais</span>
                    </div>
                    <div>
                      <strong>{countNodes(map.root)}</strong>
                      <span>tópicos conectados</span>
                    </div>
                  </div>
                  <div className="hint">
                    <Icon name="info" size={17} />
                    <p>
                      Selecione um tópico para editar, adicionar ideias e
                      encontrar o trecho na fonte original.
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => setPanel("source")}
                  >
                    <Icon name="book" size={16} />
                    Explorar a fonte
                  </button>
                  {id === "exemplo" && (
                    <button
                      className="text-button"
                      onClick={() => setExporting(true)}
                    >
                      Exportar este exemplo
                    </button>
                  )}
                </div>
              )
            ) : panel === "source" ? (
              <div className="detail-content source-content">
                <span className={`source-tile ${map.source.kind}`}>
                  <Icon name={map.source.kind} />
                </span>
                <h3>{map.source.title}</h3>
                {sourceDescription(map.source) && (
                  <p className="source-analysis-note">
                    {sourceDescription(map.source)}
                  </p>
                )}
                {map.source.url && (
                  <a
                    className="text-link"
                    href={map.source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir fonte original
                  </a>
                )}
                <p className="muted small">
                  {map.source.segments.length} trechos ·{" "}
                  {map.source.characters.toLocaleString("pt-BR")} caracteres
                </p>
                {map.source.segments.map((s) => (
                  <article key={s.id} id={`source-${s.id}`}>
                    <header>
                      <strong>{s.label}</strong>
                      {map.source.url &&
                        (s.seconds !== undefined || s.page !== undefined) && (
                          <a
                            href={
                              s.seconds !== undefined
                                ? `${map.source.url}&t=${s.seconds}`
                                : `${map.source.url}#page=${s.page}`
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Icon name="play" size={13} />
                            {s.seconds !== undefined ? "Assistir" : "Abrir"}
                          </a>
                        )}
                    </header>
                    <p>{s.text}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="chat-panel">
                <div className="chat-messages">
                  {!map.messages.length && (
                    <div className="chat-welcome">
                      <Icon name="spark" size={27} />
                      <h3>Continue a descoberta</h3>
                      <p>
                        {map.demo
                          ? "Este é um exemplo interativo. Gere um mapa com sua fonte para conversar com a IA."
                          : "Pergunte sobre a fonte, conecte conceitos ou descubra aplicações práticas."}
                      </p>
                      {!map.demo &&
                        [
                          "Quais são as ideias mais importantes?",
                          "Como posso aplicar isso na prática?",
                          "Que relações existem entre os temas?",
                        ].map((q) => (
                          <button key={q} onClick={() => setQuestion(q)}>
                            {q}
                            <Icon name="plus" size={13} />
                          </button>
                        ))}
                    </div>
                  )}
                  {map.messages.map((m, i) => (
                    <div key={i} className={`chat-message ${m.role}`}>
                      <strong>{m.role === "user" ? "Você" : "Mapia"}</strong>
                      <p>{m.text}</p>
                    </div>
                  ))}
                  {chatBusy && (
                    <p className="muted">
                      <span className="spinner" />
                      Conectando as ideias…
                    </p>
                  )}
                </div>
                <form
                  className="chat-input"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!question.trim() || dirty || saving) return;
                    setChatBusy(true);
                    setError("");
                    try {
                      setMap(
                        await request(`/api/maps/${id}/chat`, "POST", {
                          question,
                        }),
                      );
                      setQuestion("");
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setChatBusy(false);
                    }
                  }}
                >
                  <textarea
                    aria-label="Pergunta sobre o mapa"
                    placeholder="O que você quer entender?"
                    value={question}
                    maxLength={2000}
                    onChange={(e) => setQuestion(e.target.value)}
                    disabled={map.demo || chatBusy}
                  />
                  <button
                    type="submit"
                    aria-label="Enviar pergunta"
                    disabled={
                      map.demo ||
                      chatBusy ||
                      dirty ||
                      saving ||
                      !question.trim()
                    }
                  >
                    <Icon name="send" size={17} />
                  </button>
                  <small>Respostas com base no conteúdo da fonte.</small>
                </form>
              </div>
            )}
          </aside>
        )}
      </div>
      {exporting && (
        <Modal
          title="Leve suas ideias com você"
          onClose={() => setExporting(false)}
        >
          <p className="muted">
            O mapa completo será exportado, incluindo os ramos recolhidos.
          </p>
          <div className="export-options">
            {[
              {
                id: "png",
                name: "Imagem PNG",
                desc: "Pronta para apresentações e compartilhamento.",
              },
              {
                id: "svg",
                name: "Imagem SVG",
                desc: "Qualidade vetorial, em qualquer tamanho.",
              },
              {
                id: "md",
                name: "Texto Markdown",
                desc: "Uma estrutura para suas notas e documentos.",
              },
              {
                id: "json",
                name: "Arquivo JSON",
                desc: "Mapa completo com fonte e referências.",
              },
            ].map((f) => (
              <button key={f.id} onClick={() => void exportMap(f.id)}>
                <Icon name="download" />
                <span>
                  <strong>{f.name}</strong>
                  <small>{f.desc}</small>
                </span>
                <Icon name="chevron" size={16} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {confirmDelete && (
        <DeleteMapDialog
          map={map}
          onClose={() => setConfirmDelete(false)}
          onDeleted={() => {
            dirtyRef.current = false;
            setDirty(false);
            router.replace("/");
          }}
        />
      )}
      {connections && (
        <Connections onClose={() => setConnections(false)} onSaved={() => {}} />
      )}
    </div>
  );
}
