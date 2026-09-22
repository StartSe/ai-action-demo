import { ask, parseJSON, type AIConfig } from "./ai";
import { AppError } from "./api";
import { validateTree } from "./maps";
import { mapPreview, stableNodeIds } from "./map-preview";
import { branchInstructions } from "./map-prompts";
import { countNodes, type MindNode } from "./types";

function depth(node: MindNode): number {
  return node.children.length ? 1 + Math.max(...node.children.map(depth)) : 0;
}
function groundedLeaves(node: MindNode): boolean {
  return node.children.length
    ? node.children.every(groundedLeaves)
    : node.refs.length > 0;
}

/** Each branch gets its own output budget and the complete, unabridged source. */
export async function deepenMap(
  initial: MindNode,
  context: string,
  refs: Set<string>,
  signal: AbortSignal,
  config: AIConfig,
  report: (
    root: MindNode,
    phase: string,
    completed: number,
    total: number,
  ) => void,
  progressive: boolean,
) {
  if (initial.children.length > 7)
    throw new AppError(
      "A IA criou ramos demais para o plano. Tente novamente.",
    );
  let root: MindNode = {
    ...initial,
    children: initial.children.map((branch) => ({ ...branch, children: [] })),
  };
  const total = root.children.length;
  const limit = Math.min(25, Math.floor(119 / total));
  const outline = JSON.stringify(
    initial.children.map(({ label, note, refs }) => ({ label, note, refs })),
  );
  for (let i = 0; i < total; i++) {
    signal.throwIfAborted();
    const branch = initial.children[i];
    const phase = `Aprofundando ramo ${i + 1} de ${total} · ${branch.label}`;
    report(root, phase, i, total);
    const replace = (expanded: MindNode) =>
      stableNodeIds({
        ...root,
        children: root.children.map((child, index) =>
          index === i ? { ...expanded, label: branch.label } : child,
        ),
      });
    let lastPreview = 0;
    const result = parseJSON(
      await ask(
        branchInstructions(limit),
        `${context}\n<plano>${outline}</plano>\nRamo a aprofundar: ${JSON.stringify({ label: branch.label, note: branch.note })}`,
        signal,
        config,
        fetch,
        progressive
          ? (text) => {
              if (Date.now() - lastPreview < 200) return;
              lastPreview = Date.now();
              const partial = mapPreview(text, refs);
              if (
                partial &&
                countNodes(partial) <= limit &&
                depth(partial) <= 3
              )
                report(replace(partial), phase, i, total);
            }
          : undefined,
      ),
    );
    const expanded = validateTree(result?.root, refs);
    if (countNodes(expanded) > limit || depth(expanded) > 3)
      throw new AppError(
        "Um ramo excedeu o limite de detalhes. Tente gerar novamente.",
      );
    if (!groundedLeaves(expanded))
      throw new AppError(
        "A IA retornou detalhes sem referências à fonte. Tente outro modelo.",
      );
    signal.throwIfAborted();
    root = replace(expanded);
    report(root, phase, i + 1, total);
  }
  if (!root.children.some((branch) => branch.children.length))
    throw new AppError(
      "A IA não detalhou os ramos do mapa aprofundado. Tente outro modelo.",
    );
  return root;
}
