"use client";
import { useEffect, useState } from "react";
import type { Flow } from "@/lib/flow-types";
import { Icon, Modal, request } from "./StudioUI";
const TABS = [
  ["publish", "Publicação"],
  ["curl", "cURL"],
  ["javascript", "JavaScript"],
  ["python", "Python"],
  ["mcp", "Assistentes (MCP)"],
] as const;
type Tab = (typeof TABS)[number][0];
// Diálogo de implantação no formato do Flowise: publicação, código de acesso e um exemplo por
// linguagem para chamar a versão publicada do fluxo.
export function IntegrationDialog({
  flow,
  save,
  onChange,
  onClose,
}: {
  flow: Flow;
  save: () => Promise<Flow>;
  onChange: (f: Flow) => void;
  onClose: () => void;
}) {
  const [access, setAccess] = useState<{
      ativo: boolean;
      mascarado: string | null;
    } | null>(null),
    [code, setCode] = useState(""),
    [origin, setOrigin] = useState(""),
    [tab, setTab] = useState<Tab>("publish"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState("");
  useEffect(() => {
    void request<{ ativo: boolean; mascarado: string | null }>("/api/mcp/token")
      .then(setAccess)
      .catch((e) => setError(e.message));
    const timer = setTimeout(() => setOrigin(location.origin), 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(""), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }
  const url = `${origin}/webhook/flows/${flow.id}`,
    bearer = code || "SEU_CODIGO";
  const snippets: Record<Exclude<Tab, "publish">, string> = {
    curl: `curl -X POST '${url}' \\
  -H 'Authorization: Bearer ${bearer}' \\
  -H 'Content-Type: application/json' \\
  -d '{"input":"Sua mensagem"}'`,
    javascript: `const resposta = await fetch("${url}", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${bearer}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ input: "Sua mensagem" }),
});
const { status, output, error } = await resposta.json();
// status: "completed" | "failed" | "waiting"`,
    python: `import requests

resposta = requests.post(
    "${url}",
    headers={"Authorization": "Bearer ${bearer}"},
    json={"input": "Sua mensagem"},
    timeout=180,
)
dados = resposta.json()
print(dados["status"], dados["output"])`,
    mcp: JSON.stringify(
      {
        mcpServers: {
          agentflows: {
            url: `${origin}/mcp`,
            headers: { Authorization: `Bearer ${bearer}` },
          },
        },
      },
      null,
      2,
    ),
  };
  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text);
    setCopied(key);
  }
  return (
    <Modal title="Implantar Agentflow" onClose={onClose} wide>
      <div className="dialog-tabs">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="studio-error" role="alert">
          {error}
        </p>
      )}
      {tab === "publish" ? (
        <>
          <div className="integration-version">
            <div>
              <span
                className={
                  "publication-badge " + (flow.published ? "published" : "")
                }
              >
                {flow.published ? "Publicado · v" + flow.version : "Rascunho"}
              </span>
              <strong>
                {flow.published
                  ? "Versão " + flow.version + " em uso pelas integrações"
                  : "Este fluxo ainda é um rascunho"}
              </strong>
              <p>
                Integrações executam a versão publicada. Alterações no rascunho
                não afetam o que já está em uso até você publicar de novo.
              </p>
            </div>
            <button
              className="studio-button primary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await save();
                  onChange(
                    await request<Flow>(
                      "/api/flows/" + flow.id + "/publish",
                      "POST",
                      {},
                    ),
                  );
                })
              }
            >
              <Icon name="upload" size={16} />
              {flow.published ? "Publicar alterações" : "Publicar fluxo"}
            </button>
          </div>
          <section className="integration-section">
            <h3>Código de acesso</h3>
            <p>
              O código autentica chamadas HTTP e assistentes conectados. Ele dá
              acesso a todos os fluxos publicados e às aprovações desta
              instalação; compartilhe somente com sistemas autorizados.
            </p>
            {code ? (
              <div className="generated-code">
                <code>{code}</code>
                <button
                  className="studio-button"
                  onClick={() => copy(code, "code")}
                >
                  {copied === "code" ? "Copiado" : "Copiar código"}
                </button>
              </div>
            ) : (
              <p>
                {access?.ativo
                  ? "Código ativo: " + access.mascarado
                  : "Nenhum código de acesso ativo."}
              </p>
            )}
            <div className="studio-actions">
              <button
                className="studio-button"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const b = await request<{ codigo: string }>(
                      "/api/mcp/token",
                      "POST",
                    );
                    setCode(b.codigo);
                    setAccess({ ativo: true, mascarado: null });
                  })
                }
              >
                {access?.ativo ? "Gerar novo código" : "Gerar código"}
              </button>
              {access?.ativo && (
                <button
                  className="studio-button danger"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await request("/api/mcp/token", "DELETE");
                      setCode("");
                      setAccess({ ativo: false, mascarado: null });
                    })
                  }
                >
                  Revogar acesso
                </button>
              )}
            </div>
          </section>
          {flow.published && (
            <button
              className="studio-button subtle danger"
              disabled={busy}
              onClick={() =>
                act(async () =>
                  onChange(
                    await request<Flow>(
                      "/api/flows/" + flow.id + "/publish",
                      "POST",
                      { active: false },
                    ),
                  ),
                )
              }
            >
              Desativar publicação
            </button>
          )}
        </>
      ) : (
        <section className="integration-section">
          <div className="integration-code-title">
            <h3>
              {tab === "mcp"
                ? "Conecte seu assistente"
                : "Chame a versão publicada"}
            </h3>
            <button
              className="studio-button subtle"
              onClick={() => copy(snippets[tab], tab)}
            >
              <Icon name="copy" size={16} />
              {copied === tab ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p>
            {tab === "mcp"
              ? "Cole esta configuração no cliente MCP do seu assistente. Ele passa a listar os fluxos publicados, executar, consultar execuções e responder aprovações."
              : "A resposta traz status, output, error, demo e version. Confira status: completed, failed ou waiting (aguardando aprovação)."}
          </p>
          <pre className="integration-code">{snippets[tab]}</pre>
          {!flow.published && (
            <p className="generator-warning">
              Publique o fluxo na aba Publicação antes de usar este exemplo.
            </p>
          )}
          {!code && (
            <p className="integration-hint">
              Gere um código de acesso na aba Publicação e substitua SEU_CODIGO.
            </p>
          )}
        </section>
      )}
    </Modal>
  );
}
