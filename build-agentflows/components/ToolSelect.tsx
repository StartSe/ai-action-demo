"use client";
import { useEffect, useId, useRef, useState } from "react";
import { AGENT_TOOL_CATALOG, toolIcon } from "@/lib/tool-presentation";
import { Icon } from "./StudioUI";
export function ToolLogo({ id }: { id: string }) {
  const src = toolIcon(id);
  // Assets locais dos serviços, sem chamadas externas ao abrir o editor.
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className="tool-logo" src={src} alt="" width={24} height={24} /> : <Icon name="tool" size={24} />;
}
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function ToolSelect({ value, used = [], catalog = AGENT_TOOL_CATALOG, disabled = false, onChange }: {
  value: string; used?: string[]; catalog?: { id: string; name: string }[]; disabled?: boolean; onChange: (id: string) => void;
}) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [active, setActive] = useState(0);
  const selected = catalog.find((item) => item.id === value);
  const options = catalog.filter((item) => normalize(item.name).includes(normalize(query)) && (!used.includes(item.id) || item.id === value));
  useEffect(() => { if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" }); }, [id, active, open]);
  function choose(target: string) { onChange(target); setOpen(false); setQuery(""); input.current?.focus(); }
  return <div className="tool-select" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setQuery(""); } }}>
    <div className="tool-select-input">
      <ToolLogo id={value} />
      <input ref={input} disabled={disabled} role="combobox" aria-label="Ferramenta" aria-expanded={open} aria-controls={id} aria-autocomplete="list" aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined}
        value={open ? query : selected?.name || (value ? "Ferramenta anterior" : "")} placeholder={open ? "Buscar ferramenta…" : "Selecione uma ferramenta"}
        onFocus={() => { setOpen(true); setQuery(""); setActive(0); }} onClick={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); setQuery(""); }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive((index) => Math.max(0, Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))); }
          if (event.key === "Enter" && open) { event.preventDefault(); if (options[active]) choose(options[active].id); }
        }} />
      <button type="button" disabled={disabled} aria-label={open ? "Fechar lista" : "Abrir lista"} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (open) setOpen(false); else { input.current?.focus(); setOpen(true); } }}><Icon name="chevron" size={16} /></button>
    </div>
    {open && <div id={id} role="listbox" aria-label="Ferramentas" className="tool-select-options">
      {options.map((item, index) => <button id={`${id}-${index}`} key={item.id} type="button" role="option" aria-selected={item.id === value} className={index === active ? "active" : ""} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(item.id)}><ToolLogo id={item.id} /><span>{item.name}</span>{item.id === value && <Icon name="check" size={16} />}</button>)}
      {!options.length && <p>Nenhuma ferramenta encontrada.</p>}
    </div>}
  </div>;
}
