import { obter, paginaDoProjeto, ProjetoNaoEncontrado } from "@/lib/projetos";
import { respostaErroSites } from "@/lib/resposta-sites";
import { cabecalhosSite } from "@/lib/publicacao";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = obter(id);
  if (!p) return respostaErroSites(new ProjetoNaoEncontrado());
  const pagina = paginaDoProjeto(p)?.pagina;
  return new Response(pagina?.versoes.at(-1)?.html ?? "", { headers: cabecalhosSite() });
}
