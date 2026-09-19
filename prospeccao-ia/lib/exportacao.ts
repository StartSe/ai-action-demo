/**
 * Exportação CSV do workspace (US-037): BOM UTF-8 + separador `;` (o separador de lista do português —
 * com vírgula, o Excel brasileiro põe a linha inteira numa célula), mesmo formato já usado pelo
 * `exportarCSV` do modelo antigo (`app/page.tsx`), agora genérico o bastante para `/leads` e
 * `/prospeccoes/[id]` reaproveitarem em vez de duplicar o Blob/download.
 */
export function baixarCSV(cabecalho: string[], linhas: string[][], nomeArquivo: string) {
  const linha = (campos: string[]) => campos.map((c) => `"${c.replace(/"/g, '""')}"`).join(";");
  const csv = "﻿" + [linha(cabecalho), ...linhas.map(linha)].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
