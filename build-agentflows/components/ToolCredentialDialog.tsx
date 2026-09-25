"use client";
import { useState } from "react";
import { TOOL_CREDENTIALS, TOOL_CREDENTIAL_LABELS } from "@/lib/tool-credentials";
import type { SavedToolCredential } from "@/lib/tool-credential-store";
import { Modal, request } from "./StudioUI";

export function ToolCredentialDialog({ provider: initialProvider = "", credential, onSaved, onClose }: {
  provider?: string; credential?: SavedToolCredential; onSaved: (credential: SavedToolCredential) => void; onClose: () => void;
}) {
  const [provider, setProvider] = useState(credential?.provider || initialProvider);
  const [name, setName] = useState(credential?.name || "");
  const [draft, setDraft] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const fields = credential?.fields || TOOL_CREDENTIALS[provider] || [];
  const value = (key: string) => draft[key] ?? fields.find((field) => field.chave === key)?.valor ?? "";
  async function save() {
    setBusy(true); setError("");
    try {
      const saved = await request<SavedToolCredential>(credential ? `/api/tool-credentials/${encodeURIComponent(credential.id)}` : "/api/tool-credentials", credential ? "PUT" : "POST", { name, provider, fields: draft });
      onSaved(saved);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar a conexão."); }
    finally { setBusy(false); }
  }
  function renderFields(optional: boolean) {
    return fields.filter((field) => !!field.optional === optional).map((field) => <label key={field.chave}>{field.rotulo}
      <input type={field.secret ? "password" : "text"} autoComplete="off" disabled={busy || credential?.locked}
        value={draft[field.chave] === null ? "" : value(field.chave)} placeholder={field.definido && field.secret ? "Já salva · deixe em branco para manter" : undefined}
        onChange={(event) => setDraft((d) => ({ ...d, [field.chave]: event.target.value }))} />
      {(field.ajuda || field.link) && <small>{field.ajuda} {field.link && <a href={field.link} target="_blank" rel="noreferrer">Onde obter</a>}</small>}
      {field.optional && field.definido && <button type="button" className="tool-text-button" disabled={busy || credential?.locked} onClick={() => setDraft((d) => {
        const next = { ...d };
        if (d[field.chave] === null) delete next[field.chave]; else next[field.chave] = null;
        return next;
      })}>{draft[field.chave] === null ? "Manter valor salvo" : "Remover valor salvo"}</button>}
    </label>);
  }
  return <Modal title={credential ? "Editar credencial" : "Nova credencial"} onClose={() => { if (!busy) onClose(); }} className="credential-dialog">
    <p>Salve uma conexão com nome para reutilizar nos seus agentes.</p>
    <div className="node-fields">
      {!credential && !initialProvider ? <label>Serviço<select value={provider} disabled={busy} onChange={(event) => { setProvider(event.target.value); setDraft({}); setError(""); }}>
        <option value="">Escolha um serviço</option>
        {Object.entries(TOOL_CREDENTIAL_LABELS).sort((a, b) => a[1].localeCompare(b[1])).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label> : <strong>{TOOL_CREDENTIAL_LABELS[provider] || provider}</strong>}
      {!!provider && <>
        <label>Nome da conexão<input value={name} maxLength={100} placeholder="Ex.: Conta do time comercial" disabled={busy || credential?.legacy} onChange={(event) => setName(event.target.value)} /></label>
        {renderFields(false)}
        {fields.some((f) => f.optional) && <details className="credential-advanced"><summary>Opções avançadas</summary><div className="node-fields">{renderFields(true)}</div></details>}
      </>}
      {credential?.locked && <p>Esta conexão foi definida no servidor. Crie uma nova credencial para usar outra conta.</p>}
      {credential && <small>Alterações valem para todos os agentes que usam esta credencial.</small>}
    </div>
    {error && <p className="studio-error" role="alert">{error}</p>}
    <div className="modal-actions">
      <button type="button" className="studio-button" disabled={busy} onClick={onClose}>Cancelar</button>
      <button type="button" className="studio-button primary" disabled={busy || !provider || !name.trim() || credential?.locked} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar credencial"}</button>
    </div>
  </Modal>;
}
