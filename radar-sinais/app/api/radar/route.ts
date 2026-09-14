import { apagarTodos, listar, salvar } from "@/lib/historico";
import { ErroBusca, montarRadar, PERIODOS_VALIDOS } from "@/lib/radar";
import type { DadosRadar } from "@/lib/types";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const temas = Array.isArray(body?.temas) ? body.temas.map((t: unknown) => String(t).trim()).filter(Boolean) : [];
  const periodoDias = PERIODOS_VALIDOS.includes(Number(body?.periodoDias)) ? Number(body.periodoDias) : undefined;
  const setor = typeof body?.setor === "string" ? body.setor.trim() : "";

  if (temas.length === 0) {
    return Response.json({ error: "Informe ao menos um tema para acompanhar, um por linha." }, { status: 400 });
  }
  if (!periodoDias) {
    return Response.json({ error: "Escolha um período válido: 7, 30 ou 90 dias." }, { status: 400 });
  }

  const dados: DadosRadar = { temas, periodoDias, setor: setor || undefined };
  const titulo = `Radar de sinais: ${temas.slice(0, 2).join(", ")}${temas.length > 2 ? "..." : ""}`;

  try {
    const { meta: metaGerada, ...radar } = await montarRadar(dados);
    const id = salvar({ tipo: "radar", titulo, entrada: dados, saida: radar, meta: metaGerada });
    return Response.json({ radar, meta: metaGerada, id });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível montar o radar agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: err instanceof ErroBusca ? 502 : 500 });
  }
}

/** Últimos radares salvos, para a lista "Últimos resultados" no painel. */
export async function GET() {
  return Response.json({ itens: listar(10) });
}

/** Apaga todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}
