// Volta do provedor OAuth de um servidor MCP remoto: troca o code pelo token e grava no banco.
// Compartilhado: nasce aqui e é copiado sem alterar para os outros 9 apps.
import { INTEGRACOES } from "@/lib/integracoes";
import { baseUrl } from "@/lib/setup-comum";
import { trocarCode } from "@/lib/mcp-oauth";

function integracaoDoPrefixo(prefixo: string) {
  return INTEGRACOES.find((i) => i.campos.some((c) => c.chave === `${prefixo}_URL`));
}

export async function GET(req: Request, { params }: RouteContext<"/api/setup/oauth/mcp/[prefixo]/callback">) {
  const { prefixo } = await params;
  const url = new URL(req.url);
  const destinoSetup = `${baseUrl(req)}/setup`;
  const limparCookie = `mcp_${prefixo}_verifier=; Path=/; Max-Age=0`;
  const voltar = (erro?: string) => new Response(null, {
    status: 302,
    headers: { Location: erro ? `${destinoSetup}?erro=${encodeURIComponent(erro)}` : `${destinoSetup}?conectado=${encodeURIComponent(prefixo)}`, "Set-Cookie": limparCookie },
  });

  const integracao = integracaoDoPrefixo(prefixo);
  if (!integracao) return voltar("Integração desconhecida.");

  const erroProvedor = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (erroProvedor) {
    console.error(`O provedor recusou a conexão com "${integracao.titulo}":`, erroProvedor);
    return voltar(`O provedor recusou a conexão com "${integracao.titulo}". Tente autorizar de novo.`);
  }

  const code = url.searchParams.get("code");
  const cookie = req.headers.get("cookie") || "";
  const verifier = new RegExp(`(?:^|;\\s*)mcp_${prefixo}_verifier=([^;]+)`).exec(cookie)?.[1];
  if (!code || !verifier) return voltar("A conexão expirou. Tente autorizar de novo.");

  try {
    const redirectUri = `${baseUrl(req)}/api/setup/oauth/mcp/${prefixo}/callback`;
    await trocarCode(prefixo, code, verifier, redirectUri);
    return voltar();
  } catch (err) {
    console.error(err);
    return voltar(err instanceof Error ? err.message : `Falha ao concluir a conexão com "${integracao.titulo}".`);
  }
}
