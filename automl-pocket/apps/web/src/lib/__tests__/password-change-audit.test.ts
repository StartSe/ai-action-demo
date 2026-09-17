import { APIError } from "better-auth/api";
import { describe, expect, it, vi } from "vitest";

import type { AuditEntry } from "@/lib/audit";
import {
  auditPasswordChange,
  isInvalidCurrentPasswordError,
  PASSWORD_CHANGE_AUDIT_ACTIONS,
} from "@/lib/password-change-audit";

const headers = new Headers({
  "x-forwarded-for": "203.0.113.7, 10.0.0.1",
  "user-agent": "vitest",
});
const user = { id: "user-1", orgId: "org-1" };

function makeAudit() {
  const calls: AuditEntry[] = [];
  const audit = vi.fn(async (entry: AuditEntry) => {
    calls.push(entry);
  });
  return { audit, calls };
}

describe("isInvalidCurrentPasswordError", () => {
  it("reconhece o 400 INVALID_PASSWORD do Better Auth", () => {
    expect(
      isInvalidCurrentPasswordError(
        new APIError("BAD_REQUEST", {
          message: "Invalid password",
          code: "INVALID_PASSWORD",
        }),
      ),
    ).toBe(true);
  });

  it("ignora outros erros e respostas de sucesso", () => {
    expect(
      isInvalidCurrentPasswordError(
        new APIError("BAD_REQUEST", {
          message: "Password too short",
          code: "PASSWORD_TOO_SHORT",
        }),
      ),
    ).toBe(false);
    expect(isInvalidCurrentPasswordError({ token: null, user })).toBe(false);
    expect(isInvalidCurrentPasswordError(undefined)).toBe(false);
  });
});

describe("auditPasswordChange", () => {
  it("sucesso grava auth.password_changed com revokeOtherSessions", async () => {
    const { audit, calls } = makeAudit();
    await auditPasswordChange({
      user,
      returned: { token: "novo-token", user: { id: user.id } },
      body: {
        currentPassword: "atual-123",
        newPassword: "nova-senha-456",
        revokeOtherSessions: true,
      },
      headers,
      audit,
    });
    expect(calls).toEqual([
      {
        action: PASSWORD_CHANGE_AUDIT_ACTIONS.changed,
        orgId: "org-1",
        userId: "user-1",
        ip: "203.0.113.7",
        userAgent: "vitest",
        metadata: { revokeOtherSessions: true },
      },
    ]);
  });

  it("revokeOtherSessions ausente ou não booleano conta como false", async () => {
    const { audit, calls } = makeAudit();
    await auditPasswordChange({
      user,
      returned: { token: null, user: { id: user.id } },
      body: { currentPassword: "a", newPassword: "b" },
      headers,
      audit,
    });
    await auditPasswordChange({
      user,
      returned: { token: null, user: { id: user.id } },
      body: { revokeOtherSessions: "true" },
      headers,
      audit,
    });
    expect(calls.map((c) => c.metadata)).toEqual([
      { revokeOtherSessions: false },
      { revokeOtherSessions: false },
    ]);
  });

  it("senha atual incorreta grava auth.password_change_failed sem senhas", async () => {
    const { audit, calls } = makeAudit();
    await auditPasswordChange({
      user,
      returned: new APIError("BAD_REQUEST", {
        message: "Invalid password",
        code: "INVALID_PASSWORD",
      }),
      body: { currentPassword: "errada-999", newPassword: "nova-senha-456" },
      headers,
      audit,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      action: PASSWORD_CHANGE_AUDIT_ACTIONS.failed,
      orgId: "org-1",
      userId: "user-1",
      ip: "203.0.113.7",
      metadata: { reason: "invalid_current_password" },
    });
    expect(JSON.stringify(calls[0])).not.toContain("errada-999");
    expect(JSON.stringify(calls[0])).not.toContain("nova-senha-456");
  });

  it("outros erros do endpoint não geram evento", async () => {
    const { audit } = makeAudit();
    await auditPasswordChange({
      user,
      returned: new APIError("BAD_REQUEST", {
        message: "Password too short",
        code: "PASSWORD_TOO_SHORT",
      }),
      body: {},
      headers,
      audit,
    });
    expect(audit).not.toHaveBeenCalled();
  });

  it("sem usuário identificável não grava nada", async () => {
    const { audit } = makeAudit();
    await auditPasswordChange({
      user: null,
      returned: { token: null, user: {} },
      body: {},
      headers,
      audit,
    });
    expect(audit).not.toHaveBeenCalled();
  });

  it("usuário sem orgId grava orgId null e aceita headers ausentes", async () => {
    const { audit, calls } = makeAudit();
    await auditPasswordChange({
      user: { id: "user-2" },
      returned: { token: null },
      body: {},
      headers: undefined,
      audit,
    });
    expect(calls[0]).toMatchObject({
      orgId: null,
      userId: "user-2",
      ip: null,
      userAgent: null,
    });
  });
});
