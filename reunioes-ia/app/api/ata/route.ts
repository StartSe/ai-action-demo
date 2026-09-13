import { gerarAta } from "@/lib/ata";
import { apagarTodos, listar, salvar } from "@/lib/historico";
import type { FonteTranscricao } from "@/lib/types";

interface Payload {
  transcricao?: string;
  titulo?: string;
  participantes?: string;
  contexto?: string;
  fonteTranscricao?: FonteTranscricao | null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Payload;
  const { transcricao, titulo, participantes, contexto, fonteTranscricao } = body;
  if (!transcricao || !String(transcricao).trim()) {
    return Response.json({ error: "Cole, envie ou grave uma transcrição antes de gerar a ata." }, { status: 400 });
  }
  const entrada = { titulo: titulo || "", participantes: participantes || "", contexto: contexto || "", transcricao, fonteTranscricao: fonteTranscricao ?? null };
  try {
    const { ata, meta: metaGerada } = await gerarAta({ transcricao, titulo, participantes, contexto });
    const id = salvar({ tipo: "ata", titulo: ata.titulo || titulo || "Ata da reunião", entrada, saida: ata, meta: metaGerada });
    return Response.json({ ata, meta: metaGerada, id });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível gerar a ata agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}

/** Últimos resultados salvos, para a lista "Últimos resultados" no painel. */
export async function GET() {
  return Response.json({ itens: listar(10) });
}

/** Apaga todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}
