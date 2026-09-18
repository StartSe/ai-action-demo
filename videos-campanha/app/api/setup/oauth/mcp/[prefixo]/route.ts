// Início do fluxo OAuth de um servidor MCP remoto ("Autorizar" no cartão de /setup) e revogação
// da conexão (PUT com valores nulos, mesmo espírito do PUT genérico de app/api/setup). Compartilhado:
// nasce aqui e é copiado sem alterar para os outros 9 apps.
import { INTEGRACOES } from "@/lib/integracoes";
import { baseUrl } from "@/lib/setup-comum";
import { getConfig } from "@/lib/store";
import { desconectar, iniciarAutorizacao } from "@/lib/mcp-oauth";

function integracaoDoPrefixo(prefixo: string) {
  return INTEGRACOES.find((i) => i.campos.some((c) => c.chave === `${prefixo}_URL`));
}

export async function GET(req: Request, { params }: RouteContext<"/api/setup/oauth/mcp/[prefixo]">) {
  const { prefixo } = await params;
  const integracao = integracaoDoPrefixo(prefixo);
  if (!integracao) {
    return Response.redirect(`${baseUrl(req)}/setup?erro=${encodeURIComponent("Integração desconhecida.")}`, 302);
  }
  const campoUrl = integracao.campos.find((c) => c.chave === `${prefixo}_URL`);
  let urlServidor = getConfig(`${prefixo}_URL`) || campoUrl?.padrao;
  if (prefixo === "HIGGSFIELD" && /^https:\/\/mcp\.higgsfield\.ai\/?$/.test(urlServidor || "")) urlServidor = "https://mcp.higgsfield.ai/mcp";
  if (!urlServidor) {
    return Response.redirect(`${baseUrl(req)}/setup?erro=${encodeURIComponent(`Informe o endereço em "${integracao.titulo}" antes de autorizar.`)}`, 302);
  }
  try {
    const redirectUri = `${baseUrl(req)}/api/setup/oauth/mcp/${prefixo}/callback`;
    const { destino, verifier, state } = await iniciarAutorizacao(prefixo, urlServidor, redirectUri);
    const seguro = redirectUri.startsWith("https") ? "; Secure" : "";
    const headers = new Headers({ Location: destino });
    headers.append("Set-Cookie", `mcp_${prefixo}_verifier=${verifier}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${seguro}`);
    headers.append("Set-Cookie", `mcp_${prefixo}_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${seguro}`);
    return new Response(null, { status: 302, headers });
  } catch (err) {
    console.error(err);
    return Response.redirect(`${baseUrl(req)}/setup?erro=${encodeURIComponent(err instanceof Error ? err.message : `Não foi possível iniciar a conexão com "${integracao.titulo}".`)}`, 302);
  }
}

export async function PUT(req: Request, { params }: RouteContext<"/api/setup/oauth/mcp/[prefixo]">) {
  const { prefixo } = await params;
  if (!integracaoDoPrefixo(prefixo)) {
    return Response.json({ error: "Integração desconhecida." }, { status: 404 });
  }
  desconectar(prefixo);
  return Response.json({ ok: true });
}
