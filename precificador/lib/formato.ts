/** Helpers de formatação pt-BR. Arquivo sem "use client": pode ser chamado tanto de Server quanto de Client Components. */

/** Formata número no padrão pt-BR (vírgula decimal), com `casas` dígitos após a vírgula. */
export function numero(n: number, casas = 0) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(n);
}

/** Formata data no padrão pt-BR; inclui o ano quando `comAno` ou fora do ano corrente, e a hora quando `comHora`. */
export function data(d: Date | string, { comHora = false, comAno = false }: { comHora?: boolean; comAno?: boolean } = {}) {
  const dt = typeof d === "string" ? new Date(d) : d;
  const opcoes: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" };
  if (comAno || dt.getFullYear() !== new Date().getFullYear()) opcoes.year = "numeric";
  let texto = new Intl.DateTimeFormat("pt-BR", opcoes).format(dt);
  if (comHora) texto += ` às ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(dt)}`;
  return texto;
}

/** Dinheiro em reais. O app inteiro mostra duas casas: preço de item é centavo, não arredondamento. */
export function moeda(n: number, { casas = 2 }: { casas?: number } = {}) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas }).format(n);
}

/** Fração (0,215) vira percentual ("21,5%"). Uma casa basta para margem; zero para taxa redonda. */
export function percentual(fracao: number, casas = 1) {
  if (!Number.isFinite(fracao)) return "—";
  return `${numero(fracao * 100, casas)}%`;
}

/** Quantidade com a unidade colada, do jeito que a ficha escreve: "120 g", "1,5 kg". */
export function quantidade(n: number, unidade: string) {
  const casas = Number.isInteger(n) ? 0 : 2;
  return `${numero(n, casas)} ${unidade}`;
}
