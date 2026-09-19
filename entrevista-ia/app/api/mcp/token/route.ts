// Gera, mostra o estado e revoga o código de acesso usado pelo endpoint MCP (app/mcp/route.ts).
import { codigoAtivo, codigoMascarado, gerarCodigo, revogarCodigo } from "@/lib/mcp";
import { registrarEnderecoPublico } from "@/lib/setup-comum";

export async function GET() {
  return Response.json({ ativo: Boolean(codigoAtivo()), mascarado: codigoMascarado() });
}

export async function POST(req: Request) {
  // Gerar o código é o momento em que o caminho do assistente é montado, e a ferramenta criar_convite
  // (US-027) precisa do endereço público para devolver um link que abra no celular do candidato. As
  // chamadas MCP chegam por app/mcp/route.ts, que não pode mudar (INFRA comparada byte a byte), e
  // nenhuma tela de /setup grava APP_URL sozinha — esta é a última requisição com `req` no caminho.
  registrarEnderecoPublico(req);
  const codigo = gerarCodigo();
  return Response.json({ codigo });
}

export async function DELETE() {
  revogarCodigo();
  return Response.json({ ok: true });
}
