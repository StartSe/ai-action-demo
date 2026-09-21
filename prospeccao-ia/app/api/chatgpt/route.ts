import { chatGPT } from "@/lib/chatgpt";

export const dynamic = "force-dynamic";
async function responder(fn: () => Promise<unknown>) {
  try { return Response.json(await fn()); }
  catch { return Response.json({ error: "Não foi possível conectar ao ChatGPT. Tente novamente ou confira a instalação com a equipe técnica." }, { status: 503 }); }
}
export async function GET() {
  return responder(async () => {
    const status = await chatGPT().account();
    return { ...status, models: status.account ? await chatGPT().models() : [] };
  });
}
export async function POST() { return responder(() => chatGPT().beginLogin()); }
export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({}));
  return responder(async () => {
    if (body.cancel === true) await chatGPT().cancelLogin();
    else await chatGPT().logout();
    return { ok: true };
  });
}
