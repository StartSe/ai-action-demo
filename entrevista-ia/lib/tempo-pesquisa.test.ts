import assert from "node:assert/strict";
import { test } from "node:test";
import { referenciaEtapa, segundosEtapa, formatarTempo } from "./tempo-pesquisa";

test("duração persiste ao reabrir e congela quando a etapa termina", () => {
  const passo = { titulo: "Busca", estado: "em_andamento" as const, iniciadoEm: "2026-09-19T12:00:00Z" };
  assert.equal(segundosEtapa(passo, Date.parse("2026-09-19T12:01:15Z")), 75);
  assert.equal(segundosEtapa({ ...passo, estado: "concluido", concluidoEm: "2026-09-19T12:00:10Z" }, Date.now()), 10);
  assert.equal(segundosEtapa({ titulo: "Antigo", estado: "concluido" }, Date.now()), null);
  assert.equal(formatarTempo(75), "1 min 15 s");
});

test("consultas adicionais não fazem a barra voltar e organização avança", () => {
  assert.equal(referenciaEtapa("Buscando na web: Ana").fase, referenciaEtapa("Lendo página pública: exemplo.com").fase);
  assert.ok(referenciaEtapa("Organizando os dados e conferindo a identidade com IA").fase > referenciaEtapa("Buscando na web: Ana").fase);
});
