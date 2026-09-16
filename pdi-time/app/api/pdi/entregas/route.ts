// "Buscar entregas no quadro" (painel): cartões concluídos pela pessoa no quadro de tarefas conectado
// (lib/entregas-quadro.ts). Rota privada (sessão da conta, via proxy.ts), própria deste app.
import { buscarEntregasNoQuadro, entregasComoTexto, QuadroNaoConectado } from "@/lib/entregas-quadro";

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const nome = typeof corpo?.nome === "string" ? corpo.nome.trim() : "";
  if (!nome) return Response.json({ error: "Informe o nome da pessoa antes de buscar as entregas no quadro." }, { status: 400 });
  try {
    const entregas = await buscarEntregasNoQuadro(nome);
    return Response.json({ entregas, texto: entregasComoTexto(entregas) });
  } catch (err) {
    if (err instanceof QuadroNaoConectado) {
      return Response.json({ error: err.message, acao: { rotulo: "Conectar o quadro", url: "/setup#mcp-tarefas" } }, { status: 400 });
    }
    // lib/mcp-cliente.ts e lib/entregas-quadro.ts já lançam frases curadas (sem status HTTP nem corpo remoto).
    console.error("Falha ao buscar entregas no quadro:", err);
    const mensagem = err instanceof Error && err.message ? err.message : "Não foi possível ler o quadro agora. Tente de novo em alguns minutos.";
    return Response.json({ error: mensagem }, { status: 502 });
  }
}
