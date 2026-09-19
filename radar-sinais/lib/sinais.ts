// Ordenação e resumo dos sinais para as telas (puro: sem imports node:*, usado no servidor e no cliente).
import { listarEmProsa } from "./fontes";
import { data } from "./formato";
import type { Radar, Sinal } from "./types";

const PESO_FORCA: Record<Sinal["forca"], number> = { alta: 3, media: 2, baixa: 1 };
const PESO_TENDENCIA: Record<Sinal["tendencia"], number> = { subindo: 3, estavel: 2, caindo: 1 };

/** Do mais relevante para o menos: força alta antes de média e baixa; dentro da mesma força, subindo antes
 * de estável e caindo; empate desfeito por quantidade de fontes e, por fim, pela ordem original. */
export function ordenarSinais(sinais: Sinal[]): Sinal[] {
  return sinais
    .map((s, i) => ({ s, i }))
    .sort((a, b) =>
      PESO_FORCA[b.s.forca] - PESO_FORCA[a.s.forca] ||
      PESO_TENDENCIA[b.s.tendencia] - PESO_TENDENCIA[a.s.tendencia] ||
      b.s.fontes.length - a.s.fontes.length ||
      a.i - b.i,
    )
    .map(({ s }) => s);
}

export type ResumoRadar = { total: number; fortes: number; subindo: number; leituras: number; frase: string };

/** Números que decidem, para o cabeçalho: "11 sinais · 3 fortes · 7 subindo · 3 leituras · últimos 30 dias". */
export function resumoRadar(radar: Pick<Radar, "sinais" | "conexoes" | "periodoDias">): ResumoRadar {
  const total = radar.sinais.length;
  const fortes = radar.sinais.filter((s) => s.forca === "alta").length;
  const subindo = radar.sinais.filter((s) => s.tendencia === "subindo").length;
  const leituras = radar.conexoes?.length ?? 0;
  const partes: string[] = [];
  if (total === 0) partes.push("Nenhum sinal");
  else {
    partes.push(`${total} ${total === 1 ? "sinal" : "sinais"}`);
    if (fortes) partes.push(`${fortes} ${fortes === 1 ? "forte" : "fortes"}`);
    if (subindo) partes.push(`${subindo} subindo`);
    if (leituras) partes.push(`${leituras} ${leituras === 1 ? "leitura" : "leituras"}`);
  }
  partes.push(`últimos ${radar.periodoDias} dias`);
  return { total, fortes, subindo, leituras, frase: partes.join(" · ") };
}

/** Linha de confiança abaixo do cabeçalho: de quantas evidências e de quais fontes o radar saiu, e quando. */
export function linhaConfianca(radar: Pick<Radar, "totalAchados" | "fontes">, geradoEm: string): string {
  const fontesOk = (radar.fontes ?? []).filter((f) => f.estado === "ok").map((f) => f.nome);
  const partes: string[] = [];
  if (typeof radar.totalAchados === "number") {
    const n = radar.totalAchados;
    partes.push(`${n} ${n === 1 ? "evidência" : "evidências"}${fontesOk.length ? ` de ${listarEmProsa(fontesOk)}` : ""}`);
  }
  partes.push(`atualizado em ${data(geradoEm, { comHora: true })}`);
  return partes.join(" · ");
}
