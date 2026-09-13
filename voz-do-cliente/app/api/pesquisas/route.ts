import { criarPesquisa, listarPesquisasAtivas } from "@/lib/pesquisas";

/** "Criar pesquisa" no painel: gera o link público (/f/<código>) da pesquisa NPS. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const titulo = typeof body?.titulo === "string" ? body.titulo.trim().slice(0, 200) : "";
  const codigo = criarPesquisa(titulo);
  return Response.json({ codigo });
}

/** Lista "Pesquisas ativas" no painel. */
export async function GET() {
  const itens = listarPesquisasAtivas().map((p) => ({ codigo: p.token, titulo: p.titulo, total: p.total, criadoEm: p.criadoEm }));
  return Response.json({ itens });
}
