// Cartão próprio de /setup, "Qualidade da página gerada" (components/QualidadePagina.tsx): o modelo que lê
// a captura decide a fidelidade da página, então ele não fica escondido em "Opções avançadas" do cartão
// genérico da IA — por isso `lib/integracoes.ts` chama `openrouter()` sem `visao` e a chave
// OPENROUTER_MODEL_VISAO é lida e gravada por aqui.
import { aiEnabled, visionModelName } from "@/lib/ai";
import { MODELOS_VISAO } from "@/lib/modelos";
import { getConfig, setConfig } from "@/lib/store";
import { testarLeituraDeImagem } from "@/lib/teste-visao";

export const dynamic = "force-dynamic";

const CHAVE = "OPENROUTER_MODEL_VISAO";

function estado() {
  return {
    iaConectada: aiEnabled(),
    modelo: visionModelName(),
    escolhido: Boolean(getConfig(CHAVE)),
    opcoes: MODELOS_VISAO,
  };
}

export async function GET() {
  return Response.json(estado());
}

export async function PUT(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { modelo?: unknown } | null;
  const modelo = typeof corpo?.modelo === "string" ? corpo.modelo.trim() : "";
  if (!MODELOS_VISAO.some((o) => o.valor === modelo)) {
    return Response.json({ error: "Escolha um dos modelos da lista." }, { status: 400 });
  }
  setConfig(CHAVE, modelo);
  return Response.json(estado());
}

/** "Testar leitura de imagem": manda um PNG mínimo ao modelo escolhido e conta o que ele respondeu. */
export async function POST() {
  if (!aiEnabled()) {
    return Response.json({
      ok: false,
      mensagem: "Conecte a IA primeiro: sem a chave não há como testar a leitura da captura.",
    });
  }
  return Response.json(await testarLeituraDeImagem());
}
