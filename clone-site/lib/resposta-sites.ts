// Tradução única dos erros das rotas de sites (app/api/sites/**) para a resposta HTTP da suíte:
// projeto inexistente → 404, pedido inválido → 400, erro de IA → respostaErro (com codigo/acao), o resto → 500.
import { respostaErro } from "./ai";
import { ErroDePedido, PaginaNaoEncontrada } from "./gerador";
import { ProjetoNaoEncontrado } from "./projetos";

export function respostaErroSites(err: unknown): Response {
  if (err instanceof ProjetoNaoEncontrado || err instanceof PaginaNaoEncontrada) return Response.json({ error: err.message }, { status: 404 });
  if (err instanceof ErroDePedido) return Response.json({ error: err.message }, { status: 400 });
  return respostaErro(err);
}

/** Lê o corpo JSON como objeto; qualquer outra coisa vira um objeto vazio (as rotas validam campo a campo). */
export async function corpoJson(req: Request): Promise<Record<string, unknown>> {
  const corpo = await req.json().catch(() => null);
  return corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : {};
}
