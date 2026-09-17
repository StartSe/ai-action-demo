/**
 * Régua de força da senha do primeiro acesso (PRD "primeiro acesso e envs",
 * US-001). Regras locais, sem dependência nova — decisão de produto #2.
 * Client-safe: importado pelo medidor do formulário `/setup` e pelo
 * `setupSchema` que o servidor também usa, para os dois validarem igual.
 * Nada de `@/db` nem `server-only` aqui.
 */

import { PASSWORD_MIN_LENGTH } from "@/lib/password-change";

/** bcrypt ignora bytes além de 72 — sem o teto a senha seria truncada em silêncio. */
export const PASSWORD_MAX_LENGTH = 72;

/** Comprimento a partir do qual a senha conta o critério `long`. */
export const PASSWORD_LONG_LENGTH = 12;

export type PasswordCriterionCode =
  "min_length" | "long" | "mixed_case" | "digit" | "symbol";

export type PasswordCriterion = {
  code: PasswordCriterionCode;
  label: string;
  met: boolean;
};

export const PASSWORD_CRITERIA_LABELS: Record<PasswordCriterionCode, string> = {
  min_length: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`,
  long: `${PASSWORD_LONG_LENGTH} caracteres ou mais`,
  mixed_case: "Letras maiúsculas e minúsculas",
  digit: "Pelo menos um número",
  symbol: "Pelo menos um símbolo, ex.: ! ? # @",
};

/** Símbolo = qualquer caractere que não seja letra, número ou espaço. */
const SYMBOL_PATTERN = /[^\p{L}\p{N}\s]/u;

/**
 * Checklist da senha, na ordem em que aparece no formulário. Cada item é
 * avaliado de forma independente; `passwordStrength` deriva daqui.
 */
export function passwordCriteria(password: string): PasswordCriterion[] {
  const checks: Record<PasswordCriterionCode, boolean> = {
    min_length: password.length >= PASSWORD_MIN_LENGTH,
    long: password.length >= PASSWORD_LONG_LENGTH,
    mixed_case: /\p{Ll}/u.test(password) && /\p{Lu}/u.test(password),
    digit: /\p{N}/u.test(password),
    symbol: SYMBOL_PATTERN.test(password),
  };
  return (Object.keys(PASSWORD_CRITERIA_LABELS) as PasswordCriterionCode[]).map(
    (code) => ({
      code,
      label: PASSWORD_CRITERIA_LABELS[code],
      met: checks[code],
    }),
  );
}

export type PasswordStrength = "fraca" | "media" | "forte";

/**
 * `fraca` se o mínimo de caracteres não é atendido ou se ≤ 2 critérios
 * passam; `media` com exatamente 3; `forte` com 4 ou 5.
 */
export function passwordStrength(password: string): PasswordStrength {
  const criteria = passwordCriteria(password);
  const minLength = criteria.find((c) => c.code === "min_length");
  if (!minLength?.met) return "fraca";
  const met = criteria.filter((c) => c.met).length;
  if (met <= 2) return "fraca";
  if (met === 3) return "media";
  return "forte";
}

export const PASSWORD_STRENGTH_LABELS: Record<PasswordStrength, string> = {
  fraca: "Fraca",
  media: "Média",
  forte: "Forte",
};

/** Abaixo disso o formulário e o servidor recusam a senha. */
export const MIN_ACCEPTED_STRENGTH: PasswordStrength = "media";
