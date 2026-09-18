// "Ler o currículo de novo" (US-009): monta a ficha a partir do texto do currículo já guardado.
//
// Existe por causa de dois caminhos que o cadastro deixa em aberto de propósito: a leitura que
// estourou o prazo de 20 s e o currículo cujo texto só chegou depois, colado à mão. Nos dois o
// candidato já está salvo — falta a ficha, e pedir isso não pode custar refazer o cadastro.
//
// O resultado é MESCLADO com o que já existia (`mesclar`, lib/ficha.ts), nunca gravado por cima: o
// que o gestor corrigiu à mão e o que a pesquisa na web encontrou continuam lá. É a D5 inteira, e é o
// motivo de a regra morar no módulo em vez de aqui.
import { atualizar, obter, obterCvTexto } from "@/lib/candidatos";
import { fichaDoCurriculo, mesclar } from "@/lib/ficha";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidato = obter(id);
  if (!candidato) return Response.json({ error: "Esse candidato não existe mais." }, { status: 404 });

  const cvTexto = obterCvTexto(id) ?? "";
  if (!cvTexto.trim()) {
    return Response.json(
      { error: "Não há texto de currículo guardado para este candidato. Envie o currículo de novo ou cole o texto dele." },
      { status: 400 },
    );
  }

  const { ficha, aviso } = await fichaDoCurriculo({ candidatoId: id, nome: candidato.nome, cvTexto });
  if (!ficha) return Response.json({ error: aviso ?? "Não foi possível montar a ficha agora. Tente de novo em um minuto." }, { status: 502 });

  return Response.json({ candidato: atualizar(id, { ficha: mesclar(candidato.ficha, ficha, "cv") }) });
}
