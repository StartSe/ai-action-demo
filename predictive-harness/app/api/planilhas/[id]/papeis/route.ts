// A pessoa confirma ou corrige o papel de FP&A de cada coluna.
import { api, body, AppError } from "@/lib/api";
import { definirPapeis } from "@/lib/planilhas";
export const dynamic = "force-dynamic";
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const b = await body(req);
    const papeis = b.papeis;
    if (!papeis || typeof papeis !== "object" || Array.isArray(papeis)) throw new AppError("Envie os papéis por coluna.");
    for (const v of Object.values(papeis as Record<string, unknown>)) if (typeof v !== "string") throw new AppError("Cada papel precisa ser um texto.");
    return { planilha: definirPapeis((await params).id, papeis as Record<string, string>) };
  });
}
