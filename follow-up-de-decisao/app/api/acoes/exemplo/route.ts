import { criarAcao, listarAcoes } from "@/lib/acoes";
import { acoesDemo } from "@/lib/demo";

function prazoDaqui(dias: number | null): string | undefined {
  if (dias === null) return undefined;
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Preencher com um exemplo" da lista vazia: cadastra ações plausíveis de verdade (não é uma prévia
 * só visual) — a pessoa pode editar, concluir ou apagar como qualquer outra ação. Não duplica se a
 * lista já tiver alguma ação (ex.: ?exemplo=1 chamado de novo numa lista que já foi preenchida). */
export async function POST() {
  if (listarAcoes().length > 0) {
    return Response.json({ itens: listarAcoes() });
  }
  for (const a of acoesDemo()) {
    criarAcao({ titulo: a.titulo, dono: a.dono, prazo: prazoDaqui(a.diasPrazo), origem: "manual" });
  }
  return Response.json({ itens: listarAcoes() }, { status: 201 });
}
