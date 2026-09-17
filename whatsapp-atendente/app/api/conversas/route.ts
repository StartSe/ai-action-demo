import { aiEnabled, meta } from "@/lib/ai";
import { listarConversas, semearExemplosSeVazio } from "@/lib/conversas";
import { WHATSAPP } from "@/lib/integracoes";
import { integracaoConfigurada } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

/** Não salva no histórico: é só a leitura da lista atual de conversas, não uma ação nova. */
export async function GET() {
  // Primeira leitura de um app sem conversa nenhuma e sem número conectado: as conversas de exemplo
  // nascem aqui, uma única vez, para as telas não abrirem vazias em uma demonstração.
  semearExemplosSeVazio({ numeroConectado: integracaoConfigurada(WHATSAPP) });
  const metaGerada = meta({ demo: !aiEnabled(), insumo: "conversas recebidas pelo simulador e pelo WhatsApp" });
  return Response.json({ itens: listarConversas(), meta: metaGerada });
}
