import { respostaErro } from "@/lib/ai";
import { encerrarRodada, rodadaValida } from "@/lib/andamento";
import { apagarTodos, listarPorTipo, salvar } from "@/lib/historico";
import { ErroBusca, montarRadar, PERIODOS_VALIDOS } from "@/lib/radar";
import type { DadosRadar, Radar } from "@/lib/types";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const temas = Array.isArray(body?.temas) ? body.temas.map((t: unknown) => String(t).trim()).filter(Boolean) : [];
  const periodoDias = PERIODOS_VALIDOS.includes(Number(body?.periodoDias)) ? Number(body.periodoDias) : undefined;
  const setor = typeof body?.setor === "string" ? body.setor.trim() : "";
  const rodada = rodadaValida(body?.rodada);

  if (temas.length === 0 || temas.length > 12 || temas.some((t: string) => t.length > 200) || setor.length > 200) {
    return Response.json({ error: "Informe de 1 a 12 temas de até 200 caracteres e um setor de até 200 caracteres." }, { status: 400 });
  }
  if (!periodoDias) {
    return Response.json({ error: "Escolha um período válido: 7, 30 ou 90 dias." }, { status: 400 });
  }

  const dados: DadosRadar = { temas, periodoDias, setor: setor || undefined };
  const titulo = `Radar de sinais: ${temas.slice(0, 2).join(", ")}${temas.length > 2 ? "..." : ""}`;

  try {
    const { meta: metaGerada, ...radar } = await montarRadar(dados, { rodada });
    const id = salvar({ tipo: "radar", titulo, entrada: dados, saida: radar, meta: metaGerada });
    return Response.json({ radar, meta: metaGerada, id });
  } catch (err) {
    // Nenhuma fonte de busca respondeu: problema do lado de fora (502), com a frase já pronta para a tela.
    if (err instanceof ErroBusca) return Response.json({ error: err.message, codigo: "busca" }, { status: 502 });
    return respostaErro(err);
  } finally {
    if (rodada) encerrarRodada(rodada);
  }
}

/** Últimos radares salvos (com os temas, para "Refazer com estes temas") para a lista "Últimos resultados". */
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("ultimo") === "1") {
    const ultimo = listarPorTipo<DadosRadar, Radar, { demo: boolean }>("radar", 30).find(r => !r.meta.demo);
    return Response.json(ultimo ? { radar: ultimo.saida, dados: ultimo.entrada, meta: ultimo.meta, id: ultimo.id } : null);
  }
  const itens = listarPorTipo<DadosRadar, Radar>("radar", 10).map((r) => ({ id: r.id, titulo: r.titulo, criadoEm: r.criadoEm, entrada: r.entrada }));
  return Response.json({ itens });
}

/** Apaga todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}
