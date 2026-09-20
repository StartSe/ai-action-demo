"use client";
import { useState } from "react";
import { BLOCKS, type Block, type Kind } from "@/lib/flow-types";
import { NODE_STYLE } from "@/lib/flow-presets";
import { Icon, Modal, request } from "./StudioUI";
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
const labels: Record<string, string> = {
  system: "Instruções",
  prompt: "Mensagem de entrada",
  model: "Modelo ChatGPT",
  tools: "Ferramentas autorizadas",
  state: "Estado inicial",
  value: "Valor",
  operator: "Comparação",
  compare: "Comparar com",
  key: "Nome da variável",
  url: "Endereço do serviço",
  method: "Método",
  body: "Conteúdo enviado",
  credential: "Nome da credencial",
  tool: "Ferramenta",
  args: "Argumentos",
  limit: "Máximo de repetições",
  text: "Resposta final",
};
export function NodeDialog({
  node,
  models,
  onClose,
  onSave,
}: {
  node: Block;
  models: { id: string; name: string }[];
  onClose: () => void;
  onSave: (n: Block) => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(node)),
    [tab, setTab] = useState("inputs"),
    [error, setError] = useState(""),
    [tools, setTools] = useState<{ name: string }[]>([]),
    [toolsUrl, setToolsUrl] = useState(""),
    [toolsCode, setToolsCode] = useState(""),
    [busy, setBusy] = useState(false);
  const c = draft.data.config,
    k = draft.data.kind;
  function change(key: string, value: string) {
    setDraft((d) => ({
      ...d,
      data: { ...d.data, config: { ...d.data.config, [key]: value } },
    }));
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
      setTools(await request<{ name: string }[]>("/api/tools"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível conectar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={draft.data.label} onClose={onClose}>
      <div className="node-dialog-type">
        <span style={{ background: NODE_STYLE[k].color }}>
          <Icon name={k} size={24} />
        </span>
        <div>
          <strong>{BLOCKS[k].label}</strong>
          <p>{BLOCKS[k].help}</p>
        </div>
      </div>
      <div className="dialog-tabs">
        <button
          className={tab === "inputs" ? "active" : ""}
          onClick={() => setTab("inputs")}
        >
          Entradas
        </button>
        <button
          className={tab === "references" ? "active" : ""}
          onClick={() => setTab("references")}
        >
          Referências
        </button>
      </div>
      {tab === "inputs" ? (
        <div className="node-fields">
          <label>
            Nome do bloco
            <input
              value={draft.data.label}
              maxLength={100}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  data: { ...draft.data, label: e.target.value },
                })
              }
            />
          </label>
          {fields[k].map((key) => (
            <label key={key}>
              {labels[key]}
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
                    ? [
                        ["contains", "Contém"],
                        ["equals", "É igual a"],
                        ["notEquals", "É diferente de"],
                        ["greater", "É maior que"],
                        ["empty", "Está vazio"],
                      ]
                    : ["GET", "POST", "PUT", "PATCH", "DELETE"].map((v) => [
                        v,
                        v,
                      ])
                  ).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : [
                  "system",
                  "prompt",
                  "state",
                  "body",
                  "args",
                  "text",
                ].includes(key) ? (
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
              )}{" "}
              {key === "tools" && (
                <small>
                  Separe os nomes por vírgula. O agente só poderá usar estas
                  ferramentas.
                </small>
              )}
              {key === "model" && (
                <small>
                  Os modelos disponíveis dependem da conta ChatGPT conectada.
                </small>
              )}
              {key === "credential" && (
                <small>
                  Nome FLOW_SECRET_ definido no servidor. Não cole o segredo
                  aqui.
                </small>
              )}
            </label>
          ))}
          {["agent", "tool"].includes(k) && (
            <details className="node-tools">
              <summary>Conectar ferramentas externas</summary>
              <p>
                Opcional. Use um servidor MCP para dar ferramentas ao agente.
              </p>
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
              <button
                className="studio-button subtle"
                onClick={async () => {
                  try {
                    setTools(await request<{ name: string }[]>("/api/tools"));
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Consultar conexão existente
              </button>
              {tools.length > 0 && (
                <div className="tool-choices">
                  {tools.map((t) => (
                    <button
                      key={t.name}
                      onClick={() =>
                        change(
                          k === "tool" ? "tool" : "tools",
                          k === "tool"
                            ? t.name
                            : [
                                ...new Set([
                                  ...(c.tools || "").split(",").filter(Boolean),
                                  t.name,
                                ]),
                              ].join(","),
                        )
                      }
                    >
                      {t.name} +
                    </button>
                  ))}
                </div>
              )}
            </details>
          )}
        </div>
      ) : (
        <div className="reference-help">
          <p>
            Insira referências para usar dados da entrada, do estado ou de
            etapas anteriores.
          </p>
          {[
            ["{{input}}", "Entrada original"],
            ["{{last}}", "Saída da etapa anterior"],
            ["{{state.nome}}", "Variável do estado"],
            [`{{nodes.${node.id}}}`, "Saída deste bloco nas próximas etapas"],
          ].map(([v, l]) => (
            <div key={v}>
              <code>{v}</code>
              <span>{l}</span>
            </div>
          ))}
          <p>
            O identificador deste bloco é <code>{node.id}</code>. Referências só
            podem usar etapas já executadas.
          </p>
        </div>
      )}
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
