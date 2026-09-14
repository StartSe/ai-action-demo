import { gerarPainelEquipe } from "@/lib/painel-equipe";

/** "Ver o painel da equipe": recalcula a partir do histórico de conversas e salva um novo resultado. */
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));
  const diasBruto = Number(corpo?.dias);
  const dias = Number.isFinite(diasBruto) && diasBruto > 0 ? Math.round(diasBruto) : 30;
  const resultado = gerarPainelEquipe(dias);
  return Response.json(resultado);
}
