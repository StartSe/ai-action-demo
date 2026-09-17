import { z } from "zod";

/**
 * Descrição do problema de negócio do projeto (US-029). Client-safe: sem
 * `@/db` — o diálogo de criação/edição importa as constantes daqui e a server
 * action valida com o MESMO schema, para a mensagem do servidor nunca divergir
 * do `maxLength` nativo do textarea.
 */
export const PROBLEM_DESCRIPTION_MAX_LENGTH = 1000;

export const PROBLEM_DESCRIPTION_LABEL = "Qual problema você quer resolver?";

export const PROBLEM_DESCRIPTION_PLACEHOLDER =
  "Quero prever quais clientes vão cancelar o plano nos próximos 3 meses";

export const PROBLEM_DESCRIPTION_TOO_LONG = `A descrição do problema deve ter no máximo ${PROBLEM_DESCRIPTION_MAX_LENGTH} caracteres.`;

export const PROBLEM_DESCRIPTION_INVALID =
  "A descrição do problema deve ser um texto.";

/** Texto aparado; vazio vira `null` (a coluna é nula, não string vazia). */
const problemDescriptionSchema = z
  .string({ error: PROBLEM_DESCRIPTION_INVALID })
  .trim()
  .max(PROBLEM_DESCRIPTION_MAX_LENGTH, { error: PROBLEM_DESCRIPTION_TOO_LONG })
  .transform((value) => (value.length === 0 ? null : value));

export type ProblemDescriptionParse =
  { ok: true; value: string | null } | { ok: false; error: string };

/**
 * Normaliza o que veio do client: `undefined`/`null` (campo opcional) e texto
 * só de espaços viram `null`; texto acima do limite ou não-string devolve a
 * mensagem em pt-BR pronta para o `{ error }` da action.
 */
export function parseProblemDescription(
  input: unknown,
): ProblemDescriptionParse {
  if (input === undefined || input === null) return { ok: true, value: null };
  const result = problemDescriptionSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues[0]?.message ?? PROBLEM_DESCRIPTION_INVALID,
    };
  }
  return { ok: true, value: result.data };
}

/** Contador exibido sob o textarea ("123/1000"). */
export function formatProblemDescriptionCount(length: number): string {
  return `${Math.min(Math.max(length, 0), PROBLEM_DESCRIPTION_MAX_LENGTH)}/${PROBLEM_DESCRIPTION_MAX_LENGTH}`;
}
