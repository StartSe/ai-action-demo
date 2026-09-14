import { baseUrl } from "@/lib/setup-comum";
import { criar } from "@/lib/salas";

/** Cria o link de treino ("Criar link de treino" no painel) para um vendedor e/ou cenário. */
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));
  const vendedorId = typeof corpo?.vendedorId === "string" && corpo.vendedorId ? corpo.vendedorId : undefined;
  const cenarioId = typeof corpo?.cenarioId === "string" && corpo.cenarioId ? corpo.cenarioId : undefined;
  const codigo = criar({ vendedorId, cenarioId });
  return Response.json({ url: `${baseUrl(req)}/simular/${codigo}` });
}
