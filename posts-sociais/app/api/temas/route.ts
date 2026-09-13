import { getTemas, salvarTemas, type Tema } from "@/lib/temas";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ itens: getTemas() });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { itens?: unknown };
  const bruto = Array.isArray(body.itens) ? body.itens : [];
  const itens: Tema[] = bruto
    .map((i) => {
      const tema = String((i as { tema?: unknown })?.tema || "").trim();
      const tom = String((i as { tom?: unknown })?.tom || "").trim();
      return { tema, tom };
    })
    .filter((i) => i.tema);
  salvarTemas(itens);
  return Response.json({ itens });
}
