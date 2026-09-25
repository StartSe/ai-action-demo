"use client";
import { useState } from "react";
import type { ToolInfo } from "@/lib/tools";
import type { SavedToolCredential } from "@/lib/tool-credential-store";
import { ToolCredentialDialog } from "./ToolCredentialDialog";

export function ToolCredentialFields({ tool, credentialId, credentials, onChange, onSaved }: {
  tool: ToolInfo; credentialId?: string; credentials: SavedToolCredential[];
  onChange: (id: string) => void; onSaved: (credential: SavedToolCredential) => void;
}) {
  const [editor, setEditor] = useState<"new" | "edit" | null>(null);
  const available = credentials.filter((c) => c.provider === tool.credentialProvider);
  const id = credentialId || available.find((c) => c.legacy)?.id || "";
  const selected = available.find((c) => c.id === id);
  if (!tool.credentialProvider) return <p className="tool-ready">Pronta para usar. Não precisa conectar uma conta.</p>;
  return <div className="tool-credential-fields">
    <label>Conexão para esta ferramenta<select value={id} onChange={(event) => event.target.value === "new" ? setEditor("new") : onChange(event.target.value)}>
      <option value="" disabled>Escolha uma credencial</option>
      {available.map((c) => <option key={c.id} value={c.id}>{c.name}{!c.configured ? " · revisar conexão" : ""}</option>)}
      {!!id && !selected && <option value={id}>Credencial indisponível</option>}
      <option value="new">+ Criar nova credencial</option>
    </select></label>
    <div className="studio-actions">
      <button type="button" className="tool-text-button" onClick={() => setEditor("new")}>Nova credencial</button>
      {selected && <button type="button" className="tool-text-button" onClick={() => setEditor("edit")}>Ver ou editar conexão</button>}
    </div>
    {id && !selected && <p className="studio-error" role="alert">Esta credencial não está disponível. Escolha outra conexão.</p>}
    <small>A conta escolhida será usada por esta ferramenta neste agente.</small>
    {editor && <ToolCredentialDialog provider={tool.credentialProvider} credential={editor === "edit" ? selected : undefined} onClose={() => setEditor(null)} onSaved={(c) => { onSaved(c); onChange(c.id); setEditor(null); }} />}
  </div>;
}
