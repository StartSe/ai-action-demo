import assert from "node:assert/strict";
import test from "node:test";
import { radarDemo } from "../lib/demo";
import { linhaConfianca, ordenarSinais, resumoRadar } from "../lib/sinais";
import type { Sinal } from "../lib/types";

function sinal(id: string, forca: Sinal["forca"], tendencia: Sinal["tendencia"], fontes = 1): Sinal {
  return { id, titulo: id, resumo: "", forca, tendencia, temas: [], oQueFazer: "", fontes: Array.from({ length: fontes }, (_, i) => ({ titulo: `f${i}`, url: `https://x.test/${id}/${i}`, veiculo: "v", publicadoEm: "2026-09-01" })) };
}

test("ordenarSinais: força alta antes, depois tendência, depois nº de fontes, depois ordem original", () => {
  const ordem = ordenarSinais([
    sinal("baixa-subindo", "baixa", "subindo"),
    sinal("media-caindo", "media", "caindo", 3),
    sinal("alta-estavel", "alta", "estavel"),
    sinal("alta-subindo-1", "alta", "subindo", 1),
    sinal("media-subindo", "media", "subindo"),
    sinal("alta-subindo-2", "alta", "subindo", 2),
    sinal("alta-subindo-1b", "alta", "subindo", 1),
  ]).map((s) => s.id);
  assert.deepEqual(ordem, ["alta-subindo-2", "alta-subindo-1", "alta-subindo-1b", "alta-estavel", "media-subindo", "media-caindo", "baixa-subindo"]);
  assert.deepEqual(ordenarSinais([]), []);
});

test("resumoRadar: conta fortes, subindo e leituras; frase legível nos casos de borda", () => {
  const demo = radarDemo(30);
  const r = resumoRadar(demo);
  assert.equal(r.total, 11);
  assert.equal(r.fortes, 4);
  assert.equal(r.leituras, 3);
  assert.equal(r.frase, "11 sinais · 4 fortes · 9 subindo · 3 leituras · últimos 30 dias");
  assert.equal(resumoRadar({ sinais: [], conexoes: [], periodoDias: 7 }).frase, "Nenhum sinal · últimos 7 dias");
  assert.equal(resumoRadar({ sinais: [sinal("a", "baixa", "caindo")], conexoes: [], periodoDias: 90 }).frase, "1 sinal · últimos 90 dias");
});

test("linhaConfianca: evidências e fontes que responderam, com a data; sem achados só a data", () => {
  const texto = linhaConfianca(
    { totalAchados: 42, fontes: [{ id: "hackernews", nome: "Hacker News", estado: "ok" }, { id: "github", nome: "GitHub", estado: "ok" }, { id: "reddit", nome: "Reddit", estado: "indisponivel" }] },
    "2026-09-19T13:15:00.000Z",
  );
  assert.match(texto, /^42 evidências de Hacker News e GitHub · atualizado em \d{2}\/\d{2} às \d{2}:\d{2}$/);
  assert.match(linhaConfianca({}, "2026-09-19T13:15:00.000Z"), /^atualizado em /);
});
