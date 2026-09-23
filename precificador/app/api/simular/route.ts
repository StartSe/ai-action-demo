// "O insumo subiu" e "o custo fixo aumentou": quem saiu da margem-alvo, mantendo os preços atuais.
// Simulação pura, não grava nada.
import { simular, type AlvoSimulacao } from "@/lib/carteira";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { aumentoPct?: number; alvo?: AlvoSimulacao; insumo?: string } | null;
  const aumento = Number(corpo?.aumentoPct);
  if (!Number.isFinite(aumento) || aumento <= 0 || aumento > 10) {
    return Response.json({ error: "Informe um aumento entre 1% e 1000%." }, { status: 400 });
  }
  const alvo: AlvoSimulacao = corpo?.alvo === "custo-fixo" ? "custo-fixo" : "insumo";
  const afetados = simular(aumento, { alvo, nomeInsumo: typeof corpo?.insumo === "string" ? corpo.insumo : undefined });
  return Response.json({ alvo, afetados });
}
