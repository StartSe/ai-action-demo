import { order, type Block, type Project } from "./model";

/** Start at every leaf, share ancestor work, and release each branch independently. */
export async function executeFlow(
  project: Project,
  target: string,
  execute: (node: Block) => Promise<void>,
  stopped: () => boolean = () => false,
) {
  order(project); // Reject cycles before any side effect.
  const tasks = new Map<string, Promise<void>>();
  const run = (node: Block): Promise<void> => {
    const existing = tasks.get(node.id);
    if (existing) return existing;
    const task = (async () => {
      if (target === "all") {
        const dependencies = project.edges
          .filter((edge) => edge.target === node.id)
          .map((edge) => project.nodes.find((n) => n.id === edge.source)!);
        await Promise.all(dependencies.map(run));
      }
      if (stopped()) return;
      if (node.data.kind === "idea") return;
      if (target === "all" && node.data.assetId && !node.data.dirty) return;
      await execute(node);
    })();
    tasks.set(node.id, task);
    return task;
  };
  const targets = target === "all"
    ? project.nodes.filter((n) => !project.edges.some((e) => e.source === n.id))
    : project.nodes.filter((n) => n.id === target);
  await Promise.allSettled(targets.map(run));
  // A rejected branch must not release the editor while sibling jobs are live.
  const results = await Promise.allSettled(tasks.values());
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failures.length) throw new Error([...new Set(failures.map((r) => r.reason instanceof Error ? r.reason.message : String(r.reason)))].join("\n"));
}
