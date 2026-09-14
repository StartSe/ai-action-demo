// Lançamento manual de uma fatura de ferramenta de IA ("Lançar manualmente", em Mais detalhes do
// painel). Leitores automáticos de e-mail/PDF chegam em histórias futuras (US-020/US-021); por
// enquanto, gravar via lib/faturas.ts é a única forma de ter dados reais no app.
import { converterParaBRL } from "@/lib/integracoes";
import { salvar } from "@/lib/faturas";
import type { Moeda } from "@/lib/types";

export const dynamic = "force-dynamic";

const MOEDAS_VALIDAS: Moeda[] = ["BRL", "USD", "EUR"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const fornecedor = String(body?.fornecedor || "").trim();
  const ferramenta = String(body?.ferramenta || "").trim();
  const valor = Number(body?.valor);
  const moeda: Moeda = MOEDAS_VALIDAS.includes(body?.moeda) ? body.moeda : "BRL";
  const data = String(body?.data || "").trim();

  if (!fornecedor) return Response.json({ error: "Informe o fornecedor." }, { status: 400 });
  if (!ferramenta) return Response.json({ error: "Informe a ferramenta." }, { status: 400 });
  if (!Number.isFinite(valor) || valor <= 0) return Response.json({ error: "Informe um valor maior que zero." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return Response.json({ error: "Informe uma data válida." }, { status: 400 });

  const fatura = salvar({
    fornecedor,
    ferramenta,
    categoria: "Lançamento manual",
    valor,
    moeda,
    valorBRL: converterParaBRL(valor, moeda),
    data,
    periodicidade: "mensal",
    origem: "manual",
  });

  return Response.json({ fatura });
}
