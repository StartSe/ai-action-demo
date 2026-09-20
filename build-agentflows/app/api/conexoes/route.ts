import { salvarCampos, statusConexoes } from "@/lib/conexoes";
import { baseUrl } from "@/lib/setup-comum";
import { api, body } from "@/lib/flow-api";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return api(() => statusConexoes(baseUrl(req)));
}
export async function PUT(req: Request) {
  return api(async () => {
    salvarCampos((await body(req)).campos);
    return statusConexoes(baseUrl(req));
  });
}
