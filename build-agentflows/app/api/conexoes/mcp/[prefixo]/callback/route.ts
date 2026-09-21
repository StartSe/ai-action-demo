import { servidorMCP } from "@/lib/conexoes";
import { trocarCode } from "@/lib/mcp-oauth";
import { baseUrl } from "@/lib/setup-comum";
export async function GET(req: Request, c: { params: Promise<{ prefixo: string }> }) {
  const { prefixo } = await c.params;
  const url = new URL(req.url);
  const voltar = (erro?: string) =>
    new Response(null, {
      status: 302,
      headers: {
        Location: erro
          ? `${baseUrl(req)}/ferramentas?erro=${encodeURIComponent(erro)}`
          : `${baseUrl(req)}/ferramentas?conectado=${encodeURIComponent(prefixo)}`,
        "Set-Cookie": `mcp_${prefixo}_verifier=; Path=/; Max-Age=0`,
      },
    });
  try {
    const s = servidorMCP(prefixo);
    const recusa = url.searchParams.get("error_description") || url.searchParams.get("error");
    if (recusa) return voltar(`O serviço recusou a autorização de “${s.nome}”.`);
    const code = url.searchParams.get("code");
    const verifier = new RegExp(`(?:^|;\\s*)mcp_${prefixo}_verifier=([^;]+)`).exec(
      req.headers.get("cookie") || "",
    )?.[1];
    if (!code || !verifier) return voltar("A autorização expirou. Tente de novo.");
    await trocarCode(prefixo, code, verifier, `${baseUrl(req)}/api/conexoes/mcp/${prefixo}/callback`);
    return voltar();
  } catch (err) {
    console.error(err);
    return voltar(err instanceof Error ? err.message : "Falha ao concluir a autorização.");
  }
}
