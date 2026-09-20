"use client";
import { useEffect, useState } from "react";
import { BLOCKS, type Block, type Kind } from "@/lib/flow-types";
import { NODE_STYLE } from "@/lib/flow-presets";
import { Icon, IconButton, Modal, request } from "./StudioUI";
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
  prompt: ["Mensagem de entrada", "O que o agente recebe a cada execução."],
  model: ["Modelo ChatGPT", "Os modelos disponíveis dependem da conta conectada."],
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
  others,
  models,
  onClose,
  onSave,
}: {
  node: Block;
  others: { id: string; label: string }[];
  models: { id: string; name: string }[];
  onClose: () => void;
  onSave: (n: Block) => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(node)),
    [renaming, setRenaming] = useState(false),
    [name, setName] = useState(node.data.label),
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
  function insert(key: string, ref: string) {
    change(key, ((c[key] || "") + " " + ref).trim());
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
  const references: [string, string][] = [
    ["{{input}}", "Entrada"],
    ["{{last}}", "Etapa anterior"],
    ["{{state.nome}}", "Variável"],
    ...others
      .filter((o) => o.id !== node.id)
      .map((o): [string, string] => [`{{nodes.${o.id}}}`, o.label]),
  ];
  return (
    <Modal title={BLOCKS[k].label} onClose={onClose}>
      <div className="node-dialog-type">
        <span style={{ background: NODE_STYLE[k].color }}>
          <Icon name={k} size={24} />
        </span>
        {renaming ? (
          <div className="node-rename">
            <input
              autoFocus
              value={name}
              maxLength={100}
              aria-label="Nome do bloco"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  setDraft({ ...draft, data: { ...draft.data, label: name.trim() } });
                  setRenaming(false);
                }
                if (e.key === "Escape") setRenaming(false);
              }}
            />
            <IconButton
              icon="check"
              label="Salvar nome"
              disabled={!name.trim()}
              onClick={() => {
                setDraft({ ...draft, data: { ...draft.data, label: name.trim() } });
                setRenaming(false);
              }}
            />
            <IconButton
              icon="close"
              label="Cancelar"
              onClick={() => {
                setName(draft.data.label);
                setRenaming(false);
              }}
            />
          </div>
        ) : (
          <div className="node-name">
            <strong>{draft.data.label}</strong>
            <IconButton
              icon="pencil"
              label="Editar nome"
              onClick={() => setRenaming(true)}
            />
            <p>{BLOCKS[k].help}</p>
          </div>
        )}
      </div>
      <div className="node-fields">
        {fields[k].map((key) => (
          <label key={key}>
            <span className="field-title">
              {labels[key][0]}
              {REFERENCES.includes(key) && (
                <span className="reference-chips">
                  {references.map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      title={"Inserir " + v}
                      onClick={() => insert(key, v)}
                    >
                      {l}
                    </button>
                  ))}
                </span>
              )}
            </span>
            {key === "model" ? (
              <select
                value={c[key] || ""}
                onChange={(e) => change(key, e.target.value)}
              >
                <option value="">Automático · ChatGPT</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
                {c.model && !models.some((m) => m.id === c.model) && (
                  <option value={c.model}>{c.model} · modelo salvo</option>
                )}
              </select>
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
              <textarea
                rows={key === "system" ? 5 : 3}
                spellCheck={key === "system" || key === "prompt"}
                value={c[key] || ""}
                onChange={(e) => change(key, e.target.value)}
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
            {labels[key][1] && <small>{labels[key][1]}</small>}
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
          onClick={() => {
            onSave(draft);
            onClose();
          }}
        >
          Salvar bloco
        </button>
      </div>
    </Modal>
  );
}
