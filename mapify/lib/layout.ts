import { colors, type MindNode } from "./types";
export const NODE_WIDTH = 224,
  NODE_HEIGHT = 76;
export type Positioned = {
  node: MindNode;
  x: number;
  y: number;
  color: string;
  side: "left" | "right";
  parent?: string;
  root: boolean;
  collapsed: boolean;
};
export function layoutTree(root: MindNode, collapsed: Set<string> = new Set()) {
  const nodes: Positioned[] = [];
  function height(node: MindNode): number {
    return collapsed.has(node.id) || !node.children.length
      ? 106
      : Math.max(
          106,
          node.children.reduce((h, c) => h + height(c), 0),
        );
  }
  function place(
    node: MindNode,
    x: number,
    y: number,
    color: string,
    side: "left" | "right",
    parent?: string,
  ) {
    nodes.push({
      node,
      x,
      y,
      color,
      side,
      parent,
      root: !parent,
      collapsed: collapsed.has(node.id),
    });
    if (collapsed.has(node.id)) return;
    const sum = node.children.reduce((h, c) => h + height(c), 0);
    let cursor = y + NODE_HEIGHT / 2 - sum / 2;
    for (const child of node.children) {
      const h = height(child);
      place(
        child,
        x + (side === "right" ? 310 : -310),
        cursor + h / 2 - NODE_HEIGHT / 2,
        color,
        side,
        node.id,
      );
      cursor += h;
    }
  }
  nodes.push({
    node: root,
    x: 0,
    y: 0,
    color: "#7954c9",
    side: "right",
    root: true,
    collapsed: collapsed.has(root.id),
  });
  if (!collapsed.has(root.id)) {
    for (const side of ["right", "left"] as const) {
      const group = root.children.filter(
        (_, i) => i % 2 === (side === "right" ? 0 : 1),
      );
      let cursor =
        NODE_HEIGHT / 2 - group.reduce((h, c) => h + height(c), 0) / 2;
      group.forEach((child, i) => {
        const h = height(child);
        place(
          child,
          side === "right" ? 330 : -330,
          cursor + h / 2 - NODE_HEIGHT / 2,
          colors[(i * 2 + (side === "left" ? 1 : 0)) % colors.length],
          side,
          root.id,
        );
        cursor += h;
      });
    }
  }
  return nodes;
}
export function markdown(root: MindNode, depth = 0): string {
  return `${depth ? "  ".repeat(depth - 1) + "- " : "# "}${root.label}\n${root.note ? `${"  ".repeat(depth)}${root.note}\n` : ""}${root.children.map((c) => markdown(c, depth + 1)).join("")}`;
}
function esc(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
}
export function svgMap(root: MindNode) {
  const nodes = layoutTree(root);
  const minX = Math.min(...nodes.map((n) => n.x)) - 50,
    minY = Math.min(...nodes.map((n) => n.y)) - 60;
  const width = Math.max(...nodes.map((n) => n.x)) + NODE_WIDTH - minX + 50,
    height = Math.max(...nodes.map((n) => n.y)) + NODE_HEIGHT - minY + 90;
  const edges = nodes
    .filter((n) => n.parent)
    .map((n) => {
      const p = nodes.find((p) => p.node.id === n.parent)!;
      const x1 = p.x + (n.side === "right" ? NODE_WIDTH : 0),
        x2 = n.x + (n.side === "right" ? 0 : NODE_WIDTH),
        y1 = p.y + NODE_HEIGHT / 2,
        y2 = n.y + NODE_HEIGHT / 2;
      return `<path d="M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}" fill="none" stroke="${n.color}" stroke-width="2"/>`;
    })
    .join("");
  const boxes = nodes
    .map((n) => {
      const lines: string[] = [];
      for (const word of n.node.label.split(/\s+/)) {
        if (!lines.length || lines.at(-1)!.length + word.length > 27)
          lines.push(word);
        else lines[lines.length - 1] += " " + word;
      }
      return `<g transform="translate(${n.x},${n.y})"><rect width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="13" fill="${n.root ? n.color : "#ffffff"}" stroke="${n.color}"/><text x="16" fill="${n.root ? "#fff" : "#292638"}" font-size="13" font-family="Arial,sans-serif">${lines
        .slice(0, 4)
        .map(
          (line, i) => `<tspan x="16" y="${23 + i * 15}">${esc(line)}</tspan>`,
        )
        .join("")}</text></g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}"><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#faf9fd"/>${edges}${boxes}<text x="${minX + 25}" y="${minY + height - 20}" fill="#777183" font-size="12" font-family="Arial,sans-serif">Mapia · ${esc(root.label)}</text></svg>`;
}
