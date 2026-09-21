"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CaptureTool } from "@/lib/capture-types";
import { request } from "./client";
import { Icon } from "./Icons";

export function CollectionTools() {
  const [tools, setTools] = useState<CaptureTool[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<"loading" | "saving" | null>("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [feedback, setFeedback] = useState("");
  const feedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (feedback || error)
      feedbackRef.current?.scrollIntoView({ block: "nearest" });
  }, [feedback, error]);
  const available = tools.filter((t) => !t.blocked);
  const dirty = tools.some((t) => selected.includes(t.name) !== t.allowed);
  function changeSelection(names: string[]) {
    setSelected(names);
    setFeedback("");
    setError("");
  }
  const receive = useCallback((list: CaptureTool[]) => {
    setTools(list);
    setSelected(list.filter((t) => t.allowed).map((t) => t.name));
    setNotice(
      list.length
        ? "Conexão verificada. Escolha as leituras que Daily pode usar."
        : "A conexão funciona, mas não há ferramentas. Habilite suas leituras no Zapier e atualize.",
    );
  }, []);
  function load() {
    return request<CaptureTool[]>("/api/captures", "POST", { action: "tools" })
      .then(receive)
      .catch((e) => setError(e.message))
      .finally(() => setBusy(null));
  }
  useEffect(() => {
    let alive = true;
    void request<CaptureTool[]>("/api/captures", "POST", { action: "tools" })
      .then((list) => {
        if (alive) receive(list);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setBusy(null);
      });
    return () => {
      alive = false;
    };
  }, [receive]);
  return (
    <div className="collection-tools">
      <div className="section-heading">
        <h3>Ferramentas de coleta</h3>
        <button
          type="button"
          className="text-button"
          disabled={!!busy}
          onClick={() => {
            setBusy("loading");
            setError("");
            setFeedback("");
            void load();
          }}
        >
          <Icon name="refresh" size={14} />
          {busy === "loading" ? "Verificando…" : "Atualizar ferramentas"}
        </button>
      </div>
      <p>
        Daily usa estas leituras nas instruções e nos agendamentos. Marque
        apenas ferramentas de consulta; enviar mensagens ou alterar dados
        continua exigindo confirmação no chat.
      </p>
      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}
      {tools.length > 0 && (
        <div className="tool-selection-actions">
          <div className="button-row">
            <button
              type="button"
              className="button"
              disabled={!!busy || selected.length === available.length}
              onClick={() => changeSelection(available.map((t) => t.name))}
            >
              Selecionar todas
            </button>
            <button
              type="button"
              className="text-button"
              disabled={!!busy || !selected.length}
              onClick={() => changeSelection([])}
            >
              Limpar seleção
            </button>
          </div>
          <span aria-live="polite">
            {selected.length} de {available.length} ferramentas disponíveis
            selecionadas
          </span>
        </div>
      )}
      <div className="read-tool-list">
        {tools.map((t) => (
          <label
            className={`read-tool ${t.blocked ? "disabled" : ""}`}
            key={t.name}
          >
            <input
              type="checkbox"
              checked={selected.includes(t.name)}
              disabled={!!busy || t.blocked}
              onChange={(e) => {
                const checked = e.target.checked;
                setFeedback("");
                setError("");
                setSelected((old) =>
                  checked
                    ? [...new Set([...old, t.name])]
                    : old.filter((n) => n !== t.name),
                );
              }}
            />
            <span>
              <strong>{t.title}</strong>
              <small>
                {t.blocked
                  ? "Fora da coleta automática. Use no chat e confirme a execução."
                  : t.declaredReadOnly
                    ? "Leitura identificada pelo servidor."
                    : t.recognizedReadOnly
                      ? "Consulta do Slack. Selecione para autorizar nas coletas."
                      : "Selecione se esta ferramenta apenas consulta informações."}
              </small>
              <details>
                <summary>O que esta ferramenta faz</summary>
                <p>{t.description || t.name}</p>
              </details>
            </span>
          </label>
        ))}
      </div>
      <div
        className="tool-save-feedback"
        ref={feedbackRef}
        aria-busy={busy === "saving"}
      >
        {tools.length > 0 && (
          <button
            type="button"
            className="button"
            disabled={!!busy}
            onClick={async () => {
              setBusy("saving");
              setError("");
              setFeedback("");
              try {
                const list = await request<CaptureTool[]>(
                  "/api/captures",
                  "POST",
                  { action: "permissions", names: selected },
                );
                setTools(list);
                setSelected(list.filter((t) => t.allowed).map((t) => t.name));
                const count = list.filter((t) => t.allowed).length;
                setFeedback(
                  `Ferramentas de coleta salvas. ${count === 0 ? "Nenhuma ferramenta autorizada" : count === 1 ? "1 ferramenta autorizada" : `${count} ferramentas autorizadas`} para as próximas coletas.`,
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "saving"
              ? "Salvando ferramentas…"
              : "Salvar ferramentas de coleta"}
          </button>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {feedback && (
          <p className="notice" role="status">
            <Icon name="check" size={16} /> {feedback}
          </p>
        )}
        {dirty && !feedback && (
          <p className="muted">
            Alterações não salvas. Clique em Salvar ferramentas de coleta para
            aplicar.
          </p>
        )}
      </div>
    </div>
  );
}
