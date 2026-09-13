import { listarCandidatosDaVaga } from "@/lib/entrevista";

/** Candidatos já avaliados desta vaga, para o bloco "Candidatos desta vaga" no painel. */
export async function GET(req: Request) {
  const vagaTitulo = new URL(req.url).searchParams.get("vaga") || "";
  return Response.json({ itens: listarCandidatosDaVaga(vagaTitulo) });
}
