// Uma entrevista inteira, para a tela do parecer (US-023).
//
// Uma volta só ao servidor traz candidato, vaga, parecer e a conversa: a tela mostra as quatro
// coisas juntas e, enquanto o parecer não fica pronto, ela relê este mesmo endereço a cada cinco
// segundos. Quatro pedidos por sondagem seriam quatro vezes mais barulho para a mesma resposta.
import { entrevistaNaTela } from "@/lib/painel";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entrevista = entrevistaNaTela(id);
  if (!entrevista) return Response.json({ error: "Essa entrevista não existe mais." }, { status: 404 });
  return Response.json({ entrevista });
}
