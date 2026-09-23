import { obter, ProjetoNaoEncontrado } from "@/lib/projetos";
import { listarPublicacoes, registrarPublicacao } from "@/lib/publicacoes";
import { respostaErroSites } from "@/lib/resposta-sites";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = obter(id);
  if (!p) return respostaErroSites(new ProjetoNaoEncontrado());
  // Importa somente o estado conhecido de instalações antigas, sem inventar publicações anteriores.
  const registros = listarPublicacoes(id);
  if (p.versaoPublicada && !registros.some((r) => r.destino === "local")) registrarPublicacao({ projetoId: id, destino: "local", versao: p.versaoPublicada, anterior: null, tipo: "publicacao", url: `/s/${p.slug}`, deployId: null });
  if (p.netlify?.versao && !registros.some((r) => r.destino === "netlify")) registrarPublicacao({ projetoId: id, destino: "netlify", versao: p.netlify.versao, anterior: null, tipo: "publicacao", url: p.netlify.url, deployId: p.netlify.deployId ?? null });
  return Response.json({ publicacoes: listarPublicacoes(id) }, { headers: { "Cache-Control": "no-store" } });
}
