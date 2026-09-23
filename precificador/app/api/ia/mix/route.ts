// Prompt 3 — o diagnóstico do mix: o que a carteira inteira está dizendo.
// Salva no histórico para poder ser reaberto por link (/r/[id]) e impresso.
import { respostaErro } from "@/lib/ai";
import { montarCarteira } from "@/lib/carteira";
import { diagnosticarMix } from "@/lib/ia";
import { salvar } from "@/lib/historico";

export const dynamic = "force-dynamic";

export async function POST() {
  const { linhas } = montarCarteira();
  if (linhas.length === 0) {
    return Response.json({ error: "Cadastre pelo menos um item antes de pedir o diagnóstico." }, { status: 400 });
  }

  try {
    const { diagnostico, meta } = await diagnosticarMix();
    const id = salvar({
      tipo: "diagnostico-mix",
      titulo: `Diagnóstico de ${linhas.length} ${linhas.length === 1 ? "item" : "itens"}`,
      resumo: diagnostico.resumo,
      entrada: { itens: linhas.map((l) => ({ nome: l.item.nome, preco: l.preco, margem: l.derivados.margemLiquidaPct, estado: l.estado })) },
      saida: diagnostico,
      meta,
    });
    return Response.json({ diagnostico, meta, id });
  } catch (err) {
    return respostaErro(err);
  }
}
