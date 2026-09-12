import { ligacaoEnabled, ligar } from "@/lib/voz";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { telefone, vaga, requisitos, candidato } = (body || {}) as {
    telefone?: string;
    vaga?: string;
    requisitos?: string;
    candidato?: string;
  };
  if (!ligacaoEnabled()) {
    return Response.json(
      { error: "Ligação telefônica não configurada. Conecte a ElevenLabs em /setup." },
      { status: 503 }
    );
  }
  if (!telefone) {
    return Response.json({ error: "Informe o telefone do candidato." }, { status: 400 });
  }
  try {
    const resultado = await ligar({ telefone, vaga, requisitos, candidato });
    return Response.json({ ok: true, resultado });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível iniciar a ligação agora.";
    return Response.json({ error: mensagem }, { status: 502 });
  }
}
