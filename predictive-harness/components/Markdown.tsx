"use client";
import type { ReactNode } from "react";
// Renderização mínima do que o LLM devolve: parágrafos, **negrito**, `código`, listas e tabelas com |.
function inline(texto: string): ReactNode[] {
  const partes = texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return partes.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith("`") && p.endsWith("`") ? <code key={i}>{p.slice(1, -1)}</code> : p));
}
function celulas(linha: string) {
  return linha.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}
export function Markdown({ texto }: { texto: string }) {
  const blocos = texto.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <>
      {blocos.map((bloco, i) => {
        const linhas = bloco.split("\n").filter((l) => l.trim() !== "");
        if (!linhas.length) return null;
        if (linhas.every((l) => l.trim().startsWith("|"))) {
          const corpo = linhas.filter((l) => !/^\|?\s*:?-{2,}/.test(l.trim()));
          const [cab, ...resto] = corpo.map(celulas);
          return (
            <table key={i}>
              <thead>
                <tr>{cab.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr>
              </thead>
              <tbody>
                {resto.map((r, j) => (
                  <tr key={j}>{r.map((c, k) => <td key={k}>{inline(c)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          );
        }
        if (linhas.every((l) => /^\s*[-*•]\s+/.test(l))) return <ul key={i}>{linhas.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>)}</ul>;
        if (linhas.every((l) => /^\s*\d+[.)]\s+/.test(l))) return <ol key={i}>{linhas.map((l, j) => <li key={j}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>)}</ol>;
        const texto = linhas.join(" ").replace(/^#+\s*/, "");
        return (
          <p key={i} className={/^base:/i.test(texto) ? "base" : undefined}>
            {inline(texto)}
          </p>
        );
      })}
    </>
  );
}
