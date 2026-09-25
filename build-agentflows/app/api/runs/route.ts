import { listRuns, listRunPage } from "@/lib/flow-store";
import { api } from "@/lib/flow-api";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return api(() => {
    const params = new URL(req.url).searchParams;
    const flowId = params.get("flowId") || undefined;
    if (params.has("page") || params.has("pageSize") || params.has("status")) return listRunPage({ page: Number(params.get("page") || 1), pageSize: Number(params.get("pageSize") || 20), status: params.get("status") || "all", flowId });
    return listRuns(flowId);
  });
}
