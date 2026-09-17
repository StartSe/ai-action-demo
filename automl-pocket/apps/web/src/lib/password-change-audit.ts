import { APIError } from "better-auth/api";

import { logAudit, requestMeta } from "@/lib/audit";
import { PASSWORD_CHANGE_INVALID_CURRENT_CODE } from "@/lib/password-change";

/**
 * Pós-processamento da troca de senha (`/change-password` do Better Auth),
 * chamado pelo after hook em `loginAuditPlugin` (lib/auth.ts): só auditoria
 * (o e-mail "Sua senha foi alterada" saiu no Pocket, US-005). Vive aqui, com
 * `audit` injetável, para ser testado sem Better Auth nem banco — em auth.ts
 * fica só o `if (path)` e a resolução do usuário.
 */
export const PASSWORD_CHANGE_AUDIT_ACTIONS = {
  changed: "auth.password_changed",
  failed: "auth.password_change_failed",
} as const;

export type PasswordChangeAuditUser = {
  id: string;
  orgId?: string | null;
};

/**
 * `true` quando o Better Auth recusou a troca por senha atual incorreta
 * (400 `INVALID_PASSWORD`). Outros erros do endpoint (senha nova curta,
 * conta sem senha, sessão ausente) não viram evento: não dizem nada sobre
 * tentativa de acesso indevido e a UI já bloqueia esses casos antes de enviar.
 */
export function isInvalidCurrentPasswordError(returned: unknown): boolean {
  return (
    returned instanceof APIError &&
    returned.body?.code === PASSWORD_CHANGE_INVALID_CURRENT_CODE
  );
}

/**
 * Grava `auth.password_changed` (metadata `{ revokeOtherSessions }`) quando o
 * endpoint respondeu sucesso, ou `auth.password_change_failed` (metadata
 * `{ reason: "invalid_current_password" }`) quando a senha atual não bateu.
 * Nunca inclui senhas nem o body no metadata. `user` é o da sessão da
 * requisição (ou da sessão nova, quando `revokeOtherSessions` girou a
 * sessão); sem usuário identificável não grava nada.
 */
export async function auditPasswordChange(params: {
  user: PasswordChangeAuditUser | null | undefined;
  returned: unknown;
  body: unknown;
  headers: Headers | undefined | null;
  audit?: typeof logAudit;
}): Promise<void> {
  const { user, returned, body, headers, audit = logAudit } = params;
  if (!user) return;
  const { ip, userAgent } = requestMeta(headers);
  const base = {
    orgId: user.orgId ?? null,
    userId: user.id,
    ip,
    userAgent,
  };

  if (returned instanceof APIError) {
    if (!isInvalidCurrentPasswordError(returned)) return;
    await audit({
      ...base,
      action: PASSWORD_CHANGE_AUDIT_ACTIONS.failed,
      metadata: { reason: "invalid_current_password" },
    });
    return;
  }

  await audit({
    ...base,
    action: PASSWORD_CHANGE_AUDIT_ACTIONS.changed,
    metadata: {
      revokeOtherSessions:
        (body as { revokeOtherSessions?: unknown } | undefined)
          ?.revokeOtherSessions === true,
    },
  });
}
