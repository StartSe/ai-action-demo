// Autorizar (OAuth do servidor MCP) e remover um servidor de ferramentas.
import { removerServidorMCP, servidorMCP, atualizarServidorMCP } from "@/lib/conexoes";
import { iniciarAutorizacao } from "@/lib/mcp-oauth";
import { baseUrl } from "@/lib/setup-comum";
import { api, body } from "@/lib/flow-api";
type C = { params: Promise<{ prefixo: string }> };
export async function GET(req: Request, c: C) {
  const { prefixo } = await c.params;
  const voltar = (erro: string) =>
    Response.redirect(`${baseUrl(req)}/ferramentas?erro=${encodeURIComponent(erro)}`, 302);
  try {
    const s = servidorMCP(prefixo);
    const redirectUri = `${baseUrl(req)}/api/conexoes/mcp/${prefixo}/callback`;
    const { destino, verifier } = await iniciarAutorizacao(prefixo, s.url, redirectUri);
    const seguro = redirectUri.startsWith("https") ? "; Secure" : "";
    return new Response(null, {
      status: 302,
      headers: {
        Location: destino,
        "Set-Cookie": `mcp_${prefixo}_verifier=${verifier}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${seguro}`,
      },
    });
  } catch (err) {
    console.error(err);
    return voltar(
      err instanceof Error ? err.message : "Não foi possível iniciar a autorização.",
    );
  }
}
export async function DELETE(_: Request, c: C) {
  return api(async () => {
    removerServidorMCP((await c.params).prefixo);
    return { ok: true };
  });
}

export async function PUT(req: Request, c: C) {
  return api(async () => { const b = await body(req); atualizarServidorMCP((await c.params).prefixo, b.nome, b.url, b.codigo); return { ok: true }; });
}
