// Quem está em cada etapa desta vaga (US-007): a tabela "Candidatos" da página da vaga.
//
// A junção com candidato e parecer mora em `lib/painel.ts`, e não aqui: a tela do candidato (US-013)
// e a tela Entrevistas (US-015) mostram as mesmas colunas com outro filtro.
import { listarEntrevistasNoPainel } from "@/lib/painel";
import { obter } from "@/lib/vagas";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!obter(id)) return Response.json({ error: "Essa vaga não existe mais." }, { status: 404 });
  return Response.json({ itens: listarEntrevistasNoPainel({ vagaId: id }) });
}
