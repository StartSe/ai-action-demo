import { iniciarQualificacaoProfunda, instagramValido, qualificacaoAtual } from "@/lib/qualificacao-profunda";
import { obterLead } from "@/lib/workspace";

export async function GET(_req: Request, { params }: RouteContext<"/api/leads/[id]/qualificacao">) {
  const { id } = await params;
  if (!obterLead(id)) return Response.json({ error: "Pessoa não encontrada." }, { status: 404 });
  return Response.json({ qualificacao: qualificacaoAtual(id) });
}
export async function POST(req: Request, { params }: RouteContext<"/api/leads/[id]/qualificacao">) {
  const { id } = await params;
  if (!obterLead(id)) return Response.json({ error: "Pessoa não encontrada." }, { status: 404 });
  const corpo = await req.json().catch(() => ({}));
  const instagram = typeof corpo?.instagram === "string" ? corpo.instagram.trim() : "";
  if (instagram && !instagramValido(instagram)) return Response.json({ error: "Informe o endereço de um perfil público do Instagram, como https://www.instagram.com/perfil/." }, { status: 400 });
  return Response.json({ qualificacao: iniciarQualificacaoProfunda(id, instagram || undefined, corpo?.repetir === true) }, { status: 202 });
}
