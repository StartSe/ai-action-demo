import { aiProvider } from "@/lib/ai";
import { chatGPT } from "@/lib/chatgpt";
import type { EstadoChatGPT } from "@/lib/conexao-ia-types";
import { INTEGRACOES } from "@/lib/integracoes";
import { statusIntegracoes } from "@/lib/setup-comum";
import { getConfig, origemConfig, setConfig } from "@/lib/store";

export const dynamic = "force-dynamic";
export async function GET() {
  const { integracoes } = await statusIntegracoes(INTEGRACOES);
  let chatgpt: EstadoChatGPT;
  try {
    const estado = await chatGPT().account();
    chatgpt = { ...estado, models: [] };
    if (estado.account) {
      try {
        chatgpt.models = await chatGPT().models();
      } catch {
        chatgpt.error =
          "Não foi possível carregar os modelos. Tente novamente.";
      }
    }
  } catch {
    chatgpt = {
      account: null,
      login: null,
      models: [],
      error: "Não foi possível verificar a conexão ChatGPT. Tente novamente.",
    };
  }
  const provedor = aiProvider();
  const pronto =
    provedor === "chatgpt"
      ? Boolean(chatgpt.account)
      : integracoes.some((i) => i.id === "openrouter" && i.configurada);
  return Response.json(
    {
      integracoes,
      pronto,
      chatgpt,
      ia: {
        provedor,
        modelo: getConfig("CHATGPT_MODEL") || "",
        provedorFixo: origemConfig("AI_PROVIDER") === "env",
        modeloFixo: origemConfig("CHATGPT_MODEL") === "env",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Salva apenas os campos das conexões disponíveis. Vazio mantém; null apaga. */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (
    !body?.valores ||
    typeof body.valores !== "object" ||
    Array.isArray(body.valores) ||
    Object.values(body.valores).some((v) => v !== null && typeof v !== "string")
  ) {
    return Response.json(
      { error: "Informe valores válidos para a conexão." },
      { status: 400 },
    );
  }
  const permitidas = new Set(
    INTEGRACOES.flatMap((i) => i.campos.map((c) => c.chave)),
  );
  for (const [chave, valor] of Object.entries(body.valores)) {
    if (permitidas.has(chave) && valor !== "")
      setConfig(chave, valor as string | null);
  }
  return GET();
}
