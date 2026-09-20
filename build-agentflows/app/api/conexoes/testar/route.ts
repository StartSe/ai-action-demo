import { testarConexao } from "@/lib/conexoes-teste";
import { api, body } from "@/lib/flow-api";
export async function POST(req: Request) {
  return api(async () => testarConexao(String((await body(req)).id || "")));
}
