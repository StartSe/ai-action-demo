// Conta ChatGPT (lib/chatgpt.ts): GET estado e modelos, POST inicia o login por código de dispositivo,
// DELETE cancela o login ({ cancel: true }) ou desconecta. Mesmo desenho do radar-sinais.
import { chatGPT } from "@/lib/chatgpt";

export const dynamic = "force-dynamic";

async function responder(fn: () => Promise<unknown>) {
  try {
    return Response.json(await fn());
  } catch (err) {
    console.error("Falha na conexão ChatGPT:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Não foi possível conectar ao ChatGPT. Tente de novo ou confira a instalação com a equipe técnica." }, { status: 503 });
  }
}

export async function GET() {
  return responder(async () => {
    const status = await chatGPT().account();
    return { ...status, models: status.account ? await chatGPT().models() : [] };
  });
}

export async function POST() {
  return responder(() => chatGPT().beginLogin());
}

export async function DELETE(req: Request) {
  const corpo = await req.json().catch(() => ({}));
  return responder(async () => {
    if (corpo?.cancel === true) await chatGPT().cancelLogin();
    else await chatGPT().logout();
    return { ok: true };
  });
}
