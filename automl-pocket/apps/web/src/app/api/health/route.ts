import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — verificação de saúde para o Render, o Docker e o catálogo IA para Executivos.
 * Pública (liberada no proxy.ts) e sem tocar no banco: o servidor só sobe depois de migrate.mjs,
 * então "responde" já significa "migrado e pronto".
 */
export function GET() {
  return NextResponse.json(
    { ok: true, app: "automl" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
