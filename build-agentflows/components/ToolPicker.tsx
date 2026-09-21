"use client";
import { useCallback, useEffect, useState } from "react";
import type { ToolGroup, ToolInfo } from "@/lib/tools";
import { Icon, request } from "./StudioUI";
import { ToolServers } from "./ToolServers";
export function ToolPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [groups, setGroups] = useState<ToolGroup[] | null>(null), [query, setQuery] = useState("");
  const [setup, setSetup] = useState<ToolInfo | null>(null), [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [remove, setRemove] = useState(false);
  const selected = value.split(",").map((v) => v.trim()).filter(Boolean).map((v) => v.includes(":") ? v : "mcp:FERRAMENTAS:" + v);
  const refresh = useCallback(async () => {
    try { setGroups(await request<ToolGroup[]>("/api/tools")); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível consultar as ferramentas."); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void refresh(), 0); const focus = () => void refresh(); window.addEventListener("focus", focus); return () => { clearTimeout(timer); window.removeEventListener("focus", focus); }; }, [refresh]);
  function toggle(id: string) { onChange((selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]).join(",")); }
  function configure(tool: ToolInfo) { setSetup(tool); setRemove(false); setDraft(Object.fromEntries((tool.credentials || []).filter((c) => !c.secret && c.valor).map((c) => [c.chave, c.valor!]))); setNotice(""); }
  async function save(deleting = false) {
    if (!setup) return;
    setBusy(true); setError("");
    try {
      const campos = deleting ? Object.fromEntries((setup.credentials || []).map((c) => [c.chave, null])) : Object.fromEntries(Object.entries(draft).filter(([, v]) => v.trim()));
      setGroups(await request<ToolGroup[]>("/api/tools", "PUT", { campos }));
      if (!deleting && !selected.includes(setup.id)) onChange([...selected, setup.id].join(","));
      setNotice(deleting ? "Credencial compartilhada removida." : "Credencial salva e disponível para todos os agentes.");
      setSetup(null); setDraft({});
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar a credencial."); }
    finally { setBusy(false); }
  }
  const known = new Set((groups || []).flatMap((g) => g.tools.map((t) => t.id)));
  return <div className="tool-picker">
    <p>Selecione as ferramentas deste agente. As credenciais são compartilhadas entre agentes e fluxos.</p>
    <input aria-label="Buscar ferramentas" placeholder="Buscar ferramenta…" value={query} onChange={(e) => setQuery(e.target.value)} />
    <small>{selected.length} ferramenta(s) selecionada(s)</small>
    {error && <p className="studio-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {setup && <section className="tool-setup" aria-label={`Configurar ${setup.label || setup.name}`}>
      <h4>Configurar {setup.label || setup.name}</h4><p>{setup.description}</p>
      {(setup.credentials || []).map((c) => <label key={c.chave}>{c.rotulo}
        <input type={c.secret ? "password" : "text"} autoComplete="off" placeholder={c.definido ? "Já salva · em branco mantém" : undefined} value={draft[c.chave] || ""} onChange={(e) => setDraft({ ...draft, [c.chave]: e.target.value })} />
        {(c.ajuda || c.link) && <small>{c.ajuda} {c.link && <a href={c.link} target="_blank" rel="noreferrer">Onde obter</a>}</small>}
      </label>)}
      <p>Alterar ou remover esta credencial afeta todos os agentes que usam esta conta.</p>
      {remove && <p role="alert">Os agentes deixarão de acessar este serviço até uma nova credencial ser salva.</p>}
      <div className="studio-actions">
        <button type="button" className="studio-button" disabled={busy} onClick={() => setSetup(null)}>Cancelar</button>
        {setup.credentials?.some((c) => c.definido) && <button type="button" className="studio-button danger" disabled={busy} onClick={() => remove ? void save(true) : setRemove(true)}>{remove ? "Confirmar remoção" : "Remover credencial"}</button>}
        <button type="button" className="studio-button primary" disabled={busy || (setup.credentials || []).some((c) => !c.optional && !c.definido && !draft[c.chave]?.trim())} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar e usar"}</button>
      </div>
    </section>}
    {!groups && !error && <small>Consultando ferramentas…</small>}
    {groups?.map((g) => <section className="tool-group" key={g.id}>
      <h4>{g.name}</h4>
      {g.error && <p className="tool-group-error">{g.error}</p>}
      {[...new Set(g.tools.map((t) => t.category || ""))].map((category) => {
        const list = g.tools.filter((t) => (t.category || "") === category && `${t.label || t.name} ${t.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
        return list.length ? <div className="tool-category" key={category}>
          {category && <h5>{category}</h5>}
          <div className="tool-choices">{list.map((t) => <div className="tool-choice" key={t.id}>
            <button type="button" aria-pressed={selected.includes(t.id)} className={selected.includes(t.id) ? "active" : ""} title={t.description} onClick={() => t.configured === false && !selected.includes(t.id) ? configure(t) : toggle(t.id)}>
              <Icon name={selected.includes(t.id) ? "check" : t.configured === false ? "settings" : "plus"} size={13} />{t.label || t.name}
              {t.configured === false && <small>Configurar</small>}
            </button>
            {!!t.credentials?.length && <button type="button" aria-label={`Credenciais de ${t.label || t.name}`} title="Gerenciar credencial compartilhada" onClick={() => configure(t)}><Icon name="settings" size={13} /></button>}
          </div>)}</div>
        </div> : null;
      })}
    </section>)}
    {groups && !groups.some((g) => g.tools.some((t) => `${t.label || t.name} ${t.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))) && <p>Nenhuma ferramenta encontrada.</p>}
    {groups && selected.filter((s) => !known.has(s)).map((s) => <button key={s} type="button" className="studio-button" onClick={() => toggle(s)}>Remover ferramenta indisponível: {s.split(":").pop()}</button>)}
    <details className="tool-server-details"><summary>Gerenciar servidores de ferramentas</summary><ToolServers onChange={refresh} /></details>
  </div>;
}
