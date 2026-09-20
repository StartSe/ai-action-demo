import { listTools } from "@/lib/tools";
import { salvarCampos } from "@/lib/conexoes";
import { api, body } from "@/lib/flow-api";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(listTools);
}
// Credenciais das ferramentas prontas (ex.: chave da Tavily), salvas a partir do diálogo do Agente.
export async function PUT(req: Request) {
  return api(async () => {
    salvarCampos((await body(req)).campos);
    return listTools();
  });
}
