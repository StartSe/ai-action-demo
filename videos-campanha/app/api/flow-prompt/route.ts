import { readFile } from "node:fs/promises";
import { aiEnabled, askText, askVision, ErroIA, respostaErro } from "@/lib/ai";
import { validateProject } from "@/lib/flow/model";
import { assetPath } from "@/lib/flow/media";
import { assets } from "@/lib/flow/store";
import { promptImprovementInput } from "@/lib/flow/prompt";

export async function POST(req: Request) {
  try {
    const { project, nodeId } = await req.json();
    validateProject(project);
    const node = project.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error("Etapa não encontrada.");
    const input = promptImprovementInput(project, node, assets());
    if (!aiEnabled()) return Response.json({ error: "Conecte o OpenRouter em Configurações para melhorar prompts com IA." }, { status: 400 });
    const imagens = await Promise.all(input.images.map(async (asset) => {
      if (asset.url.startsWith("/api/flow-assets/")) {
        if (!asset.mimeType || !["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType)) throw new Error("Formato de referência não suportado.");
        const bytes = await readFile(assetPath(asset.id));
        return `data:${asset.mimeType};base64,${bytes.toString("base64")}`;
      }
      if (!/^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(asset.url)) throw new Error("Endereço de referência inválido.");
      return asset.url;
    }));
    const options = { system: input.system, prompt: input.prompt, maxTokens: 2500, temperature: 0.4 };
    const prompt = (imagens.length ? await askVision({ ...options, imagens }) : await askText(options)).trim();
    if (!prompt || prompt.length > 10000) throw new Error("A IA devolveu uma sugestão inválida. Tente novamente.");
    return Response.json({ prompt });
  } catch (error) {
    if (error instanceof ErroIA) return respostaErro(error);
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível melhorar o prompt." }, { status: 400 });
  }
}
