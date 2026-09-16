// "Enviar próximos passos ao quadro": cada passo do diagnóstico vira um cartão no quadro de tarefas conectado
// (MCP_TAREFAS). 400 quando o quadro não está conectado (com `acao` para o cartão certo), 404 sem diagnóstico.
import { DiagnosticoNaoEncontrado, enviarPassosAoQuadro, QuadroNaoConectado } from "@/lib/quadro";

export async function POST(_req: Request, { params }: RouteContext<"/api/bussola/[id]/quadro">) {
  const { id } = await params;
  try {
    return Response.json(await enviarPassosAoQuadro(id));
  } catch (err) {
    if (err instanceof DiagnosticoNaoEncontrado) return Response.json({ error: err.message }, { status: 404 });
    if (err instanceof QuadroNaoConectado) return Response.json({ error: err.message, acao: { rotulo: "Conectar o quadro", url: "/setup#mcp-tarefas" } }, { status: 400 });
    console.error(err);
    return Response.json({ error: "Não foi possível falar com o quadro de tarefas agora. Tente de novo em um minuto." }, { status: 502 });
  }
}
