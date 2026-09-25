"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { KNOWLEDGE_STATUS, type KnowledgeBase } from "@/lib/knowledge-types";
import { request } from "./StudioUI";
export function KnowledgeAgentFields({
  config,
  onChange,
}: {
  config: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const [bases, setBases] = useState<KnowledgeBase[]>([]),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    void request<KnowledgeBase[]>("/api/knowledge")
      .then((data) => {
        if (active) {
          setBases(data);
          setLoaded(true);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  const selected = bases.find((b) => b.id === config.knowledgeBase);
  return (
    <section className="knowledge-agent node-fields">
      <div className="knowledge-section-title">
        <strong>Base de Conhecimento</strong>
        <Link href="/knowledge" target="_blank" rel="noopener">
          Gerenciar bases
        </Link>
      </div>
      <label>
        Consultar documentos
        <select
          aria-label="Base de Conhecimento do agente"
          value={config.knowledgeBase || ""}
          onChange={(e) => onChange("knowledgeBase", e.target.value)}
        >
          <option value="">Não usar uma base</option>
          {bases.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} · {KNOWLEDGE_STATUS[b.status]}
            </option>
          ))}
          {config.knowledgeBase && !selected && (
            <option value={config.knowledgeBase}>
              {loaded
                ? "Base não encontrada · escolha outra"
                : "Carregando base selecionada…"}
            </option>
          )}
        </select>
      </label>
      {error && (
        <p className="studio-error" role="alert">
          {error}{" "}
          <button type="button" onClick={() => setRefresh(refresh + 1)}>
            Tentar novamente
          </button>
        </p>
      )}
      {!loaded && !error && <small>Carregando bases…</small>}
      {loaded && !bases.length && (
        <small>
          Crie uma base, adicione documentos e conclua a indexação para usá-la
          aqui.
        </small>
      )}
      {selected && selected.status !== "ready" && (
        <small>
          Conclua a indexação desta base antes de executar o agente.{" "}
          <Link target="_blank" href={`/knowledge/${selected.id}`}>
            Abrir base
          </Link>
        </small>
      )}
      <label className="knowledge-toggle">
        <input
          type="checkbox"
          checked={config.knowledgeReferences === "true"}
          disabled={!config.knowledgeBase}
          onChange={(e) =>
            onChange("knowledgeReferences", String(e.target.checked))
          }
        />
        <span>
          Retornar referências encontradas
          <small>Acrescenta as fontes consultadas ao final da resposta.</small>
        </span>
      </label>
      {config.knowledgeBase && (
        <details>
          <summary>Ajustar consulta</summary>
          <small>Deixe em branco para usar a configuração da base. O filtro de metadados e a estratégia de distância seguem a base.</small>
          <div className="knowledge-form-grid">
            <label>
              Top K
              <input
                type="number"
                min="1"
                max="20"
                placeholder={`Padrão da base: ${selected?.config.retrieval?.topK ?? 4}`}
                value={config.knowledgeTopK || ""}
                onChange={(e) => onChange("knowledgeTopK", e.target.value)}
              />
            </label>
            <label>
              Similaridade mínima
              <input
                type="number"
                min="-1"
                max="1"
                step="0.05"
                placeholder={`Padrão da base: ${selected?.config.retrieval?.minScore ?? 0}`}
                value={config.knowledgeMinScore || ""}
                onChange={(e) => onChange("knowledgeMinScore", e.target.value)}
              />
            </label>
          </div>
        </details>
      )}
    </section>
  );
}
