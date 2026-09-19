"use client";
import { useEffect, useState } from "react";
import type { Run } from "@/lib/flow-types";
import { Icon, Modal, StudioShell, request } from "@/components/StudioUI";
import { RunView, RUN_STATUS } from "@/components/RunView";
import { ChatGPTConnection, useChatGPT } from "@/components/ChatGPTConnection";
export default function Page() {
  const [runs, setRuns] = useState<Run[]>([]),
    [selected, setSelected] = useState<Run | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [filter, setFilter] = useState("all"),
    [connect, setConnect] = useState(false);
  const { connection, setConnection } = useChatGPT();
  useEffect(() => {
    const load = () =>
      request<Run[]>("/api/runs")
        .then((items) => {
          setRuns(items);
          setSelected((current) =>
            current ? items.find((r) => r.id === current.id) || current : null,
          );
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);
  const filtered = runs.filter((r) => filter === "all" || r.status === filter);
  return (
    <StudioShell
      active="runs"
      onConnect={() => setConnect(true)}
      connected={!!connection?.account}
    >
      <main className="library-page">
        <header className="library-header">
          <div>
            <div className="studio-breadcrumb">Workspace / Execuções</div>
            <h1>Execuções</h1>
            <p>Respostas, decisões e cada etapa dos seus Agentflows.</p>
          </div>
          <label className="execution-filter">
            Status
            <select
              aria-label="Filtrar execuções"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              {Object.entries(RUN_STATUS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </header>
        {error && (
          <p role="alert" className="studio-error">
            {error}
          </p>
        )}
        {loading ? (
          <div className="library-loading">
            <span className="studio-spinner" />
            Carregando execuções…
          </div>
        ) : !filtered.length ? (
          <div className="library-empty">
            <Icon name="runs" size={42} />
            <h2>Nenhuma execução encontrada</h2>
            <p>Teste um fluxo para ver o resultado e o caminho percorrido.</p>
          </div>
        ) : (
          <div className="executions-table">
            <div className="execution-row table-heading">
              <span>Agentflow / entrada</span>
              <span>Status</span>
              <span>Modo</span>
              <span>Data</span>
            </div>
            {filtered.map((r) => (
              <button
                className="execution-row"
                key={r.id}
                onClick={() => setSelected(r)}
              >
                <span>
                  <strong>{r.name}</strong>
                  <small>{r.input.slice(0, 100)}</small>
                </span>
                <span className={"execution-status " + r.status}>
                  {RUN_STATUS[r.status]}
                </span>
                <span>{r.demo ? "Demonstração" : "ChatGPT"}</span>
                <span>{new Date(r.createdAt).toLocaleString("pt-BR")}</span>
              </button>
            ))}
          </div>
        )}
      </main>
      {selected && (
        <Modal
          title="Detalhes da execução"
          wide
          onClose={() => setSelected(null)}
        >
          <div className="test-user-message">{selected.input}</div>
          <RunView
            run={selected}
            onChange={(r) => {
              setSelected(r);
              setRuns((items) => items.map((x) => (x.id === r.id ? r : x)));
            }}
          />
        </Modal>
      )}
      {connect && (
        <ChatGPTConnection
          onClose={() => setConnect(false)}
          onChange={setConnection}
        />
      )}
    </StudioShell>
  );
}
