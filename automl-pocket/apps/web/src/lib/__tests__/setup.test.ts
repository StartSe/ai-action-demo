import { describe, expect, it } from "vitest";

import {
  SETUP_MESSAGES,
  SETUP_NAME_MAX_LENGTH,
  setupSchema,
} from "@/lib/setup";

const valid = {
  name: "Ana Lima",
  email: "Ana.Lima@Example.com",
  password: "Abcdefgh1",
  confirm: "Abcdefgh1",
};

function messagesFor(input: Record<string, string>, field: string) {
  const result = setupSchema.safeParse(input);
  expect(result.success).toBe(false);
  return result
    .error!.issues.filter((i) => i.path[0] === field)
    .map((i) => i.message);
}

describe("SETUP_MESSAGES", () => {
  it("copy pt-BR travada", () => {
    expect(SETUP_MESSAGES.weakPassword).toBe(
      "Escolha uma senha pelo menos média.",
    );
    expect(SETUP_MESSAGES.mismatch).toBe("As senhas não coincidem.");
    expect(SETUP_MESSAGES.alreadyConfigured).toBe(
      "Esta instância do AutoML já tem uma conta. Entre com ela.",
    );
    expect(SETUP_MESSAGES.generic).toBe(
      "Não foi possível criar a conta. Tente novamente.",
    );
    expect(SETUP_MESSAGES.nameRequired).not.toBe("");
    expect(SETUP_MESSAGES.nameTooLong).not.toBe("");
    expect(SETUP_MESSAGES.invalidEmail).not.toBe("");
    for (const text of Object.values(SETUP_MESSAGES)) {
      expect(text, text).not.toMatch(/pocket/i);
    }
    expect(SETUP_NAME_MAX_LENGTH).toBe(80);
  });
});

describe("setupSchema", () => {
  it("caso válido passa com email normalizado e nome sem espaços sobrando", () => {
    const result = setupSchema.safeParse({
      ...valid,
      name: "  Ana Lima  ",
      email: "  Ana.Lima@Example.com ",
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: "Ana Lima",
      email: "ana.lima@example.com",
      password: "Abcdefgh1",
      confirm: "Abcdefgh1",
    });
  });

  it("nome vazio (ou só espaços) → nameRequired", () => {
    expect(messagesFor({ ...valid, name: "" }, "name")).toEqual([
      SETUP_MESSAGES.nameRequired,
    ]);
    expect(messagesFor({ ...valid, name: "   " }, "name")).toEqual([
      SETUP_MESSAGES.nameRequired,
    ]);
  });

  it("nome com 81 caracteres → nameTooLong; 80 passa", () => {
    expect(
      messagesFor(
        { ...valid, name: "a".repeat(SETUP_NAME_MAX_LENGTH + 1) },
        "name",
      ),
    ).toEqual([SETUP_MESSAGES.nameTooLong]);
    expect(
      setupSchema.safeParse({
        ...valid,
        name: "a".repeat(SETUP_NAME_MAX_LENGTH),
      }).success,
    ).toBe(true);
  });

  it("e-mail inválido → invalidEmail", () => {
    for (const email of [
      "",
      "ana",
      "ana@",
      "@example.com",
      "ana example.com",
    ]) {
      expect(messagesFor({ ...valid, email }, "email"), email).toEqual([
        SETUP_MESSAGES.invalidEmail,
      ]);
    }
  });

  it("senha fraca → weakPassword (curta, só minúsculas, ou longa sem variedade)", () => {
    for (const password of ["Ab1!", "abcdefgh", "abcdefghijkl", ""]) {
      expect(
        messagesFor({ ...valid, password, confirm: password }, "password"),
        password,
      ).toEqual([SETUP_MESSAGES.weakPassword]);
    }
  });

  it("senha média e forte passam", () => {
    for (const password of ["Abcdefgh1", "Abcdefgh1!", "Abcdefghijkl1"]) {
      expect(
        setupSchema.safeParse({ ...valid, password, confirm: password })
          .success,
        password,
      ).toBe(true);
    }
  });

  it("confirmação diferente → mismatch anexado ao campo confirm", () => {
    const result = setupSchema.safeParse({ ...valid, confirm: "Abcdefgh2" });
    expect(result.success).toBe(false);
    expect(result.error!.issues).toHaveLength(1);
    expect(result.error!.issues[0].path).toEqual(["confirm"]);
    expect(result.error!.issues[0].message).toBe(SETUP_MESSAGES.mismatch);
  });

  it("senha fraca não acusa mismatch quando a confirmação bate", () => {
    const result = setupSchema.safeParse({
      ...valid,
      password: "abcdefgh",
      confirm: "abcdefgh",
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((i) => i.path[0])).toEqual(["password"]);
  });
});
