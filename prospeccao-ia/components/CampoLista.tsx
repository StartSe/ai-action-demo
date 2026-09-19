"use client";
// Campo de chips compartilhado por ICPForm.tsx (US-006) e ProdutoComIA.tsx (US-007): digitar e apertar
// Enter (ou "Adicionar") acrescenta um item; cada chip tem um botão próprio de remover.
import { useState, type KeyboardEvent } from "react";
import { Chip, Field } from "@/components/ui";

export function CampoLista({
  id,
  label,
  hint,
  placeholder,
  valores,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  placeholder: string;
  valores: string[];
  onChange: (v: string[]) => void;
}) {
  const [texto, setTexto] = useState("");

  function adicionar() {
    const v = texto.trim();
    if (!v || valores.includes(v)) {
      setTexto("");
      return;
    }
    onChange([...valores, v]);
    setTexto("");
  }

  function aoTeclar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    adicionar();
  }

  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="flex gap-2">
        <input id={id} className="input" placeholder={placeholder} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={aoTeclar} />
        <button type="button" className="btn-secundario !w-auto shrink-0" onClick={adicionar}>Adicionar</button>
      </div>
      {valores.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {valores.map((v) => (
            <Chip key={v} nivel="neutral">
              <span className="inline-flex items-center gap-1.5">
                {v}
                <button type="button" aria-label={`Remover ${v}`} className="leading-none cursor-pointer" onClick={() => onChange(valores.filter((x) => x !== v))}>×</button>
              </span>
            </Chip>
          ))}
        </div>
      )}
    </Field>
  );
}
