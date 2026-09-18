// As entrevistas deste candidato (US-013): o bloco "Entrevistas" da tela do candidato.
//
// A junção com vaga e parecer mora em `lib/painel.ts`, a mesma que a página da vaga usa com outro
// filtro — as duas telas mostram as mesmas colunas sobre a mesma entrevista.
import { obter } from "@/lib/candidatos";
import { listarEntrevistasNoPainel } from "@/lib/painel";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!obter(id)) return Response.json({ error: "Esse candidato não existe mais." }, { status: 404 });
  return Response.json({ itens: listarEntrevistasNoPainel({ candidatoId: id }) });
}
