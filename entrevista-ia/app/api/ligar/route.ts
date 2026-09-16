import { responderErro } from "@/app/api/erros";
import { ACAO_LIGACAO } from "@/lib/acoes";
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
      { error: "A ligação telefônica automática ainda não foi conectada.", codigo: "ligacao_desligada", acao: ACAO_LIGACAO },
      { status: 400 }
    );
  }
  if (!telefone) {
    return Response.json({ error: "Informe o telefone do candidato, com o código do país." }, { status: 400 });
  }
  try {
    const resultado = await ligar({ telefone, vaga, requisitos, candidato });
    return Response.json({ ok: true, resultado });
  } catch (err) {
    return responderErro(err, "Não foi possível iniciar a ligação agora. Tente de novo em um minuto.");
  }
}
