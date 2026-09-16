import { getEmpresaTemas, getTemas, salvarEmpresaTemas, salvarTemas, type Tema } from "@/lib/temas";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ itens: getTemas(), empresa: getEmpresaTemas() });
}

/** Substitui a lista inteira de temas e o nome da empresa usados pela rotina semanal. */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { itens?: unknown; empresa?: unknown };
  const bruto = Array.isArray(body.itens) ? body.itens : [];
  const itens: Tema[] = bruto
    .map((i) => {
      const tema = String((i as { tema?: unknown })?.tema || "").trim();
      const tom = String((i as { tom?: unknown })?.tom || "").trim();
      return { tema, tom };
    })
    .filter((i) => i.tema);
  const empresa = String(body.empresa ?? "").trim().slice(0, 120);
  salvarTemas(itens);
  salvarEmpresaTemas(empresa);
  return Response.json({ itens, empresa });
}
