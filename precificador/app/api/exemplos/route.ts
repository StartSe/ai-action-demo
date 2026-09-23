// Carrega um dos três negócios de exemplo (POST) ou apaga todos os itens de exemplo de uma vez
// (DELETE). Ver lib/presets.ts.
import { apagarExemplos, carregarPreset, obterPreset, PRESETS } from "@/lib/presets";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ exemplos: PRESETS.map((p) => ({ id: p.id, rotulo: p.rotulo, descricao: p.descricao })) });
}

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!corpo?.id || !obterPreset(corpo.id)) {
    return Response.json({ error: "Escolha um dos exemplos disponíveis." }, { status: 400 });
  }
  try {
    carregarPreset(corpo.id);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Falha ao carregar o exemplo", err);
    return Response.json({ error: "Não foi possível carregar o exemplo agora. Tente de novo." }, { status: 500 });
  }
}

export async function DELETE() {
  apagarExemplos();
  return Response.json({ ok: true });
}
