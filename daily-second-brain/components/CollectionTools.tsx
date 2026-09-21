"use client";
import { useCallback, useEffect, useState } from "react";
import type { CaptureTool } from "@/lib/capture-types";
import { request } from "./client";
import { Icon } from "./Icons";

export function CollectionTools() {
  const [tools, setTools] = useState<CaptureTool[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
      .finally(() => setBusy(false));
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
        if (alive) setBusy(false);
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
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError("");
            void load();
          }}
        >
          <Icon name="refresh" size={14} />
          {busy ? "Verificando…" : "Atualizar ferramentas"}
        </button>
      </div>
      <p>
        Daily usa estas leituras nas instruções e nos agendamentos. Marque
        apenas ferramentas de consulta; enviar mensagens ou alterar dados
        continua exigindo confirmação no chat.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
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
              disabled={busy || t.blocked}
              onChange={(e) =>
                setSelected((old) =>
                  e.target.checked
                    ? [...old, t.name]
                    : old.filter((n) => n !== t.name),
                )
              }
            />
            <span>
              <strong>{t.title}</strong>
              <small>
                {t.blocked
                  ? "Disponível somente com confirmação no chat."
                  : t.declaredReadOnly
                    ? "Leitura identificada pelo servidor."
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
      {tools.length > 0 && (
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            setNotice("");
            try {
              const list = await request<CaptureTool[]>(
                "/api/captures",
                "POST",
                { action: "permissions", names: selected },
              );
              setTools(list);
              setNotice("Ferramentas de coleta salvas.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Salvar ferramentas de coleta
        </button>
      )}
    </div>
  );
}
