"use client";
import { useState } from "react";
import type { ToolGroup, ToolInfo } from "@/lib/tools";
import { request } from "./StudioUI";
export function ToolCredentialFields({ tool, onSaved }: { tool: ToolInfo; onSaved: (groups: ToolGroup[]) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [removing, setRemoving] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const fields = tool.credentials || [];
  const value = (key: string) => draft[key] ?? fields.find((c) => c.chave === key)?.valor ?? "";
  async function save(deleting = false) {
    setBusy(true); setError(""); setNotice("");
    try {
      const campos = deleting ? Object.fromEntries(fields.map((c) => [c.chave, null]))
        : Object.fromEntries(Object.entries(draft).filter(([, v]) => v.trim()));
      onSaved(await request<ToolGroup[]>("/api/tools", "PUT", { campos }));
      setDraft({}); setRemoving(false);
      setNotice(deleting ? "Credencial compartilhada removida." : "Configuração salva. Disponível para todos os agentes que usam este serviço.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente."); }
    finally { setBusy(false); }
  }
  if (!fields.length) return <p className="tool-ready"><span>Pronta para usar.</span> Esta ferramenta não precisa de credencial.</p>;
  return <div className="tool-credential-fields">
    <p>Credencial compartilhada entre os agentes que usam este serviço.</p>
    {fields.map((c) => <label key={c.chave}>{c.rotulo}
      <input aria-label={c.rotulo} type={c.secret ? "password" : "text"} autoComplete="off" disabled={busy}
        placeholder={c.definido ? "Já salva · em branco mantém" : undefined} value={value(c.chave)}
        onChange={(e) => { setDraft({ ...draft, [c.chave]: e.target.value }); setNotice(""); }} />
      {(c.ajuda || c.link) && <small>{c.ajuda} {c.link && <a href={c.link} target="_blank" rel="noreferrer">Onde obter</a>}</small>}
    </label>)}
    {error && <p className="studio-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {removing ? <div className="tool-confirm"><p>Remover esta credencial interrompe o acesso ao serviço em todos os agentes.</p><div className="studio-actions">
      <button type="button" className="studio-button" disabled={busy} onClick={() => setRemoving(false)}>Manter credencial</button>
      <button type="button" className="studio-button danger" disabled={busy} onClick={() => void save(true)}>Confirmar remoção</button>
    </div></div> : <div className="studio-actions">
      <button type="button" className="studio-button primary" disabled={busy || !Object.keys(draft).length || fields.some((c) => !c.optional && !c.definido && !value(c.chave).trim())} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar configuração"}</button>
      {fields.some((c) => c.definido) && <button type="button" className="studio-button" disabled={busy} onClick={() => setRemoving(true)}>Remover credencial</button>}
    </div>}
  </div>;
}
