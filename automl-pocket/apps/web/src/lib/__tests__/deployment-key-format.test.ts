import { describe, expect, it } from "vitest";

import {
  formatLastUsed,
  formatRelativeAgo,
  formatRemainingHHMM,
} from "../deployment-key-format";

const NOW = Date.parse("2026-09-02T12:00:00.000Z");
const MIN = 60_000;
const HOUR = 60 * MIN;

describe("formatRemainingHHMM", () => {
  it("mostra horas e minutos restantes com dois dígitos", () => {
    const expires = new Date(NOW + 23 * HOUR + 41 * MIN).toISOString();
    expect(formatRemainingHHMM(expires, NOW)).toBe("23:41");
  });

  it("arredonda segundos para cima (nunca 00:00 enquanto vale)", () => {
    const expires = new Date(NOW + 30_000).toISOString();
    expect(formatRemainingHHMM(expires, NOW)).toBe("00:01");
  });

  it("exatamente 24 h vira 24:00", () => {
    const expires = new Date(NOW + 24 * HOUR).toISOString();
    expect(formatRemainingHHMM(expires, NOW)).toBe("24:00");
  });

  it("devolve null quando já expirou, sem chave anterior ou ISO inválida", () => {
    expect(formatRemainingHHMM(new Date(NOW - 1).toISOString(), NOW)).toBeNull();
    expect(formatRemainingHHMM(new Date(NOW).toISOString(), NOW)).toBeNull();
    expect(formatRemainingHHMM(null, NOW)).toBeNull();
    expect(formatRemainingHHMM(undefined, NOW)).toBeNull();
    expect(formatRemainingHHMM("não é data", NOW)).toBeNull();
  });
});

describe("formatRelativeAgo", () => {
  it("escala de minutos para horas e dias", () => {
    expect(formatRelativeAgo(NOW - 20_000, NOW)).toBe("há menos de 1 min");
    expect(formatRelativeAgo(NOW - 5 * MIN, NOW)).toBe("há 5 min");
    expect(formatRelativeAgo(NOW - 59 * MIN, NOW)).toBe("há 59 min");
    expect(formatRelativeAgo(NOW - 3 * HOUR, NOW)).toBe("há 3 h");
    expect(formatRelativeAgo(NOW - 24 * HOUR, NOW)).toBe("há 1 dia");
    expect(formatRelativeAgo(NOW - 50 * HOUR, NOW)).toBe("há 2 dias");
  });

  it("relógio do cliente atrasado em relação ao servidor não fica negativo", () => {
    expect(formatRelativeAgo(NOW + 5 * MIN, NOW)).toBe("há menos de 1 min");
  });
});

describe("formatLastUsed", () => {
  it("'Nunca usada' sem registro", () => {
    expect(formatLastUsed(null, null, NOW)).toBe("Nunca usada");
    expect(formatLastUsed(undefined, "1.2.3.4", NOW)).toBe("Nunca usada");
  });

  it("'Último uso: há X min, de <ip>' com IP", () => {
    const at = new Date(NOW - 7 * MIN).toISOString();
    expect(formatLastUsed(at, "187.10.20.30", NOW)).toBe(
      "Último uso: há 7 min, de 187.10.20.30",
    );
  });

  it("omite o IP quando não foi registrado", () => {
    const at = new Date(NOW - 2 * HOUR).toISOString();
    expect(formatLastUsed(at, null, NOW)).toBe("Último uso: há 2 h");
    expect(formatLastUsed(at, "  ", NOW)).toBe("Último uso: há 2 h");
  });
});
