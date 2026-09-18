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

/**
 * Reais inteiros, sem centavos: `5500` vira "R$ 5.500".
 *
 * A faixa salarial de uma vaga é digitada e guardada em reais cheios (US-005) — centavos num salário
 * anunciado só ocupam espaço e ninguém negocia por eles.
 */
export function moeda(valor: number) {
  return `R$ ${numero(Math.round(valor))}`;
}

/**
 * A faixa salarial de uma vaga, do jeito que toda tela a diz.
 *
 * Mora aqui, e não em `components/FormularioVaga.tsx` (de onde veio), porque a entrevistadora
 * também precisa dela: `lib/roteiro.ts` é código de servidor e importar um client component para
 * reaproveitar a frase arrastaria a fronteira de cliente junto. Lista, página da vaga, formulário e
 * entrevista têm de dizer a MESMA coisa sobre a mesma vaga.
 *
 * Uma faixa pela metade continua sendo informação: "A partir de R$ 5.500" diz mais que "A combinar".
 */
export function faixaSalarial(vaga: { salarioACombinar: boolean; salarioMin?: number; salarioMax?: number }): string {
  if (vaga.salarioACombinar || (!vaga.salarioMin && !vaga.salarioMax)) return "A combinar";
  if (vaga.salarioMin && vaga.salarioMax) return `${moeda(vaga.salarioMin)} a ${moeda(vaga.salarioMax)}`;
  if (vaga.salarioMin) return `A partir de ${moeda(vaga.salarioMin)}`;
  return `Até ${moeda(vaga.salarioMax as number)}`;
}

/**
 * Há quanto tempo, em dias: "hoje", "ontem", "há 5 dias".
 *
 * A tela Entrevistas (US-015) acompanha espera, não agenda: quem olha a lista quer saber quantos dias
 * um convite está parado, e "18/09" obriga a fazer essa conta de cabeça. A data exata continua ao
 * lado, no atributo `title` de quem mostra isto.
 */
export function haDias(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  // Pela virada do dia, não por 24 horas: ontem às 23h é "ontem", não "hoje".
  const inicio = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((inicio(new Date()) - inicio(dt)) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${numero(dias)} dias`;
}
