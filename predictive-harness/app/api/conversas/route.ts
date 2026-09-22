import { api, body, string } from "@/lib/api";
import { garantirExemplo } from "@/lib/exemplo";
import { criarConversa, excluirConversa, listarConversas } from "@/lib/sessoes";
export const dynamic = "force-dynamic";
export async function GET() { return api(async () => { await garantirExemplo(); return { conversas: listarConversas() }; }); }
export async function POST(req: Request) { return api(async () => ({ conversa: criarConversa((await body(req)).fontes) })); }
export async function DELETE(req: Request) { return api(async () => { excluirConversa(string((await body(req)).id, 80)); return { ok: true }; }); }
