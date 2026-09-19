import test from "node:test";
import assert from "node:assert/strict";
import { monitoramentoDevido, validarMonitoramento } from "../lib/monitoramento";

const config = validarMonitoramento({ temas: ["IA", "IA", " Varejo "] });
test("padrão, deduplicação e validação", () => {
  assert.deepEqual(config.temas, ["IA", "Varejo"]);
  assert.deepEqual(config.horarios, ["08:00", "16:00", "20:00"]);
  assert.equal(config.fuso, "America/Sao_Paulo");
  for (const extra of [{ temas: [] }, { horarios: [] }, { horarios: ["24:00"] }, { fuso: "invalido" }, { temas: [1] }]) assert.throws(() => validarMonitoramento({ temas: ["IA"], ...extra }));
});
test("executa nos três slots de Brasília, sem antecipar ou repetir", () => {
  const criado = "2026-09-18T10:00:00Z";
  assert.equal(monitoramentoDevido(config, null, criado, new Date("2026-09-18T10:59:00Z")), false);
  for (const hora of [11, 19, 23]) {
    const agora = new Date(`2026-09-18T${hora}:00:00Z`);
    const antes = new Date(agora.getTime() - 3600000).toISOString();
    assert.equal(monitoramentoDevido(config, antes, criado, agora), true);
    assert.equal(monitoramentoDevido(config, agora.toISOString(), criado, agora), false);
  }
});
test("não executa retroativamente ao cadastrar; retoma após downtime e aceita outros fusos", () => {
  const agora = new Date("2026-09-19T04:00:00Z");
  assert.equal(monitoramentoDevido(config, null, agora.toISOString(), agora), false);
  assert.equal(monitoramentoDevido(config, "2026-09-17T11:00:00Z", "2026-09-17T10:00:00Z", agora), true);
  const utc = validarMonitoramento({ temas: ["IA"], horarios: ["04:00"], fuso: "UTC" });
  assert.equal(monitoramentoDevido(utc, null, "2026-09-19T03:00:00Z", agora), true);
});
