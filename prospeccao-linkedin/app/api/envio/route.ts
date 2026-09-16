import { respostaErro } from "@/lib/ai";
import { andamentoCampanha, enviarCampanha, planoEnvio } from "@/lib/envio";
import { CampanhaNaoEncontrada, ErroDePedido } from "@/lib/leads";
import { ErroProspectHalo } from "@/lib/prospecthalo";

function responderErro(err: unknown) {
  if (err instanceof ErroDePedido) return Response.json({ error: err.message }, { status: 400 });
  if (err instanceof CampanhaNaoEncontrada) return Response.json({ error: err.message }, { status: 404 });
  if (err instanceof ErroProspectHalo) return Response.json({ error: err.message, acao: err.acao }, { status: err.status });
  return respostaErro(err);
}

/**
 * { campanhaId, confirmar }: sem confirmar (ou false) devolve o plano do envio ({ plano }) para aprovação;
 * com confirmar: true cria a campanha no Prospect Halo e devolve { campanha, mensagem }.
 */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { campanhaId?: unknown; confirmar?: unknown };
  const campanhaId = String(corpo.campanhaId || "").trim();
  if (!campanhaId) return Response.json({ error: "Busque os leads e escreva as mensagens antes de enviar." }, { status: 400 });
  try {
    if (corpo.confirmar === true) {
      const { campanha, mensagem } = await enviarCampanha(campanhaId);
      return Response.json({ campanha, mensagem });
    }
    return Response.json({ plano: planoEnvio(campanhaId) });
  } catch (err) {
    return responderErro(err);
  }
}

/** ?campanhaId=...: andamento da campanha enviada, consultado no Prospect Halo ({ texto, bruto, externoId }). */
export async function GET(req: Request) {
  const campanhaId = new URL(req.url).searchParams.get("campanhaId")?.trim() || "";
  if (!campanhaId) return Response.json({ error: "Informe a campanha." }, { status: 400 });
  try {
    return Response.json(await andamentoCampanha(campanhaId));
  } catch (err) {
    return responderErro(err);
  }
}
