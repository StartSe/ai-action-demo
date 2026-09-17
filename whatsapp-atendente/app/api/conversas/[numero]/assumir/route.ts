import { responderConversa, type ParametroNumero } from "../comum";
import { assumir } from "@/lib/conversas";

export const dynamic = "force-dynamic";

/** "Assumir atendimento": a IA para de responder esse cliente até alguém devolver a conversa a ela. */
export async function POST(_req: Request, { params }: ParametroNumero) {
  const { numero } = await params;
  assumir(numero);
  return responderConversa(numero);
}
