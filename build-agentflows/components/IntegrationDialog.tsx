"use client";
import { useEffect, useState } from "react";
import type { Flow } from "@/lib/flow-types";
import { Icon, Modal, request } from "./StudioUI";
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
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    void request<{ ativo: boolean; mascarado: string | null }>("/api/mcp/token")
      .then(setAccess)
      .catch((e) => setError(e.message));
    setTimeout(() => setOrigin(location.origin), 0);
  }, []);
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
  const command = `curl -X POST '${origin}/webhook/flows/${flow.id}' \\\n  -H 'Authorization: Bearer ${code || "SEU_CODIGO"}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"input":"Sua mensagem"}'`;
  return (
    <Modal title="Integrar Agentflow" onClose={onClose} wide>
      <div className="integration-version">
        <div>
          <strong>
            {flow.published
              ? "Versão " + flow.version + " publicada"
              : "Este fluxo ainda é um rascunho"}
          </strong>
          <p>
            Integrações executam a versão publicada. Alterações no rascunho não
            afetam o que já está em uso.
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
          {flow.published ? "Publicar alterações" : "Publicar fluxo"}
        </button>
      </div>
      {error && (
        <p className="studio-error" role="alert">
          {error}
        </p>
      )}
      <section className="integration-section">
        <h3>Acesso aos fluxos</h3>
        <p>
          O código dá acesso aos fluxos e às aprovações desta instalação.
          Compartilhe somente com sistemas autorizados.
        </p>
        {code ? (
          <div className="generated-code">
            <code>{code}</code>
            <button
              className="studio-button"
              onClick={() => navigator.clipboard.writeText(code)}
            >
              Copiar código
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
      <section className="integration-section">
        <div className="integration-code-title">
          <h3>Chamada HTTP</h3>
          <button
            className="studio-button subtle"
            onClick={() => {
              void navigator.clipboard.writeText(command);
              setCopied(true);
            }}
          >
            <Icon name="copy" size={16} />
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
        <pre className="integration-code">{command}</pre>
      </section>
      <section className="integration-section">
        <h3>Usar no seu assistente via MCP</h3>
        <p>
          Conecte <code>{origin}/mcp</code> com o mesmo código Bearer. Use{" "}
          <code>executar_fluxo</code> com <code>id</code> e <code>input</code>.
        </p>
        <code className="integration-code">
          {JSON.stringify({ id: flow.id, input: "Sua mensagem" }, null, 2)}
        </code>
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
    </Modal>
  );
}
