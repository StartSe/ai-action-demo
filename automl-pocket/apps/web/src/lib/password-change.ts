/**
 * Constantes e helpers puros da troca de senha em Configurações (US-007/008
 * da PRD "CTA IA para sua empresa"). Client-safe: importado pelo diálogo
 * "Alterar senha" (card Conta, Pocket US-011) — nada de `@/db` nem
 * `server-only` aqui. A gravação em audit_logs fica em
 * `password-change-audit.ts`.
 */

/** Mesmo valor de `emailAndPassword.minPasswordLength` em lib/auth.ts. */
export const PASSWORD_MIN_LENGTH = 8;

/** Rota do Better Auth chamada por `authClient.changePassword`. */
export const PASSWORD_CHANGE_PATH = "/change-password";

/**
 * Regra de `rateLimit.customRules` do Better Auth para `/change-password`:
 * 5 tentativas por hora (o rate limiter do Better Auth conta por IP). A senha
 * atual é conferida a cada chamada, então a rota é um oráculo de senha para
 * quem já tem a sessão — o teto barra força bruta sem atrapalhar quem erra a
 * digitação uma ou duas vezes. Formato `{ window, max }` é o do Better Auth
 * (segundos/requisições), diferente do `{ limit, windowSec }` de
 * rate-limit-policy.ts.
 */
export const PASSWORD_CHANGE_RATE_LIMIT = { window: 3600, max: 5 } as const;

/** Código do APIError do Better Auth quando a senha atual não bate. */
export const PASSWORD_CHANGE_INVALID_CURRENT_CODE = "INVALID_PASSWORD";

export const PASSWORD_CHANGE_MESSAGES = {
  /** Senha atual recusada pelo Better Auth (400 INVALID_PASSWORD). */
  invalidCurrent: "Senha atual incorreta.",
  /** 429 do rate limit de `/change-password`. */
  rateLimited: "Muitas tentativas. Tente novamente em uma hora.",
  /** Requisito exibido em tempo real sob "Nova senha". */
  minLength: `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres`,
  /** Requisito exibido em tempo real sob "Nova senha". */
  differentFromCurrent: "Diferente da senha atual",
  /** "Confirmar nova senha" não bate com "Nova senha". */
  mismatch: "As senhas não coincidem.",
  /** Falha genérica (rede, 500…). */
  generic: "Não foi possível alterar a senha. Tente novamente.",
} as const;

type PasswordChangeIssueCode = "min_length" | "same_as_current" | "mismatch";

export type PasswordChangeIssue = {
  code: PasswordChangeIssueCode;
  /** Campo do formulário ao qual o erro pertence. */
  field: "next" | "confirm";
  message: string;
};

/**
 * Validação client-side da nova senha, na ordem em que os requisitos aparecem
 * no diálogo. Lista vazia = pode enviar. Não valida a senha atual (só o
 * servidor sabe se está certa) — mas exige que a nova seja diferente dela,
 * comparando o texto digitado.
 */
export function validateNewPassword(params: {
  current: string;
  next: string;
  confirm: string;
}): PasswordChangeIssue[] {
  const { current, next, confirm } = params;
  const issues: PasswordChangeIssue[] = [];
  if (next.length < PASSWORD_MIN_LENGTH) {
    issues.push({
      code: "min_length",
      field: "next",
      message: PASSWORD_CHANGE_MESSAGES.minLength,
    });
  }
  if (next.length > 0 && next === current) {
    issues.push({
      code: "same_as_current",
      field: "next",
      message: PASSWORD_CHANGE_MESSAGES.differentFromCurrent,
    });
  }
  if (next !== confirm) {
    issues.push({
      code: "mismatch",
      field: "confirm",
      message: PASSWORD_CHANGE_MESSAGES.mismatch,
    });
  }
  return issues;
}

/**
 * Mensagem pt-BR para o erro devolvido por `authClient.changePassword`
 * (`{ status, code, message }` do Better Auth): senha atual errada e rate
 * limit têm texto próprio; o resto cai na mensagem genérica.
 */
export function passwordChangeErrorMessage(error: {
  status?: number;
  code?: string;
}): string {
  if (error.status === 429) return PASSWORD_CHANGE_MESSAGES.rateLimited;
  if (error.code === PASSWORD_CHANGE_INVALID_CURRENT_CODE) {
    return PASSWORD_CHANGE_MESSAGES.invalidCurrent;
  }
  return PASSWORD_CHANGE_MESSAGES.generic;
}

/** Toast (sonner) mostrado quando o Better Auth aceitou a troca. */
export const PASSWORD_CHANGE_SUCCESS_TOAST = "Senha alterada.";

/**
 * Texto do diálogo no sucesso: o `loginAuditPlugin` manda o email "Sua senha
 * foi alterada" logo depois da troca (password-change-audit.ts).
 */
export function passwordChangeSuccessMessage(email: string): string {
  return `Enviamos um email de confirmação para ${email}.`;
}

export type PasswordRequirement = {
  code: Extract<PasswordChangeIssueCode, "min_length" | "same_as_current">;
  label: string;
  /** false enquanto o campo está vazio — nada para conferir ainda. */
  met: boolean;
};

/**
 * Checklist em tempo real sob "Nova senha", na ordem em que aparece no
 * diálogo. Deriva de `validateNewPassword` para a UI e o envio nunca
 * divergirem; a confirmação (`mismatch`) fica fora — é erro do campo
 * "Confirmar nova senha", não requisito da senha.
 */
export function passwordRequirements(params: {
  current: string;
  next: string;
}): PasswordRequirement[] {
  const { current, next } = params;
  const failing = new Set(
    validateNewPassword({ current, next, confirm: next }).map(
      (issue) => issue.code,
    ),
  );
  const typed = next.length > 0;
  return [
    {
      code: "min_length",
      label: PASSWORD_CHANGE_MESSAGES.minLength,
      met: typed && !failing.has("min_length"),
    },
    {
      code: "same_as_current",
      label: PASSWORD_CHANGE_MESSAGES.differentFromCurrent,
      met: typed && !failing.has("same_as_current"),
    },
  ];
}
