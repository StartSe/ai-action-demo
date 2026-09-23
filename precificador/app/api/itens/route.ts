// A carteira (GET) e a criação de um item novo (POST).
import { montarCarteira } from "@/lib/carteira";
import { criarItem } from "@/lib/itens";
import { garantirNegocio } from "@/lib/negocio";
import { negocioConfigurado, temExemplos } from "@/lib/presets";
import type { DadosItem } from "@/lib/itens";

export const dynamic = "force-dynamic";

export async function GET() {
  const carteira = montarCarteira();
  return Response.json({ ...carteira, configurado: negocioConfigurado(), temExemplos: temExemplos() });
}

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as DadosItem | null;
  if (!corpo || typeof corpo !== "object") {
    return Response.json({ error: "Não foi possível ler os dados enviados." }, { status: 400 });
  }
  if (!String(corpo.nome || "").trim()) {
    return Response.json({ error: "Dê um nome ao item." }, { status: 400 });
  }
  try {
    const negocio = garantirNegocio();
    return Response.json({ item: criarItem(negocio.id, { ...corpo, exemplo: false }) });
  } catch (err) {
    console.error("Falha ao criar o item", err);
    return Response.json({ error: "Não foi possível criar o item agora. Tente de novo." }, { status: 500 });
  }
}
