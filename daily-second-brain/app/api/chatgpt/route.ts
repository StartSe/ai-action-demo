import { chatGPT } from "@/lib/chatgpt";
import { api, body } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => {
    const s = await chatGPT().account();
    return { ...s, models: s.account ? await chatGPT().models() : [] };
  });
}
export async function POST() {
  return api(() => chatGPT().beginLogin());
}
export async function DELETE(req: Request) {
  return api(async () => {
    const b = await body(req);
    if (b.cancel) await chatGPT().cancelLogin();
    else await chatGPT().logout();
    return { ok: true };
  });
}
