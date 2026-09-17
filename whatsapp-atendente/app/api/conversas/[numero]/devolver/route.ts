import { responderConversa, type ParametroNumero } from "../comum";
import { devolver } from "@/lib/conversas";

export const dynamic = "force-dynamic";

/** "Devolver para a IA": o atendente volta a responder as próximas mensagens desse cliente. */
export async function POST(_req: Request, { params }: ParametroNumero) {
  const { numero } = await params;
  devolver(numero);
  return responderConversa(numero);
}
