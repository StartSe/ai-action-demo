// A base de FP&A: planilhas com papel, produtos e turmas, premissas efetivas por produto (com origem),
// trimestre de referência, avisos e as perguntas sugeridas por categoria. Garante as planilhas de exemplo.
import { comConversa, listarConversas } from "@/lib/sessoes";
import { contexto } from "@/lib/contexto";
import { api } from "@/lib/api";
import { garantirExemplo } from "@/lib/exemplo";
import { lerLinhas } from "@/lib/planilhas";
import { montarBase, premissasDeTodos } from "@/lib/base";
import { sugestoesIniciais } from "@/lib/conversa";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return api(async () => {
    const planilhas = await garantirExemplo();
    listarConversas();
    const id = new URL(req.url).searchParams.get("conversa");
    const base = id ? comConversa(id, () => montarBase(planilhas, lerLinhas, contexto.getStore()?.fontes)) : montarBase(planilhas, lerLinhas);
    return {
      planilhas: base.planilhas,
      matriculas: base.matriculas?.id || null,
      custos: base.custos?.id || null,
      marketing: base.marketing?.id || null,
      produtos: base.produtos,
      premissas: premissasDeTodos(base),
      periodo: base.periodo,
      baseline: base.baseline,
      avisos: base.avisos,
      demo: base.demo,
      sugestoes: sugestoesIniciais(base),
    };
  });
}
