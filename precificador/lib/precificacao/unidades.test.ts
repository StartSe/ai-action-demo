import assert from "node:assert/strict";
import { test } from "node:test";
import { converter, familiaDa, mesmaFamilia } from "./unidades";

test("converte dentro da família de peso", () => {
  assert.equal(converter(120, "g", "kg"), 0.12);
  assert.equal(converter(1, "kg", "g"), 1000);
  assert.equal(converter(500, "mg", "g"), 0.5);
});

test("converte dentro da família de volume e de comprimento", () => {
  assert.equal(converter(250, "ml", "L"), 0.25);
  assert.equal(converter(2, "L", "ml"), 2000);
  assert.equal(converter(150, "cm", "m"), 1.5);
});

test("unidade avulsa só converte para ela mesma", () => {
  assert.equal(converter(3, "un", "un"), 3);
  assert.equal(converter(3, "un", "kg"), null);
});

test("famílias diferentes devolvem null em vez de um número errado", () => {
  assert.equal(converter(200, "ml", "g"), null);
  assert.equal(converter(1, "m", "L"), null);
});

test("familiaDa e mesmaFamilia classificam as oito unidades", () => {
  assert.equal(familiaDa("kg"), "peso");
  assert.equal(familiaDa("ml"), "volume");
  assert.equal(familiaDa("cm"), "comprimento");
  assert.equal(familiaDa("un"), "unidade");
  assert.ok(mesmaFamilia("g", "kg"));
  assert.ok(!mesmaFamilia("g", "ml"));
});

test("ida e volta não perde precisão em valores típicos de ficha", () => {
  for (const g of [1, 7, 120, 999, 2500]) {
    assert.equal(converter(converter(g, "g", "kg")!, "kg", "g"), g);
  }
});
