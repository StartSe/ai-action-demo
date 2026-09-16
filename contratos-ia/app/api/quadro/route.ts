// "Enviar pontos a negociar como tarefas": cada cláusula de risco vira um cartão no quadro de tarefas
// conectado (MCP_TAREFAS). 400 quando o quadro não está conectado ou o contrato não foi guardado.
import { ContratoNaoEncontrado, enviarPontosAoQuadro, QuadroNaoConectado } from "@/lib/quadro";

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const id = typeof corpo?.id === "string" ? corpo.id : "";
  try {
    return Response.json(await enviarPontosAoQuadro(id));
  } catch (err) {
    if (err instanceof ContratoNaoEncontrado) return Response.json({ error: err.message }, { status: 400 });
    if (err instanceof QuadroNaoConectado) return Response.json({ error: err.message, acao: { rotulo: "Conectar o quadro", url: "/setup#mcp-tarefas" } }, { status: 400 });
    console.error(err);
    return Response.json({ error: "Não foi possível falar com o quadro de tarefas agora. Tente de novo em um minuto." }, { status: 502 });
  }
}
