import { responderConversa, type ParametroNumero } from "../comum";
import { classificarEmSegundoPlano } from "@/lib/atendente";
import { resolver } from "@/lib/conversas";

export const dynamic = "force-dynamic";

/** "Marcar como resolvida": o assunto acabou. Uma mensagem nova do cliente reabre a conversa. */
export async function POST(_req: Request, { params }: ParametroNumero) {
  const { numero } = await params;
  resolver(numero);
  // Conversa terminada: o assunto é reescrito, porque ele pode ter mudado do começo ao fim dela.
  classificarEmSegundoPlano(numero, { refazer: true });
  return responderConversa(numero);
}
