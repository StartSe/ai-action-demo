// Toda pesquisa aguarda revisão explícita antes de mesclar os dados na ficha.
import { atualizar, listarFontesResumidas, obter } from "@/lib/candidatos";
import { decidirIdentidade } from "@/lib/ficha";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidato = obter(id);
  if (!candidato) return Response.json({ error: "Esse candidato não existe mais." }, { status: 404 });

  const corpo = await req.json().catch(() => ({}));
  const escolha = corpo?.escolha;
  if (escolha !== null && !Number.isInteger(escolha)) {
    return Response.json({ error: "Diga qual das pessoas é o candidato, ou que nenhuma delas é." }, { status: 400 });
  }

  const identidades = candidato.ficha?.web?.identidades ?? [];
  if (escolha !== null && !identidades[escolha as number]) {
    return Response.json({ error: "Essa opção não está mais na lista. Recarregue a página e escolha de novo." }, { status: 400 });
  }

  // As fontes entram para separar os homônimos: o que saiu da página de outra pessoa não é mesclado.
  const ficha = decidirIdentidade(candidato.ficha, escolha as number | null, listarFontesResumidas(id));
  return Response.json({ candidato: atualizar(id, { ficha, identidadeConfirmada: true }) });
}
