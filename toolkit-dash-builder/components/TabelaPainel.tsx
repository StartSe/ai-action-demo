"use client";
// Tabela do painel. Na tela, embrulha o DataTable de ui.tsx (linhas no desktop, blocos no celular) e oferece
// "Copiar dados da tabela" (CSV com ";" e vírgula decimal). Em modo impressão, um <table> próprio e simples
// ocupando a linha inteira da grade: na largura do A4 o DataTable cai no modo cartão e pagina uma linha por página.
import { useState } from "react";
import { Aviso, DataTable, type Coluna } from "./ui";
import { csvDaTabela, formatarCelula } from "@/lib/formatar";
import type { ColunaTabela, ComponentePainel } from "@/lib/types";

type Tabela = Extract<ComponentePainel, { tipo: "tabela" }>;
type Linha = Record<string, string | number>;

const numerica = (tipo: ColunaTabela["tipo"]) => tipo === "numero" || tipo === "moeda" || tipo === "percentual";

export function TabelaPainel({ componente, modo }: { componente: Tabela; modo: "tela" | "impressao" }) {
  const [aviso, setAviso] = useState<"ok" | "falha" | null>(null);
  const { colunas, linhas } = componente.dados;

  if (modo === "impressao") {
    return (
      <table className="painel-tabela-impressa">
        <thead>
          <tr>{colunas.map((c) => <th key={c.chave} className={numerica(c.tipo) ? "num" : undefined}>{c.rotulo}</th>)}</tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>{colunas.map((c) => <td key={c.chave} className={numerica(c.tipo) ? "num" : undefined}>{formatarCelula(l[c.chave], c.tipo)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    );
  }

  const primeiraTexto = colunas.find((c) => c.tipo === "texto") ?? colunas[0];
  const definicao: Coluna<Linha>[] = colunas.map((c) => ({
    chave: c.chave,
    titulo: c.rotulo,
    papel: c.chave === primeiraTexto.chave ? "titulo" : undefined,
    classe: numerica(c.tipo) ? "text-right whitespace-nowrap" : undefined,
    render: (l) => (c.chave === primeiraTexto.chave ? <strong>{formatarCelula(l[c.chave], c.tipo)}</strong> : formatarCelula(l[c.chave], c.tipo)),
  }));

  async function copiar() {
    try {
      await navigator.clipboard.writeText(csvDaTabela(componente));
      setAviso("ok");
    } catch {
      setAviso("falha");
    }
    setTimeout(() => setAviso(null), 3500);
  }

  return (
    <div className="flex flex-col gap-3">
      <DataTable colunas={definicao} linhas={linhas} />
      <div className="no-print flex items-center gap-3 flex-wrap">
        <button type="button" className="btn-link text-[13px]" onClick={copiar}>Copiar dados da tabela</button>
        {aviso === "ok" && <span className="text-[12.5px] text-ok font-semibold">Copiado. Cole na planilha.</span>}
      </div>
      {aviso === "falha" && <Aviso tom="danger">Não foi possível copiar automaticamente. Selecione a tabela e copie com Ctrl+C (ou Cmd+C no Mac).</Aviso>}
    </div>
  );
}
