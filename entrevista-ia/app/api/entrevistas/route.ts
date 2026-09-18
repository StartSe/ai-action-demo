// Abrir a entrevista de um candidato numa vaga (US-007).
//
// O convite em si — o link público, o prazo e a mensagem pronta — é da US-014: aqui a entrevista
// nasce `convidada` e sem código, e é por isso que a tela da vaga mostra "Aguardando convite"
// enquanto `codigo` não existe. Convidar duas vezes o mesmo par não cria dois históricos: `criar()`
// devolve a entrevista que já vale (lib/entrevistas.ts).
import { obter as obterCandidato } from "@/lib/candidatos";
import { criar } from "@/lib/entrevistas";
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

  return Response.json({ entrevista: criar({ vagaId, candidatoId }) });
}
