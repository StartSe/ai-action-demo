export type Kind = "idea" | "image" | "video" | "transform" | "output";
export type Block = {
  id: string;
  type: "creative";
  position: { x: number; y: number };
  data: {
    kind: Kind;
    title: string;
    prompt: string;
    model: string;
    ratio: string;
    duration: number;
    resolution?: string;
    excluded: string[];
    inherit: boolean;
    assetId?: string;
    referenceId?: string;
    lastJobId?: string;
    selectionVersion?: number;
    dirty?: boolean;
    status?: string;
  };
};
export type Wire = {
  id: string;
  source: string;
  target: string;
  data: { kind: "input" | "context" };
  animated?: boolean;
  style?: Record<string, string | number>;
};
export type Project = {
  id: string;
  title: string;
  nodes: Block[];
  edges: Wire[];
  updatedAt: string;
  finished: boolean;
  revision: number;
};
export type Asset = {
  id: string;
  projectId: string;
  nodeId: string;
  title: string;
  kind: "image" | "video";
  url: string;
  mimeType?: string;
  createdAt: string;
  prompt: string;
};
export const LABELS: Record<Kind, string> = {
  idea: "Ideia",
  image: "Imagem",
  video: "Vídeo",
  transform: "Transformar",
  output: "Output",
};
export const ICONS: Record<Kind, string> = {
  idea: "✧",
  image: "▧",
  video: "▷",
  transform: "⟳",
  output: "↗",
};
export const MODELS = [
  {
    id: "nano-banana-2",
    name: "Nano Banana 2",
    kinds: ["image", "transform"],
    ratios: ["1:1", "16:9", "9:16"],
    resolutions: ["1k", "2k", "4k"],
    maxImages: 14,
    durations: [],
  },
  {
    id: "veo3.1-fast",
    name: "Veo 3.1 Fast",
    kinds: ["video"],
    ratios: ["16:9", "9:16"],
    resolutions: ["720p", "1080p"],
    maxImages: 2,
    durations: [8],
  },
  {
    id: "veo3.1-reference",
    name: "Veo 3.1 · Referências",
    kinds: ["video"],
    ratios: ["Original"],
    resolutions: ["720p", "1080p"],
    maxImages: 3,
    durations: [8],
  },
  {
    id: "wan2.2",
    name: "Wan 2.2",
    kinds: ["video"],
    ratios: ["16:9", "9:16"],
    resolutions: ["480p", "720p"],
    maxImages: 2,
    durations: [5, 6, 7, 8],
  },
  {
    id: "kling-v2.1-standard-i2v",
    name: "Kling 2.1 Standard · Imagem → vídeo",
    kinds: ["video"],
    ratios: ["16:9", "9:16", "1:1"],
    resolutions: ["Automática"],
    maxImages: 1,
    durations: [5],
  },
];
export function block(kind: Kind, index: number): Block {
  return {
    id: crypto.randomUUID(),
    type: "creative",
    position: { x: index * 340, y: 160 },
    data: {
      kind,
      title: LABELS[kind],
      prompt: "",
      model: kind === "video" ? "veo3.1-fast" : "nano-banana-2",
      ratio: kind === "video" ? "16:9" : "1:1",
      duration: 8,
      excluded: [],
      inherit: true,
    },
  };
}
export const RECIPES = [
  {
    id: "blank",
    name: "Em branco",
    desc: "Uma ideia. Infinitas possibilidades.",
    icon: "＋",
  },
  {
    id: "product",
    name: "Product Ad",
    desc: "Ideia → imagem → vídeo → entrega.",
    icon: "▷",
  },
  {
    id: "social",
    name: "Social Kit",
    desc: "Uma campanha em três formatos.",
    icon: "▦",
  },
  {
    id: "campaign",
    name: "Product Campaign",
    desc: "Um produto, várias peças conectadas.",
    icon: "◇",
  },
  {
    id: "character",
    name: "Character Consistency",
    desc: "Preserve seu personagem entre cenas.",
    icon: "♧",
  },
];
export function recipe(id: string): Project {
  const kinds: Kind[] =
    id === "blank"
      ? ["idea"]
      : id === "social"
        ? ["idea", "image", "transform", "transform", "transform"]
        : id === "campaign"
          ? ["idea", "image", "transform", "video", "output"]
          : id === "character"
            ? ["idea", "image", "transform", "video", "output"]
            : ["idea", "image", "video", "output"];
  const nodes = kinds.map(block);
  nodes[0].data.prompt = "";
  if (id === "social")
    nodes.slice(2).forEach((n, i) => {
      n.position = { x: 680, y: i * 330 - 160 };
      n.data.ratio = ["9:16", "1:1", "16:9"][i];
      n.data.title = ["Instagram / TikTok", "LinkedIn", "Banner"][i];
      n.data.prompt =
        "Adapte a composição para este formato, preservando o produto e a identidade visual.";
    });
  if (id === "character")
    nodes[2].data.prompt =
      "Preserve o personagem e sua roupa. Crie uma nova cena para a campanha.";
  if (id === "character") {
    nodes[3].data.model = "veo3.1-reference";
    nodes[3].data.ratio = "Original";
  }
  if (id === "campaign") {
    nodes[2].position = { x: 680, y: -20 };
    nodes[2].data.title = "Peça social";
    nodes[2].data.ratio = "9:16";
    nodes[3].position = { x: 680, y: 330 };
    nodes[4].position = { x: 1020, y: 330 };
  }
  return {
    id: crypto.randomUUID(),
    title:
      id === "blank" ? "Nova campanha" : RECIPES.find((r) => r.id === id)!.name,
    nodes,
    edges: nodes.slice(1).map((n, i) => ({
      id: crypto.randomUUID(),
      source:
        nodes[
          (id === "social" && i > 0) || (id === "campaign" && i === 2) ? 1 : i
        ].id,
      target: n.id,
      data: { kind: "input" },
    })),
    updatedAt: new Date().toISOString(),
    finished: false,
    revision: 0,
  };
}
export function order(p: Pick<Project, "nodes" | "edges">): Block[] {
  const result: Block[] = [];
  const active = new Set<string>();
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id))
      throw new Error(
        "Esta conexão cria um ciclo. Conecte as etapas em uma única direção.",
      );
    if (seen.has(id)) return;
    const n = p.nodes.find((n) => n.id === id);
    if (!n) throw new Error("Conexão aponta para uma etapa inexistente.");
    active.add(id);
    p.edges.filter((e) => e.target === id).forEach((e) => visit(e.source));
    active.delete(id);
    seen.add(id);
    result.push(n);
  };
  p.nodes.forEach((n) => visit(n.id));
  return result;
}
export function context(p: Project, id: string): Block[] {
  const target = p.nodes.find((n) => n.id === id)!;
  const found = new Set<string>();
  const walk = (nodeId: string) =>
    p.edges
      .filter((e) => e.target === nodeId)
      .forEach((e) => {
        if (found.has(e.source) || e.source === id) return;
        found.add(e.source);
        if (target.data.inherit) walk(e.source);
      });
  walk(id);
  return order(p).filter(
    (n) => found.has(n.id) && !target.data.excluded.includes(n.id),
  );
}
export function validateProject(value: unknown): asserts value is Project {
  const p = value as Project;
  if (
    !p ||
    typeof p.id !== "string" ||
    !/^[-\w]{1,80}$/.test(p.id) ||
    typeof p.finished !== "boolean" ||
    !Number.isInteger(p.revision) ||
    p.revision < 0 ||
    typeof p.title !== "string" ||
    p.title.length > 160 ||
    !Array.isArray(p.nodes) ||
    !Array.isArray(p.edges) ||
    p.nodes.length > 100 ||
    p.edges.length > 500
  )
    throw new Error("Projeto inválido ou muito grande.");
  const ids = new Set<string>();
  for (const n of p.nodes) {
    if (
      !n ||
      typeof n.id !== "string" ||
      !/^[-\w]{1,80}$/.test(n.id) ||
      n.type !== "creative" ||
      ids.has(n.id) ||
      !n.data ||
      !Object.hasOwn(LABELS, n.data.kind) ||
      typeof n.data.prompt !== "string" ||
      n.data.prompt.length > 10000 ||
      typeof n.data.title !== "string" ||
      n.data.title.length > 160 ||
      (n.data.assetId !== undefined &&
        (typeof n.data.assetId !== "string" ||
          !/^[-\w]{1,80}$/.test(n.data.assetId))) ||
      (n.data.referenceId !== undefined &&
        (typeof n.data.referenceId !== "string" ||
          !/^[-\w]{1,80}$/.test(n.data.referenceId))) ||
      !Array.isArray(n.data.excluded) ||
      !n.data.excluded.every((x) => typeof x === "string") ||
      typeof n.data.inherit !== "boolean" ||
      !Number.isFinite(n.position?.x) ||
      !Number.isFinite(n.position?.y)
    )
      throw new Error("Etapa inválida.");
    ids.add(n.id);
  }
  for (const e of p.edges)
    if (
      typeof e.id !== "string" ||
      !ids.has(e.source) ||
      !ids.has(e.target) ||
      !["input", "context"].includes(e.data?.kind)
    )
      throw new Error("Conexão inválida.");
  order(p);
}

/** Parameter or input changes invalidate generated descendants without deleting history. */
export function reconcile(previous: Project | null, next: Project): Project {
  if (!previous || previous.id !== next.id) return next;
  const dirty = new Set<string>();
  const changed = new Set<string>();
  const keys = [
    "prompt",
    "model",
    "ratio",
    "duration",
    "resolution",
    "inherit",
    "excluded",
  ] as const;
  const incoming = (p: Project, id: string) =>
    JSON.stringify(
      p.edges
        .filter((e) => e.target === id)
        .map((e) => [e.source, e.data.kind])
        .sort(),
    );
  for (const n of next.nodes) {
    const old = previous.nodes.find((b) => b.id === n.id);
    if (!old) continue;
    if (
      keys.some(
        (k) => JSON.stringify(n.data[k]) !== JSON.stringify(old.data[k]),
      ) ||
      incoming(previous, n.id) !== incoming(next, n.id)
    ) {
      dirty.add(n.id);
      changed.add(n.id);
    }
    if (
      n.data.assetId !== old.data.assetId ||
      n.data.referenceId !== old.data.referenceId
    )
      changed.add(n.id);
  }
  // Each target has its own context exclusions. An intermediate node excluding
  // an idea must not hide that idea from a later node that still inherits it.
  for (const n of order(next)) {
    if (context(next, n.id).some((source) => changed.has(source.id))) {
      dirty.add(n.id);
      changed.add(n.id);
    }
  }
  return {
    ...next,
    nodes: next.nodes.map((n) =>
      dirty.has(n.id) && n.data.kind !== "idea"
        ? { ...n, data: { ...n.data, dirty: true } }
        : n,
    ),
  };
}

/** Output delivers one explicit input; reference-only wires never replace it. */
export function outputSource(p: Project, id: string): Block {
  const target = p.nodes.find((n) => n.id === id);
  const incoming = p.edges.filter(
    (e) =>
      e.target === id &&
      e.data.kind === "input" &&
      !target?.data.excluded.includes(e.source),
  );
  if (incoming.length !== 1)
    throw new Error("Conecte uma única entrada direta ao Output.");
  const source = p.nodes.find((n) => n.id === incoming[0].source);
  if (!source?.data.assetId || source.data.dirty)
    throw new Error("Atualize o asset conectado antes de preparar a entrega.");
  return source;
}

/** Captures only the inputs that affect a generation, not layout or output state. */
export function generationSignature(p: Project, nodeId: string): string {
  const node = p.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error("Etapa não encontrada.");
  const d = node.data;
  return JSON.stringify({
    kind: d.kind,
    prompt: d.prompt,
    model: d.model,
    ratio: d.ratio,
    duration: d.duration,
    resolution:
      d.resolution || MODELS.find((m) => m.id === d.model)?.resolutions[0],
    referenceId: d.referenceId,
    selectionVersion: d.selectionVersion || 0,
    context: context(p, nodeId).map((n) => ({
      id: n.id,
      kind: n.data.kind,
      prompt: n.data.kind === "idea" ? n.data.prompt : undefined,
      assetId: n.data.assetId,
      dirty: Boolean(n.data.dirty),
    })),
    connections: p.edges
      .filter((e) => e.target === nodeId)
      .map((e) => [e.source, e.data.kind]),
  });
}

/** A completed job can only replace the exact inputs it was generated from. */
export function receiveGeneration(
  p: Project,
  result: { id: string; nodeId: string; signature?: string; asset: Asset },
): Project {
  const n = p.nodes.find((n) => n.id === result.nodeId);
  if (!n || n.data.lastJobId === result.id) return p;
  const matches = Boolean(
    result.signature && result.signature === generationSignature(p, n.id),
  );
  return {
    ...p,
    nodes: p.nodes.map((node) =>
      node.id !== n.id
        ? node
        : {
            ...node,
            data: {
              ...node.data,
              lastJobId: result.id,
              status:
                node.data.status === "pending" ? "outdated" : node.data.status,
              ...(matches
                ? {
                    assetId: result.asset.id,
                    dirty: false,
                    status: "completed",
                  }
                : {}),
            },
          },
    ),
  };
}

/** Input wires provide the primary media; other inherited assets are context. */
export function referencePlan(
  p: Project,
  nodeId: string,
): {
  assetId: string;
  nodeId?: string;
  title: string;
  role: "input" | "context";
}[] {
  const target = p.nodes.find((n) => n.id === nodeId);
  if (!target) return [];
  const inherited = context(p, nodeId).filter((n) => n.data.assetId);
  const directIds = p.edges
    .filter((e) => e.target === nodeId && e.data.kind === "input")
    .map((e) => e.source);
  const direct = directIds
    .map((id) => inherited.find((n) => n.id === id))
    .filter((n): n is Block => Boolean(n));
  const indirect = inherited.filter((n) => !directIds.includes(n.id));
  const candidates = [
    ...direct.map((n) => ({
      assetId: n.data.assetId!,
      nodeId: n.id,
      title: n.data.title,
      role: "input" as const,
    })),
    ...(target.data.referenceId
      ? [
          {
            assetId: target.data.referenceId,
            title: "Imagem selecionada",
            role: "input" as const,
          },
        ]
      : []),
    ...indirect.map((n) => ({
      assetId: n.data.assetId!,
      nodeId: n.id,
      title: n.data.title,
      role: "context" as const,
    })),
  ];
  const seen = new Set<string>();
  return candidates.filter((r) => {
    if (seen.has(r.assetId)) return false;
    seen.add(r.assetId);
    return true;
  });
}
