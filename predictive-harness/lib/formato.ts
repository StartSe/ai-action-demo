// Formatação de números em português do Brasil, usada no servidor (narrativa, fórmula) e na tela.
export const fmtBRL = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
export const fmtNum = (n: number, casas = 0) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: 0 });
/** Percentual já em pontos (31,2 → "31,2%"). */
export const fmtPctPontos = (p: number, casas = 1) => p.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: 0 }) + "%";
/** Diferença em pontos percentuais com sinal (1,8 → "+1,8 p.p."). */
export const fmtPp = (d: number) => (d > 0 ? "+" : d < 0 ? "−" : "") + Math.abs(d).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " p.p.";
export const fmtAssinado = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmtBRL(Math.abs(n)).replace("R$ ", "R$ ");
export const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-03" → "mar/2026". */
export function fmtMes(iso: string) {
  const [ano, mes] = iso.split("-");
  const i = Number(mes) - 1;
  return i >= 0 && i < 12 ? `${MESES_CURTOS[i]}/${ano}` : iso;
}
/** Moeda compacta para rótulos de gráfico: "R$ 126 mil", "R$ 1,2 mi", "R$ 850". */
export function fmtBRLCurto(n: number) {
  const a = Math.abs(n);
  const sinal = n < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sinal}R$ ${(a / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 10_000) return `${sinal}R$ ${Math.round(a / 1000).toLocaleString("pt-BR")} mil`;
  if (a >= 1_000) return `${sinal}R$ ${(a / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `${sinal}R$ ${Math.round(a).toLocaleString("pt-BR")}`;
}
