// Monta e baixa o CSV classificado no navegador (Blob/URL, sem dependência nova — mesmo espírito de
// financas-ia/lib/exportar-planilha.ts, mas em CSV puro em vez de .xlsx).
import type { LancamentoClassificado } from "./types";

function celula(v: string | number): string {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function montarCsvClassificado(lancamentos: LancamentoClassificado[]): string {
  const cabecalho = ["Data", "Descrição", "Valor", "Categoria sugerida", "Confiança", "Revisar", "Citações do histórico", "Justificativa"];
  const linhas = lancamentos.map((l) =>
    [
      l.data,
      l.descricao,
      l.valor.toFixed(2).replace(".", ","),
      l.categoriaSugerida ?? "",
      l.revisar ? "" : l.confianca,
      l.revisar ? "sim" : "não",
      l.citacoes.join(" | "),
      l.justificativa,
    ]
      .map(celula)
      .join(";")
  );
  return [cabecalho.map(celula).join(";"), ...linhas].join("\r\n");
}

export function baixarCsvClassificado(lancamentos: LancamentoClassificado[], nomeArquivoNovos: string): void {
  const csv = montarCsvClassificado(lancamentos);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeArquivoNovos.replace(/\.csv$/i, "")}-classificado.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
