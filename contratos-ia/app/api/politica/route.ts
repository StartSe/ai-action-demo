import { getPolitica, politicaCadastrada, salvarPolitica, type PoliticaContratos } from "@/lib/politica";

export const dynamic = "force-dynamic";

export async function GET() {
  const politica = getPolitica();
  return Response.json({ ...politica, cadastrada: politicaCadastrada(politica) });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<PoliticaContratos>;
  const numeroOuNulo = (v: unknown): number | null => {
    const n = Number(v);
    return v !== null && v !== undefined && v !== "" && Number.isFinite(n) ? n : null;
  };
  const politica: PoliticaContratos = {
    multaMaximaPct: numeroOuNulo(body.multaMaximaPct),
    prazoMaximoMeses: numeroOuNulo(body.prazoMaximoMeses),
    avisoPrevioMinimoDias: numeroOuNulo(body.avisoPrevioMinimoDias),
    foroPreferido: String(body.foroPreferido || "").trim(),
    exigencias: {
      sla: Boolean(body.exigencias?.sla),
      protecaoDados: Boolean(body.exigencias?.protecaoDados),
      propriedadeProgressiva: Boolean(body.exigencias?.propriedadeProgressiva),
    },
    textoLivre: String(body.textoLivre || "").trim(),
  };
  salvarPolitica(politica);
  return Response.json({ ...politica, cadastrada: politicaCadastrada(politica) });
}
