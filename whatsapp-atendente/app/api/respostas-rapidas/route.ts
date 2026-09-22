import { normalizarAtalho } from "@/lib/atalhos";
import { criarRespostaRapida, erroDeRespostaRapida, listarRespostasRapidas } from "@/lib/respostas-rapidas";

export const dynamic = "force-dynamic";

/** As frases prontas da equipe, em ordem de atalho. Sempre devolve a lista inteira: ela é curta. */
export async function GET() {
  return Response.json({ itens: listarRespostasRapidas() });
}

/**
 * Cadastra uma resposta rápida. O atalho é normalizado antes de tudo (a barra da frente, o acento e o
 * espaço saem), e o que impedir a gravação volta como frase de negócio com 400 — nunca como erro do
 * banco. Devolve a lista inteira já atualizada, para a tela não precisar de uma segunda consulta.
 */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { atalho?: string; texto?: string };
  const atalho = normalizarAtalho(String(corpo.atalho || ""));
  const texto = String(corpo.texto || "").trim();

  const erro = erroDeRespostaRapida({ atalho, texto });
  if (erro) return Response.json({ error: erro }, { status: 400 });

  const criada = criarRespostaRapida({ atalho, texto });
  return Response.json({ item: criada, itens: listarRespostasRapidas() });
}
