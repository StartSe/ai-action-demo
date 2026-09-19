// A decisão do gestor sobre um candidato (US-015 e US-023).
//
// Ela não muda o status da entrevista: uma entrevista avaliada continua avaliada, e a decisão é uma
// informação a mais — que pode ser trocada quando o gestor mudar de ideia. Quem conhece essa regra é
// `decidir()` (lib/entrevistas.ts); aqui só se confere que a entrevista existe e que a palavra é uma
// das três.
import { decidir, obter, type Decisao } from "@/lib/entrevistas";

export const dynamic = "force-dynamic";

const DECISOES: Decisao[] = ["avancar", "aguardar", "reprovar"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corpo = await req.json().catch(() => ({}));
  const decisao = corpo?.decisao;

  if (!obter(id)) return Response.json({ error: "Essa entrevista não existe mais." }, { status: 404 });
  if (!DECISOES.includes(decisao)) {
    return Response.json({ error: "Escolha uma das três decisões: avançar, aguardar ou não avançar." }, { status: 400 });
  }
  return Response.json({ entrevista: decidir(id, decisao) });
}
