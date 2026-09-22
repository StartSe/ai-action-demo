import { block, MODELS, type Block, type Project } from "./model";

export function freePosition(
  p: Project,
  position: Block["position"],
): Block["position"] {
  const result = { ...position };
  while (
    p.nodes.some(
      (n) =>
        Math.abs(n.position.x - result.x) < 370 &&
        Math.abs(n.position.y - result.y) < 420,
    )
  )
    result.y += 440;
  return result;
}

export function deriveBlock(
  p: Project,
  id: string,
  action: "duplicate" | "branch",
) {
  const source = p.nodes.find((n) => n.id === id);
  if (!source) throw new Error("Etapa não encontrada.");
  if (p.nodes.length >= 100) throw new Error("Este fluxo já tem 100 etapas.");
  if (action === "branch" && source.data.kind === "output")
    throw new Error("A entrega encerra o fluxo. Ramifique uma etapa anterior.");
  const parallel = action === "duplicate" || source.data.kind === "video";
  const n = parallel
    ? structuredClone(source)
    : block(source.data.kind === "idea" ? "image" : "video", 0);
  if (
    !parallel &&
    MODELS.find((m) => m.id === n.data.model)?.ratios.includes(
      source.data.ratio,
    )
  )
    n.data.ratio = source.data.ratio;
  n.id = crypto.randomUUID();
  n.position = freePosition(
    p,
    parallel
      ? { x: source.position.x, y: source.position.y + 440 }
      : { x: source.position.x + 410, y: source.position.y },
  );
  n.data = {
    ...n.data,
    title: parallel
      ? `${source.data.title.slice(0, 135)} · ${action === "duplicate" ? "cópia" : "variação"}`
      : n.data.title,
    lastJobId: undefined,
    selectionVersion: 0,
  };
  // A video branch starts from the same images, never from an unsupported video reference.
  if (action === "branch" && parallel)
    Object.assign(n.data, {
      assetId: undefined,
      dirty: false,
      status: undefined,
    });
  else n.data.status = n.data.assetId ? "completed" : undefined;
  const edges = parallel
    ? p.edges
        .filter((e) => e.target === source.id)
        .map((e) => ({
          ...structuredClone(e),
          id: crypto.randomUUID(),
          target: n.id,
        }))
    : [
        {
          id: crypto.randomUUID(),
          source: source.id,
          target: n.id,
          data: { kind: "input" as const },
        },
      ];
  return {
    project: { ...p, nodes: [...p.nodes, n], edges: [...p.edges, ...edges] },
    nodeId: n.id,
  };
}
