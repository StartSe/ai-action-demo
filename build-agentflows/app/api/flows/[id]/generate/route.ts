import { getFlow } from "@/lib/flow-store";
import { generateFlow } from "@/lib/flow-generator";
import { api, body } from "@/lib/flow-api";
export async function POST(
  req: Request,
  c: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    getFlow((await c.params).id);
    return generateFlow((await body(req)).prompt);
  });
}
