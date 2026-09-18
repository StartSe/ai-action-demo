import { redirect } from "next/navigation";

/** "Histórico" virou "Prospecções" (US-002): a tela nasceu com o mesmo nome do recurso genérico da
 * suíte, mas o workspace de prospecção passou a ter uma área própria com o mesmo papel e mais estado
 * (funil, fit, sinais). Mantido como redirect para nenhum link salvo/compartilhado quebrar. */
export default function Page() {
  redirect("/prospeccoes");
}
