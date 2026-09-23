import { responderConversa, type ParametroNumero } from "../comum";
import { classificarEmSegundoPlano } from "@/lib/atendente";
import { resolver } from "@/lib/conversas";
import { atualizarMemoriaEmSegundoPlano } from "@/lib/memoria";

export const dynamic = "force-dynamic";

/** "Marcar como resolvida": o assunto acabou. Uma mensagem nova do cliente reabre a conversa. */
export async function POST(_req: Request, { params }: ParametroNumero) {
  const { numero } = await params;
  resolver(numero);
  // Conversa terminada: o assunto é reescrito, porque ele pode ter mudado do começo ao fim dela, e o
  // que valer a pena lembrar do cliente é anotado mesmo com poucas mensagens novas — resolvida, esta é
  // a última chance de guardar o que foi combinado (lib/memoria.ts).
  classificarEmSegundoPlano(numero, { refazer: true });
  atualizarMemoriaEmSegundoPlano(numero, { aoResolver: true });
  return responderConversa(numero);
}
