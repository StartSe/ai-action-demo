// Os formatos que as abas do painel de um treino compartilham (US-022, US-023).
//
// Cada aba é um arquivo, e todas mostram nota: a régua de cor ("verde a partir de 7") tem de ser a
// mesma na barra de competência da visão geral e na coluna da tabela da equipe. Duas cópias
// divergiriam sem que lint, build ou teste falhassem — as duas continuariam corretas isoladamente.

/** Número com vírgula, do jeito que se lê em português. */
export function nota(valor: number | null): string {
  return valor === null ? "—" : valor.toFixed(1).replace(".", ",");
}

export function contagem(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Verde a partir de 7, âmbar a partir de 5, vermelho abaixo disso — a mesma régua nos números e nas barras. */
export function tomDaNota(valor: number | null): "ok" | "warn" | "danger" | "neutro" {
  if (valor === null) return "neutro";
  if (valor >= 7) return "ok";
  if (valor >= 5) return "warn";
  return "danger";
}

export const PREENCHIMENTO: Record<string, string> = { ok: "fill-ok", warn: "fill-warn", danger: "fill-danger", neutro: "fill-accent" };

/** Texto sem acento e sem maiúscula, para a busca achar "Ana Sousa" digitando "ana sousa". */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
