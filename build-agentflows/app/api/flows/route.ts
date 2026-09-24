import { listFlows, createFlow, createSavedFlow } from "@/lib/flow-store";
import { api, body } from "@/lib/flow-api";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(() => listFlows());
}
export async function POST(req: Request) {
  return api(async () => {
    const b = await body(req);
    if (b.graph !== undefined) return createSavedFlow(b);
    return createFlow(
      typeof b.name === "string" ? b.name : "Novo fluxo",
      b.example === true,
    );
  });
}
