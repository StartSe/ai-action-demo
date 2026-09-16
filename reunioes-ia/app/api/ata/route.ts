import { respostaErro } from "@/lib/ai";
import { gerarAta } from "@/lib/ata";
import { apagarTodos, listar, salvar } from "@/lib/historico";
import type { EntradaAta, FonteTranscricao } from "@/lib/types";

interface Payload {
  transcricao?: string;
  titulo?: string;
  dataReuniao?: string;
  participantes?: string;
  contexto?: string;
  emailsParticipantes?: string;
  fonteTranscricao?: FonteTranscricao | null;
}

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Payload;
  const { transcricao, titulo, dataReuniao, participantes, contexto, emailsParticipantes, fonteTranscricao } = body;
  if (!transcricao || !String(transcricao).trim()) {
    return Response.json({ error: "Cole, envie ou grave uma transcrição antes de gerar a ata." }, { status: 400 });
  }
  const dataValida = dataReuniao && DATA_VALIDA.test(dataReuniao) ? dataReuniao : undefined;
  const entrada: EntradaAta = {
    titulo: titulo || "",
    dataReuniao: dataValida,
    participantes: participantes || "",
    contexto: contexto || "",
    emailsParticipantes: emailsParticipantes || "",
    transcricao,
    fonteTranscricao: fonteTranscricao ?? null,
  };
  try {
    const { ata, meta: metaGerada } = await gerarAta({ transcricao, titulo, dataReuniao: dataValida, participantes, contexto });
    const id = salvar({ tipo: "ata", titulo: ata.titulo || titulo || "Ata da reunião", entrada, saida: ata, meta: metaGerada });
    return Response.json({ ata, meta: metaGerada, id });
  } catch (err) {
    return respostaErro(err);
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
