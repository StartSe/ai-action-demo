import { aiEnabled, meta } from "@/lib/ai";
import { listarConversas } from "@/lib/conversas";

export const dynamic = "force-dynamic";

/** Não salva no histórico: é só a leitura da lista atual de conversas, não uma ação nova. */
export async function GET() {
  const metaGerada = meta({ demo: !aiEnabled(), insumo: "conversas recebidas pelo simulador e pelo WhatsApp" });
  return Response.json({ itens: listarConversas(), meta: metaGerada });
}
