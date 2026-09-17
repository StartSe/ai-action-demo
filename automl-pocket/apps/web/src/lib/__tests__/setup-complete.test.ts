import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { AuditEntry } from "@/lib/audit";
import { SETUP_MESSAGES, SIGNUP_DISABLED_MESSAGE } from "@/lib/setup";
import {
  SETUP_COMPLETED_AUDIT_ACTION,
  SETUP_SEED_TIMEOUT_MS,
  runCompleteSetup,
  setupFieldErrors,
  withSetupLock,
  type CompleteSetupDeps,
} from "@/lib/setup-complete";

const validInput = {
  name: "  Rafael  ",
  email: "Rafael@Example.com",
  password: "Senha-forte-123",
  confirm: "Senha-forte-123",
};

function makeDeps(overrides: Partial<CompleteSetupDeps> = {}) {
  let exists = false;
  const audits: AuditEntry[] = [];
  const deps: CompleteSetupDeps = {
    hasAccount: vi.fn(async () => exists),
    signUp: vi.fn(async () => {
      exists = true;
      return { userId: "user-1", orgId: "org-1" };
    }),
    markEmailVerified: vi.fn(async () => {}),
    audit: vi.fn(async (entry: AuditEntry) => {
      audits.push(entry);
    }),
    seedExamples: vi.fn(async () => ({ created: [], skipped: [], failed: [] })),
    meta: { ip: "203.0.113.7", userAgent: "vitest" },
    warn: vi.fn(),
    ...overrides,
  };
  return { deps, audits };
}

describe("setupFieldErrors", () => {
  it("devolve a primeira mensagem por campo, na chave do campo", () => {
    expect(
      setupFieldErrors({
        name: "",
        email: "nao-e-email",
        password: "curta",
        confirm: "outra",
      }),
    ).toEqual({
      name: SETUP_MESSAGES.nameRequired,
      email: SETUP_MESSAGES.invalidEmail,
      password: SETUP_MESSAGES.weakPassword,
    });
  });

  it("confirmação diferente cai em confirm", () => {
    expect(setupFieldErrors({ ...validInput, confirm: "Outra-1234" })).toEqual({
      confirm: SETUP_MESSAGES.mismatch,
    });
  });

  it("null para entrada válida", () => {
    expect(setupFieldErrors(validInput)).toBeNull();
  });
});

describe("runCompleteSetup", () => {
  it("entrada inválida devolve fieldErrors sem tocar nas deps", async () => {
    const { deps } = makeDeps();
    const result = await runCompleteSetup(
      { ...validInput, password: "fraca", confirm: "fraca" },
      deps,
    );
    expect(result).toEqual({
      ok: false,
      code: "invalid_input",
      fieldErrors: { password: SETUP_MESSAGES.weakPassword },
    });
    expect(deps.hasAccount).not.toHaveBeenCalled();
    expect(deps.signUp).not.toHaveBeenCalled();
  });

  it("cria a conta com nome/e-mail normalizados, marca emailVerified e audita", async () => {
    const { deps, audits } = makeDeps();
    const result = await runCompleteSetup(validInput, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.signUp).toHaveBeenCalledWith({
      name: "Rafael",
      email: "rafael@example.com",
      password: "Senha-forte-123",
    });
    expect(deps.markEmailVerified).toHaveBeenCalledWith("user-1");
    expect(audits).toEqual([
      {
        action: SETUP_COMPLETED_AUDIT_ACTION,
        orgId: "org-1",
        userId: "user-1",
        ip: "203.0.113.7",
        userAgent: "vitest",
        metadata: { email: "rafael@example.com" },
      },
    ]);
    expect(SETUP_COMPLETED_AUDIT_ACTION).toBe("auth.setup_completed");
  });

  it("dispara o seed do exemplo sem esperar por ele", async () => {
    let resolveSeed: (() => void) | undefined;
    const seedExamples = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSeed = resolve;
        }),
    );
    const { deps } = makeDeps({ seedExamples });

    const result = await runCompleteSetup(validInput, deps);

    expect(result).toEqual({ ok: true });
    expect(seedExamples).toHaveBeenCalledWith("org-1");
    expect(resolveSeed).toBeDefined();
    resolveSeed?.();
  });

  it("falha e timeout do seed viram warning, não erro da action", async () => {
    vi.useFakeTimers();
    try {
      const warn = vi.fn();
      const { deps } = makeDeps({
        warn,
        seedExamples: vi.fn(() => new Promise<never>(() => {})),
        seedTimeoutMs: 50,
      });
      expect(await runCompleteSetup(validInput, deps)).toEqual({ ok: true });
      await vi.advanceTimersByTimeAsync(60);
      expect(warn).toHaveBeenCalledTimes(1);
      expect((warn.mock.calls[0][1] as Error).message).toMatch(/50ms/);

      const warn2 = vi.fn();
      const { deps: deps2 } = makeDeps({
        warn: warn2,
        seedExamples: vi.fn(async () => {
          throw new Error("redis down");
        }),
      });
      expect(await runCompleteSetup(validInput, deps2)).toEqual({ ok: true });
      await vi.advanceTimersByTimeAsync(0);
      expect(warn2).toHaveBeenCalledTimes(1);
      expect((warn2.mock.calls[0][1] as Error).message).toBe("redis down");
    } finally {
      vi.useRealTimers();
    }
    expect(SETUP_SEED_TIMEOUT_MS).toBe(15_000);
  });

  it("já existe conta → already_configured, sem criar nada", async () => {
    const { deps } = makeDeps({ hasAccount: vi.fn(async () => true) });
    const result = await runCompleteSetup(validInput, deps);
    expect(result).toEqual({
      ok: false,
      code: "already_configured",
      message: SETUP_MESSAGES.alreadyConfigured,
    });
    expect(deps.signUp).not.toHaveBeenCalled();
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("duas execuções concorrentes: só a primeira cria, a segunda vê a conta", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let exists = false;
    const signUp = vi.fn(async () => {
      await gate; // segura a primeira execução no meio do lock
      exists = true;
      return { userId: "user-1", orgId: "org-1" };
    });
    const { deps } = makeDeps({
      signUp,
      hasAccount: vi.fn(async () => exists),
    });

    const first = runCompleteSetup(validInput, deps);
    const second = runCompleteSetup(
      { ...validInput, email: "outra@example.com" },
      deps,
    );
    await Promise.resolve();
    release?.();

    expect(await first).toEqual({ ok: true });
    expect(await second).toMatchObject({
      ok: false,
      code: "already_configured",
    });
    expect(signUp).toHaveBeenCalledTimes(1);
  });

  it("signUp que lança devolve erro genérico e libera o lock", async () => {
    const { deps } = makeDeps({
      signUp: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await runCompleteSetup(validInput, deps)).toEqual({
        ok: false,
        code: "error",
        message: SETUP_MESSAGES.generic,
      });
      // lock liberado: a próxima execução roda normalmente
      const { deps: ok } = makeDeps();
      expect(await runCompleteSetup(validInput, ok)).toEqual({ ok: true });
    } finally {
      spy.mockRestore();
    }
  });

  it("usuário sem organização é erro genérico (nada de auditar/seed)", async () => {
    const { deps } = makeDeps({
      signUp: vi.fn(async () => ({ userId: "user-1", orgId: null })),
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await runCompleteSetup(validInput, deps)).toMatchObject({
        ok: false,
        code: "error",
      });
      expect(deps.audit).not.toHaveBeenCalled();
      expect(deps.seedExamples).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("withSetupLock", () => {
  it("executa em série e propaga o resultado de cada chamada", async () => {
    const order: string[] = [];
    const a = withSetupLock(async () => {
      order.push("a:start");
      await new Promise((r) => setTimeout(r, 10));
      order.push("a:end");
      return "a";
    });
    const b = withSetupLock(async () => {
      order.push("b");
      return "b";
    });
    expect(await Promise.all([a, b])).toEqual(["a", "b"]);
    expect(order).toEqual(["a:start", "a:end", "b"]);
  });

  it("rejeição de uma execução não trava a seguinte", async () => {
    await expect(
      withSetupLock(async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow("x");
    expect(await withSetupLock(async () => 42)).toBe(42);
  });
});

describe("lib/auth.ts fecha o cadastro depois da primeira conta", () => {
  const authSource = readFileSync(
    path.resolve(__dirname, "../auth.ts"),
    "utf8",
  );

  it("hooks.before recusa /sign-up/email com 403 quando já há usuário", () => {
    expect(authSource).toMatch(
      /ctx\.path === "\/sign-up\/email" && \(await hasAccount\(\)\)/,
    );
    expect(authSource).toContain(
      'throw new APIError("FORBIDDEN", { message: SIGNUP_DISABLED_MESSAGE })',
    );
    expect(SIGNUP_DISABLED_MESSAGE).toBe("Cadastro desativado.");
    // Uma só fonte para "há conta?": o hasAccount de setup-state.ts, sem
    // helper duplicado em auth.ts (o duplicado existia só por causa do
    // bootstrap.ts fora do Next, removido na US-005).
    expect(authSource).toContain(
      'import { hasAccount } from "@/lib/setup-state";',
    );
    expect(authSource).not.toMatch(/anyUserExists/);
  });

  it("databaseHooks.user.create.before barra antes de inserir a organização", () => {
    const before = authSource.slice(
      authSource.indexOf("before: async (user) =>"),
      authSource.indexOf("after: async (user, ctx)"),
    );
    const guard = before.indexOf("if (await hasAccount())");
    const insert = before.indexOf(".insert(schema.organizations)");
    expect(guard).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(guard);
  });
});
