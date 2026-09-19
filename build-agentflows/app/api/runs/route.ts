import { listRuns } from "@/lib/flow-store";
import { api } from "@/lib/flow-api";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return api(() =>
    listRuns(new URL(req.url).searchParams.get("flowId") || undefined),
  );
}
