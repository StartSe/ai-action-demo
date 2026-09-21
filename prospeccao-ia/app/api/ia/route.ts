import { aiProvider, respostaErro } from "@/lib/ai";
import { chatGPT } from "@/lib/chatgpt";
import { getConfig, origemConfig, setConfig } from "@/lib/store";

export async function GET() {
  return Response.json({ provedor: aiProvider(), modelo: getConfig("CHATGPT_MODEL") || "", provedorFixo: origemConfig("AI_PROVIDER") === "env", modeloFixo: origemConfig("CHATGPT_MODEL") === "env" });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || !["openrouter", "chatgpt"].includes(body.provedor) || (body.modelo !== undefined && typeof body.modelo !== "string")) {
    return Response.json({ error: "Escolha OpenRouter ou ChatGPT." }, { status: 400 });
  }
  if (origemConfig("AI_PROVIDER") === "env" || (body.modelo !== undefined && origemConfig("CHATGPT_MODEL") === "env")) {
    return Response.json({ error: "Esta preferência foi definida no ambiente do servidor." }, { status: 409 });
  }
  try {
    if (body.modelo) {
      const modelos = await chatGPT().models();
      if (!modelos.some(m => m.id === body.modelo)) return Response.json({ error: "Escolha um modelo disponível na sua conta." }, { status: 400 });
    }
    setConfig("AI_PROVIDER", body.provedor);
    if (body.modelo !== undefined) setConfig("CHATGPT_MODEL", body.modelo);
    return GET();
  } catch (err) { return respostaErro(err); }
}
