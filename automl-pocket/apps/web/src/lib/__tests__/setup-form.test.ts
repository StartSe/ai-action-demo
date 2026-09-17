import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  PASSWORD_STRENGTH_LABELS,
  PASSWORD_CRITERIA_LABELS,
} from "@/lib/password-strength";
import { SETUP_MESSAGES } from "@/lib/setup";

// O formulário é um Client Component sem ambiente de DOM nos testes; travamos
// aqui, pelo fonte, as regras da US-004 que não dependem de render (mesmo
// padrão de password-change.test.ts para auth.ts).
const source = readFileSync(
  path.join(process.cwd(), "src/app/setup/setup-form.tsx"),
  "utf8",
);

describe("setup-form.tsx (US-004)", () => {
  it("é um Client Component dentro de AuthShell com Logo", () => {
    expect(source.startsWith('"use client";')).toBe(true);
    expect(source).toContain("<AuthShell>");
    expect(source).toContain("<Logo />");
    expect(source).toContain("Primeiro acesso");
    expect(source).toContain("Crie a conta única desta instância do AutoML.");
  });

  it("deriva força/critérios/mismatch no render — sem useEffect", () => {
    expect(source).not.toMatch(/useEffect\s*\(/);
    expect(source).not.toMatch(/import\s*\{[^}]*\buseEffect\b/);
    expect(source).toContain("passwordCriteria(password)");
    expect(source).toContain("passwordStrength(password)");
  });

  it("medidor com role=meter e escala 0–3", () => {
    expect(source).toContain('role="meter"');
    expect(source).toContain("aria-valuemin={0}");
    expect(source).toContain("aria-valuemax={METER_MAX}");
    expect(source).toContain("const METER_MAX = 3;");
    expect(source).toContain("bg-destructive");
    expect(source).toContain("bg-amber-500");
    expect(source).toContain("bg-emerald-500");
    expect(source).toContain("bg-muted");
  });

  it("não repete no JSX as mensagens que já vivem nas constantes", () => {
    for (const message of Object.values(SETUP_MESSAGES)) {
      expect(source).not.toContain(message);
    }
    for (const label of Object.values(PASSWORD_STRENGTH_LABELS)) {
      expect(source).not.toMatch(new RegExp(`>\\s*${label}\\s*<`));
    }
    for (const label of Object.values(PASSWORD_CRITERIA_LABELS)) {
      expect(source).not.toContain(label);
    }
  });

  it("envia via completeSetup, loga no client e vai para /projects", () => {
    expect(source).toContain("await completeSetup(values)");
    expect(source).toContain("authClient.signIn.email(");
    expect(source).toContain('router.push("/projects")');
    expect(source).toContain("router.refresh()");
    expect(source).toContain('href="/login"');
    expect(source).toContain("Ir para o login");
    expect(source).toContain("Criar conta e entrar");
    expect(source).toContain("Criando conta…");
  });
});
