// Início da autorização do Trello: monta a URL de autorização (token flow) e redireciona.
// Diferente do OpenRouter (OAuth PKCE), o Trello devolve o token no fragmento da URL de retorno,
// por isso a troca acontece no navegador (ver app/setup/trello/page.tsx), não neste servidor.
import { TRELLO_API_KEY } from "@/lib/integracoes";
import { baseUrl } from "@/lib/setup-comum";
import { getConfig } from "@/lib/store";

export async function GET(req: Request) {
  // Usa a chave própria salva pelo executivo, se houver; senão, a chave pública embutida no app.
  const key = getConfig("TRELLO_API_KEY") || TRELLO_API_KEY;
  if (!key) {
    const erro = "Este app ainda não tem uma chave do Trello. Cole a sua em \"Opções avançadas\" e autorize de novo.";
    return new Response(null, { status: 302, headers: { Location: `/setup?erro=${encodeURIComponent(erro)}` } });
  }
  const nome = getConfig("APP_NAME") || "Agente de Kanban";
  const destino = new URL("https://trello.com/1/authorize");
  destino.searchParams.set("expiration", "never");
  destino.searchParams.set("name", nome);
  destino.searchParams.set("scope", "read,write");
  destino.searchParams.set("response_type", "token");
  destino.searchParams.set("key", key);
  destino.searchParams.set("return_url", `${baseUrl(req)}/setup/trello`);
  return new Response(null, { status: 302, headers: { Location: destino.toString() } });
}
