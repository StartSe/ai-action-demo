import type { MindNode } from "./types";
import { partialJSON } from "./streaming";

/** Incomplete provider output is only a preview; never a persisted finished map. */
export function mapPreview(
  text: string,
  validRefs: Set<string>,
): MindNode | undefined {
  const parsed = partialJSON(text) as { root?: unknown } | null;
  let count = 0;
  function visit(
    raw: unknown,
    path: string,
    depth: number,
  ): MindNode | undefined {
    if (!raw || typeof raw !== "object" || depth > 7 || count >= 180) return;
    const node = raw as Record<string, unknown>;
    if (
      typeof node.label !== "string" ||
      !node.label.trim() ||
      node.label.length > 160
    )
      return;
    count++;
    return {
      id: path,
      label: node.label.trim(),
      note: typeof node.note === "string" ? node.note.slice(0, 2400) : "",
      refs: Array.isArray(node.refs)
        ? node.refs
            .filter(
              (r): r is string => typeof r === "string" && validRefs.has(r),
            )
            .slice(0, 8)
        : [],
      children: (Array.isArray(node.children) ? node.children : [])
        .map((c, i) => visit(c, `${path}-${i}`, depth + 1))
        .filter((n): n is MindNode => !!n),
    };
  }
  return visit(parsed?.root, "topic", 0);
}
export function stableNodeIds(node: MindNode, path = "topic"): MindNode {
  return {
    ...node,
    id: path,
    children: node.children.map((child, i) =>
      stableNodeIds(child, `${path}-${i}`),
    ),
  };
}
