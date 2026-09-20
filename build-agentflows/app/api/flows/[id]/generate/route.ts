import { chatGPT } from "@/lib/chatgpt";
import { getFlow, FlowError } from "@/lib/flow-store";
import { generateFlow } from "@/lib/flow-generator";
import { api, body } from "@/lib/flow-api";
export async function POST(
  req: Request,
  c: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    getFlow((await c.params).id);
    if (!(await chatGPT().account()).account)
      throw new FlowError("Conecte o ChatGPT para gerar fluxos.", 409);
    return generateFlow((await body(req)).prompt);
  });
}
