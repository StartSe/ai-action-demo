// Apaga de uma vez as conversas de exemplo do modo demonstração (link do cartão do WhatsApp em
// Configurações). Depois disso elas não voltam: o app fica no estado inicial vazio.
import { apagarExemplos, contarExemplos } from "@/lib/conversas";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ quantas: contarExemplos() });
}

export async function DELETE() {
  return Response.json({ ok: true, apagadas: apagarExemplos() });
}
