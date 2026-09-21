// Entrar com e-mail e senha. Compartilhado: copie sem alterar.
import { entrar, ErroConta, cookieDeSessao } from "@/lib/conta";
import { baseUrl } from "@/lib/setup-comum";

export async function POST(req: Request) {
  const dados = await req.json().catch(() => ({}));
  try {
    const { usuario, token } = entrar({
      email: dados.email ?? "",
      senha: dados.senha ?? "",
    });
    const seguro = baseUrl(req).startsWith("https");
    return Response.json(
      { usuario },
      { headers: { "Set-Cookie": cookieDeSessao(token, seguro) } },
    );
  } catch (err) {
    if (err instanceof ErroConta)
      return Response.json({ error: err.message }, { status: err.status });
    console.error("Falha ao entrar:", err);
    return Response.json(
      { error: "Não foi possível entrar. Tente de novo." },
      { status: 500 },
    );
  }
}
