import {
  context,
  MODELS,
  order,
  outputSource,
  referencePlan,
  type Asset,
  type Block,
  type Project,
} from "./model";

export const MODEL_HELP: Record<
  string,
  { description: string; references: string }
> = {
  "nano-banana-2": {
    description: "Crie imagens ou edite uma composição usando referências.",
    references: "Até 14 imagens de referência",
  },
  "veo3.1-fast": {
    description: "Crie uma cena a partir de texto ou anime uma imagem.",
    references: "Texto ou até 2 imagens: quadro inicial e final",
  },
  "veo3.1-reference": {
    description:
      "Use referências visuais para manter um personagem ou produto entre cenas.",
    references: "De 1 a 3 imagens de referência",
  },
  "wan2.2": {
    description: "Escolha a duração entre 5 e 8 segundos, com texto ou imagem.",
    references: "Texto ou até 2 imagens: quadro inicial e final",
  },
  "kling-v2.1-standard-i2v": {
    description:
      "Anime uma imagem em um vídeo de 5 segundos, inclusive quadrado.",
    references: "Uma imagem obrigatória",
  },
};

export function modelSettings(
  data: Block["data"],
  id: string,
): Partial<Block["data"]> {
  const m = MODELS.find((m) => m.id === id && m.kinds.includes(data.kind));
  if (!m) throw new Error("Modelo incompatível com esta etapa.");
  return {
    model: id,
    ratio: m.ratios.includes(data.ratio) ? data.ratio : m.ratios[0],
    resolution:
      data.resolution && m.resolutions.includes(data.resolution)
        ? data.resolution
        : m.resolutions[0],
    duration: m.durations.includes(data.duration)
      ? data.duration
      : m.durations[0] || data.duration,
  };
}

export function validateSettings(node: Block, imageCount: number) {
  const m = MODELS.find(
    (m) => m.id === node.data.model && m.kinds.includes(node.data.kind),
  );
  if (!m) throw new Error("Modelo incompatível com esta etapa.");
  if (!m.ratios.includes(node.data.ratio))
    throw new Error("Formato não suportado pelo modelo.");
  if (imageCount > m.maxImages)
    throw new Error(
      `Este modelo aceita até ${m.maxImages} imagens. Desmarque referências no contexto.`,
    );
  if (node.data.kind === "transform" && !imageCount)
    throw new Error("Conecte ou selecione uma imagem para transformar.");
  if (node.data.model === "kling-v2.1-standard-i2v" && !imageCount)
    throw new Error("Conecte uma imagem para gerar com Kling.");
  if (node.data.model === "veo3.1-reference" && !imageCount)
    throw new Error("Conecte ao menos uma imagem de referência.");
  if (node.data.resolution && !m.resolutions.includes(node.data.resolution))
    throw new Error("Resolução não suportada pelo modelo.");
  if (node.data.kind === "video" && !m.durations.includes(node.data.duration))
    throw new Error(
      `Este modelo aceita vídeos de ${m.durations.join(", ")} segundos.`,
    );
}

/** Keep every connection, but send only the visual inputs the model supports. */
export function modelReferences(p: Project, node: Block) {
  const references = referencePlan(p, node.id);
  const limit = MODELS.find((m) => m.id === node.data.model)?.maxImages ?? 0;
  return {
    used: node.data.kind === "video" ? references.slice(0, limit) : references,
    omitted: node.data.kind === "video" ? references.slice(limit) : [],
  };
}

/** Shared preflight: the browser and the paid submission enforce the same inputs. */
export function generationInput(p: Project, node: Block, assets: Asset[]) {
  const refs = context(p, node.id);
  const missing = refs.find(
    (n) => n.data.kind !== "idea" && (!n.data.assetId || n.data.dirty),
  );
  if (missing)
    throw new Error(
      `Gere ou envie o asset de “${missing.data.title}” primeiro.`,
    );
  const prompt = [
    ...refs.filter((n) => n.data.kind === "idea").map((n) => n.data.prompt),
    node.data.prompt,
  ]
    .filter(Boolean)
    .join("\n\n");
  if (!prompt.trim())
    throw new Error("Escreva uma ideia ou um prompt antes de gerar.");
  const { used: references } = modelReferences(p, node);
  const images = references.map((r) => {
    const a = assets.find((a) => a.id === r.assetId);
    if (!a) throw new Error("Uma referência não existe mais na biblioteca.");
    if (a.kind !== "image")
      throw new Error("Este modelo aceita apenas imagens como referência.");
    return a.url;
  });
  validateSettings(node, images.length);
  const visualPrompt = node.data.kind === "video" ? prompt : `${prompt}\n\nDireção de imagem: o briefing, o prompt e os nomes das referências descrevem a cena e não devem ser escritos na imagem. Não acrescente textos, legendas, títulos, slogans, letras, preços, selos ou marcas d’água, salvo solicitação explícita do usuário para incluir um texto na arte.`;
  const effectivePrompt =
    references.length &&
    !["veo3.1-fast", "wan2.2", "kling-v2.1-standard-i2v"].includes(
      node.data.model,
    )
      ? `${visualPrompt}\n\nReferências visuais (na ordem enviada):\n${references.map((r, i) => `Imagem ${i + 1}: ${r.role === "input" ? "entrada principal para esta etapa" : "referência de contexto visual"} (${r.title}).`).join("\n")}`
      : visualPrompt;
  return { prompt: effectivePrompt, images };
}

/** Simulate upstream results to validate the entire sequence before any charge. */
export function generationPlan(
  project: Project,
  target: string,
  assets: Asset[],
) {
  const p = structuredClone(project);
  const available = [...assets];
  const steps: Block[] = [];
  const warnings: { nodeId: string; message: string }[] = [];
  for (const node of order(p)) {
    if (node.data.kind === "idea" || (target !== "all" && node.id !== target))
      continue;
    if (target === "all" && node.data.assetId && !node.data.dirty) continue;
    try {
      if (node.data.kind === "output")
        node.data.assetId = outputSource(p, node.id).data.assetId;
      else {
        generationInput(p, node, available);
        const selection = modelReferences(p, node);
        if (selection.omitted.length) warnings.push({
          nodeId: node.id,
          message: `Limite do modelo: serão usadas ${selection.used.map((r) => r.title).join(", ")}. ${selection.omitted.length} referência(s) permanecerão conectadas sem envio.`,
        });
        steps.push(structuredClone(node));
        const id = `planned:${node.id}`;
        available.push({
          id,
          projectId: p.id,
          nodeId: node.id,
          kind: node.data.kind === "video" ? "video" : "image",
          title: node.data.title,
          url: "",
          prompt: "",
          createdAt: "",
        });
        node.data.assetId = id;
      }
      node.data.dirty = false;
    } catch (e) {
      return {
        steps,
        warnings,
        issue: {
          nodeId: node.id,
          title: node.data.title,
          message: e instanceof Error ? e.message : "Revise esta etapa.",
        },
      };
    }
  }
  return { steps, warnings, issue: null };
}
