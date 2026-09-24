import { responderConversa, type ParametroNumero } from "../comum";
import { devolver } from "@/lib/conversas";
import { getConfig } from "@/lib/estado";

export const dynamic = "force-dynamic";

/** "Devolver para a IA": o atendente volta a responder as próximas mensagens desse cliente. */
export async function POST(_req: Request, { params }: ParametroNumero) {
  const { numero } = await params;
  // O nome vai para a linha do tempo ("Conversa devolvida para Bia").
  devolver(numero, getConfig().atendente);
  return responderConversa(numero);
}
