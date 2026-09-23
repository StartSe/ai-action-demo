import { api, body, string } from "@/lib/api";
import {
  criarConta,
  entrar,
  existeConta,
  cookieDeSessao,
  cookieDeSaida,
  lerCookie,
  sair,
  COOKIE_SESSAO,
} from "@/lib/conta";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(() => ({ exists: existeConta() }));
}
export async function POST(req: Request) {
  try {
    const b = await body(req);
    const dados = {
      nome: string(b.name, 120),
      email: string(b.email, 200),
      senha: string(b.password, 200),
    };
    if (b.create === true) criarConta(dados);
    const result = entrar(dados);
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": cookieDeSessao(
            result.token,
            req.url.startsWith("https:") ||
              req.headers.get("x-forwarded-proto") === "https",
          ),
        },
      },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Não foi possível entrar." },
      { status: 400 },
    );
  }
}
export async function DELETE(req: Request) {
  sair(lerCookie(req.headers.get("cookie"), COOKIE_SESSAO));
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": cookieDeSaida(
          req.url.startsWith("https:") ||
            req.headers.get("x-forwarded-proto") === "https",
        ),
      },
    },
  );
}
