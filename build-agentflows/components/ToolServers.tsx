"use client";
import { useCallback, useEffect, useState } from "react";
import { request } from "./StudioUI";
type Server = { prefixo: string; nome: string; url: string; autorizado: boolean };
export function ToolServers({ onChange }: { onChange?: () => void }) {
  const [servers, setServers] = useState<Server[]>([]), [draft, setDraft] = useState({ nome: "", url: "", codigo: "" });
  const [editing, setEditing] = useState(""), [removing, setRemoving] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const refresh = useCallback(async () => { setServers(await request<Server[]>("/api/conexoes/mcp")); }, []);
  useEffect(() => { const timer = setTimeout(() => void refresh().catch(() => setError("Não foi possível consultar os servidores.")), 0); return () => clearTimeout(timer); }, [refresh]);
  async function act(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); await refresh(); onChange?.(); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível concluir."); } finally { setBusy(false); }
  }
  return <div className="tool-servers">
    <p>Conecte um servidor uma vez e escolha suas ferramentas em quantos agentes precisar.</p>
    {error && <p className="studio-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {servers.map((s) => <section key={s.prefixo} className="tool-server-row">
      <strong>{s.nome}</strong><small>{s.url}</small>
      <div className="studio-actions">
        <a className="studio-button" href={`/api/conexoes/mcp/${s.prefixo}`} target="_blank" rel="noreferrer">{s.autorizado ? "Reautorizar" : "Autorizar"}</a>
        <button type="button" className="studio-button" disabled={busy} onClick={() => { setEditing(s.prefixo); setDraft({ nome: s.nome, url: s.url, codigo: "" }); }}>Editar</button>
        <button type="button" className="studio-button" disabled={busy} onClick={() => void act(async () => { const r = await request<{ ok: boolean; mensagem: string }>("/api/conexoes/testar", "POST", { id: "mcp:" + s.prefixo }); if (!r.ok) throw new Error(r.mensagem); setNotice(r.mensagem); })}>Testar</button>
        <button type="button" className="studio-button danger" disabled={busy} onClick={() => setRemoving(s.prefixo)}>Remover</button>
      </div>
      {removing === s.prefixo && <div><p>Remover este servidor interrompe seu uso em todos os agentes.</p><button type="button" className="studio-button danger" disabled={busy} onClick={() => void act(async () => { await request(`/api/conexoes/mcp/${s.prefixo}`, "DELETE"); setRemoving(""); setNotice("Servidor removido."); })}>Confirmar remoção</button><button type="button" className="studio-button" onClick={() => setRemoving("")}>Cancelar</button></div>}
    </section>)}
    <div className="node-fields">
      <h4>{editing ? "Editar servidor" : "Adicionar servidor"}</h4>
      <label>Nome<input value={draft.nome} maxLength={60} onChange={(e) => setDraft({ ...draft, nome: e.target.value })} /></label>
      <label>Endereço<input type="url" value={draft.url} placeholder="https://seu-servico/mcp" onChange={(e) => setDraft({ ...draft, url: e.target.value })} /></label>
      <label>Código de acesso (opcional)<input type="password" autoComplete="off" value={draft.codigo} placeholder={editing ? "Em branco mantém a autorização" : "Ou autorize depois de adicionar"} onChange={(e) => setDraft({ ...draft, codigo: e.target.value })} /></label>
      <div className="studio-actions">
        {editing && <button type="button" className="studio-button" onClick={() => { setEditing(""); setDraft({ nome: "", url: "", codigo: "" }); }}>Cancelar edição</button>}
        <button type="button" className="studio-button primary" disabled={busy || !draft.nome.trim() || !draft.url.trim()} onClick={() => void act(async () => {
          await request(editing ? `/api/conexoes/mcp/${editing}` : "/api/conexoes/mcp", editing ? "PUT" : "POST", draft);
          setEditing(""); setDraft({ nome: "", url: "", codigo: "" }); setNotice("Servidor salvo.");
        })}>{editing ? "Salvar servidor" : "Adicionar servidor"}</button>
      </div>
    </div>
  </div>;
}
