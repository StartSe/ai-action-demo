// Preferência do motor de IA (lib/motor.ts): GET devolve provedor e modelo do ChatGPT; PUT grava
// { provedor: "openrouter" | "chatgpt", modelo? }. Variável de ambiente, quando existir, tem prioridade e trava o campo.
import { respostaErro } from "@/lib/ai";
import { chatGPT } from "@/lib/chatgpt";
import { provedor } from "@/lib/motor";
import { getConfig, origemConfig, setConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

function estado() {
  return { provedor: provedor(), modelo: getConfig("CHATGPT_MODEL") || "", provedorFixo: origemConfig("IA_PROVEDOR") === "env", modeloFixo: origemConfig("CHATGPT_MODEL") === "env" };
}

export async function GET() {
  return Response.json(estado());
}

export async function PUT(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { provedor?: unknown; modelo?: unknown } | null;
  if (!corpo || !["openrouter", "chatgpt"].includes(String(corpo.provedor)) || (corpo.modelo !== undefined && typeof corpo.modelo !== "string")) {
    return Response.json({ error: "Escolha OpenRouter ou ChatGPT." }, { status: 400 });
  }
  if (origemConfig("IA_PROVEDOR") === "env" || (corpo.modelo !== undefined && origemConfig("CHATGPT_MODEL") === "env")) {
    return Response.json({ error: "Esta preferência foi definida pela equipe técnica no servidor." }, { status: 409 });
  }
  try {
    if (corpo.modelo) {
      const modelos = await chatGPT().models();
      if (!modelos.some((m) => m.id === corpo.modelo)) return Response.json({ error: "Escolha um modelo disponível na sua conta." }, { status: 400 });
    }
    setConfig("IA_PROVEDOR", String(corpo.provedor));
    if (corpo.modelo !== undefined) setConfig("CHATGPT_MODEL", corpo.modelo as string);
    return Response.json(estado());
  } catch (err) {
    return respostaErro(err);
  }
}
