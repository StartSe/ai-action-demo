"use client";
import { useEffect, useState } from "react";
import { BLOCKS, type Block, type Kind } from "@/lib/flow-types";
import { NODE_STYLE } from "@/lib/flow-presets";
import { Icon, IconButton, Modal, request } from "./StudioUI";
import { ReferenceField, type Reference } from "./ReferenceField";
import { ToolPicker } from "./ToolPicker";
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
  whatsapp: ["to", "text"],
  call: ["to", "context"],
  end: ["text"],
};
const labels: Record<string, [string, string]> = {
  system: ["Instruções", "Quem é este agente, o que deve fazer e como responder."],
  prompt: [
    "Mensagem (opcional)",
    "Em branco, o bloco recebe a conversa ou o resultado da etapa anterior.",
  ],
  model: ["Modelo de IA", ""],
  tools: ["Ferramentas e servidores MCP", ""],
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
  to: ["Número de destino", "Com DDI e DDD, ex.: 5511999990000. Aceita {{state.telefone}}."],
  context: ["Contexto da ligação", "O que o agente de voz deve saber e fazer nesta chamada."],
};
const TEXTAREAS = ["system", "prompt", "state", "body", "args", "text", "context"];
const REFERENCES = ["system", "prompt", "value", "compare", "body", "args", "text", "to", "context"];
const COMPARISONS: [string, string][] = [
  ["contains", "Contém"],
  ["equals", "É igual a"],
  ["notEquals", "É diferente de"],
  ["greater", "É maior que"],
  ["empty", "Está vazio"],
];

type ToolInfo = {
  id: string;
  name: string;
  description: string;
  category?: string;
  configured?: boolean;

  setup?: string;
};
type ToolGroup = { id: string; name: string; kind: "builtin" | "mcp"; tools: ToolInfo[]; error?: string };
// Diálogo de edição do bloco, no formato do Flowise: ícone colorido, nome editável em linha
// e a lista de campos do tipo. Referências e ferramentas entram por clique, sem digitar código.
export function NodeDialog({
  node,
  nodes,
  models,
  onClose,
  onSave,
  onRename,
}: {
  node: Block;
  nodes: Block[];
  models: { id: string; name: string }[];
  onClose: () => void;
  onSave: (n: Block) => void;
  onRename: (label: string) => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(node)),
    [groups, setGroups] = useState<ToolGroup[] | null>(null),
    [savedName, setSavedName] = useState(node.data.label),
    [nameSaved, setNameSaved] = useState(false);
  const c = draft.data.config,
    k = draft.data.kind;
  useEffect(() => {
    if (k !== "tool") return;
    let alive = true;
    void request<ToolGroup[]>("/api/tools")
      .then((g) => alive && setGroups(g))
      .catch(() => alive && setGroups([]));
    return () => {
      alive = false;
    };
  }, [k]);
  function change(key: string, value: string) {
    setDraft((d) => ({
      ...d,
      data: { ...d.data, config: { ...d.data.config, [key]: value } },
    }));
  }
  // Ids antigos (nome sem prefixo) pertencem ao servidor "Ferramentas" da primeira versão.
  const normalize = (id: string) => (id.includes(":") ? id : "mcp:FERRAMENTAS:" + id);
  // Enter ou o check no título salvam só o nome; o diálogo continua aberto.
  function saveName() {
    const label = draft.data.label.trim();
    if (!label || label === savedName) return;
    onRename(label);
    setSavedName(label);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 1800);
  }
  function saveAndClose() {
    onSave({
      ...draft,
      data: { ...draft.data, label: draft.data.label.trim() },
    });
    onClose();
  }
  const known = new Set((groups || []).flatMap((g) => g.tools.map((t) => t.id)));
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
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.data.label.trim()) {
                e.preventDefault();
                saveName();
              }
            }}
          />
          {nameSaved ? (
            <span className="modal-title-saved">
              <Icon name="check" size={14} />
              Nome salvo
            </span>
          ) : (
            <IconButton
              icon="check"
              label="Salvar nome"
              disabled={
                !draft.data.label.trim() || draft.data.label.trim() === savedName
              }
              onClick={saveName}
            />
          )}
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
          <div className="node-field" key={key}>
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
              <ToolPicker value={c.tools || ""} cardsValue={c.toolCards || ""} onChange={(tools, toolCards) => setDraft((d) => ({
                ...d, data: { ...d.data, config: { ...d.data.config, tools, toolCards } },
              }))} />
            ) : key === "tool" ? (
              <select
                value={c[key] ? normalize(c[key]) : ""}
                onChange={(e) => change(key, e.target.value)}
              >
                <option value="">Escolha uma ferramenta</option>
                {(groups || []).map((g) => (
                  <optgroup key={g.id} label={g.name}>
                    {g.tools.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {c.tool && !known.has(normalize(c.tool)) && (
                  <option value={normalize(c.tool)}>
                    {c.tool.split(":").pop()} · fora do ar
                  </option>
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
            ) : k === "whatsapp" && key === "text" ? (
              <small>Mensagem enviada. Em branco não envia nada.</small>
            ) : (
              labels[key][1] && <small>{labels[key][1]}</small>
            )}
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="studio-button" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="studio-button primary"
          disabled={!draft.data.label.trim()}
          onClick={saveAndClose}
        >
          Salvar bloco
        </button>
      </div>
    </Modal>
  );
}
