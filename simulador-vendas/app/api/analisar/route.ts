import { apagarTodos, listar } from "@/lib/historico";
import { gerarAnalise } from "@/lib/analise";
import { CRITERIOS_PADRAO } from "@/lib/criterios";
import type { DadosAnalise } from "@/lib/types";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as Partial<DadosAnalise>;
  const conversaColada = String(corpo.conversaColada || "").trim();
  if (!conversaColada) {
    return Response.json({ error: "Cole a conversa antes de analisar (uma fala por linha, com \"Vendedor:\" ou \"Cliente:\")." }, { status: 400 });
  }
  const criterios = Array.isArray(corpo.criterios) && corpo.criterios.length > 0 ? corpo.criterios.map((c) => String(c || "").trim()).filter(Boolean) : CRITERIOS_PADRAO;
  const dados: DadosAnalise = {
    conversaColada,
    vendedorId: corpo.vendedorId || undefined,
    cenarioId: corpo.cenarioId || undefined,
    criterios,
  };
  try {
    const resultado = await gerarAnalise(dados);
    return Response.json(resultado);
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível analisar a conversa agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}

/** Últimas análises salvas, para a lista "Últimos resultados" no painel. */
export async function GET() {
  return Response.json({ itens: listar(10).filter((r) => r.tipo === "conversa") });
}

/** Apaga todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}
