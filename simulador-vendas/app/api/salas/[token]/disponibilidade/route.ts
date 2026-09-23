import { obter } from "@/lib/simulacoes";

// Só a disponibilidade é pública; nenhum dado do treino ou da pessoa atravessa esta rota.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return Response.json({ status: obter(token)?.status ?? "indisponivel" }, { headers: { "Cache-Control": "no-store" } });
}
