import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { duracaoSegundos, progressoEtapas } from "../lib/andamento-prospeccao";

test("tempos persistidos sobrevivem à releitura, cancelamento e recuperação", async t => {
  const pasta = mkdtempSync(path.join(tmpdir(), "tempos-prospeccao-"));
  process.env.DATA_DIR = pasta;
  t.after(() => rmSync(pasta, { recursive: true, force: true }));
  const ws = await import("../lib/workspace");
  const criar = () => ws.criarProspeccao({ produtoId: "p", icpId: "i", modo: "pessoas", criterios: {}, estado: "executando", etapa: null, erro: null }, new Date("2026-01-01T12:00:00Z"));
  const p = criar();
  ws.atualizarProspeccao(p.id, { etapa: "entendendo_produto" }, new Date("2026-01-01T12:00:01Z"));
  ws.atualizarProspeccao(p.id, { etapa: "encontrando_pessoas" }, new Date("2026-01-01T12:00:03Z"));
  ws.atualizarProspeccao(p.id, { etapa: "encontrando_pessoas" }, new Date("2026-01-01T12:00:10Z"));
  const lida = ws.obterAndamento(p.id)!.prospeccao;
  const etapas = progressoEtapas(lida, "b2b", Date.parse("2026-01-01T12:06:04Z"));
  assert.deepEqual(etapas.map(e => e.estado), ["concluida", "ativa", "aguardando"]);
  assert.equal(etapas[0].segundos, 2);
  assert.equal(etapas[1].segundos, 361);
  assert.equal(etapas[1].demorando, true);
  ws.atualizarProspeccao(p.id, { estado: "cancelada" }, new Date("2026-01-01T12:06:05Z"));
  const cancelada = ws.obterProspeccao(p.id)!;
  assert.equal(cancelada.concluidoEm, "2026-01-01T12:06:05.000Z");
  const parada = progressoEtapas(cancelada, "b2b", Date.now());
  assert.deepEqual(parada.map(e => e.estado), ["concluida", "interrompida", "nao_executada"]);
  assert.equal(parada[1].segundos, 362);
  const antiga = criar();
  ws.atualizarProspeccao(antiga.id, { etapa: "encontrando_pessoas" });
  ws.recuperarProspeccoesTravadas();
  const recuperada = ws.obterProspeccao(antiga.id)!;
  assert.equal(recuperada.estado, "falhou");
  assert.ok(recuperada.temposEtapas?.encontrando_pessoas.fim);
  assert.deepEqual(progressoEtapas({ ...cancelada, temposEtapas: undefined }, "b2b", Date.now()).map(e => e.segundos), [null, null, null]);
  assert.equal(duracaoSegundos("inválido", Date.now()), null);
});

test("resultado parcial não apresenta todas as etapas como concluídas", () => {
  const base = { id: "p", produtoId: "p", icpId: "i", modo: "empresas" as const, criterios: {}, estado: "pronta" as const, etapa: "procurando_empresas", erro: "Limite atingido", demo: false, criadoEm: "2026-01-01T12:00:00Z", concluidoEm: "2026-01-01T12:00:30Z" };
  const etapas = progressoEtapas(base, "b2b", Date.now());
  assert.deepEqual(etapas.map(e => e.estado), ["concluida", "interrompida", "nao_executada", "nao_executada"]);
  assert.ok(!etapas.some(e => e.chave === "encontrando_pessoas"));
});
