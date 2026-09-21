import { respostaConvite } from "@/lib/resposta-convite";
// O convite de uma entrevista (US-014): ler o que já existe (`GET`) e criar ou renovar (`POST`).
//
// `GET` nunca cria nada: abrir o diálogo do convite de uma entrevista que ainda não tem link devolve
// 409 com a frase pronta, em vez de gerar um link que ninguém pediu. Quem cria é o `POST`, que é
// também o "Reenviar convite" — estender o prazo e gerar um link novo depois de vencido são a mesma
// intenção de quem clica.
import { sessaoAtual } from "@/lib/conta";
import { conviteDaEntrevista, convidar } from "@/lib/convite";
import { baseUrl, registrarEnderecoPublico } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resultado = conviteDaEntrevista(id, baseUrl(req), sessaoAtual(req)?.nome);
  if (!resultado.ok) return Response.json({ error: resultado.erro }, { status: resultado.status });
  return Response.json({ convite: resultado.convite });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corpo = await req.json().catch(() => ({}));
  registrarEnderecoPublico(req);
  return respostaConvite(req, (progresso) => convidar({
    progresso,
    entrevistaId: id,
    expiraEmDias: corpo?.expiraEmDias,
    iniciaEm: corpo?.iniciaEm,
    expiraEm: corpo?.expiraEm,
    origem: baseUrl(req),
    remetente: sessaoAtual(req)?.nome,
  }));

}
