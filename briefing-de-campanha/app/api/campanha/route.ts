// Apaga todo o histórico salvo (botão "Apagar tudo" do painel). A listagem em si usa a rota
// compartilhada GET /api/historico — esta existe só porque essa rota genérica não tem DELETE.
import { apagarTodos } from "@/lib/historico";

export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}
