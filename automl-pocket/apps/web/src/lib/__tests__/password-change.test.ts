import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  PASSWORD_CHANGE_MESSAGES,
  PASSWORD_CHANGE_PATH,
  PASSWORD_CHANGE_RATE_LIMIT,
  PASSWORD_CHANGE_SUCCESS_TOAST,
  PASSWORD_MIN_LENGTH,
  passwordChangeErrorMessage,
  passwordChangeSuccessMessage,
  passwordRequirements,
  validateNewPassword,
} from "@/lib/password-change";

const authSource = readFileSync(path.resolve(__dirname, "../auth.ts"), "utf8");

describe("validateNewPassword", () => {
  it("senha curta acusa o mínimo de caracteres", () => {
    const issues = validateNewPassword({
      current: "senha-antiga-1",
      next: "curta",
      confirm: "curta",
    });
    expect(issues).toEqual([
      {
        code: "min_length",
        field: "next",
        message: "Mínimo de 8 caracteres",
      },
    ]);
  });

  it("senha igual à atual é recusada", () => {
    const issues = validateNewPassword({
      current: "mesma-senha-123",
      next: "mesma-senha-123",
      confirm: "mesma-senha-123",
    });
    expect(issues.map((i) => i.code)).toEqual(["same_as_current"]);
    expect(issues[0].message).toBe("Diferente da senha atual");
  });

  it("confirmação diferente acusa que as senhas não coincidem", () => {
    const issues = validateNewPassword({
      current: "senha-antiga-1",
      next: "senha-nova-123",
      confirm: "senha-nova-124",
    });
    expect(issues).toEqual([
      {
        code: "mismatch",
        field: "confirm",
        message: "As senhas não coincidem.",
      },
    ]);
  });

  it("senha válida devolve lista vazia", () => {
    expect(
      validateNewPassword({
        current: "senha-antiga-1",
        next: "senha-nova-123",
        confirm: "senha-nova-123",
      }),
    ).toEqual([]);
  });

  it("acumula os erros na ordem dos requisitos do diálogo", () => {
    const issues = validateNewPassword({
      current: "abc",
      next: "abc",
      confirm: "",
    });
    expect(issues.map((i) => i.code)).toEqual([
      "min_length",
      "same_as_current",
      "mismatch",
    ]);
  });

  it("campo vazio não acusa 'igual à atual' (só o mínimo)", () => {
    expect(
      validateNewPassword({ current: "", next: "", confirm: "" }).map(
        (i) => i.code,
      ),
    ).toEqual(["min_length"]);
  });
});

describe("passwordChangeErrorMessage", () => {
  it("senha atual errada e rate limit têm mensagem própria", () => {
    expect(
      passwordChangeErrorMessage({ status: 400, code: "INVALID_PASSWORD" }),
    ).toBe("Senha atual incorreta.");
    expect(passwordChangeErrorMessage({ status: 429 })).toBe(
      "Muitas tentativas. Tente novamente em uma hora.",
    );
  });

  it("outros erros caem na mensagem genérica", () => {
    expect(
      passwordChangeErrorMessage({ status: 400, code: "PASSWORD_TOO_SHORT" }),
    ).toBe(PASSWORD_CHANGE_MESSAGES.generic);
    expect(passwordChangeErrorMessage({})).toBe(
      PASSWORD_CHANGE_MESSAGES.generic,
    );
  });
});

describe("configuração da troca de senha em lib/auth.ts", () => {
  it("regra de rate limit é 5 por hora na rota /change-password", () => {
    expect(PASSWORD_CHANGE_PATH).toBe("/change-password");
    expect(PASSWORD_CHANGE_RATE_LIMIT).toEqual({ window: 3600, max: 5 });
    // A config do Better Auth precisa de banco para instanciar; o wiring é
    // conferido no fonte: customRules[PASSWORD_CHANGE_PATH] = a regra acima.
    expect(authSource).toMatch(
      /rateLimit:\s*\{[\s\S]*?customRules:\s*\{[\s\S]*?\[PASSWORD_CHANGE_PATH\]:\s*PASSWORD_CHANGE_RATE_LIMIT/,
    );
  });

  it("mínimo de caracteres é o mesmo do emailAndPassword.minPasswordLength", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(authSource).toContain("minPasswordLength: PASSWORD_MIN_LENGTH");
  });

  it("o after hook da troca de senha vive no loginAuditPlugin", () => {
    const pluginSource = authSource.slice(
      authSource.indexOf("function loginAuditPlugin"),
      authSource.indexOf("function createAuth"),
    );
    expect(pluginSource).toContain("ctx.path === PASSWORD_CHANGE_PATH");
    expect(pluginSource).toContain("auditPasswordChange(");
  });
});

describe("UI da seção Senha e do diálogo", () => {
  it("textos fixos citam o mínimo de caracteres e o email de confirmação", () => {
    expect(PASSWORD_CHANGE_SUCCESS_TOAST).toBe("Senha alterada.");
    expect(passwordChangeSuccessMessage("ana@empresa.com")).toBe(
      "Enviamos um email de confirmação para ana@empresa.com.",
    );
  });

  it("checklist começa toda pendente com o campo vazio", () => {
    expect(passwordRequirements({ current: "atual-123", next: "" })).toEqual([
      { code: "min_length", label: "Mínimo de 8 caracteres", met: false },
      {
        code: "same_as_current",
        label: "Diferente da senha atual",
        met: false,
      },
    ]);
  });

  it("checklist marca cada requisito conforme a digitação", () => {
    const curta = passwordRequirements({ current: "atual-123", next: "nova" });
    expect(curta.map((r) => r.met)).toEqual([false, true]);

    const igual = passwordRequirements({
      current: "atual-123",
      next: "atual-123",
    });
    expect(igual.map((r) => r.met)).toEqual([true, false]);

    const ok = passwordRequirements({
      current: "atual-123",
      next: "nova-senha-456",
    });
    expect(ok.every((r) => r.met)).toBe(true);
  });

  it("checklist segue validateNewPassword (mesmos requisitos, sem a confirmação)", () => {
    const params = { current: "atual-123", next: "atual-123" };
    const failing = validateNewPassword({ ...params, confirm: "outra" }).map(
      (i) => i.code,
    );
    expect(failing).toContain("mismatch");
    const codes = passwordRequirements(params)
      .filter((r) => !r.met)
      .map((r) => r.code);
    expect(codes).toEqual(failing.filter((c) => c !== "mismatch"));
  });
});
