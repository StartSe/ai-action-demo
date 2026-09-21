// Formatação em pt-BR dos números do painel e montagem do CSV para copiar.
// Sem import node:*: é lido tanto por app/page.tsx (cliente) quanto pelos Server Components de /r e /imprimir.
import { data } from "./formato";
import type { ColunaTabela, ComponentePainel, EspecPainel, Formato } from "./types";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const MOEDA_COMPACTA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 });
const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const NUMERO_COMPACTO = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** O compacto do Intl usa espaço NÃO separável, que estoura coluna estreita (ver financas-ia). */
const semEspacoDuro = (s: string) => s.replace(/[  ]/g, " ");

export function formatar(valor: number, formato: Formato, compacto = false): string {
  const v = Number.isFinite(valor) ? valor : 0;
  switch (formato) {
    case "moeda":
      return semEspacoDuro((compacto ? MOEDA_COMPACTA : MOEDA).format(v));
    case "percentual":
      return semEspacoDuro(PERCENTUAL.format(v / 100));
    default:
      return semEspacoDuro((compacto ? NUMERO_COMPACTO : NUMERO).format(v));
  }
}

/** Variação percentual contra o período anterior, com o caso anterior === 0 tratado. */
export function variacao(valor: number, anterior: number): number {
  if (anterior === 0) return valor > 0 ? 100 : 0;
  return ((valor - anterior) / Math.abs(anterior)) * 100;
}

/** "+12,4%" / "-3,0%" / "0,0%": a variação já com sinal, para o cartão de indicador. */
export function variacaoTexto(v: number): string {
  const sinal = v > 0 ? "+" : "";
  return `${sinal}${v.toFixed(1).replace(".", ",")}%`;
}

/** Cor da variação, respeitando direcaoBoa: cair é bom em cancelamento, custo, tempo. */
export function tomDaVariacao(v: number, direcaoBoa: "aumentar" | "diminuir" = "aumentar") {
  if (Math.abs(v) < 0.05) return "neutro" as const;
  const bom = direcaoBoa === "aumentar" ? v > 0 : v < 0;
  return bom ? ("ok" as const) : ("danger" as const);
}

/**
 * Coluna de tabela do tipo "data" (AAAA-MM-DD). `new Date("2026-07-15")` é meia-noite UTC e, no fuso
 * do Brasil, mostra 14/07 — armadilha US-070 do CLAUDE.md do pdi-time. Com "T00:00:00" vira hora local.
 * Valor que não casa o formato é devolvido como texto, sem tentar interpretar.
 */
export function formatarData(valor: string | number): string {
  const texto = String(valor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  return data(new Date(`${texto}T00:00:00`), { comAno: true });
}

/** Valor de uma célula de tabela, conforme o tipo da coluna. */
export function formatarCelula(valor: string | number | undefined, tipo: ColunaTabela["tipo"]): string {
  if (valor === undefined || valor === null || valor === "") return "—";
  if (tipo === "data") return formatarData(valor);
  if (tipo === "texto") return String(valor);
  const n = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
  if (!Number.isFinite(n)) return String(valor);
  return formatar(n, tipo);
}

const MESES_CURTOS: Record<string, string> = {
  janeiro: "jan", fevereiro: "fev", marco: "mar", abril: "abr", maio: "mai", junho: "jun",
  julho: "jul", agosto: "ago", setembro: "set", outubro: "out", novembro: "nov", dezembro: "dez",
};

/** Rótulo curto para o celular: "Janeiro" vira "jan", "Ana Silva" vira "Ana"; o texto completo fica no title. */
export function rotuloCurto(rotulo: string): string {
  const limpo = rotulo.trim();
  const chave = limpo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (MESES_CURTOS[chave]) return MESES_CURTOS[chave];
  const primeira = limpo.split(/\s+/)[0];
  return primeira.length > 8 ? `${primeira.slice(0, 7)}…` : primeira;
}

// ---- CSV para copiar (separador ";" e decimal com vírgula, como o Excel em português) ----

const celulaCsv = (v: string | number | undefined): string => {
  if (typeof v === "number") return String(v).replace(".", ",");
  const texto = String(v ?? "");
  return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

/** CSV de um componente do tipo tabela: cabeçalho com os rótulos das colunas e uma linha por registro. */
export function csvDaTabela(c: Extract<ComponentePainel, { tipo: "tabela" }>): string {
  const cabecalho = c.dados.colunas.map((col) => celulaCsv(col.rotulo)).join(";");
  const linhas = c.dados.linhas.map((l) => c.dados.colunas.map((col) => celulaCsv(l[col.chave])).join(";"));
  return [cabecalho, ...linhas].join("\n");
}

/** CSV com todos os números do painel: indicadores, séries, fatias e tabelas, um bloco por componente. */
export function csvDoPainel(painel: EspecPainel): string {
  const blocos: string[] = [];
  for (const c of painel.componentes) {
    switch (c.tipo) {
      case "indicador":
        blocos.push(`${celulaCsv(c.titulo)};Valor;Anterior\n;${celulaCsv(c.dados.valor)};${celulaCsv(c.dados.anterior)}`);
        break;
      case "linha":
      case "area":
      case "barra":
        blocos.push(`${celulaCsv(c.titulo)}\n${celulaCsv(c.dados.eixoX)};${celulaCsv(c.dados.eixoY)}\n${c.dados.pontos.map((p) => `${celulaCsv(p.rotulo)};${celulaCsv(p.valor)}`).join("\n")}`);
        break;
      case "pizza":
      case "rosca":
        blocos.push(`${celulaCsv(c.titulo)}\nFatia;Valor\n${c.dados.fatias.map((f) => `${celulaCsv(f.rotulo)};${celulaCsv(f.valor)}`).join("\n")}`);
        break;
      case "tabela":
        blocos.push(`${celulaCsv(c.titulo)}\n${csvDaTabela(c)}`);
        break;
    }
  }
  return blocos.join("\n\n");
}

/** Texto corrido do painel para "Copiar texto" e "Enviar por e-mail" do Entregar. */
export function painelParaTexto(painel: EspecPainel): string {
  const linhas: string[] = [painel.titulo, painel.resumo, `Setor: ${painel.setor}`, ""];
  for (const c of painel.componentes) {
    switch (c.tipo) {
      case "indicador":
        linhas.push(`${c.titulo}: ${formatar(c.dados.valor, c.dados.formato)} (anterior ${formatar(c.dados.anterior, c.dados.formato)}, ${variacaoTexto(variacao(c.dados.valor, c.dados.anterior))})`);
        break;
      case "linha":
      case "area":
      case "barra":
        linhas.push(`${c.titulo}: ${c.dados.pontos.map((p) => `${p.rotulo} ${formatar(p.valor, c.dados.formato, true)}`).join(", ")}`);
        break;
      case "pizza":
      case "rosca":
        linhas.push(`${c.titulo}: ${c.dados.fatias.map((f) => `${f.rotulo} ${formatar(f.valor, c.dados.formato, true)}`).join(", ")}`);
        break;
      case "tabela":
        linhas.push(`${c.titulo}:`);
        for (const l of c.dados.linhas) linhas.push(`  ${c.dados.colunas.map((col) => `${col.rotulo}: ${formatarCelula(l[col.chave], col.tipo)}`).join(" · ")}`);
        break;
    }
  }
  linhas.push("", "Números de exemplo, gerados para validar o formato do painel.");
  return linhas.join("\n");
}
