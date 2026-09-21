import { adicionarServidorMCP, statusConexoes } from "@/lib/conexoes";
import { api, body } from "@/lib/flow-api";
export async function GET() {
  return api(async () => (await statusConexoes("")).mcp);
}
export async function POST(req: Request) {
  return api(async () => {
    const b = await body(req);
    return adicionarServidorMCP(b.nome, b.url, b.codigo);
  });
}
