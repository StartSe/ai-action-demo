// Atribuir um candidato a uma vaga e já criar o convite (US-007 e US-014).
//
// Atribuir e convidar são um passo só: uma entrevista sem link é uma linha que não faz nada, e a
// pessoa de RH teria de lembrar de um segundo clique para o candidato existir do lado de fora.
// Convidar duas vezes o mesmo par não cria dois históricos: `criar()` devolve a entrevista que já
// vale (lib/entrevistas.ts) e o convite mantém o mesmo link enquanto ele não foi usado.
import { obter as obterCandidato } from "@/lib/candidatos";
import { sessaoAtual } from "@/lib/conta";
import { convidar } from "@/lib/convite";
import { criar } from "@/lib/entrevistas";
import { baseUrl, registrarEnderecoPublico } from "@/lib/setup-comum";
import { obter as obterVaga } from "@/lib/vagas";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));
  const vagaId = typeof corpo?.vagaId === "string" ? corpo.vagaId : "";
  const candidatoId = typeof corpo?.candidatoId === "string" ? corpo.candidatoId : "";

  const vaga = obterVaga(vagaId);
  if (!vaga) return Response.json({ error: "Essa vaga não existe mais." }, { status: 404 });
  if (vaga.status === "encerrada") {
    return Response.json({ error: "Esta vaga está encerrada. Reabra a vaga para chamar mais candidatos." }, { status: 400 });
  }
  const candidato = obterCandidato(candidatoId);
  if (!candidato) return Response.json({ error: "Esse candidato não existe mais." }, { status: 404 });

  registrarEnderecoPublico(req);
  const entrevista = criar({ vagaId, candidatoId });
  const resultado = convidar({
    entrevistaId: entrevista.id,
    expiraEmDias: corpo?.expiraEmDias,
    origem: baseUrl(req),
    remetente: sessaoAtual(req)?.nome,
  });
  if (!resultado.ok) return Response.json({ error: resultado.erro }, { status: resultado.status });
  return Response.json({ entrevista, convite: resultado.convite });
}
