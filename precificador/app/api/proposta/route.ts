// Aplica o rascunho que saiu da conversa, depois de a pessoa confirmar.
import { aplicarProposta } from "@/lib/aplicar-proposta";
import type { Proposta } from "@/lib/proposta";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { proposta?: Proposta } | null;
  const proposta = corpo?.proposta;
  if (!proposta || typeof proposta !== "object" || !proposta.negocio) {
    return Response.json({ error: "Não foi possível ler o rascunho enviado." }, { status: 400 });
  }
  if (!Array.isArray(proposta.itens) || !Array.isArray(proposta.fixos) || !Array.isArray(proposta.canais)) {
    return Response.json({ error: "O rascunho veio em um formato inesperado." }, { status: 400 });
  }

  try {
    return Response.json(aplicarProposta(proposta));
  } catch (err) {
    console.error("Falha ao aplicar o rascunho", err);
    return Response.json({ error: "Não foi possível aplicar o rascunho agora. Tente de novo." }, { status: 500 });
  }
}
