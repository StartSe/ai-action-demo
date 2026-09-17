/**
 * Schema e copy do primeiro acesso (`/setup`, PRD "primeiro acesso e envs",
 * US-001). Client-safe: o formulário valida com o mesmo `setupSchema` que a
 * Server Action `completeSetup` usa — nada de `@/db` nem `server-only` aqui.
 */

import { z } from "zod";

import { PASSWORD_MAX_LENGTH, passwordStrength } from "@/lib/password-strength";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-change";

export const SETUP_NAME_MAX_LENGTH = 80;

export const SETUP_MESSAGES = {
  nameRequired: "Informe seu nome.",
  nameTooLong: `Use até ${SETUP_NAME_MAX_LENGTH} caracteres no nome.`,
  invalidEmail: "Informe um e-mail válido.",
  /** Senha classificada como `fraca` por `passwordStrength`. */
  weakPassword: "Escolha uma senha pelo menos média.",
  mismatch: "As senhas não coincidem.",
  /** Já existe conta: a action recusa e o client manda para /login. */
  alreadyConfigured:
    "Esta instância do AutoML já tem uma conta. Entre com ela.",
  generic: "Não foi possível criar a conta. Tente novamente.",
} as const;

export const setupSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, SETUP_MESSAGES.nameRequired)
      .max(SETUP_NAME_MAX_LENGTH, SETUP_MESSAGES.nameTooLong),
    // zod v4: normalizar antes do formato — os checks rodam em ordem.
    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email(SETUP_MESSAGES.invalidEmail)),
    // `abort: true`: os checks do zod v4 não param no primeiro erro — sem isso
    // uma senha curta acusaria weakPassword duas vezes (min + refine).
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, {
        message: SETUP_MESSAGES.weakPassword,
        abort: true,
      })
      .max(PASSWORD_MAX_LENGTH, {
        message: SETUP_MESSAGES.weakPassword,
        abort: true,
      })
      .refine((password) => passwordStrength(password) !== "fraca", {
        message: SETUP_MESSAGES.weakPassword,
      }),
    confirm: z.string(),
  })
  .refine((data) => data.confirm === data.password, {
    message: SETUP_MESSAGES.mismatch,
    path: ["confirm"],
  });

/** Corpo do 403 de POST /api/auth/sign-up/email depois da primeira conta. */
export const SIGNUP_DISABLED_MESSAGE = "Cadastro desativado.";

export type SetupInput = z.input<typeof setupSchema>;
export type SetupData = z.output<typeof setupSchema>;
