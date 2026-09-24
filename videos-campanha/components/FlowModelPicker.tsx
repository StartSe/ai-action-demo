"use client";
import { useState } from "react";
import { MODELS, type Block } from "@/lib/flow/model";
import { MODEL_HELP } from "@/lib/flow/experience";
import { FlowDialog } from "./FlowFeedback";

export default function FlowModelPicker({
  node,
  onSelect,
  onClose,
}: {
  node: Block;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const models = MODELS.filter(
    (m) =>
      m.kinds.includes(node.data.kind) &&
      `${m.name} ${MODEL_HELP[m.id]?.description}`
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")),
  );
  return (
    <FlowDialog
      title="Escolher modelo"
      className="cf-model-dialog"
      onClose={onClose}
    >
      <button
        className="cf-modal-close"
        aria-label="Fechar modelos"
        onClick={onClose}
      >
        ×
      </button>
      <p className="cf-eyebrow">
        {node.data.kind === "video" ? "VÍDEO" : "IMAGEM"}
      </p>
      <h2>Escolha como criar</h2>
      <p>Compare os modelos disponíveis para esta etapa.</p>
      <input
        autoFocus
        className="cf-model-search"
        aria-label="Buscar modelo"
        placeholder="Buscar modelo…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="cf-model-options">
        {models.map((m) => (
          <button
            key={m.id}
            className={node.data.model === m.id ? "active" : ""}
            aria-pressed={node.data.model === m.id}
            onClick={() => onSelect(m.id)}
          >
            <div>
              <strong>{m.name}</strong>
              <span>
                {node.data.model === m.id ? "Selecionado ✓" : "Selecionar"}
              </span>
            </div>
            <p>{MODEL_HELP[m.id]?.description}</p>
            <small>
              {m.durations.length ? `${m.durations.join(" / ")}s · ` : ""}
              {m.ratios.join(" · ")} · {m.resolutions.join(" / ")}
            </small>
            <small>{MODEL_HELP[m.id]?.references}</small>
          </button>
        ))}
        {!models.length && (
          <p className="cf-no-results">
            Nenhum modelo encontrado.{" "}
            <button onClick={() => setQuery("")}>Limpar busca</button>
          </p>
        )}
      </div>
    </FlowDialog>
  );
}
