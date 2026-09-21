"use client";
import { useState } from "react";
import type { BrainState, Note } from "@/lib/types";
import { sourcePreview } from "@/lib/source-preview";
import { RemoveItems } from "./RemoveItems";
import { Icon } from "./Icons";
export function Inbox({
  notes,
  captures = {},
  open,
  manual,
  collect,
  refresh,
}: {
  notes: Note[];
  captures?: BrainState["sourceCaptures"];
  open: (n: Note) => void;
  manual: () => void;
  collect: () => void;
  refresh: () => Promise<void>;
}) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<string[]>([]);
  const [removal, setRemoval] = useState<{ sourceIds: string[] } | null>(null);
  const rows = notes
    .filter((n) => n.kind === "raw")
    .map((n) => ({ n, preview: sourcePreview(n), capture: captures[n.id] }));
  const found = rows.filter(
    ({ n, preview, capture }) =>
      (filter === "all" ||
        (filter === "pending" && n.status === "inbox") ||
        (filter === "organized" && n.status === "organized") ||
        (filter === "failed" && capture?.status === "failed")) &&
      `${preview.title} ${preview.text} ${capture?.instruction || ""}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(found.length / 15));
  const current = Math.min(page, pages);
  const visible = found.slice((current - 1) * 15, current * 15);
  const removable = (n: Note) =>
    n.status === "inbox" && captures[n.id]?.status !== "done";
  const selected = selection.filter((id) =>
    rows.some(({ n }) => n.id === id && removable(n)),
  );
  const visibleIds = visible
    .filter(({ n }) => removable(n))
    .map(({ n }) => n.id);
  return (
    <section className="inbox-page">
      <div className="page-heading row-heading">
        <div>
          <span className="eyebrow">SUAS FONTES, EM UM SÓ LUGAR</span>
          <h1>Caixa de entrada</h1>
          <p>
            Leia o que chegou, organize na wiki ou remova o que não precisa
            guardar.
          </p>
        </div>
        <button className="button primary" onClick={manual}>
          <Icon name="plus" size={16} />
          Inserir texto
        </button>
      </div>
      <div className="inbox-toolbar">
        <label className="inbox-search">
          <span className="sr-only">Buscar nas fontes</span>
          <input
            placeholder="Buscar nas fontes…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          <span className="sr-only">Filtrar fontes</span>
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todas as fontes</option>
            <option value="pending">A organizar</option>
            <option value="failed">Coletas com falha</option>
            <option value="organized">Na wiki</option>
          </select>
        </label>
        <span className="muted">{found.length} fontes</span>
        <button className="text-button" onClick={collect}>
          Coletar de um aplicativo <Icon name="arrow" size={14} />
        </button>
      </div>
      {selected.length > 0 && (
        <div className="selection-bar" role="status">
          <span>{selected.length} selecionada(s)</span>
          <button
            className="text-button danger-text"
            onClick={() => setRemoval({ sourceIds: selected })}
          >
            Excluir selecionadas
          </button>
          <button className="text-button" onClick={() => setSelection([])}>
            Limpar seleção
          </button>
        </div>
      )}
      {visible.length ? (
        <div
          className="table-scroll"
          tabIndex={0}
          aria-label="Fontes da caixa de entrada"
        >
          <table className="source-table inbox-table">
            <thead>
              <tr>
                <th scope="col" className="check-cell">
                  <input
                    type="checkbox"
                    aria-label="Selecionar fontes pendentes desta página"
                    disabled={!visibleIds.length}
                    checked={
                      !!visibleIds.length &&
                      visibleIds.every((id) => selected.includes(id))
                    }
                    onChange={(e) =>
                      setSelection(
                        e.target.checked
                          ? [...new Set([...selected, ...visibleIds])]
                          : selected.filter((id) => !visibleIds.includes(id)),
                      )
                    }
                  />
                </th>
                <th scope="col">Conteúdo</th>
                <th scope="col">Origem</th>
                <th scope="col">Situação</th>
                <th scope="col">Recebido</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ n, preview, capture }) => (
                <tr key={n.id}>
                  <td className="check-cell">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${preview.title}`}
                      disabled={!removable(n)}
                      checked={selected.includes(n.id)}
                      onChange={(e) =>
                        setSelection(
                          e.target.checked
                            ? [...selected, n.id]
                            : selected.filter((id) => id !== n.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button className="source-open" onClick={() => open(n)}>
                      <strong>{preview.title}</strong>
                      <span>
                        {preview.text.replace(/\s+/g, " ").slice(0, 220)}
                      </span>
                    </button>
                    {capture && (
                      <small
                        className="source-instruction"
                        title={capture.instruction}
                      >
                        {capture.instruction}
                      </small>
                    )}
                  </td>
                  <td>{preview.origin}</td>
                  <td>
                    <span
                      className={
                        n.status === "organized"
                          ? "ready-tag"
                          : capture?.status === "failed"
                            ? "danger-text"
                            : "pending-tag"
                      }
                    >
                      {n.status === "organized"
                        ? "Na wiki"
                        : capture?.status === "failed"
                          ? "Coleta com falha"
                          : ["queued", "running"].includes(
                                capture?.status || "",
                              )
                            ? "Em processamento"
                            : "A organizar"}
                    </span>
                  </td>
                  <td>
                    <time dateTime={n.created}>
                      {new Date(n.created).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </time>
                  </td>
                  <td>
                    {removable(n) && (
                      <button
                        className="icon-button danger-text"
                        aria-label={`Excluir ${preview.title}`}
                        onClick={() => setRemoval({ sourceIds: [n.id] })}
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <Icon name="inbox" size={32} />
          <h2>
            {rows.length
              ? "Nenhuma fonte neste filtro."
              : "Comece com algo que vale guardar."}
          </h2>
          <p>
            {rows.length
              ? "Tente outra busca ou situação."
              : "Cole uma nota ou uma conversa. Depois, Daily ajuda a organizar na wiki."}
          </p>
          <button
            className="button"
            onClick={
              rows.length
                ? () => {
                    setQuery("");
                    setFilter("all");
                  }
                : manual
            }
          >
            {rows.length ? "Limpar filtros" : "Inserir meu primeiro texto"}
          </button>
        </div>
      )}
      {found.length > 15 && (
        <nav className="inbox-pagination" aria-label="Paginação das fontes">
          <button
            className="button"
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
          >
            Anterior
          </button>
          <span>
            Página {current} de {pages}
          </span>
          <button
            className="button"
            disabled={current === pages}
            onClick={() => setPage(current + 1)}
          >
            Próxima
          </button>
        </nav>
      )}
      {removal && (
        <RemoveItems
          selection={removal}
          close={() => setRemoval(null)}
          done={async () => {
            await refresh();
            setSelection([]);
          }}
        />
      )}
    </section>
  );
}
