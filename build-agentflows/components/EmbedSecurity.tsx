"use client";
import { useEffect, useState } from "react";
import { request } from "./StudioUI";
export function EmbedSecurity() {
  const [origins, setOrigins] = useState(""), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  useEffect(() => { let alive = true; void request<{ origins: string[] }>("/api/security/embed").then((s) => { if (alive) { setOrigins(s.origins.join("\n")); setReady(true); } }).catch((e) => { if (alive) setError(e.message); }); return () => { alive = false; }; }, []);
  async function save() {
    setBusy(true); setMessage(""); setError("");
    try { await request("/api/security/embed", "PUT", { origins: origins.split(/\n/).map((v) => v.trim()).filter(Boolean) }); setMessage("Sites autorizados salvos."); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  return <section className="connection-card">
    <header><div><h2>Segurança</h2><p>Controle em quais sites o chat pode aparecer.</p></div></header>
    <div className="connection-body node-fields">
      <label>Sites autorizados para o chat incorporado<textarea aria-label="Sites autorizados para o chat incorporado" rows={4} placeholder="https://app.exemplo.com" value={origins} disabled={!ready || busy} onChange={(e) => setOrigins(e.target.value)} /></label>
      <small>Um endereço completo por linha, sem caminhos. Esta lista limita os sites configurados em Implantar de cada fluxo. Em branco, valem apenas as permissões de cada fluxo.</small>
      <button className="studio-button primary" disabled={!ready || busy} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar sites autorizados"}</button>
      {message && <p role="status">{message}</p>}{error && <p className="studio-error" role="alert">{error}</p>}
    </div>
  </section>;
}
