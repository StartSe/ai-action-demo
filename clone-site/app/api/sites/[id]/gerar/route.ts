// Dispara a geração em segundo plano e responde 202 na hora, com o projeto já em `gerando`.
// 409 quando já está gerando; 400 quando já está pronto (mudanças passam pelo agente).
import { ErroDePedido } from "@/lib/gerador";
import { iniciarGeracao, obter, ProjetoNaoEncontrado } from "@/lib/projetos";
import { respostaErroSites } from "@/lib/resposta-sites";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: RouteContext<"/api/sites/[id]">) {
  const { id } = await params;
  try {
    const atual = obter(id);
    if (!atual) throw new ProjetoNaoEncontrado();
    if (atual.estado === "gerando") return Response.json({ error: "Este site já está sendo gerado.", projeto: atual }, { status: 409 });
    const projeto = iniciarGeracao(id);
    return Response.json({ projeto }, { status: 202 });
  } catch (err) {
    if (err instanceof ErroDePedido) return Response.json({ error: err.message }, { status: 400 });
    return respostaErroSites(err);
  }
}
