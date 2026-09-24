import { api, body, string, AppError } from "@/lib/api";
import { garantirExemplo } from "@/lib/exemplo";
import { criarConversa, excluirConversa, listarConversas, fixarConversa, renomearConversa } from "@/lib/sessoes";
export const dynamic = "force-dynamic";
export async function GET() { return api(async () => { await garantirExemplo(); return { conversas: listarConversas() }; }); }
export async function POST(req: Request) { return api(async () => ({ conversa: criarConversa((await body(req)).fontes) })); }
export async function DELETE(req: Request) { return api(async () => { excluirConversa(string((await body(req)).id, 80)); return { ok: true }; }); }

export async function PATCH(req: Request) {
  return api(async () => {
    const b = await body(req);
    const id = string(b.id, 80);
    if ("titulo" in b && "fixada" in b) throw new AppError("Altere o nome ou a fixação, uma ação de cada vez.");
    return { conversa: "titulo" in b ? renomearConversa(id, b.titulo) : fixarConversa(id, b.fixada) };
  });
}
