import { api, body, BrainError } from "@/lib/api";
import { setConfig } from "@/lib/store";
import { setupState, verifySetupAI } from "@/lib/onboarding";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(setupState);
}
export async function POST(req: Request) {
  return api(async () => {
    const b = await body(req);
    if (b.action === "verify-ai") return verifySetupAI(req.signal);
    if (b.action === "step") {
      if (!Number.isInteger(b.step) || Number(b.step) < 1 || Number(b.step) > 4)
        throw new BrainError("Etapa inválida.");
      setConfig("ONBOARDING_STEP", String(b.step));
    } else if (b.action === "defer") setConfig("ONBOARDING_STATUS", "deferred");
    else if (b.action === "complete")
      setConfig("ONBOARDING_STATUS", "complete");
    else throw new BrainError("Etapa desconhecida.");
    return setupState();
  });
}
