import { listarConversas } from "@/lib/atendente";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(listarConversas());
}
