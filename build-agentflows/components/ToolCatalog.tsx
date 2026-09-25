"use client";
import { useState } from "react";
import type { ToolInfo } from "@/lib/tools";
import { Icon, Modal } from "./StudioUI";
import { toolTitle } from "@/lib/tool-presentation";

export function ToolCatalog({ tools, selected, onChoose, onServer, onClose }: {
  tools: ToolInfo[]; selected: string[]; onChoose: (id: string) => void; onServer: () => void; onClose: () => void;
}) {
  const [query, setQuery] = useState(""), [category, setCategory] = useState("");
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
  const shown = tools.filter((t) => (!category || t.category === category) && normalize(`${toolTitle(t)} ${t.name} ${t.description}`).includes(normalize(query)));
  return <Modal title="Adicionar ferramenta" onClose={onClose} className="tool-catalog-dialog">
    <p>Escolha o que este agente precisa fazer. Depois, conecte uma conta se necessário.</p>
    <div className="tool-catalog-filters node-fields">
      <label>Buscar ferramenta<input autoFocus type="search" value={query} placeholder="Ex.: pesquisar, e-mail ou planilha" onChange={(e) => setQuery(e.target.value)} /></label>
      <label>Categoria<select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Todas as categorias</option>
        {[...new Set(tools.map((t) => t.category).filter(Boolean))].map((c) => <option key={c} value={c}>{c}</option>)}
      </select></label>
    </div>
    <div className="tool-catalog-list">{shown.map((tool) => <button type="button" className="tool-catalog-item" key={tool.id} disabled={selected.includes(tool.id)} onClick={() => onChoose(tool.id)}>
      <span className="tool-card-icon"><Icon name="tool" size={20} /></span>
      <span><strong>{toolTitle(tool)}</strong><small>{tool.description}</small><em>{selected.includes(tool.id) ? "Já adicionada" : tool.credentialProvider ? "Usa uma conexão" : "Pronta para usar"}</em></span>
      <Icon name={selected.includes(tool.id) ? "check" : "plus"} size={18} />
    </button>)}</div>
    {!shown.length && <p role="status">Nenhuma ferramenta encontrada. Tente outro termo.</p>}
    <div className="tool-catalog-footer"><p>Seu serviço oferece uma conexão MCP?</p><button type="button" className="studio-button" onClick={onServer}><Icon name="link" size={16} />Conectar outro serviço</button></div>
  </Modal>;
}
