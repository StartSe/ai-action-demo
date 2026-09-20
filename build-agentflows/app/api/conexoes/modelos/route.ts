import { listModels, openRouterKey } from "@/lib/openrouter";
import { api } from "@/lib/flow-api";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => ({
    conectado: !!openRouterKey(),
    modelos: openRouterKey() ? await listModels() : [],
  }));
}
