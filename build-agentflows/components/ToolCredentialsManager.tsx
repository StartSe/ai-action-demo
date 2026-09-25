"use client";
import { useCallback, useEffect, useState } from "react";
import type { SavedToolCredential } from "@/lib/tool-credential-store";
import { Icon, Modal, request } from "./StudioUI";
import { ToolCredentialDialog } from "./ToolCredentialDialog";

export function ToolCredentialsManager() {
  const [items, setItems] = useState<SavedToolCredential[]>([]), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [query, setQuery] = useState("");
  const [editor, setEditor] = useState<SavedToolCredential | "new" | null>(null);
  const [removing, setRemoving] = useState<SavedToolCredential | null>(null), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setItems(await request<SavedToolCredential[]>("/api/tool-credentials")); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível carregar as credenciais."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  async function remove() {
    if (!removing) return;
    setBusy(true); setError("");
    try { await request(`/api/tool-credentials/${encodeURIComponent(removing.id)}`, "DELETE"); setItems((all) => all.filter((c) => c.id !== removing.id)); setRemoving(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível excluir a credencial."); }
    finally { setBusy(false); }
  }
  const shown = items.filter((c) => `${c.name} ${c.providerLabel}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section className="tool-credentials-manager" id="credenciais">
    <div className="settings-section-heading"><Icon name="link" size={18} /><div><h2>Credenciais das ferramentas</h2><p>Guarde suas conexões e escolha qual conta cada agente usa.</p></div></div>
    <div className="credential-manager-card">
      <div className="credential-manager-toolbar"><label>Buscar conexão<input type="search" value={query} placeholder="Nome ou serviço" onChange={(e) => setQuery(e.target.value)} /></label><button type="button" className="studio-button" onClick={() => setEditor("new")}><Icon name="plus" size={16} />Nova credencial</button></div>
      {loading && <p role="status">Carregando conexões…</p>}
      {!loading && !items.length && <p>Nenhuma credencial salva. Você também pode criar uma ao adicionar uma ferramenta no agente.</p>}
      {!!items.length && !shown.length && <p>Nenhuma conexão encontrada para essa busca.</p>}
      {shown.map((c) => <div className="credential-manager-row" key={c.id}><div><strong>{c.name}</strong><small>{c.providerLabel} · {c.configured ? "Credencial salva" : "Revisar conexão"}</small></div><div className="studio-actions">
        <button type="button" className="studio-button" onClick={() => setEditor(c)}>Editar</button><button type="button" className="tool-text-button" disabled={c.locked} onClick={() => { setError(""); setRemoving(c); }}>Excluir</button>
      </div></div>)}
      {error && !removing && <div role="alert"><p className="studio-error">{error}</p><button type="button" className="tool-text-button" onClick={() => void load()}>Tentar novamente</button></div>}
    </div>
    {editor && <ToolCredentialDialog credential={editor === "new" ? undefined : editor} onClose={() => setEditor(null)} onSaved={(c) => { setItems((all) => [...all.filter((o) => o.id !== c.id), c]); setEditor(null); }} />}
    {removing && <Modal title="Excluir credencial" onClose={() => { if (!busy) setRemoving(null); }}>
      <p>Excluir a conexão “{removing.name}”? Os agentes que usam esta conta perderão o acesso.</p>
      {error && <p className="studio-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="studio-button" disabled={busy} onClick={() => setRemoving(null)}>Cancelar</button><button type="button" className="studio-button destructive" disabled={busy} onClick={() => void remove()}>{busy ? "Excluindo…" : "Excluir credencial"}</button></div>
    </Modal>}
  </section>;
}
