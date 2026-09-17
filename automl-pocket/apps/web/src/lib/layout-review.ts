/**
 * LAYOUT_REVIEW_ENABLED — pausa do dataset em "needs_review" quando o
 * diagnóstico de layout do worker pede revisão (US-023/US-024).
 *
 * Default false: o parse segue automático como antes. O worker lê a mesma
 * variável (jobs/db.py → layout_review_enabled) e é ele quem decide a pausa;
 * o web usa a flag só para exibir/ocultar a tela de revisão e seus atalhos.
 * Aceita "true"/"1"/"yes"/"on" (sem distinção de caixa); qualquer outro
 * valor vale false.
 */
const TRUTHY = new Set(["true", "1", "yes", "on"]);

export function layoutReviewEnabled(): boolean {
  const raw = (process.env.LAYOUT_REVIEW_ENABLED ?? "").trim().toLowerCase();
  return TRUTHY.has(raw);
}
