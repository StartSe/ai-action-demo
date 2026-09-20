"use client";
import { useEffect, useState } from "react";
import { BLOCKS, type Block, type Kind } from "@/lib/flow-types";
import { NODE_STYLE } from "@/lib/flow-presets";
import { Icon, Modal, request } from "./StudioUI";
import { ReferenceField, type Reference } from "./ReferenceField";
import { ModelPicker } from "./ModelPicker";
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
const labels: Record<string, [string, string]> = {
  system: ["Instruções", "Quem é este agente, o que deve fazer e como responder."],
  prompt: [
    "Mensagem (opcional)",
    "Em branco, o bloco recebe a conversa ou o resultado da etapa anterior.",
  ],
  model: ["Modelo de IA", ""],
  tools: ["Ferramentas autorizadas", "Só as ferramentas marcadas ficam disponíveis."],
  state: ["Estado inicial", "Objeto JSON com valores de texto, opcional."],
  value: ["Valor", "Texto que será comparado."],
  operator: ["Comparação", ""],
  compare: ["Comparar com", ""],
  key: ["Nome da variável", "Letras e números, sem espaços."],
  url: ["Endereço do serviço", "Endereço fixo, definido por você."],
  method: ["Método", ""],
  body: ["Conteúdo enviado", "JSON enviado ao serviço."],
  credential: [
    "Nome da credencial",
    "Nome FLOW_SECRET_ definido no servidor. Não cole o segredo aqui.",
  ],
  tool: ["Ferramenta", "Ferramenta do serviço conectado."],
  args: ["Argumentos", "JSON com os parâmetros da ferramenta."],
  limit: ["Máximo de repetições", "Entre 1 e 20 passagens."],
  text: ["Resposta final", "Texto entregue a quem chamou o fluxo."],
};
const TEXTAREAS = ["system", "prompt", "state", "body", "args", "text"];
const REFERENCES = ["system", "prompt", "value", "compare", "body", "args", "text"];
const COMPARISONS: [string, string][] = [
  ["contains", "Contém"],
  ["equals", "É igual a"],
  ["notEquals", "É diferente de"],
  ["greater", "É maior que"],
  ["empty", "Está vazio"],
];
type Tool = { name: string; description?: string };
// Diálogo de edição do bloco, no formato do Flowise: ícone colorido, nome editável em linha
// e a lista de campos do tipo. Referências e ferramentas entram por clique, sem digitar código.
export function NodeDialog({
  node,
  nodes,
  models,
  onClose,
  onSave,
}: {
  node: Block;
  nodes: Block[];
  models: { id: string; name: string }[];
  onClose: () => void;
  onSave: (n: Block) => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(node)),
    [error, setError] = useState(""),
    [tools, setTools] = useState<Tool[] | null>(null),
    [toolsUrl, setToolsUrl] = useState(""),
    [toolsCode, setToolsCode] = useState(""),
    [busy, setBusy] = useState(false);
  const c = draft.data.config,
    k = draft.data.kind,
    usesTools = k === "agent" || k === "tool";
  useEffect(() => {
    if (!usesTools) return;
    let alive = true;
    void request<Tool[]>("/api/tools")
      .then((t) => alive && setTools(t))
      .catch(() => alive && setTools([]));
    return () => {
      alive = false;
    };
  }, [usesTools]);
  function change(key: string, value: string) {
    setDraft((d) => ({
      ...d,
      data: { ...d.data, config: { ...d.data.config, [key]: value } },
    }));
  }
  const selected = (c.tools || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  function toggleTool(name: string) {
    change(
      "tools",
      (selected.includes(name)
        ? selected.filter((t) => t !== name)
        : [...selected, name]
      ).join(","),
    );
  }
  async function connectTools() {
    setBusy(true);
    setError("");
    try {
      await request("/api/tool-connection", "PUT", {
        url: toolsUrl,
        code: toolsCode,
      });
      setToolsCode("");
      setTools(await request<Tool[]>("/api/tools"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível conectar.");
    } finally {
      setBusy(false);
    }
  }
  const stateKeys = new Set<string>();
  for (const n of nodes) {
    if (n.data.kind === "state" && n.data.config.key)
      stateKeys.add(n.data.config.key);
    if (n.data.kind === "start")
      try {
        Object.keys(JSON.parse(n.data.config.state || "{}")).forEach((k) =>
          stateKeys.add(k),
        );
      } catch {}
  }
  const references: Reference[] = [
    { value: "{{input}}", label: "Conversa", hint: "o que a pessoa enviou" },
    { value: "{{last}}", label: "Etapa anterior", hint: "resultado do bloco anterior" },
    ...[...stateKeys].map((k) => ({
      value: `{{state.${k}}}`,
      label: "Variável " + k,
    })),
    { value: "{{state.approval}}", label: "Decisão da aprovação", hint: "yes ou no" },
    ...nodes
      .filter(
        (o) => o.id !== node.id && !["start", "end"].includes(o.data.kind),
      )
      .map((o) => ({
        value: `{{nodes.${o.id}}}`,
        label: o.data.label,
        hint: BLOCKS[o.data.kind].label,
      })),
  ];
  return (
    <Modal
      title={
        <label className="modal-title-input">
          <input
            value={draft.data.label}
            maxLength={100}
            aria-label="Nome do bloco"
            placeholder={BLOCKS[k].label}
            onChange={(e) =>
              setDraft({
                ...draft,
                data: { ...draft.data, label: e.target.value },
              })
            }
          />
          <Icon name="pencil" size={15} />
        </label>
      }
      onClose={onClose}
    >
      <div className="node-dialog-type">
        <span style={{ background: NODE_STYLE[k].color }}>
          <Icon name={k} size={24} />
        </span>
        <div>
          <strong>{BLOCKS[k].label}</strong>
          <p>{BLOCKS[k].help}</p>
        </div>
      </div>
      <p className="reference-tip">
        Digite <code>{"{{"}</code> em qualquer campo para inserir a conversa, o
        resultado anterior ou uma variável.
      </p>
      <div className="node-fields">
        {fields[k].map((key) => (
          <label key={key}>
            <span className="field-title">
              {k === "approval" && key === "prompt"
                ? "O que a pessoa deve revisar"
                : labels[key][0]}
            </span>
            {key === "model" ? (
              <ModelPicker
                value={c[key] || ""}
                chatModels={models}
                onChange={(v) => change(key, v)}
              />
            ) : key === "operator" || key === "method" ? (
              <select
                value={c[key] || ""}
                onChange={(e) => change(key, e.target.value)}
              >
                {(key === "operator"
                  ? COMPARISONS
                  : ["GET", "POST", "PUT", "PATCH", "DELETE"].map(
                      (v): [string, string] => [v, v],
                    )
                ).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            ) : key === "tools" ? (
              <div className="tool-choices">
                {tools === null ? (
                  <small>Consultando ferramentas…</small>
                ) : !tools.length && !selected.length ? (
                  <small>Nenhuma ferramenta conectada ainda.</small>
                ) : (
                  [...new Set([...selected, ...tools.map((t) => t.name)])].map(
                    (name) => (
                      <button
                        key={name}
                        type="button"
                        className={selected.includes(name) ? "active" : ""}
                        title={tools.find((t) => t.name === name)?.description}
                        onClick={() => toggleTool(name)}
                      >
                        <Icon
                          name={selected.includes(name) ? "check" : "plus"}
                          size={12}
                        />
                        {name}
                      </button>
                    ),
                  )
                )}
              </div>
            ) : key === "tool" && tools?.length ? (
              <select
                value={c[key] || ""}
                onChange={(e) => change(key, e.target.value)}
              >
                <option value="">Escolha uma ferramenta</option>
                {tools.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
                {c.tool && !tools.some((t) => t.name === c.tool) && (
                  <option value={c.tool}>{c.tool} · salva</option>
                )}
              </select>
            ) : TEXTAREAS.includes(key) ? (
              <ReferenceField
                multiline
                rows={key === "system" ? 5 : 3}
                spellCheck={key === "system" || key === "prompt"}
                value={c[key] || ""}
                references={references}
                onChange={(v) => change(key, v)}
              />
            ) : REFERENCES.includes(key) ? (
              <ReferenceField
                value={c[key] || ""}
                references={references}
                onChange={(v) => change(key, v)}
              />
            ) : (
              <input
                type={key === "limit" ? "number" : "text"}
                min={key === "limit" ? 1 : undefined}
                max={key === "limit" ? 20 : undefined}
                value={c[key] || ""}
                onChange={(e) => change(key, e.target.value)}
              />
            )}
            {k === "approval" && key === "prompt" ? (
              <small>Mostrado junto com o resultado, antes da decisão.</small>
            ) : (
              labels[key][1] && <small>{labels[key][1]}</small>
            )}
          </label>
        ))}
        {usesTools && (
          <details className="node-tools">
            <summary>Conectar ferramentas externas</summary>
            <p>Opcional. Use um servidor MCP para dar ferramentas ao agente.</p>
            <label>
              Endereço
              <input
                type="url"
                value={toolsUrl}
                placeholder="https://seu-servico/mcp"
                onChange={(e) => setToolsUrl(e.target.value)}
              />
            </label>
            <label>
              Código de acesso
              <input
                type="password"
                value={toolsCode}
                autoComplete="off"
                onChange={(e) => setToolsCode(e.target.value)}
              />
            </label>
            <button
              className="studio-button"
              disabled={busy || !toolsUrl}
              onClick={connectTools}
            >
              {busy ? "Conectando…" : "Conectar e listar ferramentas"}
            </button>
          </details>
        )}
      </div>
      {error && (
        <p className="studio-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="studio-button" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="studio-button primary"
          disabled={!draft.data.label.trim()}
          onClick={() => {
            onSave({
              ...draft,
              data: { ...draft.data, label: draft.data.label.trim() },
            });
            onClose();
          }}
        >
          Salvar bloco
        </button>
      </div>
    </Modal>
  );
}
