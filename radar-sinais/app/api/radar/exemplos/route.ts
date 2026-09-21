import { contarExemplos, removerExemplos } from "@/lib/radar-historico";

export async function GET() {
  return Response.json({ total: contarExemplos() });
}

export async function DELETE() {
  return Response.json({ removidos: removerExemplos() });
}
